const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const seedConsent = async (page) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'radioAccentConsent',
      JSON.stringify({
        necessary: true,
        analytics: false,
        timestamp: '2026-03-18T00:00:00.000Z'
      })
    );
  });
};

const stubNetworkNoise = async (page) => {
  await page.route('https://fonts.googleapis.com/**', (route) => route.abort());
  await page.route('https://fonts.gstatic.com/**', (route) => route.abort());
  await page.route('https://clubfmserver.be/**', (route) => route.abort());
  await page.route(/.*\/api\/weather\.php(\?.*)?$/, (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ ok: false })
    });
  });
  await page.route(/.*\/api\/now-playing-stream\.php(\?.*)?$/, (route) => {
    route.fulfill({
      status: 204,
      body: ''
    });
  });
};

const installCommonPageSetup = async (page) => {
  await stubNetworkNoise(page);
  await seedConsent(page);
};

const loginToAdminConsole = async (page, passcode = getLocalAdminPasscode()) => {
  await page.goto('/admin.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate((code) => {
    const input = document.getElementById('admin-passcode');
    const form = document.getElementById('admin-login-form');
    if (input instanceof HTMLInputElement) {
      input.value = code;
    }
    if (form instanceof HTMLFormElement) {
      form.requestSubmit();
    }
  }, passcode);
};

const saveCmsContentThroughSession = async (page, content) => page.evaluate(async (payload) => {
  const response = await fetch('api/content.php', {
    method: 'POST',
    cache: 'no-store',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      action: 'save',
      data: payload
    })
  });

  const body = await response.json().catch(() => null);
  return {
    ok: response.ok,
    status: response.status,
    body
  };
}, content);

const getLocalAdminPasscode = () => {
  const envPasscode = String(process.env.RADIO_ACCENT_ADMIN_PASSCODE || '').trim();
  if (envPasscode) {
    return envPasscode;
  }

  try {
    const configPath = path.join(__dirname, '..', 'api', 'config.local.php');
    const source = fs.readFileSync(configPath, 'utf8');
    const match = source.match(/'adminPasscode'\s*=>\s*'((?:\\'|[^'])*)'/);
    return match ? match[1].replace(/\\'/g, "'").trim() : '';
  } catch {
    return '';
  }
};

const hasCliCommand = (command, args = ['--version']) => {
  try {
    const result = spawnSync(command, args, { stdio: 'ignore', shell: false });
    return result.status === 0;
  } catch {
    return false;
  }
};

const hasPhpCli = () => hasCliCommand('php');

module.exports = {
  getLocalAdminPasscode,
  hasPhpCli,
  installCommonPageSetup,
  loginToAdminConsole,
  saveCmsContentThroughSession
};
