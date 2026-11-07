import { test, expect } from '@playwright/test';
import { ADMIN, logout, shoot, mobile, desktop } from './helpers.js';

async function expectHttpOk(request, url, timeout = 120_000) {
  const deadline = Date.now() + timeout;
  let lastStatus = null;
  while (Date.now() < deadline) {
    try {
      const response = await request.get(url, { maxRedirects: 0, timeout: 10_000 });
      lastStatus = response.status();
      if (lastStatus < 500) return response;
    } catch {
      // app may still be starting
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`App at ${url} did not respond below 500 (last status ${lastStatus})`);
}

test('@smoke installer, first-run, login, and one store app install', async ({ page }) => {
  const label = process.env.CABANA_E2E_LABEL || 'smoke';
  await page.goto('/setup');
  await expect(page.getByRole('heading', { name: 'Welcome to Cabana' })).toBeVisible();
  await page.getByTestId('setup-username').fill(ADMIN.username);
  await page.getByTestId('setup-password').fill(ADMIN.password);
  await page.getByTestId('setup-confirm').fill(ADMIN.password);
  await page.getByTestId('setup-submit').click();
  await page.waitForURL((url) => url.pathname === '/', { timeout: 60_000 });
  await expect(page.getByTestId('metric-memory')).toContainText(/[0-9]/);
  const health = await (await page.request.get('/api/health')).json();
  expect(health.needsSetup).toBe(false);
  await shoot(page, `${label}-dashboard-desktop`);
  await mobile(page);
  await shoot(page, `${label}-dashboard-mobile`);
  await desktop(page);

  await logout(page);
  await page.getByTestId('login-username').fill(ADMIN.username);
  await page.getByTestId('login-password').fill(ADMIN.password);
  await page.getByTestId('login-submit').click();
  await page.waitForURL((url) => url.pathname === '/', { timeout: 30_000 });

  await page.goto('/store');
  await page.getByTestId('store-search').fill('uptime');
  await expect(page.getByTestId('store-app-org.icewhale.uptimekuma')).toBeVisible();
  await page.getByTestId('store-app-org.icewhale.uptimekuma').click();
  await expect(page.getByTestId('store-detail')).toBeVisible();
  await page.getByTestId('store-install').click();
  await expect(page.getByRole('dialog')).toContainText('Installed', { timeout: 300_000 });
  await page.getByRole('button', { name: 'Close', exact: true }).click();

  await page.goto('/apps');
  const row = page.getByTestId('app-row-org.icewhale.uptimekuma');
  await expect(row).toBeVisible({ timeout: 30_000 });
  await expect(row).toContainText(/running/i, { timeout: 120_000 });
  await shoot(page, `${label}-uptime-kuma-desktop`);

  const apps = await (await page.request.get('/api/apps')).json();
  expect(apps.apps.find((a) => a.id === 'org.icewhale.uptimekuma')?.status).toBe('running');

  if (process.env.CABANA_E2E_APP_URL) {
    const response = await expectHttpOk(page.request, process.env.CABANA_E2E_APP_URL);
    expect(response.status()).toBeLessThan(500);
  }
});
