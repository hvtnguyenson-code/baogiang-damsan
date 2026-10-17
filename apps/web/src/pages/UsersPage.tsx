import type {
  BaselineReconciliationApplyResponse,
  BaselineReconciliationConflictUser,
  BaselineReconciliationMissingUser,
  BaselineReconciliationPreviewResponse,
  CatalogListResponse,
  ResponsibilityTemplateApplyResponse,
  ResponsibilityTemplateKey,
  ResponsibilityTemplatePreviewResponse,
  UserDeletePreflightResponse,
  UserManagementRecord,
} from '@baogiang/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, type FormEvent } from 'react';
import { useAuth } from '../auth/auth-context';
import { Button } from '../components/ui/button';
import { FormField } from '../components/ui/form-field';
import {
  DataTable,
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
import { hasSchoolCapability } from '../lib/capabilities';
import { ApiError, apiFetch } from '../lib/api-client';

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

  // Responsibility template state
  const [selectedTemplateKey, setSelectedTemplateKey] = useState<ResponsibilityTemplateKey>('TEACHER');
  const [subjectGroupId, setSubjectGroupId] = useState('');
  const [subjectIds, setSubjectIds] = useState<string[]>([]);
  const [programmeMasterId, setProgrammeMasterId] = useState('');
  const [templatePreview, setTemplatePreview] = useState<ResponsibilityTemplatePreviewResponse | null>(null);
  const [templatePreviewError, setTemplatePreviewError] = useState('');
  const [templateApplyResult, setTemplateApplyResult] = useState<ResponsibilityTemplateApplyResponse | null>(null);

  // Safe delete state
  const [deleteConfirmUsername, setDeleteConfirmUsername] = useState('');
  const [deleteError, setDeleteError] = useState('');

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

  // Programme master lookup attempt for coordinators
  const isCoordinatorTemplate =
    selectedTemplateKey === 'GDDP_COORDINATOR' || selectedTemplateKey === 'HDTN_COORDINATOR';
  const programmeKind = selectedTemplateKey === 'GDDP_COORDINATOR' ? 'GDDP' : 'HDTN_HN';

  const programmeMastersQuery = useQuery<{ id: string; code?: string; name?: string; kind: string }[]>({
    queryKey: ['programme-masters', programmeKind],
    queryFn: async () => {
      try {
        const res = await apiFetch<Array<{ id: string; code?: string; name?: string; kind: string }>>(
          `/programme-planning/masters?kind=${programmeKind}`,
          { notifyUnauthorized: false },
        );
        return Array.isArray(res) ? res : [];
      } catch {
        return [];
      }
    },
    enabled: isCoordinatorTemplate,
    retry: false,
  });

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

  // Template Preview Mutation
  const templatePreviewMutation = useMutation({
    mutationFn: async () => {
      if (!selectedUserId) return null;
      setTemplatePreviewError('');
      const resources = {
        ...(subjectGroupId ? { subjectGroupId } : {}),
        ...(subjectIds.length > 0 ? { subjectIds } : {}),
        ...(programmeMasterId ? { programmeMasterId } : {}),
      };
      return responsibilityTemplatesApi.preview(selectedUserId, {
        templateKey: selectedTemplateKey,
        resources: Object.keys(resources).length > 0 ? resources : undefined,
        subjectGroupId: subjectGroupId || undefined,
        subjectIds: subjectIds.length > 0 ? subjectIds : undefined,
        programmeMasterId: programmeMasterId || undefined,
      });
    },
    onSuccess: (data) => {
      setTemplatePreview(data);
      setTemplateApplyResult(null);
    },
    onError: (err) => {
      setTemplatePreview(null);
      if (err instanceof ApiError) {
        setTemplatePreviewError(err.message || 'Lỗi kiểm tra trước quyền.');
      } else {
        setTemplatePreviewError('Không thể hoàn tất kiểm tra trước.');
      }
    },
  });

  // Template Apply Mutation
  const templateApplyMutation = useMutation({
    mutationFn: async () => {
      if (!selectedUserId) return null;
      const resources = {
        ...(subjectGroupId ? { subjectGroupId } : {}),
        ...(subjectIds.length > 0 ? { subjectIds } : {}),
        ...(programmeMasterId ? { programmeMasterId } : {}),
      };
      return responsibilityTemplatesApi.apply(selectedUserId, {
        templateKey: selectedTemplateKey,
        resources: Object.keys(resources).length > 0 ? resources : undefined,
        subjectGroupId: subjectGroupId || undefined,
        subjectIds: subjectIds.length > 0 ? subjectIds : undefined,
        programmeMasterId: programmeMasterId || undefined,
      });
    },
    onSuccess: async (data) => {
      if (data) {
        setTemplateApplyResult(data);
        setSuccess(
          `Đã áp dụng Mẫu trách nhiệm (${TEMPLATE_NAMES[data.templateKey]}): đã cấp mới ${data.grantsAdded.length} quyền.`,
        );
        setTemplatePreview(null);
        await queryClient.invalidateQueries({ queryKey: ['users'] });
        await queryClient.invalidateQueries({ queryKey: ['delete-preflight', selectedUserId] });
      }
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
        setDeleteError(err.message || 'Lỗi khi xóa tài khoản.');
      } else {
        setDeleteError('Không thể thực hiện xóa do lỗi kết nối.');
      }
    },
  });

  // Handlers
  function handleSelectUser(user: UserManagementRecord) {
    setSuccess('');
    setDraft(null);
    setSelectedUserId(user.id);
    setTemplatePreview(null);
    setTemplateApplyResult(null);
    setTemplatePreviewError('');
    setDeleteError('');
    setDeleteConfirmUsername('');
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

  // Check if coordinator selector is missing
  const coordinatorSelectorMissing =
    isCoordinatorTemplate && (!programmeMastersQuery.data || programmeMastersQuery.data.length === 0);

  return (
    <div className="management-page staff-register">
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
              }}
            >
              Tạo người dùng
            </Button>
          </div>
        }
      >
        Quản trị tài khoản, phân quyền theo Mẫu trách nhiệm và đối soát chuẩn chuyên môn toàn trường.
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

      {/* TOP: BASELINE RECONCILIATION SECTION (COLLAPSIBLE) */}
      {showReconciliation && canGrant && (
        <div className="form-card" style={{ borderColor: '#0f766e', borderWidth: '2px', marginBottom: '24px' }}>
          <div className="form-card-header form-card-header--teal">
            <span>Đối soát chuẩn tiếp cận chuyên môn (Baseline Reconciliation)</span>
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
                  Hệ thống đối soát tự động toàn bộ tài khoản hoạt động với chuẩn quyền cơ sở của nhân sự giảng dạy (
                  <code>TEACHER_BASE</code>).
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
                    <div className="stat-card__number" style={{ color: '#b45309' }}>
                      {reconciliationPreviewQuery.data.missing.length}
                    </div>
                    <div className="stat-card__label">Cần bổ sung</div>
                  </div>
                  <div className="stat-card stat-card--danger">
                    <div className="stat-card__number" style={{ color: '#be123c' }}>
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
                                <span className="delta-badge delta-badge--conflict">{c.statusConflict}</span>
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
                      : 'Đã chuẩn hóa toàn bộ (Không có tài khoản thiếu)'}
                  </Button>
                  {reconciliationPreviewQuery.data.missing.length === 0 && (
                    <span className="text-xs text-slate-600 font-semibold">
                      ✅ 100% nhân sự giảng dạy đủ điều kiện đã có quyền cơ sở TEACHER_BASE.
                    </span>
                  )}
                </div>

                {/* Apply Results */}
                {reconciliationApplyResult && (
                  <div className="mt-4 p-3 bg-emerald-50 border border-emerald-300 rounded text-xs text-emerald-900 space-y-1">
                    <div className="font-bold text-sm">Kết quả đối soát vừa thực hiện:</div>
                    <div>Số tài khoản đã xử lý: {reconciliationApplyResult.processedCount}</div>
                    <div>Số quyền TEACHER_BASE được cấp mới: {reconciliationApplyResult.grantsCreated}</div>
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
      <div className="admin-workspace">
        {/* LEFT COLUMN: DIRECTORY & LIFECYCLE */}
        <div className="admin-workspace__sidebar">
          <div className="form-card" style={{ borderColor: '#1e3a8a', borderWidth: '2px' }}>
            <div className="form-card-header form-card-header--blue">
              <span>1. Danh sách người dùng ({query.data?.total ?? 0})</span>
              {selectedUser && (
                <span className="text-[11px] bg-blue-700 text-white px-2 py-0.5 rounded font-bold">
                  Đang chọn: {selectedUser.username}
                </span>
              )}
            </div>

            <div className="p-3 bg-slate-100 border-b border-slate-300 space-y-2">
              <input
                type="text"
                placeholder="🔍 Tìm theo tên, tài khoản, mã..."
                aria-label="Tìm kiếm người dùng"
                className="form-field__input"
                style={{ minHeight: '38px', fontSize: '14px', background: '#fff' }}
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
              />
              <div className="flex items-center justify-between gap-2">
                <select
                  aria-label="Lọc theo trạng thái"
                  className="form-field__input"
                  style={{ minHeight: '36px', fontSize: '13px', background: '#fff' }}
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="ALL">Tất cả trạng thái</option>
                  <option value="ACTIVE">Đang hoạt động</option>
                  <option value="PENDING">Chờ kích hoạt</option>
                  <option value="DISABLED">Đã vô hiệu hóa</option>
                  <option value="LOCKED">Đang khóa</option>
                </select>
                <span className="text-xs text-slate-600 font-semibold whitespace-nowrap">
                  {filteredUsers.length} hiển thị
                </span>
              </div>
            </div>

            {query.isPending ? (
              <PageLoading />
            ) : query.isError ? (
              <QueryFailure error={query.error} retry={() => void query.refetch()} />
            ) : filteredUsers.length === 0 ? (
              <div className="p-6 text-center text-sm text-slate-600">
                Không tìm thấy tài khoản phù hợp với điều kiện lọc.
              </div>
            ) : (
              <>
                <DataTable
                  label="Danh sách người dùng"
                  headings={['Họ tên / tài khoản', 'Mã nhân sự', 'Trạng thái', 'Chức danh', 'Giảng dạy', 'Thao tác']}
                >
                  {filteredUsers.map((user) => {
                    const isSelected = user.id === selectedUserId;
                    return (
                      <tr
                        key={user.id}
                        className={isSelected ? 'row-selected' : ''}
                        style={isSelected ? { backgroundColor: '#eff6ff', cursor: 'pointer' } : { cursor: 'pointer' }}
                        onClick={() => handleSelectUser(user)}
                      >
                        <td>
                          <button
                            type="button"
                            className="text-left font-bold block"
                            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', color: 'inherit' }}
                            onClick={() => handleSelectUser(user)}
                          >
                            <strong>{user.profile?.displayName ?? 'Chưa có tên hiển thị'}</strong>
                          </button>
                          <small className="technical-value table-secondary">{user.username}</small>
                        </td>
                        <td className="technical-value">{user.profile?.staffCode ?? '—'}</td>
                        <td>
                          <StatusText
                            active={user.status === 'ACTIVE'}
                            activeLabel="Đang hoạt động"
                            inactiveLabel={statusLabel(user.status)}
                          />
                        </td>
                        <td>{user.profile?.positionTitle ?? '—'}</td>
                        <td>{user.profile?.isTeachingStaff ? 'Có' : 'Không'}</td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <div className="row-actions">
                            <Button
                              type="button"
                              variant={isSelected ? 'primary' : 'quiet'}
                              onClick={() => handleSelectUser(user)}
                            >
                              {isSelected ? 'Đang chọn' : `Chọn ${user.username}`}
                            </Button>
                            <Button
                              type="button"
                              variant={isSelected ? 'primary' : 'quiet'}
                              onClick={() => {
                                handleSelectUser(user);
                                editUser(user);
                              }}
                            >
                              Sửa {user.username}
                            </Button>

                            {confirm?.id === user.id ? (
                              <div className="flex items-center gap-1">
                                <span className="text-xs">
                                  Xác nhận {actionLabel(confirm.action).toLowerCase()}?
                                </span>
                                <Button
                                  type="button"
                                  variant="secondary"
                                  loading={actionMutation.isPending}
                                  onClick={() => actionMutation.mutate(confirm)}
                                >
                                  Xác nhận
                                </Button>
                                <Button type="button" variant="quiet" onClick={() => setConfirm(undefined)}>
                                  Hủy
                                </Button>
                              </div>
                            ) : (
                              <>
                                {user.status === 'ACTIVE' && (
                                  <Button
                                    type="button"
                                    variant="quiet"
                                    onClick={() => {
                                      setSuccess('');
                                      setConfirm({ id: user.id, action: 'disable' });
                                    }}
                                  >
                                    Vô hiệu hóa
                                  </Button>
                                )}
                                {(user.status === 'DISABLED' || user.status === 'PENDING') && (
                                  <Button
                                    type="button"
                                    variant="quiet"
                                    onClick={() => {
                                      setSuccess('');
                                      setConfirm({ id: user.id, action: 'activate' });
                                    }}
                                  >
                                    Kích hoạt
                                  </Button>
                                )}
                                {user.status === 'LOCKED' && (
                                  <Button
                                    type="button"
                                    variant="quiet"
                                    onClick={() => {
                                      setSuccess('');
                                      setConfirm({ id: user.id, action: 'unlock' });
                                    }}
                                  >
                                    Mở khóa
                                  </Button>
                                )}
                                {canResetPasswords && user.status === 'ACTIVE' && user.id !== auth?.user.id && (
                                  <Button type="button" variant="quiet" onClick={() => startReset(user)}>
                                    Đặt lại mật khẩu
                                  </Button>
                                )}
                              </>
                            )}
                          </div>

                          {/* Inline Password Reset Form matching test selectors */}
                          {resetDraft?.id === user.id && (
                            <form className="row-confirm mt-2 p-3 bg-white border border-slate-300 rounded" onSubmit={submitReset}>
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
                </DataTable>
                <Pagination
                  page={query.data.page}
                  pageSize={query.data.pageSize}
                  total={query.data.total}
                  onPage={setPage}
                />
              </>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: WORKSPACE / CREATION / TEMPLATES / DELETE */}
        <div className="admin-workspace__main">
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
                <div className="form-card-header form-card-header--blue">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm">
                      👤 {selectedUser.profile?.displayName ?? selectedUser.username}
                    </span>
                    <span className="technical-value text-xs bg-slate-800 text-sky-300 px-2 py-0.5 rounded">
                      @{selectedUser.username}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusText
                      active={selectedUser.status === 'ACTIVE'}
                      activeLabel="Đang hoạt động"
                      inactiveLabel={statusLabel(selectedUser.status)}
                    />
                    <span
                      className={`text-xs px-2 py-0.5 rounded font-bold ${
                        selectedUser.profile?.isTeachingStaff
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-600 text-slate-100'
                      }`}
                    >
                      {selectedUser.profile?.isTeachingStaff ? 'Nhân sự giảng dạy' : 'Nhân sự văn phòng / khác'}
                    </span>
                  </div>
                </div>

                {/* Workspace Navigation Tabs */}
                <div className="workspace-tabs">
                  <button
                    type="button"
                    className={`workspace-tab-btn ${
                      activeTab === 'templates' ? 'workspace-tab-btn--active' : ''
                    }`}
                    onClick={() => setActiveTab('templates')}
                  >
                    🏷️ Mẫu trách nhiệm (Templates)
                  </button>
                  <button
                    type="button"
                    className={`workspace-tab-btn ${
                      activeTab === 'profile' ? 'workspace-tab-btn--active' : ''
                    }`}
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
                          : ''
                      }`}
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
                      Gán quyền tự động theo <strong>Mẫu trách nhiệm được phê duyệt</strong>. Hệ thống sẽ kiểm tra
                      tính hợp lệ, xung đột và thời hạn trước khi áp dụng.
                    </div>

                    {/* Template Selection */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="form-field__label" htmlFor="template-select">
                          Chọn Mẫu trách nhiệm:
                        </label>
                        <select
                          id="template-select"
                          className="form-field__input font-bold"
                          value={selectedTemplateKey}
                          onChange={(e) => {
                            setSelectedTemplateKey(e.target.value as ResponsibilityTemplateKey);
                            setTemplatePreview(null);
                            setTemplateApplyResult(null);
                            setTemplatePreviewError('');
                          }}
                        >
                          <option value="TEACHER">Giáo viên (TEACHER)</option>
                          <option value="SUBJECT_LEADER">Tổ trưởng chuyên môn (SUBJECT_LEADER)</option>
                          <option value="VICE_PRINCIPAL_ACADEMIC">Phó Hiệu trưởng (VICE_PRINCIPAL_ACADEMIC)</option>
                          <option value="PRINCIPAL">Hiệu trưởng (PRINCIPAL)</option>
                          <option value="GDDP_COORDINATOR">Điều phối Giáo dục địa phương (GDDP_COORDINATOR)</option>
                          <option value="HDTN_COORDINATOR">Điều phối HĐTN-HN (HDTN_COORDINATOR)</option>
                          <option value="TECHNICAL_ACCOUNT_ADMIN">
                            Quản trị tài khoản & kỹ thuật (TECHNICAL_ACCOUNT_ADMIN)
                          </option>
                        </select>
                      </div>

                      {/* Subject Leader Resources */}
                      {selectedTemplateKey === 'SUBJECT_LEADER' && (
                        <div className="space-y-3 md:col-span-2 p-3 bg-indigo-50 border border-indigo-200 rounded">
                          <div>
                            <label className="form-field__label" htmlFor="subject-group-select">
                              Tổ chuyên môn phụ trách (Bắt buộc):
                            </label>
                            <select
                              id="subject-group-select"
                              className="form-field__input"
                              value={subjectGroupId}
                              onChange={(e) => setSubjectGroupId(e.target.value)}
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
                        <div className="md:col-span-2 p-3 bg-amber-50 border border-amber-300 rounded space-y-2">
                          <label className="form-field__label" htmlFor="programme-master-select">
                            Chương trình {programmeKind === 'GDDP' ? 'GDĐP' : 'HĐTN-HN'} chỉ định:
                          </label>
                          {coordinatorSelectorMissing ? (
                            <div className="p-3 bg-amber-100 border border-amber-400 rounded text-xs text-amber-900">
                              ⚠️ <strong>Chưa có danh mục chương trình khả dụng:</strong> Tài khoản quản trị hiện tại
                              không có thẩm quyền tra cứu danh mục chương trình (ProgrammeMaster). Theo quy định an toàn
                              hệ thống, quy trình gán template điều phối này tạm thời bị khóa cho đến khi có endpoint tra
                              cứu phù hợp. Nút áp dụng bị khóa.
                            </div>
                          ) : (
                            <select
                              id="programme-master-select"
                              className="form-field__input"
                              value={programmeMasterId}
                              onChange={(e) => setProgrammeMasterId(e.target.value)}
                            >
                              <option value="">-- Chọn chương trình --</option>
                              {programmeMastersQuery.data?.map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.name || m.code || m.id} ({m.kind})
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Preview Button */}
                    <div className="flex flex-wrap items-center gap-3 pt-2">
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={coordinatorSelectorMissing || templatePreviewMutation.isPending}
                        loading={templatePreviewMutation.isPending}
                        onClick={() => templatePreviewMutation.mutate()}
                      >
                        👁️ Xem trước thay đổi quyền (Preview)
                      </Button>

                      {templatePreview && canGrant && (
                        <Button
                          type="button"
                          variant="primary"
                          disabled={
                            !templatePreview.eligibility.isEligible ||
                            !templatePreview.requiredResources.provided ||
                            templatePreview.conflicts.length > 0 ||
                            coordinatorSelectorMissing ||
                            templateApplyMutation.isPending
                          }
                          loading={templateApplyMutation.isPending}
                          onClick={() => templateApplyMutation.mutate()}
                        >
                          ✅ Áp dụng Mẫu trách nhiệm ({TEMPLATE_NAMES[selectedTemplateKey]})
                        </Button>
                      )}
                    </div>

                    {templatePreviewError && (
                      <div className="p-3 bg-rose-50 border border-rose-300 rounded text-xs text-rose-800">
                        {templatePreviewError}
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
                            {templatePreview.eligibility.reason}
                          </div>
                        )}

                        {templatePreview.requiredResources.details && (
                          <div className="text-xs text-slate-700">
                            <strong>Phạm vi tài nguyên:</strong> {templatePreview.requiredResources.details}
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
                                      {g.capabilityKey} · {g.scopeType}
                                      {g.scopeResourceId ? ` (${g.scopeResourceId})` : ''}
                                    </div>
                                    <div className="delta-item__desc">{g.description}</div>
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
                                      {g.capabilityKey} · {g.scopeType}
                                    </div>
                                    <div className="delta-item__desc">{g.description}</div>
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
                                      {c.capabilityKey} · {c.scopeType}
                                    </div>
                                    <div className="delta-item__desc text-rose-700">{c.reason}</div>
                                  </div>
                                  <span className="delta-badge delta-badge--conflict">{c.status}</span>
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
                                <li key={idx}>{n}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Apply Result Feedback */}
                    {templateApplyResult && (
                      <div className="p-3 bg-emerald-50 border border-emerald-300 rounded text-xs text-emerald-900 space-y-1">
                        <div className="font-bold text-sm">
                          ✅ Đã áp dụng thành công ({TEMPLATE_NAMES[templateApplyResult.templateKey]} v{templateApplyResult.version}):
                        </div>
                        <div>Số quyền đã cấp mới: {templateApplyResult.grantsAdded.length}</div>
                        {templateApplyResult.alreadyPresent.length > 0 && (
                          <div>Số quyền đã có sẵn: {templateApplyResult.alreadyPresent.length}</div>
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
                      <h3 className="font-bold text-sm text-slate-900 uppercase">
                        Kiểm tra điều kiện xóa sạch tài khoản (Clean-slate Delete Preflight)
                      </h3>
                      <Button
                        type="button"
                        variant="quiet"
                        style={{ minHeight: '32px', padding: '2px 8px' }}
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
                              <span>⛔ TÀI KHOẢN KHÔNG ĐỦ ĐIỀU KIỆN XÓA VẬT LÝ</span>
                            </div>
                            <p className="text-xs text-rose-800">
                              Tài khoản đã phát sinh dữ liệu nghiệp vụ hoặc lịch sử đăng nhập/kiểm toán trong hệ thống.
                              Theo quy tắc an toàn dữ liệu, tài khoản này được bảo lưu để phục vụ kiểm toán và không thể
                              bị xóa vật lý.
                            </p>

                            <div className="space-y-1">
                              <span className="text-xs font-bold text-slate-700">Lý do chặn:</span>
                              <ul className="list-disc pl-5 text-xs text-rose-700 space-y-1">
                                {preflightQuery.data.blockers.map((b, idx) => (
                                  <li key={idx}>
                                    <strong>[{b.code}]</strong>: {b.reason}
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
                              <span>⚠️ TÀI KHOẢN SẠCH — ĐỦ ĐIỀU KIỆN XÓA (CLEAN-SLATE)</span>
                            </div>
                            <p className="text-xs text-amber-800">
                              Tài khoản này chưa phát sinh lịch sử đăng nhập, phân công hay hoạt động nghiệp vụ nào.
                              Thao tác xóa sẽ làm sạch các bản ghi cấu hình ban đầu và xóa vĩnh viễn tài khoản.
                            </p>

                            {preflightQuery.data.cleanupCounts && (
                              <div className="text-xs text-slate-700 p-2.5 bg-white rounded border border-amber-200">
                                <strong>Dữ liệu liên kết sẽ được dọn dẹp an toàn:</strong>
                                <ul className="list-disc pl-5 mt-1 space-y-0.5">
                                  <li>Hồ sơ nhân sự (StaffProfile): {preflightQuery.data.cleanupCounts.staffProfiles}</li>
                                  <li>
                                    Thành viên tổ chuyên môn: {preflightQuery.data.cleanupCounts.subjectGroupMemberships}
                                  </li>
                                  <li>Phân công môn giảng dạy: {preflightQuery.data.cleanupCounts.staffSubjects}</li>
                                </ul>
                              </div>
                            )}

                            {!canDeletePhysically ? (
                              <div className="p-3 bg-slate-100 border border-slate-300 rounded text-xs text-slate-700">
                                🔒 <strong>Thẩm quyền không đủ:</strong> Thao tác xóa vĩnh viễn tài khoản yêu cầu đồng
                                thời cả quyền Quản lý người dùng (<code>USER_MANAGE</code>) và Quản trị hệ thống (
                                <code>SYSTEM_ADMIN</code>). Tài khoản hiện tại của bạn không đủ điều kiện để thực hiện
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
            /* EMPTY RIGHT PANEL */
            <div className="form-card p-12 text-center space-y-3">
              <div className="text-4xl">👥</div>
              <h3 className="font-bold text-base text-slate-800">Chưa chọn người dùng</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Hãy chọn một tài khoản từ danh sách bên trái để xem chi tiết hồ sơ, gán Mẫu trách nhiệm hoặc kiểm tra
                điều kiện xóa an toàn.
              </p>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setDraft({ ...emptyDraft });
                }}
              >
                ➕ Thêm tài khoản mới
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function statusLabel(status: UserManagementRecord['status']) {
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
