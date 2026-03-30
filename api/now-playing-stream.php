<?php
declare(strict_types=1);

header('Content-Type: text/event-stream; charset=utf-8');
header('Cache-Control: no-cache, no-store, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('X-Accel-Buffering: no');

ignore_user_abort(true);
set_time_limit(0);

$dataFile = __DIR__ . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'now-playing.json';

function defaultNowPlayingState(): array {
    return [
        'track' => [
            'id' => '',
            'artist' => '',
            'title' => '',
            'cover' => '',
            'duration' => 0,
            'startedAt' => '',
            'endsAt' => '',
            'updatedAt' => ''
        ],
        'history' => []
    ];
}

function normalizeString($value): string {
    return trim((string) ($value ?? ''));
}

function normalizeTrack(array $track): array {
    return [
        'id' => normalizeString($track['id'] ?? ''),
        'artist' => normalizeString($track['artist'] ?? ''),
        'title' => normalizeString($track['title'] ?? ''),
        'cover' => normalizeString($track['cover'] ?? $track['image'] ?? ''),
        'duration' => is_numeric($track['duration'] ?? null) ? max(0, (int) round((float) $track['duration'])) : 0,
        'startedAt' => normalizeString($track['startedAt'] ?? ''),
        'endsAt' => normalizeString($track['endsAt'] ?? ''),
        'updatedAt' => normalizeString($track['updatedAt'] ?? '')
    ];
}

function normalizeHistory(array $items): array {
    $history = [];
    foreach ($items as $item) {
        if (!is_array($item)) {
            continue;
        }

        $track = normalizeTrack($item);
        if ($track['artist'] === '' && $track['title'] === '') {
            continue;
        }

        $history[] = $track;
        if (count($history) >= 60) {
            break;
        }
    }

    return $history;
}

function readState(string $dataFile): array {
    $defaults = defaultNowPlayingState();
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

    return [
        'track' => is_array($decoded['track'] ?? null) ? normalizeTrack($decoded['track']) : $defaults['track'],
        'history' => normalizeHistory(is_array($decoded['history'] ?? null) ? $decoded['history'] : [])
    ];
}

function buildVersion(array $state): string {
    $track = is_array($state['track'] ?? null) ? $state['track'] : [];
    $version = normalizeString($track['updatedAt'] ?? '')
        ?: normalizeString($track['startedAt'] ?? '')
        ?: normalizeString($track['id'] ?? '');

    if ($version !== '') {
        return $version;
    }

    return sha1(json_encode($state, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: '');
}

function sendEvent(string $event, array $state): void {
    $version = buildVersion($state);
    $payload = json_encode([
        'ok' => true,
        'data' => $state,
        'version' => $version
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

    if ($payload === false) {
        return;
    }

    echo 'id: ' . $version . "\n";
    echo 'event: ' . $event . "\n";
    echo 'data: ' . $payload . "\n\n";
}

while (ob_get_level() > 0) {
    ob_end_flush();
}
ob_implicit_flush(true);

echo "retry: 3000\n\n";

$lastFingerprint = '';
$lastPingAt = 0;

while (!connection_aborted()) {
    clearstatcache(true, $dataFile);
    $state = readState($dataFile);
    $fingerprint = sha1(json_encode($state, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: '');

    if (!hash_equals($lastFingerprint, $fingerprint)) {
        $lastFingerprint = $fingerprint;
        sendEvent('nowplaying', $state);
        @flush();
    }

    if ((time() - $lastPingAt) >= 15) {
        echo ": ping\n\n";
        $lastPingAt = time();
        @flush();
    }

    sleep(2);
}
