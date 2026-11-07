import { test, expect } from '@playwright/test';
import { login, shoot, mobile, desktop } from './helpers.js';

test('dashboard and storage report real host data', async ({ page }) => {
  await login(page);
  await expect(page.getByTestId('metric-cpu')).toContainText('%');
  await page.waitForTimeout(2200);

  const dashboardResponse = await page.request.get('/api/dashboard');
  expect(dashboardResponse.ok()).toBeTruthy();
  const dashboard = await dashboardResponse.json();
  expect(dashboard.host.cpu.cores).toBeGreaterThan(0);
  expect(dashboard.host.memory.total).toBeGreaterThan(0);
  expect(dashboard.host.disk.total).toBeGreaterThan(0);
  expect(dashboard.host.hostname.length).toBeGreaterThan(0);
  expect(dashboard.docker.available).toBe(true);
  expect(dashboard.host.network.rxBytes).toBeGreaterThanOrEqual(0);

  await expect(page.getByText('Docker', { exact: true })).toBeVisible();
  await expect(page.getByText('Unavailable')).toHaveCount(0);

  await page.goto('/storage');
  await expect(page.getByRole('heading', { name: 'What this host has room for' })).toBeVisible();
  await expect(page.getByTestId('storage-filesystem').first()).toBeVisible();
  await expect(page.getByTestId('storage-root').first()).toBeVisible();
  await expect(page.getByText('No disk operations here.')).toBeVisible();
  await shoot(page, 'storage-desktop');
  await mobile(page);
  await shoot(page, 'storage-mobile');
  await desktop(page);

  const storageResponse = await page.request.get('/api/storage');
  expect(storageResponse.ok()).toBeTruthy();
  const storage = await storageResponse.json();
  expect(storage.filesystems.length).toBeGreaterThan(0);
  expect(storage.filesystems[0].total).toBeGreaterThan(0);
  expect(storage.roots[0].path.length).toBeGreaterThan(0);
  expect(storage.mountedByCabana).toEqual([]);
});
