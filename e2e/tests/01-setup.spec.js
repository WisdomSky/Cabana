import { test, expect } from '@playwright/test';
import { ADMIN, login, logout, shoot, mobile, desktop } from './helpers.js';

test.describe.configure({ mode: 'serial' });

test('first-run setup, dashboard, logout and login', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/setup');
  await expect(page.getByRole('heading', { name: 'Welcome to Cabana' })).toBeVisible();
  await shoot(page, 'setup-desktop');
  await mobile(page);
  await shoot(page, 'setup-mobile');
  await desktop(page);

  await page.getByTestId('setup-username').fill(ADMIN.username);
  await page.getByTestId('setup-password').fill(ADMIN.password);
  await page.getByTestId('setup-confirm').fill(ADMIN.password);
  await page.getByTestId('setup-submit').click();
  await page.waitForURL((url) => url.pathname === '/', { timeout: 30_000 });

  await expect(page.getByTestId('metric-cpu')).toBeVisible();
  await expect(page.getByTestId('metric-cpu')).toContainText('%');
  await expect(page.getByTestId('metric-memory')).toContainText(/[0-9]/);
  await expect(page.getByTestId('metric-disk')).toContainText(/[0-9]/);
  await expect(page.getByTestId('metric-network')).toContainText(/[0-9]/);
  await expect(page.getByTestId('logout-button')).toBeAttached();
  await page.waitForTimeout(2200);
  await shoot(page, 'dashboard-desktop');
  await mobile(page);
  await shoot(page, 'dashboard-mobile');
  await desktop(page);

  await logout(page);
  await expect(page.getByRole('heading', { name: 'Sign in to Cabana' })).toBeVisible();
  await shoot(page, 'login-desktop');
  await mobile(page);
  await shoot(page, 'login-mobile');
  await desktop(page);

  await page.getByTestId('login-username').fill(ADMIN.username);
  await page.getByTestId('login-password').fill('definitely-wrong');
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('login-error')).toContainText(/invalid/i);

  await page.getByTestId('login-password').fill(ADMIN.password);
  await page.getByTestId('login-submit').click();
  await page.waitForURL((url) => url.pathname === '/', { timeout: 30_000 });

  await page.goto('/setup');
  await expect.poll(() => new URL(page.url()).pathname).toBe('/');
  await logout(page);
  await page.goto('/setup');
  await expect(page).toHaveURL(/\/login$/);

  expect(errors).toEqual([]);
});
