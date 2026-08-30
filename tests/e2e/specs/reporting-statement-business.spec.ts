import { expect, request as playwrightRequest, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { API_URL } from '../playwright.config';

const password = 'ReportingStatementE2ePassword9';
const users = { teacher: 'e2e-rs-teacher', readerA: 'e2e-rs-reader-a', readerB: 'e2e-rs-reader-b', approver: 'e2e-rs-approver' } as const;

async function login(page: Page, username: string) {
  await page.goto('/dang-nhap');
  await page.getByLabel('Tên đăng nhập').fill(username);
  await page.getByLabel('Mật khẩu').fill(password);
  const loginResponsePromise = page.waitForResponse((response) =>
    new URL(response.url()).pathname === '/api/auth/login'
    && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  const loginResponse = await loginResponsePromise;
  expect(loginResponse.status()).toBe(200);
  await expect(page).not.toHaveURL(/dang-nhap/);
}

async function loggedInContext(browser: Browser, username: string): Promise<BrowserContext> {
  const context = await browser.newContext();
  await login(await context.newPage(), username);
  return context;
}

async function submitThroughTeacherUi(page: Page): Promise<string> {
  await page.goto('/bao-cao-ke-khai');
  await expect(page.getByRole('heading', { name: 'Báo cáo kê khai cá nhân' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Báo cáo được phép xem' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Phê duyệt báo cáo' })).toHaveCount(0);
  await page.getByLabel('Từ ngày').fill('2026-08-01');
  await page.getByLabel('Đến ngày').fill('2026-08-31');
  await page.getByRole('button', { name: 'Xem trước báo cáo' }).click();
  const previewRegion = page.getByRole('region', { name: '02 · Bằng chứng xem trước' });
  const evidenceArticle = previewRegion.getByRole('article');
  await expect(evidenceArticle.getByText('Tiết đã phân phối đến hạn', { exact: true })).toBeVisible();
  await expect(evidenceArticle.getByText('Thời gian chịu trách nhiệm', { exact: true })).toBeVisible();
  await expect(evidenceArticle.getByText('Tiết đã hoàn thành', { exact: true })).toBeVisible();
  await expect(page.locator('body')).not.toContainText(/requestKey|lifecycleToken|semanticHash|canonicalSnapshotJson|provenance/i);
  await page.getByRole('button', { name: 'Gửi báo cáo' }).click();
  await expect(page.getByText('Báo cáo chính thức đã được lưu.')).toBeVisible();
  const href = await page.getByRole('link', { name: 'Mở báo cáo vừa gửi' }).getAttribute('href');
  expect(href).toMatch(/^\/bao-cao-ke-khai\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { name: 'Báo cáo của tôi' })).toBeVisible();
  return href!.split('/').pop()!;
}

test.describe('Reporting Statement live cross-role workflow', () => {
  test.describe.configure({ retries: 0 });

  test('teacher submit, subject read boundary, approver approval, and owner terminal read', async ({ browser }) => {
    const teacher = await loggedInContext(browser, users.teacher);
    const teacherPage = teacher.pages()[0];
    const revisionId = await submitThroughTeacherUi(teacherPage);
    await teacherPage.getByRole('link', { name: 'Mở báo cáo vừa gửi' }).click();
    await expect(teacherPage.getByRole('heading', { name: 'Chi tiết báo cáo kê khai' })).toBeVisible();

    const readerA = await loggedInContext(browser, users.readerA);
    const readerAPage = readerA.pages()[0];
    await readerAPage.goto('/bao-cao-ke-khai/duoc-xem');
    await expect(readerAPage.getByRole('link', { name: 'Báo cáo kê khai' })).toHaveCount(0);
    await expect(readerAPage.getByText('Giáo viên kiểm thử')).toBeVisible();
    await readerAPage.getByRole('link', { name: /Mở báo cáo/ }).click();
    await expect(readerAPage.getByRole('heading', { name: 'Bằng chứng chi tiết' })).toBeVisible();
    await expect(readerAPage.getByRole('button', { name: /Phê duyệt|Từ chối/ })).toHaveCount(0);
    await expect(readerAPage.locator('body')).not.toContainText(/lifecycleToken|semanticHash|canonicalSnapshotJson/i);

    const readerB = await loggedInContext(browser, users.readerB);
    const readerBPage = readerB.pages()[0];
    await readerBPage.goto('/bao-cao-ke-khai/duoc-xem');
    await expect(readerBPage.getByText('Chưa có báo cáo được phép xem')).toBeVisible();
    await readerBPage.goto(`/bao-cao-ke-khai/${revisionId}`);
    await expect(readerBPage.getByText(/không có quyền|không thể tải/i)).toBeVisible();
    await expect(readerBPage.locator('body')).not.toContainText('Giáo viên kiểm thử');

    const approver = await loggedInContext(browser, users.approver);
    const approverPage = approver.pages()[0];
    await approverPage.goto('/phe-duyet-bao-cao');
    await expect(approverPage.getByText('Giáo viên kiểm thử')).toBeVisible();
    await approverPage.getByRole('link', { name: /Mở báo cáo/ }).click();
    const evidence = await approverPage.getByRole('heading', { name: 'Bằng chứng chi tiết' }).boundingBox();
    const history = await approverPage.getByRole('heading', { name: 'Lịch sử báo cáo' }).boundingBox();
    const decision = await approverPage.getByRole('heading', { name: 'Quyết định sau khi đọc bằng chứng' }).boundingBox();
    expect(evidence && history && decision && evidence.y < history.y && history.y < decision.y).toBeTruthy();
    await approverPage.getByRole('button', { name: 'Phê duyệt báo cáo' }).click();
    await expect(approverPage.getByRole('button', { name: 'Xác nhận phê duyệt' })).toBeVisible();
    await approverPage.getByRole('button', { name: 'Xác nhận phê duyệt' }).click();
    const approverIdentity = approverPage.getByRole('region', { name: 'Thông tin bản báo cáo' });
    await expect(approverIdentity.getByText('Đã phê duyệt', { exact: true })).toBeVisible();
    await expect(approverPage.getByRole('button', { name: /Phê duyệt|Từ chối/ })).toHaveCount(0);
    await approverPage.goto('/phe-duyet-bao-cao');
    await expect(approverPage.getByText('Không có báo cáo đang chờ')).toBeVisible();
    await teacherPage.reload();
    const teacherIdentity = teacherPage.getByRole('region', { name: 'Thông tin bản báo cáo' });
    const teacherHistory = teacherPage.getByRole('region', { name: 'Lịch sử báo cáo' });
    await expect(teacherIdentity.getByText('Đã phê duyệt', { exact: true })).toBeVisible();
    await expect(teacherHistory.getByText('Đã phê duyệt', { exact: true })).toBeVisible();
    await Promise.all([teacher.close(), readerA.close(), readerB.close(), approver.close()]);
  });

  test('real backend CAS conflict locks stale actions and refetches the newer detail', async ({ browser }) => {
    const teacher = await loggedInContext(browser, users.teacher);
    const revisionId = await submitThroughTeacherUi(teacher.pages()[0]);
    const staleApprover = await loggedInContext(browser, users.approver);
    const stalePage = staleApprover.pages()[0];
    await stalePage.goto(`/bao-cao-ke-khai/${revisionId}`);
    await expect(stalePage.getByRole('button', { name: 'Phê duyệt báo cáo' })).toBeVisible();
    const api = await playwrightRequest.newContext({ baseURL: API_URL });
    const apiLogin = await api.post('/api/auth/login', { data: { username: users.approver, password } });
    expect(apiLogin.ok()).toBeTruthy();
    const detail = await (await api.get(`/api/reporting-statements/${revisionId}`)).json();
    const decision = await api.post(`/api/reporting-statements/${revisionId}/approve`, { headers: { Origin: 'http://127.0.0.1:5173' }, data: { expectedLifecycleToken: detail.lifecycleToken, requestKey: crypto.randomUUID() } });
    expect(decision.status()).toBe(201);
    await stalePage.getByRole('button', { name: 'Phê duyệt báo cáo' }).click();
    await stalePage.getByRole('button', { name: 'Xác nhận phê duyệt' }).click();
    await expect(stalePage.getByText('Báo cáo đã có trạng thái mới')).toBeVisible();
    const staleIdentity = stalePage.getByRole('region', { name: 'Thông tin bản báo cáo' });
    await expect(staleIdentity.getByText('Đã phê duyệt', { exact: true })).toBeVisible();
    await expect(stalePage.getByRole('button', { name: /Phê duyệt|Từ chối/ })).toHaveCount(0);
    await api.dispose();
    await Promise.all([teacher.close(), staleApprover.close()]);
  });
});
