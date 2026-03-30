<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

const RADIO_ACCENT_NEWS_FEED_DEFAULTS = [
    'enabled' => false,
    'url' => '',
    'limit' => 6,
    'cacheMinutes' => 15
];

function respond(int $status, array $payload): void {
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function normalizeNewsFeedSettings(array $item): array {
    $url = trim((string) ($item['url'] ?? ''));
    if ($url !== '') {
        if (preg_match('/[\x00-\x1F\x7F]/', $url) === 1 || preg_match('~^https?://~i', $url) !== 1) {
            $url = '';
        }
    }

    $limit = (int) ($item['limit'] ?? RADIO_ACCENT_NEWS_FEED_DEFAULTS['limit']);
    $limit = max(1, min(20, $limit));

    $cacheMinutes = (int) ($item['cacheMinutes'] ?? RADIO_ACCENT_NEWS_FEED_DEFAULTS['cacheMinutes']);
    $cacheMinutes = max(1, min(1440, $cacheMinutes));

    return [
        'enabled' => filter_var($item['enabled'] ?? false, FILTER_VALIDATE_BOOLEAN) && $url !== '',
        'url' => $url,
        'limit' => $limit,
        'cacheMinutes' => $cacheMinutes
    ];
}

function readNewsFeedSettings(string $contentFile): array {
    if (!is_file($contentFile)) {
        return RADIO_ACCENT_NEWS_FEED_DEFAULTS;
    }

    $raw = file_get_contents($contentFile);
    if (!is_string($raw) || $raw === '') {
        return RADIO_ACCENT_NEWS_FEED_DEFAULTS;
    }

    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        return RADIO_ACCENT_NEWS_FEED_DEFAULTS;
    }

    $settings = is_array($decoded['newsFeed'] ?? null) ? $decoded['newsFeed'] : [];
    return normalizeNewsFeedSettings(array_merge(RADIO_ACCENT_NEWS_FEED_DEFAULTS, $settings));
}

function cacheFilePath(): string {
    return __DIR__ . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'news-feed-cache.json';
}

function ensureDirectory(string $dir): bool {
    return is_dir($dir) || mkdir($dir, 0775, true) || is_dir($dir);
}

function readFeedCache(string $path): ?array {
    if (!is_file($path)) {
        return null;
    }

    $raw = file_get_contents($path);
    if (!is_string($raw) || $raw === '') {
        return null;
    }

    $decoded = json_decode($raw, true);
    if (!is_array($decoded) || !is_array($decoded['data'] ?? null)) {
        return null;
    }

    return $decoded;
}

function writeFeedCache(string $path, array $payload): void {
    $dir = dirname($path);
    if (!ensureDirectory($dir)) {
        return;
    }

    $json = json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if (!is_string($json) || $json === '') {
        return;
    }

    file_put_contents($path, $json, LOCK_EX);
}

function normalizeAbsoluteUrl(string $value, string $baseUrl): string {
    $trimmed = trim($value);
    if ($trimmed === '' || preg_match('/[\x00-\x1F\x7F]/', $trimmed) === 1) {
        return '';
    }

    if (preg_match('~^https?://~i', $trimmed) === 1) {
        return $trimmed;
    }

    $base = parse_url($baseUrl);
    if (!is_array($base) || empty($base['scheme']) || empty($base['host'])) {
        return '';
    }

    $scheme = strtolower((string) $base['scheme']);
    if (!in_array($scheme, ['http', 'https'], true)) {
        return '';
    }

    $host = (string) $base['host'];
    $port = isset($base['port']) ? ':' . (int) $base['port'] : '';

    if (strpos($trimmed, '//') === 0) {
        return $scheme . ':' . $trimmed;
    }

    if ($trimmed[0] === '/') {
        return $scheme . '://' . $host . $port . $trimmed;
    }

    $basePath = isset($base['path']) ? (string) $base['path'] : '/';
    $directory = preg_replace('~/[^/]*$~', '/', $basePath);
    if (!is_string($directory) || $directory === '') {
        $directory = '/';
    }

    return $scheme . '://' . $host . $port . $directory . $trimmed;
}

