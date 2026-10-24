import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CapabilityKey, CapabilityScope, ScopedCapability } from '@baogiang/contracts';
import {
  NAVIGATION_FAMILIES,
  NAVIGATION_REGISTRY,
} from '../lib/navigation-registry';
import { accessibleManagementRoutes, accessibleProfessionalRoutes } from '../lib/capabilities';
import { jsonResponse, normalAuth, renderApp } from './test-utils';

function authWithCapabilities(
  capabilities: Array<{ key: CapabilityKey; scope: CapabilityScope; resourceId?: string }>,
  displayName = 'Nguyễn Văn An',
  positionTitle = 'Phó Hiệu trưởng',
) {
  return {
    ...normalAuth,
    user: {
      ...normalAuth.user,
      displayName,
      positionTitle,
    },
    capabilities,
  };
}

describe('P5-052: Task-Oriented Workspace & Information Architecture', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('Registry Invariants', () => {
    it('contains exactly 5 defined families in authoritative order', () => {
      expect(NAVIGATION_FAMILIES.map((f) => f.id)).toEqual([
        'my-work',
        'academic-data',
        'teaching-operations',
        'reporting-approval',
        'administration',
      ]);
    });

    it('preserves all 23 legacy routes and adds verified operation and readiness routes', () => {
      expect(NAVIGATION_REGISTRY.length).toBe(25);
      const allRoutes = new Set(NAVIGATION_REGISTRY.map((r) => r.to));
      expect(allRoutes.size).toBe(25);
      expect(allRoutes.has('/quan-tri/dieu-hanh-chuyen-mon')).toBe(true);
      expect(allRoutes.has('/quan-tri/san-sang-du-lieu')).toBe(true);

      // Đối soát 23/23 với các route cũ trong accessibleProfessionalRoutes và accessibleManagementRoutes
      const dummyAllCaps: ScopedCapability[] = [
        { key: 'TEACHER_BASE', scope: 'PERSONAL' },
        { key: 'REPORTING_STATEMENT_SUBMIT', scope: 'PERSONAL' },
        { key: 'REPORTING_STATEMENT_READ', scope: 'PERSONAL' },
        { key: 'REPORTING_STATEMENT_READ', scope: 'SCHOOL_WIDE' },
        { key: 'APPROVAL_PRINCIPAL', scope: 'SCHOOL_WIDE' },
        { key: 'APPROVAL_VICE_PRINCIPAL', scope: 'SCHOOL_WIDE' },
        { key: 'ACADEMIC_STRUCTURE_MANAGE', scope: 'SCHOOL_WIDE' },
        { key: 'USER_MANAGE', scope: 'SCHOOL_WIDE' },
        { key: 'SUBJECT_GROUP_MANAGE', scope: 'SCHOOL_WIDE' },
        { key: 'SUBJECT_MANAGE', scope: 'SCHOOL_WIDE' },
        { key: 'HOMEROOM_ASSIGNMENT_MANAGE', scope: 'SCHOOL_WIDE' },
        { key: 'CAPABILITY_GRANT', scope: 'SCHOOL_WIDE' },
        { key: 'AUDIT_VIEW', scope: 'SCHOOL_WIDE' },
        { key: 'ADDITIONAL_DUTY_CATALOG_MANAGE', scope: 'SCHOOL_WIDE' },
        { key: 'ADDITIONAL_DUTY_ASSIGNMENT_MANAGE', scope: 'SCHOOL_WIDE' },
        { key: 'BUSINESS_CONFIGURATION_MANAGE', scope: 'SCHOOL_WIDE' },
        { key: 'PPCT_MANAGE', scope: 'SCHOOL_WIDE' },
        { key: 'GDDP_COORDINATOR', scope: 'ACTIVITY' },
        { key: 'TEACHING_EXECUTION_MANAGE', scope: 'SCHOOL_WIDE' },
        { key: 'TEACHING_OPERATION_MANAGE', scope: 'SCHOOL_WIDE' },
        { key: 'TIMETABLE_MANAGE', scope: 'SCHOOL_WIDE' },
      ];
      const dummyAuth = { ...normalAuth, capabilities: dummyAllCaps };
      const legacyProfessional = accessibleProfessionalRoutes(dummyAuth);
      const legacyManagement = accessibleManagementRoutes(dummyAuth);
      const legacyAll = [...legacyProfessional, ...legacyManagement];

      expect(legacyAll.length).toBe(23);
      for (const legacy of legacyAll) {
        expect(allRoutes.has(legacy.to)).toBe(true);
      }
    });

    it('assigns every route to exactly one family', () => {
      const familyCounts: Record<string, number> = {};
      for (const item of NAVIGATION_REGISTRY) {
        familyCounts[item.familyId] = (familyCounts[item.familyId] ?? 0) + 1;
      }
      expect(familyCounts['my-work']).toBe(2);
      expect(familyCounts['academic-data']).toBe(13);
      expect(familyCounts['teaching-operations']).toBe(4);
      expect(familyCounts['reporting-approval']).toBe(2);
      expect(familyCounts['administration']).toBe(4);
    });
  });

  describe('Persona Fixtures (Real Grants — No Role Derivation)', () => {
    it('1. Teacher Baseline: shows My Work only, no Management or Approval', async () => {
      const teacherAuth = authWithCapabilities(
        [
          { key: 'TEACHER_BASE', scope: 'PERSONAL' },
          { key: 'REPORTING_STATEMENT_SUBMIT', scope: 'PERSONAL' },
          { key: 'REPORTING_STATEMENT_READ', scope: 'PERSONAL' },
        ],
        'Cô Giáo Viên',
        'Giáo viên',
      );
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL) => {
          const url = String(input);
          if (url.endsWith('/auth/me')) return jsonResponse(teacherAuth);
          if (url.includes('/reporting-statements/mine')) {
            return jsonResponse({ items: [], page: 1, pageSize: 1, total: 3 });
          }
          return jsonResponse({ items: [], page: 1, pageSize: 20, total: 0 });
        }),
      );

      renderApp('/');
      await screen.findByRole('heading', { name: /chào cô giáo viên/i });

      // Subtitle header trung tính
      expect(screen.getByText('Tài khoản làm việc')).toBeInTheDocument();
      expect(screen.queryByText('Không gian quản trị')).not.toBeInTheDocument();

      // Top nav chỉ có family 'Công việc của tôi'
      expect(screen.getByRole('button', { name: /công việc của tôi/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /quản trị/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /dữ liệu năm học/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /báo cáo và phê duyệt/i })).not.toBeInTheDocument();

      // Home Work Queue có lịch dạy và báo cáo cá nhân
      expect(screen.getByTestId('queue-item-schedule')).toBeInTheDocument();
      expect(screen.getByTestId('queue-item-reporting')).toBeInTheDocument();
      expect(await screen.findByText(/số báo cáo của tôi:/i)).toBeInTheDocument();
      expect(screen.getByText(/3 bản ghi/i)).toBeInTheDocument();
      expect(screen.queryByTestId('queue-item-approval')).not.toBeInTheDocument();
    });

    it('2. Subject Leader: can see duty assignment and subject PPCT, cannot approve or manage users', async () => {
      const leaderAuth = authWithCapabilities(
        [
          { key: 'TEACHER_BASE', scope: 'PERSONAL' },
          { key: 'SUBJECT_GROUP_LEAD', scope: 'SUBJECT_GROUP', resourceId: 'group-toan' },
          { key: 'REPORTING_STATEMENT_READ', scope: 'SUBJECT', resourceId: 'sub-toan' },
          { key: 'ADDITIONAL_DUTY_ASSIGNMENT_MANAGE', scope: 'SUBJECT_GROUP', resourceId: 'group-toan' },
          { key: 'PPCT_MANAGE', scope: 'SUBJECT', resourceId: 'sub-toan' },
        ],
        'Thầy Tổ Trưởng',
        'Tổ trưởng bộ môn Toán',
      );
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL) => {
          const url = String(input);
          if (url.endsWith('/auth/me')) return jsonResponse(leaderAuth);
          return jsonResponse({ items: [], page: 1, pageSize: 20, total: 0 });
        }),
      );

      renderApp('/');
      await screen.findByRole('heading', { name: /chào thầy tổ trưởng/i });

      // Không tự suy thành quyền duyệt hay quyền quản trị
      expect(screen.queryByRole('button', { name: /quản trị/i })).not.toBeInTheDocument();
      expect(screen.queryByTestId('queue-item-approval')).not.toBeInTheDocument();

      // Thấy Dữ liệu năm học (với các route được cấp thực tế: Phân công kiêm nhiệm, Nhập PPCT, Áp dụng chuyên đề)
      const nav = screen.getByRole('navigation', { name: /điều hướng chính/i });
      expect(within(nav).getByRole('button', { name: /dữ liệu năm học/i })).toBeInTheDocument();
      fireEvent.click(within(nav).getByRole('button', { name: /dữ liệu năm học/i }));
      expect(within(nav).getByRole('link', { name: 'Phân công kiêm nhiệm' })).toBeInTheDocument();
      expect(within(nav).getByRole('link', { name: 'Nhập phân phối chương trình (PPCT)' })).toBeInTheDocument();
      expect(within(nav).getByRole('link', { name: 'Áp dụng chuyên đề' })).toBeInTheDocument();
      expect(within(nav).queryByRole('link', { name: 'Cấu trúc năm học' })).not.toBeInTheDocument();
      expect(within(nav).queryByRole('link', { name: 'Người dùng' })).not.toBeInTheDocument();

      // Báo cáo được xem có mặt
      expect(within(nav).getByRole('button', { name: /báo cáo và phê duyệt/i })).toBeInTheDocument();
      fireEvent.click(within(nav).getByRole('button', { name: /báo cáo và phê duyệt/i }));
      expect(within(nav).getByRole('link', { name: 'Báo cáo được phép xem' })).toBeInTheDocument();
      expect(within(nav).queryByRole('link', { name: 'Phê duyệt báo cáo' })).not.toBeInTheDocument();
    });

    it('3. PHT / BGH: sees real pending approval count, handles zero vs positive correctly', async () => {
      const phtAuth = authWithCapabilities(
        [
          { key: 'TEACHER_BASE', scope: 'PERSONAL' },
          { key: 'APPROVAL_VICE_PRINCIPAL', scope: 'SCHOOL_WIDE' },
          { key: 'REPORTING_STATEMENT_READ', scope: 'SCHOOL_WIDE' },
          { key: 'ACADEMIC_STRUCTURE_MANAGE', scope: 'SCHOOL_WIDE' },
        ],
        'Cô Phó Hiệu Trưởng',
        'Phó Hiệu trưởng',
      );

      const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/auth/me')) return jsonResponse(phtAuth);
        if (url.includes('/reporting-statements/pending-decision')) {
          return jsonResponse({ items: [], page: 1, pageSize: 1, total: 5 });
        }
        return jsonResponse({ items: [], page: 1, pageSize: 20, total: 0 });
      });
      vi.stubGlobal('fetch', fetchMock);

      renderApp('/');
      await screen.findByRole('heading', { name: /chào cô phó hiệu trưởng/i });

      // Gọi pending-decision với pageSize: 1
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/reporting-statements/pending-decision?page=1&pageSize=1'),
        expect.anything(),
      );

      // Hiển thị số lượng thật
      expect(await screen.findByText(/có 5 báo cáo chờ phê duyệt chuyên môn/i)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /mở hàng đợi phê duyệt/i })).toHaveAttribute('href', '/phe-duyet-bao-cao');
    });

    it('4. PHT / BGH: when pending approval total === 0, shows exact zero copy', async () => {
      const phtAuth = authWithCapabilities([
        { key: 'APPROVAL_VICE_PRINCIPAL', scope: 'SCHOOL_WIDE' },
        { key: 'REPORTING_STATEMENT_READ', scope: 'SCHOOL_WIDE' },
      ]);

      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL) => {
          const url = String(input);
          if (url.endsWith('/auth/me')) return jsonResponse(phtAuth);
          if (url.includes('/reporting-statements/pending-decision')) {
            return jsonResponse({ items: [], page: 1, pageSize: 1, total: 0 });
          }
          return jsonResponse({ items: [], page: 1, pageSize: 20, total: 0 });
        }),
      );

      renderApp('/');
      expect(await screen.findByText(/không có báo cáo chờ phê duyệt/i)).toBeInTheDocument();
      expect(screen.queryByText(/có 0 báo cáo/i)).not.toBeInTheDocument();
    });

    it('5. PHT / BGH: when pending-decision fails, does NOT show fake 0 and renders safe error cue', async () => {
      const phtAuth = authWithCapabilities([
        { key: 'APPROVAL_VICE_PRINCIPAL', scope: 'SCHOOL_WIDE' },
        { key: 'REPORTING_STATEMENT_READ', scope: 'SCHOOL_WIDE' },
      ]);

      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL) => {
          const url = String(input);
          if (url.endsWith('/auth/me')) return jsonResponse(phtAuth);
          if (url.includes('/reporting-statements/pending-decision')) {
            return jsonResponse({ message: 'Internal Server Error' }, 500);
          }
          return jsonResponse({ items: [], page: 1, pageSize: 20, total: 0 });
        }),
      );

      renderApp('/');
      await screen.findByRole('heading', { name: /chào/i });
      expect(await screen.findByText(/chưa thể tải số lượng báo cáo chờ phê duyệt/i)).toBeInTheDocument();
      expect(screen.queryByText(/không có báo cáo/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/0 báo cáo/i)).not.toBeInTheDocument();
    });

    it('6. SYSTEM_ADMIN only: does NOT see Administration or Business families', async () => {
      const sysAdminAuth = authWithCapabilities(
        [{ key: 'SYSTEM_ADMIN', scope: 'SCHOOL_WIDE' }],
        'Kỹ Thuật Viên',
        'Quản trị viên CNTT',
      );
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(sysAdminAuth)));

      renderApp('/');
      await screen.findByRole('heading', { name: /chào kỹ thuật viên/i });

      // Không có bất kỳ family nào
      expect(screen.queryByRole('button', { name: /quản trị/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /công việc của tôi/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /dữ liệu năm học/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /điều hành chuyên môn/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /báo cáo và phê duyệt/i })).not.toBeInTheDocument();

      // Home hiển thị hướng dẫn an toàn
      expect(screen.getByText(/tài khoản của bạn hiện chưa được phân công/i)).toBeInTheDocument();
    });

    it('7. GDĐP / HĐTN Coordinator: sees Teaching Operations family and special programme workspace', async () => {
      const coordinatorAuth = authWithCapabilities([
        { key: 'GDDP_COORDINATOR', scope: 'ACTIVITY' },
        { key: 'HĐTN_COORDINATOR', scope: 'ACTIVITY' },
      ]);
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(coordinatorAuth)));

      renderApp('/');
      await screen.findByRole('heading', { name: /chào/i });
      const nav = screen.getByRole('navigation', { name: /điều hướng chính/i });
      expect(within(nav).getByRole('button', { name: /điều hành chuyên môn/i })).toBeInTheDocument();
      fireEvent.click(within(nav).getByRole('button', { name: /điều hành chuyên môn/i }));
      expect(within(nav).getByRole('link', { name: 'Hoạt động trải nghiệm và giáo dục địa phương' })).toBeInTheDocument();
      expect(within(nav).queryByRole('link', { name: 'Lịch dạy bù' })).not.toBeInTheDocument();
    });

    it('8. Multi-grant user: retains all assigned families without persona collision', async () => {
      const multiAuth = authWithCapabilities([
        { key: 'TEACHER_BASE', scope: 'PERSONAL' },
        { key: 'APPROVAL_VICE_PRINCIPAL', scope: 'SCHOOL_WIDE' },
        { key: 'REPORTING_STATEMENT_READ', scope: 'SCHOOL_WIDE' },
        { key: 'USER_MANAGE', scope: 'SCHOOL_WIDE' },
        { key: 'CAPABILITY_GRANT', scope: 'SCHOOL_WIDE' },
      ]);
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL) => {
          const url = String(input);
          if (url.endsWith('/auth/me')) return jsonResponse(multiAuth);
          return jsonResponse({ items: [], page: 1, pageSize: 20, total: 0 });
        }),
      );

      renderApp('/');
      await screen.findByRole('heading', { name: /chào/i });

      // Cả 3 nhóm được cấp đều có mặt đầy đủ
      const nav = screen.getByRole('navigation', { name: /điều hướng chính/i });
      expect(within(nav).getByRole('button', { name: /công việc của tôi/i })).toBeInTheDocument();
      expect(within(nav).getByRole('button', { name: /báo cáo và phê duyệt/i })).toBeInTheDocument();
      expect(within(nav).getByRole('button', { name: /quản trị/i })).toBeInTheDocument();
    });

    it('9. User without any grant: renders safe profile guidance without error assertion', async () => {
      const emptyAuth = authWithCapabilities([]);
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(emptyAuth)));

      renderApp('/');
      await screen.findByRole('heading', { name: /chào/i });

      expect(screen.getByText(/tài khoản chưa được phân công nhiệm vụ chuyên môn/i)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /xem hồ sơ cá nhân/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /kiểm tra trạng thái hệ thống/i })).toBeInTheDocument();
    });
    it('1B. Submit-only user: has REPORTING_STATEMENT_SUBMIT without READ, does NOT call listMine and shows submit CTA', async () => {
      const submitOnlyAuth = authWithCapabilities(
        [
          { key: 'TEACHER_BASE', scope: 'PERSONAL' },
          { key: 'REPORTING_STATEMENT_SUBMIT', scope: 'PERSONAL' },
        ],
        'Thầy Nộp Báo Cáo',
        'Giáo viên tập sự',
      );
      const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/auth/me')) return jsonResponse(submitOnlyAuth);
        return jsonResponse({ items: [], page: 1, pageSize: 20, total: 0 });
      });
      vi.stubGlobal('fetch', fetchSpy);

      renderApp('/');
      await screen.findByRole('heading', { name: /chào thầy nộp báo cáo/i });

      // Có queue item reporting
      expect(screen.getByTestId('queue-item-reporting')).toBeInTheDocument();
      // Hiển thị CTA nộp báo cáo, KHÔNG hiển thị "0 bản ghi" hay lỗi
      expect(screen.getByText(/lập và gửi báo cáo kê khai tiết dạy mới/i)).toBeInTheDocument();
      expect(screen.queryByText(/0 bản ghi/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/chưa thể tải/i)).not.toBeInTheDocument();

      // Kiểm chứng KHÔNG hề gọi GET /reporting-statements/mine
      const calledUrls = fetchSpy.mock.calls.map((call) => String(call[0]));
      expect(calledUrls.some((u) => u.includes('/reporting-statements/mine'))).toBe(false);

      // Nút liên kết tới /bao-cao-ke-khai
      const openBtn = screen.getByRole('link', { name: /mở báo cáo kê khai/i });
      expect(openBtn).toHaveAttribute('href', '/bao-cao-ke-khai');
    });

    it('1C. TEACHER_BASE-only user: does NOT infer reporting submit or read, listMine never called', async () => {
      const teacherBaseOnlyAuth = authWithCapabilities(
        [{ key: 'TEACHER_BASE', scope: 'PERSONAL' }],
        'Cô Giảng Dạy',
        'Giáo viên hợp đồng',
      );
      const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/auth/me')) return jsonResponse(teacherBaseOnlyAuth);
        return jsonResponse({ items: [], page: 1, pageSize: 20, total: 0 });
      });
      vi.stubGlobal('fetch', fetchSpy);

      renderApp('/');
      await screen.findByRole('heading', { name: /chào cô giảng dạy/i });

      // Lịch dạy có mặt, nhưng reporting queue KHÔNG có mặt
      expect(screen.getByTestId('queue-item-schedule')).toBeInTheDocument();
      expect(screen.queryByTestId('queue-item-reporting')).not.toBeInTheDocument();

      // listMine KHÔNG được gọi
      const calledUrls = fetchSpy.mock.calls.map((call) => String(call[0]));
      expect(calledUrls.some((u) => u.includes('/reporting-statements/mine'))).toBe(false);
    });
  });

  describe('Keyboard, Focus & Accessibility', () => {
    it('closes open dropdown when Escape key is pressed and restores focus to toggle button', async () => {
      const auth = authWithCapabilities([
        { key: 'USER_MANAGE', scope: 'SCHOOL_WIDE' },
      ]);
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(auth)));

      renderApp('/');
      await screen.findByRole('heading', { name: /chào/i });
      const nav = screen.getByRole('navigation', { name: /điều hướng chính/i });
      const adminToggle = within(nav).getByRole('button', { name: /quản trị/i });
      expect(adminToggle).toHaveAttribute('aria-expanded', 'false');
      expect(within(nav).queryByRole('link', { name: 'Người dùng' })).not.toBeInTheDocument();

      // Click để mở
      fireEvent.click(adminToggle);
      expect(adminToggle).toHaveAttribute('aria-expanded', 'true');
      const userLink = within(nav).getByRole('link', { name: 'Người dùng' });
      expect(userLink).toBeInTheDocument();
      userLink.focus();

      // Nhấn phím Escape để đóng
      fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
      expect(adminToggle).toHaveAttribute('aria-expanded', 'false');
      expect(within(nav).queryByRole('link', { name: 'Người dùng' })).not.toBeInTheDocument();
      // Bàn phím: focus được trả về đúng toggle button
      expect(document.activeElement).toBe(adminToggle);
    });

    it('manages mobile drawer with accordion and restores focus on Escape', async () => {
      const auth = authWithCapabilities([
        { key: 'USER_MANAGE', scope: 'SCHOOL_WIDE' },
        { key: 'TEACHER_BASE', scope: 'PERSONAL' },
      ]);
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(auth)));

      renderApp('/');
      await screen.findByRole('heading', { name: /chào/i });
      const mobileToggle = await screen.findByRole('button', { name: /thực đơn/i });
      expect(mobileToggle).toHaveAttribute('aria-expanded', 'false');

      // Bật thực đơn mobile
      fireEvent.click(mobileToggle);
      expect(mobileToggle).toHaveAttribute('aria-expanded', 'true');
      const mobileDrawer = screen.getByLabelText(/thực đơn di động/i);
      expect(mobileDrawer).toBeInTheDocument();

      // Accordion trigger cho Quản trị
      const adminAccordion = within(mobileDrawer).getByRole('button', { name: /quản trị/i });
      expect(adminAccordion).toBeInTheDocument();
      // Mặc định ban đầu chưa mở (hoặc mở nếu là active)
      expect(adminAccordion).toHaveAttribute('aria-expanded', 'false');
      expect(within(mobileDrawer).queryByRole('link', { name: 'Người dùng' })).not.toBeInTheDocument();

      // Click để mở accordion
      fireEvent.click(adminAccordion);
      expect(adminAccordion).toHaveAttribute('aria-expanded', 'true');
      expect(within(mobileDrawer).getByRole('link', { name: 'Người dùng' })).toBeInTheDocument();

      // Click lại để thu gọn accordion
      fireEvent.click(adminAccordion);
      expect(adminAccordion).toHaveAttribute('aria-expanded', 'false');
      expect(within(mobileDrawer).queryByRole('link', { name: 'Người dùng' })).not.toBeInTheDocument();

      // Nhấn Escape từ trong mobile drawer
      fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
      expect(mobileToggle).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByLabelText(/thực đơn di động/i)).not.toBeInTheDocument();
      // Bàn phím: focus được trả về mobile toggle
      expect(document.activeElement).toBe(mobileToggle);
    });

    it('auto-expands active family upon opening mobile drawer and allows collapsing/re-expanding without infinite loop or forced re-open', async () => {
      const auth = authWithCapabilities([
        { key: 'AUDIT_VIEW', scope: 'SCHOOL_WIDE' },
        { key: 'USER_MANAGE', scope: 'SCHOOL_WIDE' },
      ]);

      vi.stubGlobal('fetch', vi.fn().mockImplementation((req: RequestInfo | URL) => {
        const url = typeof req === 'string' ? req : req instanceof Request ? req.url : req.toString();
        if (url.includes('/api/auth/me')) {
          return Promise.resolve(jsonResponse(auth));
        }
        if (url.includes('/api/audit')) {
          return Promise.resolve(jsonResponse({ items: [], page: 1, pageSize: 20, total: 0 }));
        }
        return Promise.resolve(jsonResponse({}));
      }));

      const consoleErrorSpy = vi.spyOn(console, 'error');

      renderApp('/quan-tri/nhat-ky');
      await screen.findByRole('heading', { name: /nhật ký/i });

      const mobileToggle = await screen.findByRole('button', { name: /thực đơn/i });
      expect(mobileToggle).toHaveAttribute('aria-expanded', 'false');

      // Mở thực đơn mobile: Quản trị là active family vì route đang là /quan-tri/nhat-ky
      fireEvent.click(mobileToggle);
      expect(mobileToggle).toHaveAttribute('aria-expanded', 'true');
      const mobileDrawer = screen.getByLabelText(/thực đơn di động/i);
      expect(mobileDrawer).toBeInTheDocument();

      // Accordion Quản trị phải TỰ ĐỘNG MỞ vì route đang active thuộc nhóm này
      const adminAccordion = within(mobileDrawer).getByRole('button', { name: /quản trị/i });
      expect(adminAccordion).toHaveAttribute('aria-expanded', 'true');
      expect(within(mobileDrawer).getByRole('link', { name: 'Nhật ký' })).toBeInTheDocument();

      // Người dùng THU GỌN nhóm active trong cùng drawer
      fireEvent.click(adminAccordion);
      expect(adminAccordion).toHaveAttribute('aria-expanded', 'false');
      expect(within(mobileDrawer).queryByRole('link', { name: 'Nhật ký' })).not.toBeInTheDocument();

      // Người dùng MỞ LẠI nhóm active trong cùng drawer
      fireEvent.click(adminAccordion);
      expect(adminAccordion).toHaveAttribute('aria-expanded', 'true');
      expect(within(mobileDrawer).getByRole('link', { name: 'Nhật ký' })).toBeInTheDocument();

      // Đóng drawer bằng Escape
      fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
      expect(mobileToggle).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByLabelText(/thực đơn di động/i)).not.toBeInTheDocument();

      // Mở lại drawer: nhóm active được tự động mở lại lần nữa một cách ổn định
      fireEvent.click(mobileToggle);
      const reopenedDrawer = screen.getByLabelText(/thực đơn di động/i);
      const reopenedAdminAccordion = within(reopenedDrawer).getByRole('button', { name: /quản trị/i });
      expect(reopenedAdminAccordion).toHaveAttribute('aria-expanded', 'true');
      expect(within(reopenedDrawer).getByRole('link', { name: 'Nhật ký' })).toBeInTheDocument();

      // Đảm bảo không phát sinh bất kỳ lỗi console.error hoặc update-depth warning
      expect(consoleErrorSpy).not.toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('Access Denied Page UX', () => {
    it('renders respectful guidance with return link and no technical leaks', async () => {
      renderApp('/khong-co-quyen');
      expect(await screen.findByRole('heading', { name: /bạn không có quyền thực hiện thao tác này/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /về không gian làm việc/i })).toHaveAttribute('href', '/');
      expect(screen.getByText(/liên hệ ban giám hiệu hoặc cán bộ quản trị/i)).toBeInTheDocument();
      // Không để lộ technical key, scope hoặc UUID
      expect(screen.queryByText(/SCHOOL_WIDE/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/CAPABILITY_GRANT/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Error:/i)).not.toBeInTheDocument();
    });
  });
});
