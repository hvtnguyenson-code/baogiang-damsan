import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HomeroomAssignmentsPage } from '../pages/HomeroomAssignmentsPage';
import { jsonResponse, renderWithQuery } from './test-utils';

const year = { id: 'year-1', code: '2026-2027', name: 'Năm học 2026–2027' };
const activeClass = { id: 'class-1', code: '10A1', name: '10A1', gradeLevel: 10, status: 'ACTIVE' as const };
const inactiveClass = { id: 'class-2', code: '10A2', name: '10A2', gradeLevel: 10, status: 'INACTIVE' as const };
const teacher = { userId: 'teacher-1', username: 'old-teacher', displayName: 'Giáo viên cũ', staffCode: null, userStatus: 'DISABLED' as const, isTeachingStaff: false };

function workspace(activeCalendar = false) {
  return { businessDate: '2026-09-04', academicYear: year, activeCalendar: activeCalendar ? { id: 'calendar-1', versionNumber: 1, startDate: '2026-08-31', endDate: '2027-05-31' } : null, classes: [activeClass, inactiveClass], historicalTeachers: [teacher] };
}

describe('Homeroom administration workspace', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('renders a loading state before academic years resolve', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => undefined)));
    renderWithQuery(<HomeroomAssignmentsPage />);
    expect(screen.getByRole('status', { name: 'Đang tải dữ liệu' })).toBeInTheDocument();
  });

  it('renders the no-year state', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(jsonResponse({ items: [], page: 1, pageSize: 100, total: 0 }))));
    renderWithQuery(<HomeroomAssignmentsPage />);
    expect(await screen.findByRole('heading', { name: 'Chưa có năm học' })).toBeInTheDocument();
  });

  it('keeps retained history readable without an active calendar and does not fetch candidates', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/academic-years?')) return jsonResponse({ items: [year], page: 1, pageSize: 100, total: 1 });
      if (url.endsWith('/year-1')) return jsonResponse(workspace());
      if (url.includes('/homeroom-assignments')) return jsonResponse({ items: [{ id: 'row-1', academicYearId: 'year-1', schoolClassId: 'class-1', teacherUserId: 'teacher-1', validFrom: '2026-08-31', validUntil: null, status: 'ACTIVE', note: null, entryReason: null, replacesId: null, createdByUserId: 'actor-1', reversedByUserId: null, reversedAt: null, reversalReason: null, createdAt: '', updatedAt: '', schoolClass: activeClass, teacher }], page: 1, pageSize: 20, total: 1 });
      return jsonResponse({ items: [], page: 1, pageSize: 100, total: 0 });
    });
    vi.stubGlobal('fetch', fetchMock); renderWithQuery(<HomeroomAssignmentsPage />);
    expect(await screen.findByText('Giáo viên cũ')).toBeInTheDocument();
    expect(screen.getByText(/chưa có phiên lịch/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Kết thúc' })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => /eligible-teachers|historical-teacher-identities/.test(String(url)))).toBe(false);
  });
});
