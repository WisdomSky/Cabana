import { test, expect } from '@playwright/test';
import { login, shoot, mobile, desktop, hostArch } from './helpers.js';

test('store search, categories, architecture filtering and install', async ({ page }) => {
  await login(page);
  await page.goto('/store');
  await expect(page.locator('[data-testid^="store-app-"]').first()).toBeVisible({ timeout: 30_000 });
  await shoot(page, 'store-desktop');

  const arch = await hostArch(page.request);
  const storeCount = page.getByTestId('store-count');
  const readCount = async () => {
    const text = await storeCount.textContent();
    const match = /(\d+)\s+shown/.exec(text || '');
    return Number(match?.[1] || 0);
  };

  await page.getByTestId('store-search').fill('uptime');
  await expect(page.getByTestId('store-app-org.icewhale.uptimekuma')).toBeVisible();
  await mobile(page);
  await shoot(page, 'store-mobile');
  await desktop(page);

  await page.getByTestId('store-search').fill('');
  await page.getByTestId('category-networking').click();
  await expect(page.locator('[data-testid^="store-app-"]').first()).toBeVisible();
  const networkingResponse = await page.request.get(`/api/store?category=networking&arch=${arch}`);
  const networking = await networkingResponse.json();
  await expect.poll(readCount).toBe(networking.total);
  const cardTexts = await page.locator('[data-testid^="store-app-"]').allTextContents();
  expect(cardTexts.length).toBeGreaterThan(0);
  for (const text of cardTexts) expect(text).toContain('Networking');
  await page.getByTestId('category-all').click();

  await page.getByTestId('store-search').fill('anaconda');
  const allResponse = await page.request.get('/api/store?q=anaconda&arch=all');
  const all = await allResponse.json();
  const hostResponse = await page.request.get(`/api/store?q=anaconda&arch=${arch}`);
  const compatible = await hostResponse.json();
  await expect.poll(readCount).toBe(compatible.total);
  await page.getByTestId('store-arch').selectOption('all');
  await expect.poll(readCount).toBe(all.total);
  if (all.total > 0) {
    await expect(page.getByTestId('store-app-org.icewhale.anaconda3')).toBeVisible();
  }
  await page.getByTestId('store-arch').selectOption('arm64');
  const armResponse = await page.request.get('/api/store?q=anaconda&arch=arm64');
  const arm = await armResponse.json();
  await expect.poll(readCount).toBe(arm.total);
  await page.getByTestId('store-arch').selectOption(arch);
  await shoot(page, 'store-architecture-desktop');

  await page.getByTestId('store-search').fill('uptime');
  await expect(page.getByTestId('store-app-org.icewhale.uptimekuma')).toBeVisible();
  await page.getByTestId('store-app-org.icewhale.uptimekuma').click();
  await expect(page.getByTestId('store-detail')).toBeVisible();
  await shoot(page, 'store-detail-desktop');
  await page.getByTestId('store-install').click();
  await expect(page.getByRole('dialog')).toContainText('Installed', { timeout: 240_000 });
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByTestId('store-app-org.icewhale.uptimekuma')).toContainText('Installed');
});
