<?php
declare(strict_types=1);

function radioAccentFindProjectRoot(): string {
    $candidates = [
        dirname(__DIR__),
        dirname(__DIR__) . DIRECTORY_SEPARATOR . 'v2'
    ];

    foreach ($candidates as $candidate) {
        if (
            is_file($candidate . DIRECTORY_SEPARATOR . 'api' . DIRECTORY_SEPARATOR . 'dab-assets.php')
            && is_file($candidate . DIRECTORY_SEPARATOR . 'api' . DIRECTORY_SEPARATOR . 'config-loader.php')
        ) {
            return $candidate;
        }
    }

    return dirname(__DIR__);
}

$projectRoot = radioAccentFindProjectRoot();

require_once $projectRoot . DIRECTORY_SEPARATOR . 'api' . DIRECTORY_SEPARATOR . 'config-loader.php';
require_once $projectRoot . DIRECTORY_SEPARATOR . 'api' . DIRECTORY_SEPARATOR . 'dab-assets.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

function radioAccentMetadataBaseUrl(array $runtimeConfig): string {
    $configured = trim((string) ($runtimeConfig['dabMetadataBaseUrl'] ?? ''));
    if ($configured !== '') {
        return rtrim($configured, '/');
    }

    $forwardedProto = trim((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? ''));
    if ($forwardedProto !== '') {
        $scheme = strtolower(explode(',', $forwardedProto)[0]) === 'https' ? 'https' : 'http';
    } else {
        $https = strtolower((string) ($_SERVER['HTTPS'] ?? ''));
        $scheme = ($https !== '' && $https !== 'off') ? 'https' : 'http';
    }

    $host = trim((string) ($_SERVER['HTTP_HOST'] ?? $_SERVER['SERVER_NAME'] ?? ''));
    if ($host === '') {
        return '';
    }

    return $scheme . '://' . $host . '/metadata';
}

function radioAccentMetadataUrl(string $baseUrl, string $value): string {
    $trimmed = trim($value);
    if ($trimmed === '') {
        return $baseUrl !== '' ? $baseUrl . '/logo_dab.png' : '';
    }

    if (preg_match('~^https?://~i', $trimmed)) {
        return $trimmed;
    }

    if ($baseUrl === '') {
        return $trimmed;
    }

    return $baseUrl . '/' . ltrim($trimmed, '/');
}

$runtimeConfig = radioAccentLoadConfig();
$stateFile = $projectRoot . DIRECTORY_SEPARATOR . 'api' . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'now-playing.json';
$manifestFile = $projectRoot . DIRECTORY_SEPARATOR . 'api' . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'dab-nowplaying.json';
$metadataDir = __DIR__;

$state = radioAccentReadJsonFile($stateFile, [
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
]);

$manifest = radioAccentReadJsonFile($manifestFile, []);
$currentVersion = radioAccentDabTrackVersion($state);
if (($manifest['version'] ?? '') !== $currentVersion) {
    try {
        $manifest = radioAccentGenerateDabAssets($state, $projectRoot, [
            'metadataDir' => $metadataDir,
            'metadataPublicPath' => '',
            'artistFont' => trim((string) ($runtimeConfig['dabArtistFont'] ?? '')),
            'titleFont' => trim((string) ($runtimeConfig['dabTitleFont'] ?? '')),
            'badgeFont' => trim((string) ($runtimeConfig['dabBadgeFont'] ?? ''))
        ]);
    } catch (Throwable $exception) {
        $manifest = [];
    }
}

$track = is_array($state['track'] ?? null) ? $state['track'] : [];
$title = trim((string) ($manifest['title'] ?? ''));
if ($title === '') {
    $title = radioAccentDabBuildTitle($track);
}

$meta = is_array($manifest['meta'] ?? null)
    ? $manifest['meta']
    : radioAccentDabDefaultMeta(['generated_image' => false, 'generator_status' => 'fallback']);

$baseUrl = radioAccentMetadataBaseUrl($runtimeConfig);
$coverValue = trim((string) ($manifest['cover'] ?? $track['cover'] ?? ''));
$payload = [
    'title' => $title !== '' ? $title : 'Radio Accent',
    'cover' => radioAccentMetadataUrl($baseUrl, $coverValue),
    'pubDate' => trim((string) ($manifest['pubDate'] ?? '')) ?: date(DATE_RSS),
    'meta' => $meta
];

echo json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
