<?php
declare(strict_types=1);

const RADIO_ACCENT_ADMIN_SESSION_KEY = 'radio_accent_admin_authenticated';
const RADIO_ACCENT_ADMIN_RATE_LIMIT_WINDOW = 900;
const RADIO_ACCENT_ADMIN_RATE_LIMIT_MAX_ATTEMPTS = 5;

function radioAccentAdminCookiePath(): string {
    $scriptName = str_replace('\\', '/', (string) ($_SERVER['SCRIPT_NAME'] ?? ''));
    if ($scriptName === '') {
        return '/';
    }

    $apiPos = strpos($scriptName, '/api/');
    if ($apiPos === false) {
        return '/';
    }

    $basePath = rtrim(substr($scriptName, 0, $apiPos), '/');
    return $basePath === '' ? '/' : $basePath . '/';
}

function radioAccentAdminStartSession(): void {
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }

    session_name('radio_accent_admin');
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => radioAccentAdminCookiePath(),
        'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
        'httponly' => true,
        'samesite' => 'Lax'
    ]);
    session_start();
}

function radioAccentAdminIsAuthenticated(): bool {
    radioAccentAdminStartSession();
    return !empty($_SESSION[RADIO_ACCENT_ADMIN_SESSION_KEY]);
}

function radioAccentAdminAuthenticate(): void {
    radioAccentAdminStartSession();
    session_regenerate_id(true);
    $_SESSION[RADIO_ACCENT_ADMIN_SESSION_KEY] = [
        'authenticatedAt' => time()
    ];
}

function radioAccentAdminLogout(): void {
    radioAccentAdminStartSession();
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $params = session_get_cookie_params();
        setcookie(session_name(), '', [
            'expires' => time() - 3600,
            'path' => $params['path'] ?? '/',
            'domain' => $params['domain'] ?? '',
            'secure' => (bool) ($params['secure'] ?? false),
            'httponly' => (bool) ($params['httponly'] ?? true),
            'samesite' => $params['samesite'] ?? 'Lax'
        ]);
    }
    session_destroy();
}

function radioAccentAdminPasscodeHash(array $runtimeConfig): string {
    $hash = trim((string) ($runtimeConfig['adminPasscodeHash'] ?? ''));
    if ($hash !== '') {
        return $hash;
    }

    $plain = trim((string) ($runtimeConfig['adminPasscode'] ?? ''));
    if (preg_match('/^\$2[aby]\$|\$argon2/i', $plain) === 1) {
        return $plain;
    }

    return '';
}

function radioAccentAdminVerifyPasscode(string $providedPasscode, array $runtimeConfig): bool {
    $provided = trim($providedPasscode);
    if ($provided === '') {
        return false;
    }

    $hash = radioAccentAdminPasscodeHash($runtimeConfig);
    if ($hash !== '') {
        return password_verify($provided, $hash);
    }

    $plain = trim((string) ($runtimeConfig['adminPasscode'] ?? ''));
    return $plain !== '' && hash_equals($plain, $provided);
}

function radioAccentAdminRateLimitFile(): string {
    return __DIR__ . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'admin-rate-limit.json';
}

function radioAccentAdminEnsureDirectory(string $dir): bool {
    return is_dir($dir) || mkdir($dir, 0775, true) || is_dir($dir);
}

function radioAccentAdminClientKey(): string {
    $address = trim((string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown'));
    $agent = trim((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''));
    return sha1($address . '|' . $agent);
}

function radioAccentAdminReadRateLimits(): array {
    $file = radioAccentAdminRateLimitFile();
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

function radioAccentAdminWriteRateLimits(array $payload): void {
    $file = radioAccentAdminRateLimitFile();
    $dir = dirname($file);
    if (!radioAccentAdminEnsureDirectory($dir)) {
        return;
    }

    $json = json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false) {
        return;
    }

    file_put_contents($file, $json, LOCK_EX);
}

function radioAccentAdminPruneRateLimits(array $limits): array {
    $cutoff = time() - RADIO_ACCENT_ADMIN_RATE_LIMIT_WINDOW;
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

function radioAccentAdminRemainingAttempts(): int {
    $limits = radioAccentAdminPruneRateLimits(radioAccentAdminReadRateLimits());
    radioAccentAdminWriteRateLimits($limits);
    $attempts = $limits[radioAccentAdminClientKey()] ?? [];
    return max(0, RADIO_ACCENT_ADMIN_RATE_LIMIT_MAX_ATTEMPTS - count($attempts));
}

function radioAccentAdminIsRateLimited(): bool {
    return radioAccentAdminRemainingAttempts() <= 0;
}

function radioAccentAdminRegisterFailedAttempt(): int {
    $limits = radioAccentAdminPruneRateLimits(radioAccentAdminReadRateLimits());
    $key = radioAccentAdminClientKey();
    $attempts = $limits[$key] ?? [];
    $attempts[] = time();
    $limits[$key] = array_values($attempts);
    radioAccentAdminWriteRateLimits($limits);
    return max(0, RADIO_ACCENT_ADMIN_RATE_LIMIT_MAX_ATTEMPTS - count($limits[$key]));
}

function radioAccentAdminClearFailedAttempts(): void {
    $limits = radioAccentAdminPruneRateLimits(radioAccentAdminReadRateLimits());
    unset($limits[radioAccentAdminClientKey()]);
    radioAccentAdminWriteRateLimits($limits);
}
