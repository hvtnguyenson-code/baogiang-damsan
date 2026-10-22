import type { AuthMeResponse, ScopedCapability } from '@baogiang/contracts';
import {
  canManageDutyAssignments,
  canManageHistoricalTeaching,
  canManagePpct,
  canManageSpecialProgrammes,
  canManageTeachingOperation,
  canReadAccessibleReporting,
  canReadEffectiveSchedule,
  canReadPersonalReporting,
  canReviewReportingStatements,
  canSubmitPersonalReporting,
  hasSchoolCapability,
} from './capabilities';

export type NavigationFamilyId =
  | 'my-work'
  | 'academic-data'
  | 'teaching-operations'
  | 'reporting-approval'
  | 'administration';

export interface NavigationItem {
  readonly to: string;
  readonly label: string;
  readonly familyId: NavigationFamilyId;
  readonly exactEnd?: boolean;
  readonly actionHint?: string;
  readonly isVisible: (capabilities: ScopedCapability[]) => boolean;
  readonly isMatchActive?: (pathname: string) => boolean;
}

export interface NavigationFamily {
  readonly id: NavigationFamilyId;
  readonly title: string;
  readonly shortTitle: string;
  readonly description: string;
  readonly items: readonly NavigationItem[];
}

export const NAVIGATION_REGISTRY: readonly NavigationItem[] = [
  // 1. Công việc của tôi
  {
    to: '/lich-day',
    label: 'Lịch dạy',
    familyId: 'my-work',
    actionHint: 'Xem thời khóa biểu và tiến độ giảng dạy tuần hiện tại',
    isVisible: canReadEffectiveSchedule,
  },
  {
    to: '/bao-cao-ke-khai',
    label: 'Báo cáo kê khai',
    familyId: 'my-work',
    exactEnd: true,
    actionHint: 'Lập, nộp và theo dõi báo cáo tiết dạy thực tế cá nhân',
    isVisible: (c) => canSubmitPersonalReporting(c) || canReadPersonalReporting(c),
  },

  // 2. Dữ liệu năm học
  {
    to: '/quan-tri/cau-truc-nam-hoc',
    label: 'Cấu trúc năm học',
    familyId: 'academic-data',
    actionHint: 'Quản lý niên khóa, học kỳ, tuần lễ và danh sách lớp học',
    isVisible: (c) => hasSchoolCapability(c, 'ACADEMIC_STRUCTURE_MANAGE'),
    isMatchActive: (pathname) => pathname.startsWith('/quan-tri/cau-truc-nam-hoc'),
  },
  {
    to: '/quan-tri/thoi-khoa-bieu',
    label: 'Thời khóa biểu & Khung tiết',
    familyId: 'academic-data',
    actionHint: 'Quản lý khung tiết, nhập thời khóa biểu Đam San và phê duyệt phiên bản',
    isVisible: (c) => hasSchoolCapability(c, 'TIMETABLE_MANAGE'),
    isMatchActive: (pathname) => pathname.startsWith('/quan-tri/thoi-khoa-bieu'),
  },
  {
    to: '/quan-tri/to-chuyen-mon',
    label: 'Tổ chuyên môn',
    familyId: 'academic-data',
    actionHint: 'Quản lý danh mục các tổ bộ môn trong nhà trường',
    isVisible: (c) => hasSchoolCapability(c, 'SUBJECT_GROUP_MANAGE'),
  },
  {
    to: '/quan-tri/mon-hoc',
    label: 'Môn học',
    familyId: 'academic-data',
    actionHint: 'Quản lý danh mục môn học giảng dạy chính thức',
    isVisible: (c) => hasSchoolCapability(c, 'SUBJECT_MANAGE'),
  },
  {
    to: '/quan-tri/phan-cong-to',
    label: 'Phân công tổ',
    familyId: 'academic-data',
    actionHint: 'Phân công nhân sự giáo viên vào từng tổ chuyên môn',
    isVisible: (c) => hasSchoolCapability(c, 'SUBJECT_GROUP_MANAGE'),
  },
  {
    to: '/quan-tri/phan-cong-mon',
    label: 'Phân công môn',
    familyId: 'academic-data',
    actionHint: 'Phân công nhân sự giảng dạy các môn học',
    isVisible: (c) => hasSchoolCapability(c, 'SUBJECT_MANAGE'),
  },
  {
    to: '/quan-tri/phan-cong-giang-day',
    label: 'Phân công giảng dạy',
    familyId: 'academic-data',
    actionHint: 'Phân công cụ thể giáo viên phụ trách lớp và môn',
    isVisible: (c) => hasSchoolCapability(c, 'SUBJECT_MANAGE'),
  },
  {
    to: '/quan-tri/phan-cong-chu-nhiem',
    label: 'Phân công chủ nhiệm',
    familyId: 'academic-data',
    actionHint: 'Phân công giáo viên chủ nhiệm từng lớp trong năm học',
    isVisible: (c) => hasSchoolCapability(c, 'HOMEROOM_ASSIGNMENT_MANAGE'),
  },
  {
    to: '/quan-tri/kiem-nhiem/danh-muc',
    label: 'Danh mục kiêm nhiệm',
    familyId: 'academic-data',
    actionHint: 'Quản lý danh mục các chức danh, nhiệm vụ kiêm nhiệm',
    isVisible: (c) => hasSchoolCapability(c, 'ADDITIONAL_DUTY_CATALOG_MANAGE'),
  },
  {
    to: '/quan-tri/kiem-nhiem/phan-cong',
    label: 'Phân công kiêm nhiệm',
    familyId: 'academic-data',
    actionHint: 'Phân công nhiệm vụ kiêm nhiệm theo trường hoặc theo tổ',
    isVisible: canManageDutyAssignments,
  },
  {
    to: '/quan-tri/ppct/nhap',
    label: 'Nhập PPCT',
    familyId: 'academic-data',
    actionHint: 'Nhập và quản lý phân phối chương trình môn học',
    isVisible: canManagePpct,
  },
  {
    to: '/quan-tri/ppct/ap-dung-chuyen-de',
    label: 'Áp dụng chuyên đề',
    familyId: 'academic-data',
    actionHint: 'Áp dụng kế hoạch chuyên đề dạy học cho các lớp',
    isVisible: canManagePpct,
  },

  // 3. Điều hành chuyên môn
  {
    to: '/quan-tri/dieu-hanh-chuyen-mon',
    label: 'Điều hành chuyên môn',
    familyId: 'teaching-operations',
    actionHint: 'Tra cứu và xác minh tiết học trước khi xử lý ngoại lệ, dạy thay, giám sát',
    isVisible: (c) => canManageTeachingOperation(c) || hasSchoolCapability(c, 'CALENDAR_EXCEPTION_MANAGE'),
  },
  {    to: '/quan-tri/lich-day-bu',
    label: 'Lịch dạy bù',
    familyId: 'teaching-operations',
    actionHint: 'Thiết lập và theo dõi kế hoạch dạy bù, thay đổi lịch dạy',
    isVisible: canManageTeachingOperation,
  },
  {
    to: '/quan-tri/lich-su-giang-day',
    label: 'Nạp lịch sử giảng dạy',
    familyId: 'teaching-operations',
    actionHint: 'Nạp bằng chứng và dữ liệu lịch sử tiết dạy đã thực hiện',
    isVisible: canManageHistoricalTeaching,
  },
  {
    to: '/quan-tri/chuong-trinh-dac-thu',
    label: 'HĐTN-HN & GDĐP',
    familyId: 'teaching-operations',
    actionHint: 'Quản lý kế hoạch hoạt động trải nghiệm và giáo dục địa phương',
    isVisible: canManageSpecialProgrammes,
  },

  // 4. Báo cáo & phê duyệt
  {
    to: '/bao-cao-ke-khai/duoc-xem',
    label: 'Báo cáo được phép xem',
    familyId: 'reporting-approval',
    actionHint: 'Xem và giám sát báo cáo tiết dạy theo tổ hoặc toàn trường',
    isVisible: canReadAccessibleReporting,
  },
  {
    to: '/phe-duyet-bao-cao',
    label: 'Phê duyệt báo cáo',
    familyId: 'reporting-approval',
    actionHint: 'Hàng đợi xem xét và phê duyệt báo cáo kê khai của giáo viên',
    isVisible: canReviewReportingStatements,
  },

  // 5. Quản trị
  {
    to: '/quan-tri/nguoi-dung',
    label: 'Người dùng',
    familyId: 'administration',
    actionHint: 'Quản lý tài khoản cán bộ, giáo viên và nhân viên',
    isVisible: (c) => hasSchoolCapability(c, 'USER_MANAGE'),
  },
  {
    to: '/quan-tri/quyen',
    label: 'Cấp quyền',
    familyId: 'administration',
    actionHint: 'Cấp phát và thu hồi quyền hạn trực tiếp cho người dùng',
    isVisible: (c) => hasSchoolCapability(c, 'CAPABILITY_GRANT'),
  },
  {
    to: '/quan-tri/chinh-sach-nghiep-vu',
    label: 'Chính sách nghiệp vụ',
    familyId: 'administration',
    actionHint: 'Thiết lập tham số và chính sách vận hành của nhà trường',
    isVisible: (c) => hasSchoolCapability(c, 'BUSINESS_CONFIGURATION_MANAGE'),
  },
  {
    to: '/quan-tri/nhat-ky',
    label: 'Nhật ký',
    familyId: 'administration',
    actionHint: 'Xem nhật ký kiểm toán các thao tác trên hệ thống',
    isVisible: (c) => hasSchoolCapability(c, 'AUDIT_VIEW'),
  },
];

