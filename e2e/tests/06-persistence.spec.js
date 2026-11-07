import { test, expect } from '@playwright/test';
import { login, shoot } from './helpers.js';

test('@persistence administrator, files, and app data survive a reboot and installer rerun', async ({ page }) => {
  await login(page);
  const health = await (await page.request.get('/api/health')).json();
  expect(health.needsSetup).toBe(false);
  expect(health.status).toBe('ok');

  const appsResponse = await page.request.get('/api/apps');
  expect(appsResponse.ok()).toBeTruthy();
  const apps = await appsResponse.json();
  const echo = apps.apps.find((app) => app.id === 'echo-test');
  expect(echo).toBeTruthy();
  expect(echo.status).toBe('running');

  const host = new URL(page.url()).hostname;
  const echoResponse = await page.request.get(`http://${host}:18081/`, { timeout: 15_000 });
  expect(echoResponse.status()).toBe(200);

  const marker = await page.request.get('/api/files?root=0&path=persistence');
  const markerBody = await marker.json();
  expect(markerBody.items.some((item) => item.name === 'hello.txt')).toBe(true);

  const appData = await page.request.get('/api/files?root=0&path=AppData%2Fecho-test%2Fdata');
  const appDataBody = await appData.json();
  expect(appDataBody.items.some((item) => item.name === 'hello.txt')).toBe(true);

  await page.goto('/');
  await expect(page.getByTestId('dashboard-app-echo-test')).toBeVisible();
  await shoot(page, 'persistence-desktop');
});
