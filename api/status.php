<?php
declare(strict_types=1);

require_once __DIR__ . DIRECTORY_SEPARATOR . 'config-loader.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

function statusRespond(int $status, array $payload): void {
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function statusBuildCheck(string $key, string $label, string $status, string $summary, string $detail = ''): array {
    return [
        'key' => $key,
        'label' => $label,
        'status' => $status,
        'summary' => $summary,
        'detail' => $detail
    ];
}

function statusReadJsonFile(string $file): ?array {
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

function statusFetchUrl(string $url, bool $headOnly = false): array {
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_TIMEOUT => 10,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_USERAGENT => 'RadioAccentStatus/1.0',
            CURLOPT_NOBODY => $headOnly
        ]);
        $body = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        curl_close($ch);
        return [
            'ok' => $error === '' && $status >= 200 && $status < 400,
            'status' => $status,
            'body' => is_string($body) ? $body : '',
            'error' => $error
        ];
    }

    $context = stream_context_create([
        'http' => [
            'method' => $headOnly ? 'HEAD' : 'GET',
            'timeout' => 10,
            'ignore_errors' => true,
            'header' => "User-Agent: RadioAccentStatus/1.0\r\n"
        ]
    ]);
    $body = @file_get_contents($url, false, $context);
    $status = 0;
    foreach ($http_response_header ?? [] as $headerLine) {
        if (preg_match('~^HTTP/\S+\s+(\d{3})~', (string) $headerLine, $matches) === 1) {
            $status = (int) $matches[1];
            break;
        }
    }

    return [
        'ok' => $status >= 200 && $status < 400,
        'status' => $status,
        'body' => is_string($body) ? $body : '',
        'error' => ''
    ];
}

function statusCheckStream(string $streamUrl): array {
    if ($streamUrl === '') {
        return statusBuildCheck('stream', 'Stream', 'warning', 'Geen stream-URL ingesteld.', 'Configureer een publieke stream om deze check te activeren.');
    }

    $result = statusFetchUrl($streamUrl, true);
    if ($result['ok']) {
        return statusBuildCheck('stream', 'Stream', 'ok', 'De live stream reageert correct.', 'HTTP ' . $result['status'] . ' | ' . $streamUrl);
    }

    $fallbackResult = statusFetchUrl($streamUrl, false);
    if ($fallbackResult['ok']) {
        return statusBuildCheck('stream', 'Stream', 'ok', 'De live stream reageert correct.', 'HTTP ' . $fallbackResult['status'] . ' | ' . $streamUrl);
    }

    return statusBuildCheck('stream', 'Stream', 'error', 'De live stream reageert niet op dit moment.', ($fallbackResult['status'] ? 'HTTP ' . $fallbackResult['status'] : ($result['status'] ? 'HTTP ' . $result['status'] : 'Geen HTTP-status')) . ($fallbackResult['error'] ? ' | ' . $fallbackResult['error'] : ($result['error'] ? ' | ' . $result['error'] : '')));
}

function statusCheckMetadata(string $nowPlayingFile): array {
    $payload = statusReadJsonFile($nowPlayingFile) ?? [];
    $track = is_array($payload['track'] ?? null) ? $payload['track'] : [];
    $updatedAt = trim((string) ($track['updatedAt'] ?? ''));
    $artist = trim((string) ($track['artist'] ?? ''));
    $title = trim((string) ($track['title'] ?? ''));
    $label = trim($artist . ' - ' . $title, ' -');

    if ($updatedAt === '') {
        return statusBuildCheck('metadata', 'Metadata', 'warning', 'Geen recente now-playing update gevonden.', 'Controleer api/data/now-playing.json.');
    }

    $timestamp = strtotime($updatedAt);
    if ($timestamp === false) {
        return statusBuildCheck('metadata', 'Metadata', 'warning', 'Metadata-update heeft een ongeldige tijdstempel.', $updatedAt);
    }

    $ageSeconds = time() - $timestamp;
    if ($ageSeconds > 1800) {
        return statusBuildCheck('metadata', 'Metadata', 'warning', 'Metadata is ouder dan 30 minuten.', ($label !== '' ? $label . ' | ' : '') . 'Laatste update: ' . gmdate('c', $timestamp));
    }

    return statusBuildCheck('metadata', 'Metadata', 'ok', 'Now-playing metadata wordt recent bijgewerkt.', ($label !== '' ? $label . ' | ' : '') . 'Laatste update: ' . gmdate('c', $timestamp));
}

function statusCheckWeather(array $runtimeConfig): array {
    $apiKey = trim((string) ($runtimeConfig['weatherApiKey'] ?? ''));
    $location = trim((string) ($runtimeConfig['weatherLocation'] ?? ''));
    if ($apiKey === '' || $location === '') {
        return statusBuildCheck('weather', 'Weerfeed', 'warning', 'De weerfeed is niet volledig geconfigureerd.', 'WEATHERAPI_KEY of WEATHER_LOCATION ontbreekt.');
    }

    $url = sprintf(
        'https://api.weatherapi.com/v1/current.json?key=%s&q=%s&aqi=no',
        rawurlencode($apiKey),
        rawurlencode($location)
    );
    $result = statusFetchUrl($url, false);
    if (!$result['ok']) {
        return statusBuildCheck('weather', 'Weerfeed', 'error', 'De weerfeed reageert niet correct.', $result['status'] ? 'HTTP ' . $result['status'] : 'Geen HTTP-status');
    }

    $payload = json_decode($result['body'], true);
    if (!is_array($payload)) {
        return statusBuildCheck('weather', 'Weerfeed', 'warning', 'De weerfeed gaf onleesbare data terug.', 'JSON-response kon niet verwerkt worden.');
    }

    $current = is_array($payload['current'] ?? null) ? $payload['current'] : [];
    $locationData = is_array($payload['location'] ?? null) ? $payload['location'] : [];
    $temperature = is_numeric($current['temp_c'] ?? null) ? (string) round((float) $current['temp_c']) . '°C' : '';
    $resolvedLocation = trim((string) ($locationData['name'] ?? $location));
    return statusBuildCheck('weather', 'Weerfeed', 'ok', 'De weerfeed reageert correct.', trim($resolvedLocation . ($temperature !== '' ? ' | ' . $temperature : '')));
}

$runtimeConfig = radioAccentLoadConfig();
$nowPlayingFile = __DIR__ . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'now-playing.json';
$streamUrl = 'https://clubfmserver.be/accentdab.mp3';

$checks = [
    statusCheckStream($streamUrl),
    statusCheckMetadata($nowPlayingFile),
    statusCheckWeather($runtimeConfig)
];

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

statusRespond(200, [
    'ok' => true,
    'data' => [
        'checkedAt' => gmdate('c'),
        'status' => $overallStatus,
        'checks' => $checks
    ]
]);
