<?php
declare(strict_types=1);

require_once __DIR__ . DIRECTORY_SEPARATOR . 'config-loader.php';
require_once __DIR__ . DIRECTORY_SEPARATOR . 'admin-auth.php';
require_once __DIR__ . DIRECTORY_SEPARATOR . 'dab-assets.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

function respond(int $status, array $payload): void {
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function healthReadJsonFile(string $file): ?array {
    if (!is_file($file)) {
        return null;
    }

    $raw = file_get_contents($file);
    if ($raw === false) {
        return null;
    }

    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : null;
}

function historyItemKey(array $item): string {
    $id = trim((string) ($item['id'] ?? ''));
    if ($id !== '') {
        return $id;
    }

    return trim((string) ($item['artist'] ?? ''))
        . '|' . trim((string) ($item['title'] ?? ''))
        . '|' . trim((string) ($item['startedAt'] ?? $item['updatedAt'] ?? ''));
}

function historyItemStamp(array $item): int {
    $stamp = trim((string) ($item['startedAt'] ?? $item['updatedAt'] ?? ''));
    $parsed = $stamp !== '' ? strtotime($stamp) : false;
    return $parsed === false ? 0 : $parsed;
}

function summarizeHistoryArchive(string $historyDir): array {
    if (!is_dir($historyDir)) {
        return [
            'status' => 'warning',
            'summary' => 'History map ontbreekt.',
            'detail' => '',
            'fileCount' => 0
        ];
    }

    $files = glob($historyDir . DIRECTORY_SEPARATOR . '*.json') ?: [];
    sort($files, SORT_STRING);

    $fileCount = 0;
    $totalItems = 0;
    $outOfOrderFiles = 0;
    $duplicateItems = 0;
    $invalidFiles = 0;

    foreach ($files as $file) {
        $decoded = healthReadJsonFile($file);
        if ($decoded === null) {
            $invalidFiles += 1;
            continue;
        }

        $fileCount += 1;
        $seen = [];
        $previousStamp = null;
        foreach ($decoded as $item) {
            if (!is_array($item)) {
                continue;
            }
            $totalItems += 1;
            $key = historyItemKey($item);
            if ($key !== '' && isset($seen[$key])) {
                $duplicateItems += 1;
            }
            $seen[$key] = true;

            $stamp = historyItemStamp($item);
            if ($previousStamp !== null && $stamp < $previousStamp) {
                $outOfOrderFiles += 1;
                break;
            }
            $previousStamp = $stamp;
        }
    }

    $status = 'ok';
    if ($invalidFiles > 0 || $duplicateItems > 0) {
        $status = 'warning';
    }
    if ($fileCount === 0) {
        $status = 'warning';
    }

    $latestFile = $fileCount > 0 ? basename((string) end($files)) : '';
    $summary = $fileCount > 0
        ? sprintf('%d dagbestand(en), %d history items.', $fileCount, $totalItems)
        : 'Nog geen history-bestanden gevonden.';
    $detailParts = [];
    if ($latestFile !== '') {
        $detailParts[] = 'Laatste dag: ' . $latestFile;
    }
    if ($outOfOrderFiles > 0) {
        $detailParts[] = $outOfOrderFiles . ' bestand(en) moesten defensief gesorteerd worden';
    }
    if ($duplicateItems > 0) {
        $detailParts[] = $duplicateItems . ' duplicaten gedetecteerd';
    }
    if ($invalidFiles > 0) {
        $detailParts[] = $invalidFiles . ' ongeldig(e) JSON-bestand(en)';
    }

    return [
        'status' => $status,
        'summary' => $summary,
        'detail' => implode(' | ', $detailParts),
        'fileCount' => $fileCount
    ];
}

function buildCheck(string $key, string $label, string $status, string $summary, string $detail = ''): array {
    return [
        'key' => $key,
        'label' => $label,
        'status' => $status,
        'summary' => $summary,
        'detail' => $detail
    ];
}

$runtimeConfig = radioAccentLoadConfig();
if (!radioAccentAdminIsAuthenticated()) {
    respond(401, [
        'ok' => false,
        'error' => 'Admin sessie verlopen. Log opnieuw in.'
    ]);
}

$projectRoot = dirname(__DIR__);
$dataDir = __DIR__ . DIRECTORY_SEPARATOR . 'data';
$historyDir = $dataDir . DIRECTORY_SEPARATOR . 'history';
$contentFile = $dataDir . DIRECTORY_SEPARATOR . 'content.json';
$nowPlayingFile = $dataDir . DIRECTORY_SEPARATOR . 'now-playing.json';
$dabNowPlayingFile = $dataDir . DIRECTORY_SEPARATOR . 'dab-nowplaying.json';
$metadataDir = radioAccentDefaultMetadataDir($projectRoot);

$checks = [];

$content = healthReadJsonFile($contentFile) ?? [];
$historyKinds = is_array($content['historyKinds'] ?? null) ? count($content['historyKinds']) : 0;
$checks[] = buildCheck(
    'content',
    'CMS content',
    $content ? 'ok' : 'warning',
    $content ? 'content.json geladen.' : 'content.json ontbreekt of is ongeldig.',
    $content ? $historyKinds . ' history rules, ' . count((array) ($content['keywordCovers'] ?? [])) . ' keyword covers.' : ''
);

$nowPlaying = healthReadJsonFile($nowPlayingFile) ?? [];
$track = is_array($nowPlaying['track'] ?? null) ? $nowPlaying['track'] : [];
$history = is_array($nowPlaying['history'] ?? null) ? $nowPlaying['history'] : [];
$checks[] = buildCheck(
    'nowPlaying',
    'Now playing state',
    ($track || $history) ? 'ok' : 'warning',
    ($track || $history) ? 'now-playing.json is leesbaar.' : 'now-playing.json ontbreekt of bevat geen state.',
    ($track ? 'Track: ' . trim((string) ($track['artist'] ?? '')) . ' - ' . trim((string) ($track['title'] ?? '')) : '')
    . (($track && $history) ? ' | ' : '')
    . ($history ? count($history) . ' recente history-items.' : '')
);

$archiveSummary = summarizeHistoryArchive($historyDir);
$checks[] = buildCheck(
    'historyArchive',
    'History archief',
    $archiveSummary['status'],
    $archiveSummary['summary'],
    $archiveSummary['detail']
);

$checks[] = buildCheck(
    'historyDir',
    'History schrijfrechten',
    is_dir($historyDir) && is_writable($historyDir) ? 'ok' : 'warning',
    is_dir($historyDir) ? (is_writable($historyDir) ? 'History map is schrijfbaar.' : 'History map bestaat, maar is niet schrijfbaar.') : 'History map ontbreekt.',
    ''
);

$checks[] = buildCheck(
    'metadataDir',
    'Metadata schrijfrechten',
    is_dir($metadataDir) && is_writable($metadataDir) ? 'ok' : 'warning',
    is_dir($metadataDir) ? (is_writable($metadataDir) ? 'Metadata map is schrijfbaar.' : 'Metadata map bestaat, maar is niet schrijfbaar.') : 'Metadata map ontbreekt.',
    ''
);

$dabState = healthReadJsonFile($dabNowPlayingFile) ?? [];
$coverFile = basename(trim((string) ($dabState['cover'] ?? '')));
$coverExists = $coverFile !== '' && is_file($metadataDir . DIRECTORY_SEPARATOR . $coverFile);
$checks[] = buildCheck(
    'dabCover',
    'DAB cover output',
    $coverFile === '' ? 'warning' : ($coverExists ? 'ok' : 'warning'),
    $coverFile === ''
        ? 'Geen recente DAB-cover in dab-nowplaying.json.'
        : ($coverExists ? 'Laatste DAB-cover staat lokaal klaar.' : 'Laatste DAB-cover ontbreekt in de metadata map.'),
    $coverFile !== '' ? 'Bestand: ' . $coverFile : ''
);

$hasWeatherConfig = trim((string) ($runtimeConfig['weatherApiKey'] ?? '')) !== '' && trim((string) ($runtimeConfig['weatherLocation'] ?? '')) !== '';
$checks[] = buildCheck(
    'weatherConfig',
    'Weerconfiguratie',
    $hasWeatherConfig ? 'ok' : 'warning',
    $hasWeatherConfig ? 'Weather API key en locatie zijn ingesteld.' : 'Weather service mist een API key of locatie.',
    $hasWeatherConfig ? '' : 'De endpoint kan wel een nette fallback teruggeven, maar geen live weer ophalen.'
);

$overallStatus = 'ok';
foreach ($checks as $check) {
    if (($check['status'] ?? '') === 'error') {
        $overallStatus = 'error';
        break;
    }
    if (($check['status'] ?? '') === 'warning') {
        $overallStatus = 'warning';
    }
}

respond(200, [
    'ok' => true,
    'data' => [
        'checkedAt' => gmdate('c'),
        'status' => $overallStatus,
        'checks' => $checks
    ]
]);
