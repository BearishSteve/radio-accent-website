<?php
declare(strict_types=1);

require_once __DIR__ . DIRECTORY_SEPARATOR . 'config-loader.php';
require_once __DIR__ . DIRECTORY_SEPARATOR . 'admin-auth.php';
require_once __DIR__ . DIRECTORY_SEPARATOR . 'history-kind-rules.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

const RADIO_ACCENT_BACKUP_LIMIT = 25;

function respond(int $status, array $payload): void {
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

$runtimeConfig = radioAccentLoadConfig();
$adminPasscode = $runtimeConfig['adminPasscode'];
$adminPasscodeHash = $runtimeConfig['adminPasscodeHash'];
$dataFile = __DIR__ . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'content.json';

$defaults = [
    'schedule' => [
        ['time' => '06:00 - 07:00', 'title' => 'Accent Start', 'description' => 'Kalm ontwaken met zachte hits en headlines.', 'host' => '', 'image' => ''],
        ['time' => '07:00 - 10:00', 'title' => 'Accent Ochtend', 'description' => 'Nieuws, verkeer en energieke muziek voor je dagstart.', 'host' => '', 'image' => ''],
        ['time' => '10:00 - 13:00', 'title' => 'Accent Werkdag', 'description' => 'Feelgood tracks en updates uit de regio.', 'host' => '', 'image' => ''],
        ['time' => '13:00 - 16:00', 'title' => 'Accent Middag', 'description' => 'De ideale mix voor je namiddag op kantoor of thuis.', 'host' => '', 'image' => ''],
        ['time' => '16:00 - 19:00', 'title' => 'Accent Drive', 'description' => 'De rit naar huis met verkeer, nieuws en requests.', 'host' => '', 'image' => ''],
        ['time' => '20:00 - 22:00', 'title' => 'Accent Avondmix', 'description' => 'Rustige opbouw met moderne klassiekers.', 'host' => '', 'image' => '']
    ],
    'mixes' => [
        [
            'title' => 'AIRPLAY REWIND',
            'dj' => 'DJ BEAR',
            'schedule' => 'Wekelijkse avondmix',
            'description' => 'De beste hits, van toen en nu in de mix.',
            'streamUrl' => 'https://www.radioaccent.be/assets/mixen/airplay-rewind/latest.mp3',
            'cover' => 'https://www.radioaccent.be/assets/mixen/airplay-rewind/cover.jpg',
            'updatedAt' => '2026-03-11T15:16:50+00:00',
            'slug' => 'airplay-rewind',
            'replays' => [
                ['label' => 'Update van 11 maart 2026', 'url' => 'https://www.radioaccent.be/assets/mixen/airplay-rewind/latest.mp3', 'updatedAt' => '2026-03-11T15:16:50+00:00', 'note' => 'Nieuwste versie van de weekly rewind.'],
                ['label' => 'Replay van 4 maart 2026', 'url' => 'https://www.radioaccent.be/assets/mixen/airplay-rewind/latest.mp3', 'updatedAt' => '2026-03-04T15:05:00+00:00', 'note' => 'Vorige weekeditie ter referentie in het archief.']
            ]
        ],
        [
            'title' => 'FREQUENCIES',
            'dj' => 'DJ IRISSS',
            'schedule' => 'Elke donderdag avond tussen 22 en 23 uur',
            'description' => 'De donderdag warming-up voor het weekend.',
            'streamUrl' => 'https://www.radioaccent.be/assets/mixen/frequencies/latest.mp3',
            'cover' => 'assets/mixen/dj_smooth.jpg',
            'updatedAt' => '2026-03-11T15:24:11+00:00',
            'slug' => 'dj-irisss-frequencies',
            'replays' => [
                ['label' => 'Update van 11 maart 2026', 'url' => 'https://www.radioaccent.be/assets/mixen/frequencies/latest.mp3', 'updatedAt' => '2026-03-11T15:24:11+00:00', 'note' => 'Laatste upload vanuit de mix-feed.'],
                ['label' => 'Replay van 27 februari 2026', 'url' => 'https://www.radioaccent.be/assets/mixen/frequencies/latest.mp3', 'updatedAt' => '2026-02-27T21:58:00+00:00', 'note' => 'Vorige editie met dezelfde host.']
            ]
        ],
        [
            'title' => "L'ATTITUDE FM - UUR1",
            'dj' => 'DJ SMOOTH',
            'schedule' => 'Elke vrijdag avond tussen 22 en 23 uur',
            'description' => 'Smooth tunes to start the weekend.',
            'streamUrl' => "https://www.radioaccent.be/assets/mixen/l'attitude/uur1/latest.mp3",
            'cover' => "https://www.radioaccent.be/assets/mixen/l'attitude/uur1/cover.jpg",
            'updatedAt' => '2026-03-11T15:18:58+00:00',
            'slug' => 'smooth-l-attitude-uur1',
            'replays' => [
                ['label' => 'Uur 1 - laatste versie', 'url' => "https://www.radioaccent.be/assets/mixen/l'attitude/uur1/latest.mp3", 'updatedAt' => '2026-03-11T15:18:58+00:00', 'note' => 'Actuele replay voor het eerste uur.']
            ]
        ],
        [
            'title' => "L'ATTITUDE FM - UUR2",
            'dj' => 'DJ SMOOTH',
            'schedule' => 'Elke vrijdag avond tussen 23 en 24 uur',
            'description' => 'Smooth tunes to start the weekend.',
            'streamUrl' => "https://www.radioaccent.be/assets/mixen/l'attitude/uur2/latest.mp3",
            'cover' => "https://www.radioaccent.be/assets/mixen/l'attitude/uur2/cover.jpg",
            'updatedAt' => '2026-03-11T15:20:02+00:00',
            'slug' => 'smooth-l-attitude-uur2',
            'replays' => [
                ['label' => 'Uur 2 - laatste versie', 'url' => "https://www.radioaccent.be/assets/mixen/l'attitude/uur2/latest.mp3", 'updatedAt' => '2026-03-11T15:20:02+00:00', 'note' => 'Actuele replay voor het tweede uur.']
            ]
        ]
    ],
    'news' => [
        [
            'date' => '18 maart 2026',
            'title' => 'Radio Accent pakt uit met een nieuwe nieuwsstroom',
            'excerpt' => 'We bundelen lokale updates, acties en evenementen in een sneller en helderder nieuwsoverzicht.',
            'linkLabel' => 'Bekijk nieuws',
            'linkUrl' => 'nieuws.html',
            'image' => '',
            'pinned' => true
        ],
        [
            'date' => '17 maart 2026',
            'title' => 'Accent Drive zoekt jouw avondfile-updates',
            'excerpt' => 'Heb je een tip over verkeer of een lokale omleiding? Laat het ons weten en we nemen het mee op antenne.',
            'linkLabel' => 'Contacteer ons',
            'linkUrl' => 'contact.html',
            'image' => '',
            'pinned' => false
        ],
        [
            'date' => '15 maart 2026',
            'title' => 'Nieuwe avondmixen nu ook online herbeluisterbaar',
            'excerpt' => 'De recentste mixprogramma\'s krijgen vanaf nu een vaste plek op de site met replay-links en covers.',
            'linkLabel' => 'Naar mixen',
            'linkUrl' => 'mixen.html',
            'image' => '',
            'pinned' => false
        ]
    ],
    'newsFeed' => [
        'enabled' => false,
        'url' => '',
        'limit' => 6,
        'cacheMinutes' => 15
    ],
    'siteStatus' => [
        'enabled' => false,
        'tone' => 'info',
        'title' => 'Live update',
        'message' => '',
        'ctaLabel' => '',
        'ctaLink' => ''
    ],
    'historyKinds' => radioAccentDefaultHistoryKindRules(),
    'keywordCovers' => [
        [
            'keywords' => ['nieuws', 'regionieuws', 'regionaal nieuws', 'radio accent - nieuws'],
            'cover' => 'assets/nieuws-cover.jpg'
        ],
        [
            'keywords' => ['weerbericht', 'weer', 'radio accent - weerbericht'],
            'cover' => 'assets/weer-cover.jpg'
        ],
        [
            'keywords' => ['verkeer', 'traffic', 'mobiliteit'],
            'cover' => 'assets/verkeer-cover.jpg'
        ],
        [
            'keywords' => ['jingle', 'radio accent', 'station id', 'station-id'],
            'cover' => 'assets/promo-cover.jpg'
        ],
        [
            'keywords' => ['promo', 'promotie', 'spot', 'commercial', 'advertentie'],
            'cover' => 'assets/promo-cover.jpg'
        ],
        [
            'keywords' => ['wedstrijd', 'actie', 'giveaway'],
            'cover' => 'assets/promo-cover.jpg'
        ],
        [
            'keywords' => ['breaking', 'update', 'headline'],
            'cover' => 'assets/nieuws-cover.jpg'
        ],
        [
            'keywords' => ['weather', 'forecast'],
            'cover' => 'assets/weer-cover.jpg'
        ],
        [
            'keywords' => ['file', 'non-stop', 'autopilot'],
            'cover' => 'assets/promo-cover.jpg'
        ]
    ]
];

function normalizeScheduleItem(array $item): ?array {
    $time = trim((string) ($item['time'] ?? ''));
    $title = trim((string) ($item['title'] ?? ''));
    $description = trim((string) ($item['description'] ?? ''));
    $host = trim((string) ($item['host'] ?? ''));
    $image = trim((string) ($item['image'] ?? ''));
    if ($time === '' || $title === '') {
        return null;
    }
    return ['time' => $time, 'title' => $title, 'description' => $description, 'host' => $host, 'image' => $image];
}

function normalizeMixItem(array $item): ?array {
    $title = trim((string) ($item['title'] ?? ''));
    $dj = trim((string) ($item['dj'] ?? ''));
    $schedule = trim((string) ($item['schedule'] ?? ''));
    $description = trim((string) ($item['description'] ?? ''));
    $streamUrl = trim((string) ($item['streamUrl'] ?? ''));
    $cover = trim((string) ($item['cover'] ?? ''));
    $updatedAt = trim((string) ($item['updatedAt'] ?? $item['updated_at'] ?? ''));
    $slug = trim((string) ($item['slug'] ?? ''));
    $rawReplays = $item['replays'] ?? [];
    if (is_string($rawReplays)) {
        $decodedReplays = json_decode($rawReplays, true);
        $rawReplays = is_array($decodedReplays) ? $decodedReplays : [];
    }
    $replays = [];
    foreach ((array) $rawReplays as $replay) {
        if (!is_array($replay)) {
            continue;
        }
        $url = trim((string) ($replay['url'] ?? $replay['streamUrl'] ?? $replay['audio_url'] ?? ''));
        if ($url === '') {
            continue;
        }
        $replays[] = [
            'label' => trim((string) ($replay['label'] ?? $replay['title'] ?? '')),
            'url' => $url,
            'updatedAt' => trim((string) ($replay['updatedAt'] ?? $replay['updated_at'] ?? '')),
            'duration' => is_numeric($replay['duration'] ?? null) ? max(0, (int) round((float) $replay['duration'])) : 0,
            'note' => trim((string) ($replay['note'] ?? ''))
        ];
    }
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
        'slug' => $slug,
        'replays' => $replays
    ];
}

