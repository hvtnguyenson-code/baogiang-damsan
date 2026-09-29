import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const auth = {
  user: {
    id: 'user-1',
    username: 'teacher-an',
    displayName: 'Nguyễn Văn An',
    status: 'ACTIVE',
    mustChangePassword: false,
  },
  capabilities: [
    { key: 'TEACHER_BASE', scope: 'PERSONAL' },
  ],
};

const mockContext = {
  academicYears: [{ id: 'year-1', code: '2026-2027', name: 'Năm học 2026–2027' }],
  currentAcademicYearId: 'year-1',
  weeks: [
    {
      id: 'week-1',
      calendarVersionId: 'cal-1',
      officialWeekNumber: 1,
      displayLabel: 'Tuần 1',
      startDate: '2026-09-07',
      endDate: '2026-09-12',
    },
  ],
  currentAcademicWeekId: 'week-1',
  currentCivilDate: '2026-09-07',
};

const mockTeachers = {
  items: [
    { userId: 'user-1', displayName: 'Nguyễn Văn An', code: 'GV01' },
    { userId: 'user-2', displayName: 'Trần Thị Bình', code: 'GV02' },
  ],
  page: 1,
  pageSize: 20,
  total: 2,
};

const mockMyWeekly = {
  profile: 'SCHOOL_EFFECTIVE_TEACHING_SCHEDULE_V1',
  academicYearId: 'year-1',
  academicWeekId: 'week-1',
  weekLabel: 'Tuần 1',
  teacherUserId: 'user-1',
  teacherDisplayName: 'Nguyễn Văn An',
  status: 'PASS',
  days: [
    {
      civilDate: '2026-09-07',
      weekday: 'MONDAY',
      isBlocked: false,
      slots: [
        {
          id: 'slot-1',
          civilDate: '2026-09-07',
          weekday: 'MONDAY',
          session: 'MORNING',
          timeSlotId: 'ts-1',
          slotLabel: 'Tiết 1',
          startTime: '07:00:00',
          endTime: '07:45:00',
          teacherUserId: 'user-1',
          teacherDisplayName: 'Nguyễn Văn An',
          occupancyState: 'OCCUPIED',
          sourceKind: 'BASE_TIMETABLE',
          sourceLabel: 'Lịch cơ sở',
          className: '10A1',
          subjectName: 'Toán học',
        },
        {
          id: 'slot-2',
          civilDate: '2026-09-07',
          weekday: 'MONDAY',
          session: 'MORNING',
          timeSlotId: 'ts-2',
          slotLabel: 'Tiết 2',
          startTime: '07:45:00',
          endTime: '08:30:00',
          teacherUserId: 'user-1',
          teacherDisplayName: 'Nguyễn Văn An',
          occupancyState: 'FREE',
          sourceKind: null,
          sourceLabel: null,
        },
      ],
    },
  ],
};

const mockPeerWeekly = {
  ...mockMyWeekly,
  teacherUserId: 'user-2',
  teacherDisplayName: 'Trần Thị Bình',
  days: [
    {
      civilDate: '2026-09-07',
      weekday: 'MONDAY',
      isBlocked: false,
      slots: [
        {
          id: 'slot-peer-1',
          civilDate: '2026-09-07',
          weekday: 'MONDAY',
          session: 'MORNING',
          timeSlotId: 'ts-1',
          slotLabel: 'Tiết 1',
          startTime: '07:00:00',
          endTime: '07:45:00',
          teacherUserId: 'user-2',
          teacherDisplayName: 'Trần Thị Bình',
          occupancyState: 'FREE',
          sourceKind: null,
          sourceLabel: null,
        },
      ],
    },
  ],
};

