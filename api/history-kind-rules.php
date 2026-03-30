<?php
declare(strict_types=1);

function radioAccentDefaultHistoryKindRules(): array {
    return [
        [
            'kind' => 'news',
            'keywords' => ['nieuws', 'regionieuws', 'regionaal nieuws', 'headline', 'breaking']
        ],
        [
            'kind' => 'weather',
            'keywords' => ['weerbericht', 'weer', 'weather', 'forecast']
        ],
        [
            'kind' => 'traffic',
            'keywords' => ['verkeer', 'traffic', 'mobiliteit']
        ],
        [
            'kind' => 'promo',
            'keywords' => ['promo', 'promotie', 'spot', 'commercial', 'advertentie', 'wedstrijd', 'actie', 'giveaway', 'jingle', 'station id', 'station-id', 'radio accent']
        ]
    ];
}

function radioAccentAllowedHistoryKinds(): array {
    return ['', 'music', 'news', 'weather', 'traffic', 'promo'];
}

function radioAccentNormalizeHistoryKindText(string $value): string {
    $trimmed = trim($value);
    return function_exists('mb_strtolower') ? mb_strtolower($trimmed, 'UTF-8') : strtolower($trimmed);
}

function radioAccentNormalizeHistoryKindRule(array $item): ?array {
    $kind = radioAccentNormalizeHistoryKindText((string) ($item['kind'] ?? ''));
    if (!in_array($kind, ['news', 'weather', 'traffic', 'promo'], true)) {
        return null;
    }

    $rawKeywords = $item['keywords'] ?? [];
    $keywords = [];

    if (is_array($rawKeywords)) {
        foreach ($rawKeywords as $keyword) {
            $needle = radioAccentNormalizeHistoryKindText((string) $keyword);
            if ($needle !== '') {
                $keywords[] = $needle;
            }
        }
    } else {
        foreach (explode(',', (string) $rawKeywords) as $keyword) {
            $needle = radioAccentNormalizeHistoryKindText($keyword);
            if ($needle !== '') {
                $keywords[] = $needle;
            }
        }
    }

    if (!$keywords) {
        return null;
    }

    return [
        'kind' => $kind,
        'keywords' => array_values(array_unique($keywords))
    ];
}

function radioAccentSanitizeHistoryKindRules(array $items): array {
    $rules = [];
    foreach ($items as $item) {
        if (!is_array($item)) {
            continue;
        }
        $normalized = radioAccentNormalizeHistoryKindRule($item);
        if ($normalized) {
            $rules[] = $normalized;
        }
    }

    return $rules ?: radioAccentDefaultHistoryKindRules();
}

function radioAccentReadHistoryKindRules(?string $contentFile = null): array {
    $contentFile = $contentFile ?: __DIR__ . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'content.json';
    static $cache = [];
    if (array_key_exists($contentFile, $cache)) {
        return $cache[$contentFile];
    }

    if (!is_file($contentFile)) {
        return $cache[$contentFile] = radioAccentDefaultHistoryKindRules();
    }

    $raw = file_get_contents($contentFile);
    if ($raw === false) {
        return $cache[$contentFile] = radioAccentDefaultHistoryKindRules();
    }

    $decoded = json_decode($raw, true);
    if (!is_array($decoded) || !is_array($decoded['historyKinds'] ?? null)) {
        return $cache[$contentFile] = radioAccentDefaultHistoryKindRules();
    }

    return $cache[$contentFile] = radioAccentSanitizeHistoryKindRules($decoded['historyKinds']);
}

function radioAccentDetectHistoryKind(string $artist, string $title, ?array $rules = null): string {
    $haystack = radioAccentNormalizeHistoryKindText($artist . ' ' . $title);
    if ($haystack === '') {
        return 'music';
    }

    foreach (($rules ?: radioAccentDefaultHistoryKindRules()) as $rule) {
        foreach (($rule['keywords'] ?? []) as $needle) {
            if ($needle !== '' && str_contains($haystack, (string) $needle)) {
                return (string) ($rule['kind'] ?? 'music');
            }
        }
    }

    return 'music';
}
