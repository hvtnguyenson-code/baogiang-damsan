/**
 * Local-only browser continuation of the existing isolated B1 HTTP fixture.
 * No separate credential provisioning, production URL or bootstrap authority.
 * The real Nest server and Vite proxy are bound to the standard test loopback ports.
 */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient, User } from '@prisma/client';
import { chromium, type Browser, type Page } from 'playwright';
import { expect as browserExpect } from '@playwright/test';
import { materializeTemplateGrants, type MaterializeTemplateOptions } from '../../src/capabilities/responsibility-template-catalog';
import { testOrigin, testPassword } from './phase01-test-harness';
import { resolveSafeTestDatabaseUrl } from './test-database-safety';

type Person = Pick<User, 'id' | 'username'>;
type Fixture = {
  app: INestApplication;
  db: PrismaClient;
  schema: string;
  admin: Person;
  issuer: Person;
  principal: Person;
  pht: Person;
  person: (label: string) => Promise<Person>;
};

async function capture(page: Page, folder: string, label: string) {
  for (const width of [1366, 375]) {
    await page.setViewportSize({ width, height: width === 1366 ? 768 : 812 });
    await page.evaluate(() => document.fonts.ready);
    browserExpect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: resolve(folder, label + '-' + width + '.png') });
  }
  await page.setViewportSize({ width: 1366, height: 768 });
}

