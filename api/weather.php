<?php
declare(strict_types=1);

require_once __DIR__ . DIRECTORY_SEPARATOR . 'config-loader.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

function respond(int $status, array $payload): void {
    http_response_code($status);
    $json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false) {
        http_response_code(500);
        echo '{"ok":false,"error":"Weather JSON encode failed"}';
        exit;
    }
    echo $json;
    exit;
}

function radioAccentStartsWith(string $value, string $prefix): bool {
    return $prefix === '' || substr($value, 0, strlen($prefix)) === $prefix;
}

function radioAccentLogWeatherError(string $message): void {
    error_log('[radioaccent weather] ' . $message);
}

register_shutdown_function(static function (): void {
    $error = error_get_last();
    if (!$error || !in_array((int) ($error['type'] ?? 0), [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true)) {
        return;
    }

    if (!headers_sent()) {
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
        http_response_code(500);
    }

    echo json_encode([
        'ok' => false,
        'error' => 'Weather endpoint fatal error'
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    radioAccentLogWeatherError(trim((string) ($error['message'] ?? 'fatal error')));
});

function fetchUrl(string $url): ?string {
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_TIMEOUT => 10,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_USERAGENT => 'RadioAccentWeather/1.0'
        ]);
        $body = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if ($body !== false && $status >= 200 && $status < 300) {
            return $body;
        }
        return null;
    }

    $context = stream_context_create([
        'http' => [
            'method' => 'GET',
            'timeout' => 10,
            'header' => "User-Agent: RadioAccentWeather/1.0\r\n"
        ]
    ]);
    $body = @file_get_contents($url, false, $context);
    return $body === false ? null : $body;
}

try {
    $degreeSymbol = "\u{00B0}";
    $runtimeConfig = radioAccentLoadConfig();
    $apiKey = $runtimeConfig['weatherApiKey'];
    $location = $runtimeConfig['weatherLocation'];

    if ($apiKey === '' || $location === '') {
        respond(503, ['ok' => false, 'error' => 'Weather API is not configured']);
    }

    $url = sprintf(
        'https://api.weatherapi.com/v1/forecast.json?key=%s&q=%s&days=2&aqi=no&alerts=no',
        rawurlencode($apiKey),
        rawurlencode($location)
    );

    $raw = fetchUrl($url);
    if ($raw === null) {
        respond(502, ['ok' => false, 'error' => 'Weather service unavailable']);
    }

    $payload = json_decode($raw, true);
    if (!is_array($payload)) {
        respond(502, ['ok' => false, 'error' => 'Invalid weather response']);
    }

    $current = is_array($payload['current'] ?? null) ? $payload['current'] : [];
    $condition = is_array($current['condition'] ?? null) ? $current['condition'] : [];
    $locationData = is_array($payload['location'] ?? null) ? $payload['location'] : [];
    $forecastData = is_array($payload['forecast'] ?? null) ? $payload['forecast'] : [];
    $forecastDays = is_array($forecastData['forecastday'] ?? null) ? $forecastData['forecastday'] : [];
    $timezoneId = trim((string) ($locationData['tz_id'] ?? ''));
    $timezone = $timezoneId !== '' ? new DateTimeZone($timezoneId) : new DateTimeZone(date_default_timezone_get());

    $icon = trim((string) ($condition['icon'] ?? ''));
    if ($icon !== '' && radioAccentStartsWith($icon, '//')) {
        $icon = 'https:' . $icon;
    }

    $tempC = $current['temp_c'] ?? null;
    $temperature = is_numeric($tempC) ? sprintf('%d%sC', (int) round((float) $tempC), $degreeSymbol) : '';

    $nextHours = [];
    $currentEpoch = (int) ($locationData['localtime_epoch'] ?? time());
    foreach ($forecastDays as $forecastDay) {
        if (!is_array($forecastDay)) {
            continue;
        }

        $hours = is_array($forecastDay['hour'] ?? null) ? $forecastDay['hour'] : [];
        foreach ($hours as $hour) {
            if (!is_array($hour)) {
                continue;
            }

            $hourEpoch = (int) ($hour['time_epoch'] ?? 0);
            if ($hourEpoch < $currentEpoch) {
                continue;
            }

            $hourTemp = $hour['temp_c'] ?? null;
            $hourCondition = is_array($hour['condition'] ?? null) ? $hour['condition'] : [];
            $hourIcon = trim((string) ($hourCondition['icon'] ?? ''));
            if ($hourIcon !== '' && radioAccentStartsWith($hourIcon, '//')) {
                $hourIcon = 'https:' . $hourIcon;
            }

            $hourDateTime = (new DateTimeImmutable('@' . $hourEpoch))->setTimezone($timezone);
            $nextHours[] = [
                'time' => $hourDateTime->format('H\ui'),
                'temperature' => is_numeric($hourTemp) ? sprintf('%d%sC', (int) round((float) $hourTemp), $degreeSymbol) : '',
                'icon' => $hourIcon
            ];

            if (count($nextHours) >= 3) {
                break 2;
            }
        }
    }

    respond(200, [
        'ok' => true,
        'data' => [
            'location' => trim((string) ($locationData['name'] ?? $location)),
            'temperature' => $temperature,
            'icon' => $icon,
            'condition' => trim((string) ($condition['text'] ?? '')),
            'forecast' => $nextHours
        ]
    ]);
} catch (Throwable $exception) {
    radioAccentLogWeatherError($exception->getMessage());
    respond(500, [
        'ok' => false,
        'error' => 'Weather endpoint exception'
    ]);
}
