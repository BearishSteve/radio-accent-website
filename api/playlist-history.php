<?php
declare(strict_types=1);

require_once __DIR__ . DIRECTORY_SEPARATOR . 'history-kind-rules.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

const RADIO_ACCENT_PLAYLIST_DEFAULT_DAYS = 7;
const RADIO_ACCENT_PLAYLIST_MAX_DAYS = 30;
const RADIO_ACCENT_PLAYLIST_DEFAULT_LIMIT = 200;
const RADIO_ACCENT_PLAYLIST_MAX_LIMIT = 500;

function respond(int $status, array $payload): void {
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function decodeInputValue($value): string {
    return trim(rawurldecode((string) ($value ?? '')));
}

function normalizeTimestamp($value): string {
    $raw = decodeInputValue($value);
    if ($raw === '') {
        return '';
    }

    if (ctype_digit($raw)) {
        return gmdate('c', (int) $raw);
    }

    $hasExplicitTimezone = preg_match('/(?:Z|[+-]\d{2}:?\d{2})$/', $raw) === 1;
    $date = $hasExplicitTimezone
        ? date_create($raw)
        : date_create($raw, new DateTimeZone('Europe/Brussels'));

    if (!$date) {
        return $raw;
    }

    $date->setTimezone(new DateTimeZone('UTC'));
    return $date->format('c');
}

function normalizeCover($value): string {
    return decodeInputValue($value);
}

function normalizeText(string $value): string {
    $trimmed = trim($value);
    return function_exists('mb_strtolower') ? mb_strtolower($trimmed, 'UTF-8') : strtolower($trimmed);
}

function detectHistoryKind(string $artist, string $title, string $kind = ''): string {
    $normalizedKind = normalizeText($kind);
    if (in_array($normalizedKind, ['music', 'news', 'weather', 'traffic', 'promo'], true)) {
        return $normalizedKind;
    }

    static $rules = null;
    if ($rules === null) {
        $rules = radioAccentReadHistoryKindRules();
    }

    return radioAccentDetectHistoryKind($artist, $title, $rules);
}

function normalizeHistoryItem(array $track): ?array {
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
        'startedAt' => normalizeTimestamp($track['startedAt'] ?? ''),
        'updatedAt' => normalizeTimestamp($track['updatedAt'] ?? ''),
        'kind' => detectHistoryKind($artist, $title, (string) ($track['kind'] ?? ''))
    ];
}

function readHistoryFile(string $file): array {
    if (!is_file($file)) {
        return [];
    }

    $raw = file_get_contents($file);
    if ($raw === false) {
        return [];
    }

    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        return [];
    }

    $items = [];
    foreach ($decoded as $item) {
        if (!is_array($item)) {
            continue;
        }
        $normalized = normalizeHistoryItem($item);
        if ($normalized) {
            $items[] = $normalized;
        }
    }

    $previousStamp = null;
    $outOfOrder = false;
    foreach ($items as $item) {
        $stamp = strtotime((string) ($item['startedAt'] ?: $item['updatedAt'] ?: '')) ?: 0;
        if ($previousStamp !== null && $stamp < $previousStamp) {
            $outOfOrder = true;
            break;
        }
        $previousStamp = $stamp;
    }

    if ($outOfOrder) {
        usort($items, static function (array $left, array $right): int {
            $leftStamp = strtotime((string) ($left['startedAt'] ?: $left['updatedAt'] ?: '')) ?: 0;
            $rightStamp = strtotime((string) ($right['startedAt'] ?: $right['updatedAt'] ?: '')) ?: 0;
            return $leftStamp <=> $rightStamp;
        });
    }

    return $items;
}

function historyArchiveTimezone(): DateTimeZone {
    static $timezone = null;
    if ($timezone instanceof DateTimeZone) {
        return $timezone;
    }

    $timezone = new DateTimeZone('Europe/Brussels');
    return $timezone;
}

function getRequestedDates(int $days): array {
    $dates = [];
    $today = new DateTimeImmutable('today', historyArchiveTimezone());
    for ($index = 0; $index < $days; $index += 1) {
        $dates[] = $today->modify('-' . $index . ' days')->format('Y-m-d');
    }
    return $dates;
}

function matchesFilters(array $item, string $query, string $kind): bool {
    if ($kind !== '' && ($item['kind'] ?? '') !== $kind) {
        return false;
    }

    if ($query === '') {
        return true;
    }

    $haystack = normalizeText(
        trim((string) ($item['artist'] ?? '')) . ' ' . trim((string) ($item['title'] ?? ''))
    );

    return $haystack !== '' && str_contains($haystack, $query);
}

$historyDir = __DIR__ . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'history';
$days = max(1, min(RADIO_ACCENT_PLAYLIST_MAX_DAYS, (int) ($_GET['days'] ?? RADIO_ACCENT_PLAYLIST_DEFAULT_DAYS)));
$limit = max(1, min(RADIO_ACCENT_PLAYLIST_MAX_LIMIT, (int) ($_GET['limit'] ?? RADIO_ACCENT_PLAYLIST_DEFAULT_LIMIT)));
$offset = max(0, (int) ($_GET['offset'] ?? 0));
$query = normalizeText(decodeInputValue($_GET['q'] ?? ''));
$kind = normalizeText(decodeInputValue($_GET['kind'] ?? ''));

$allowedKinds = radioAccentAllowedHistoryKinds();
if (!in_array($kind, $allowedKinds, true)) {
    $kind = '';
}

$total = 0;
$slice = [];
$remainingOffset = $offset;

// Archive files are appended in play order, so reversing each day while walking
// from today to older dates preserves newest-first order without sorting all rows.
foreach (getRequestedDates($days) as $date) {
    $items = array_reverse(readHistoryFile($historyDir . DIRECTORY_SEPARATOR . $date . '.json'));
    foreach ($items as $item) {
        if (!matchesFilters($item, $query, $kind)) {
            continue;
        }

        $total += 1;
        if ($remainingOffset > 0) {
            $remainingOffset -= 1;
            continue;
        }

        if (count($slice) < $limit) {
            $slice[] = $item;
        }
    }
}

respond(200, [
    'ok' => true,
    'data' => [
        'items' => $slice,
        'total' => $total,
        'offset' => $offset,
        'limit' => $limit,
        'days' => $days,
        'kind' => $kind,
        'query' => $query,
        'hasMore' => ($offset + $limit) < $total
    ]
]);