async function login(browser: Browser, user: Person, firstLogin = false) {
  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 }, serviceWorkers: 'block',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  try {
    await page.goto(testOrigin + '/', { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await browserExpect(page).toHaveURL(/\/dang-nhap$/);
    await page.getByLabel('Tên đăng nhập', { exact: true }).fill(user.username);
    await page.getByLabel('Mật khẩu', { exact: true }).fill(testPassword);
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    if (firstLogin) {
      await browserExpect(page).toHaveURL(/\/doi-mat-khau-lan-dau$/);
      const renewed = testPassword + 'A1';
      await page.getByLabel('Mật khẩu hiện tại').fill(testPassword);
      await page.getByLabel('Mật khẩu mới', { exact: true }).fill(renewed);
      await page.getByLabel('Xác nhận mật khẩu mới').fill(renewed);
      await page.getByRole('button', { name: 'Đổi mật khẩu', exact: true }).click();
    }
    await browserExpect(page).toHaveURL(testOrigin + '/');
    await browserExpect(page.locator('main h1').first()).toBeVisible();
    const identity = await page.request.get(testOrigin + '/api/auth/me');
    browserExpect(identity.status()).toBe(200);
    const auth = await identity.json();
    browserExpect(auth.user.id).toBe(user.id);
    browserExpect(auth.user.mustChangePassword).toBe(false);
    return { context, page };
  } catch (error) {
    await context.close();
    throw error;
  }
}

export async function runB1LocalBrowserAcceptance(fixture: Fixture) {
  const url = new URL(resolveSafeTestDatabaseUrl(process.env) ?? 'http://invalid.local');
  if (process.env.B1_LOCAL_BROWSER_ACCEPTANCE !== '1' || process.env.CI === 'true'
      || process.env.NODE_ENV !== 'test' || process.env.BAOGIANG_ALLOW_DESTRUCTIVE_TEST_DB !== '1'
      || url.hostname !== '127.0.0.1' || url.pathname !== '/baogiang_test'
      || !/^b1http_[0-9a-f]{32}$/.test(fixture.schema)) {
    throw new Error('B1_BROWSER_LOCAL_CERTIFIED_FIXTURE_REQUIRED');
  }
  const { app, db, admin, issuer, principal, pht, person } = fixture;
  const root = resolve(__dirname, '../../../..');
  const folder = resolve(root, 'tests/e2e/test-results/p5-057-b1-live', fixture.schema);
  mkdirSync(folder, { recursive: true });
  // The existing HTTP test ended with both seats empty and intact personal rights.
  const teacher = await person('browser-teacher');
  const leader = await person('browser-leader');
  const gddp = await person('browser-gddp');
  const hdtn = await person('browser-hdtn');
  for (const [user, displayName] of [
    [teacher, 'Giáo viên kiểm thử'], [leader, 'Tổ trưởng kiểm thử'],
    [gddp, 'Điều phối GDĐP kiểm thử'], [hdtn, 'Điều phối HĐTN kiểm thử'],
  ] as const) {
    await db.staffProfile.create({ data: { userId: user.id, displayName, isTeachingStaff: true } });
  }
  const group = await db.subjectGroup.create({ data: { code: 'B1-UAT-TO', name: 'Tổ kiểm thử' } });
  const subject = await db.subject.create({ data: { code: 'B1-UAT-MON', name: 'Môn kiểm thử' } });
  const year = await db.academicYear.create({ data: { code: 'B1-UAT', name: 'Năm học kiểm thử' } });
  const gddpMaster = await db.programmeMaster.create({ data: {
    academicYearId: year.id, kind: 'GDDP', gradeLevel: 10, createdByUserId: admin.id,
  } });
  const hdtnMaster = await db.programmeMaster.create({ data: {
    academicYearId: year.id, kind: 'HDTN_HN', gradeLevel: null, createdByUserId: admin.id,
  } });
  const seed = async (user: Person, template: MaterializeTemplateOptions) => {
    for (const spec of materializeTemplateGrants(template)) {
      const existing = await db.capabilityDefinition.findUnique({ where: { key: spec.capabilityKey } });
      const allowedScopeTypes = [...new Set([...(existing?.allowedScopeTypes ?? []), spec.scopeType])];
      await db.capabilityDefinition.upsert({ where: { key: spec.capabilityKey },
        update: { allowedScopeTypes },
        create: { key: spec.capabilityKey, description: spec.description,
          allowedScopeTypes, isSystem: true, isActive: true },
      });
      await db.capabilityGrant.create({ data: {
        userId: user.id, capabilityKey: spec.capabilityKey, scopeType: spec.scopeType,
        scopeResourceId: spec.scopeResourceId ?? null,
        validFrom: new Date(Date.now() - 60_000), grantedByUserId: issuer.id,
      } });
    }
  };
  await seed(teacher, { templateKey: 'TEACHER' });
  await seed(leader, { templateKey: 'SUBJECT_LEADER', subjectGroupId: group.id, resolvedSubjectIds: [subject.id] });
  await seed(gddp, { templateKey: 'GDDP_COORDINATOR', programmeMasterId: gddpMaster.id });
  await seed(hdtn, { templateKey: 'HDTN_COORDINATOR', programmeMasterId: hdtnMaster.id });
  await db.user.update({ where: { id: pht.id }, data: { mustChangePassword: true } });

  // Reuse the real API module, fixture users and actual transactional writer.
  // No route interception or fake API responses.
  if (app.getHttpServer().listening) throw new Error('B1_BROWSER_FIXTURE_ALREADY_LISTENING');
  await app.listen(3100, '127.0.0.1');
  const browser = await chromium.launch({ headless: true });
  try {
    const adminSession = await login(browser, admin);
    try {
      const page = adminSession.page;
      await capture(page, folder, 'admin-workspace');
      await page.locator('main a[href="/quan-tri/nguoi-dung"]').first().click();
      for (const [user, role, label] of [
        [pht, 'VICE_PRINCIPAL_ACADEMIC', 'pht'], [principal, 'PRINCIPAL', 'principal'],
      ] as const) {
        await page.getByRole('button', { name: 'Chọn ' + user.username, exact: true }).click();
        await page.getByRole('button', { name: 'Chức trách lãnh đạo', exact: true }).click();
        await page.getByLabel('Chức trách', { exact: true }).selectOption(role);
        await page.getByRole('button', { name: 'Kiểm tra chức trách', exact: true }).click();
        await browserExpect(page.getByRole('checkbox', { name: /Tôi xác nhận/ })).toBeEnabled();
        await capture(page, folder, label + '-appointment');
        await page.getByRole('checkbox', { name: /Tôi xác nhận/ }).check();
        const result = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/role-appointments/commands'
          && r.request().method() === 'POST');
        await page.getByRole('button', { name: /Xác nhận ghi nhận bổ nhiệm/i }).click();
        browserExpect((await result).status()).toBe(200);
        await browserExpect(page.getByText(/Ghi nhận bổ nhiệm .* thành công\./)).toBeVisible();
      }
      browserExpect(await db.roleAppointment.count({ where: {
        templateKey: { in: ['PRINCIPAL', 'VICE_PRINCIPAL_ACADEMIC'] },
        validUntil: null, cancelledAt: null,
      } })).toBe(2);
      browserExpect(await db.capabilityGrant.count({ where: {
        userId: pht.id, capabilityKey: 'ADDITIONAL_DUTY_CATALOG_MANAGE', revokedAt: null,
      } })).toBe(1);
      console.info('B1_LIVE_BROWSER_ADMIN_APPOINTMENTS_PASS');
    } finally { await adminSession.context.close(); }

    const personas: Array<{ label: string; user: Person; first?: boolean; routes: string[] }> = [
      { label: 'teacher', user: teacher, routes: ['/lich-day', '/bao-cao-ke-khai'] },
      { label: 'subject-leader', user: leader, routes: ['/lich-day', '/quan-tri/ppct/nhap',
        '/quan-tri/kiem-nhiem/phan-cong', '/bao-cao-ke-khai/duoc-xem'] },
      { label: 'pht', user: pht, first: true, routes: ['/lich-day', '/quan-tri/thoi-khoa-bieu',
        '/quan-tri/ppct/nhap', '/quan-tri/san-sang-du-lieu', '/quan-tri/dieu-hanh-chuyen-mon',
        '/phe-duyet-bao-cao', '/quan-tri/chuong-trinh-dac-thu', '/quan-tri/kiem-nhiem/danh-muc'] },
      { label: 'principal', user: principal, routes: ['/phe-duyet-bao-cao', '/quan-tri/nhat-ky'] },
      { label: 'gddp', user: gddp, routes: ['/quan-tri/chuong-trinh-dac-thu'] },
      { label: 'hdtn', user: hdtn, routes: ['/quan-tri/chuong-trinh-dac-thu'] },
    ];
    for (const persona of personas) {
      const session = await login(browser, persona.user, persona.first);
      try {
        const page = session.page;
        const authResponse = await page.request.get(testOrigin + '/api/auth/me');
        const auth = await authResponse.json();
        for (const key of ['USER_MANAGE', 'CAPABILITY_GRANT', 'SYSTEM_ADMIN',
          'AI_CONFIGURE_POLICY', 'AI_VIEW_USAGE', 'AI_VIEW_COST', 'AI_VIEW_AUDIT', 'AI_DISABLE_SYSTEM']) {
          browserExpect(auth.capabilities.some((c: { key: string }) => c.key === key)).toBe(false);
        }
        await browserExpect(page.locator('main a[href="/quan-tri/nguoi-dung"]')).toHaveCount(0);
        await browserExpect(page.locator('main a[href="/quan-tri/quyen"]')).toHaveCount(0);
        await capture(page, folder, persona.label + '-workspace');
        for (const route of persona.routes) {
          await page.locator('main a[href="' + route + '"]').first().click();
          await browserExpect(page).toHaveURL(testOrigin + route);
          await browserExpect(page.locator('main h1').first()).toBeVisible();
          await page.goBack();
          await browserExpect(page).toHaveURL(testOrigin + '/');
        }
        console.info('B1_LIVE_BROWSER_PERSONA_PASS ' + persona.label + ' ' + persona.routes.length + ' routes');
      } finally { await session.context.close(); }
    }
    console.info('B1_LIVE_BROWSER_7_PERSONAS_PASS (synthetic users; actual HTTP and database; navigation and B1 appointment only)');
  } finally { await browser.close(); }
}
