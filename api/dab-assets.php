<?php
declare(strict_types=1);

const RADIO_ACCENT_DAB_RENDERER_VERSION = '20260327a';
const RADIO_ACCENT_DAB_TARGET_BYTES = 15 * 1024;
const RADIO_ACCENT_DAB_TARGET_MAX_BYTES = 16 * 1024;
const RADIO_ACCENT_DAB_MIN_SIDE = 180;
const RADIO_ACCENT_DAB_INITIAL_SIDE = 240;

function radioAccentDefaultMetadataDir(string $projectRoot): string {
    return $projectRoot . DIRECTORY_SEPARATOR . 'metadata';
}

function radioAccentDabTrackVersion(array $state): string {
    $track = is_array($state['track'] ?? null) ? $state['track'] : [];
    foreach (['updatedAt', 'startedAt', 'id'] as $field) {
        $value = trim((string) ($track[$field] ?? ''));
        if ($value !== '') {
            return $value . '|' . RADIO_ACCENT_DAB_RENDERER_VERSION;
        }
    }

    return sha1((json_encode($state, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: '') . '|' . RADIO_ACCENT_DAB_RENDERER_VERSION);
}

function radioAccentDabBuildTitle(array $track): string {
    $artist = trim((string) ($track['artist'] ?? ''));
    $title = trim((string) ($track['title'] ?? ''));
    if ($artist !== '' && $title !== '') {
        return $artist . ' - ' . $title;
    }

    return $title !== '' ? $title : ($artist !== '' ? $artist : 'Radio Accent');
}

function radioAccentDabDefaultMeta(array $overrides = []): array {
    return array_merge([
        'type' => 'track',
        'artist_slide_enabled' => false,
        'nowplaying_stale' => false,
        'forced_artist' => false,
        'artist_fresh' => true,
        'promo_deferred' => false,
        'interrupt_guard_active' => false,
        'interrupt_guard_phase' => 'none',
        'interrupt_guard_remaining_sec' => 0,
        'interrupt_guard_track_sec' => 0,
        'interrupt_guard_artist_sec' => 0,
        'generated_image' => false,
        'generator_status' => 'fallback'
    ], $overrides);
}

function radioAccentReadJsonFile(string $file, array $fallback = []): array {
    if (!is_file($file)) {
        return $fallback;
    }

    $raw = file_get_contents($file);
    if ($raw === false) {
        return $fallback;
    }

    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : $fallback;
}

function radioAccentWriteJsonFile(string $file, array $payload): bool {
    $dir = dirname($file);
    if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) {
        return false;
    }

    $json = json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false) {
        return false;
    }

    return file_put_contents($file, $json, LOCK_EX) !== false;
}

function radioAccentWriteBinaryFile(string $file, string $binary): bool {
    $dir = dirname($file);
    if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) {
        return false;
    }

    return file_put_contents($file, $binary, LOCK_EX) !== false;
}

function radioAccentEncodeJpegBinary($image, int $quality): string {
    ob_start();
    imagejpeg($image, null, $quality);
    $binary = ob_get_clean();
    return is_string($binary) ? $binary : '';
}

function radioAccentCopyImageResource($source, int $width, int $height) {
    $copy = imagecreatetruecolor($width, $height);
    if ($copy === false) {
        return null;
    }

    imagecopy($copy, $source, 0, 0, 0, 0, $width, $height);
    return $copy;
}

function radioAccentResizeImageResource($source, int $targetSide) {
    $sourceWidth = imagesx($source);
    $sourceHeight = imagesy($source);
    $resized = imagecreatetruecolor($targetSide, $targetSide);
    if ($resized === false) {
        return null;
    }

    imagecopyresampled($resized, $source, 0, 0, 0, 0, $targetSide, $targetSide, $sourceWidth, $sourceHeight);
    return $resized;
}

