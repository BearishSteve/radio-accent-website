<?php
declare(strict_types=1);

require_once __DIR__ . DIRECTORY_SEPARATOR . 'admin-auth.php';

header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

const RADIO_ACCENT_CONTACT_INBOX_DEFAULT_LIMIT = 100;
const RADIO_ACCENT_CONTACT_INBOX_MAX_LIMIT = 300;

function inboxRespondJson(int $status, array $payload): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function inboxStatusFile(): string {
    return __DIR__ . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'contact-status.json';
}

function inboxStatuses(): array {
    return ['new', 'in_progress', 'done', 'archived'];
}

function inboxSubmissionRoot(): string {
    $customDir = trim((string) getenv('RADIO_ACCENT_CONTACT_STORAGE_DIR'));
    if ($customDir !== '') {
        return rtrim($customDir, "\\/");
    }

    return __DIR__ . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'contact-submissions';
}

function inboxReadStatusMap(): array {
    $file = inboxStatusFile();
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

function inboxWriteStatusMap(array $payload): bool {
    $file = inboxStatusFile();
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

function inboxDecodeSubmissionFile(string $file): ?array {
    if (!is_file($file)) {
        return null;
    }

    $raw = file_get_contents($file);
    if ($raw === false) {
        return null;
    }

    $json = $raw;
    if (substr($raw, 0, 5) === '<?php') {
        $end = strpos($raw, '?>');
        if ($end !== false) {
            $json = substr($raw, $end + 2);
        }
    }

    $decoded = json_decode(trim($json), true);
    return is_array($decoded) ? $decoded : null;
}

function inboxNormalizeItem(string $root, string $file, array $payload, string $status): array {
    $relative = ltrim(str_replace('\\', '/', substr($file, strlen($root))), '/');
    $submittedAt = trim((string) ($payload['submittedAt'] ?? ''));
    $fallbackStamp = @filemtime($file) ?: time();
    $timestamp = $submittedAt !== '' ? strtotime($submittedAt) : false;
    if ($timestamp === false) {
        $timestamp = $fallbackStamp;
    }

    return [
        'id' => $relative,
        'name' => trim((string) ($payload['name'] ?? '')),
        'email' => trim((string) ($payload['email'] ?? '')),
        'message' => trim((string) ($payload['message'] ?? '')),
        'submittedAt' => gmdate('c', (int) $timestamp),
        'month' => gmdate('Y-m', (int) $timestamp),
        'status' => in_array($status, inboxStatuses(), true) ? $status : 'new'
    ];
}

function inboxCollectItems(): array {
    $root = inboxSubmissionRoot();
    if (!is_dir($root)) {
        return [];
    }

    $statusMap = inboxReadStatusMap();
    $items = [];

    $iterator = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS)
    );

    foreach ($iterator as $fileInfo) {
        if (!$fileInfo instanceof SplFileInfo || !$fileInfo->isFile()) {
            continue;
        }

        $extension = strtolower($fileInfo->getExtension());
        if (!in_array($extension, ['php', 'json'], true)) {
            continue;
        }

        $payload = inboxDecodeSubmissionFile($fileInfo->getPathname());
        if (!$payload) {
            continue;
        }

        $relative = ltrim(str_replace('\\', '/', substr($fileInfo->getPathname(), strlen($root))), '/');
        $items[] = inboxNormalizeItem($root, $fileInfo->getPathname(), $payload, (string) ($statusMap[$relative] ?? 'new'));
    }

    usort($items, static function (array $left, array $right): int {
        return strcmp((string) ($right['submittedAt'] ?? ''), (string) ($left['submittedAt'] ?? ''));
    });

    return $items;
}

function inboxFilterItems(array $items, string $query, string $status, string $month): array {
    $needle = function_exists('mb_strtolower') ? mb_strtolower(trim($query), 'UTF-8') : strtolower(trim($query));
    return array_values(array_filter($items, static function (array $item) use ($needle, $status, $month): bool {
        if ($status !== '' && $status !== 'all' && (string) ($item['status'] ?? '') !== $status) {
            return false;
        }

        if ($month !== '' && (string) ($item['month'] ?? '') !== $month) {
            return false;
        }

        if ($needle === '') {
            return true;
        }

        $haystack = implode(' ', [
            (string) ($item['name'] ?? ''),
            (string) ($item['email'] ?? ''),
            (string) ($item['message'] ?? '')
        ]);
        $normalized = function_exists('mb_strtolower') ? mb_strtolower($haystack, 'UTF-8') : strtolower($haystack);
        return strpos($normalized, $needle) !== false;
    }));
}

