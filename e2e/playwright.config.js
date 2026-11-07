import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.CABANA_E2E_BASE_URL || 'http://127.0.0.1:8088';

export default defineConfig({
  testDir: './tests',
  testMatch: process.env.CABANA_E2E_SMOKE ? '**/smoke.spec.js' : '**/[0-9][0-9]-*.spec.js',
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 20_000 },
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  outputDir: 'test-results',
  use: {
    baseURL,
    viewport: { width: 1440, height: 900 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'off',
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: process.env.CABANA_E2E_BASE_URL
    ? undefined
    : {
        command: 'bash ./start-server.sh',
        url: 'http://127.0.0.1:8088/api/health',
        reuseExistingServer: false,
        timeout: 60_000,
        stdout: 'pipe',
        stderr: 'pipe',
      },
});
