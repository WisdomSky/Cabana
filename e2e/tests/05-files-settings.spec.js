import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { login, logout, shoot, mobile, desktop, uploadFile, createFolder, ADMIN, ADMIN_NEW } from './helpers.js';

const fixture = path.resolve('fixtures/hello.txt');

test('file operations and settings, including password change and store refresh', async ({ page }) => {
  await login(page);
  await page.goto('/files');
  await createFolder(page, 'e2e-files');
  await page.getByTestId('file-e2e-files').getByRole('button', { name: 'e2e-files' }).click();
  await uploadFile(page, fixture, 'hello.txt');

  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('download-hello.txt').click();
  const download = await downloadPromise;
  const saved = path.join('test-results', 'downloaded-hello.txt');
  fs.mkdirSync('test-results', { recursive: true });
  await download.saveAs(saved);
  expect(fs.readFileSync(saved, 'utf8')).toContain('hello from cabana e2e');

  await page.getByTestId('rename-hello.txt').click();
  await page.getByTestId('rename-name').fill('renamed.txt');
  await page.getByTestId('rename-confirm').click();
  await expect(page.getByTestId('file-renamed.txt')).toBeVisible();

  await page.getByTestId('files-breadcrumb').getByRole('button').first().click();
  await page.getByTestId('delete-e2e-files').click();
  await page.getByTestId('delete-recursive').check();
  await page.getByTestId('delete-confirm').click();
  await expect(page.getByTestId('file-e2e-files')).toHaveCount(0);

  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Server settings' })).toBeVisible();
  await shoot(page, 'settings-desktop');
  await mobile(page);
  await shoot(page, 'settings-mobile');
  await desktop(page);

  await page.getByTestId('settings-puid').fill('1001');
  await page.getByTestId('settings-pgid').fill('1001');
  await page.getByTestId('settings-tz').fill('UTC');
  await page.getByTestId('settings-save-defaults').click();
  await expect(page.getByTestId('toast').last()).toContainText('defaults saved');

  await page.getByTestId('settings-store-refresh').click();
  await expect(page.getByTestId('toast').last()).toContainText(/refreshed|apps/i, { timeout: 60_000 });

  await page.getByTestId('current-password').fill(ADMIN.password);
  await page.getByTestId('new-password').fill(ADMIN_NEW.password);
  await page.getByTestId('confirm-password').fill(ADMIN_NEW.password);
  await page.getByTestId('password-submit').click();
  await expect(page.getByTestId('toast').last()).toContainText(/password updated/i);

  await logout(page);
  await login(page, ADMIN_NEW);
  await page.goto('/settings');
  await page.getByTestId('current-password').fill(ADMIN_NEW.password);
  await page.getByTestId('new-password').fill(ADMIN.password);
  await page.getByTestId('confirm-password').fill(ADMIN.password);
  await page.getByTestId('password-submit').click();
  await expect(page.getByTestId('toast').last()).toContainText(/password updated/i);

  await page.getByTestId('settings-puid').fill('1000');
  await page.getByTestId('settings-pgid').fill('1000');
  await page.getByTestId('settings-save-defaults').click();
  await expect(page.getByTestId('toast').last()).toContainText('defaults saved');
});
