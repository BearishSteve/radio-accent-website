<?php
declare(strict_types=1);

header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

const RADIO_ACCENT_CONTACT_RATE_LIMIT_WINDOW = 3600;
const RADIO_ACCENT_CONTACT_RATE_LIMIT_MAX = 5;

function contactRespondJson(int $status, array $payload): void {
    if (!headers_sent()) {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
    }
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function contactRootPath(): string {
    $scriptName = str_replace('\\', '/', (string) ($_SERVER['SCRIPT_NAME'] ?? ''));
    $apiPos = strpos($scriptName, '/api/');
    if ($apiPos === false) {
        return '/';
    }
    $base = rtrim(substr($scriptName, 0, $apiPos), '/');
    return $base === '' ? '/' : $base;
}

function contactRedirect(string $target): void {
    $base = contactRootPath();
    $location = ($base === '/' ? '' : $base) . '/' . ltrim($target, '/');
    header('Location: ' . $location, true, 303);
    exit;
}

function contactWantsJson(): bool {
    $accept = strtolower((string) ($_SERVER['HTTP_ACCEPT'] ?? ''));
    $requestedWith = strtolower((string) ($_SERVER['HTTP_X_REQUESTED_WITH'] ?? ''));
    $contentType = strtolower((string) ($_SERVER['CONTENT_TYPE'] ?? ''));
    return strpos($accept, 'application/json') !== false
        || $requestedWith === 'xmlhttprequest'
        || strpos($contentType, 'application/json') !== false;
}

function contactFail(int $status, string $message): void {
    if (contactWantsJson()) {
        contactRespondJson($status, ['ok' => false, 'error' => $message]);
    }
    contactRedirect('contact.html?error=1');
}

function contactSuccess(): void {
    if (contactWantsJson()) {
        contactRespondJson(200, ['ok' => true]);
    }
    contactRedirect('contact-verzonden.html');
}

function contactReadPayload(): array {
    $contentType = strtolower((string) ($_SERVER['CONTENT_TYPE'] ?? ''));
    if (strpos($contentType, 'application/json') !== false) {
        $raw = file_get_contents('php://input');
        $decoded = json_decode($raw ?: '', true);
        return is_array($decoded) ? $decoded : [];
    }

    return $_POST;
}

function contactEnsureDirectory(string $dir): bool {
    return is_dir($dir) || mkdir($dir, 0775, true) || is_dir($dir);
}

function contactEnsureProtectedDirectory(string $dir): bool {
    if (!contactEnsureDirectory($dir)) {
        return false;
    }

    $guardFile = $dir . DIRECTORY_SEPARATOR . 'index.php';
    if (!is_file($guardFile)) {
        $guard = "<?php\nhttp_response_code(403);\nexit;\n";
        if (file_put_contents($guardFile, $guard, LOCK_EX) === false) {
            return false;
        }
    }

    return true;
}

function contactRateLimitFile(): string {
    return __DIR__ . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'contact-rate-limit.json';
}

function contactClientKey(): string {
    $address = trim((string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown'));
    return sha1($address);
}

function contactReadRateLimits(): array {
    $file = contactRateLimitFile();
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

function contactWriteRateLimits(array $payload): void {
    $file = contactRateLimitFile();
    $dir = dirname($file);
    if (!contactEnsureDirectory($dir)) {
        return;
    }

    $json = json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false) {
        return;
    }

    file_put_contents($file, $json, LOCK_EX);
}

function contactPruneRateLimits(array $limits): array {
    $cutoff = time() - RADIO_ACCENT_CONTACT_RATE_LIMIT_WINDOW;
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

function contactIsRateLimited(): bool {
    $limits = contactPruneRateLimits(contactReadRateLimits());
    contactWriteRateLimits($limits);
    return count($limits[contactClientKey()] ?? []) >= RADIO_ACCENT_CONTACT_RATE_LIMIT_MAX;
}

function contactRegisterAttempt(): void {
    $limits = contactPruneRateLimits(contactReadRateLimits());
    $key = contactClientKey();
    $attempts = $limits[$key] ?? [];
    $attempts[] = time();
    $limits[$key] = array_values($attempts);
    contactWriteRateLimits($limits);
}

function contactSubmissionDir(): string {
    $customDir = trim((string) getenv('RADIO_ACCENT_CONTACT_STORAGE_DIR'));
    if ($customDir !== '') {
        return rtrim($customDir, "\\/") . DIRECTORY_SEPARATOR . gmdate('Y-m');
    }

    return __DIR__ . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'contact-submissions' . DIRECTORY_SEPARATOR . gmdate('Y-m');
}

function contactStoreSubmission(array $payload): bool {
    $dir = contactSubmissionDir();
    if (!contactEnsureProtectedDirectory($dir)) {
        return false;
    }

    try {
        $suffix = substr(bin2hex(random_bytes(6)), 0, 12);
    } catch (Throwable $exception) {
        $suffix = substr(sha1(uniqid('', true)), 0, 12);
    }

    $file = $dir . DIRECTORY_SEPARATOR . 'contact-' . gmdate('Ymd-His') . '-' . $suffix . '.php';
    $json = json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false) {
        return false;
    }

    $guardedPayload = "<?php\nhttp_response_code(403);\nexit;\n?>\n" . $json . "\n";
    return file_put_contents($file, $guardedPayload, LOCK_EX) !== false;
}

function contactSendMail(array $payload): void {
    if (!function_exists('mail')) {
        return;
    }

    $to = trim((string) (getenv('RADIO_ACCENT_CONTACT_TO') ?: 'info@radioaccent.be'));
    if ($to === '') {
        return;
    }

    $name = (string) ($payload['name'] ?? '');
    $email = (string) ($payload['email'] ?? '');
    $message = (string) ($payload['message'] ?? '');
    $subject = 'Nieuw bericht via radioaccent.be';
    $safeReplyTo = preg_replace('/[\r\n]+/', ' ', trim($email)) ?: '';
    $headers = [
        'Content-Type: text/plain; charset=UTF-8'
    ];
    if ($safeReplyTo !== '') {
        $headers[] = 'Reply-To: ' . $safeReplyTo;
    }

    @mail(
        $to,
        $subject,
        "Naam: {$name}\nE-mail: {$email}\n\n{$message}\n",
        implode("\r\n", $headers)
    );
}

if (strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    contactFail(405, 'Method not allowed');
}

if (contactIsRateLimited()) {
    contactFail(429, 'Te veel berichten verstuurd. Probeer het later opnieuw.');
}

$payload = contactReadPayload();
$honeypot = trim((string) ($payload['website'] ?? ''));
if ($honeypot !== '') {
    contactSuccess();
}

$name = trim((string) ($payload['naam'] ?? $payload['name'] ?? ''));
$email = trim((string) ($payload['email'] ?? ''));
$message = trim((string) ($payload['bericht'] ?? $payload['message'] ?? ''));

if ($name === '' || $email === '' || $message === '') {
    contactFail(400, 'Vul alle velden in.');
}
$nameLength = function_exists('mb_strlen') ? mb_strlen($name, 'UTF-8') : strlen($name);
$messageLength = function_exists('mb_strlen') ? mb_strlen($message, 'UTF-8') : strlen($message);
if ($nameLength > 120 || $messageLength > 5000) {
    contactFail(400, 'Je bericht is te lang.');
}
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    contactFail(400, 'Gebruik een geldig e-mailadres.');
}

contactRegisterAttempt();

$submission = [
    'name' => $name,
    'email' => $email,
    'message' => $message,
    'submittedAt' => gmdate('c'),
    'ipHash' => sha1((string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown')),
    'userAgent' => trim((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''))
];

if (!contactStoreSubmission($submission)) {
    contactFail(500, 'Bericht kon niet opgeslagen worden.');
}

contactSendMail($submission);
contactSuccess();
