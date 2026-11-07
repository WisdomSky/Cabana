import fs from 'node:fs';
import path from 'node:path';
import { expect } from '@playwright/test';

export const ADMIN = { username: 'admin', password: 'cabana-e2e-123' };
export const ADMIN_NEW = { username: 'admin', password: 'cabana-e2e-456' };

export const SCREENSHOTS = path.resolve('screenshots');
fs.mkdirSync(SCREENSHOTS, { recursive: true });

export async function login(page, credentials = ADMIN) {
  await page.goto('/login');
  await page.getByTestId('login-username').fill(credentials.username);
  await page.getByTestId('login-password').fill(credentials.password);
  await page.getByTestId('login-submit').click();
  await page.waitForURL((url) => url.pathname === '/', { timeout: 30_000 });
  await expect(page.getByTestId('logout-button')).toBeAttached();
}

export async function logout(page) {
  await page.getByTestId('logout-button').click();
  await page.waitForURL(/\/login$/);
}

export async function shoot(page, name, { fullPage = true } = {}) {
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(SCREENSHOTS, `${name}.png`), fullPage });
}

export async function mobile(page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
}

export async function desktop(page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(200);
}

export async function hostArch(request) {
  const response = await request.get('/api/health');
  const body = await response.json();
  return body.arch;
}

export async function gotoApp(page, name) {
  await page.getByTestId(`nav-${name}`).click().catch(async () => {
    await page.goto(`/${name === 'dashboard' ? '' : name}`);
  });
  await page.waitForTimeout(300);
}

export async function createFolder(page, name) {
  await page.getByTestId('mkdir-button').click();
  await page.getByTestId('mkdir-name').fill(name);
  await page.getByTestId('mkdir-confirm').click();
  await expect(page.getByTestId(`file-${name}`)).toBeVisible();
}

export async function uploadFile(page, filePath, expectedName) {
  await page.getByTestId('upload-input').setInputFiles(filePath);
  await expect(page.getByTestId(`file-${expectedName}`)).toBeVisible({ timeout: 20_000 });
}

export async function navigateFiles(page, segments) {
  for (const segment of segments) {
    await page.getByTestId(`file-${segment}`).getByRole('button', { name: segment }).click();
    await expect(page.getByTestId('files-breadcrumb')).toContainText(segment);
  }
}