function radioAccentEncodeSizedJpeg($canvas): array {
    $bestBinary = '';
    $bestQuality = 0;
    $bestSide = imagesx($canvas);
    $bestDistance = PHP_INT_MAX;

    for ($side = imagesx($canvas); $side >= RADIO_ACCENT_DAB_MIN_SIDE; $side -= 20) {
        $working = $side === imagesx($canvas)
            ? radioAccentCopyImageResource($canvas, imagesx($canvas), imagesy($canvas))
            : radioAccentResizeImageResource($canvas, $side);

        if (!$working) {
            continue;
        }

        for ($quality = 82; $quality >= 32; $quality -= 4) {
            $binary = radioAccentEncodeJpegBinary($working, $quality);
            if ($binary === '') {
                continue;
            }

            $size = strlen($binary);
            $distance = abs($size - RADIO_ACCENT_DAB_TARGET_BYTES);
            if (
                $bestBinary === ''
                || ($size <= RADIO_ACCENT_DAB_TARGET_MAX_BYTES && $distance < $bestDistance)
                || ($bestDistance > 0 && $size <= RADIO_ACCENT_DAB_TARGET_MAX_BYTES && $distance <= $bestDistance)
                || ($bestBinary !== '' && strlen($bestBinary) > RADIO_ACCENT_DAB_TARGET_MAX_BYTES && $distance < $bestDistance)
            ) {
                $bestBinary = $binary;
                $bestQuality = $quality;
                $bestSide = $side;
                $bestDistance = $distance;
            }

            if ($size <= RADIO_ACCENT_DAB_TARGET_MAX_BYTES && $distance <= 1024) {
                imagedestroy($working);
                return [
                    'binary' => $binary,
                    'quality' => $quality,
                    'side' => $side,
                    'bytes' => $size
                ];
            }
        }

        imagedestroy($working);
    }

    return [
        'binary' => $bestBinary,
        'quality' => $bestQuality,
        'side' => $bestSide,
        'bytes' => strlen($bestBinary)
    ];
}

function radioAccentResolveLocalFile(string $projectRoot, string $value): string {
    $trimmed = trim($value);
    if ($trimmed === '') {
        return '';
    }

    if (preg_match('~^[a-z]+://~i', $trimmed)) {
        return '';
    }

    $normalized = str_replace(['/', '\\'], DIRECTORY_SEPARATOR, ltrim($trimmed, '/\\'));
    $candidate = $projectRoot . DIRECTORY_SEPARATOR . $normalized;
    return is_file($candidate) ? $candidate : '';
}

function radioAccentResolveOptionalPath(string $projectRoot, string $value): string {
    $trimmed = trim($value);
    if ($trimmed === '') {
        return '';
    }

    if (preg_match('~^[a-zA-Z]:[\\\\/]~', $trimmed) || str_starts_with($trimmed, DIRECTORY_SEPARATOR)) {
        return is_file($trimmed) ? $trimmed : '';
    }

    return radioAccentResolveLocalFile($projectRoot, $trimmed);
}

function radioAccentKeywordCoverRules(string $projectRoot): array {
    static $cache = [];
    if (array_key_exists($projectRoot, $cache)) {
        return $cache[$projectRoot];
    }

    $contentFile = $projectRoot . DIRECTORY_SEPARATOR . 'api' . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'content.json';
    $content = radioAccentReadJsonFile($contentFile, []);
    $rules = [];

    foreach (($content['keywordCovers'] ?? []) as $item) {
        if (!is_array($item)) {
            continue;
        }

        $keywords = array_values(array_filter(array_map(static function ($keyword): string {
            return trim((string) $keyword);
        }, is_array($item['keywords'] ?? null) ? $item['keywords'] : [])));
        $cover = trim((string) ($item['cover'] ?? ''));

        if ($keywords && $cover !== '') {
            $rules[] = [
                'keywords' => $keywords,
                'cover' => $cover
            ];
        }
    }

    $cache[$projectRoot] = $rules;
    return $rules;
}