function sanitizeMarkupText(string $value, int $maxLength = 260): string {
    if ($value === '') {
        return '';
    }

    $withoutScripts = preg_replace('~<script\b[^>]*>.*?</script>~is', ' ', $value);
    if (!is_string($withoutScripts)) {
        $withoutScripts = $value;
    }

    $text = html_entity_decode(strip_tags($withoutScripts), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $text = preg_replace('/\s+/u', ' ', trim($text));
    if (!is_string($text) || $text === '') {
        return '';
    }

    if (function_exists('mb_strlen') && function_exists('mb_substr')) {
        if (mb_strlen($text, 'UTF-8') <= $maxLength) {
            return $text;
        }
        return rtrim(mb_substr($text, 0, $maxLength - 1, 'UTF-8')) . '...';
    }

    if (strlen($text) <= $maxLength) {
        return $text;
    }

    return rtrim(substr($text, 0, $maxLength - 3)) . '...';
}

function extractImageFromMarkup(string $value, string $baseUrl): string {
    if ($value === '') {
        return '';
    }

    if (preg_match('~<img[^>]+src=["\']([^"\']+)["\']~i', $value, $matches) !== 1) {
        return '';
    }

    return normalizeAbsoluteUrl((string) ($matches[1] ?? ''), $baseUrl);
}

function extractRssImage(SimpleXMLElement $item, array $namespaces, string $baseUrl): string {
    if (isset($item->enclosure)) {
        foreach ($item->enclosure as $enclosure) {
            $type = strtolower((string) ($enclosure['type'] ?? ''));
            $url = normalizeAbsoluteUrl((string) ($enclosure['url'] ?? ''), $baseUrl);
            if ($url !== '' && ($type === '' || strpos($type, 'image/') === 0)) {
                return $url;
            }
        }
    }

    if (!empty($namespaces['media'])) {
        $media = $item->children($namespaces['media']);
        foreach (['content', 'thumbnail'] as $tagName) {
            foreach ($media->{$tagName} as $mediaItem) {
                $url = normalizeAbsoluteUrl((string) ($mediaItem['url'] ?? ''), $baseUrl);
                if ($url !== '') {
                    return $url;
                }
            }
        }
    }

    return '';
}

function extractAtomLink(SimpleXMLElement $entry, string $baseUrl): string {
    foreach ($entry->link as $linkNode) {
        $rel = strtolower(trim((string) ($linkNode['rel'] ?? 'alternate')));
        $href = normalizeAbsoluteUrl((string) ($linkNode['href'] ?? ''), $baseUrl);
        if ($href !== '' && ($rel === '' || $rel === 'alternate')) {
            return $href;
        }
    }

    return '';
}

function buildFeedItem(string $title, string $date, string $excerpt, string $linkUrl, string $image, string $baseUrl): ?array {
    $safeTitle = sanitizeMarkupText($title, 180);
    if ($safeTitle === '') {
        return null;
    }

    $safeExcerpt = sanitizeMarkupText($excerpt, 260);
    if ($safeExcerpt === '') {
        $safeExcerpt = 'Lees het volledige artikel via de nieuwsfeed.';
    }

    $safeLinkUrl = normalizeAbsoluteUrl($linkUrl, $baseUrl);
    $safeImage = normalizeAbsoluteUrl($image, $baseUrl);

    return [
        'date' => trim($date),
        'title' => $safeTitle,
        'excerpt' => $safeExcerpt,
        'linkLabel' => $safeLinkUrl !== '' ? 'Lees artikel' : '',
        'linkUrl' => $safeLinkUrl,
        'image' => $safeImage,
        'pinned' => false
    ];
}

function parseRssFeed(SimpleXMLElement $root, string $feedUrl, int $limit): array {
    $channel = isset($root->channel) ? $root->channel : null;
    if (!$channel) {
        return [];
    }

    $namespaces = $root->getNamespaces(true);
    $items = [];

    foreach ($channel->item as $item) {
        $contentNs = !empty($namespaces['content']) ? $item->children($namespaces['content']) : null;
        $dcNs = !empty($namespaces['dc']) ? $item->children($namespaces['dc']) : null;
        $description = trim((string) ($item->description ?? ''));
        $encoded = $contentNs ? trim((string) ($contentNs->{'encoded'} ?? '')) : '';
        $excerptSource = $encoded !== '' ? $encoded : $description;
        $image = extractRssImage($item, $namespaces, $feedUrl);
        if ($image === '') {
            $image = extractImageFromMarkup($excerptSource, $feedUrl);
        }

        $entry = buildFeedItem(
            (string) ($item->title ?? ''),
            (string) ($item->pubDate ?? ($dcNs ? ($dcNs->date ?? '') : '')),
            $excerptSource,
            (string) ($item->link ?? ''),
            $image,
            $feedUrl
        );

        if ($entry) {
            $items[] = $entry;
        }

        if (count($items) >= $limit) {
            break;
        }
    }

    return $items;
}

function parseAtomFeed(SimpleXMLElement $root, string $feedUrl, int $limit): array {
    $namespaces = $root->getNamespaces(true);
    $items = [];

    foreach ($root->entry as $entryNode) {
        $content = trim((string) ($entryNode->content ?? ''));
        $summary = trim((string) ($entryNode->summary ?? ''));
        $excerptSource = $summary !== '' ? $summary : $content;
        $image = '';

        if (!empty($namespaces['media'])) {
            $media = $entryNode->children($namespaces['media']);
            foreach (['content', 'thumbnail'] as $tagName) {
                foreach ($media->{$tagName} as $mediaItem) {
                    $image = normalizeAbsoluteUrl((string) ($mediaItem['url'] ?? ''), $feedUrl);
                    if ($image !== '') {
                        break 2;
                    }
                }
            }
        }

        if ($image === '') {
            $image = extractImageFromMarkup($excerptSource, $feedUrl);
        }

        $entry = buildFeedItem(
            (string) ($entryNode->title ?? ''),
            (string) ($entryNode->updated ?? $entryNode->published ?? ''),
            $excerptSource,
            extractAtomLink($entryNode, $feedUrl),
            $image,
            $feedUrl
        );

        if ($entry) {
            $items[] = $entry;
        }

        if (count($items) >= $limit) {
            break;
        }
    }

    return $items;
}

function parseFeedItems(string $xml, string $feedUrl, int $limit): array {
    libxml_use_internal_errors(true);
    $root = simplexml_load_string($xml, 'SimpleXMLElement', LIBXML_NOCDATA | LIBXML_NONET);
    libxml_clear_errors();
    if (!$root instanceof SimpleXMLElement) {
        return [];
    }

    $rootName = strtolower($root->getName());
    if ($rootName === 'rss') {
        return parseRssFeed($root, $feedUrl, $limit);
    }
    if ($rootName === 'feed') {
        return parseAtomFeed($root, $feedUrl, $limit);
    }

    return [];
}

function fetchRemoteFeed(string $url): array {
    $timeout = 10;
    $userAgent = 'RadioAccentNewsFeed/1.0';

    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        if ($ch !== false) {
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_FOLLOWLOCATION => true,
                CURLOPT_MAXREDIRS => 5,
                CURLOPT_CONNECTTIMEOUT => $timeout,
                CURLOPT_TIMEOUT => $timeout,
                CURLOPT_USERAGENT => $userAgent,
                CURLOPT_HTTPHEADER => ['Accept: application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.1']
            ]);
            $body = curl_exec($ch);
            $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
            $error = curl_error($ch);
            curl_close($ch);

            if (is_string($body) && $body !== '' && $status >= 200 && $status < 400) {
                return ['ok' => true, 'body' => $body];
            }

            return ['ok' => false, 'error' => $error !== '' ? $error : ('HTTP ' . $status)];
        }
    }

    $context = stream_context_create([
        'http' => [
            'timeout' => $timeout,
            'ignore_errors' => true,
            'header' => "User-Agent: {$userAgent}\r\nAccept: application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.1\r\n"
        ]
    ]);

    $body = @file_get_contents($url, false, $context);
    if (is_string($body) && $body !== '') {
        return ['ok' => true, 'body' => $body];
    }

    return ['ok' => false, 'error' => 'Feed kon niet opgehaald worden.'];
}

