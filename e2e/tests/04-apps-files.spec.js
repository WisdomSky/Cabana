import path from 'node:path';
import { test, expect } from '@playwright/test';
import {
  login,
  shoot,
  mobile,
  desktop,
  uploadFile,
  createFolder,
  navigateFiles,
} from './helpers.js';

const KUMA = 'org.icewhale.uptimekuma';
const ECHO = 'echo-test';
const fixture = path.resolve('fixtures/hello.txt');

async function goRoot(page) {
  await page.getByTestId('files-breadcrumb').getByRole('button').first().click();
  await page.waitForTimeout(300);
}

async function expectHttpOk(page, url, timeout = 90_000) {
  const deadline = Date.now() + timeout;
  let lastStatus = null;
  while (Date.now() < deadline) {
    try {
      const response = await page.request.get(url, { maxRedirects: 0, timeout: 10_000 });
      lastStatus = response.status();
      if (lastStatus < 500) return response;
    } catch {
      // app may still be starting
    }
    await page.waitForTimeout(1000);
  }
  throw new Error(`App at ${url} did not respond below 500 (last status ${lastStatus})`);
}

test('store app lifecycle preserves data, custom Compose works, and privileged input needs confirmation', async ({ page }) => {
  await login(page);
  await page.goto('/apps');
  const kumaRow = page.getByTestId(`app-row-${KUMA}`);
  await expect(kumaRow).toBeVisible({ timeout: 30_000 });
  await expect(kumaRow).toContainText(/running/i, { timeout: 120_000 });
  await shoot(page, 'apps-desktop');
  await mobile(page);
  await shoot(page, 'apps-mobile');
  await desktop(page);

  const host = new URL(page.url()).hostname;
  let appResponse = await expectHttpOk(page, `http://${host}:3001/`, 60_000);
  expect(appResponse.status()).toBeLessThan(500);

  await page.getByTestId(`stop-${KUMA}`).click();
  await expect(kumaRow).toContainText(/stopped/i, { timeout: 30_000 });
  await page.getByTestId(`start-${KUMA}`).click();
  await expect(kumaRow).toContainText(/running/i, { timeout: 60_000 });
  appResponse = await expectHttpOk(page, `http://${host}:3001/`);
  expect(appResponse.status()).toBeLessThan(500);

  await page.goto('/files');
  await expect(page.getByTestId('files-breadcrumb')).toBeVisible();
  await navigateFiles(page, ['AppData', 'uptimekuma']);
  await createFolder(page, 'keep');
  await navigateFiles(page, ['keep']);
  await uploadFile(page, fixture, 'hello.txt');
  await shoot(page, 'files-desktop');
  await mobile(page);
  await shoot(page, 'files-mobile');
  await desktop(page);

  await page.goto('/apps');
  await expect(kumaRow).toBeVisible();
  await page.getByTestId(`uninstall-${KUMA}`).click();
  await expect(page.getByTestId('uninstall-delete-data')).not.toBeChecked();
  await shoot(page, 'uninstall-preserve-desktop');
  await page.getByTestId('uninstall-confirm').click();
  await expect(kumaRow).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByTestId('toast').last()).toContainText(/preserved/i);

  await page.goto('/files');
  await navigateFiles(page, ['AppData', 'uptimekuma', 'keep']);
  await expect(page.getByTestId('file-hello.txt')).toBeVisible();

  await page.goto('/store');
  await page.getByTestId('store-search').fill('uptime');
  await expect(page.getByTestId(`store-app-${KUMA}`)).toBeVisible();
  await page.getByTestId(`store-app-${KUMA}`).click();
  await expect(page.getByTestId('store-detail')).toBeVisible();
  await page.getByTestId('store-install').click();
  await expect(page.getByRole('dialog')).toContainText('Installed', { timeout: 240_000 });
  await page.getByRole('button', { name: 'Close', exact: true }).click();

  await page.goto('/apps');
  await expect(kumaRow).toBeVisible();
  await page.getByTestId(`uninstall-${KUMA}`).click();
  await page.getByTestId('uninstall-delete-data').check();
  await page.getByTestId('uninstall-confirm').click();
  await expect(kumaRow).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByTestId('toast').last()).toContainText(/deleted/i);
  const listing = await page.request.get('/api/files?root=0&path=AppData');
  const listingBody = await listing.json();
  expect(listingBody.items.some((item) => item.name === 'uptimekuma')).toBe(false);

  await page.goto('/apps');
  await page.getByTestId('import-compose').click();
  await page.getByTestId('custom-title').fill('Echo Test');
  await page.getByTestId('custom-compose').fill(`services:
  echo:
    image: traefik/whoami:v1.10
    ports:
      - "18081:80"
    volumes:
      - /DATA/AppData/$AppID/data:/data
`);
  await page.getByTestId('custom-analyze').click();
  await expect(page.getByTestId('custom-analysis')).toBeVisible();
  await expect(page.getByTestId('custom-confirm')).toHaveCount(0);
  await shoot(page, 'custom-compose-desktop');
  await page.getByTestId('custom-install').click();
  await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 240_000 });
  const echoRow = page.getByTestId(`app-row-${ECHO}`);
  await expect(echoRow).toBeVisible();
  await expect(echoRow).toContainText(/running/i, { timeout: 60_000 });
  const echoResponse = await expectHttpOk(page, `http://${host}:18081/`, 60_000);
  expect(echoResponse.status()).toBe(200);
  expect(await echoResponse.text()).toContain('Hostname:');

  await page.goto('/files');
  await navigateFiles(page, ['AppData', ECHO, 'data']);
  await uploadFile(page, fixture, 'hello.txt');
  await goRoot(page);
  await createFolder(page, 'persistence');
  await navigateFiles(page, ['persistence']);
  await uploadFile(page, fixture, 'hello.txt');

  await page.goto('/apps');
  await page.getByTestId('import-compose').click();
  await page.getByTestId('custom-title').fill('Risky Test');
  await page.getByTestId('custom-compose').fill(`services:
  risky:
    image: busybox:1
    privileged: true
    network_mode: host
    command: ["sleep", "infinity"]
`);
  await page.getByTestId('custom-analyze').click();
  await expect(page.getByTestId('custom-analysis')).toContainText('privileged');
  await expect(page.getByTestId('custom-confirm')).toBeVisible();
  await expect(page.getByTestId('custom-install')).toBeDisabled();
  await shoot(page, 'custom-privileged-confirmation-desktop');
  await page.getByTestId('custom-confirm').check();
  await expect(page.getByTestId('custom-install')).toBeEnabled();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByTestId('custom-confirm')).toHaveCount(0);
});