function normalizeNewsItem(array $item): ?array {
    $date = trim((string) ($item['date'] ?? ''));
    $title = trim((string) ($item['title'] ?? ''));
    $excerpt = trim((string) ($item['excerpt'] ?? ''));
    $linkLabel = trim((string) ($item['linkLabel'] ?? ''));
    $linkUrl = normalizeLinkUrl((string) ($item['linkUrl'] ?? ''));
    $image = trim((string) ($item['image'] ?? ''));
    $pinned = filter_var($item['pinned'] ?? false, FILTER_VALIDATE_BOOLEAN);

    if ($title === '' || $excerpt === '') {
        return null;
    }

    return [
        'date' => $date,
        'title' => $title,
        'excerpt' => $excerpt,
        'linkLabel' => $linkLabel,
        'linkUrl' => $linkUrl,
        'image' => $image,
        'pinned' => $pinned
    ];
}

function normalizeSiteStatus(array $item): array {
    $tone = trim((string) ($item['tone'] ?? 'info'));
    if (!in_array($tone, ['info', 'success', 'warning'], true)) {
        $tone = 'info';
    }

    return [
        'enabled' => filter_var($item['enabled'] ?? false, FILTER_VALIDATE_BOOLEAN),
        'tone' => $tone,
        'title' => trim((string) ($item['title'] ?? '')),
        'message' => trim((string) ($item['message'] ?? '')),
        'ctaLabel' => trim((string) ($item['ctaLabel'] ?? '')),
        'ctaLink' => normalizeLinkUrl((string) ($item['ctaLink'] ?? ''))
    ];
}

