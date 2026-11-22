import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';

test.describe.configure({ retries: 0 });
test.use({ serviceWorkers: 'block' });
const fixtures = 'P5-057 mock browser evidence';
const selected = {
  id: '11111111-1111-4111-8111-111111111111', username: 'fixture-staff',
  status: 'ACTIVE', profile: { displayName: 'Nhân sự kiểm thử', isTeachingStaff: true },
};
type Capability = { key: string; scope: string; resourceId?: string };
const rights = (keys: string[], scope = 'SCHOOL_WIDE'): Capability[] => keys.map((key) => ({ key, scope }));
const teacher = rights(['TEACHER_BASE', 'REPORTING_STATEMENT_SUBMIT', 'REPORTING_STATEMENT_READ'], 'PERSONAL');
const admin = rights(['USER_MANAGE', 'CAPABILITY_GRANT', 'AUDIT_VIEW', 'ADDITIONAL_DUTY_CATALOG_MANAGE']);
const screenshots = path.resolve('test-results/p5-057-b1-ui');

async function viewport(page: Page, label: string, width: number) {
  await page.setViewportSize({ width, height: width >= 1366 ? 768 : 896 });
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    'Horizontal overflow at ' + width).toBe(true);
  await page.screenshot({ path: path.join(screenshots, label + '-' + width + '.png') });
}

test(fixtures + ': gated Admin role confirmation at laptop and mobile widths', async ({ page }) => {
  let enabled = false;
  const writes: unknown[] = [];
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/auth/me')) return route.fulfill({ json: {
      user: { id: '22222222-2222-4222-8222-222222222222', username: 'fixture-admin',
        displayName: 'Quản trị kiểm thử', status: 'ACTIVE', mustChangePassword: false },
      capabilities: admin,
    } });
    if (url.pathname.endsWith('/users')) return route.fulfill({ json: {
      items: [selected], page: 1, pageSize: 20, total: 1,
    } });
    if (url.pathname.endsWith('/responsibility-templates')) return route.fulfill({ json: { items: [
      { key: 'TEACHER', name: 'Giáo viên', version: 'v1', description: 'Cơ sở giáo viên',
        requiresTeachingStaff: true, requiredResourceKind: 'NONE', notes: [] },
    ] } });
    if (url.pathname.endsWith('/command-context')) return route.fulfill({ json: {
      role: url.searchParams.get('role'), mode: 'READ_ONLY', canConfirm: false,
      commandSubmissionReady: enabled, verifiedTechnicalSeat: enabled, seatEnabled: enabled,
      activationBlockers: enabled ? [] : ['B1_ROLE_COMMANDS_ENABLED'], expectedSeatVersion: enabled ? '1' : null,
      expectedAuthorizationEpoch: '8', inventoryTruncated: false, activeAppointments: [],
    } });
    if (url.pathname.endsWith('/operability-preview')) return route.fulfill({ json: {
      role: url.searchParams.get('role'), targetUserId: selected.id, mode: 'READ_ONLY', canConfirm: false,
      provenanceVerified: false, eligibleTeachingStaff: true, inventoryTruncated: false,
      requiredCount: 2, capabilities: [
        { capabilityKey: 'TEACHER_BASE', scopeType: 'PERSONAL',
          sourceManagedByFullRoleWriter: false, state: 'ACTIVE_LEGACY_UNLINKED' },
        { capabilityKey: 'ADDITIONAL_DUTY_CATALOG_MANAGE', scopeType: 'SCHOOL_WIDE',
          sourceManagedByFullRoleWriter: true, state: 'MISSING' },
      ],
    } });
    if (url.pathname.endsWith('/role-appointments/commands') && route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      writes.push(body);
      return route.fulfill({ json: { state: 'APPLIED', role: body.role, operation: body.operation,
        targetUserId: body.targetUserId, sourcesOpened: 2, sourcesClosed: 0 } });
    }
    return route.fulfill({ json: { items: [], page: 1, pageSize: 20, total: 0 } });
  });
  await page.goto('/');
  await page.locator('main a[href="/quan-tri/nguoi-dung"]').first().click();
  await page.getByRole('button', { name: 'Chọn fixture-staff', exact: true }).click();
  await page.getByRole('button', { name: 'Chức trách lãnh đạo', exact: true }).click();
  await page.getByLabel('Chức trách', { exact: true }).selectOption('VICE_PRINCIPAL_ACADEMIC');
  await page.getByRole('button', { name: 'Kiểm tra chức trách', exact: true }).click();
  await expect(page.getByText('Chưa thể ghi nhận chức trách')).toBeVisible();
  await expect(page.getByRole('button', { name: /Xác nhận ghi nhận/ })).toBeDisabled();
  expect(writes).toHaveLength(0);
  await viewport(page, 'blocked', 375);
  enabled = true;
  await page.getByRole('button', { name: 'Kiểm tra chức trách', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: /Tôi xác nhận/ })).toBeEnabled();
  for (const width of [320, 375, 414, 1366]) await viewport(page, 'pht-inspection', width);
  const confirmation = page.getByRole('checkbox', { name: /Tôi xác nhận/ });
  await confirmation.focus();
  await expect(confirmation).toBeFocused();
  await page.keyboard.press('Space');
  await expect(confirmation).toBeChecked();
  await page.getByRole('button', { name: /Xác nhận ghi nhận bổ nhiệm/ }).click();
  await expect(page.getByText('Ghi nhận bổ nhiệm Phó Hiệu trưởng phụ trách chuyên môn thành công.')).toBeVisible();
  expect(writes).toEqual([{
    role: 'VICE_PRINCIPAL_ACADEMIC', operation: 'APPOINT', targetUserId: selected.id,
    expectedSeatVersion: '1', expectedAuthorizationEpoch: '8', requestKey: expect.stringMatching(/^b1-ui-/),
  }]);
});

