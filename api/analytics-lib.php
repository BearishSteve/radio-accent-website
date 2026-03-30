<?php
declare(strict_types=1);

const RADIO_ACCENT_ANALYTICS_DEFAULT_DAYS = 7;
const RADIO_ACCENT_ANALYTICS_MAX_DAYS = 30;

function radioAccentAnalyticsFile(): string {
    return __DIR__ . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'analytics.json';
}

function radioAccentAnalyticsRateLimitFile(): string {
    return __DIR__ . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'analytics-rate-limit.json';
}

function radioAccentAnalyticsEnsureDirectory(string $dir): bool {
    return is_dir($dir) || mkdir($dir, 0775, true) || is_dir($dir);
}

function radioAccentAnalyticsTrimmed(string $value, int $maxLength): string {
    $trimmed = trim($value);
    if ($trimmed === '') {
        return '';
    }

    return function_exists('mb_substr')
        ? mb_substr($trimmed, 0, $maxLength, 'UTF-8')
        : substr($trimmed, 0, $maxLength);
}

function radioAccentAnalyticsRead(): array {
    $file = radioAccentAnalyticsFile();
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

function radioAccentAnalyticsMutate(callable $callback): bool {
    $file = radioAccentAnalyticsFile();
    $dir = dirname($file);
    if (!radioAccentAnalyticsEnsureDirectory($dir)) {
        return false;
    }

    $handle = fopen($file, 'c+');
    if ($handle === false) {
        return false;
    }

    try {
        if (!flock($handle, LOCK_EX)) {
            return false;
        }

        rewind($handle);
        $raw = stream_get_contents($handle);
        $decoded = json_decode($raw === false ? '' : $raw, true);
        $payload = is_array($decoded) ? $decoded : [];
        $nextPayload = $callback($payload);
        if (!is_array($nextPayload)) {
            return false;
        }

        $json = json_encode($nextPayload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($json === false) {
            return false;
        }

        rewind($handle);
        if (!ftruncate($handle, 0)) {
            return false;
        }
        if (fwrite($handle, $json) === false) {
            return false;
        }
        fflush($handle);
        return true;
    } finally {
        flock($handle, LOCK_UN);
        fclose($handle);
    }
}

function radioAccentAnalyticsWrite(array $payload): bool {
    $file = radioAccentAnalyticsFile();
    $dir = dirname($file);
    if (!radioAccentAnalyticsEnsureDirectory($dir)) {
        return false;
    }

    $json = json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false) {
        return false;
    }

    return file_put_contents($file, $json, LOCK_EX) !== false;
}

function radioAccentAnalyticsNormalizeDate(string $value): string {
    $trimmed = trim($value);
    if ($trimmed === '') {
        return gmdate('Y-m-d');
    }

    $parsed = strtotime($trimmed);
    if ($parsed === false) {
        return gmdate('Y-m-d');
    }

    return gmdate('Y-m-d', $parsed);
}

function radioAccentAnalyticsNormalizePath(string $value): string {
    $trimmed = trim($value);
    if ($trimmed === '') {
        return '/';
    }

    if ($trimmed[0] !== '/') {
        $trimmed = '/' . $trimmed;
    }

    return preg_replace('/\?.*$/', '', $trimmed) ?: '/';
}

function radioAccentAnalyticsRecordPageview(string $path, string $title, string $timestamp): bool {
    $date = radioAccentAnalyticsNormalizeDate($timestamp);
    $safePath = radioAccentAnalyticsNormalizePath($path);
    $safeTitle = radioAccentAnalyticsTrimmed($title, 160);

    return radioAccentAnalyticsMutate(static function (array $analytics) use ($date, $safePath, $safeTitle): array {
        if (!isset($analytics['pageviews'][$date][$safePath])) {
            $analytics['pageviews'][$date][$safePath] = [
                'count' => 0,
                'title' => $safeTitle
            ];
        }

        $analytics['pageviews'][$date][$safePath]['count'] = (int) ($analytics['pageviews'][$date][$safePath]['count'] ?? 0) + 1;
        if ($safeTitle !== '') {
            $analytics['pageviews'][$date][$safePath]['title'] = $safeTitle;
        }
        $analytics['updatedAt'] = gmdate('c');
        return $analytics;
    });
}

function radioAccentAnalyticsRecordEvent(string $name, string $label, array $meta, string $timestamp): bool {
    $eventName = trim($name);
    if ($eventName === '') {
        return false;
    }

    $date = radioAccentAnalyticsNormalizeDate($timestamp);
    $safeLabel = trim($label) !== '' ? radioAccentAnalyticsTrimmed($label, 160) : 'Onbekend';

    return radioAccentAnalyticsMutate(static function (array $analytics) use ($eventName, $date, $safeLabel, $meta): array {
        if (!isset($analytics['events'][$eventName][$date][$safeLabel])) {
            $analytics['events'][$eventName][$date][$safeLabel] = [
                'count' => 0,
                'meta' => []
            ];
        }

        $analytics['events'][$eventName][$date][$safeLabel]['count'] = (int) ($analytics['events'][$eventName][$date][$safeLabel]['count'] ?? 0) + 1;
        if ($meta) {
            $analytics['events'][$eventName][$date][$safeLabel]['meta'] = array_merge(
                is_array($analytics['events'][$eventName][$date][$safeLabel]['meta'] ?? null)
                    ? $analytics['events'][$eventName][$date][$safeLabel]['meta']
                    : [],
                $meta
            );
        }
        $analytics['updatedAt'] = gmdate('c');
        return $analytics;
    });
}

function radioAccentAnalyticsRequestedDates(int $days): array {
    $dates = [];
    $today = new DateTimeImmutable('today', new DateTimeZone('Europe/Brussels'));
    for ($index = 0; $index < $days; $index += 1) {
        $dates[] = $today->modify('-' . $index . ' days')->format('Y-m-d');
    }
    return $dates;
}

function radioAccentAnalyticsSummary(int $days = RADIO_ACCENT_ANALYTICS_DEFAULT_DAYS): array {
    $safeDays = max(1, min(RADIO_ACCENT_ANALYTICS_MAX_DAYS, $days));
    $dates = radioAccentAnalyticsRequestedDates($safeDays);
    $analytics = radioAccentAnalyticsRead();
    $pageviews = is_array($analytics['pageviews'] ?? null) ? $analytics['pageviews'] : [];
    $eventBuckets = is_array($analytics['events'] ?? null) ? $analytics['events'] : [];

    $topPages = [];
    $mixPlays = [];
    $daily = [];
    $totalPageviews = 0;
    $totalMixPlays = 0;

    foreach ($dates as $date) {
        $dailyPageviews = 0;
        $dailyMixPlays = 0;

        foreach ((array) ($pageviews[$date] ?? []) as $path => $item) {
            if (!is_array($item)) {
                continue;
            }

            $count = (int) ($item['count'] ?? 0);
            if ($count <= 0) {
                continue;
            }

            $dailyPageviews += $count;
            $totalPageviews += $count;

            if (!isset($topPages[$path])) {
                $topPages[$path] = [
                    'path' => $path,
                    'title' => trim((string) ($item['title'] ?? '')),
                    'count' => 0
                ];
            }
            $topPages[$path]['count'] += $count;
            if ($topPages[$path]['title'] === '' && trim((string) ($item['title'] ?? '')) !== '') {
                $topPages[$path]['title'] = trim((string) $item['title']);
            }
        }

        foreach ((array) ($eventBuckets['mix_play'][$date] ?? []) as $label => $item) {
            if (!is_array($item)) {
                continue;
            }

            $count = (int) ($item['count'] ?? 0);
            if ($count <= 0) {
                continue;
            }

            $dailyMixPlays += $count;
            $totalMixPlays += $count;

            if (!isset($mixPlays[$label])) {
                $mixPlays[$label] = [
                    'label' => $label,
                    'count' => 0,
                    'meta' => is_array($item['meta'] ?? null) ? $item['meta'] : []
                ];
            }
            $mixPlays[$label]['count'] += $count;
        }

        $daily[] = [
            'date' => $date,
            'pageviews' => $dailyPageviews,
            'mixPlays' => $dailyMixPlays
        ];
    }

    uasort($topPages, static function (array $left, array $right): int {
        if ($left['count'] === $right['count']) {
            return strcmp($left['path'], $right['path']);
        }
        return $right['count'] <=> $left['count'];
    });

    uasort($mixPlays, static function (array $left, array $right): int {
        if ($left['count'] === $right['count']) {
            return strcmp($left['label'], $right['label']);
        }
        return $right['count'] <=> $left['count'];
    });

    return [
        'days' => $safeDays,
        'updatedAt' => trim((string) ($analytics['updatedAt'] ?? '')),
        'totals' => [
            'pageviews' => $totalPageviews,
            'mixPlays' => $totalMixPlays
        ],
        'topPages' => array_values(array_slice($topPages, 0, 5)),
        'mixPlays' => array_values(array_slice($mixPlays, 0, 5)),
        'daily' => array_values($daily)
    ];
}
