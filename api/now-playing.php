<?php
declare(strict_types=1);

require_once __DIR__ . DIRECTORY_SEPARATOR . 'config-loader.php';
require_once __DIR__ . DIRECTORY_SEPARATOR . 'dab-assets.php';
require_once __DIR__ . DIRECTORY_SEPARATOR . 'history-kind-rules.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

const RADIO_ACCENT_HISTORY_LIMIT = 60;
const RADIO_ACCENT_HISTORY_ARCHIVE_KEEP_DAYS = 35;

function respond(int $status, array $payload): void {
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function defaultNowPlayingState(): array {
    return [
        'track' => [
            'id' => '',
            'artist' => '',
            'title' => '',
            'cover' => '',
            'duration' => 0,
            'startedAt' => '',
            'endsAt' => '',
            'updatedAt' => ''
        ],
        'history' => []
    ];
}

function decodeInputValue($value): string {
    return trim(rawurldecode((string) ($value ?? '')));
}

function normalizeTimestamp($value, bool $fallbackToNow = false): string {
    $raw = decodeInputValue($value);
    if ($raw === '') {
        return $fallbackToNow ? gmdate('c') : '';
    }

    if (ctype_digit($raw)) {
        return gmdate('c', (int) $raw);
    }

    $hasExplicitTimezone = preg_match('/(?:Z|[+-]\d{2}:?\d{2})$/', $raw) === 1;

    if (!$hasExplicitTimezone) {
        $timezone = new DateTimeZone('Europe/Brussels');
        $date = date_create($raw, $timezone);
    } else {
        $date = date_create($raw);
    }

    if (!$date) {
        return $fallbackToNow ? gmdate('c') : $raw;
    }

    $date->setTimezone(new DateTimeZone('UTC'));
    return $date->format('c');
}

function normalizeCover($value): string {
    return decodeInputValue($value);
}

function normalizeTrack(array $input, array $fallback = []): array {
    $hasArtistField = array_key_exists('artist', $input);
    $hasTitleField = array_key_exists('title', $input);

    $artist = $hasArtistField
        ? decodeInputValue($input['artist'])
        : decodeInputValue($fallback['artist'] ?? '');
    $title = $hasTitleField
        ? decodeInputValue($input['title'])
        : decodeInputValue($fallback['title'] ?? '');
    $cover = normalizeCover($input['cover'] ?? $input['image'] ?? $fallback['cover'] ?? $fallback['image'] ?? '');
    $durationValue = $input['duration'] ?? $fallback['duration'] ?? 0;
    $duration = is_numeric($durationValue) ? max(0, (int) round((float) $durationValue)) : 0;
    $startedAt = normalizeTimestamp($input['startedAt'] ?? $fallback['startedAt'] ?? '', false);
    $updatedAt = normalizeTimestamp($input['updatedAt'] ?? $startedAt ?? $fallback['updatedAt'] ?? '', true);
    $endsAt = array_key_exists('endsAt', $input)
        ? normalizeTimestamp($input['endsAt'], false)
        : '';

    if ($startedAt !== '' && $duration > 0) {
        $startedTimestamp = strtotime($startedAt);
        if ($startedTimestamp !== false) {
            $endsAt = gmdate('c', $startedTimestamp + $duration);
        }
    } elseif ($endsAt === '' && array_key_exists('endsAt', $fallback)) {
        $endsAt = normalizeTimestamp($fallback['endsAt'], false);
    }

    $id = '';
    if ($artist !== '' || $title !== '' || $startedAt !== '' || $updatedAt !== '') {
        $id = sha1(strtolower($artist . '|' . $title . '|' . $startedAt . '|' . $updatedAt));
    }

    return [
        'id' => $id,
        'artist' => $artist,
        'title' => $title,
        'cover' => $cover,
        'duration' => $duration,
        'startedAt' => $startedAt,
        'endsAt' => $endsAt,
        'updatedAt' => $updatedAt
    ];
}

function trackToHistoryItem(array $track): ?array {
    $artist = decodeInputValue($track['artist'] ?? '');
    $title = decodeInputValue($track['title'] ?? '');
    if ($artist === '' && $title === '') {
        return null;
    }

    return [
        'id' => trim((string) ($track['id'] ?? '')),
        'artist' => $artist,
        'title' => $title,
        'cover' => normalizeCover($track['cover'] ?? $track['image'] ?? ''),
        'duration' => is_numeric($track['duration'] ?? null) ? max(0, (int) round((float) $track['duration'])) : 0,
        'startedAt' => normalizeTimestamp($track['startedAt'] ?? '', false),
        'updatedAt' => normalizeTimestamp($track['updatedAt'] ?? '', false),
        'kind' => radioAccentDetectHistoryKind($artist, $title, radioAccentReadHistoryKindRules())
    ];
}

function normalizeHistory(array $items): array {
    $history = [];
    foreach ($items as $item) {
        if (!is_array($item)) {
            continue;
        }
        $normalized = trackToHistoryItem($item);
        if ($normalized) {
            $history[] = $normalized;
        }
        if (count($history) >= RADIO_ACCENT_HISTORY_LIMIT) {
            break;
        }
    }
    return $history;
}

function sameTrack(array $a, array $b): bool {
    $idA = trim((string) ($a['id'] ?? ''));
    $idB = trim((string) ($b['id'] ?? ''));
    if ($idA !== '' && $idB !== '') {
        return hash_equals($idA, $idB);
    }

    return trim((string) ($a['artist'] ?? '')) === trim((string) ($b['artist'] ?? ''))
        && trim((string) ($a['title'] ?? '')) === trim((string) ($b['title'] ?? ''))
        && trim((string) ($a['startedAt'] ?? '')) === trim((string) ($b['startedAt'] ?? ''));
}

function readState(string $dataFile): array {
    $defaults = defaultNowPlayingState();
    if (!is_file($dataFile)) {
        return $defaults;
    }

    $raw = file_get_contents($dataFile);
    if ($raw === false) {
        return $defaults;
    }

    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        return $defaults;
    }

    $track = is_array($decoded['track'] ?? null) ? normalizeTrack($decoded['track']) : $defaults['track'];
    $history = normalizeHistory(is_array($decoded['history'] ?? null) ? $decoded['history'] : []);

    return [
        'track' => $track,
        'history' => $history
    ];
}