function normalizeNewsFeed(array $item): array {
    $url = trim((string) ($item['url'] ?? ''));
    if ($url !== '') {
        if (preg_match('/[\x00-\x1F\x7F]/', $url) === 1 || preg_match('~^https?://~i', $url) !== 1) {
            $url = '';
        }
    }

    $limit = (int) ($item['limit'] ?? 6);
    if ($limit < 1) {
        $limit = 1;
    }
    if ($limit > 20) {
        $limit = 20;
    }

    $cacheMinutes = (int) ($item['cacheMinutes'] ?? 15);
    if ($cacheMinutes < 1) {
        $cacheMinutes = 1;
    }
    if ($cacheMinutes > 1440) {
        $cacheMinutes = 1440;
    }

    return [
        'enabled' => filter_var($item['enabled'] ?? false, FILTER_VALIDATE_BOOLEAN) && $url !== '',
        'url' => $url,
        'limit' => $limit,
        'cacheMinutes' => $cacheMinutes
    ];
}

function normalizeLinkUrl(string $value): string {
    $trimmed = trim($value);
    if ($trimmed === '') {
        return '';
    }

    if (preg_match('/[\x00-\x1F\x7F]/', $trimmed) === 1) {
        return '';
    }

    $parsed = @parse_url($trimmed);
    if (is_array($parsed) && isset($parsed['scheme'])) {
        $scheme = strtolower((string) $parsed['scheme']);
        return in_array($scheme, ['http', 'https', 'mailto', 'tel'], true) ? $trimmed : '';
    }

    return strpos($trimmed, '//') === 0 ? '' : $trimmed;
}

