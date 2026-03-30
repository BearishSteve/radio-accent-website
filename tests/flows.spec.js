const { test, expect } = require('@playwright/test');
const { getLocalAdminPasscode, hasPhpCli, installCommonPageSetup } = require('./support');

const adminPasscode = getLocalAdminPasscode();
const phpAvailable = hasPhpCli();

test.beforeEach(async ({ page }) => {
  await installCommonPageSetup(page);
});

test('contact form submit shows success feedback', async ({ page }) => {
  await page.route(/.*\/api\/contact\.php$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ ok: true })
    });
  });

  await page.goto('/contact.html', { waitUntil: 'domcontentloaded' });

  await page.evaluate(() => {
    const form = document.getElementById('contact-form');
    const name = document.getElementById('naam');
    const email = document.getElementById('email');
    const message = document.getElementById('bericht');
    const honeypot = document.querySelector('input[name="website"]');

    if (!(form instanceof HTMLFormElement)) return;
    if (name instanceof HTMLInputElement) name.value = 'Playwright Test';
    if (email instanceof HTMLInputElement) email.value = 'playwright@example.com';
    if (message instanceof HTMLTextAreaElement) {
      message.value = 'Diepere end-to-end controle van het contactformulier.';
    }
    if (honeypot instanceof HTMLInputElement) honeypot.value = '';

    form.requestSubmit();
  });

  await expect(page.locator('#contact-feedback')).toHaveAttribute('data-state', 'success');
  await expect(page.locator('#contact-feedback')).toContainText('Bedankt');
});

test('admin login opens the console and logout restores the login form', async ({ page }) => {
  test.skip(!adminPasscode || !phpAvailable, 'Geen lokale PHP-adminomgeving gevonden voor de loginflow.');

  await page.goto('/admin.html', { waitUntil: 'domcontentloaded' });

  await page.evaluate((passcode) => {
    const input = document.getElementById('admin-passcode');
    const form = document.getElementById('admin-login-form');
    if (input instanceof HTMLInputElement) {
      input.value = passcode;
    }
    if (form instanceof HTMLFormElement) {
      form.requestSubmit();
    }
  }, adminPasscode);

  await expect(page.locator('#admin-console')).toBeVisible();
  await expect(page.locator('#admin-save')).toBeVisible();

  await page.locator('#admin-logout').click();

  await expect(page.locator('#admin-login-form')).toBeVisible();
  await expect(page.locator('#admin-console')).toBeHidden();
});

test.describe('mobile navigation', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true
  });

  test('menu toggle opens the nav and can navigate to mixen', async ({ page }) => {
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });

    const menuToggle = page.locator('.menu-toggle');
    await expect(menuToggle).toBeVisible();

    await menuToggle.click();
    await expect(page.locator('#main-nav')).toHaveClass(/is-open/);

    await page.locator('#main-nav a[href="mixen.html"]').click();
    await expect(page).toHaveURL(/mixen\.html$/);
    await expect(page.locator('main h1')).toContainText('avondmixen');
  });
});
