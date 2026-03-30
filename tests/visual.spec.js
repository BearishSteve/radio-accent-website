const { test, expect } = require('@playwright/test');
const { installCommonPageSetup } = require('./support');

const installPlaylistArchiveStub = async (page) => {
  await page.route(/.*\/api\/playlist-history\.php(\?.*)?$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        ok: true,
        data: {
          items: [
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
            }
          ],
          total: 3,
          offset: 0,
          hasMore: false
        }
      })
    });
  });
};

test.beforeEach(async ({ page }) => {
  await installCommonPageSetup(page);
});

test('contact page visual baseline stays stable', async ({ page }) => {
  await page.goto('/contact.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('main')).toHaveScreenshot('contact-page-main.png', {
    animations: 'disabled',
    caret: 'hide',
    maxDiffPixels: 3000
  });
});

test('admin login page visual baseline stays stable', async ({ page }) => {
  await page.goto('/admin.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('main')).toHaveScreenshot('admin-login-main.png', {
    animations: 'disabled',
    caret: 'hide',
    maxDiffPixels: 3000
  });
});

test('playlist shell visual baseline stays stable', async ({ page }) => {
  await installPlaylistArchiveStub(page);
  await page.goto('/playlist.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.playlist-shell')).toHaveScreenshot('playlist-shell.png', {
    animations: 'disabled',
    caret: 'hide',
    maxDiffPixels: 3000
  });
});
