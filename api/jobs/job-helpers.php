<?php
declare(strict_types=1);

function radioAccentJobRootPath(): string {
    return dirname(__DIR__, 2);
}

function radioAccentJobDataPath(string $file): string {
    return dirname(__DIR__) . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . $file;
}

function radioAccentJobReadJson(string $path, array $fallback = []): array {
    if (!is_file($path)) {
        return $fallback;
    }

    $raw = file_get_contents($path);
    if ($raw === false) {
        return $fallback;
    }

    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : $fallback;
}

function radioAccentJobWriteJson(string $path, array $payload): bool {
    $dir = dirname($path);
    if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) {
        return false;
    }

    $json = json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false) {
        return false;
    }

    return file_put_contents($path, $json . PHP_EOL, LOCK_EX) !== false;
}

function radioAccentJobRespond(array $payload, int $status = 200): void {
    if (!headers_sent()) {
        header('Content-Type: application/json; charset=utf-8');
        http_response_code($status);
    }

    echo json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function radioAccentJobLoadContent(): array {
    return radioAccentJobReadJson(radioAccentJobDataPath('content.json'), [
        'schedule' => [],
        'mixes' => [],
        'news' => []
    ]);
}

function radioAccentJobLoadMixes(): array {
    $content = radioAccentJobLoadContent();
    $feed = radioAccentJobReadJson(
        radioAccentJobRootPath() . DIRECTORY_SEPARATOR . 'assets' . DIRECTORY_SEPARATOR . 'mixen' . DIRECTORY_SEPARATOR . 'mixes.json',
        []
    );

    $mixes = [];
    if (is_array($feed['mixes'] ?? null)) {
        $mixes = $feed['mixes'];
    } elseif (is_array($feed)) {
        $mixes = $feed;
    }

    if (!$mixes && is_array($content['mixes'] ?? null)) {
        $mixes = $content['mixes'];
    }

    return array_values(array_filter(array_map(static function ($item): ?array {
        if (!is_array($item)) {
            return null;
        }

        $title = trim((string) ($item['title'] ?? $item['show_name'] ?? ''));
        $dj = trim((string) ($item['dj'] ?? $item['artist'] ?? ''));
        $schedule = trim((string) ($item['schedule'] ?? ''));
        $description = trim((string) ($item['description'] ?? ''));
        $streamUrl = trim((string) ($item['streamUrl'] ?? $item['audio_url'] ?? ''));
        $cover = trim((string) ($item['cover'] ?? $item['cover_url'] ?? ''));
        $updatedAt = trim((string) ($item['updatedAt'] ?? $item['updated_at'] ?? ''));
        $slug = trim((string) ($item['slug'] ?? ''));

        if ($title === '' || $streamUrl === '') {
            return null;
        }

        return [
            'title' => $title,
            'dj' => $dj,
            'schedule' => $schedule,
            'description' => $description,
            'streamUrl' => $streamUrl,
            'cover' => $cover,
            'updatedAt' => $updatedAt,
            'slug' => $slug
        ];
    }, $mixes)));
}

function radioAccentJobLoadNowPlaying(): array {
    return radioAccentJobReadJson(radioAccentJobDataPath('now-playing.json'), []);
}

function radioAccentJobLoadRegionNews(): array {
    return radioAccentJobReadJson(radioAccentJobDataPath('region_news.json'), [
        'generatedAt' => gmdate('c'),
        'title' => 'Uit de regio',
        'items' => []
    ]);
}

function radioAccentJobLoadWeekendTips(): array {
    return radioAccentJobReadJson(radioAccentJobDataPath('weekend_tips.json'), [
        'generatedAt' => gmdate('c'),
        'title' => 'Weekendtips',
        'items' => []
    ]);
}

function radioAccentJobParseScheduleRange(string $value): ?array {
    if (!preg_match('/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/', trim($value), $matches)) {
        return null;
    }

    $start = ((int) $matches[1] * 60) + (int) $matches[2];
    $end = ((int) $matches[3] * 60) + (int) $matches[4];
    if ($end <= $start) {
        $end += 24 * 60;
    }

    return ['start' => $start, 'end' => $end];
}

function radioAccentJobScheduleSnapshot(array $items, ?DateTimeImmutable $now = null): array {
    $currentTime = $now ?? new DateTimeImmutable('now');
    $minutesNow = ((int) $currentTime->format('G') * 60) + (int) $currentTime->format('i');
    $normalized = [];

    foreach ($items as $index => $item) {
        if (!is_array($item)) {
            continue;
        }

        $range = radioAccentJobParseScheduleRange((string) ($item['time'] ?? ''));
        if (!$range) {
            continue;
        }

        $normalized[] = [
            'item' => $item,
            'index' => $index,
            'range' => $range
        ];
    }

    if (!$normalized) {
        return ['current' => null, 'next' => null, 'currentIndex' => -1, 'nextIndex' => -1];
    }

    foreach ($normalized as $position => $entry) {
        $clock = $minutesNow < $entry['range']['start'] ? $minutesNow + (24 * 60) : $minutesNow;
        if ($clock >= $entry['range']['start'] && $clock < $entry['range']['end']) {
            $nextEntry = $normalized[($position + 1) % count($normalized)] ?? null;
            return [
                'current' => $entry['item'],
                'next' => $nextEntry['item'] ?? null,
                'currentIndex' => $entry['index'],
                'nextIndex' => $nextEntry['index'] ?? -1
            ];
        }
    }

    $nextEntry = null;
    foreach ($normalized as $entry) {
        if ($entry['range']['start'] > $minutesNow) {
            $nextEntry = $entry;
            break;
        }
    }

    $nextEntry = $nextEntry ?? $normalized[0];
    return [
        'current' => null,
        'next' => $nextEntry['item'] ?? null,
        'currentIndex' => -1,
        'nextIndex' => $nextEntry['index'] ?? -1
    ];
}

function radioAccentJobFormatDateLabel(?DateTimeInterface $date = null): string {
    $target = $date ?? new DateTimeImmutable('now');
    $days = [
        'Monday' => 'maandag',
        'Tuesday' => 'dinsdag',
        'Wednesday' => 'woensdag',
        'Thursday' => 'donderdag',
        'Friday' => 'vrijdag',
        'Saturday' => 'zaterdag',
        'Sunday' => 'zondag'
    ];
    $months = [
        1 => 'januari',
        2 => 'februari',
        3 => 'maart',
        4 => 'april',
        5 => 'mei',
        6 => 'juni',
        7 => 'juli',
        8 => 'augustus',
        9 => 'september',
        10 => 'oktober',
        11 => 'november',
        12 => 'december'
    ];

    $englishDay = $target->format('l');
    $day = $days[$englishDay] ?? strtolower($englishDay);
    $month = $months[(int) $target->format('n')] ?? $target->format('F');

    return sprintf('%s %d %s', $day, (int) $target->format('j'), $month);
}

function radioAccentJobLatestMix(array $mixes): ?array {
    if (!$mixes) {
        return null;
    }

    usort($mixes, static function (array $left, array $right): int {
        $leftStamp = strtotime((string) ($left['updatedAt'] ?? '')) ?: 0;
        $rightStamp = strtotime((string) ($right['updatedAt'] ?? '')) ?: 0;
        return $rightStamp <=> $leftStamp;
    });

    return $mixes[0] ?? null;
}
