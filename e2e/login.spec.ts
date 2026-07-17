import { test, expect } from '@playwright/test';
import { buildMockJwt } from './fixtures/mock-jwt';

test.describe('Login', () => {
  test('colaborador logs in and lands on /inicio', async ({ page }) => {
    const token = buildMockJwt({ clientId: 'client-e2e-1', sub: 'user-e2e-1' });

    await page.route('**/api/auth/login', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          _id: 'user-e2e-1',
          name: 'Colaborador E2E',
          email: 'colaborador.e2e@viatika.com',
          access_token: token,
          role: { name: 'Colaborador' },
          isActive: true,
          companyId: 'client-e2e-1',
          permissions: { modules: [], canApproveL1: false, canApproveL2: false },
        }),
      });
    });

    await page.goto('/login');
    await page.getByLabel('Email').fill('colaborador.e2e@viatika.com');
    await page.getByLabel('Contraseña').fill('Password123');
    await page.getByRole('button', { name: 'Entrar' }).click();

    await expect(page).toHaveURL(/\/inicio/);
  });

  test('shows an error notification on invalid credentials', async ({ page }) => {
    await page.route('**/api/auth/login', async (route) => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Credenciales inválidas' }),
      });
    });

    await page.goto('/login');
    await page.getByLabel('Email').fill('nadie@viatika.com');
    await page.getByLabel('Contraseña').fill('wrong-password');
    await page.getByRole('button', { name: 'Entrar' }).click();

    await expect(page).toHaveURL(/\/login/);
  });
});
