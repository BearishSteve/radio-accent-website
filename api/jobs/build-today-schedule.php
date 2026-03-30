<?php
declare(strict_types=1);

require_once __DIR__ . DIRECTORY_SEPARATOR . 'job-helpers.php';

$now = new DateTimeImmutable('now');
$content = radioAccentJobLoadContent();
$schedule = array_values(array_filter($content['schedule'] ?? [], 'is_array'));
$snapshot = radioAccentJobScheduleSnapshot($schedule, $now);

$payload = [
    'generatedAt' => $now->format(DATE_ATOM),
    'title' => 'Vandaag op Radio Accent',
    'dayLabel' => radioAccentJobFormatDateLabel($now),
    'currentIndex' => $snapshot['currentIndex'],
    'nextIndex' => $snapshot['nextIndex'],
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

if (!radioAccentJobWriteJson(radioAccentJobDataPath('schedule_today.json'), $payload)) {
    radioAccentJobRespond(['ok' => false, 'error' => 'Kon schedule_today.json niet wegschrijven.'], 500);
}

radioAccentJobRespond(['ok' => true, 'data' => $payload]);
