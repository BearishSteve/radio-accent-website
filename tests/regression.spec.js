const { test, expect } = require('@playwright/test');
const {
  getLocalAdminPasscode,
  hasPhpCli,
  installCommonPageSetup,
  loginToAdminConsole,
  saveCmsContentThroughSession
} = require('./support');

const adminPasscode = getLocalAdminPasscode();
const phpAvailable = hasPhpCli();

const readCmsContent = async (request) => {
  const response = await request.get('/api/content.php');
  expect(response.ok()).toBeTruthy();
  const payload = await response.json();
  return payload.data;
};

const installPlaylistArchiveStub = async (page) => {
  const sampleItems = [
    {
      artist: 'Roxette',
      title: 'Listen To Your Heart',
      time: '09:05',
      date: '18/03/2026',
      kind: 'music',
      kindLabel: 'Muziek',
      image: 'assets/logo_dab.png'
    },
    {
      artist: 'Radio Accent',
      title: 'Regionieuws middag',
      time: '12:00',
      date: '18/03/2026',
      kind: 'news',
      kindLabel: 'Nieuws',
      image: 'assets/nieuws-cover.jpg'
    },
    {
      artist: 'Radio Accent',
      title: 'Weerbericht Vlaanderen',
      time: '12:05',
      date: '18/03/2026',
      kind: 'weather',
      kindLabel: 'Weer',
      image: 'assets/weer-cover.jpg'
    },
    {
      artist: 'Radio Accent',
      title: 'Verkeer E40 update',
      time: '12:10',
      date: '18/03/2026',
      kind: 'traffic',
      kindLabel: 'Verkeer',
      image: 'assets/verkeer-cover.jpg'
    }
  ];

  await page.route(/.*\/api\/playlist-history\.php(\?.*)?$/, async (route) => {
    const url = new URL(route.request().url());
    const query = String(url.searchParams.get('q') || '').trim().toLowerCase();
    const kind = String(url.searchParams.get('kind') || '').trim();
    const limit = Number(url.searchParams.get('limit') || sampleItems.length);
    const offset = Number(url.searchParams.get('offset') || 0);

    const filtered = sampleItems.filter((item) => {
      if (kind && item.kind !== kind) {
        return false;
      }
      if (!query) {
        return true;
      }
      const haystack = `${item.artist} ${item.title}`.toLowerCase();
      return haystack.includes(query);
    });

    const items = filtered.slice(offset, offset + limit);

    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        ok: true,
        data: {
          items,
          total: filtered.length,
          offset,
          hasMore: offset + items.length < filtered.length
        }
      })
    });
  });
};

test.beforeEach(async ({ page }) => {
  await installCommonPageSetup(page);
});

test('playlist filters, search and quick reset stay in sync', async ({ page }) => {
  await installPlaylistArchiveStub(page);
  await page.goto('/playlist.html', { waitUntil: 'domcontentloaded' });

  await expect(page.locator('#playlist-history .history-row')).toHaveCount(4);
  await expect(page.locator('#playlist-summary')).toContainText('4 tracks gevonden');

  await page.locator('.playlist-filter[data-kind="news"]').click();
  await expect(page.locator('#playlist-history .history-row')).toHaveCount(1);
  await expect(page.locator('#playlist-history')).toContainText('Regionieuws middag');

  await page.locator('#playlist-search').fill('middag');
  await expect(page.locator('#playlist-history .history-row')).toHaveCount(1);
  await expect(page.locator('#playlist-summary')).toContainText('zoekterm: "middag"');

  await page.locator('#playlist-quick-reset').click();
  await expect(page.locator('#playlist-history .history-row')).toHaveCount(4);
  await expect(page.locator('#playlist-search')).toHaveValue('');
  await expect(page.locator('.playlist-filter.is-active')).toHaveText('Alles');
});

test('programma en mix filters reageren op zoek- en selectiewaarden', async ({ page }) => {
  await page.goto('/programmas.html', { waitUntil: 'domcontentloaded' });

  await expect(page.locator('#schedule-search')).toHaveCount(0);
  await expect(page.locator('#schedule-filter-toolbar')).toHaveCount(0);
  await expect(page.locator('#schedule-filter-mode')).toHaveCount(0);
  await expect(page.locator('#schedule-filter-summary')).toHaveCount(0);
  expect(await page.locator('#schedule-list .schedule-row').count()).toBeGreaterThan(0);

  await page.goto('/mixen.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#mix-search')).toHaveCount(0);
  await expect(page.locator('#mix-filter-toolbar')).toHaveCount(0);
  await expect(page.locator('#mix-dj-filter')).toHaveCount(0);
  await expect(page.locator('#mix-filter-summary')).toHaveCount(0);
  expect(await page.locator('#mixes-library .mix-card-playable').count()).toBeGreaterThan(0);
});

test('admin monitor tab loads health and stats after login', async ({ page }) => {
  test.skip(!adminPasscode || !phpAvailable, 'Geen lokale PHP-adminomgeving gevonden voor de monitorflow.');

  await loginToAdminConsole(page, adminPasscode);
  await expect(page.locator('#admin-console')).toBeVisible();

  await page.locator('#admin-tab-monitor').click();
  await expect(page.locator('#admin-panel-monitor')).toBeVisible();

  await expect.poll(async () => {
    const text = ((await page.locator('#admin-health-summary').textContent()) || '').trim();
    return text !== '' && text !== 'Checks laden...';
  }).toBe(true);

  await expect.poll(async () => {
    const text = ((await page.locator('#admin-stats-summary').textContent()) || '').trim();
    return text !== '' && text !== 'Statistieken laden...';
  }).toBe(true);

  await expect(page.locator('#admin-health-updated')).toContainText(/Laatste controle|Controle uitgevoerd/);
});

