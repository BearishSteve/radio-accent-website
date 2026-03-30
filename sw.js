const APP_VERSION = '20260330b';
const STATIC_CACHE = `radio-accent-static-${APP_VERSION}`;
const RUNTIME_CACHE = `radio-accent-runtime-${APP_VERSION}`;

const APP_SHELL = [
  './',
  'index.html',
  'offline.html',
  'programmas.html',
  'mixen.html',
  'status.html',
  'luisteren.html',
  'playlist.html',
  'contact.html',
  'contact-verzonden.html',
  'adverteren.html',
  'privacy.html',
  'robots.txt',
  'sitemap.xml',
  `styles.css?v=${APP_VERSION}`,
  `script.js?v=${APP_VERSION}`,
  `config.js?v=${APP_VERSION}`,
  'manifest.webmanifest',
  'assets/32x32.png',
  'assets/600x600.png',
  'assets/1400x1400.png',
  'assets/logo_dab.png',
  'assets/weather-cloud.svg'
];

const shouldBypassRuntimeCache = (url) => {
  if (url.searchParams.has('_')) return true;
  return url.pathname.endsWith('/assets/mixen/mixes.json') || url.pathname === '/assets/mixen/mixes.json';
};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.map((key) => {
        if (key === STATIC_CACHE || key === RUNTIME_CACHE) {
          return Promise.resolve();
        }
        return caches.delete(key);
      })
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/metadata/')) return;

  if (shouldBypassRuntimeCache(url)) {
    event.respondWith(fetch(request));
    return;
  }

  if (url.pathname.endsWith('/admin.html') || url.pathname === '/admin.html') {
    event.respondWith(
      fetch(request).catch(() => new Response(
        `<!DOCTYPE html>
<html lang="nl">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Beheer tijdelijk offline</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 0; background: #f4f8fc; color: #17365b; }
      main { max-width: 42rem; margin: 0 auto; padding: 3rem 1.5rem; }
      h1 { margin-bottom: 0.75rem; }
      p { line-height: 1.6; }
    </style>
  </head>
  <body>
    <main>
      <h1>Beheer tijdelijk offline</h1>
      <p>De beheerconsole werkt alleen met een actieve netwerkverbinding.</p>
      <p>Probeer het opnieuw zodra de site opnieuw bereikbaar is.</p>
    </main>
  </body>
</html>`,
        {
          status: 503,
          statusText: 'Service Unavailable',
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        }
      ))
    );
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          return cached || caches.match('offline.html');
        })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        const clone = response.clone();
        caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, clone));
        return response;
      });
    })
  );
});