export const NAVIGATION_FAMILIES: readonly {
  id: NavigationFamilyId;
  title: string;
  shortTitle: string;
  description: string;
}[] = [
  {
    id: 'my-work',
    title: 'Công việc của tôi',
    shortTitle: 'Việc của tôi',
    description: 'Lịch dạy cá nhân và kê khai báo giảng',
  },
  {
    id: 'academic-data',
    title: 'Dữ liệu năm học',
    shortTitle: 'Dữ liệu năm học',
    description: 'Cấu trúc năm học, danh mục, phân công và kế hoạch dạy học',
  },
  {
    id: 'teaching-operations',
    title: 'Điều hành chuyên môn',
    shortTitle: 'Điều hành',
    description: 'Lịch dạy bù, nạp lịch sử giảng dạy và chương trình đặc thù',
  },
  {
    id: 'reporting-approval',
    title: 'Báo cáo & phê duyệt',
    shortTitle: 'Báo cáo & Duyệt',
    description: 'Báo cáo được phép xem và hàng đợi phê duyệt chuyên môn',
  },
  {
    id: 'administration',
    title: 'Quản trị',
    shortTitle: 'Quản trị',
    description: 'Quản lý người dùng, cấp quyền, chính sách và nhật ký',
  },
];

export interface AccessibleFamily {
  readonly id: NavigationFamilyId;
  readonly title: string;
  readonly shortTitle: string;
  readonly description: string;
  readonly items: readonly NavigationItem[];
}

export function getAccessibleNavigationFamilies(capabilities: ScopedCapability[]): readonly AccessibleFamily[] {
  return NAVIGATION_FAMILIES.map((family) => {
    const familyItems = NAVIGATION_REGISTRY.filter(
      (item) => item.familyId === family.id && item.isVisible(capabilities),
    );
    return {
      ...family,
      items: familyItems,
    };
  }).filter((family) => family.items.length > 0);
}

export function getAccessibleRoutes(auth: AuthMeResponse | null): readonly NavigationItem[] {
  const capabilities = auth?.capabilities ?? [];
  return NAVIGATION_REGISTRY.filter((item) => item.isVisible(capabilities));
}