function writeState(string $dataFile, array $state): bool {
    $dir = dirname($dataFile);
    if (!ensureDirectory($dir)) {
        return false;
    }

    $json = json_encode($state, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false) {
        return false;
    }

    return file_put_contents($dataFile, $json, LOCK_EX) !== false;
}

function ensureDirectory(string $dir): bool {
    if (is_dir($dir)) {
        return true;
    }

    return mkdir($dir, 0775, true) || is_dir($dir);
}

function readJsonFile(string $file, $fallback) {
    if (!is_file($file)) {
        return $fallback;
    }

    $raw = file_get_contents($file);
    if ($raw === false) {
        return $fallback;
    }

    $decoded = json_decode($raw, true);
    return json_last_error() === JSON_ERROR_NONE ? $decoded : $fallback;
}

function historyArchiveTimezone(): DateTimeZone {
    static $timezone = null;
    if ($timezone instanceof DateTimeZone) {
        return $timezone;
    }

    $timezone = new DateTimeZone('Europe/Brussels');
    return $timezone;
}

function historyArchiveFile(string $historyDir, array $item): string {
    $stamp = trim((string) ($item['startedAt'] ?? $item['updatedAt'] ?? ''));
    $timestamp = $stamp !== '' ? strtotime($stamp) : false;
    if ($timestamp === false) {
        $timestamp = time();
    }

    $date = (new DateTimeImmutable('@' . $timestamp))
        ->setTimezone(historyArchiveTimezone())
        ->format('Y-m-d');

    return $historyDir . DIRECTORY_SEPARATOR . $date . '.json';
}

function appendArchivedHistoryItem(string $historyDir, array $item): void {
    if (!ensureDirectory($historyDir)) {
        return;
    }

    $normalized = trackToHistoryItem($item);
    if (!$normalized) {
        return;
    }

    $file = historyArchiveFile($historyDir, $normalized);
    $items = readJsonFile($file, []);
    if (!is_array($items)) {
        $items = [];
    }

    $normalizedItems = [];
    foreach ($items as $storedItem) {
        if (!is_array($storedItem)) {
            continue;
        }
        $normalizedStoredItem = trackToHistoryItem($storedItem);
        if ($normalizedStoredItem) {
            $normalizedItems[] = $normalizedStoredItem;
        }
    }
    $lastIndex = count($normalizedItems) - 1;

    if ($lastIndex >= 0 && sameTrack($normalizedItems[$lastIndex], $normalized)) {
        $normalizedItems[$lastIndex] = $normalized;
    } else {
        $normalizedItems[] = $normalized;
    }

    $json = json_encode($normalizedItems, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false) {
        return;
    }

    file_put_contents($file, $json, LOCK_EX);
}