function inboxSummary(array $items): array {
    $counts = [
        'total' => count($items),
        'new' => 0,
        'in_progress' => 0,
        'done' => 0,
        'archived' => 0
    ];

    foreach ($items as $item) {
        $status = (string) ($item['status'] ?? 'new');
        if (!isset($counts[$status])) {
            $status = 'new';
        }
        $counts[$status] += 1;
    }

    $months = [];
    foreach ($items as $item) {
        $month = (string) ($item['month'] ?? '');
        if ($month !== '') {
            $months[$month] = true;
        }
    }

    return [
        'counts' => $counts,
        'months' => array_values(array_keys($months))
    ];
}

function inboxRenderCsv(array $items): void {
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="radio-accent-contact-inbox.csv"');
    $output = fopen('php://output', 'wb');
    if ($output === false) {
        exit;
    }
    fputcsv($output, ['Datum', 'Status', 'Naam', 'E-mail', 'Bericht'], ';');
    foreach ($items as $item) {
        fputcsv($output, [
            (string) ($item['submittedAt'] ?? ''),
            (string) ($item['status'] ?? ''),
            (string) ($item['name'] ?? ''),
            (string) ($item['email'] ?? ''),
            (string) ($item['message'] ?? '')
        ], ';');
    }
    fclose($output);
    exit;
}

if (!radioAccentAdminIsAuthenticated()) {
    inboxRespondJson(401, ['ok' => false, 'error' => 'Admin sessie verlopen. Log opnieuw in.']);
}

$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');

if ($method === 'POST') {
    $rawInput = file_get_contents('php://input');
    $payload = json_decode($rawInput ?: '', true);
    if (!is_array($payload)) {
        inboxRespondJson(400, ['ok' => false, 'error' => 'Invalid JSON body']);
    }

    $action = trim((string) ($payload['action'] ?? ''));
    if ($action !== 'status') {
        inboxRespondJson(400, ['ok' => false, 'error' => 'Unknown action']);
    }

    $id = ltrim(str_replace('\\', '/', trim((string) ($payload['id'] ?? ''))), '/');
    $status = trim((string) ($payload['status'] ?? ''));
    if ($id === '' || !in_array($status, inboxStatuses(), true)) {
        inboxRespondJson(400, ['ok' => false, 'error' => 'Ongeldige inbox update']);
    }

    $map = inboxReadStatusMap();
    $map[$id] = $status;
    if (!inboxWriteStatusMap($map)) {
        inboxRespondJson(500, ['ok' => false, 'error' => 'Inboxstatus kon niet opgeslagen worden.']);
    }

    inboxRespondJson(200, ['ok' => true]);
}

if ($method !== 'GET') {
    inboxRespondJson(405, ['ok' => false, 'error' => 'Method not allowed']);
}

$query = trim((string) ($_GET['q'] ?? ''));
$status = trim((string) ($_GET['status'] ?? 'all'));
$month = trim((string) ($_GET['month'] ?? ''));
$limit = max(1, min(RADIO_ACCENT_CONTACT_INBOX_MAX_LIMIT, (int) ($_GET['limit'] ?? RADIO_ACCENT_CONTACT_INBOX_DEFAULT_LIMIT)));

$allItems = inboxCollectItems();
$filtered = inboxFilterItems($allItems, $query, $status, $month);

if (trim((string) ($_GET['format'] ?? '')) === 'csv') {
    inboxRenderCsv($filtered);
}

inboxRespondJson(200, [
    'ok' => true,
    'data' => [
        'items' => array_slice($filtered, 0, $limit),
        'summary' => inboxSummary($allItems),
        'filteredTotal' => count($filtered)
    ]
]);
