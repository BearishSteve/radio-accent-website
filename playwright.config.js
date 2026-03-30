const { defineConfig, devices } = require('@playwright/test');
const { spawnSync } = require('child_process');

const commandExists = (command, args = ['--version']) => {
  try {
    const result = spawnSync(command, args, { stdio: 'ignore', shell: false });
    return result.status === 0;
  } catch {
    return false;
  }
};

const APP_PORT = 8787;
const APP_HOST = '127.0.0.1';
const phpAvailable = commandExists('php');
const pythonAvailable = commandExists('python');

if (!phpAvailable && !pythonAvailable) {
  throw new Error('Geen lokale webserver beschikbaar. Installeer PHP CLI of Python om Playwright-tests te draaien.');
}

const webServerCommand = phpAvailable
  ? `php -S ${APP_HOST}:${APP_PORT} -t .`
  : `python -m http.server ${APP_PORT} --bind ${APP_HOST}`;

module.exports = defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: {
    timeout: 10_000
  },
  fullyParallel: false,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { open: 'never' }]
  ],
  use: {
    baseURL: `http://${APP_HOST}:${APP_PORT}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  webServer: {
    command: webServerCommand,
    url: `http://${APP_HOST}:${APP_PORT}/index.html`,
    reuseExistingServer: true,
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 120_000
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome']
      }
    }
  ]
});