$contentFile = __DIR__ . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'content.json';
$settings = readNewsFeedSettings($contentFile);
$cachePath = cacheFilePath();
$cache = readFeedCache($cachePath);
$settingsHash = sha1(json_encode($settings, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: '');

if (!$settings['enabled'] || $settings['url'] === '') {
    respond(200, [
        'ok' => true,
        'data' => [
            'enabled' => false,
            'source' => 'cms',
            'items' => []
        ]
    ]);
}

$cacheAgeSeconds = $settings['cacheMinutes'] * 60;
$cacheTimestamp = isset($cache['fetchedAt']) ? strtotime((string) $cache['fetchedAt']) : false;
$hasFreshCache = is_array($cache)
    && (($cache['settingsHash'] ?? '') === $settingsHash)
    && is_int($cacheTimestamp)
    && $cacheTimestamp > 0
    && (time() - $cacheTimestamp) < $cacheAgeSeconds;

if ($hasFreshCache) {
    respond(200, [
        'ok' => true,
        'data' => array_merge($cache['data'], [
            'enabled' => true,
            'cached' => true
        ])
    ]);
}

$remote = fetchRemoteFeed($settings['url']);
if (!($remote['ok'] ?? false)) {
    if (is_array($cache) && (($cache['settingsHash'] ?? '') === $settingsHash) && is_array($cache['data'] ?? null)) {
        respond(200, [
            'ok' => true,
            'data' => array_merge($cache['data'], [
                'enabled' => true,
                'cached' => true,
                'stale' => true,
                'error' => (string) ($remote['error'] ?? 'Feed tijdelijk onbereikbaar.')
            ])
        ]);
    }

    respond(502, [
        'ok' => false,
        'error' => (string) ($remote['error'] ?? 'Feed tijdelijk onbereikbaar.'),
        'data' => [
            'enabled' => true,
            'source' => 'rss',
            'items' => []
        ]
    ]);
}

$items = parseFeedItems((string) $remote['body'], $settings['url'], (int) $settings['limit']);
$payload = [
    'settingsHash' => $settingsHash,
    'fetchedAt' => gmdate('c'),
    'data' => [
        'enabled' => true,
        'source' => 'rss',
        'items' => $items,
        'cached' => false
    ]
];
writeFeedCache($cachePath, $payload);

respond(200, [
    'ok' => true,
    'data' => $payload['data']
]);
