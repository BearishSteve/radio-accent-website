# Radio Accent Website

De huidige Radio Accent website met publieke frontend, PHP API-endpoints, beheerfuncties, nieuws- en live-data, Playwright regressietests en experimentele component-workspaces.

## Stack

- HTML, CSS en vanilla JavaScript voor de productie-frontend
- PHP 8+ voor API-endpoints en server-side beheerlogica
- JSON-bestanden als lichte content- en runtime-opslag
- Node.js en Playwright voor end-to-end tests
- React + Vite in `v2-demo/` en `v2-show-card/` voor component- en designexperimenten
- Git LFS voor grote `.mp3` mix-assets

## Projectstructuur

- `index.html`, `programmas.html`, `mixen.html`, `nieuws.html`, `playlist.html`, `luisteren.html`, `admin.html`: hoofdfrontend
- `script.js`, `styles.css`, `config.js`, `sw.js`: gedeelde frontendlogica, styling en configuratie
- `api/`: backend-endpoints voor content, now playing, contact, uploads, analytics, status en nieuws
- `api/data/content.json`: basisinhoud voor CMS-gestuurde content
- `assets/`: statische afbeeldingen, fonts, logo's en mixbestanden
- `tests/`: Playwright smoke-, flow-, regressie- en visualtests
- `tools/`: hulpscripts voor lokale checks en assetgeneratie
- `landing/`: aparte landingpagina-varianten
- `v2-demo/`, `v2-show-card/`: experimentele component- en demo-omgevingen

## Installatie

1. Installeer Node.js 18+.
2. Installeer PHP 8+ voor de API-endpoints en lokale testserver.
3. Installeer Git LFS en activeer het eenmalig met `git lfs install`.
4. Installeer de testafhankelijkheden met `npm install`.
5. Kopieer `.env.example` naar een eigen lokale `.env` of gebruik `api/config.local.example.php` als basis voor `api/config.local.php`.

## Lokaal draaien

Voor de hoofdsite kun je lokaal een simpele webserver starten:

```bash
php -S 127.0.0.1:8787 -t .
```

Of gebruik op Windows:

```bat
start-local-server.bat
```

De experimentele Vite-demo in `v2-demo/` start je apart vanuit die map:

```bash
npm install
npm run dev
```

## Tests

```bash
npm run test:e2e
```

Extra Playwright-scripts:

- `npm run test:e2e:headed`
- `npm run test:e2e:debug`
- `npm run test:e2e:report`
- `npm run test:e2e:update-snapshots`

## Configuratie

De backend leest configuratie uit environmentvariabelen of uit `api/config.local.php`.

Belangrijkste variabelen:

- `RADIO_ACCENT_ADMIN_PASSCODE`
- `RADIO_ACCENT_ADMIN_PASSCODE_HASH`
- `WEATHERAPI_KEY`
- `WEATHER_LOCATION`
- `RADIO_ACCENT_NOW_PLAYING_SECRET`
- `RADIO_ACCENT_DAB_METADATA_DIR`
- `RADIO_ACCENT_DAB_METADATA_BASE_URL`
- `RADIO_ACCENT_DAB_ARTIST_FONT`
- `RADIO_ACCENT_DAB_TITLE_FONT`
- `RADIO_ACCENT_DAB_BADGE_FONT`
- `RADIO_ACCENT_CONTACT_STORAGE_DIR`
- `RADIO_ACCENT_CONTACT_TO`

## Deployment-notes

- Publiceer de website-root inclusief `api/`, `assets/`, `landing/`, `tests/` en configuratiebestanden die nodig zijn voor jouw omgeving.
- Zorg dat PHP schrijfrechten heeft op runtime-mappen onder `api/data/`, zoals contactinzendingen, history en backups.
- Commit geen echte `.env`-bestanden, `api/config.local.php`, logs of gegenereerde runtime-JSON.
- De grote mixbestanden onder `assets/mixen/` worden via Git LFS beheerd. Een clone vereist dus ook `git lfs pull`.
- `api/data/content.json` blijft in de repository als seed-content; runtimebestanden zoals now playing en rate limits blijven lokaal/server-side.

## Huidige status

- Productie-frontend en PHP API aanwezig in deze repository
- Playwright smoke-tests aanwezig en recent lokaal groen
- Live/homepage-layout recent herwerkt richting nieuws-slider + live card
- Beheer- en contentlogica aanwezig via `admin.html` en `api/content.php`

## TODO

- Server-specifieke productievariabelen invullen
- Contactopslag en permissies op de doelserver controleren
- Eventuele CI/CD voor tests en deployment toevoegen
- Beslissen welke experimentele `v2-*` onderdelen later productiewaardig worden

## Extra documentatie

- Zie `README-beheer.md` voor beheerconsole, API-gebruik en operationele toelichting.
