import type {
  AcademicYearOptionListResponse,
  AcademicYearOptionRecord,
  BaselineReconciliationApplyResponse,
  BaselineReconciliationConflictUser,
  BaselineReconciliationMissingUser,
  BaselineReconciliationPreviewResponse,
  CatalogListResponse,
  ProgrammeMasterOptionListResponse,
  ProgrammeMasterOptionRecord,
  ResponsibilityTemplateApplyResponse,
  ResponsibilityTemplateDefinition,
  ResponsibilityTemplateKey,
  ResponsibilityTemplateListResponse,
  ResponsibilityTemplatePreviewResponse,
  UserDeletePreflightResponse,
  UserManagementRecord,
} from '@baogiang/contracts';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useAuth } from '../auth/auth-context';
import { Button } from '../components/ui/button';
import { FormField } from '../components/ui/form-field';
import {
  FormSection,
  MutationNotice,
  PageHeader,
  PageLoading,
  Pagination,
  QueryFailure,
  StatusText,
} from '../components/ui/management';
import {
  baselineReconciliationApi,
  catalogApi,
  responsibilityTemplatesApi,
  usersApi,
  type UserInput,
} from '../lib/management-api';
import { ErrorFeedback } from '../components/ui/feedback';
import { capabilityLabels, scopeLabels, hasSchoolCapability } from '../lib/capabilities';
import { ApiError } from '../lib/api-client';

type UserDraft = {
  id?: string;
  username: string;
  password: string;
  staffCode: string;
  displayName: string;
  email: string;
  phone: string;
  positionTitle: string;
  isTeachingStaff: boolean;
};

type PasswordResetDraft = {
  id: string;
  username: string;
  newPassword: string;
  confirmation: string;
};

const emptyDraft: UserDraft = {
  username: '',
  password: '',
  staffCode: '',
  displayName: '',
  email: '',
  phone: '',
  positionTitle: '',
  isTeachingStaff: true,
};

const TEMPLATE_NAMES: Record<ResponsibilityTemplateKey, string> = {
  TEACHER: 'Giáo viên',
  SUBJECT_LEADER: 'Tổ trưởng chuyên môn',
  VICE_PRINCIPAL_ACADEMIC: 'Phó Hiệu trưởng phụ trách chuyên môn',
  PRINCIPAL: 'Hiệu trưởng',
  GDDP_COORDINATOR: 'Điều phối Giáo dục địa phương (GDĐP)',
  HDTN_COORDINATOR: 'Điều phối Hoạt động trải nghiệm, hướng nghiệp (HĐTN-HN)',
  TECHNICAL_ACCOUNT_ADMIN: 'Quản trị tài khoản & kỹ thuật',
};

function conflictStatusLabel(status: string): string {
  switch (status) {
    case 'OVERLAP_CONFLICT':
      return 'Quyền cấp bị xung đột';
    case 'STATUS_LOCKED':
      return 'Tài khoản đang bị khóa';
    case 'STATUS_DISABLED':
      return 'Tài khoản đã vô hiệu hóa';
    case 'EXPIRED':
      return 'Hết hạn hiệu lực';
    case 'INACTIVE':
      return 'Chưa kích hoạt';
    default:
      return 'Cần kiểm tra trạng thái quyền';
  }
}

function scopeTypeLabel(scope: string): string {
  switch (scope) {
    case 'PERSONAL':
      return 'Phạm vi cá nhân';
    case 'SCHOOL_WIDE':
      return 'Phạm vi toàn trường';
    case 'SUBJECT_GROUP':
      return 'Tổ chuyên môn';
    case 'SUBJECT':
      return scopeLabels.SUBJECT;
    case 'ACTIVITY':
      return scopeLabels.ACTIVITY;
    case 'CLASS':
      return 'Lớp học';
    case 'PROGRAMME':
      return 'Chương trình đào tạo';
    default:
      return 'Phạm vi chưa được hỗ trợ';
  }
}

function capabilityKeyLabel(key: string): string {
  if (key === 'APPROVAL_PRINCIPAL') return 'Phê duyệt của hiệu trưởng';
  if (key === 'APPROVAL_VICE_PRINCIPAL') return 'Phê duyệt của phó hiệu trưởng';
  if (key === 'REPORTING_STATEMENT_SUBMIT') return 'Gửi báo cáo kê khai';
  if (key === 'REPORTING_STATEMENT_READ') return 'Xem báo cáo kê khai';
  if (key === 'REPORTING_READ') return 'Xem báo cáo giảng dạy';
  if (key === 'TEACHING_EXECUTION_RECORD') return 'Ghi nhận thực hiện giảng dạy';
  if (key === 'CALENDAR_EXCEPTION_MANAGE') return 'Quản lý ngoại lệ lịch học';
  if (key === 'SPECIAL_ACTIVITY_MANAGE') return 'Quản lý hoạt động đặc thù';
  return Object.prototype.hasOwnProperty.call(capabilityLabels, key)
    ? capabilityLabels[key as keyof typeof capabilityLabels] ?? 'Quyền chưa có tên hiển thị'
    : 'Quyền chưa có tên hiển thị';
}

// Exact, reviewed catalog copy only. Never use this mapping to interpret an error or a privilege.
function templateCopy(text?: string): string | undefined {
  switch (text) {
    case 'Quản trị Business Configuration toàn trường theo policy được duyệt.': return 'Quản trị chính sách nghiệp vụ toàn trường theo nội dung được duyệt.';
    case 'Quản trị danh mục tổ chuyên môn và membership.': return 'Quản trị danh mục tổ chuyên môn và thành viên tổ.';
    case 'Xem audit log toàn trường.': return 'Xem nhật ký hệ thống toàn trường.';
    case 'Quản lý hoạt động đặc thù (Special Activity) toàn trường.': return 'Quản lý hoạt động đặc thù toàn trường.';
    case 'Quyền giáo viên cộng thẩm quyền phê duyệt chuyên môn Hiệu trưởng, xem audit log và điều hành học thuật toàn trường.': return 'Quyền giáo viên cùng thẩm quyền phê duyệt chuyên môn của hiệu trưởng, xem nhật ký hệ thống và điều hành học thuật toàn trường.';
    case 'Các quyền theo môn học (PPCT, điều hành, thực hiện giảng dạy, báo cáo) chỉ materialize khi Admin chỉ định môn chuyên môn được giao cho tổ trưởng.': return 'Quyền theo môn học chỉ được cấp khi quản trị viên chỉ định môn chuyên môn giao cho tổ trưởng: phân phối chương trình, điều hành, thực hiện giảng dạy và báo cáo.';
    case 'Tuyệt đối không cấp SYSTEM_ADMIN, USER_MANAGE, CAPABILITY_GRANT hoặc APPROVAL_PRINCIPAL mặc định.': return 'Không mặc định cấp quyền quản trị kỹ thuật, quản lý người dùng, cấp và thu hồi quyền hoặc phê duyệt của hiệu trưởng.';
    case 'Không mặc định cấp quyền quản trị kỹ thuật (SYSTEM_ADMIN, USER_MANAGE, CAPABILITY_GRANT).': return 'Không mặc định cấp quyền quản trị kỹ thuật, quản lý người dùng hoặc cấp và thu hồi quyền.';
    case 'Không cấp APPROVAL_VICE_PRINCIPAL mặc định.': return 'Không mặc định cấp quyền phê duyệt của phó hiệu trưởng.';
    case 'Chỉ áp dụng cho chương trình có kind = GDDP; không áp dụng cho hoạt động trải nghiệm hay quản trị chung.': return 'Chỉ áp dụng cho chương trình Giáo dục địa phương; không áp dụng cho hoạt động trải nghiệm hoặc quản trị chung.';
    case 'Chỉ áp dụng cho chương trình có kind = HDTN_HN; không áp dụng cho GDĐP hay quản trị chung.': return 'Chỉ áp dụng cho chương trình Hoạt động trải nghiệm, hướng nghiệp; không áp dụng cho Giáo dục địa phương hoặc quản trị chung.';
    case 'Tuyệt đối không cấp SYSTEM_ADMIN mặc định.': return 'Không mặc định cấp quyền quản trị kỹ thuật hệ thống.';
    case 'Không cấp quyền phê duyệt chuyên môn (APPROVAL_PRINCIPAL, APPROVAL_VICE_PRINCIPAL).': return 'Không cấp quyền phê duyệt chuyên môn của hiệu trưởng hoặc phó hiệu trưởng.';
    case 'Không cấp TEACHER_BASE nếu tài khoản không phải nhân sự giảng dạy (isTeachingStaff=false).': return 'Không cấp quyền cơ sở giáo viên nếu tài khoản không phải nhân sự giảng dạy.';
    case 'Tài khoản không phải nhân sự giảng dạy (isTeachingStaff=false); không thể áp dụng template chuyên môn này.': return 'Tài khoản không phải nhân sự giảng dạy nên không thể áp dụng mẫu phân quyền chuyên môn này.';
    case 'Chưa cung cấp programmeMasterId cho GDĐP.': return 'Chưa chọn chương trình Giáo dục địa phương.';
    case 'Chưa cung cấp programmeMasterId cho HĐTN-HN.': return 'Chưa chọn chương trình Hoạt động trải nghiệm, hướng nghiệp.';
    case 'Chưa cung cấp subjectGroupId cho Tổ trưởng.': return 'Chưa chọn tổ chuyên môn do tổ trưởng phụ trách.';
    default: return text;
  }
}

function deleteBlockerLabel(code: string): string {
  switch (code) {
    case 'SELF': return 'Không thể tự xóa tài khoản đang đăng nhập.';
    case 'PROTECTED': return 'Tài khoản khởi tạo được bảo vệ; hãy vô hiệu hóa khi cần ngừng truy cập.';
    case 'LOGIN_HISTORY': return 'Tài khoản đã có lịch sử đăng nhập.';
    case 'SECURITY_HISTORY': return 'Lịch sử phiên đăng nhập, phân quyền hoặc nhật ký hoạt động cần được lưu giữ.';
    case 'BUSINESS_HISTORY': return 'Dữ liệu nghiệp vụ hoặc nguồn gốc xử lý cần được lưu giữ.';
    case 'INDIRECT_HISTORY': return 'Hồ sơ hoặc môn phụ trách đã được sử dụng trong dữ liệu nghiệp vụ.';
    case 'UNVERIFIED_REFERENCE': return 'Chưa xác minh đầy đủ dữ liệu liên quan; không được phép xóa tài khoản.';
    default: return 'Có ràng buộc ngăn xóa tài khoản. Hãy liên hệ người quản trị để kiểm tra.';
  }
}

