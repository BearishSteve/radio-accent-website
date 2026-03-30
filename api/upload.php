<?php
declare(strict_types=1);

require_once __DIR__ . DIRECTORY_SEPARATOR . 'admin-auth.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

const RADIO_ACCENT_UPLOAD_MAX_BYTES = 4_000_000;

function uploadRespond(int $status, array $payload): void {
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function uploadEnsureDirectory(string $dir): bool {
    return is_dir($dir) || mkdir($dir, 0775, true) || is_dir($dir);
}

function uploadSlug(string $value): string {
    $normalized = preg_replace('/[^a-z0-9]+/i', '-', trim($value));
    return trim((string) $normalized, '-') ?: 'bestand';
}

if (!radioAccentAdminIsAuthenticated()) {
    uploadRespond(401, ['ok' => false, 'error' => 'Admin sessie verlopen. Log opnieuw in.']);
}

if (strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    uploadRespond(405, ['ok' => false, 'error' => 'Method not allowed']);
}

$upload = $_FILES['file'] ?? null;
if (!is_array($upload) || (int) ($upload['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
    uploadRespond(400, ['ok' => false, 'error' => 'Geen geldig bestand ontvangen.']);
}

$size = (int) ($upload['size'] ?? 0);
if ($size <= 0 || $size > RADIO_ACCENT_UPLOAD_MAX_BYTES) {
    uploadRespond(400, ['ok' => false, 'error' => 'Bestand is leeg of te groot.']);
}

$tmpName = (string) ($upload['tmp_name'] ?? '');
$originalName = trim((string) ($upload['name'] ?? 'upload'));

$finfo = function_exists('finfo_open') ? finfo_open(FILEINFO_MIME_TYPE) : false;
$mime = $finfo ? (string) finfo_file($finfo, $tmpName) : '';
if ($finfo) {
    finfo_close($finfo);
}

$allowed = [
    'image/jpeg' => 'jpg',
    'image/png' => 'png',
    'image/webp' => 'webp',
    'image/gif' => 'gif'
];

if (!isset($allowed[$mime])) {
    uploadRespond(400, ['ok' => false, 'error' => 'Alleen JPG, PNG, WEBP en GIF zijn toegestaan.']);
}

$projectRoot = dirname(__DIR__);
$monthDir = gmdate('Y-m');
$targetDir = $projectRoot . DIRECTORY_SEPARATOR . 'assets' . DIRECTORY_SEPARATOR . 'uploads' . DIRECTORY_SEPARATOR . $monthDir;
if (!uploadEnsureDirectory($targetDir)) {
    uploadRespond(500, ['ok' => false, 'error' => 'Uploadmap kon niet aangemaakt worden.']);
}

try {
    $suffix = substr(bin2hex(random_bytes(5)), 0, 10);
} catch (Throwable $exception) {
    $suffix = substr(sha1(uniqid('', true)), 0, 10);
}

$filename = uploadSlug(pathinfo($originalName, PATHINFO_FILENAME)) . '-' . $suffix . '.' . $allowed[$mime];
$targetFile = $targetDir . DIRECTORY_SEPARATOR . $filename;

if (!move_uploaded_file($tmpName, $targetFile)) {
    uploadRespond(500, ['ok' => false, 'error' => 'Upload kon niet opgeslagen worden.']);
}

$relativeUrl = 'assets/uploads/' . $monthDir . '/' . $filename;
uploadRespond(200, [
    'ok' => true,
    'data' => [
        'url' => $relativeUrl,
        'name' => $filename,
        'size' => filesize($targetFile) ?: 0
    ]
]);