const mockSchoolWide = {
  profile: 'SCHOOL_EFFECTIVE_TEACHING_SCHEDULE_V1',
  academicYearId: 'year-1',
  civilDate: '2026-09-07',
  weekday: 'MONDAY',
  status: 'PASS',
  slots: [
    { id: 'ts-1', label: 'Tiết 1', session: 'MORNING', startTime: '07:00:00', endTime: '07:45:00' },
    { id: 'ts-2', label: 'Tiết 2', session: 'MORNING', startTime: '07:45:00', endTime: '08:30:00' },
  ],
  teachers: [
    {
      teacherUserId: 'user-1',
      teacherDisplayName: 'Nguyễn Văn An',
      slots: [
        {
          id: 'sw-u1-s1',
          civilDate: '2026-09-07',
          weekday: 'MONDAY',
          session: 'MORNING',
          timeSlotId: 'ts-1',
          slotLabel: 'Tiết 1',
          startTime: '07:00:00',
          endTime: '07:45:00',
          teacherUserId: 'user-1',
          teacherDisplayName: 'Nguyễn Văn An',
          occupancyState: 'OCCUPIED',
          sourceKind: 'BASE_TIMETABLE',
          sourceLabel: 'Lịch cơ sở',
          className: '10A1',
          subjectName: 'Toán học',
        },
      ],
    },
    {
      teacherUserId: 'user-2',
      teacherDisplayName: 'Trần Thị Bình',
      slots: [
        {
          id: 'sw-u2-s1',
          civilDate: '2026-09-07',
          weekday: 'MONDAY',
          session: 'MORNING',
          timeSlotId: 'ts-1',
          slotLabel: 'Tiết 1',
          startTime: '07:00:00',
          endTime: '07:45:00',
          teacherUserId: 'user-2',
          teacherDisplayName: 'Trần Thị Bình',
          occupancyState: 'FREE',
          sourceKind: null,
          sourceLabel: null,
        },
      ],
    },
  ],
};

const mockComparison = {
  profile: 'SCHOOL_EFFECTIVE_TEACHING_SCHEDULE_V1',
  academicYearId: 'year-1',
  academicWeekId: 'week-1',
  selfTeacher: { userId: 'user-1', displayName: 'Nguyễn Văn An' },
  peerTeacher: { userId: 'user-2', displayName: 'Trần Thị Bình' },
  status: 'PASS',
  facts: [
    {
      civilDate: '2026-09-07',
      weekday: 'MONDAY',
      startTime: '07:00:00',
      endTime: '07:45:00',
      slotLabel: 'Tiết 1',
      comparisonState: 'SELF_BUSY_PEER_FREE',
      comparisonLabel: 'Tôi bận / Đồng nghiệp trống',
      selfOccupancy: {
        occupancyState: 'OCCUPIED',
        sourceKind: 'BASE_TIMETABLE',
        sourceLabel: 'Lịch cơ sở',
        className: '10A1',
        subjectName: 'Toán học',
      },
      peerOccupancy: {
        occupancyState: 'FREE',
      },
    },
  ],
};

async function assertAccessible(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const serious = result.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
  expect(serious, serious.map((v) => `${v.id}: ${v.help}`).join('\n')).toEqual([]);
}