function normalizeKeywordCoverItem(array $item): ?array {
    $rawKeywords = $item['keywords'] ?? [];
    $keywords = [];

    if (is_array($rawKeywords)) {
        foreach ($rawKeywords as $keyword) {
            $value = trim((string) $keyword);
            if ($value !== '') {
                $keywords[] = $value;
            }
        }
    } else {
        foreach (explode(',', (string) $rawKeywords) as $keyword) {
            $value = trim($keyword);
            if ($value !== '') {
                $keywords[] = $value;
            }
        }
    }

    $cover = trim((string) ($item['cover'] ?? ''));
    if (!$keywords || $cover === '') {
        return null;
    }

    return [
        'keywords' => array_values(array_unique($keywords)),
        'cover' => $cover
    ];
}

function normalizeHistoryKindItem(array $item): ?array {
    return radioAccentNormalizeHistoryKindRule($item);
}

function sanitizeContent(array $input, array $defaults): array {
    $schedule = [];
    foreach (($input['schedule'] ?? []) as $item) {
        if (!is_array($item)) {
            continue;
        }
        $normalized = normalizeScheduleItem($item);
        if ($normalized) {
            $schedule[] = $normalized;
        }
    }

    $mixes = [];
    foreach (($input['mixes'] ?? []) as $item) {
        if (!is_array($item)) {
            continue;
        }
        $normalized = normalizeMixItem($item);
        if ($normalized) {
            $mixes[] = $normalized;
        }
    }

    $news = [];
    foreach (($input['news'] ?? []) as $item) {
        if (!is_array($item)) {
            continue;
        }
        $normalized = normalizeNewsItem($item);
        if ($normalized) {
            $news[] = $normalized;
        }
    }

    $historyKinds = [];
    foreach (($input['historyKinds'] ?? []) as $item) {
        if (!is_array($item)) {
            continue;
        }
        $normalized = normalizeHistoryKindItem($item);
        if ($normalized) {
            $historyKinds[] = $normalized;
        }
    }

    $keywordCovers = [];
    foreach (($input['keywordCovers'] ?? []) as $item) {
        if (!is_array($item)) {
            continue;
        }
        $normalized = normalizeKeywordCoverItem($item);
        if ($normalized) {
            $keywordCovers[] = $normalized;
        }
    }

    if (!$schedule) {
        $schedule = $defaults['schedule'];
    }

    if (!$mixes) {
        $mixes = $defaults['mixes'];
    }

    if (!$news) {
        $news = $defaults['news'];
    }

    if (!$historyKinds) {
        $historyKinds = $defaults['historyKinds'];
    }

    if (!$keywordCovers) {
        $keywordCovers = $defaults['keywordCovers'];
    }

    $siteStatusInput = is_array($input['siteStatus'] ?? null) ? $input['siteStatus'] : [];
    $newsFeedInput = is_array($input['newsFeed'] ?? null) ? $input['newsFeed'] : [];

    return [
        'schedule' => $schedule,
        'mixes' => $mixes,
        'news' => $news,
        'newsFeed' => normalizeNewsFeed(array_merge($defaults['newsFeed'], $newsFeedInput)),
        'siteStatus' => normalizeSiteStatus(array_merge($defaults['siteStatus'], $siteStatusInput)),
        'historyKinds' => $historyKinds,
        'keywordCovers' => $keywordCovers
    ];
}

