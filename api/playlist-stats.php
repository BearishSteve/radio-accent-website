<?php
declare(strict_types=1);

require_once __DIR__ . DIRECTORY_SEPARATOR . 'history-kind-rules.php';
require_once __DIR__ . DIRECTORY_SEPARATOR . 'admin-auth.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

const RADIO_ACCENT_STATS_DEFAULT_DAYS = 7;
const RADIO_ACCENT_STATS_MAX_DAYS = 30;

function respond(int $status, array $payload): void {
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function statsNormalizeText(string $value): string {
    $trimmed = trim($value);
    return function_exists('mb_strtolower') ? mb_strtolower($trimmed, 'UTF-8') : strtolower($trimmed);
}

function statsDecodeValue($value): string {
    return trim(rawurldecode((string) ($value ?? '')));
}

function statsNormalizeTimestamp($value): string {
    $raw = statsDecodeValue($value);
    if ($raw === '') {
        return '';
    }

    if (ctype_digit($raw)) {
        return gmdate('c', (int) $raw);
    }

    $date = preg_match('/(?:Z|[+-]\d{2}:?\d{2})$/', $raw) === 1
        ? date_create($raw)
        : date_create($raw, new DateTimeZone('Europe/Brussels'));

    if (!$date) {
        return '';
    }

    $date->setTimezone(new DateTimeZone('UTC'));
    return $date->format('c');
}

function statsDetectKind(array $item): string {
    $artist = statsDecodeValue($item['artist'] ?? '');
    $title = statsDecodeValue($item['title'] ?? '');
    $kind = statsNormalizeText((string) ($item['kind'] ?? ''));
    if (in_array($kind, ['music', 'news', 'weather', 'traffic', 'promo'], true)) {
        return $kind;
    }

    static $rules = null;
    if ($rules === null) {
        $rules = radioAccentReadHistoryKindRules();
    }

    return radioAccentDetectHistoryKind($artist, $title, $rules);
}

function statsHistoryTimezone(): DateTimeZone {
    static $timezone = null;
    if ($timezone instanceof DateTimeZone) {
        return $timezone;
    }

    $timezone = new DateTimeZone('Europe/Brussels');
    return $timezone;
}

function statsRequestedDates(int $days): array {
    $dates = [];
    $today = new DateTimeImmutable('today', statsHistoryTimezone());
    for ($index = 0; $index < $days; $index += 1) {
        $dates[] = $today->modify('-' . $index . ' days')->format('Y-m-d');
    }

    return $dates;
}

function statsReadHistoryFile(string $file): array {
    if (!is_file($file)) {
        return [];
    }

    $raw = file_get_contents($file);
    if ($raw === false) {
        return [];
    }

    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

function emptyKindCounts(): array {
    return [
        'music' => 0,
        'news' => 0,
        'weather' => 0,
        'traffic' => 0,
        'promo' => 0
    ];
}

function summarizeStats(string $historyDir, int $days): array {
    $dates = statsRequestedDates($days);
    $recentKinds = emptyKindCounts();
    $todayKinds = emptyKindCounts();
    $recentTotal = 0;
    $todayTotal = 0;
    $fileCount = 0;
    $topArtists = [];

    foreach ($dates as $date) {
        $items = statsReadHistoryFile($historyDir . DIRECTORY_SEPARATOR . $date . '.json');
        if (!$items) {
            continue;
        }

        $fileCount += 1;
        foreach ($items as $item) {
            if (!is_array($item)) {
                continue;
            }

            $artist = statsDecodeValue($item['artist'] ?? '');
            $title = statsDecodeValue($item['title'] ?? '');
            if ($artist === '' && $title === '') {
                continue;
            }

            $kind = statsDetectKind($item);
            $recentTotal += 1;
            if (isset($recentKinds[$kind])) {
                $recentKinds[$kind] += 1;
            }

            if ($date === $dates[0]) {
                $todayTotal += 1;
                if (isset($todayKinds[$kind])) {
                    $todayKinds[$kind] += 1;
                }
            }

            if ($kind === 'music' && $artist !== '') {
                if (!isset($topArtists[$artist])) {
                    $topArtists[$artist] = [
                        'artist' => $artist,
                        'plays' => 0,
                        'title' => $title
                    ];
                }
                $topArtists[$artist]['plays'] += 1;
                if ($topArtists[$artist]['title'] === '' && $title !== '') {
                    $topArtists[$artist]['title'] = $title;
                }
            }
        }
    }

    uasort($topArtists, static function (array $left, array $right): int {
        if ($left['plays'] === $right['plays']) {
            return strcmp($left['artist'], $right['artist']);
        }
        return $right['plays'] <=> $left['plays'];
    });

    return [
        'today' => [
            'total' => $todayTotal,
            'kinds' => $todayKinds
        ],
        'recent' => [
            'days' => $days,
            'total' => $recentTotal,
            'kinds' => $recentKinds
        ],
        'archive' => [
            'fileCount' => $fileCount,
            'latestDate' => $dates[0],
            'historyDirExists' => is_dir($historyDir)
        ],
        'topArtists' => array_values(array_slice($topArtists, 0, 5))
    ];
}

$days = max(1, min(RADIO_ACCENT_STATS_MAX_DAYS, (int) ($_GET['days'] ?? RADIO_ACCENT_STATS_DEFAULT_DAYS)));
$historyDir = __DIR__ . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'history';

if (!radioAccentAdminIsAuthenticated()) {
    respond(401, [
        'ok' => false,
        'error' => 'Admin sessie verlopen. Log opnieuw in.'
    ]);
}

respond(200, [
    'ok' => true,
    'data' => summarizeStats($historyDir, $days)
]);