test.describe('Teacher Workspace — School-wide Effective Teaching Schedule E2E (P2-061)', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/auth/me') return route.fulfill({ json: auth });
      if (url.pathname === '/api/effective-schedule/context') return route.fulfill({ json: mockContext });
      if (url.pathname === '/api/effective-schedule/teachers') return route.fulfill({ json: mockTeachers });
      if (url.pathname === '/api/effective-schedule/weekly') {
        const teacherId = url.searchParams.get('teacherUserId');
        if (teacherId === 'user-2') return route.fulfill({ json: mockPeerWeekly });
        return route.fulfill({ json: mockMyWeekly });
      }
      if (url.pathname === '/api/effective-schedule/school-wide') return route.fulfill({ json: mockSchoolWide });
      if (url.pathname === '/api/effective-schedule/compare') return route.fulfill({ json: mockComparison });
      return route.fulfill({ status: 404, json: { message: 'Not found' } });
    });
  });

  test('Surface A, B, C, D: renders all four semantic surfaces, Vietnamese copy, responsive viewports', async ({ page }) => {
    await page.goto('/lich-day');

    // 1. Heading verification
    await expect(page.getByRole('heading', { level: 1, name: 'Lịch dạy' })).toBeVisible();
    await expect(page.getByText('Không gian làm việc giáo viên')).toBeVisible();

    // 2. Default: Surface B — Lịch của tôi
    await expect(page.getByText(/Lịch của tôi — Nguyễn Văn An/i)).toBeVisible();
    await expect(page.getByText('Lớp: 10A1')).toBeVisible();
    await expect(page.getByText('Môn: Toán học')).toBeVisible();
    await expect(page.getByText('Lịch cơ sở')).toBeVisible();
    await expect(page.getByText('Trống', { exact: true })).toBeVisible();

    await assertAccessible(page);

    // 3. Surface C: Toàn trường
    await page.getByLabel('Phạm vi hiển thị').selectOption('school-wide');
    await expect(page.getByRole('heading', { name: /Lịch toàn trường/i })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Nguyễn Văn An' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Trần Thị Bình' })).toBeVisible();

    // 4. Surface A & Peer Schedule: Lịch của một giáo viên
    await page.getByLabel('Phạm vi hiển thị').selectOption('peer-schedule');
    await expect(page.getByLabel('Tìm theo tên hoặc mã')).toBeVisible();
    await page.getByLabel('Danh sách giáo viên').selectOption('user-2');

    // View peer weekly
    await page.getByRole('button', { name: 'Lịch của giáo viên được chọn' }).click();
    await expect(page.getByText(/Lịch của đồng nghiệp: Trần Thị Bình/i)).toBeVisible();

    // 5. Surface D: So sánh với lịch của tôi
    await page.getByRole('button', { name: 'So sánh với lịch của tôi' }).click();
    await expect(page.getByRole('heading', { name: /So sánh lịch dạy: Tôi/i })).toBeVisible();
    await expect(page.getByText('Tôi bận / Đồng nghiệp trống')).toBeVisible();
    await expect(page.getByText(/Hệ thống không kết luận và không tự động phân công đổi tiết, coi thay/i)).toBeVisible();

    // 6. Viewport responsiveness: Mobile 360px, Tablet 768px, Desktop 1366px
    for (const viewport of [
      { width: 360, height: 740 },
      { width: 768, height: 1024 },
      { width: 1366, height: 768 },
    ]) {
      await page.setViewportSize(viewport);
      const fitsWidth = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2);
      expect(fitsWidth).toBe(true);
    }
  });

  test('Surface D fail-closed: blocked comparison renders Không thể xác định / Bị chặn and zero Trống in cells', async ({ page }) => {
    await page.route('**/api/effective-schedule/compare**', async (route) => {
      return route.fulfill({
        json: {
          profile: 'SCHOOL_EFFECTIVE_TEACHING_SCHEDULE_V1',
          academicYearId: 'year-1',
          academicWeekId: 'week-1',
          selfTeacher: { userId: 'user-1', displayName: 'Nguyễn Văn An' },
          peerTeacher: { userId: 'user-2', displayName: 'Trần Thị Bình' },
          status: 'BLOCKED',
          blockedReasons: ['Dữ liệu lịch dạy chưa đủ nhất quán để xác định.'],
          facts: [
            {
              civilDate: '2026-09-07',
              weekday: 'MONDAY',
              startTime: '07:00:00',
              endTime: '07:45:00',
              slotLabel: 'Tiết 1',
              comparisonState: 'BLOCKED',
              comparisonLabel: 'Bị chặn',
              selfOccupancy: {
                occupancyState: 'BLOCKED',
              },
              peerOccupancy: {
                occupancyState: 'BLOCKED',
              },
            },
          ],
        },
      });
    });

    await page.goto('/lich-day');
    await page.getByLabel('Phạm vi hiển thị').selectOption('peer-schedule');
    await page.getByLabel('Danh sách giáo viên').selectOption('user-2');
    await page.getByRole('button', { name: 'So sánh với lịch của tôi' }).click();

    await expect(page.getByRole('heading', { name: /So sánh lịch dạy: Tôi/i })).toBeVisible();
    await expect(page.getByText('Bị chặn', { exact: true })).toBeVisible();
    await expect(page.getByText('Dữ liệu lịch dạy chưa đủ nhất quán để xác định.')).toBeVisible();
    await expect(page.getByText('Không thể xác định / Bị chặn').first()).toBeVisible();

    // Verify ZERO "Trống" in table cells
    const cellTexts = await page.locator('td').allTextContents();
    for (const text of cellTexts) {
      expect(text).not.toContain('Trống');
    }
  });
});
