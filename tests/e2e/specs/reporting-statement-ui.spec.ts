import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Route } from '@playwright/test';

const screenshots = 'test-results/ui-foundation/reporting-statement-ui';
const yearId = '11111111-1111-4111-8111-111111111111';
const classId = '22222222-2222-4222-8222-222222222222';
const subjectId = '33333333-3333-4333-8333-333333333333';
const revisionId = '44444444-4444-4444-8444-444444444444';
const counts = { distributedElapsedCount: 18, completedCount: 15, openDebtCount: 2, lateCount: 1, unconfirmedGapCount: 1 };
const interval = { teachingAssignmentId: 'hidden', schoolClassId: classId, subjectId, validFrom: '2026-08-01', validUntil: null };
const detailRow = {
  academicYearId: yearId, schoolClassId: classId, subjectId, classification: 'COMPLETED', sourceNormalOccurrenceKey: 'hidden-occurrence',
  originalTimetableVersionId: 'hidden', originalTimetableEntryId: 'hidden', sourceCivilDate: '2026-08-18', sourceAcademicCalendarVersionId: 'hidden',
  sourceTimeSlotDefinitionId: 'hidden', sourceSlotStart: '07:00', sourceSlotEnd: '07:45', originalTeachingAssignmentId: 'hidden',
  responsibleTeacherUserId: 'hidden', ppctClassAssociationId: 'hidden', ppctPlanId: 'hidden', ppctVersionId: 'hidden', ppctItemId: 'hidden', ppctItemRevisionId: 'hidden',
  operationalLessonDispositionId: null, operationalDispositionType: null, fulfillmentExecutionId: 'hidden', fulfillmentKind: 'NORMAL', makeupTeachingScheduleId: null,
  executionCivilDate: '2026-08-18', executionAcademicCalendarVersionId: 'hidden', executionTimeSlotDefinitionId: 'hidden', actualTeacherUserId: 'hidden',
};
const workspaceBase = { academicYears: [{ id: yearId, code: '2026-2027', name: 'Năm học 2026–2027', activeCalendar: { startDate: '2026-08-01', endDate: '2027-05-31' } }], selectedAcademicYear: null };
const workspaceSelected = { academicYears: workspaceBase.academicYears, selectedAcademicYear: { ...workspaceBase.academicYears[0], schoolClasses: [{ id: classId, code: '12A3', name: 'Lớp 12A3', status: 'ACTIVE' }], subjects: [{ id: subjectId, code: 'DIA', name: 'Địa lý', status: 'ACTIVE' }] } };
const preview = { previewAsOfInstant: '2026-08-29T01:00:00.000Z', status: 'PASS', responsibilityState: 'RESPONSIBILITY_PRESENT', eligibleForSubmission: true, counts, responsibilityManifest: [interval], findings: [], sections: [{ schoolClassId: classId, subjectId, responsibilityIntervals: [interval], status: 'PASS', counts, details: [detailRow, { ...detailRow, sourceNormalOccurrenceKey: 'hidden-occurrence-2', sourceCivilDate: '2026-08-20', classification: 'PROVEN_OPEN_DEBT', fulfillmentExecutionId: null, fulfillmentKind: null, executionCivilDate: null }], findings: [] }] };
const summary = { revisionId, seriesId: 'hidden', submitterUserId: 'hidden', submitterDisplayNameSnapshot: 'Nguyễn Văn An', submitterStaffCodeSnapshot: 'GV-018', academicYearId: yearId, fromCivilDate: '2026-08-01', toCivilDate: '2026-08-31', asOfInstant: '2026-08-29T01:00:00.000Z', submittedAt: '2026-08-29T01:01:00.000Z', lifecycleState: 'SUBMITTED', predecessorRevisionId: null, supersedesRevisionId: null };
const detail = { ...summary, statementProfile: 'hidden', lifecycleToken: 'hidden', counts, sections: preview.sections, responsibilityManifest: [interval], frozenSubjectIds: [subjectId], history: [{ id: 'hidden', eventType: 'SUBMITTED', stateBefore: null, stateAfter: 'SUBMITTED', actorUserId: 'hidden', actorDisplayNameSnapshot: 'Nguyễn Văn An', actorStaffCodeSnapshot: 'GV-018', createdAt: '2026-08-29T01:01:00.000Z', causedByRevisionId: null }], allowedActions: ['APPROVE', 'REJECT'] };

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function installVisualFixture(page: Page) {
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname + new URL(request.url()).search;
    if (path === '/api/auth/me') return fulfillJson(route, { user: { id: 'user-1', username: 'teacher', displayName: 'Nguyễn Văn An', status: 'ACTIVE', mustChangePassword: false }, capabilities: [
      { key: 'REPORTING_STATEMENT_SUBMIT', scope: 'PERSONAL' }, { key: 'REPORTING_STATEMENT_READ', scope: 'PERSONAL' },
      { key: 'REPORTING_STATEMENT_READ', scope: 'SCHOOL_WIDE' }, { key: 'APPROVAL_PRINCIPAL', scope: 'SCHOOL_WIDE' },
    ] });
    if (path === '/api/reporting-statements/workspace-context') return fulfillJson(route, workspaceBase);
    if (path.startsWith('/api/reporting-statements/workspace-context?')) return fulfillJson(route, workspaceSelected);
    if (path === '/api/reporting-statements/preview') return fulfillJson(route, preview);
    if (path.startsWith('/api/reporting-statements/mine')) return fulfillJson(route, { items: [summary], page: 1, pageSize: 10, total: 1 });
    if (path === `/api/reporting-statements/${revisionId}`) return fulfillJson(route, detail);
    if (path.startsWith('/api/reporting-statements/pending-decision')) return fulfillJson(route, { items: [summary], page: 1, pageSize: 15, total: 1 });
    return fulfillJson(route, { statusCode: 404, message: 'Visual fixture route not found' }, 404);
  });
}

