import type { AuthMeResponse, CapabilityKey, ScopedCapability } from '@baogiang/contracts';

export type ManagementRoute = {
  to: string;
  label: string;
  isVisible(capabilities: ScopedCapability[]): boolean;
};

export type ProfessionalRoute = ManagementRoute;

function hasCapability(capabilities: ScopedCapability[], key: CapabilityKey, scope: ScopedCapability['scope']): boolean {
  return capabilities.some((grant) => grant.key === key && grant.scope === scope);
}

export function canSubmitPersonalReporting(capabilities: ScopedCapability[]): boolean {
  return hasCapability(capabilities, 'REPORTING_STATEMENT_SUBMIT', 'PERSONAL');
}

export function canReadPersonalReporting(capabilities: ScopedCapability[]): boolean {
  return hasCapability(capabilities, 'REPORTING_STATEMENT_READ', 'PERSONAL');
}

export function canReadAccessibleReporting(capabilities: ScopedCapability[]): boolean {
  return hasCapability(capabilities, 'REPORTING_STATEMENT_READ', 'SUBJECT')
    || hasCapability(capabilities, 'REPORTING_STATEMENT_READ', 'SCHOOL_WIDE');
}

export function canOpenReportingDetail(capabilities: ScopedCapability[]): boolean {
  return canReadPersonalReporting(capabilities) || canReadAccessibleReporting(capabilities);
}

export function canReviewReportingStatements(capabilities: ScopedCapability[]): boolean {
  const canApprove = hasCapability(capabilities, 'APPROVAL_PRINCIPAL', 'SCHOOL_WIDE')
    || hasCapability(capabilities, 'APPROVAL_VICE_PRINCIPAL', 'SCHOOL_WIDE');
  return canApprove && canReadAccessibleReporting(capabilities);
}

export const professionalRoutes: ProfessionalRoute[] = [
  {
    to: '/bao-cao-ke-khai',
    label: 'Báo cáo kê khai',
    isVisible: (capabilities) => canSubmitPersonalReporting(capabilities) || canReadPersonalReporting(capabilities),
  },
  {
    to: '/bao-cao-ke-khai/duoc-xem',
    label: 'Báo cáo được phép xem',
    isVisible: canReadAccessibleReporting,
  },
  {
    to: '/phe-duyet-bao-cao',
    label: 'Phê duyệt báo cáo',
    isVisible: canReviewReportingStatements,
  },
];

export function accessibleProfessionalRoutes(auth: AuthMeResponse | null): ProfessionalRoute[] {
  return professionalRoutes.filter((route) => route.isVisible(auth?.capabilities ?? []));
}

export function hasSchoolCapability(capabilities: ScopedCapability[], key: CapabilityKey): boolean {
  return capabilities.some((grant) => grant.key === key && grant.scope === 'SCHOOL_WIDE');
}

export function subjectGroupResources(capabilities: ScopedCapability[], key: CapabilityKey): string[] {
  return capabilities
    .filter((grant) => grant.key === key && grant.scope === 'SUBJECT_GROUP' && Boolean(grant.resourceId))
    .map((grant) => grant.resourceId!);
}

export function canManageDutyAssignments(capabilities: ScopedCapability[]): boolean {
  return hasSchoolCapability(capabilities, 'ADDITIONAL_DUTY_ASSIGNMENT_MANAGE')
    || subjectGroupResources(capabilities, 'ADDITIONAL_DUTY_ASSIGNMENT_MANAGE').length > 0;
}

export const managementRoutes: ManagementRoute[] = [
  { to: '/quan-tri/cau-truc-nam-hoc', label: 'Cấu trúc năm học', isVisible: (c) => hasSchoolCapability(c, 'ACADEMIC_STRUCTURE_MANAGE') },
  { to: '/quan-tri/nguoi-dung', label: 'Người dùng', isVisible: (c) => hasSchoolCapability(c, 'USER_MANAGE') },
  { to: '/quan-tri/to-chuyen-mon', label: 'Tổ chuyên môn', isVisible: (c) => hasSchoolCapability(c, 'SUBJECT_GROUP_MANAGE') },
  { to: '/quan-tri/mon-hoc', label: 'Môn học', isVisible: (c) => hasSchoolCapability(c, 'SUBJECT_MANAGE') },
  { to: '/quan-tri/phan-cong-to', label: 'Phân công tổ', isVisible: (c) => hasSchoolCapability(c, 'SUBJECT_GROUP_MANAGE') },
  { to: '/quan-tri/phan-cong-mon', label: 'Phân công môn', isVisible: (c) => hasSchoolCapability(c, 'SUBJECT_MANAGE') },
  { to: '/quan-tri/phan-cong-giang-day', label: 'Phân công giảng dạy', isVisible: (c) => hasSchoolCapability(c, 'SUBJECT_MANAGE') },
  { to: '/quan-tri/quyen', label: 'Cấp quyền', isVisible: (c) => hasSchoolCapability(c, 'CAPABILITY_GRANT') },
  { to: '/quan-tri/nhat-ky', label: 'Nhật ký', isVisible: (c) => hasSchoolCapability(c, 'AUDIT_VIEW') },
  { to: '/quan-tri/kiem-nhiem/danh-muc', label: 'Danh mục kiêm nhiệm', isVisible: (c) => hasSchoolCapability(c, 'ADDITIONAL_DUTY_CATALOG_MANAGE') },
  { to: '/quan-tri/kiem-nhiem/phan-cong', label: 'Phân công kiêm nhiệm', isVisible: canManageDutyAssignments },
];

export function accessibleManagementRoutes(auth: AuthMeResponse | null): ManagementRoute[] {
  return managementRoutes.filter((route) => route.isVisible(auth?.capabilities ?? []));
}

export const capabilityLabels: Partial<Record<CapabilityKey, string>> = {
  HOMEROOM_ASSIGNMENT_MANAGE: 'Quản lý giáo viên chủ nhiệm',
  ACADEMIC_STRUCTURE_MANAGE: 'Quản lý cấu trúc năm học',
  TEACHER_BASE: 'Công việc giáo viên cơ bản',
  SUBJECT_GROUP_LEAD: 'Phụ trách tổ chuyên môn',
  USER_MANAGE: 'Quản lý người dùng',
  SUBJECT_GROUP_MANAGE: 'Quản lý tổ chuyên môn',
  SUBJECT_MANAGE: 'Quản lý môn học',
  CAPABILITY_GRANT: 'Cấp và thu hồi quyền',
  AUDIT_VIEW: 'Xem nhật ký hệ thống',
  ADDITIONAL_DUTY_CATALOG_MANAGE: 'Quản lý danh mục kiêm nhiệm',
  ADDITIONAL_DUTY_ASSIGNMENT_MANAGE: 'Quản lý phân công kiêm nhiệm',
  SYSTEM_ADMIN: 'Quản trị kỹ thuật hệ thống',
};

export const scopeLabels = {
  PERSONAL: 'Cá nhân', SUBJECT_GROUP: 'Tổ chuyên môn', SUBJECT: 'Môn học', ACTIVITY: 'Hoạt động', SCHOOL_WIDE: 'Toàn trường',
} as const;