export function UsersPage() {
  const { auth } = useAuth();
  const queryClient = useQueryClient();

  const canManageUsers = hasSchoolCapability(auth?.capabilities ?? [], 'USER_MANAGE');
  const canGrant = hasSchoolCapability(auth?.capabilities ?? [], 'CAPABILITY_GRANT');
  const canSystemAdmin = hasSchoolCapability(auth?.capabilities ?? [], 'SYSTEM_ADMIN');
  const canResetPasswords = canSystemAdmin;
  const canDeletePhysically = canManageUsers && canSystemAdmin;

  // View state
  const [page, setPage] = useState(1);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [draft, setDraft] = useState<UserDraft | null>(null);
  const [activeTab, setActiveTab] = useState<'templates' | 'profile' | 'safe-delete'>('templates');
  const [showReconciliation, setShowReconciliation] = useState(false);

  // Success & error feedback
  const [success, setSuccess] = useState('');
  const [confirm, setConfirm] = useState<{ id: string; action: 'activate' | 'disable' | 'unlock' }>();

  // Password reset state (per row / user)
  const [resetDraft, setResetDraft] = useState<PasswordResetDraft | null>(null);
  const [resetError, setResetError] = useState('');

  // Responsibility template state & snapshot integrity
  const [selectedTemplateKey, setSelectedTemplateKey] = useState<ResponsibilityTemplateKey>('TEACHER');
  const [subjectGroupId, setSubjectGroupId] = useState('');
  const [subjectIds, setSubjectIds] = useState<string[]>([]);
  const [academicYearId, setAcademicYearId] = useState('');
  const [programmeMasterId, setProgrammeMasterId] = useState('');
  const [academicYearPage, setAcademicYearPage] = useState(1);
  const [programmeMasterPage, setProgrammeMasterPage] = useState(1);
  const [knownAcademicYears, setKnownAcademicYears] = useState<AcademicYearOptionRecord[]>([]);
  const [knownMastersByScopeAndPage, setKnownMastersByScopeAndPage] = useState<
    Record<string, Record<number, ProgrammeMasterOptionRecord[]>>
  >({});
  const [templatePreview, setTemplatePreview] = useState<ResponsibilityTemplatePreviewResponse | null>(null);
  const [templatePreviewError, setTemplatePreviewError] = useState<Error | null>(null);
  const [templateApplyResult, setTemplateApplyResult] = useState<ResponsibilityTemplateApplyResponse | null>(null);

  type PreviewSnapshot = {
    targetUserId: string;
    templateKey: ResponsibilityTemplateKey;
    subjectGroupId: string;
    subjectIds: string[];
    programmeMasterId: string;
    templateVersion?: string;
    previewData: ResponsibilityTemplatePreviewResponse;
  };
  const [previewSnapshot, setPreviewSnapshot] = useState<PreviewSnapshot | null>(null);
  const previewRequestIdRef = useRef<number>(0);

  const previewSnapshotRef = useRef<PreviewSnapshot | null>(null);
  previewSnapshotRef.current = previewSnapshot;

  const templatePreviewRef = useRef<ResponsibilityTemplatePreviewResponse | null>(null);
  templatePreviewRef.current = templatePreview;

  const templateApplyResultRef = useRef<ResponsibilityTemplateApplyResponse | null>(null);
  templateApplyResultRef.current = templateApplyResult;

  const clearApplyResult = useCallback(() => {
    setTemplateApplyResult(null);
  }, []);

  // Safe delete state
  const [deleteConfirmUsername, setDeleteConfirmUsername] = useState('');
  const [deleteError, setDeleteError] = useState('');

  // Server-owned responsibility template catalog
  const templatesQuery = useQuery<ResponsibilityTemplateListResponse>({
    queryKey: ['responsibility-templates-catalog'],
    queryFn: () => responsibilityTemplatesApi.list(),
    enabled: canGrant,
  });

  const selectedTemplateDef: ResponsibilityTemplateDefinition | null = useMemo(() => {
    return templatesQuery.data?.items?.find((t) => t.key === selectedTemplateKey) ?? null;
  }, [templatesQuery.data?.items, selectedTemplateKey]);

  // Main user query
  const query = useQuery({
    queryKey: ['users', { page }],
    queryFn: () => usersApi.list({ page, pageSize: 20 }),
  });

  // Selected user record
  const selectedUser = useMemo(() => {
    if (!selectedUserId || !query.data?.items) return null;
    return query.data.items.find((u) => u.id === selectedUserId) ?? null;
  }, [selectedUserId, query.data?.items]);

  // Catalogs for Subject Leader
  const subjectGroupsQuery = useQuery<CatalogListResponse>({
    queryKey: ['subject-groups-active'],
    queryFn: () => catalogApi('subject-groups').list({ page: 1, pageSize: 100, status: 'ACTIVE' }),
    enabled: selectedTemplateKey === 'SUBJECT_LEADER',
  });

  const subjectsQuery = useQuery<CatalogListResponse>({
    queryKey: ['subjects-active'],
    queryFn: () => catalogApi('subjects').list({ page: 1, pageSize: 100, status: 'ACTIVE' }),
    enabled: selectedTemplateKey === 'SUBJECT_LEADER',
  });

  // Administrative read-model queries for coordinators
  const isCoordinatorTemplate =
    selectedTemplateKey === 'GDDP_COORDINATOR' || selectedTemplateKey === 'HDTN_COORDINATOR';
  const programmeKind: 'GDDP' | 'HDTN_HN' =
    selectedTemplateKey === 'GDDP_COORDINATOR' ? 'GDDP' : 'HDTN_HN';

  const academicYearsQuery = useQuery<AcademicYearOptionListResponse>({
    queryKey: ['academic-year-options', academicYearPage],
    queryFn: () => responsibilityTemplatesApi.academicYearOptions({ page: academicYearPage, pageSize: 50 }),
    enabled: canGrant && isCoordinatorTemplate,
    retry: false,
    placeholderData: keepPreviousData,
  });

  // Track known academic years across pages to prevent losing selection on page change
  // Strictly only cache authoritative responses (never placeholderData or in-flight fetching)
  useEffect(() => {
    if (
      academicYearsQuery.isSuccess &&
      !academicYearsQuery.isPlaceholderData &&
      !academicYearsQuery.isFetching &&
      academicYearsQuery.data?.items
    ) {
      setKnownAcademicYears((prev) => {
        const map = new Map(prev.map((y) => [y.id, y]));
        academicYearsQuery.data.items.forEach((y) => map.set(y.id, y));
        return Array.from(map.values());
      });
    }
  }, [
    academicYearsQuery.isSuccess,
    academicYearsQuery.isPlaceholderData,
    academicYearsQuery.isFetching,
    academicYearsQuery.data?.items,
  ]);

  // Auto-select academic year ONLY when the entire catalog has exactly one option (total === 1) and query succeeded
  useEffect(() => {
    if (
      isCoordinatorTemplate &&
      academicYearsQuery.isSuccess &&
      !academicYearsQuery.isPlaceholderData &&
      !academicYearsQuery.isFetching &&
      academicYearsQuery.data?.total === 1 &&
      academicYearsQuery.data?.items?.length === 1 &&
      !academicYearId
    ) {
      setAcademicYearId(academicYearsQuery.data.items[0].id);
    }
  }, [
    isCoordinatorTemplate,
    academicYearsQuery.isSuccess,
    academicYearsQuery.isPlaceholderData,
    academicYearsQuery.isFetching,
    academicYearsQuery.data?.total,
    academicYearsQuery.data?.items,
    academicYearId,
  ]);

  const programmeMastersQuery = useQuery<ProgrammeMasterOptionListResponse>({
    queryKey: ['programme-master-options', academicYearId, programmeKind, programmeMasterPage],
    queryFn: () =>
      responsibilityTemplatesApi.programmeMasterOptions({
        academicYearId,
        kind: programmeKind,
        page: programmeMasterPage,
        pageSize: 50,
      }),
    enabled: canGrant && isCoordinatorTemplate && Boolean(academicYearId),
    retry: false,
    placeholderData: keepPreviousData,
  });

  // Track known masters for the current scope to maintain selection across pages
  // strictly verifying that items match academicYearId & programmeKind, and never caching placeholder data
  useEffect(() => {
    if (
      isCoordinatorTemplate &&
      academicYearId &&
      programmeMastersQuery.isSuccess &&
      !programmeMastersQuery.isPlaceholderData &&
      !programmeMastersQuery.isFetching &&
      programmeMastersQuery.data?.items
    ) {
      const scopeKey = `${academicYearId}:${programmeKind}`;
      const validItems = programmeMastersQuery.data.items.filter(
        (m) => m.academicYearId === academicYearId && m.kind === programmeKind,
      );
      setKnownMastersByScopeAndPage((prev) => {
        const scopePages = prev[scopeKey] ? { ...prev[scopeKey] } : {};
        scopePages[programmeMasterPage] = validItems;
        return {
          ...prev,
          [scopeKey]: scopePages,
        };
      });
    }
  }, [
    isCoordinatorTemplate,
    academicYearId,
    programmeKind,
    programmeMasterPage,
    programmeMastersQuery.isSuccess,
    programmeMastersQuery.isPlaceholderData,
    programmeMastersQuery.isFetching,
    programmeMastersQuery.data?.items,
  ]);

  // Current scope masters: combine known pages but always prioritize latest authoritative response for current page
  const currentScopeKey = `${academicYearId}:${programmeKind}`;
  const currentScopeMasters = useMemo(() => {
    const scopePages: Record<number, ProgrammeMasterOptionRecord[]> = knownMastersByScopeAndPage[currentScopeKey]
      ? { ...knownMastersByScopeAndPage[currentScopeKey] }
      : {};

    // Always overwrite current page with latest authoritative data from server
    if (
      isCoordinatorTemplate &&
      academicYearId &&
      programmeMastersQuery.isSuccess &&
      !programmeMastersQuery.isPlaceholderData &&
      !programmeMastersQuery.isFetching &&
      programmeMastersQuery.data?.items
    ) {
      scopePages[programmeMasterPage] = programmeMastersQuery.data.items.filter(
        (m) => m.academicYearId === academicYearId && m.kind === programmeKind,
      );
    }

    const allKnown = Object.values(scopePages).flat();
    if (allKnown.length > 0) return allKnown;

    if (
      programmeMastersQuery.data?.items &&
      !programmeMastersQuery.isPlaceholderData &&
      academicYearId
    ) {
      return programmeMastersQuery.data.items.filter(
        (m) => m.academicYearId === academicYearId && m.kind === programmeKind,
      );
    }
    return [];
  }, [
    knownMastersByScopeAndPage,
    currentScopeKey,
    isCoordinatorTemplate,
    academicYearId,
    programmeKind,
    programmeMasterPage,
    programmeMastersQuery.isSuccess,
    programmeMastersQuery.isPlaceholderData,
    programmeMastersQuery.isFetching,
    programmeMastersQuery.data?.items,
  ]);

  // Fail-closed coordinator query status: query must be fully completed without errors, refetches, or placeholders
  const isCoordinatorQueryAuthoritative = useMemo(() => {
    if (!isCoordinatorTemplate) return true;
    if (!academicYearId || !programmeMasterId) return false;
    if (
      academicYearsQuery.isError ||
      programmeMastersQuery.isError ||
      academicYearsQuery.isPending ||
      programmeMastersQuery.isPending ||
      academicYearsQuery.isFetching ||
      programmeMastersQuery.isFetching ||
      academicYearsQuery.isPlaceholderData ||
      programmeMastersQuery.isPlaceholderData
    ) {
      return false;
    }
    if (!academicYearsQuery.isSuccess || !programmeMastersQuery.isSuccess) {
      return false;
    }
    return true;
  }, [
    isCoordinatorTemplate,
    academicYearId,
    programmeMasterId,
    academicYearsQuery.isError,
    programmeMastersQuery.isError,
    academicYearsQuery.isPending,
    programmeMastersQuery.isPending,
    academicYearsQuery.isFetching,
    programmeMastersQuery.isFetching,
    academicYearsQuery.isPlaceholderData,
    programmeMastersQuery.isPlaceholderData,
    academicYearsQuery.isSuccess,
    programmeMastersQuery.isSuccess,
  ]);

  // Fail-closed membership check: selected master must belong to current scope's confirmed list
  const isSelectedMasterValidMember = useMemo(() => {
    if (!isCoordinatorTemplate) return true;
    if (!isCoordinatorQueryAuthoritative) return false;
    const match = currentScopeMasters.find((m) => m.id === programmeMasterId);
    if (!match) return false;
    if (match.academicYearId !== academicYearId || match.kind !== programmeKind) return false;
    return true;
  }, [
    isCoordinatorTemplate,
    isCoordinatorQueryAuthoritative,
    currentScopeMasters,
    programmeMasterId,
    academicYearId,
    programmeKind,
  ]);

  // Fail-closed coordinator validation: invalid if missing, error, pending, fetching, placeholder, or not a verified member
  const coordinatorSelectorMissing =
    isCoordinatorTemplate && (!isCoordinatorQueryAuthoritative || !isSelectedMasterValidMember);


  const isCurrentSelectionMatchingPreview = useMemo(() => {
    if (!previewSnapshot || !selectedUserId) return false;
    if (
      isCoordinatorTemplate &&
      (coordinatorSelectorMissing || !isSelectedMasterValidMember || !isCoordinatorQueryAuthoritative)
    ) {
      return false;
    }
    if (previewSnapshot.targetUserId !== selectedUserId) return false;
    if (previewSnapshot.templateKey !== selectedTemplateKey) return false;
    if (previewSnapshot.subjectGroupId !== (subjectGroupId || '')) return false;
    if (previewSnapshot.programmeMasterId !== (programmeMasterId || '')) return false;
    const currentSubjects = [...subjectIds].sort();
    if (previewSnapshot.subjectIds.length !== currentSubjects.length) return false;
    if (!previewSnapshot.subjectIds.every((id, idx) => id === currentSubjects[idx])) return false;
    return true;
  }, [
    previewSnapshot,
    selectedUserId,
    selectedTemplateKey,
    subjectGroupId,
    subjectIds,
    programmeMasterId,
    isCoordinatorTemplate,
    coordinatorSelectorMissing,
    isSelectedMasterValidMember,
    isCoordinatorQueryAuthoritative,
  ]);

  // Delete Preflight Query
  const preflightQuery = useQuery<UserDeletePreflightResponse>({
    queryKey: ['delete-preflight', selectedUserId],
    queryFn: () => usersApi.deletePreflight(selectedUserId!),
    enabled: Boolean(selectedUserId) && activeTab === 'safe-delete' && canManageUsers,
    retry: false,
  });

  // Baseline Reconciliation Queries & Mutations
  const reconciliationPreviewQuery = useQuery<BaselineReconciliationPreviewResponse>({
    queryKey: ['baseline-reconciliation-preview'],
    queryFn: () => baselineReconciliationApi.preview(),
    enabled: showReconciliation && canGrant,
  });

  const [reconciliationApplyResult, setReconciliationApplyResult] =
    useState<BaselineReconciliationApplyResponse | null>(null);

  const applyReconciliationMutation = useMutation({
    mutationFn: (targetUserIds: string[]) => baselineReconciliationApi.apply({ targetUserIds }),
    onMutate: () => {
      setSuccess('');
    },
    onSuccess: async (data) => {
      setReconciliationApplyResult(data);
      setSuccess(`Đã áp dụng chuẩn chuyên môn: tạo mới ${data.grantsCreated} quyền tiếp cận.`);
      await queryClient.invalidateQueries({ queryKey: ['baseline-reconciliation-preview'] });
      await queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });

  // Save User Mutation (Create / Update)
  const save = useMutation({
    mutationFn: ({ id, input }: { id?: string; input: UserInput }) =>
      id ? usersApi.update(id, input) : usersApi.create(input),
    onMutate: () => {
      setSuccess('');
      actionMutation.reset();
    },
    onSuccess: async (_data, variables) => {
      setDraft(null);
      setSuccess(
        variables.id
          ? 'Đã cập nhật thông tin người dùng.'
          : 'Đã tạo người dùng ở trạng thái Chờ kích hoạt; mật khẩu khởi tạo không được hiển thị lại.',
      );
      await queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });

  // Account Lifecycle Mutation (Activate / Disable / Unlock)
  const actionMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'activate' | 'disable' | 'unlock' }) =>
      usersApi.action(id, action),
    onMutate: () => {
      setSuccess('');
      save.reset();
    },
    onSuccess: async () => {
      setConfirm(undefined);
      setSuccess('Đã cập nhật trạng thái tài khoản.');
      await queryClient.invalidateQueries({ queryKey: ['users'] });
      if (selectedUserId) {
        await queryClient.invalidateQueries({ queryKey: ['delete-preflight', selectedUserId] });
      }
    },
  });

  // Reset Password Mutation
  const resetPassword = useMutation({
    mutationFn: ({ id, newPassword }: { id: string; newPassword: string }) =>
      usersApi.resetPassword(id, newPassword),
    onMutate: () => {
      setSuccess('');
      setResetError('');
      save.reset();
      actionMutation.reset();
    },
    onSuccess: async () => {
      setResetDraft(null);
      setSuccess(
        'Đã đặt lại mật khẩu. Các phiên đăng nhập cũ đã bị thu hồi; tài khoản phải đổi mật khẩu khi đăng nhập lại.',
      );
      await queryClient.invalidateQueries({ queryKey: ['users'] });
      resetPassword.reset();
    },
    gcTime: 0,
  });

  // Template Preview Mutation with snapshot integrity & stale response rejection
  const templatePreviewMutation = useMutation({
    onMutate: () => {
      clearApplyResult();
      setTemplatePreviewError(null);
      const requestId = ++previewRequestIdRef.current;
      return { requestId };
    },
    mutationFn: async () => {
      if (!selectedUserId) return null;
      const snapshotUserId = selectedUserId;
      const snapshotTemplateKey = selectedTemplateKey;
      const snapshotGroupId = subjectGroupId;
      const snapshotSubjects = [...subjectIds].sort();
      const snapshotProgrammeMasterId = programmeMasterId;

      const resources = {
        ...(subjectGroupId ? { subjectGroupId } : {}),
        ...(subjectIds.length > 0 ? { subjectIds } : {}),
        ...(programmeMasterId ? { programmeMasterId } : {}),
      };

      const data = await responsibilityTemplatesApi.preview(selectedUserId, {
        templateKey: selectedTemplateKey,
        resources: Object.keys(resources).length > 0 ? resources : undefined,
        subjectGroupId: subjectGroupId || undefined,
        subjectIds: subjectIds.length > 0 ? subjectIds : undefined,
        programmeMasterId: programmeMasterId || undefined,
      });

      return {
        data,
        snapshotUserId,
        snapshotTemplateKey,
        snapshotGroupId,
        snapshotSubjects,
        snapshotProgrammeMasterId,
      };
    },
    onSuccess: (result, _variables, context) => {
      if (!result) return;
      // Stale async response rejection: if a newer preview was initiated or generation invalidated, discard this one
      if (!context || context.requestId !== previewRequestIdRef.current) {
        return;
      }
      // If the user diverged inputs while preview was in-flight, discard this response
      const currentSubjects = [...subjectIds].sort();
      if (
        result.snapshotUserId !== selectedUserId ||
        result.snapshotTemplateKey !== selectedTemplateKey ||
        result.snapshotGroupId !== subjectGroupId ||
        result.snapshotProgrammeMasterId !== programmeMasterId ||
        result.snapshotSubjects.length !== currentSubjects.length ||
        !result.snapshotSubjects.every((id, idx) => id === currentSubjects[idx])
      ) {
        return;
      }

      setTemplatePreview(result.data);
      setPreviewSnapshot({
        targetUserId: result.snapshotUserId,
        templateKey: result.snapshotTemplateKey,
        subjectGroupId: result.snapshotGroupId,
        subjectIds: result.snapshotSubjects,
        programmeMasterId: result.snapshotProgrammeMasterId,
        templateVersion: result.data.version,
        previewData: result.data,
      });
      clearApplyResult();
    },
    onError: (err, _variables, context) => {
      // Discard stale error if this request is no longer the active generation
      if (!context || context.requestId !== previewRequestIdRef.current) {
        return;
      }
      setTemplatePreview(null);
      setPreviewSnapshot(null);
      setTemplatePreviewError(err instanceof Error ? err : new Error());
    },
  });

  const templatePreviewMutationResetRef = useRef(templatePreviewMutation.reset);
  templatePreviewMutationResetRef.current = templatePreviewMutation.reset;

  const invalidatePreview = useCallback(
    (options?: { clearError?: boolean }) => {
      previewRequestIdRef.current++;
      templatePreviewMutationResetRef.current();
      setTemplatePreview(null);
      setPreviewSnapshot(null);
      if (options?.clearError ?? true) {
        setTemplatePreviewError(null);
      }
    },
    [],
  );

  // Invalidate stale preview snapshot if queries are in-flight refetching, in error, or no longer authoritative
  useEffect(() => {
    if (isCoordinatorTemplate) {
      const isUnsafeOrError =
        academicYearsQuery.isFetching ||
        academicYearsQuery.isError ||
        programmeMastersQuery.isFetching ||
        programmeMastersQuery.isError;

      if (isUnsafeOrError) {
        if (
          templatePreviewRef.current !== null ||
          previewSnapshotRef.current !== null ||
          templateApplyResultRef.current !== null
        ) {
          invalidatePreview({ clearError: false });
          clearApplyResult();
        }
      }
    }
  }, [
    isCoordinatorTemplate,
    academicYearsQuery.isFetching,
    academicYearsQuery.isError,
    programmeMastersQuery.isFetching,
    programmeMastersQuery.isError,
    invalidatePreview,
    clearApplyResult,
  ]);

  // Invalidate stale preview snapshot if selected master is no longer a valid member in current scope
  useEffect(() => {
    if (
      isCoordinatorTemplate &&
      programmeMasterId &&
      isCoordinatorQueryAuthoritative &&
      !isSelectedMasterValidMember
    ) {
      if (
        templatePreviewRef.current !== null ||
        previewSnapshotRef.current !== null ||
        templateApplyResultRef.current !== null
      ) {
        invalidatePreview({ clearError: false });
        clearApplyResult();
      }
    }
  }, [
    isCoordinatorTemplate,
    programmeMasterId,
    isCoordinatorQueryAuthoritative,
    isSelectedMasterValidMember,
    invalidatePreview,
    clearApplyResult,
  ]);

  // Template Apply Mutation - strictly bound to matching preview snapshot
  const templateApplyMutation = useMutation({
    mutationFn: async () => {
      if (!selectedUserId || !previewSnapshot || !isCurrentSelectionMatchingPreview) {
        throw new Error('Dữ liệu lựa chọn đã thay đổi hoặc chưa có bản xem trước hợp lệ.');
      }
      const resources = {
        ...(previewSnapshot.subjectGroupId ? { subjectGroupId: previewSnapshot.subjectGroupId } : {}),
        ...(previewSnapshot.subjectIds.length > 0 ? { subjectIds: previewSnapshot.subjectIds } : {}),
        ...(previewSnapshot.programmeMasterId ? { programmeMasterId: previewSnapshot.programmeMasterId } : {}),
      };
      return responsibilityTemplatesApi.apply(previewSnapshot.targetUserId, {
        templateKey: previewSnapshot.templateKey,
        resources: Object.keys(resources).length > 0 ? resources : undefined,
        subjectGroupId: previewSnapshot.subjectGroupId || undefined,
        subjectIds: previewSnapshot.subjectIds.length > 0 ? previewSnapshot.subjectIds : undefined,
        programmeMasterId: previewSnapshot.programmeMasterId || undefined,
      });
    },
    onSuccess: async (data) => {
      if (data) {
        setTemplateApplyResult(data);
        const templateName = selectedTemplateDef?.name || TEMPLATE_NAMES[data.templateKey] || data.templateKey;
        setSuccess(
          data.applied === false ? '' : `Đã áp dụng thành công Mẫu trách nhiệm (${templateName}): đã cấp mới ${data.grantsAdded.length} quyền.`,
        );
        invalidatePreview({ clearError: true });
        await queryClient.invalidateQueries({ queryKey: ['users'] });
        await queryClient.invalidateQueries({ queryKey: ['delete-preflight', selectedUserId] });
      }
    },
    onError: (err) => {
      setSuccess('');
      clearApplyResult();
      invalidatePreview({ clearError: false });
      setTemplatePreviewError(err instanceof Error ? err : new Error());
    },
  });

  // Physical Delete Mutation
  const deleteMutation = useMutation({
    mutationFn: ({ id, confirmUsername }: { id: string; confirmUsername: string }) =>
      usersApi.delete(id, { confirmUsername }),
    onMutate: () => {
      setDeleteError('');
      setSuccess('');
    },
    onSuccess: async () => {
      const deletedName = selectedUser?.username ?? 'tài khoản';
      setSelectedUserId(null);
      setDeleteConfirmUsername('');
      setSuccess(`Đã xóa vĩnh viễn tài khoản ${deletedName}.`);
      await queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: async (err) => {
      if (err instanceof ApiError && err.statusCode === 409) {
        setDeleteError('Xung đột: Tài khoản vừa phát sinh dữ liệu hoặc lịch sử mới. Đang làm mới kiểm tra...');
        await queryClient.invalidateQueries({ queryKey: ['delete-preflight', selectedUserId] });
      } else if (err instanceof ApiError) {
        setDeleteError('Không thể xóa tài khoản. Hãy kiểm tra thông báo lỗi và quyền thực hiện bên trên.');
      } else {
        setDeleteError('Không thể thực hiện xóa do lỗi kết nối.');
      }
    },
  });

  // Handlers
  function handleSelectUser(user: UserManagementRecord) {
    document.querySelectorAll('details.user-directory-more[open]').forEach((el) => {
      el.removeAttribute('open');
    });
    setSuccess('');
    setDraft(null);
    setSelectedUserId(user.id);
    setAcademicYearId('');
    setProgrammeMasterId('');
    setAcademicYearPage(1);
    setProgrammeMasterPage(1);
    setKnownAcademicYears([]);
    setKnownMastersByScopeAndPage({});
    invalidatePreview();
    clearApplyResult();
    setDeleteError('');
    setDeleteConfirmUsername('');
    if (typeof window !== 'undefined' && window.innerWidth <= 768) {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    }
  }

  function startReset(user: UserManagementRecord) {
    setDraft(null);
    setConfirm(undefined);
    setSuccess('');
    setResetError('');
    resetPassword.reset();
    setResetDraft({ id: user.id, username: user.username, newPassword: '', confirmation: '' });
  }

  function submitReset(event: FormEvent) {
    event.preventDefault();
    if (!resetDraft) return;
    if (!resetDraft.newPassword) {
      setResetError('Cần nhập mật khẩu khởi tạo mới.');
      return;
    }
    if (resetDraft.newPassword !== resetDraft.confirmation) {
      setResetError('Hai lần nhập mật khẩu chưa khớp.');
      return;
    }
    resetPassword.mutate({ id: resetDraft.id, newPassword: resetDraft.newPassword });
  }

  function cancelReset() {
    setResetDraft(null);
    setResetError('');
    resetPassword.reset();
  }

  function editUser(user: UserManagementRecord) {
    setSuccess('');
    setSelectedUserId(user.id);
    setDraft({
      id: user.id,
      username: user.username,
      password: '',
      staffCode: user.profile?.staffCode ?? '',
      displayName: user.profile?.displayName ?? '',
      email: user.profile?.email ?? '',
      phone: user.profile?.phone ?? '',
      positionTitle: user.profile?.positionTitle ?? '',
      isTeachingStaff: user.profile?.isTeachingStaff ?? false,
    });
  }

  function submitDraft(event: FormEvent) {
    event.preventDefault();
    if (!draft || !draft.username.trim() || (!draft.id && !draft.password) || !draft.displayName.trim()) return;
    const input: UserInput = {
      username: draft.username,
      ...(!draft.id ? { password: draft.password } : {}),
      profile: {
        staffCode: draft.staffCode || null,
        displayName: draft.displayName,
        email: draft.email || null,
        phone: draft.phone || null,
        positionTitle: draft.positionTitle || null,
        isTeachingStaff: draft.isTeachingStaff,
      },
    };
    save.mutate({ id: draft.id, input });
  }

  function handleApplyReconciliation() {
    const missing = reconciliationPreviewQuery.data?.missing ?? [];
    if (missing.length === 0) return;
    const targetUserIds = missing.map((u: BaselineReconciliationMissingUser) => u.userId);
    applyReconciliationMutation.mutate(targetUserIds);
  }

  // Filtered users for left panel
  const filteredUsers = useMemo(() => {
    if (!query.data?.items) return [];
    return query.data.items.filter((user) => {
      if (statusFilter !== 'ALL' && user.status !== statusFilter) return false;
      if (!searchKeyword.trim()) return true;
      const kw = searchKeyword.toLowerCase();
      const matchName = user.profile?.displayName?.toLowerCase().includes(kw);
      const matchUser = user.username.toLowerCase().includes(kw);
      const matchCode = user.profile?.staffCode?.toLowerCase().includes(kw);
      return matchName || matchUser || matchCode;
    });
  }, [query.data?.items, statusFilter, searchKeyword]);

  const isDetailActive = selectedUserId !== null || draft !== null;

  return (
    <div className={`management-page staff-register users-management ${isDetailActive ? 'users-page--detail-active' : 'users-page--list-active'}`}>
      <PageHeader
        eyebrow="Quản trị nhân sự & danh tính"
        title="Người dùng"
        action={
          <div className="flex flex-wrap items-center gap-2">
            {canGrant && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setShowReconciliation((prev) => !prev);
                  setSuccess('');
                }}
              >
                {showReconciliation ? 'Đóng đối soát' : '⚖️ Đối soát chuẩn chuyên môn'}
              </Button>
            )}
            <Button
              type="button"
              onClick={() => {
                setSuccess('');
                setSelectedUserId(null);
                setDraft({ ...emptyDraft });
                invalidatePreview();
                clearApplyResult();
              }}
            >
              Tạo người dùng
            </Button>
          </div>
        }
      >
        Quản trị tài khoản, phân quyền theo Mẫu phân quyền theo nhiệm vụ và đối soát chuẩn chuyên môn toàn trường.
      </PageHeader>

      <MutationNotice
        error={
          save.error ??
          actionMutation.error ??
          resetPassword.error ??
          templateApplyMutation.error ??
          applyReconciliationMutation.error ??
          deleteMutation.error
        }
        success={success}
      />

      {/* TOP KPI METRICS RIBBON */}
      <div className="kpi-ribbon">
        <div className="kpi-card">
          <div className="kpi-card__number">{query.isPending || query.isError ? 'Chưa xác định' : query.data.total}</div>
          <div className="kpi-card__label">Tổng toàn trường</div>
        </div>
        <div className="kpi-card kpi-card--active">
          <div className="kpi-card__number">
            {query.isPending || query.isError ? 'Chưa xác định' : query.data.items.filter((u) => u.status === 'ACTIVE').length}
          </div>
          <div className="kpi-card__label">Hoạt động (Trang {page})</div>
        </div>
        <div className="kpi-card kpi-card--pending">
          <div className="kpi-card__number">
            {query.isPending || query.isError ? 'Chưa xác định' : query.data.items.filter((u) => u.status !== 'ACTIVE').length}
          </div>
          <div className="kpi-card__label">Chưa hoạt động (Trang {page})</div>
        </div>
        <div className="kpi-card kpi-card--teaching">
          <div className="kpi-card__number">
            {query.isPending || query.isError ? 'Chưa xác định' : query.data.items.filter((u) => u.profile?.isTeachingStaff).length}
          </div>
          <div className="kpi-card__label">Nhân sự giảng dạy (Trang {page})</div>
        </div>
      </div>

      {/* TOP: BASELINE RECONCILIATION SECTION (COLLAPSIBLE) */}
      {showReconciliation && canGrant && (
        <div className="form-card" style={{ borderColor: '#0f766e', borderWidth: '2px', marginBottom: '24px' }}>
          <div className="form-card-header form-card-header--teal">
            <span>Đối soát quyền cơ sở của nhân sự giảng dạy</span>
            <Button
              type="button"
              variant="quiet"
              style={{ color: '#fff', padding: '2px 8px', minHeight: '32px' }}
              onClick={() => void reconciliationPreviewQuery.refetch()}
            >
              🔄 Làm mới
            </Button>
          </div>
          <div className="form-card-body">
            {reconciliationPreviewQuery.isPending ? (
              <PageLoading />
            ) : reconciliationPreviewQuery.isError ? (
              <QueryFailure
                error={reconciliationPreviewQuery.error}
                retry={() => void reconciliationPreviewQuery.refetch()}
              />
            ) : (
              <>
                <p className="text-sm text-slate-700 mb-2">
                  Hệ thống đối soát tự động toàn bộ tài khoản hoạt động với chuẩn quyền cơ sở của nhân sự giảng dạy.
                </p>

                <div className="stat-grid">
                  <div className="stat-card">
                    <div className="stat-card__number">
                      {reconciliationPreviewQuery.data.totalActiveUsers}
                    </div>
                    <div className="stat-card__label">Tổng hoạt động</div>
                  </div>
                  <div className="stat-card stat-card--highlight">
                    <div className="stat-card__number">
                      {reconciliationPreviewQuery.data.eligibleProfessionals}
                    </div>
                    <div className="stat-card__label">Đủ điều kiện GV</div>
                  </div>
                  <div className="stat-card stat-card--success">
                    <div className="stat-card__number">
                      {reconciliationPreviewQuery.data.alreadyCompliant}
                    </div>
                    <div className="stat-card__label">Đã đạt chuẩn</div>
                  </div>
                  <div className="stat-card stat-card--warning">
                    <div className="stat-card__number" style={{ color: 'var(--section-amber)' }}>
                      {reconciliationPreviewQuery.data.missing.length}
                    </div>
                    <div className="stat-card__label">Cần bổ sung</div>
                  </div>
                  <div className="stat-card stat-card--danger">
                    <div className="stat-card__number" style={{ color: 'var(--danger)' }}>
                      {reconciliationPreviewQuery.data.conflicts.length}
                    </div>
                    <div className="stat-card__label">Xung đột</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-card__number" style={{ color: '#64748b' }}>
                      {reconciliationPreviewQuery.data.excluded.length}
                    </div>
                    <div className="stat-card__label">Loại trừ</div>
                  </div>
                </div>

                {/* Missing Users List */}
                {reconciliationPreviewQuery.data.missing.length > 0 && (
                  <div className="mb-4">
                    <h3 className="text-sm font-bold text-amber-900 mb-2">
                      ⚠️ Danh sách nhân sự thiếu quyền cơ sở ({reconciliationPreviewQuery.data.missing.length} người):
                    </h3>
                    <div className="table-region" style={{ maxHeight: '200px' }}>
                      <table>
                        <thead>
                          <tr>
                            <th>Tài khoản</th>
                            <th>Họ tên</th>
                            <th>Trạng thái</th>
                          </tr>
                        </thead>
                        <tbody>
                          {reconciliationPreviewQuery.data.missing.map((u: BaselineReconciliationMissingUser) => (
                            <tr key={u.userId}>
                              <td className="technical-value">{u.username}</td>
                              <td>{u.displayName || '—'}</td>
                              <td>
                                <StatusText active={u.status === 'ACTIVE'} activeLabel="Đang hoạt động" />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Conflicts List */}
                {reconciliationPreviewQuery.data.conflicts.length > 0 && (
                  <div className="mb-4">
                    <h3 className="text-sm font-bold text-rose-800 mb-2">
                      ❌ Xung đột hiệu lực ({reconciliationPreviewQuery.data.conflicts.length} trường hợp):
                    </h3>
                    <div className="table-region" style={{ maxHeight: '200px' }}>
                      <table>
                        <thead>
                          <tr>
                            <th>Tài khoản</th>
                            <th>Họ tên</th>
                            <th>Trạng thái xung đột</th>
                            <th>Nguyên nhân</th>
                          </tr>
                        </thead>
                        <tbody>
                          {reconciliationPreviewQuery.data.conflicts.map((c: BaselineReconciliationConflictUser) => (
                            <tr key={c.userId}>
                              <td className="technical-value">{c.username}</td>
                              <td>{c.displayName || '—'}</td>
                              <td>
                                <span className="delta-badge delta-badge--conflict">{conflictStatusLabel(c.statusConflict)}</span>
                              </td>
                              <td className="text-sm text-rose-700">{c.reason}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Apply Button */}
                <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-slate-200">
                  <Button
                    type="button"
                    disabled={
                      reconciliationPreviewQuery.data.missing.length === 0 ||
                      applyReconciliationMutation.isPending
                    }
                    loading={applyReconciliationMutation.isPending}
                    onClick={handleApplyReconciliation}
                  >
                    {reconciliationPreviewQuery.data.missing.length > 0
                      ? `Áp dụng chuẩn cho ${reconciliationPreviewQuery.data.missing.length} nhân sự còn thiếu`
                      : 'Không có tài khoản thiếu quyền cần bổ sung'}
                  </Button>
                  {reconciliationPreviewQuery.data.missing.length === 0 && (
                    <span className="text-xs text-slate-600 font-semibold">
                      Không có tài khoản trong danh sách cần bổ sung. Hãy kiểm tra riêng các trường hợp xung đột và loại trừ.
                    </span>
                  )}
                </div>

                {/* Apply Results */}
                {reconciliationApplyResult && (
                  <div className="mt-4 p-3 bg-emerald-50 border border-emerald-300 rounded text-xs text-emerald-900 space-y-1">
                    <div className="font-bold text-sm">Kết quả đối soát vừa thực hiện:</div>
                    <div>Số tài khoản đã xử lý: {reconciliationApplyResult.processedCount}</div>
                    <div>Số quyền chuẩn cơ sở giáo viên được cấp mới: {reconciliationApplyResult.grantsCreated}</div>
                    <div>Bỏ qua do đã tuân thủ: {reconciliationApplyResult.skippedAlreadyCompliant}</div>
                    <div>Bỏ qua do xung đột: {reconciliationApplyResult.skippedConflict}</div>
                    <div>Bỏ qua do loại trừ: {reconciliationApplyResult.skippedExcluded}</div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* SPLIT WORKSPACE: 5/7 RATIO ON DESKTOP */}
      <div className={`admin-workspace ${isDetailActive ? 'admin-workspace--detail-active' : 'admin-workspace--list-active'}`}>
        {/* LEFT COLUMN: COMPACT USER DIRECTORY */}
        <div className="admin-workspace__sidebar">
          <div className="form-card" style={{ borderColor: '#1e3a8a', borderWidth: '2px' }}>
            <div className="form-card-header form-card-header--blue">
              <span>1. Danh sách người dùng ({query.data?.items?.length ?? 0} trang này / Tổng {query.isPending || query.isError ? 'Chưa xác định' : query.data.total})</span>
              {selectedUser && (
                <span className="text-[11px] bg-blue-700 text-white px-2 py-0.5 rounded font-bold">
                  Đang chọn: {selectedUser.username}
                </span>
              )}
            </div>

            <div className="p-2.5 bg-slate-100 border-b border-slate-300 space-y-1.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="🔍 Tìm trong trang hiện tại (tên, tài khoản, mã)..."
                  aria-label="Tìm trong trang hiện tại"
                  className="form-field__input"
                  style={{ minHeight: '44px', fontSize: '13px', background: '#fff' }}
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                />
                <select
                  aria-label="Lọc theo trạng thái"
                  className="form-field__input"
                  style={{ minHeight: '44px', fontSize: '13px', background: '#fff' }}
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="ALL">Tất cả trạng thái</option>
                  <option value="ACTIVE">Đang hoạt động</option>
                  <option value="PENDING">Chờ kích hoạt</option>
                  <option value="DISABLED">Đã vô hiệu hóa</option>
                  <option value="LOCKED">Đang khóa</option>
                </select>
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-600 px-1 font-medium">
                <span>Lọc trong {query.data?.items?.length ?? 0} tài khoản của trang {page} (Tổng toàn trường: {query.isPending || query.isError ? 'Chưa xác định' : query.data.total}). Dùng thanh phân trang bên dưới để xem thêm.</span>
                <span className="font-semibold text-slate-700 whitespace-nowrap ml-2">
                  {filteredUsers.length} / {query.data?.items?.length ?? 0} hiển thị
                </span>
              </div>
            </div>

            {query.isPending ? (
              <PageLoading />
            ) : query.isError ? (
              <QueryFailure error={query.error} retry={() => void query.refetch()} />
            ) : filteredUsers.length === 0 ? (
              <div className="p-6 text-center text-sm text-slate-600">
                {query.data.total === 0 ? 'Chưa có tài khoản người dùng.' : 'Không tìm thấy tài khoản phù hợp trong trang này. Hãy điều chỉnh bộ lọc hoặc chuyển trang.'}
              </div>
            ) : (
              <>
                <div className="user-directory-region" role="region" aria-label="Danh sách người dùng">
                  <table className="user-directory-table">
                    <caption className="sr-only">Danh sách người dùng</caption>
                    <tbody>
                      {filteredUsers.map((user, index) => {
                        const isSelected = user.id === selectedUserId;
                        const isNearBottom = index >= filteredUsers.length - 3;
                        const initial = user.profile?.displayName
                          ? user.profile.displayName.trim().charAt(0).toUpperCase()
                          : user.username.charAt(0).toUpperCase();
                        return (
                          <tr
                            key={user.id}
                            className={`user-directory-row ${isSelected ? 'user-directory-row--selected' : ''}`}
                            style={isSelected ? { backgroundColor: '#eff6ff', cursor: 'pointer' } : { cursor: 'pointer' }}
                            onClick={() => handleSelectUser(user)}
                          >
                            <td className="user-directory-cell">
                              <div className="user-directory-item">
                                <span className="user-directory-avatar" aria-hidden="true">
                                  {initial}
                                </span>
                                <div className="user-directory-body">
                                  <div className="user-directory-line1">
                                    <button
                                      type="button"
                                      className="user-directory-name"
                                      onClick={() => handleSelectUser(user)}
                                    >
                                      <strong>{user.profile?.displayName ?? 'Chưa có tên hiển thị'}</strong>
                                    </button>
                                    <div className="user-directory-badges">
                                      <StatusText
                                        active={user.status === 'ACTIVE'}
                                        activeLabel="Đang hoạt động"
                                        inactiveLabel={statusLabel(user.status)}
                                        inactiveTone={user.status === 'LOCKED' || user.status === 'DISABLED' ? 'error' : 'warning'}
                                      />
                                      {user.profile?.isTeachingStaff ? (
                                        <span className="badge-pill badge-pill--teaching" title="Nhân sự giảng dạy">
                                          GV
                                        </span>
                                      ) : (
                                        <span className="badge-pill badge-pill--slate" title="Nhân sự không giảng dạy">
                                          NV
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <div className="user-directory-line2">
                                    <span className="user-directory-username technical-value">{user.username}</span>
                                    {user.profile?.staffCode ? (
                                      <span className="user-directory-staffcode technical-value">#{user.profile.staffCode}</span>
                                    ) : (
                                      <span className="user-directory-staffcode-empty">#—</span>
                                    )}
                                    <span className="user-directory-dot" aria-hidden="true">•</span>
                                    <span className="user-directory-position">{user.profile?.positionTitle || 'Chưa phân chức danh'}</span>
                                  </div>
                                </div>

                                <div className="user-directory-actions" onClick={(e) => e.stopPropagation()}>
                                  <Button
                                    type="button"
                                    variant={isSelected ? 'primary' : 'quiet'}
                                    className="btn--compact"
                                    aria-label={`Chọn ${user.username}`}
                                    data-user-id={user.id}
                                    onClick={() => handleSelectUser(user)}
                                  >
                                    {isSelected ? 'Đang chọn' : 'Chọn'}
                                  </Button>
                                  <Button
                                    type="button"
                                    variant={isSelected ? 'primary' : 'quiet'}
                                    className="btn--compact"
                                    aria-label={`Sửa ${user.username}`}
                                    onClick={() => {
                                      handleSelectUser(user);
                                      editUser(user);
                                    }}
                                  >
                                    Sửa
                                  </Button>

                                  {confirm?.id === user.id ? (
                                    <div className="user-directory-confirm-inline">
                                      <span className="text-[11px] font-semibold text-rose-800">
                                        Xác nhận {actionLabel(confirm.action).toLowerCase()}?
                                      </span>
                                      <Button
                                        type="button"
                                        variant="secondary"
                                        className="btn--compact"
                                        loading={actionMutation.isPending}
                                        onClick={() => actionMutation.mutate(confirm)}
                                      >
                                        Xác nhận
                                      </Button>
                                      <Button type="button" variant="quiet" className="btn--compact" onClick={() => setConfirm(undefined)}>
                                        Hủy
                                      </Button>
                                    </div>
                                  ) : (user.status === 'DISABLED' || user.status === 'PENDING') ? (
                                    <Button
                                      type="button"
                                      variant="quiet"
                                      className="btn--compact"
                                      onClick={() => {
                                        setSuccess('');
                                        setConfirm({ id: user.id, action: 'activate' });
                                      }}
                                    >
                                      Kích hoạt
                                    </Button>
                                  ) : user.status === 'LOCKED' ? (
                                    <Button
                                      type="button"
                                      variant="quiet"
                                      className="btn--compact"
                                      onClick={() => {
                                        setSuccess('');
                                        setConfirm({ id: user.id, action: 'unlock' });
                                      }}
                                    >
                                      Mở khóa
                                    </Button>
                                  ) : (
                                    <details
                                      className="user-directory-more"
                                      onClick={(e) => e.stopPropagation()}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Escape') {
                                          e.preventDefault();
                                          const details = e.currentTarget as HTMLDetailsElement;
                                          details.open = false;
                                          const summary = details.querySelector('summary');
                                          summary?.focus();
                                        }
                                      }}
                                    >
                                      <summary
                                        className="btn btn--quiet btn--compact user-directory-more__summary"
                                        aria-label={`Thao tác khác cho ${user.username}`}
                                        title="Thao tác khác"
                                      >
                                        •••
                                      </summary>
                                      <div className={`user-directory-more__menu ${isNearBottom ? 'user-directory-more__menu--up' : ''}`}>
                                        {user.status === 'ACTIVE' && (
                                          <Button
                                            type="button"
                                            variant="quiet"
                                            className="btn--compact w-full text-left"
                                            onClick={(e) => {
                                              const details = (e.target as HTMLElement).closest('details');
                                              if (details) details.open = false;
                                              setSuccess('');
                                              setConfirm({ id: user.id, action: 'disable' });
                                            }}
                                          >
                                            Vô hiệu hóa
                                          </Button>
                                        )}
                                        {canResetPasswords && user.status === 'ACTIVE' && user.id !== auth?.user.id && (
                                          <Button
                                            type="button"
                                            variant="quiet"
                                            className="btn--compact w-full text-left"
                                            onClick={(e) => {
                                              const details = (e.target as HTMLElement).closest('details');
                                              if (details) details.open = false;
                                              startReset(user);
                                            }}
                                          >
                                            Đặt lại mật khẩu
                                          </Button>
                                        )}
                                      </div>
                                    </details>
                                  )}
                                </div>
                              </div>

                              {/* Inline Password Reset Form matching test selectors */}
                              {resetDraft?.id === user.id && (
                                <form className="row-confirm mt-2 p-3 bg-white border border-slate-300 rounded" onSubmit={submitReset} onClick={(e) => e.stopPropagation()}>
                                  <p className="text-xs text-slate-700 mb-2">
                                    Đặt lại mật khẩu cho <strong>{resetDraft.username}</strong>. Người dùng sẽ phải đổi
                                    mật khẩu khi đăng nhập lần tới; mọi phiên hiện có sẽ bị thu hồi.
                                  </p>
                                  <FormField
                                    id={`reset-password-${user.id}`}
                                    name="new-password"
                                    type="password"
                                    label="Mật khẩu khởi tạo mới"
                                    autoComplete="new-password"
                                    minLength={12}
                                    maxLength={1024}
                                    required
                                    value={resetDraft.newPassword}
                                    onChange={(event) => {
                                      setResetError('');
                                      setResetDraft({ ...resetDraft, newPassword: event.target.value });
                                    }}
                                  />
                                  <FormField
                                    id={`reset-confirm-${user.id}`}
                                    name="confirm-password"
                                    type="password"
                                    label="Nhập lại mật khẩu mới"
                                    autoComplete="new-password"
                                    minLength={12}
                                    maxLength={1024}
                                    required
                                    value={resetDraft.confirmation}
                                    onChange={(event) => {
                                      setResetError('');
                                      setResetDraft({ ...resetDraft, confirmation: event.target.value });
                                    }}
                                  />
                                  {resetError && (
                                    <p role="alert" className="form-field__error">
                                      {resetError}
                                    </p>
                                  )}
                                  <div className="flex gap-2 mt-2">
                                    <Button type="submit" variant="secondary" loading={resetPassword.isPending}>
                                      Xác nhận đặt lại
                                    </Button>
                                    <Button type="button" variant="quiet" onClick={cancelReset}>
                                      Hủy đặt lại
                                    </Button>
                                  </div>
                                </form>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <Pagination
                  page={query.data.page}
                  pageSize={query.data.pageSize}
                  total={query.data.total}
                  onPage={(newPage) => {
                    document.querySelectorAll('details.user-directory-more[open]').forEach((el) => {
                      el.removeAttribute('open');
                    });
                    setPage(newPage);
                  }}
                />
              </>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: WORKSPACE / CREATION / TEMPLATES / DELETE */}
        <div className="admin-workspace__main">
          {/* Mobile Back-to-List bar for task-oriented workflow */}
          {isDetailActive && (
            <div className="mobile-workflow-bar" role="region" aria-label="Điều hướng chi tiết người dùng">
              <button
                type="button"
                className="mobile-workflow-bar__btn"
                aria-label="Quay lại danh sách người dùng"
                onClick={() => {
                  const prevId = selectedUserId;
                  setSelectedUserId(null);
                  setDraft(null);
                  invalidatePreview();
                  clearApplyResult();
                  setTimeout(() => {
                    if (prevId) {
                      const btn = document.querySelector<HTMLButtonElement>(`button[data-user-id="${prevId}"]`);
                      btn?.focus();
                    }
                  }, 50);
                }}
              >
                ← Quay lại danh sách
              </button>
              {selectedUser ? (
                <span className="mobile-workflow-bar__info" title={`Đang thao tác: ${selectedUser.username}`}>
                  <span className="mobile-workflow-bar__info-prefix">Đang thao tác:</span>{' '}
                  <strong className="mobile-workflow-bar__username">{selectedUser.username}</strong>
                </span>
              ) : draft ? (
                <span className="mobile-workflow-bar__info">
                  {draft.id ? `Sửa: ${draft.username}` : 'Tạo mới người dùng'}
                </span>
              ) : null}
            </div>
          )}
          {draft ? (
            /* CREATE / EDIT FORM */
            <form className="long-form" onSubmit={submitDraft}>
              <h2>{draft.id ? `Chỉnh sửa người dùng: ${draft.username}` : 'Tạo người dùng mới'}</h2>
              <FormSection title="Tài khoản">
                <div className="form-grid">
                  <FormField
                    label="Tên đăng nhập"
                    name="username"
                    autoComplete="off"
                    value={draft.username}
                    onChange={(e) => setDraft({ ...draft, username: e.target.value })}
                    required
                  />
                  {!draft.id && (
                    <FormField
                      label="Mật khẩu khởi tạo"
                      name="initial-password"
                      type="password"
                      autoComplete="new-password"
                      hint="Có thể dán mật khẩu. Mật khẩu không được lưu trên giao diện sau khi tạo."
                      value={draft.password}
                      onChange={(e) => setDraft({ ...draft, password: e.target.value })}
                      required
                    />
                  )}
                </div>
              </FormSection>
              <FormSection title="Hồ sơ nhân sự">
                <div className="form-grid">
                  <FormField
                    label="Mã nhân sự"
                    name="staff-code"
                    value={draft.staffCode}
                    onChange={(e) => setDraft({ ...draft, staffCode: e.target.value })}
                  />
                  <FormField
                    label="Tên hiển thị"
                    name="display-name"
                    value={draft.displayName}
                    onChange={(e) => setDraft({ ...draft, displayName: e.target.value })}
                    required
                  />
                  <FormField
                    label="Email"
                    name="email"
                    type="email"
                    value={draft.email}
                    onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                  />
                  <FormField
                    label="Số điện thoại"
                    name="phone"
                    value={draft.phone}
                    onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                  />
                  <FormField
                    label="Chức danh"
                    name="position-title"
                    value={draft.positionTitle}
                    onChange={(e) => setDraft({ ...draft, positionTitle: e.target.value })}
                  />
                </div>
                <label className="check-field mt-3">
                  <input
                    type="checkbox"
                    checked={draft.isTeachingStaff}
                    onChange={(e) => setDraft({ ...draft, isTeachingStaff: e.target.checked })}
                  />
                  Là nhân sự giảng dạy
                </label>
              </FormSection>
              <div className="form-actions mt-4">
                <Button type="submit" loading={save.isPending}>
                  {draft.id ? 'Lưu thay đổi' : 'Tạo người dùng'}
                </Button>
                <Button type="button" variant="quiet" onClick={() => setDraft(null)}>
                  Hủy
                </Button>
              </div>
            </form>
          ) : selectedUser ? (
            /* SELECTED USER WORKSPACE */
            <div className="space-y-4">
              {/* Selected User Header Card */}
              <div className="form-card" style={{ marginBottom: '16px' }}>
                <div className="selected-user-header">
                  <div className="selected-user-header__profile">
                    <span
                      className="selected-user-header__avatar"
                      aria-hidden="true"
                    >
                      {selectedUser.profile?.displayName
                        ? selectedUser.profile.displayName.trim().charAt(0).toUpperCase()
                        : selectedUser.username.charAt(0).toUpperCase()}
                    </span>
                    <div className="selected-user-header__identity">
                      <div className="selected-user-header__name-row">
                        <span className="selected-user-header__name">
                          👤 {selectedUser.profile?.displayName ?? selectedUser.username}
                        </span>
                      </div>
                      <div className="selected-user-header__meta">
                        <span className="technical-value selected-user-header__username">@{selectedUser.username}</span>
                        {selectedUser.profile?.staffCode && (
                          <span className="selected-user-header__staffcode">
                            Mã: #{selectedUser.profile.staffCode}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="selected-user-header__badges">
                    <StatusText
                      active={selectedUser.status === 'ACTIVE'}
                      activeLabel="Đang hoạt động"
                      inactiveLabel={statusLabel(selectedUser.status)}
                      inactiveTone={selectedUser.status === 'LOCKED' || selectedUser.status === 'DISABLED' ? 'error' : 'warning'}
                    />
                    <span
                      className={`selected-user-header__role-badge ${
                        selectedUser.profile?.isTeachingStaff
                          ? 'selected-user-header__role-badge--teaching'
                          : 'selected-user-header__role-badge--staff'
                      }`}
                    >
                      {selectedUser.profile?.isTeachingStaff ? 'Nhân sự giảng dạy' : 'Nhân sự văn phòng / khác'}
                    </span>
                  </div>
                </div>

                {/* Workspace Navigation Tabs */}
                <div className="workspace-tabs" aria-label="Khu vực thao tác tài khoản">
                  <button
                    type="button"
                    className={`workspace-tab-btn ${
                      activeTab === 'templates' ? 'workspace-tab-btn--active' : ''
                    }`}
                    aria-label="Mẫu phân quyền theo nhiệm vụ (Mẫu trách nhiệm)"
                    onClick={() => setActiveTab('templates')}
                  >
                    🏷️ Mẫu phân quyền theo nhiệm vụ
                  </button>
                  <button
                    type="button"
                    className={`workspace-tab-btn ${
                      activeTab === 'profile' ? 'workspace-tab-btn--active' : ''
                    }`}
                    aria-label="Hồ sơ & Trạng thái"
                    onClick={() => setActiveTab('profile')}
                  >
                    📋 Hồ sơ & Trạng thái
                  </button>
                  {canManageUsers && (
                    <button
                      type="button"
                      className={`workspace-tab-btn ${
                        activeTab === 'safe-delete'
                          ? 'workspace-tab-btn--danger workspace-tab-btn--active'
                          : 'workspace-tab-btn--danger'
                      }`}
                      aria-label="Xóa tài khoản an toàn"
                      onClick={() => setActiveTab('safe-delete')}
                    >
                      🗑️ Xóa tài khoản an toàn
                    </button>
                  )}
                </div>

                {/* TAB 1: RESPONSIBILITY TEMPLATES */}
                {activeTab === 'templates' && (
                  <div className="p-4 space-y-4">
                    <div className="text-sm text-slate-700">
                      Gán quyền tự động theo <strong>Mẫu phân quyền theo nhiệm vụ được phê duyệt</strong>. Hệ thống sẽ kiểm tra
                      tính hợp lệ, xung đột và thời hạn trước khi áp dụng.
                    </div>

                    {/* Server-Owned Template Catalog & Selection */}
                    {!canGrant ? (
                      <p>Tài khoản chưa được cấp quyền cấp và thu hồi quyền. Bạn có thể xem hồ sơ và trạng thái tài khoản.</p>
                    ) : templatesQuery.isPending ? (
                      <PageLoading />
                    ) : templatesQuery.isError ? (
                      <QueryFailure
                        error={templatesQuery.error}
                        retry={() => void templatesQuery.refetch()}
                      />
                    ) : !templatesQuery.data?.items || templatesQuery.data.items.length === 0 ? (
                      <div className="p-4 bg-slate-100 border border-slate-300 rounded text-xs text-slate-700">
                        Chưa có Mẫu phân quyền nào được cấu hình trên máy chủ.
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <label className="form-field__label" htmlFor="template-select">
                              Chọn Mẫu phân quyền theo nhiệm vụ:
                            </label>
                            <select
                              id="template-select"
                              className="form-field__input font-bold"
                              aria-label="Chọn Mẫu phân quyền theo nhiệm vụ (Chọn Mẫu trách nhiệm)"
                              value={selectedTemplateKey}
                              onChange={(e) => {
                                setSelectedTemplateKey(e.target.value as ResponsibilityTemplateKey);
                                setSubjectGroupId('');
                                setSubjectIds([]);
                                setAcademicYearId('');
                                setProgrammeMasterId('');
                                setAcademicYearPage(1);
                                setProgrammeMasterPage(1);
                                setKnownAcademicYears([]);
                                setKnownMastersByScopeAndPage({});
                                invalidatePreview();
                                clearApplyResult();
                              }}
                            >
                              {templatesQuery.data.items.map((t) => (
                                <option key={t.key} value={t.key}>
                                  {t.name}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Server-owned Template Metadata */}
                          {selectedTemplateDef && (
                            <div className="p-3 bg-slate-100 border border-slate-300 rounded text-xs space-y-1.5">
                              <div className="font-bold text-slate-900 flex items-center justify-between">
                                <span>{selectedTemplateDef.name}</span>
                                <span className="technical-value text-[11px] bg-slate-200 text-slate-800 px-1.5 py-0.5 rounded">
                                  {selectedTemplateDef.version}
                                </span>
                              </div>
                              <p className="text-slate-700 m-0 leading-relaxed">
                                {selectedTemplateDef.key === 'TECHNICAL_ACCOUNT_ADMIN' ? 'Quản trị tài khoản người dùng, cấp quyền, xem nhật ký hệ thống và quản trị danh mục kiêm nhiệm.' : templateCopy(selectedTemplateDef.description)}
                              </p>
                              <div className="flex flex-wrap gap-1.5 pt-1 text-[11px]">
                                <span className="px-2 py-0.5 bg-blue-100 text-blue-900 rounded font-semibold">
                                  Tài nguyên:{' '}
                                  {selectedTemplateDef.requiredResourceKind === 'NONE'
                                    ? 'Không yêu cầu'
                                    : selectedTemplateDef.requiredResourceKind === 'SUBJECT_GROUP'
                                    ? 'Tổ chuyên môn & môn học'
                                    : 'Chương trình đặc thù'}
                                </span>
                                <span
                                  className={`px-2 py-0.5 rounded font-semibold ${
                                    selectedTemplateDef.requiresTeachingStaff
                                      ? 'bg-emerald-100 text-emerald-900'
                                      : 'bg-slate-200 text-slate-800'
                                  }`}
                                >
                                  {selectedTemplateDef.requiresTeachingStaff
                                    ? 'Bắt buộc nhân sự giảng dạy'
                                    : 'Không ràng buộc giảng dạy'}
                                </span>
                              </div>
                            </div>
                          )}

                          {/* Subject Leader Resources */}
                          {selectedTemplateKey === 'SUBJECT_LEADER' && (
                            <div className="space-y-3 md:col-span-2 p-3 bg-indigo-50 border border-indigo-200 rounded">
                              <div>
                                <label className="form-field__label" htmlFor="subject-group-select">
                                  Tổ chuyên môn phụ trách (Bắt buộc):
                                </label>
                                <div className="text-[11px] text-slate-500 mb-1">
                                  Hiển thị tối đa 100 tổ bộ môn đang hoạt động.
                                </div>
                                <select
                                  id="subject-group-select"
                                  className="form-field__input"
                                  value={subjectGroupId}
                                  onChange={(e) => {
                                    setSubjectGroupId(e.target.value);
                                    invalidatePreview();
                                    clearApplyResult();
                                  }}
                                >
                                  <option value="">-- Chọn tổ chuyên môn --</option>
                                  {subjectGroupsQuery.data?.items?.map((g) => (
                                    <option key={g.id} value={g.id}>
                                      {g.name} ({g.code})
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div>
                                <label className="form-field__label">
                                  Môn chuyên môn được giao cho tổ trưởng (Tùy chọn):
                                </label>
                                <div className="text-[11px] text-slate-500 mb-1">
                                  Hiển thị tối đa 100 môn học đang hoạt động.
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-1">
                                  {subjectsQuery.data?.items?.map((s) => {
                                    const isChecked = subjectIds.includes(s.id);
                                    return (
                                      <label key={s.id} className="check-field text-xs">
                                        <input
                                          type="checkbox"
                                          checked={isChecked}
                                          onChange={(e) => {
                                            if (e.target.checked) {
                                              setSubjectIds([...subjectIds, s.id]);
                                            } else {
                                              setSubjectIds(subjectIds.filter((id) => id !== s.id));
                                            }
                                            invalidatePreview();
                                            clearApplyResult();
                                          }}
                                        />
                                        <span>
                                          {s.name} ({s.code})
                                        </span>
                                      </label>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Coordinator Resources */}
                          {isCoordinatorTemplate && (
                            <div className="md:col-span-2 p-4 bg-blue-50/50 border border-blue-200 rounded-lg space-y-4">
                              <div>
                                <div className="flex items-center gap-2 text-blue-950 font-bold text-sm">
                                  <span>📋 Tài nguyên phụ trách: Chương trình {programmeKind === 'GDDP' ? 'Giáo dục địa phương (GDĐP)' : 'Hoạt động trải nghiệm, hướng nghiệp (HĐTN-HN)'}</span>
                                </div>
                                <p className="text-xs text-blue-900 mt-1 mb-0">
                                  Chọn năm học và chương trình đào tạo tương ứng để cấp quyền điều phối cho người dùng.
                                </p>
                              </div>

                              {/* Academic Year Selection */}
                              <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                  <label htmlFor="coordinator-academic-year-select" className="block text-xs font-semibold text-slate-800">
                                    1. Chọn năm học <span className="text-rose-600">*</span>
                                  </label>
                                  {academicYearsQuery.data && (
                                    <span className="text-[11px] text-slate-500 font-mono">
                                      (Tổng: {academicYearsQuery.data.total} năm học)
                                    </span>
                                  )}
                                </div>
                                {academicYearsQuery.isPending ? (
                                  <div className="text-xs text-slate-600 italic py-1">⏳ Đang tải danh mục năm học...</div>
                                ) : academicYearsQuery.isError ? (
                                  <div className="p-2.5 bg-rose-50 border border-rose-200 rounded text-xs text-rose-800">
                                    ❌ Không thể tải danh mục năm học: <QueryFailure error={academicYearsQuery.error} retry={() => void academicYearsQuery.refetch()} />
                                  </div>
                                ) : academicYearsQuery.data?.total === 0 ? (
                                  <div className="p-2.5 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
                                    ⚠️ Hệ thống chưa có năm học nào được thiết lập.
                                  </div>
                                ) : (
                                  <>
                                    <select
                                      id="coordinator-academic-year-select"
                                      aria-label="Chọn năm học cho mẫu điều phối"
                                      className="form-field__input w-full"
                                      value={academicYearId}
                                      onChange={(e) => {
                                        const newYearId = e.target.value;
                                        setAcademicYearId(newYearId);
                                        setProgrammeMasterId('');
                                        setProgrammeMasterPage(1);
                                        invalidatePreview();
                                        clearApplyResult();
                                      }}
                                    >
                                      <option value="">-- Chọn năm học --</option>
                                      {academicYearId &&
                                        !academicYearsQuery.data?.items?.some((y) => y.id === academicYearId) &&
                                        knownAcademicYears.some((y) => y.id === academicYearId) && (
                                          <option value={academicYearId}>
                                            {knownAcademicYears.find((y) => y.id === academicYearId)?.name} (
                                            {knownAcademicYears.find((y) => y.id === academicYearId)?.code}) (Đã chọn)
                                          </option>
                                        )}
                                      {academicYearsQuery.data?.items.map((y) => (
                                        <option key={y.id} value={y.id}>
                                          {y.name} ({y.code})
                                        </option>
                                      ))}
                                    </select>
                                    {academicYearsQuery.data && academicYearsQuery.data.totalPages > 1 && (
                                      <nav className="flex items-center justify-between text-xs text-slate-600 pt-1" aria-label="Phân trang năm học">
                                        <span>
                                          Trang <strong>{academicYearPage}</strong> / {academicYearsQuery.data.totalPages}
                                        </span>
                                        <div className="flex gap-1">
                                          <button
                                            type="button"
                                            aria-label="Trang trước (năm học)"
                                            className="px-2 py-0.5 border border-slate-300 rounded bg-white hover:bg-slate-50 disabled:opacity-50 text-[11px]"
                                            disabled={academicYearPage <= 1 || academicYearsQuery.isPending}
                                            onClick={() => setAcademicYearPage((p) => Math.max(1, p - 1))}
                                          >
                                            Trang trước
                                          </button>
                                          <button
                                            type="button"
                                            aria-label="Trang sau (năm học)"
                                            className="px-2 py-0.5 border border-slate-300 rounded bg-white hover:bg-slate-50 disabled:opacity-50 text-[11px]"
                                            disabled={academicYearPage >= academicYearsQuery.data.totalPages || academicYearsQuery.isPending}
                                            onClick={() => setAcademicYearPage((p) => p + 1)}
                                          >
                                            Trang sau
                                          </button>
                                        </div>
                                      </nav>
                                    )}
                                  </>
                                )}
                              </div>

                              {/* Programme Master Selection */}
                              <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                  <label htmlFor="coordinator-programme-master-select" className="block text-xs font-semibold text-slate-800">
                                    2. Chọn chương trình {programmeKind === 'GDDP' ? 'Giáo dục địa phương (GDĐP)' : 'Hoạt động trải nghiệm, hướng nghiệp (HĐTN-HN)'} <span className="text-rose-600">*</span>
                                  </label>
                                  {programmeMastersQuery.data && (
                                    <span className="text-[11px] text-slate-500 font-mono">
                                      (Tổng: {programmeMastersQuery.data.total} chương trình)
                                    </span>
                                  )}
                                </div>
                                {!academicYearId ? (
                                  <div className="text-xs text-slate-500 italic py-1">
                                    ℹ️ Vui lòng chọn năm học ở bước 1 trước khi chọn chương trình.
                                  </div>
                                ) : programmeMastersQuery.isPending ? (
                                  <div className="text-xs text-slate-600 italic py-1">⏳ Đang tải danh sách chương trình đào tạo...</div>
                                ) : programmeMastersQuery.isError ? (
                                  <div className="p-2.5 bg-rose-50 border border-rose-200 rounded text-xs text-rose-800">
                                    ❌ Không thể tải danh sách chương trình: <QueryFailure error={programmeMastersQuery.error} retry={() => void programmeMastersQuery.refetch()} />
                                  </div>
                                ) : programmeMastersQuery.data?.total === 0 ? (
                                  <div className="p-2.5 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
                                    ⚠️ Năm học này chưa có chương trình đào tạo nào thuộc loại {programmeKind === 'GDDP' ? 'Giáo dục địa phương (GDĐP)' : 'Hoạt động trải nghiệm, hướng nghiệp (HĐTN-HN)'}.
                                  </div>
                                ) : (
                                  <>
                                    <select
                                      id="coordinator-programme-master-select"
                                      aria-label="Chọn chương trình đào tạo cho mẫu điều phối"
                                      className="form-field__input w-full"
                                      value={programmeMasterId}
                                      onChange={(e) => {
                                        const newMasterId = e.target.value;
                                        setProgrammeMasterId(newMasterId);
                                        invalidatePreview();
                                        clearApplyResult();
                                      }}
                                    >
                                      <option value="">-- Chọn chương trình đào tạo --</option>
                                      {(() => {
                                        const currentItems = (programmeMastersQuery.data?.items || []).filter(
                                          (m) => m.academicYearId === academicYearId && m.kind === programmeKind,
                                        );
                                        return (
                                          <>
                                            {programmeMasterId &&
                                              !currentItems.some((m) => m.id === programmeMasterId) &&
                                              currentScopeMasters.some((m) => m.id === programmeMasterId) && (
                                                <option value={programmeMasterId}>
                                                  {(() => {
                                                    const sm = currentScopeMasters.find((m) => m.id === programmeMasterId);
                                                    return `Chương trình ${sm?.kind === 'GDDP' ? 'Giáo dục địa phương' : 'Hoạt động trải nghiệm, hướng nghiệp'} - ${sm?.gradeLevel ? `Khối ${sm.gradeLevel}` : 'Toàn trường'} (${sm?.id.slice(0, 8)}) (Đã chọn)`;
                                                  })()}
                                                </option>
                                              )}
                                            {currentItems.map((m) => (
                                              <option key={m.id} value={m.id}>
                                                Chương trình {m.kind === 'GDDP' ? 'Giáo dục địa phương' : 'Hoạt động trải nghiệm, hướng nghiệp'} - {m.gradeLevel ? `Khối ${m.gradeLevel}` : 'Toàn trường'} ({m.id.slice(0, 8)})
                                              </option>
                                            ))}
                                          </>
                                        );
                                      })()}
                                    </select>
                                    {programmeMastersQuery.data && programmeMastersQuery.data.totalPages > 1 && (
                                      <nav className="flex items-center justify-between text-xs text-slate-600 pt-1" aria-label="Phân trang chương trình">
                                        <span>
                                          Trang <strong>{programmeMasterPage}</strong> / {programmeMastersQuery.data.totalPages}
                                        </span>
                                        <div className="flex gap-1">
                                          <button
                                            type="button"
                                            aria-label="Trang trước (chương trình)"
                                            className="px-2 py-0.5 border border-slate-300 rounded bg-white hover:bg-slate-50 disabled:opacity-50 text-[11px]"
                                            disabled={programmeMasterPage <= 1 || programmeMastersQuery.isPending}
                                            onClick={() => setProgrammeMasterPage((p) => Math.max(1, p - 1))}
                                          >
                                            Trang trước
                                          </button>
                                          <button
                                            type="button"
                                            aria-label="Trang sau (chương trình)"
                                            className="px-2 py-0.5 border border-slate-300 rounded bg-white hover:bg-slate-50 disabled:opacity-50 text-[11px]"
                                            disabled={programmeMasterPage >= programmeMastersQuery.data.totalPages || programmeMastersQuery.isPending}
                                            onClick={() => setProgrammeMasterPage((p) => p + 1)}
                                          >
                                            Trang sau
                                          </button>
                                        </div>
                                      </nav>
                                    )}
                                  </>
                                )}
                              </div>

                              {programmeMasterId && isSelectedMasterValidMember && !coordinatorSelectorMissing && (
                                <div className="p-2 bg-emerald-50 border border-emerald-300 rounded text-xs text-emerald-900 flex items-center gap-1.5 font-medium">
                                  <span>✅ Đã chọn tài nguyên chương trình hợp lệ. Bạn có thể bấm "Kiểm tra quyền trước khi áp dụng" bên dưới.</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Preview & Apply Buttons */}
                        <div className="flex flex-wrap items-center gap-3 pt-2">
                          <Button
                            type="button"
                            variant="secondary"
                            aria-label="Kiểm tra quyền trước khi áp dụng (Xem trước thay đổi quyền)"
                            disabled={
                              coordinatorSelectorMissing ||
                              (selectedTemplateKey === 'SUBJECT_LEADER' && !subjectGroupId) ||
                              templatePreviewMutation.isPending
                            }
                            loading={templatePreviewMutation.isPending}
                            onClick={() => templatePreviewMutation.mutate()}
                          >
                            👁️ Kiểm tra quyền trước khi áp dụng
                          </Button>

                          {templatePreview && canGrant && isCurrentSelectionMatchingPreview && (
                            <Button
                              type="button"
                              variant="primary"
                              aria-label={`Áp dụng Mẫu phân quyền (${selectedTemplateDef?.name || TEMPLATE_NAMES[selectedTemplateKey]}) (Áp dụng Mẫu trách nhiệm)`}
                              disabled={
                                !templatePreview.eligibility.isEligible ||
                                !templatePreview.requiredResources.provided ||
                                templatePreview.conflicts.length > 0 ||
                                coordinatorSelectorMissing ||
                                !isCurrentSelectionMatchingPreview ||
                                templateApplyMutation.isPending ||
                                templatePreviewMutation.isPending
                              }
                              loading={templateApplyMutation.isPending}
                              onClick={() => templateApplyMutation.mutate()}
                            >
                              ✅ Áp dụng Mẫu phân quyền ({selectedTemplateDef?.name || TEMPLATE_NAMES[selectedTemplateKey]})
                            </Button>
                          )}
                        </div>
                      </>
                    )}

                    {templatePreviewError && (
                      <div className="p-3 bg-rose-50 border border-rose-300 rounded text-xs text-rose-800">
                        <ErrorFeedback error={templatePreviewError} title="Chưa hoàn tất kiểm tra hoặc áp dụng quyền" />
                        {templatePreviewError instanceof ApiError && templatePreviewError.statusCode === 409 && <p>Hãy kiểm tra quyền trước khi áp dụng lại mẫu.</p>}
                      </div>
                    )}

                    {/* Preview Delta Result */}
                    {templatePreview && (
                      <div className="p-4 bg-slate-50 border border-slate-300 rounded space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-300 pb-2">
                          <span className="font-bold text-sm text-slate-900">
                            Kết quả kiểm tra trước: Mẫu {TEMPLATE_NAMES[templatePreview.templateKey]} (
                            {templatePreview.version})
                          </span>
                          <span
                            className={`px-2.5 py-0.5 rounded text-xs font-bold ${
                              templatePreview.eligibility.isEligible
                                ? 'bg-emerald-600 text-white'
                                : 'bg-rose-600 text-white'
                            }`}
                          >
                            {templatePreview.eligibility.isEligible ? 'Đủ điều kiện' : 'Không đủ điều kiện'}
                          </span>
                        </div>

                        {!templatePreview.eligibility.isEligible && (
                          <div className="p-2 bg-rose-100 border border-rose-300 rounded text-xs text-rose-900">
                            {templateCopy(templatePreview.eligibility.reason)}
                          </div>
                        )}

                        {templatePreview.requiredResources.details && (
                          <div className="text-xs text-slate-700">
                            <strong>Phạm vi tài nguyên:</strong> {templateCopy(templatePreview.requiredResources.details)}
                          </div>
                        )}

                        {/* Grants To Add */}
                        <div>
                          <div className="text-xs font-bold text-blue-900 uppercase tracking-wide mb-1">
                            Quyền sẽ được cấp mới ({templatePreview.grantsToAdd.length}):
                          </div>
                          {templatePreview.grantsToAdd.length === 0 ? (
                            <div className="text-xs text-slate-500 italic">Không có quyền mới cần cấp.</div>
                          ) : (
                            <div className="delta-list">
                              {templatePreview.grantsToAdd.map((g, idx) => (
                                <div key={idx} className="delta-item delta-item--missing">
                                  <div>
                                    <div className="delta-item__key">
                                      {capabilityKeyLabel(g.capabilityKey)} · {scopeTypeLabel(g.scopeType)}
                                      {g.scopeResourceId ? ` (${g.scopeResourceId})` : ''}
                                    </div>
                                    <div className="delta-item__desc">{g.capabilityKey === 'CAPABILITY_GRANT' ? 'Cấp và thu hồi quyền theo phạm vi.' : templateCopy(g.description)}</div>
                                  </div>
                                  <span className="delta-badge delta-badge--missing">Cần cấp</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Already Present */}
                        {templatePreview.alreadyPresent.length > 0 && (
                          <div>
                            <div className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                              Quyền đã có sẵn ({templatePreview.alreadyPresent.length}):
                            </div>
                            <div className="delta-list">
                              {templatePreview.alreadyPresent.map((g, idx) => (
                                <div key={idx} className="delta-item delta-item--covered">
                                  <div>
                                    <div className="delta-item__key">
                                      {capabilityKeyLabel(g.capabilityKey)} · {scopeTypeLabel(g.scopeType)}
                                    </div>
                                    <div className="delta-item__desc">{g.capabilityKey === 'CAPABILITY_GRANT' ? 'Cấp và thu hồi quyền theo phạm vi.' : templateCopy(g.description)}</div>
                                  </div>
                                  <span className="delta-badge delta-badge--covered">Đã có</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Conflicts */}
                        {templatePreview.conflicts.length > 0 && (
                          <div>
                            <div className="text-xs font-bold text-rose-800 uppercase tracking-wide mb-1">
                              Xung đột thời hạn / hiệu lực ({templatePreview.conflicts.length}):
                            </div>
                            <div className="delta-list">
                              {templatePreview.conflicts.map((c, idx) => (
                                <div key={idx} className="delta-item delta-item--conflict">
                                  <div>
                                    <div className="delta-item__key">
                                      {capabilityKeyLabel(c.capabilityKey)} · {scopeTypeLabel(c.scopeType)}
                                    </div>
                                    <div className="delta-item__desc text-rose-700">{c.reason}</div>
                                  </div>
                                  <span className="delta-badge delta-badge--conflict">{conflictStatusLabel(c.status)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Forbidden Defaults & Notes */}
                        {templatePreview.notes.length > 0 && (
                          <div className="text-xs text-slate-600 bg-white p-2.5 rounded border border-slate-200">
                            <strong>Ghi chú an toàn:</strong>
                            <ul className="list-disc pl-4 mt-1 space-y-0.5">
                              {templatePreview.notes.map((n, idx) => (
                                <li key={idx}>{templateCopy(n)}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Apply Result Feedback */}
                    {templateApplyResult && (
                      <div className={templateApplyResult.applied === false ? 'alert alert--warning' : 'p-3 bg-emerald-50 border border-emerald-300 rounded text-xs text-emerald-900 space-y-1.5'}>
                        <div className="font-bold text-sm flex items-center justify-between">
                          <span>
                            {templateApplyResult.applied === false ? 'Chưa áp dụng mẫu. Hãy kiểm tra quyền trước khi thử lại.' : 'Đã áp dụng thành công'} ({selectedTemplateDef?.name || TEMPLATE_NAMES[templateApplyResult.templateKey]} {templateApplyResult.version.startsWith('v') ? templateApplyResult.version : 'v' + templateApplyResult.version}):
                          </span>
                          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-200 text-emerald-950">
                            {templateApplyResult.applied !== false ? 'HOÀN THÀNH' : 'CHƯA HOÀN THÀNH'}
                          </span>
                        </div>
                        <div>
                          Số quyền đã cấp mới: <strong>{templateApplyResult.grantsAdded.length}</strong>
                        </div>
                        <div>
                          Số quyền đã có sẵn: <strong>{templateApplyResult.alreadyPresent.length}</strong>
                        </div>
                        {templateApplyResult.grantsAdded.length > 0 && (
                          <div className="pt-1 border-t border-emerald-200/80">
                            <div className="text-[11px] font-semibold text-emerald-950 mb-1">Chi tiết quyền cấp mới:</div>
                            <div className="delta-list">
                              {templateApplyResult.grantsAdded.map((g) => (
                                <div key={g.id || g.capabilityKey} className="delta-item delta-item--covered">
                                  <div>
                                    <div className="delta-item__key font-mono text-[11px]">
                                      {capabilityKeyLabel(g.capabilityKey)} · {scopeTypeLabel(g.scopeType)}
                                      {g.scopeResourceId ? ` (${g.scopeResourceId})` : ''}
                                    </div>
                                  </div>
                                  <span className="delta-badge delta-badge--covered">Đã cấp</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 2: PROFILE & LIFECYCLE */}
                {activeTab === 'profile' && (
                  <div className="p-4 space-y-4">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded">
                        <div className="text-xs text-slate-500 uppercase font-bold">Mã nhân sự</div>
                        <div className="technical-value font-bold text-base mt-1">
                          {selectedUser.profile?.staffCode || '—'}
                        </div>
                      </div>
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded">
                        <div className="text-xs text-slate-500 uppercase font-bold">Chức danh / Vị trí</div>
                        <div className="font-bold text-base mt-1">
                          {selectedUser.profile?.positionTitle || '—'}
                        </div>
                      </div>
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded">
                        <div className="text-xs text-slate-500 uppercase font-bold">Email</div>
                        <div className="mt-1">{selectedUser.profile?.email || '—'}</div>
                      </div>
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded">
                        <div className="text-xs text-slate-500 uppercase font-bold">Số điện thoại</div>
                        <div className="mt-1">{selectedUser.profile?.phone || '—'}</div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200">
                      <Button type="button" variant="primary" onClick={() => editUser(selectedUser)}>
                        ✏️ Chỉnh sửa hồ sơ
                      </Button>
                      {selectedUser.status === 'ACTIVE' && (
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => {
                            setSuccess('');
                            setConfirm({ id: selectedUser.id, action: 'disable' });
                          }}
                        >
                          Vô hiệu hóa tài khoản
                        </Button>
                      )}
                      {(selectedUser.status === 'DISABLED' || selectedUser.status === 'PENDING') && (
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => {
                            setSuccess('');
                            setConfirm({ id: selectedUser.id, action: 'activate' });
                          }}
                        >
                          Kích hoạt tài khoản
                        </Button>
                      )}
                      {canResetPasswords && selectedUser.status === 'ACTIVE' && selectedUser.id !== auth?.user.id && (
                        <Button type="button" variant="secondary" onClick={() => startReset(selectedUser)}>
                          🔑 Đặt lại mật khẩu
                        </Button>
                      )}
                    </div>
                  </div>
                )}

                {/* TAB 3: SAFE USER DELETION */}
                {activeTab === 'safe-delete' && canManageUsers && (
                  <div className="p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-bold text-sm text-slate-900 uppercase">
                          Kiểm tra điều kiện xóa tài khoản an toàn
                        </h3>
                        <p className="text-[11px] text-slate-500 m-0">
                          Kiểm tra lịch sử và dữ liệu liên quan trước khi xóa vĩnh viễn tài khoản
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="quiet"
                        style={{ minHeight: '44px', padding: '6px 12px' }}
                        onClick={() => void preflightQuery.refetch()}
                      >
                        🔄 Kiểm tra lại
                      </Button>
                    </div>

                    {preflightQuery.isPending ? (
                      <PageLoading />
                    ) : preflightQuery.isError ? (
                      <QueryFailure error={preflightQuery.error} retry={() => void preflightQuery.refetch()} />
                    ) : (
                      <div className="space-y-4">
                        {preflightQuery.data.eligibility === 'BLOCKED' ? (
                          <div className="p-4 bg-rose-50 border border-rose-300 rounded space-y-3">
                            <div className="flex items-center gap-2 text-rose-900 font-bold">
                              <span>⛔ Tài khoản không đủ điều kiện xóa vĩnh viễn</span>
                            </div>
                            <p className="text-xs text-rose-800">
                              Máy chủ phát hiện ràng buộc hoặc chưa thể xác minh đầy đủ điều kiện xóa.
                              Tài khoản được giữ lại. Hãy xem lý do bên dưới trước khi chọn cách xử lý.
                            </p>

                            <div className="space-y-1">
                              <span className="text-xs font-bold text-slate-700">Lý do chặn:</span>
                              <ul className="list-disc pl-5 text-xs text-rose-700 space-y-1">
                                {preflightQuery.data.blockers.map((b, idx) => (
                                  <li key={idx}>
                                    <span>{deleteBlockerLabel(b.code)}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>

                            {selectedUser.status === 'ACTIVE' && (
                              <div className="pt-2 border-t border-rose-200">
                                <Button
                                  type="button"
                                  variant="secondary"
                                  onClick={() => {
                                    setSuccess('');
                                    setConfirm({ id: selectedUser.id, action: 'disable' });
                                  }}
                                >
                                  Khuyến nghị: Vô hiệu hóa tài khoản thay vì xóa
                                </Button>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="p-4 bg-amber-50 border border-amber-300 rounded space-y-3">
                            <div className="flex items-center gap-2 text-amber-900 font-bold">
                              <span>⚠️ Đủ điều kiện xóa theo lần kiểm tra này</span>
                            </div>
                            <p className="text-xs text-amber-800">
                              Máy chủ chưa phát hiện ràng buộc ngăn xóa tại thời điểm kiểm tra. Điều kiện sẽ được kiểm tra lại khi xác nhận xóa.
                              Thao tác xóa sẽ làm sạch các bản ghi cấu hình ban đầu và xóa vĩnh viễn tài khoản.
                            </p>

                            {preflightQuery.data.cleanupCounts && (
                              <div className="text-xs text-slate-700 p-2.5 bg-white rounded border border-amber-200">
                                <strong>Dữ liệu liên kết sẽ được dọn dẹp an toàn:</strong>
                                <ul className="list-disc pl-5 mt-1 space-y-0.5">
                                  <li>Hồ sơ thông tin nhân sự: {preflightQuery.data.cleanupCounts.staffProfiles} bản ghi</li>
                                  <li>
                                    Thành viên tổ chuyên môn: {preflightQuery.data.cleanupCounts.subjectGroupMemberships} bản ghi
                                  </li>
                                  <li>Phân công môn giảng dạy: {preflightQuery.data.cleanupCounts.staffSubjects} bản ghi</li>
                                </ul>
                              </div>
                            )}

                            {!canDeletePhysically ? (
                              <div className="p-3 bg-slate-100 border border-slate-300 rounded text-xs text-slate-700">
                                🔒 <strong>Thẩm quyền không đủ:</strong> Thao tác xóa vĩnh viễn tài khoản yêu cầu đồng
                                thời cả quyền Quản lý người dùng và Quản trị kỹ thuật hệ thống.
                                Tài khoản hiện tại của bạn không đủ điều kiện để thực hiện
                                xóa.
                              </div>
                            ) : (
                              <div className="space-y-3 pt-2 border-t border-amber-300">
                                <div className="text-xs font-bold text-rose-900">
                                  Thao tác KHÔNG THỂ HOÀN TÁC. Để xác nhận, hãy nhập chính xác tên đăng nhập:
                                  <span className="font-mono bg-rose-100 text-rose-900 px-1.5 py-0.5 rounded ml-1">
                                    {selectedUser.username}
                                  </span>
                                </div>

                                <FormField
                                  name="confirm-username"
                                  label="Nhập tên đăng nhập để xác nhận"
                                  placeholder={selectedUser.username}
                                  value={deleteConfirmUsername}
                                  onChange={(e) => setDeleteConfirmUsername(e.target.value)}
                                  autoComplete="off"
                                />

                                {deleteError && (
                                  <div className="p-2.5 bg-rose-100 border border-rose-300 rounded text-xs text-rose-900">
                                    {deleteError}
                                  </div>
                                )}

                                <Button
                                  type="button"
                                  variant="danger"
                                  disabled={
                                    deleteConfirmUsername !== selectedUser.username || deleteMutation.isPending
                                  }
                                  loading={deleteMutation.isPending}
                                  onClick={() =>
                                    deleteMutation.mutate({
                                      id: selectedUser.id,
                                      confirmUsername: deleteConfirmUsername,
                                    })
                                  }
                                >
                                  🗑️ Xác nhận xóa vĩnh viễn tài khoản
                                </Button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* EMPTY RIGHT PANEL: GOOGLE ADMIN-STYLE GUIDED OVERVIEW */
            <div className="empty-workspace-guide">
              <div className="empty-workspace-guide__header">
                <span>Chưa chọn người dùng</span>
                <span className="text-[11px] bg-blue-800 text-blue-100 px-2 py-0.5 rounded font-semibold">Sẵn sàng</span>
              </div>
              <div className="empty-workspace-guide__body">
                <div className="space-y-1 mb-4">
                  <h3 className="font-bold text-base text-slate-900 m-0">Trung tâm Phân quyền & Quản trị Nhân sự</h3>
                  <p className="text-xs text-slate-600 m-0 leading-relaxed">
                    Hệ thống hỗ trợ gán quyền tự động theo Mẫu phân quyền theo nhiệm vụ được phê duyệt, kiểm tra quyền trước khi áp dụng và đối soát chuẩn chuyên môn toàn trường.
                  </p>
                </div>

                <div className="empty-workspace-guide__grid">
                  <div className="empty-guide-card empty-guide-card--blue">
                    <h4>👤 1. Chọn tài khoản</h4>
                    <p>Nhấp vào bất kỳ tài khoản nào trong danh sách bên trái để mở hồ sơ nhân sự, trạng thái tài khoản và bảng phân quyền.</p>
                  </div>
                  <div className="empty-guide-card empty-guide-card--indigo">
                    <h4>🏷️ 2. Mẫu phân quyền theo nhiệm vụ</h4>
                    <p>Áp dụng các mẫu chuẩn hóa (Giáo viên, Tổ trưởng...) với cơ chế kiểm tra quyền trước khi áp dụng để đối chiếu phạm vi và điều kiện trước khi cấp quyền.</p>
                  </div>
                  <div className="empty-guide-card empty-guide-card--teal">
                    <h4>⚖️ 3. Đối soát toàn trường</h4>
                    <p>Sử dụng nút "Đối soát chuẩn chuyên môn" phía trên để rà soát tự động 100% giáo viên giảng dạy đủ điều kiện.</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-slate-200">
                  <Button
                    type="button"
                    variant="primary"
                    onClick={() => {
                      setDraft({ ...emptyDraft });
                    }}
                  >
                    ➕ Thêm tài khoản mới
                  </Button>
                  <span className="text-xs text-slate-500 font-medium">
                    Hoặc nhấp vào một dòng trong danh sách bên trái để bắt đầu thao tác.
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function statusLabel(status: UserManagementRecord['status']) {
  if (!['PENDING', 'LOCKED', 'DISABLED', 'ACTIVE'].includes(status)) return 'Chưa xác định trạng thái tài khoản';
  return {
    PENDING: 'Chờ kích hoạt',
    LOCKED: 'Đang khóa',
    DISABLED: 'Đã vô hiệu hóa',
    ACTIVE: 'Đang hoạt động',
  }[status];
}

function actionLabel(action: 'activate' | 'disable' | 'unlock') {
  return {
    activate: 'Kích hoạt',
    disable: 'Vô hiệu hóa',
    unlock: 'Mở khóa',
  }[action];
}