function readContent(string $dataFile, array $defaults): array {
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

    return sanitizeContent($decoded, $defaults);
}

function writeContent(string $dataFile, array $content): bool {
    $dir = dirname($dataFile);
    if (!is_dir($dir)) {
        if (!mkdir($dir, 0775, true) && !is_dir($dir)) {
            return false;
        }
    }

    $json = json_encode($content, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false) {
        return false;
    }

    return file_put_contents($dataFile, $json, LOCK_EX) !== false;
}

function backupDir(): string {
    return __DIR__ . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'backups';
}

function ensureDirectory(string $dir): bool {
    return is_dir($dir) || mkdir($dir, 0775, true) || is_dir($dir);
}

function createBackupSnapshot(array $content, string $reason): bool {
    $dir = backupDir();
    if (!ensureDirectory($dir)) {
        return false;
    }

    try {
        $suffix = substr(bin2hex(random_bytes(4)), 0, 8);
    } catch (Throwable $exception) {
        $suffix = substr(sha1(uniqid('', true)), 0, 8);
    }

    $payload = [
        'createdAt' => gmdate('c'),
        'reason' => trim($reason) !== '' ? trim($reason) : 'save',
        'content' => $content
    ];

    $json = json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false) {
        return false;
    }

    $file = $dir . DIRECTORY_SEPARATOR . 'content-' . gmdate('Ymd-His') . '-' . $suffix . '.json';
    $written = file_put_contents($file, $json, LOCK_EX) !== false;
    pruneBackups($dir);
    return $written;
}

function pruneBackups(string $dir): void {
    $files = glob($dir . DIRECTORY_SEPARATOR . 'content-*.json') ?: [];
    rsort($files, SORT_STRING);
    $obsolete = array_slice($files, RADIO_ACCENT_BACKUP_LIMIT);
    foreach ($obsolete as $file) {
        @unlink($file);
    }
}

function listBackups(array $defaults): array {
    $dir = backupDir();
    $files = glob($dir . DIRECTORY_SEPARATOR . 'content-*.json') ?: [];
    rsort($files, SORT_STRING);
    $backups = [];

    foreach ($files as $file) {
        $raw = file_get_contents($file);
        if ($raw === false) {
            continue;
        }

        $decoded = json_decode($raw, true);
        if (!is_array($decoded) || !is_array($decoded['content'] ?? null)) {
            continue;
        }

        $content = sanitizeContent($decoded['content'], $defaults);
        $backups[] = [
            'id' => basename($file),
            'createdAt' => trim((string) ($decoded['createdAt'] ?? gmdate('c', (int) (@filemtime($file) ?: time())))),
            'reason' => trim((string) ($decoded['reason'] ?? 'save')),
            'counts' => [
                'schedule' => count($content['schedule']),
                'mixes' => count($content['mixes']),
                'news' => count($content['news'])
            ],
            'siteStatusEnabled' => !empty($content['siteStatus']['enabled'])
        ];
    }

    return $backups;
}

function readBackupSnapshot(string $id, array $defaults): ?array {
    if ($id === '' || basename($id) !== $id) {
        return null;
    }

    $file = backupDir() . DIRECTORY_SEPARATOR . $id;
    if (!is_file($file)) {
        return null;
    }

    $raw = file_get_contents($file);
    if ($raw === false) {
        return null;
    }

    $decoded = json_decode($raw, true);
    if (!is_array($decoded) || !is_array($decoded['content'] ?? null)) {
        return null;
    }

    return sanitizeContent($decoded['content'], $defaults);
}