const personas: { label: string; capabilities: Capability[]; routes: string[]; admin?: boolean }[] = [
  { label: 'teacher', capabilities: teacher, routes: ['/lich-day', '/bao-cao-ke-khai'] },
  { label: 'subject-leader', capabilities: [...teacher,
    { key: 'PPCT_MANAGE', scope: 'SUBJECT', resourceId: 'fixture-subject' },
    { key: 'REPORTING_STATEMENT_READ', scope: 'SUBJECT', resourceId: 'fixture-subject' }],
    routes: ['/lich-day', '/quan-tri/ppct/nhap', '/bao-cao-ke-khai/duoc-xem'] },
  { label: 'pht', capabilities: [...teacher, ...rights(['APPROVAL_VICE_PRINCIPAL', 'REPORTING_STATEMENT_READ',
    'TIMETABLE_MANAGE', 'PPCT_MANAGE', 'TEACHING_OPERATION_MANAGE', 'ADDITIONAL_DUTY_CATALOG_MANAGE'])],
    routes: ['/lich-day', '/quan-tri/thoi-khoa-bieu', '/quan-tri/ppct/nhap', '/quan-tri/kiem-nhiem/danh-muc',
      '/quan-tri/san-sang-du-lieu', '/phe-duyet-bao-cao', '/quan-tri/chuong-trinh-dac-thu'] },
  { label: 'principal', capabilities: [...teacher, ...rights(['APPROVAL_PRINCIPAL', 'REPORTING_STATEMENT_READ', 'AUDIT_VIEW'])],
    routes: ['/phe-duyet-bao-cao', '/quan-tri/nhat-ky'] },
  { label: 'admin', capabilities: admin, admin: true, routes: ['/quan-tri/nguoi-dung', '/quan-tri/quyen', '/quan-tri/nhat-ky'] },
  { label: 'gddp', capabilities: [...teacher, { key: 'GDDP_COORDINATOR', scope: 'ACTIVITY', resourceId: 'fixture-gddp' }],
    routes: ['/quan-tri/chuong-trinh-dac-thu'] },
  { label: 'hdtn', capabilities: [...teacher, { key: 'HĐTN_COORDINATOR', scope: 'ACTIVITY', resourceId: 'fixture-hdtn' }],
    routes: ['/quan-tri/chuong-trinh-dac-thu'] },
];
for (const persona of personas) test(fixtures + ': navigation ' + persona.label, async ({ page }) => {
  await page.route('**/api/**', (route) => route.fulfill({ json: route.request().url().endsWith('/auth/me') ? {
    user: { id: 'fixture-' + persona.label, username: 'fixture-' + persona.label, displayName: 'Vai trò kiểm thử',
      status: 'ACTIVE', mustChangePassword: false }, capabilities: persona.capabilities,
  } : { items: [], page: 1, pageSize: 20, total: 0 } }));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Vai trò kiểm thử/i })).toBeVisible();
  for (const target of persona.routes) await expect(page.locator('main a[href="' + target + '"]').first()).toBeVisible();
  if (!persona.admin) {
    await expect(page.locator('main a[href="/quan-tri/nguoi-dung"]')).toHaveCount(0);
    await expect(page.locator('main a[href="/quan-tri/quyen"]')).toHaveCount(0);
  }
  await viewport(page, persona.label + '-workspace', 1366);
  await viewport(page, persona.label + '-workspace', 375);
});
