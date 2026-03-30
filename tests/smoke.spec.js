const { test, expect } = require('@playwright/test');
const { installCommonPageSetup } = require('./support');

test.beforeEach(async ({ page }) => {
  await installCommonPageSetup(page);
});

test('homepage shows key live listening elements', async ({ page }) => {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });

  await expect(page).toHaveTitle(/Radio Accent/i);
  await expect(page.locator('#home-promo-strip')).toBeVisible();
  await expect(page.locator('#home-promo-strip h2')).toBeVisible();
  await expect(page.locator('#live-program-current')).toBeVisible();
  await expect(page.locator('#live-track-title')).toBeVisible();
  await expect(page.locator('[data-stream-link]').first()).toBeVisible();
  await expect(page.locator('#player-dock')).toBeVisible();
});

test('program page renders the new weekplanning overview', async ({ page }) => {
  await page.goto('/programmas.html', { waitUntil: 'domcontentloaded' });

  await expect(page.locator('#week-schedule-tabs')).toBeVisible();
  await expect(page.locator('#week-schedule-tabs .week-schedule-tab')).toHaveCount(7);
  await expect(page.locator('#week-schedule-panel .week-schedule-item').first()).toBeVisible();
  await expect(page.locator('#schedule-page-current-title')).toBeVisible();
});

test('mix page renders playable cards and syncs the player state', async ({ page }) => {
  await page.goto('/mixen.html', { waitUntil: 'domcontentloaded' });

  const firstCard = page.locator('#mixes-library .mix-card-playable').first();
  await expect(firstCard).toBeVisible();

  const mixTitle = (await firstCard.locator('h3').textContent())?.trim() || '';
  await firstCard.click();

  await expect(page.locator('#player-track-artist')).toHaveText(mixTitle);
  await expect(page.locator('#player-dock')).toBeVisible();

  await page.locator('#mixes-library .mix-details-trigger').first().click();
  await expect(page.locator('#mix-archive-panel')).toContainText('Replay-archief');
});

test('status page shows public service checks', async ({ page }) => {
  await page.route('**/api/status.php?*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        data: {
          checkedAt: '2026-03-30T10:20:00+00:00',
          status: 'ok',
          checks: [
            { key: 'stream', label: 'Stream', status: 'ok', summary: 'De live stream reageert correct.', detail: 'HTTP 200' },
            { key: 'metadata', label: 'Metadata', status: 'ok', summary: 'Now-playing metadata wordt recent bijgewerkt.', detail: 'Laatste update: 2026-03-30T10:18:00+00:00' },
            { key: 'weather', label: 'Weerfeed', status: 'warning', summary: 'De weerfeed is niet volledig geconfigureerd.', detail: 'API key ontbreekt.' }
          ]
        }
      })
    });
  });

  await page.goto('/status.html', { waitUntil: 'domcontentloaded' });

  await expect(page.locator('main h1')).toContainText('Live status');
  await expect(page.locator('#status-checks .status-card')).toHaveCount(3);
});

test('contact page exposes the expected browser form flow', async ({ page }) => {
  await page.goto('/contact.html', { waitUntil: 'domcontentloaded' });

  await expect(page.locator('main h1')).toContainText('We helpen je graag verder');
  await expect(page.locator('#contact-form')).toBeVisible();
});

test('admin page stays behind the login form until someone authenticates', async ({ page }) => {
  await page.goto('/admin.html', { waitUntil: 'domcontentloaded' });

  await expect(page.locator('main h1')).toContainText('Beheersconsole voor content en live updates');
  await expect(page.locator('#admin-login-form')).toBeVisible();
});

test('nieuws page redirects to home while hidden', async ({ page }) => {
  await page.goto('/nieuws.html', { waitUntil: 'domcontentloaded' });

  await expect(page).toHaveURL(/\/index\.html$/);
  await expect(page.locator('#home-promo-strip')).toBeVisible();
});
