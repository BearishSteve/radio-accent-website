<?php
declare(strict_types=1);

require_once __DIR__ . DIRECTORY_SEPARATOR . 'job-helpers.php';

$now = new DateTimeImmutable('now');
$tipsSource = radioAccentJobLoadWeekendTips();
$mixes = radioAccentJobLoadMixes();
$latestMix = radioAccentJobLatestMix($mixes);
$fallbackImage = 'assets/logo_dab.png';

$items = [];
foreach (($tipsSource['items'] ?? []) as $item) {
    if (!is_array($item)) {
        continue;
    }

    $title = trim((string) ($item['title'] ?? ''));
    $excerpt = trim((string) ($item['excerpt'] ?? ''));
    if ($title === '' || $excerpt === '') {
        continue;
    }

    $items[] = [
        'title' => $title,
        'excerpt' => $excerpt,
        'meta' => trim((string) ($item['meta'] ?? 'Weekendtip')),
        'linkLabel' => trim((string) ($item['linkLabel'] ?? 'Meer info')),
        'linkUrl' => trim((string) ($item['linkUrl'] ?? 'index.html')),
        'image' => trim((string) ($item['image'] ?? $fallbackImage))
    ];
}

if ($latestMix) {
    array_unshift($items, [
        'title' => 'Vrijdagavondmix om te bewaren',
        'excerpt' => trim((string) ($latestMix['description'] ?? $latestMix['title'] ?? 'De nieuwste mix staat klaar om opnieuw te beluisteren.')),
        'meta' => trim((string) ($latestMix['schedule'] ?? 'Weekendmix')),
        'linkLabel' => 'Open mixen',
        'linkUrl' => 'mixen.html',
        'image' => trim((string) ($latestMix['cover'] ?? $fallbackImage))
    ]);
}

if (count($items) < 3) {
    $items[] = [
        'title' => 'Heb jij een lokale weekendtip?',
        'excerpt' => 'Stuur onze redactie een tip over een evenement, activiteit of omleiding in de regio.',
        'meta' => 'Deel jouw tip',
        'linkLabel' => 'Contacteer ons',
        'linkUrl' => 'contact.html?topic=request-tip&source=weekendtips',
        'image' => $fallbackImage
    ];
}

if (count($items) < 3) {
    $items[] = [
        'title' => 'Luister live onderweg',
        'excerpt' => 'Open de live stream of check de playlist wanneer je het weekend in rijdt.',
        'meta' => 'Altijd dichtbij',
        'linkLabel' => 'Hoe luisteren?',
        'linkUrl' => 'luisteren.html',
        'image' => $fallbackImage
    ];
}

$payload = [
    'generatedAt' => $now->format(DATE_ATOM),
    'title' => 'Weekendtips',
    'items' => array_slice($items, 0, 3)
];

if (!radioAccentJobWriteJson(radioAccentJobDataPath('weekend_tips.json'), $payload)) {
    radioAccentJobRespond(['ok' => false, 'error' => 'Kon weekend_tips.json niet wegschrijven.'], 500);
}

radioAccentJobRespond(['ok' => true, 'data' => $payload]);