function radioAccentFindKeywordCover(string $projectRoot, array $track): string {
    $haystack = strtolower(trim(
        trim((string) ($track['artist'] ?? '')) . ' ' . trim((string) ($track['title'] ?? ''))
    ));
    if ($haystack === '') {
        return '';
    }

    foreach (radioAccentKeywordCoverRules($projectRoot) as $rule) {
        foreach ($rule['keywords'] as $keyword) {
            $needle = strtolower(trim((string) $keyword));
            if ($needle !== '' && str_contains($haystack, $needle)) {
                return trim((string) ($rule['cover'] ?? ''));
            }
        }
    }

    return '';
}

function radioAccentNormalizeRemoteUrl(string $url): string {
    $parts = @parse_url($url);
    if (!is_array($parts) || empty($parts['scheme']) || empty($parts['host'])) {
        return $url;
    }

    $normalized = $parts['scheme'] . '://';
    if (isset($parts['user'])) {
        $normalized .= $parts['user'];
        if (isset($parts['pass'])) {
            $normalized .= ':' . $parts['pass'];
        }
        $normalized .= '@';
    }

    $normalized .= $parts['host'];
    if (isset($parts['port'])) {
        $normalized .= ':' . $parts['port'];
    }

    $path = (string) ($parts['path'] ?? '');
    if ($path !== '') {
        $segments = explode('/', $path);
        $segments = array_map(static function (string $segment): string {
            return rawurlencode(rawurldecode($segment));
        }, $segments);
        $normalized .= implode('/', $segments);
    }

    if (isset($parts['query'])) {
        $normalized .= '?' . $parts['query'];
    }

    if (isset($parts['fragment'])) {
        $normalized .= '#' . $parts['fragment'];
    }

    return $normalized;
}

