import { expect, request as playwrightRequest, test } from '@playwright/test';
import { API_URL } from '../playwright.config';

test('auth cookie flow, first password change, logout, and CSRF rejection', async () => {
  const api = await playwrightRequest.newContext({ baseURL: API_URL });
  const anonymous = await api.get('/api/auth/me');
  expect(anonymous.status()).toBe(401);

  const login = await api.post('/api/auth/login', {
    data: { username: 'e2e-admin', password: 'E2eBootstrapPassword9' },
  });
  expect(login.ok()).toBeTruthy();
  expect((await login.json()).user.mustChangePassword).toBe(true);
  expect((await api.get('/api/auth/me')).ok()).toBeTruthy();

  const wrongOrigin = await api.post('/api/auth/change-password', {
    headers: { Origin: 'https://attacker.invalid' },
    data: { currentPassword: 'E2eBootstrapPassword9', newPassword: 'E2eReplacementPassword8' },
  });
  expect(wrongOrigin.status()).toBe(403);

  const changed = await api.post('/api/auth/change-password', {
    headers: { Origin: 'http://127.0.0.1:5173' },
    data: { currentPassword: 'E2eBootstrapPassword9', newPassword: 'E2eReplacementPassword8' },
  });
  expect(changed.ok()).toBeTruthy();
  expect((await (await api.get('/api/auth/me')).json()).user.mustChangePassword).toBe(false);

  const logout = await api.post('/api/auth/logout', { headers: { Origin: 'http://127.0.0.1:5173' } });
  expect(logout.ok()).toBeTruthy();
  expect((await api.get('/api/auth/me')).status()).toBe(401);

  const oldPassword = await api.post('/api/auth/login', { data: { username: 'e2e-admin', password: 'E2eBootstrapPassword9' } });
  expect(oldPassword.status()).toBe(401);
  const newPassword = await api.post('/api/auth/login', { data: { username: 'e2e-admin', password: 'E2eReplacementPassword8' } });
  expect(newPassword.ok()).toBeTruthy();
  await api.dispose();
});
