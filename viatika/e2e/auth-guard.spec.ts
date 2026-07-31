import { test, expect } from '@playwright/test';

test.describe('Route guards', () => {
  test('unauthenticated user visiting a protected route is redirected to /login', async ({ page }) => {
    await page.goto('/mis-rendiciones');
    await expect(page).toHaveURL(/\/login/);
  });

  test('root path redirects to /login when not authenticated', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
  });
});