function radioAccentFetchBinary(string $projectRoot, string $source): string {
    $trimmed = html_entity_decode(trim($source), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    if ($trimmed === '') {
        return '';
    }

    if (str_starts_with($trimmed, '//')) {
        $trimmed = 'https:' . $trimmed;
    }

    if (preg_match('~^https?://~i', $trimmed)) {
        $trimmed = radioAccentNormalizeRemoteUrl($trimmed);
        $headers = "User-Agent: RadioAccentDabGenerator/1.0\r\nAccept: image/jpeg,image/png,image/webp,image/gif,image/*;q=0.8,*/*;q=0.5\r\n";
        $context = stream_context_create([
            'http' => [
                'timeout' => 8,
                'follow_location' => 1,
                'header' => $headers
            ],
            'ssl' => [
                'verify_peer' => true,
                'verify_peer_name' => true
            ]
        ]);
        $data = @file_get_contents($trimmed, false, $context);
        if ($data !== false) {
            return $data;
        }

        if (function_exists('curl_init')) {
            foreach ([[true, 2], [false, 0]] as [$verifyPeer, $verifyHost]) {
                $ch = curl_init($trimmed);
                if ($ch !== false) {
                    curl_setopt_array($ch, [
                        CURLOPT_RETURNTRANSFER => true,
                        CURLOPT_FOLLOWLOCATION => true,
                        CURLOPT_TIMEOUT => 8,
                        CURLOPT_CONNECTTIMEOUT => 5,
                        CURLOPT_USERAGENT => 'RadioAccentDabGenerator/1.0',
                        CURLOPT_HTTPHEADER => ['Accept: image/jpeg,image/png,image/webp,image/gif,image/*;q=0.8,*/*;q=0.5'],
                        CURLOPT_SSL_VERIFYPEER => $verifyPeer,
                        CURLOPT_SSL_VERIFYHOST => $verifyHost
                    ]);
                    $curlData = curl_exec($ch);
                    $httpCode = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
                    curl_close($ch);

                    if (is_string($curlData) && $curlData !== '' && $httpCode >= 200 && $httpCode < 400) {
                        return $curlData;
                    }
                }
            }
        }

        $relaxedContext = stream_context_create([
            'http' => [
                'timeout' => 8,
                'follow_location' => 1,
                'header' => $headers
            ],
            'ssl' => [
                'verify_peer' => false,
                'verify_peer_name' => false
            ]
        ]);
        $relaxedData = @file_get_contents($trimmed, false, $relaxedContext);
        return $relaxedData === false ? '' : $relaxedData;

    }

    $localFile = radioAccentResolveLocalFile($projectRoot, $trimmed);
    if ($localFile === '') {
        return '';
    }

    $data = @file_get_contents($localFile);
    return $data === false ? '' : $data;
}

function radioAccentDecodeRasterBinary(string $binary) {
    if (!function_exists('imagecreatefromstring')) {
        return null;
    }

    $imageInfo = function_exists('getimagesizefromstring') ? @getimagesizefromstring($binary) : false;
    $mime = strtolower((string) ($imageInfo['mime'] ?? ''));

    if ($mime === 'image/avif') {
        return null;
    }

    if ($mime === 'image/webp' && function_exists('imagecreatefromwebp')) {
        $tempFile = tempnam(sys_get_temp_dir(), 'rac');
        if ($tempFile === false) {
            return null;
        }

        file_put_contents($tempFile, $binary);
        $image = @imagecreatefromwebp($tempFile);
        @unlink($tempFile);
        return $image === false ? null : $image;
    }

    $image = @imagecreatefromstring($binary);
    return $image === false ? null : $image;
}

function radioAccentBinaryImageExtension(string $binary): string {
    $imageInfo = function_exists('getimagesizefromstring') ? @getimagesizefromstring($binary) : false;
    $mime = strtolower((string) ($imageInfo['mime'] ?? ''));

    return match ($mime) {
        'image/jpeg', 'image/jpg' => 'jpg',
        'image/png' => 'png',
        'image/webp' => 'webp',
        'image/gif' => 'gif',
        default => ''
    };
}

function radioAccentLooksLikeSvg(string $binary, string $source): bool {
    $sample = strtolower(substr(ltrim($binary), 0, 256));
    if (strpos($sample, '<svg') !== false) {
        return true;
    }

    return (bool) preg_match('~\.svg(?:$|\?)~i', $source);
}

function radioAccentLoadRasterImage(string $projectRoot, string $source) {
    if (!function_exists('imagecreatefromstring')) {
        return null;
    }

    $binary = radioAccentFetchBinary($projectRoot, $source);
    if ($binary === '' || radioAccentLooksLikeSvg($binary, $source)) {
        return null;
    }

    return radioAccentDecodeRasterBinary($binary);
}

function radioAccentWrapText(string $text, int $maxChars, int $maxLines): array {
    $text = trim(preg_replace('/\s+/', ' ', $text) ?? '');
    if ($text === '') {
        return [];
    }

    $words = preg_split('/\s+/', $text) ?: [];
    $lines = [];
    $current = '';

    foreach ($words as $word) {
        $candidate = $current === '' ? $word : $current . ' ' . $word;
        if (strlen($candidate) <= $maxChars) {
            $current = $candidate;
            continue;
        }

        if ($current !== '') {
            $lines[] = $current;
            $current = $word;
            if (count($lines) >= $maxLines) {
                break;
            }
            continue;
        }

        $lines[] = substr($word, 0, $maxChars);
        $current = substr($word, $maxChars);
        if (count($lines) >= $maxLines) {
            break;
        }
    }

    if ($current !== '' && count($lines) < $maxLines) {
        $lines[] = $current;
    }

    $joined = implode(' ', $words);
    if ($lines && implode(' ', $lines) !== $joined) {
        $lastIndex = count($lines) - 1;
        $line = $lines[$lastIndex];
        $maxLineLength = max(1, $maxChars - 3);
        if (strlen($line) > $maxLineLength) {
            $line = substr($line, 0, $maxLineLength);
        }
        $lines[$lastIndex] = rtrim($line) . '...';
    }

    return array_slice($lines, 0, $maxLines);
}

function radioAccentDrawTextLine($image, int $font, int $x, int $y, string $text, int $color, int $shadow): void {
    imagestring($image, $font, $x + 1, $y + 1, $text, $shadow);
    imagestring($image, $font, $x, $y, $text, $color);
}

function radioAccentResolveFontFiles(string $projectRoot, array $options): array {
    return [
        'artist' => radioAccentResolveOptionalPath($projectRoot, (string) ($options['artistFont'] ?? 'assets/fonts/Teko-Bold.ttf')),
        'title' => radioAccentResolveOptionalPath($projectRoot, (string) ($options['titleFont'] ?? 'assets/fonts/Manrope-SemiBold.ttf')),
        'badge' => radioAccentResolveOptionalPath($projectRoot, (string) ($options['badgeFont'] ?? 'assets/fonts/Manrope-Bold.ttf'))
    ];
}

function radioAccentMeasureTextWidth(string $text, string $fontFile, float $fontSize): int {
    $box = imagettfbbox($fontSize, 0, $fontFile, $text);
    if (!is_array($box)) {
        return 0;
    }

    return (int) abs($box[2] - $box[0]);
}

function radioAccentWrapTtfText(string $text, string $fontFile, float $fontSize, int $maxWidth, int $maxLines): array {
    $text = trim(preg_replace('/\s+/', ' ', $text) ?? '');
    if ($text === '') {
        return [];
    }

    $words = preg_split('/\s+/', $text) ?: [];
    $lines = [];
    $current = '';

    foreach ($words as $word) {
        $candidate = $current === '' ? $word : $current . ' ' . $word;
        if (radioAccentMeasureTextWidth($candidate, $fontFile, $fontSize) <= $maxWidth) {
            $current = $candidate;
            continue;
        }

        if ($current !== '') {
            $lines[] = $current;
            $current = $word;
            if (count($lines) >= $maxLines) {
                break;
            }
            continue;
        }

        $fragment = $word;
        while ($fragment !== '') {
            $cut = strlen($fragment);
            while ($cut > 1 && radioAccentMeasureTextWidth(substr($fragment, 0, $cut), $fontFile, $fontSize) > $maxWidth) {
                $cut--;
            }

            $lines[] = substr($fragment, 0, $cut);
            $fragment = substr($fragment, $cut);
            if (count($lines) >= $maxLines) {
                break 2;
            }
        }

        $current = '';
    }

    if ($current !== '' && count($lines) < $maxLines) {
        $lines[] = $current;
    }

    $joined = implode(' ', $words);
    if ($lines && implode(' ', $lines) !== $joined) {
        $lastIndex = count($lines) - 1;
        $line = $lines[$lastIndex];
        while ($line !== '' && radioAccentMeasureTextWidth($line . '...', $fontFile, $fontSize) > $maxWidth) {
            $line = substr($line, 0, max(0, strlen($line) - 1));
        }
        $lines[$lastIndex] = rtrim($line) . '...';
    }

    return array_slice($lines, 0, $maxLines);
}

function radioAccentDrawTtfLine($image, string $fontFile, float $fontSize, int $x, int $baselineY, string $text, int $color, int $shadow): void {
    imagettftext($image, $fontSize, 0, $x + 2, $baselineY + 2, $shadow, $fontFile, $text);
    imagettftext($image, $fontSize, 0, $x, $baselineY, $color, $fontFile, $text);
}

function radioAccentImageFilledRoundedRectangle($image, int $x1, int $y1, int $x2, int $y2, int $color, int $radius = 10): void {
    imagefilledrectangle($image, $x1 + $radius, $y1, $x2 - $radius, $y2, $color);
    imagefilledrectangle($image, $x1, $y1 + $radius, $x2, $y2 - $radius, $color);
    imagefilledellipse($image, $x1 + $radius, $y1 + $radius, $radius * 2, $radius * 2, $color);
    imagefilledellipse($image, $x2 - $radius, $y1 + $radius, $radius * 2, $radius * 2, $color);
    imagefilledellipse($image, $x1 + $radius, $y2 - $radius, $radius * 2, $radius * 2, $color);
    imagefilledellipse($image, $x2 - $radius, $y2 - $radius, $radius * 2, $radius * 2, $color);
}

function radioAccentCreateDabJpg(string $projectRoot, array $track, string $outputFile, array $options = []): bool {
    if (!function_exists('imagecreatetruecolor')) {
        return false;
    }

    $keywordCover = radioAccentFindKeywordCover($projectRoot, $track);
    $fallbackRaster = 'assets/600x600.png';
    $sourceCandidates = [
        $keywordCover,
        trim((string) ($track['cover'] ?? '')),
        $fallbackRaster,
        'assets/logo_dab.png'
    ];

    $source = null;
    foreach ($sourceCandidates as $candidate) {
        $source = radioAccentLoadRasterImage($projectRoot, $candidate);
        if ($source) {
            break;
        }
    }

    if (!$source) {
        return false;
    }

    $width = imagesx($source);
    $height = imagesy($source);
    $side = min($width, $height);
    $srcX = (int) floor(($width - $side) / 2);
    $srcY = (int) floor(($height - $side) / 2);

    $canvas = imagecreatetruecolor(RADIO_ACCENT_DAB_INITIAL_SIDE, RADIO_ACCENT_DAB_INITIAL_SIDE);
    if ($canvas === false) {
        imagedestroy($source);
        return false;
    }

    imagecopyresampled($canvas, $source, 0, 0, $srcX, $srcY, RADIO_ACCENT_DAB_INITIAL_SIDE, RADIO_ACCENT_DAB_INITIAL_SIDE, $side, $side);
    imagedestroy($source);

    $shadow = imagecolorallocate($canvas, 3, 10, 18);
    $white = imagecolorallocate($canvas, 255, 255, 255);
    $soft = imagecolorallocate($canvas, 223, 235, 248);

    $fonts = radioAccentResolveFontFiles($projectRoot, $options);
    $canUseTtf = function_exists('imagettftext')
        && function_exists('imagettfbbox')
        && $fonts['artist'] !== ''
        && $fonts['title'] !== '';

    $artist = strtoupper(trim((string) ($track['artist'] ?? '')));
    $title = trim((string) ($track['title'] ?? ''));

    if ($canUseTtf) {
        $artistLines = radioAccentWrapTtfText($artist, $fonts['artist'], 21, 208, 2);
        $titleLines = radioAccentWrapTtfText($title, $fonts['title'], 12, 208, 2);
    } else {
        $artistLines = radioAccentWrapText($artist, 18, 2);
        $titleLines = radioAccentWrapText($title, 22, 2);
    }

    if (!$artistLines && !$titleLines) {
        $artistLines = ['RADIO ACCENT'];
    }

    if ($canUseTtf) {
        $artistLineHeight = 24;
        $titleLineHeight = 15;
        $titleLineCount = count($titleLines);
        $totalHeight = (count($artistLines) * $artistLineHeight) + ($titleLineCount * $titleLineHeight);
        $topPadding = $titleLineCount > 1 ? 20 : 18;
        $bottomPadding = $titleLineCount > 1 ? 28 : 12;
        $panelMinTop = $titleLineCount > 1 ? 146 : 160;
        $panelTop = max($panelMinTop, RADIO_ACCENT_DAB_INITIAL_SIDE - $totalHeight - $topPadding - $bottomPadding);
        $currentY = $panelTop + $topPadding;

        for ($y = $panelTop; $y < RADIO_ACCENT_DAB_INITIAL_SIDE; $y++) {
            $progress = ($y - $panelTop) / max(1, RADIO_ACCENT_DAB_INITIAL_SIDE - $panelTop);
            $alpha = (int) round(max(4, 120 - ($progress * 116)));
            $overlay = imagecolorallocatealpha($canvas, 2, 8, 18, $alpha);
            imageline($canvas, 0, $y, RADIO_ACCENT_DAB_INITIAL_SIDE - 1, $y, $overlay);
        }

        foreach ($artistLines as $line) {
            radioAccentDrawTtfLine($canvas, $fonts['artist'], 21, 14, $currentY, $line, $white, $shadow);
            $currentY += $artistLineHeight;
        }

        foreach ($titleLines as $line) {
            radioAccentDrawTtfLine($canvas, $fonts['title'], 12, 14, $currentY, $line, $soft, $shadow);
            $currentY += $titleLineHeight;
        }
    } else {
        $artistLineHeight = 16;
        $titleLineHeight = 15;
        $titleLineCount = count($titleLines);
        $totalHeight = (count($artistLines) * $artistLineHeight) + ($titleLineCount * $titleLineHeight);
        $topPadding = $titleLineCount > 1 ? 14 : 12;
        $bottomPadding = $titleLineCount > 1 ? 22 : 10;
        $panelMinTop = $titleLineCount > 1 ? 156 : 168;
        $panelTop = max($panelMinTop, RADIO_ACCENT_DAB_INITIAL_SIDE - $totalHeight - $topPadding - $bottomPadding);
        $currentY = $panelTop + $topPadding;

        for ($y = $panelTop; $y < RADIO_ACCENT_DAB_INITIAL_SIDE; $y++) {
            $progress = ($y - $panelTop) / max(1, RADIO_ACCENT_DAB_INITIAL_SIDE - $panelTop);
            $alpha = (int) round(max(4, 120 - ($progress * 116)));
            $overlay = imagecolorallocatealpha($canvas, 2, 8, 18, $alpha);
            imageline($canvas, 0, $y, RADIO_ACCENT_DAB_INITIAL_SIDE - 1, $y, $overlay);
        }

        foreach ($artistLines as $line) {
            radioAccentDrawTextLine($canvas, 5, 14, $currentY, $line, $white, $shadow);
            $currentY += $artistLineHeight;
        }

        foreach ($titleLines as $line) {
            radioAccentDrawTextLine($canvas, 4, 14, $currentY, $line, $soft, $shadow);
            $currentY += $titleLineHeight;
        }
    }

    $encoded = radioAccentEncodeSizedJpeg($canvas);
    imagedestroy($canvas);
    if (($encoded['binary'] ?? '') === '') {
        return false;
    }

    return radioAccentWriteBinaryFile($outputFile, (string) $encoded['binary']);
}

function radioAccentCacheDabSourceAsset(string $projectRoot, array $track, string $metadataDir, string $version): string {
    $keywordCover = radioAccentFindKeywordCover($projectRoot, $track);
    $sourceCandidates = [
        $keywordCover,
        trim((string) ($track['cover'] ?? '')),
        'assets/600x600.png',
        'assets/logo_dab.png'
    ];

    foreach ($sourceCandidates as $candidate) {
        $binary = radioAccentFetchBinary($projectRoot, $candidate);
        if ($binary === '' || radioAccentLooksLikeSvg($binary, (string) $candidate)) {
            continue;
        }

        $extension = radioAccentBinaryImageExtension($binary);
        if ($extension === '') {
            continue;
        }

        $filename = 'nowplaying_' . preg_replace('/[^0-9a-z]+/i', '', $version) . '.' . $extension;
        $outputFile = $metadataDir . DIRECTORY_SEPARATOR . $filename;
        if (radioAccentWriteBinaryFile($outputFile, $binary)) {
            return $filename;
        }
    }

    return '';
}

function radioAccentPruneGeneratedDabImages(string $metadataDir, int $keep = 12): void {
    $files = glob($metadataDir . DIRECTORY_SEPARATOR . 'nowplaying_*.*');
    if (!is_array($files) || count($files) <= $keep) {
        return;
    }

    usort($files, static function (string $a, string $b): int {
        return filemtime($b) <=> filemtime($a);
    });

    foreach (array_slice($files, $keep) as $file) {
        @unlink($file);
    }
}

function radioAccentBuildCoverReference(string $filename, string $metadataPublicPath): string {
    $trimmed = trim(str_replace('\\', '/', $metadataPublicPath), '/');
    if ($trimmed === '') {
        return $filename;
    }

    return $trimmed . '/' . $filename;
}

function radioAccentDabFileWithinTarget(string $file): bool {
    if (!is_file($file)) {
        return false;
    }

    $bytes = (int) filesize($file);
    return $bytes > 0 && $bytes <= RADIO_ACCENT_DAB_TARGET_MAX_BYTES;
}

function radioAccentGenerateDabAssets(array $state, string $projectRoot, array $options = []): array {
    $track = is_array($state['track'] ?? null) ? $state['track'] : [];
    $title = radioAccentDabBuildTitle($track);
    $version = radioAccentDabTrackVersion($state);
    $pubDate = date(DATE_RSS);

    $metadataDir = trim((string) ($options['metadataDir'] ?? ''));
    if ($metadataDir === '') {
        $metadataDir = radioAccentDefaultMetadataDir($projectRoot);
    }

    $manifestFile = $projectRoot . DIRECTORY_SEPARATOR . 'api' . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'dab-nowplaying.json';
    $metadataPublicPath = (string) ($options['metadataPublicPath'] ?? '');

    $coverSource = trim((string) ($track['cover'] ?? ''));
    $relativeCover = '';
    $generated = false;
    $generatorStatus = 'fallback';

    if (!is_dir($metadataDir)) {
        @mkdir($metadataDir, 0775, true);
    }

    if (is_dir($metadataDir)) {
        $filename = 'nowplaying_' . preg_replace('/[^0-9a-z]+/i', '', $version) . '.jpg';
        $outputFile = $metadataDir . DIRECTORY_SEPARATOR . $filename;

        if (radioAccentDabFileWithinTarget($outputFile)) {
            $generated = true;
            $generatorStatus = 'generated';
            $relativeCover = radioAccentBuildCoverReference($filename, $metadataPublicPath);
            radioAccentPruneGeneratedDabImages($metadataDir);
        } else {
            $generated = radioAccentCreateDabJpg($projectRoot, $track, $outputFile, $options);
            if ($generated && is_file($outputFile)) {
                $generatorStatus = 'generated';
                $relativeCover = radioAccentBuildCoverReference($filename, $metadataPublicPath);
                radioAccentPruneGeneratedDabImages($metadataDir);
            } else {
                $cachedFilename = radioAccentCacheDabSourceAsset($projectRoot, $track, $metadataDir, $version);
                if ($cachedFilename !== '') {
                    $relativeCover = radioAccentBuildCoverReference($cachedFilename, $metadataPublicPath);
                    $generatorStatus = function_exists('imagecreatetruecolor') ? 'source_cached' : 'gd_missing_source_cached';
                    radioAccentPruneGeneratedDabImages($metadataDir);
                } elseif (!function_exists('imagecreatetruecolor')) {
                    $generatorStatus = 'gd_missing';
                }
            }
        }
    }

    $manifest = [
        'version' => $version,
        'title' => $title,
        'cover' => $relativeCover !== '' ? $relativeCover : $coverSource,
        'pubDate' => $pubDate,
        'track' => [
            'artist' => trim((string) ($track['artist'] ?? '')),
            'title' => trim((string) ($track['title'] ?? '')),
            'cover' => $coverSource
        ],
        'meta' => radioAccentDabDefaultMeta([
            'generated_image' => $generated,
            'generator_status' => $generatorStatus,
            'local_cover_cached' => $relativeCover !== '',
            'target_bytes' => RADIO_ACCENT_DAB_TARGET_BYTES,
            'max_target_bytes' => RADIO_ACCENT_DAB_TARGET_MAX_BYTES,
            'cover_bytes' => $relativeCover !== '' && is_file($metadataDir . DIRECTORY_SEPARATOR . basename($relativeCover))
                ? (int) filesize($metadataDir . DIRECTORY_SEPARATOR . basename($relativeCover))
                : 0,
            'source_cover' => $coverSource
        ])
    ];

    radioAccentWriteJsonFile($manifestFile, $manifest);
    return $manifest;
}
