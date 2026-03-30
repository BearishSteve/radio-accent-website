<?php
declare(strict_types=1);

require_once __DIR__ . DIRECTORY_SEPARATOR . 'job-helpers.php';

$now = new DateTimeImmutable('now');
$content = radioAccentJobLoadContent();
$mixes = radioAccentJobLoadMixes();
$latestMix = radioAccentJobLatestMix($mixes);
$nowPlaying = radioAccentJobLoadNowPlaying();
$regionNews = radioAccentJobLoadRegionNews();
$scheduleToday = radioAccentJobReadJson(radioAccentJobDataPath('schedule_today.json'), []);
$weekendTips = radioAccentJobLoadWeekendTips();

if (!($scheduleToday['items'] ?? [])) {
    $schedule = array_values(array_filter($content['schedule'] ?? [], 'is_array'));
    $snapshot = radioAccentJobScheduleSnapshot($schedule, $now);
    $scheduleToday = [
        'generatedAt' => $now->format(DATE_ATOM),
        'title' => 'Vandaag op Radio Accent',
        'dayLabel' => radioAccentJobFormatDateLabel($now),
        'items' => array_values(array_map(static function ($item, int $index) use ($snapshot): array {
            return [
                'time' => trim((string) ($item['time'] ?? '')),
                'title' => trim((string) ($item['title'] ?? '')),
                'description' => trim((string) ($item['description'] ?? '')),
                'host' => trim((string) ($item['host'] ?? '')),
                'image' => trim((string) ($item['image'] ?? '')),
                'isCurrent' => $snapshot['currentIndex'] === $index,
                'isNext' => $snapshot['nextIndex'] === $index
            ];
        }, $schedule, array_keys($schedule)))
    ];
}

$scheduleItems = array_values(array_filter($scheduleToday['items'] ?? [], 'is_array'));
$scheduleSnapshot = radioAccentJobScheduleSnapshot($scheduleItems, $now);
$currentShow = is_array($scheduleSnapshot['current'] ?? null) ? $scheduleSnapshot['current'] : null;
$track = is_array($nowPlaying['track'] ?? null) ? $nowPlaying['track'] : [];

$payload = [
    'generatedAt' => $now->format(DATE_ATOM),
    'onAir' => [
        'title' => 'Nu op antenne',
        'showTitle' => trim((string) ($currentShow['title'] ?? 'Radio Accent live')),
        'slot' => trim((string) ($currentShow['time'] ?? '')),
        'description' => trim((string) ($currentShow['description'] ?? 'Live vanuit Radio Accent.')),
        'host' => trim((string) ($currentShow['host'] ?? '')),
        'trackTitle' => trim((string) ($track['title'] ?? '')),
        'trackArtist' => trim((string) ($track['artist'] ?? '')),
        'cover' => trim((string) ($track['cover'] ?? 'assets/logo_dab.png')),
        'linkLabel' => 'Luister live',
        'linkUrl' => 'https://clubfmserver.be/accentdab.mp3'
    ],
    'todaySchedule' => [
        'title' => trim((string) ($scheduleToday['title'] ?? 'Vandaag op Radio Accent')),
        'dayLabel' => trim((string) ($scheduleToday['dayLabel'] ?? radioAccentJobFormatDateLabel($now))),
        'items' => $scheduleItems
    ],
    'regionNews' => [
        'title' => trim((string) ($regionNews['title'] ?? 'Uit de regio')),
        'items' => array_values(array_filter($regionNews['items'] ?? [], 'is_array'))
    ],
    'weekendTips' => [
        'title' => trim((string) ($weekendTips['title'] ?? 'Weekendtips')),
        'items' => array_values(array_filter($weekendTips['items'] ?? [], 'is_array'))
    ],
    'latestMix' => $latestMix ? [
        'title' => trim((string) ($latestMix['title'] ?? 'Nieuwste mix')),
        'dj' => trim((string) ($latestMix['dj'] ?? 'Radio Accent')),
        'schedule' => trim((string) ($latestMix['schedule'] ?? 'Mixhighlight')),
        'description' => trim((string) ($latestMix['description'] ?? 'De nieuwste mix staat klaar om te beluisteren.')),
        'streamUrl' => trim((string) ($latestMix['streamUrl'] ?? '')),
        'cover' => trim((string) ($latestMix['cover'] ?? 'assets/logo_dab.png')),
        'updatedAt' => trim((string) ($latestMix['updatedAt'] ?? '')),
        'slug' => trim((string) ($latestMix['slug'] ?? '')),
        'linkLabel' => 'Open mixen',
        'linkUrl' => 'mixen.html'
    ] : null
];

if (!radioAccentJobWriteJson(radioAccentJobDataPath('homepage_blocks.json'), $payload)) {
    radioAccentJobRespond(['ok' => false, 'error' => 'Kon homepage_blocks.json niet wegschrijven.'], 500);
}

radioAccentJobRespond(['ok' => true, 'data' => $payload]);