function pruneArchivedHistory(string $historyDir, int $keepDays = RADIO_ACCENT_HISTORY_ARCHIVE_KEEP_DAYS): void {
    if (!is_dir($historyDir)) {
        return;
    }

    $cutoff = (new DateTimeImmutable('today', historyArchiveTimezone()))
        ->modify('-' . max(1, $keepDays) . ' days')
        ->format('Y-m-d');

    foreach (glob($historyDir . DIRECTORY_SEPARATOR . '*.json') ?: [] as $file) {
        $basename = pathinfo($file, PATHINFO_FILENAME);
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $basename)) {
            continue;
        }
        if ($basename < $cutoff) {
            @unlink($file);
        }
    }
}

function readJsonBody(): array {
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return [];
    }

    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

$runtimeConfig = radioAccentLoadConfig();
$dataFile = __DIR__ . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'now-playing.json';
$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');

if ($method === 'GET') {
    respond(200, ['ok' => true, 'data' => readState($dataFile)]);
}

if ($method !== 'POST') {
    respond(405, ['ok' => false, 'error' => 'Method not allowed']);
}

$secret = $runtimeConfig['nowPlayingSecret'];
if ($secret === '') {
    respond(503, ['ok' => false, 'error' => 'Now playing secret is not configured']);
}

$payload = readJsonBody();
$providedSecret = trim((string) ($_SERVER['HTTP_X_RADIO_ACCENT_SECRET'] ?? $payload['secret'] ?? ''));
if ($providedSecret === '' || !hash_equals($secret, $providedSecret)) {
    respond(401, ['ok' => false, 'error' => 'Invalid secret']);
}

$currentState = readState($dataFile);
$incomingTrack = is_array($payload['track'] ?? null) ? $payload['track'] : $payload;
$track = normalizeTrack($incomingTrack, $currentState['track']);

if ($track['artist'] === '' && $track['title'] === '') {
    respond(400, ['ok' => false, 'error' => 'Missing track artist/title']);
}

$incomingHistory = normalizeHistory(is_array($payload['history'] ?? null) ? $payload['history'] : []);
$currentHistoryItem = trackToHistoryItem($track);
$history = [];

if ($currentHistoryItem) {
    $history[] = $currentHistoryItem;
}

foreach ($incomingHistory as $item) {
    if ($currentHistoryItem && sameTrack($currentHistoryItem, $item)) {
        continue;
    }
    $history[] = $item;
}

foreach ($currentState['history'] as $item) {
    if ($currentHistoryItem && sameTrack($currentHistoryItem, $item)) {
        continue;
    }
    $exists = false;
    foreach ($history as $existingItem) {
        if (sameTrack($existingItem, $item)) {
            $exists = true;
            break;
        }
    }
    if ($exists) {
        continue;
    }
    $history[] = $item;
    if (count($history) >= RADIO_ACCENT_HISTORY_LIMIT) {
        break;
    }
}

$state = [
    'track' => $track,
    'history' => array_slice($history, 0, RADIO_ACCENT_HISTORY_LIMIT)
];

if (!writeState($dataFile, $state)) {
    respond(500, ['ok' => false, 'error' => 'Failed to write now playing data']);
}

$historyDir = __DIR__ . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'history';
$archiveItems = array_reverse($incomingHistory);
if ($currentHistoryItem) {
    $archiveItems[] = $currentHistoryItem;
}

foreach ($archiveItems as $archiveItem) {
    appendArchivedHistoryItem($historyDir, $archiveItem);
}
pruneArchivedHistory($historyDir);

try {
    radioAccentGenerateDabAssets($state, dirname(__DIR__), [
        'metadataDir' => radioAccentDefaultMetadataDir(dirname(__DIR__)),
        'metadataPublicPath' => '',
        'artistFont' => trim((string) ($runtimeConfig['dabArtistFont'] ?? '')),
        'titleFont' => trim((string) ($runtimeConfig['dabTitleFont'] ?? '')),
        'badgeFont' => trim((string) ($runtimeConfig['dabBadgeFont'] ?? ''))
    ]);
} catch (Throwable $exception) {
    // A failed slide render should never block now-playing updates.
}

respond(200, ['ok' => true, 'data' => $state]);
