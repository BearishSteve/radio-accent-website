# Radio Accent Beheer - Installatie & Gebruik

## 1. Vereisten
- Webhosting met **PHP 8+**.
- Schrijfrechten op:
  - `api/data/content.json`
  - `api/data/now-playing.json`
- Bestanden uit deze map online geplaatst in je website-root.

## 2. Bestanden die erbij horen
- Frontend:
  - `index.html`, `programmas.html`, `mixen.html`, `admin.html`
  - `script.js`, `styles.css`, `config.js`
- Backend:
  - `api/content.php`
  - `api/weather.php`
  - `api/now-playing.php`
  - `api/data/content.json`
  - `api/data/now-playing.json`

## 3. Beveiliging (zeer belangrijk)
De site gebruikt server-side secrets/config voor:
- `RADIO_ACCENT_ADMIN_PASSCODE`
- `RADIO_ACCENT_NOW_PLAYING_SECRET`
- `WEATHERAPI_KEY`
- `WEATHER_LOCATION`

Of, als je alleen via FTP werkt, via:
- `api/config.local.php`

FTP-aanpak:
1. Kopieer `api/config.local.example.php` naar `api/config.local.php`.
2. Vul daar je eigen waardes in.
3. Upload `api/config.local.php` via FTP.

Voorbeeld:

```php
<?php
declare(strict_types=1);

return [
    'adminPasscode' => 'mijn-geheime-code',
    'weatherApiKey' => 'jouw-weatherapi-key',
    'weatherLocation' => 'Wetteren',
    'nowPlayingSecret' => 'een-lange-geheime-token'
];
```

`config.local.php` wordt automatisch gebruikt door:
- `api/content.php`
- `api/weather.php`
- `api/now-playing.php`

## 4. Rechten op databestanden
Zorg dat PHP kan schrijven naar:
- `api/data/content.json`
- `api/data/now-playing.json`

Aanpak (algemeen):
1. Map `api/data` moet write-toegang hebben voor de webserver user.
2. Beide JSON-bestanden moeten write-toegang hebben voor dezelfde user.

## 5. API-endpoints
De site verwacht standaard:
- `api/content.php`
- `api/weather.php`
- `api/now-playing.php`

Dit staat in `config.js`:
- `cms.apiEnabled: true`
- `cms.apiEndpoint: 'api/content.php'`
- `nowPlayingApi: 'api/now-playing.php'`
- `nowPlayingStreamApi: 'api/now-playing-stream.php'`
- `keywordCovers` voor vaste covers op basis van keywords in artiest/titel

## 6. Now Playing koppeling met radio-automatisatie
De website gebruikt nu:
- `api/now-playing.php` voor opslag en uitlezen
- `api/now-playing-stream.php` voor live push naar open browsers

### GET
Geeft de huidige trackstate terug voor de website:

```json
{
  "ok": true,
  "data": {
    "track": {
      "id": "abc123",
      "artist": "Artist",
      "title": "Titel",
      "cover": "https://example.com/cover.jpg",
      "duration": 214,
      "startedAt": "2026-03-10T09:15:00+00:00",
      "endsAt": "2026-03-10T09:18:34+00:00",
      "updatedAt": "2026-03-10T09:15:00+00:00"
    },
    "history": []
  }
}
```

### POST
De automatisatie post bij een trackwissel naar dezelfde endpoint.
Authenticatie kan via:
- header `X-Radio-Accent-Secret`
- of JSON-veld `secret`

Voorbeeld:

```json
{
  "secret": "een-lange-geheime-token",
  "track": {
    "id": "abc123",
    "artist": "Artist",
    "title": "Titel",
    "cover": "https://example.com/cover.jpg",
    "duration": 214,
    "startedAt": "2026-03-10T09:15:00+00:00"
  }
}
```

Opmerking:
- `duration` is in seconden.
- `endsAt` wordt automatisch berekend als `startedAt` en `duration` zijn meegestuurd.
- De server bewaart zelf de history, dus `history` meesturen is optioneel.

### SSE stream
De frontend kan realtime updates ontvangen via:
- `api/now-playing-stream.php`

De radio-automatisatie hoeft niets rechtstreeks naar deze stream te sturen.
De flow is:
1. ProppFrexx doet bij trackwissel een `POST` naar `api/now-playing.php`
2. `api/now-playing.php` schrijft `api/data/now-playing.json`
3. `api/now-playing-stream.php` merkt die wijziging op en pusht een `nowplaying` event naar alle open browsers

Voorbeeld van een SSE event payload:

```json
{
  "ok": true,
  "data": {
    "track": {
      "id": "abc123",
      "artist": "Artist",
      "title": "Titel",
      "cover": "https://example.com/cover.jpg",
      "duration": 214,
      "startedAt": "2026-03-10T09:15:00+00:00",
      "endsAt": "2026-03-10T09:18:34+00:00",
      "updatedAt": "2026-03-10T09:15:00+00:00"
    },
    "history": []
  },
  "version": "2026-03-10T09:15:00+00:00"
}
```

## 7. Weerkaart in de live-card
De homepagina gebruikt standaard:
- `api/weather.php`

Deze endpoint leest:
- `WEATHERAPI_KEY`
- `WEATHER_LOCATION`

## 8. Gebruik van de beheersconsole
1. Ga naar `admin.html`.
2. Log in met je server-passcode.
3. Pas **Programmaschema** en **Mixen** aan.
4. Klik **Opslaan**.
5. Updates verschijnen op:
   - `index.html`
   - `programmas.html`
   - `mixen.html`

Extra:
- **Reset naar standaard**: zet inhoud terug op defaults.
- **Exporteer JSON**: backup downloaden.
- **Importeer JSON**: backup terugzetten.
- Zonder werkende API kan de console alleen lokaal op `localhost` of via een lokaal bestand in browseropslag werken.

## 9. Troubleshooting
- "Onjuiste toegangscode":
  - Controleer `RADIO_ACCENT_ADMIN_PASSCODE` op server.
- "Now playing secret is not configured":
  - Zet `RADIO_ACCENT_NOW_PLAYING_SECRET` in je hosting of `api/config.local.php`.
- "Invalid secret":
  - Controleer de token die je automatisatie meestuurt.
- Geen live track updates zichtbaar:
  - Controleer of `api/now-playing.php` bereikbaar is.
  - Controleer schrijfrechten op `api/data/now-playing.json`.
  - Check PHP error logs.
- Geen weerinfo zichtbaar:
  - Controleer `api/weather.php` en je WeatherAPI-config.

## 10. Aanbevolen volgende stap
Voor extra veiligheid:
- zet `admin.html` en eventueel `api/now-playing.php` achter extra serverbeveiliging,
- of beperk POST-verkeer op `api/now-playing.php` tot het IP van je automatisatie.