async function prepareScreenshot(page: Page) {
  await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }' });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => window.scrollTo(0, 0));
}

async function assertAccessibleAndResponsive(page: Page) {
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(axe.violations.filter((item) => item.impact === 'critical' || item.impact === 'serious')).toEqual([]);
  for (const width of [320, 375, 414]) {
    await page.setViewportSize({ width, height: 812 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `page overflow at ${width}px`).toBe(true);
    for (const target of await page.locator('button:visible, .primary-nav a:visible').all()) {
      const box = await target.boundingBox();
      expect(box && box.height >= 44, `touch target below 44px at ${width}px`).toBeTruthy();
    }
  }
}

test.describe('Reporting Statement UI visual fixture', () => {
  test.beforeEach(async ({ page }) => installVisualFixture(page));

  test('personal PASS workspace is evidence-led at mobile, laptop and wide desktop', async ({ page }) => {
    await page.goto('/bao-cao-ke-khai');
    await expect(page.getByRole('heading', { name: 'Báo cáo kê khai cá nhân' })).toBeVisible();
    await page.getByLabel('Từ ngày').fill('2026-08-01');
    await page.getByLabel('Đến ngày').fill('2026-08-31');
    await page.getByRole('button', { name: 'Xem trước báo cáo' }).click();
    await expect(page.getByText('Thực hiện theo lịch')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Gửi báo cáo' })).toBeEnabled();
    await assertAccessibleAndResponsive(page);
    await prepareScreenshot(page);
    for (const viewport of [{ width: 375, height: 812 }, { width: 1366, height: 768 }, { width: 1920, height: 1080 }]) {
      await page.setViewportSize(viewport);
      await page.screenshot({ path: `${screenshots}/personal-pass-${viewport.width}x${viewport.height}.png`, fullPage: true });
    }
  });

  test('approval detail keeps evidence and history before actions', async ({ page }) => {
    await page.goto(`/bao-cao-ke-khai/${revisionId}`);
    await expect(page.getByRole('heading', { name: 'Chi tiết báo cáo kê khai' })).toBeVisible();
    const evidenceBox = await page.getByRole('heading', { name: 'Bằng chứng chi tiết' }).boundingBox();
    const historyBox = await page.getByRole('heading', { name: 'Lịch sử báo cáo' }).boundingBox();
    const decisionBox = await page.getByRole('heading', { name: 'Quyết định sau khi đọc bằng chứng' }).boundingBox();
    expect(evidenceBox && historyBox && decisionBox && evidenceBox.y < historyBox.y && historyBox.y < decisionBox.y).toBeTruthy();
    await assertAccessibleAndResponsive(page);
    await prepareScreenshot(page);
    for (const viewport of [{ width: 375, height: 812 }, { width: 1366, height: 768 }]) {
      await page.setViewportSize(viewport);
      await page.screenshot({ path: `${screenshots}/approval-detail-${viewport.width}x${viewport.height}.png`, fullPage: true });
    }
  });
});
