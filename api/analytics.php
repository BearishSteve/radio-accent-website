<?php
declare(strict_types=1);

require_once __DIR__ . DIRECTORY_SEPARATOR . 'admin-auth.php';
require_once __DIR__ . DIRECTORY_SEPARATOR . 'analytics-lib.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

const RADIO_ACCENT_ANALYTICS_RATE_LIMIT_WINDOW = 900;
const RADIO_ACCENT_ANALYTICS_RATE_LIMIT_MAX = 240;
const RADIO_ACCENT_ANALYTICS_MAX_PAYLOAD_BYTES = 8192;

function analyticsRespond(int $status, array $payload): void {
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function analyticsTrimmed(string $value, int $maxLength): string {
    return radioAccentAnalyticsTrimmed($value, $maxLength);
}

function analyticsClientKey(): string {
    $address = trim((string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown'));
    $agent = trim((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''));
    return sha1($address . '|' . $agent);
}

function analyticsReadRateLimits(): array {
    $file = radioAccentAnalyticsRateLimitFile();
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

function analyticsWriteRateLimits(array $payload): void {
    $file = radioAccentAnalyticsRateLimitFile();
    $dir = dirname($file);
    if (!radioAccentAnalyticsEnsureDirectory($dir)) {
        return;
    }

    $json = json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false) {
        return;
    }

    file_put_contents($file, $json, LOCK_EX);
}

function analyticsPruneRateLimits(array $limits): array {
    $cutoff = time() - RADIO_ACCENT_ANALYTICS_RATE_LIMIT_WINDOW;
    $cleaned = [];

    foreach ($limits as $key => $timestamps) {
        if (!is_array($timestamps)) {
            continue;
        }

        $recent = [];
        foreach ($timestamps as $timestamp) {
            $value = is_numeric($timestamp) ? (int) $timestamp : 0;
            if ($value >= $cutoff) {
                $recent[] = $value;
            }
        }

        if ($recent) {
            $cleaned[$key] = array_values($recent);
        }
    }

    return $cleaned;
}

function analyticsIsRateLimited(): bool {
    $limits = analyticsPruneRateLimits(analyticsReadRateLimits());
    analyticsWriteRateLimits($limits);
    return count($limits[analyticsClientKey()] ?? []) >= RADIO_ACCENT_ANALYTICS_RATE_LIMIT_MAX;
}

function analyticsRegisterAttempt(): void {
    $limits = analyticsPruneRateLimits(analyticsReadRateLimits());
    $key = analyticsClientKey();
    $attempts = $limits[$key] ?? [];
    $attempts[] = time();
    $limits[$key] = array_values($attempts);
    analyticsWriteRateLimits($limits);
}

function analyticsNormalizeMeta(array $meta): array {
    $normalized = [];
    foreach ($meta as $key => $value) {
        $safeKey = preg_replace('/[^a-z0-9_.-]+/i', '_', trim((string) $key));
        if ($safeKey === '') {
            continue;
        }

        if (is_scalar($value) || $value === null) {
            $normalized[$safeKey] = analyticsTrimmed((string) $value, 160);
        }
    }

    return array_slice($normalized, 0, 8, true);
}

$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');

if ($method === 'POST') {
    $rawInput = file_get_contents('php://input');
    if ($rawInput !== false && strlen($rawInput) > RADIO_ACCENT_ANALYTICS_MAX_PAYLOAD_BYTES) {
        analyticsRespond(413, ['ok' => false, 'error' => 'Analytics payload te groot']);
    }

    $payload = json_decode($rawInput ?: '', true);
    if (!is_array($payload)) {
        analyticsRespond(400, ['ok' => false, 'error' => 'Invalid JSON body']);
    }

    if (analyticsIsRateLimited()) {
        analyticsRespond(429, ['ok' => false, 'error' => 'Te veel analytics events in korte tijd']);
    }

    $type = analyticsTrimmed((string) ($payload['type'] ?? 'pageview'), 20);
    $timestamp = analyticsTrimmed((string) ($payload['ts'] ?? gmdate('c')), 40);
    analyticsRegisterAttempt();

    if ($type === 'pageview') {
        $path = analyticsTrimmed((string) ($payload['path'] ?? '/'), 200);
        $title = analyticsTrimmed((string) ($payload['title'] ?? ''), 160);
        if (!radioAccentAnalyticsRecordPageview($path, $title, $timestamp)) {
            analyticsRespond(500, ['ok' => false, 'error' => 'Analytics event kon niet opgeslagen worden']);
        }
        analyticsRespond(202, ['ok' => true]);
    }

    if ($type === 'event') {
        $name = analyticsTrimmed((string) ($payload['name'] ?? ''), 60);
        $label = analyticsTrimmed((string) ($payload['label'] ?? ''), 160);
        $meta = analyticsNormalizeMeta(is_array($payload['meta'] ?? null) ? $payload['meta'] : []);
        if ($name === '' || !in_array($name, ['mix_play'], true)) {
            analyticsRespond(400, ['ok' => false, 'error' => 'Unknown event name']);
        }
        if (!radioAccentAnalyticsRecordEvent($name, $label, $meta, $timestamp)) {
            analyticsRespond(500, ['ok' => false, 'error' => 'Analytics event kon niet opgeslagen worden']);
        }
        analyticsRespond(202, ['ok' => true]);
    }

    analyticsRespond(400, ['ok' => false, 'error' => 'Unknown analytics payload']);
}

if ($method !== 'GET') {
    analyticsRespond(405, ['ok' => false, 'error' => 'Method not allowed']);
}

if (!radioAccentAdminIsAuthenticated()) {
    analyticsRespond(401, ['ok' => false, 'error' => 'Admin sessie verlopen. Log opnieuw in.']);
}

$days = (int) ($_GET['days'] ?? RADIO_ACCENT_ANALYTICS_DEFAULT_DAYS);
analyticsRespond(200, [
    'ok' => true,
    'data' => radioAccentAnalyticsSummary($days)
]);