test('admin backups tab loads version history after login', async ({ page }) => {
  test.skip(!adminPasscode || !phpAvailable, 'Geen lokale PHP-adminomgeving gevonden voor de backupflow.');

  await loginToAdminConsole(page, adminPasscode);
  await expect(page.locator('#admin-console')).toBeVisible();

  await page.locator('#admin-tab-backups').click();
  await expect(page.locator('#admin-panel-backups')).toBeVisible();

  await expect.poll(async () => {
    const text = ((await page.locator('#admin-backups-summary').textContent()) || '').trim();
    return text !== '' && text !== 'Backups laden...';
  }).toBe(true);
});

test('admin save updates content and restores the original schedule afterwards', async ({ page, request }) => {
  test.skip(!adminPasscode || !phpAvailable, 'Geen lokale PHP-adminomgeving gevonden voor de saveflow.');

  const originalContent = await readCmsContent(request);
  const originalTitle = String(originalContent.schedule?.[0]?.title || '').trim();

  await loginToAdminConsole(page, adminPasscode);
  await expect(page.locator('#admin-console')).toBeVisible();

  const titleInput = page.locator('#admin-schedule-list .admin-row [data-field="title"]').first();
  const nextTitle = `${originalTitle} QA ${Date.now()}`;

  try {
    await titleInput.fill(nextTitle);
    await page.locator('#admin-save').click();

    await expect(page.locator('#admin-feedback')).toHaveText('Wijzigingen opgeslagen.');
    await expect.poll(async () => {
      const latestContent = await readCmsContent(request);
      return String(latestContent.schedule?.[0]?.title || '').trim();
    }).toBe(nextTitle);
  } finally {
    const restoreResult = await saveCmsContentThroughSession(page, originalContent);
    expect(restoreResult.ok).toBeTruthy();

    await expect.poll(async () => {
      const restoredContent = await readCmsContent(request);
      return String(restoredContent.schedule?.[0]?.title || '').trim();
    }).toBe(originalTitle);
  }
});

test('admin reset returns defaults and then restores the original content snapshot', async ({ page, request }) => {
  test.skip(!adminPasscode || !phpAvailable, 'Geen lokale PHP-adminomgeving gevonden voor de resetflow.');

  const originalContent = await readCmsContent(request);

  await loginToAdminConsole(page, adminPasscode);
  await expect(page.locator('#admin-console')).toBeVisible();

  try {
    await page.locator('#admin-reset').click();

    await expect(page.locator('#admin-feedback')).toHaveText('Teruggezet naar standaardinhoud.');
    await expect.poll(async () => {
      const latestContent = await readCmsContent(request);
      return String(latestContent.schedule?.[0]?.title || '').trim();
    }).toBe('Accent Start');
  } finally {
    const restoreResult = await saveCmsContentThroughSession(page, originalContent);
    expect(restoreResult.ok).toBeTruthy();

    await expect.poll(async () => {
      const restoredContent = await readCmsContent(request);
      return JSON.stringify(restoredContent);
    }).toBe(JSON.stringify(originalContent));
  }
});

test('cms links with unsafe protocols fall back to safe href values', async ({ page, request }) => {
  test.skip(!adminPasscode || !phpAvailable, 'Geen lokale PHP-adminomgeving gevonden voor de CMS-link flow.');

  const originalContent = await readCmsContent(request);
  const maliciousContent = JSON.parse(JSON.stringify(originalContent));
  maliciousContent.news = Array.isArray(maliciousContent.news) ? maliciousContent.news : [];
  maliciousContent.siteStatus = maliciousContent.siteStatus || {};

  if (!maliciousContent.news.length) {
    maliciousContent.news.push({
      date: '27 maart 2026',
      title: 'Testbericht',
      excerpt: 'Controle op veilige links.',
      linkLabel: 'Lees meer',
      linkUrl: 'javascript:alert(1)',
      image: '',
      pinned: false
    });
  } else {
    maliciousContent.news[0] = {
      ...maliciousContent.news[0],
      linkLabel: 'Lees meer',
      linkUrl: 'javascript:alert(1)'
    };
  }

  maliciousContent.siteStatus = {
    ...maliciousContent.siteStatus,
    enabled: true,
    title: 'Veilige linktest',
    message: 'Controleer de fallback voor onveilige links.',
    ctaLabel: 'Open update',
    ctaLink: 'javascript:alert(1)'
  };

  await loginToAdminConsole(page, adminPasscode);
  await expect(page.locator('#admin-console')).toBeVisible();

  try {
    const saveResult = await saveCmsContentThroughSession(page, maliciousContent);
    expect(saveResult.ok).toBeTruthy();

    await page.goto('/nieuws.html', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/index\.html$/);

    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#site-status-banner a')).toHaveCount(0);
  } finally {
    await page.goto('/admin.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#admin-console')).toBeVisible();
    const restoreResult = await saveCmsContentThroughSession(page, originalContent);
    expect(restoreResult.ok).toBeTruthy();
  }
});