$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');

if ($method === 'GET') {
    $content = readContent($dataFile, $defaults);
    respond(200, ['ok' => true, 'data' => $content]);
}

if ($method !== 'POST') {
    respond(405, ['ok' => false, 'error' => 'Method not allowed']);
}

if ($adminPasscode === '' && $adminPasscodeHash === '') {
    respond(503, ['ok' => false, 'error' => 'Admin passcode is not configured']);
}

$rawInput = file_get_contents('php://input');
$payload = json_decode($rawInput ?: '', true);
if (!is_array($payload)) {
    respond(400, ['ok' => false, 'error' => 'Invalid JSON body']);
}

$action = (string) ($payload['action'] ?? '');
$passcode = (string) ($payload['passcode'] ?? '');

if ($action === 'status') {
    respond(200, ['ok' => true, 'authenticated' => radioAccentAdminIsAuthenticated()]);
}

if ($action === 'logout') {
    radioAccentAdminLogout();
    respond(200, ['ok' => true]);
}

if ($action === 'auth') {
    if ($adminPasscode === '' && $adminPasscodeHash === '') {
        respond(503, ['ok' => false, 'error' => 'Admin passcode is not configured']);
    }
    if (radioAccentAdminIsRateLimited()) {
        respond(429, ['ok' => false, 'error' => 'Te veel mislukte pogingen. Probeer het straks opnieuw.']);
    }
    if (!radioAccentAdminVerifyPasscode($passcode, $runtimeConfig)) {
        $remainingAttempts = radioAccentAdminRegisterFailedAttempt();
        $error = $remainingAttempts > 0
            ? sprintf('Onjuiste toegangscode. Nog %d poging(en) over.', $remainingAttempts)
            : 'Te veel mislukte pogingen. Probeer het straks opnieuw.';
        respond($remainingAttempts > 0 ? 401 : 429, ['ok' => false, 'error' => $error]);
    }
    radioAccentAdminAuthenticate();
    radioAccentAdminClearFailedAttempts();
    respond(200, ['ok' => true]);
}

if (!radioAccentAdminIsAuthenticated()) {
    respond(401, ['ok' => false, 'error' => 'Admin sessie verlopen. Log opnieuw in.']);
}

if ($action === 'backups') {
    respond(200, ['ok' => true, 'data' => listBackups($defaults)]);
}

if ($action === 'restoreBackup') {
    $id = trim((string) ($payload['id'] ?? ''));
    $backupContent = readBackupSnapshot($id, $defaults);
    if (!$backupContent) {
        respond(404, ['ok' => false, 'error' => 'Backup niet gevonden.']);
    }

    $current = readContent($dataFile, $defaults);
    createBackupSnapshot($current, 'pre-restore');
    if (!writeContent($dataFile, $backupContent)) {
        respond(500, ['ok' => false, 'error' => 'Backup kon niet teruggezet worden.']);
    }
    createBackupSnapshot($backupContent, 'restore');
    respond(200, ['ok' => true, 'data' => $backupContent, 'backups' => listBackups($defaults)]);
}

if ($action === 'reset') {
    if (!writeContent($dataFile, $defaults)) {
        respond(500, ['ok' => false, 'error' => 'Failed to write content file']);
    }
    createBackupSnapshot($defaults, 'reset');
    respond(200, ['ok' => true, 'data' => $defaults, 'backups' => listBackups($defaults)]);
}

if ($action === 'save') {
    $incoming = $payload['data'] ?? null;
    if (!is_array($incoming)) {
        respond(400, ['ok' => false, 'error' => 'Missing content data']);
    }

    $sanitized = sanitizeContent($incoming, $defaults);
    if (!writeContent($dataFile, $sanitized)) {
        respond(500, ['ok' => false, 'error' => 'Failed to write content file']);
    }
    createBackupSnapshot($sanitized, 'save');

    respond(200, ['ok' => true, 'data' => $sanitized, 'backups' => listBackups($defaults)]);
}

respond(400, ['ok' => false, 'error' => 'Unknown action']);
