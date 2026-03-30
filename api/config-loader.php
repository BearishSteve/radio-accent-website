<?php
declare(strict_types=1);

function radioAccentLoadConfig(): array {
    $localConfigFile = __DIR__ . DIRECTORY_SEPARATOR . 'config.local.php';
    $localConfig = [];

    if (is_file($localConfigFile)) {
        $loaded = require $localConfigFile;
        if (is_array($loaded)) {
            $localConfig = $loaded;
        }
    }

    return [
        'adminPasscode' => trim((string) (getenv('RADIO_ACCENT_ADMIN_PASSCODE') ?: ($localConfig['adminPasscode'] ?? ''))),
        'adminPasscodeHash' => trim((string) (getenv('RADIO_ACCENT_ADMIN_PASSCODE_HASH') ?: ($localConfig['adminPasscodeHash'] ?? ''))),
        'weatherApiKey' => trim((string) (getenv('WEATHERAPI_KEY') ?: ($localConfig['weatherApiKey'] ?? ''))),
        'weatherLocation' => trim((string) (getenv('WEATHER_LOCATION') ?: ($localConfig['weatherLocation'] ?? ''))),
        'nowPlayingSecret' => trim((string) (getenv('RADIO_ACCENT_NOW_PLAYING_SECRET') ?: ($localConfig['nowPlayingSecret'] ?? ''))),
        'dabMetadataDir' => trim((string) (getenv('RADIO_ACCENT_DAB_METADATA_DIR') ?: ($localConfig['dabMetadataDir'] ?? ''))),
        'dabMetadataBaseUrl' => trim((string) (getenv('RADIO_ACCENT_DAB_METADATA_BASE_URL') ?: ($localConfig['dabMetadataBaseUrl'] ?? ''))),
        'dabArtistFont' => trim((string) (getenv('RADIO_ACCENT_DAB_ARTIST_FONT') ?: ($localConfig['dabArtistFont'] ?? ''))),
        'dabTitleFont' => trim((string) (getenv('RADIO_ACCENT_DAB_TITLE_FONT') ?: ($localConfig['dabTitleFont'] ?? ''))),
        'dabBadgeFont' => trim((string) (getenv('RADIO_ACCENT_DAB_BADGE_FONT') ?: ($localConfig['dabBadgeFont'] ?? '')))
    ];
}
