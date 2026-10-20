import type {
  AcademicWeekday,
  TimeSlotDefinitionRecord,
  TimeSlotSession,
  TimetableActivationResult,
  TimetableImportNativeSessionMode,
  TimetableImportProfileRecord,
  TimetableImportWorkbookConfirmResponse,
  TimetableImportWorkbookInspectionResponse,
  TimetableImportWorkbookPreviewResponse,
  TimetableReadinessResponse,
  TimetableValidationReport,
  TimetableVersionRecord,
  TimetableVersionStatus,
} from '@baogiang/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../components/ui/button';
import { InlineAlert } from '../components/ui/feedback';
import { FormField } from '../components/ui/form-field';
import {
  DataTable,
  EmptyState,
  FormSection,
  MutationNotice,
  PageHeader,
  PageLoading,
  Pagination,
  QueryFailure,
  SelectField,
  StatusText,
  TextareaField,
} from '../components/ui/management';
import { academicYearsApi, calendarVersionsApi, formatCivilDate } from '../lib/academic-structure-api';
import { ApiError } from '../lib/api-client';
import { formatDateTime } from '../lib/display';
import {
  timeSlotsApi,
  timetableImportApi,
  timetableVersionsApi,
  type CreateTimeSlotInput,
  type ReviseTimeSlotInput,
} from '../lib/timetable-api';

type Tab = 'versions' | 'import' | 'time-slots';

const WEEKDAYS: { value: AcademicWeekday; label: string }[] = [
  { value: 'MONDAY', label: 'Thứ Hai' },
  { value: 'TUESDAY', label: 'Thứ Ba' },
  { value: 'WEDNESDAY', label: 'Thứ Tư' },
  { value: 'THURSDAY', label: 'Thứ Năm' },
  { value: 'FRIDAY', label: 'Thứ Sáu' },
  { value: 'SATURDAY', label: 'Thứ Bảy' },
  { value: 'SUNDAY', label: 'Chủ Nhật' },
];

const SESSIONS: { value: TimeSlotSession; label: string }[] = [
  { value: 'MORNING', label: 'Sáng' },
  { value: 'AFTERNOON', label: 'Chiều' },
  { value: 'EVENING', label: 'Tối' },
];

const VERSION_STATUS_LABELS: Record<TimetableVersionStatus, { label: string; tone: string }> = {
  DRAFT: { label: 'Bản nháp', tone: 'inactive' },
  VALIDATED: { label: 'Đã kiểm tra hợp lệ', tone: 'blue' },
  APPROVED: { label: 'Đã phê duyệt', tone: 'teal' },
  ACTIVE: { label: 'Đang áp dụng', tone: 'active' },
  SUPERSEDED: { label: 'Đã thay thế', tone: 'inactive' },
};

const READINESS_DIMENSION_LABELS: Record<string, string> = {
  NORMAL_BASE_TIMETABLE_FOUNDATION: 'Nền tảng TKB chính khóa',
  PPCT_ASSOCIATION_BINDING: 'Ràng buộc phân phối chương trình',
  PPCT_CAPACITY: 'Dung lượng và định mức PPCT',
  OPERATIONAL_OVERLAYS: 'Lớp phủ vận hành điều hành',
  SUBSTITUTION_CANCELLATION_MAKEUP: 'Dạy thay, hủy tiết, dạy bù',
  LOCAL_OPERATIONAL_EXCEPTIONS: 'Ngoại lệ lịch học cục bộ',
  SPECIAL_ACTIVITY_COLLISIONS: 'Va chạm hoạt động đặc thù',
  RESOLVED_OCCURRENCE_EXECUTION: 'Thực hiện tiết dạy ghi nhận',
  PROGRESS_DEBT_REPORTING: 'Tiến độ và nợ tiết báo cáo',
};

function errorText(error: unknown): string {
  if (error instanceof ApiError) {
    return error.serverError ? `${error.serverError}: ${error.message}` : error.message;
  }
  return error instanceof Error ? error.message : 'Yêu cầu không thực hiện được.';
}

export function TimetableAdminPage() {
  const [activeTab, setActiveTab] = useState<Tab>('versions');
  const [selectedYearId, setSelectedYearId] = useState<string>('');

  // 1. Load Academic Years
  const yearsQuery = useQuery({
    queryKey: ['academic-years-for-timetable'],
    queryFn: () => academicYearsApi.list({ page: 1, pageSize: 50 }),
  });

  const academicYears = yearsQuery.data?.items ?? [];
  const currentYearId = selectedYearId || (academicYears.length > 0 ? academicYears[0].id : '');

  // 2. Load Profiles for import
  const profilesQuery = useQuery({
    queryKey: ['timetable-import-profiles'],
    queryFn: () => timetableImportApi.listProfiles(),
  });

  return (
    <div className="management-page timetable-admin-page">
      <PageHeader
        eyebrow="Sổ dữ liệu năm học"
        title="Thời khóa biểu & Khung tiết"
      >
        Quản trị định nghĩa khung tiết học, nạp tệp thời khóa biểu chuẩn Đam San và điều hành vòng đời các phiên bản TKB toàn trường.
      </PageHeader>

      {/* Academic Year Selection Bar */}
      <section className="academic-workspace__header" aria-labelledby="year-selector-heading">
        <div className="section-heading">
          <div>
            <p className="utility-label">Niên khóa làm việc</p>
            <h2 id="year-selector-heading">
              {academicYears.find((y) => y.id === currentYearId)?.name ?? 'Chọn năm học'}
            </h2>
          </div>
          {academicYears.length > 0 && (
            <div style={{ minWidth: '220px' }}>
              <SelectField
                id="academic-year-select"
                label="Chuyển năm học"
                value={currentYearId}
                onChange={(e) => setSelectedYearId(e.target.value)}
              >
                {academicYears.map((year) => (
                  <option key={year.id} value={year.id}>
                    {year.name} ({year.code})
                  </option>
                ))}
              </SelectField>
            </div>
          )}
        </div>
      </section>

      {yearsQuery.isPending ? (
        <PageLoading />
      ) : yearsQuery.isError ? (
        <QueryFailure error={yearsQuery.error} retry={() => void yearsQuery.refetch()} />
      ) : academicYears.length === 0 ? (
        <EmptyState
          title="Chưa có năm học nào"
          message="Vui lòng tạo năm học trong Cấu trúc năm học trước khi quản trị thời khóa biểu."
        />
      ) : (
        <>
          {/* Secondary Navigation Tabs */}
          <nav className="secondary-nav" aria-label="Phân hệ quản trị thời khóa biểu">
            <button
              type="button"
              className={activeTab === 'versions' ? 'active' : ''}
              onClick={() => setActiveTab('versions')}
              aria-current={activeTab === 'versions' ? 'page' : undefined}
            >
              Phiên bản TKB
            </button>
            <button
              type="button"
              className={activeTab === 'import' ? 'active' : ''}
              onClick={() => setActiveTab('import')}
              aria-current={activeTab === 'import' ? 'page' : undefined}
            >
              Nhập TKB Đam San
            </button>
            <button
              type="button"
              className={activeTab === 'time-slots' ? 'active' : ''}
              onClick={() => setActiveTab('time-slots')}
              aria-current={activeTab === 'time-slots' ? 'page' : undefined}
            >
              Khung tiết học
            </button>
          </nav>

          {activeTab === 'versions' && (
            <TimetableVersionsTab
              key={`versions-${currentYearId}`}
              academicYearId={currentYearId}
              onNavigateToImport={() => setActiveTab('import')}
            />
          )}

          {activeTab === 'import' && (
            <TimetableImportTab
              key={`import-${currentYearId}`}
              academicYearId={currentYearId}
              profiles={profilesQuery.data?.items ?? []}
              onImportSuccess={(_createdVersion) => {
                setActiveTab('versions');
              }}
            />
          )}

          {activeTab === 'time-slots' && (
            <TimeSlotsTab
              key={`time-slots-${currentYearId}`}
              academicYearId={currentYearId}
            />
          )}
        </>
      )}
    </div>
  );
}

// =========================================================================
// TAB 1: PHIÊN BẢN TKB (TIMETABLE VERSIONS & LIFECYCLE)
// =========================================================================

function TimetableVersionsTab({
  academicYearId,
  onNavigateToImport,
}: {
  academicYearId: string;
  onNavigateToImport(): void;
}) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<TimetableVersionStatus | ''>('');
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createNote, setCreateNote] = useState('');
  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // List versions query
  const versionsQuery = useQuery({
    queryKey: ['timetable-versions', academicYearId, statusFilter, page],
    queryFn: () =>
      timetableVersionsApi.list(academicYearId, {
        status: statusFilter || undefined,
        page,
        pageSize: 10,
      }),
  });

  // Create manual draft mutation
  const createMutation = useMutation({
    mutationFn: (note?: string) => timetableVersionsApi.create(academicYearId, { note }),
    onSuccess: (created) => {
      setSuccessNotice(`Đã tạo bản nháp Phiên ${created.versionNumber}.`);
      setCreateOpen(false);
      setCreateNote('');
      setSelectedVersionId(created.id);
      void queryClient.invalidateQueries({ queryKey: ['timetable-versions', academicYearId] });
    },
    onError: (err) => setErrorNotice(errorText(err)),
  });

  const versions = versionsQuery.data?.items ?? [];
  const selectedVersion = versions.find((v) => v.id === selectedVersionId) ?? null;

  return (
    <section className="workspace-section" aria-labelledby="versions-heading">
      <div className="section-heading">
        <div>
          <p className="utility-label">Sổ phiên bản TKB</p>
          <h2 id="versions-heading">Danh sách phiên bản thời khóa biểu</h2>
          <p>
            Mỗi phiên bản TKB lưu trữ toàn bộ các tiết dạy chính khóa, ngày hiệu lực và vòng đời chuyển trạng thái: Bản nháp &rarr; Đã kiểm tra &rarr; Đã duyệt &rarr; Đang áp dụng.
          </p>
        </div>
        <div className="row-actions">
          <Button
            type="button"
            variant="secondary"
            onClick={onNavigateToImport}
          >
            Nhập từ tệp Đam San
          </Button>
          <Button
            type="button"
            onClick={() => {
              setCreateOpen(true);
              setErrorNotice(null);
              setSuccessNotice(null);
            }}
          >
            Tạo bản nháp thủ công
          </Button>
        </div>
      </div>

      <MutationNotice error={errorNotice ? new Error(errorNotice) : undefined} success={successNotice ?? undefined} />

      {/* Create Manual Draft Dialog */}
      {createOpen && (
        <form
          className="long-form"
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate(createNote.trim() || undefined);
          }}
        >
          <h3>Tạo bản nháp thời khóa biểu thủ công</h3>
          <p>Bản nháp mới sẽ bắt đầu với 0 tiết dạy và trạng thái Bản nháp (DRAFT). Bạn có thể thiết lập tuần áp dụng sau đó.</p>
          <TextareaField
            id="draft-note-input"
            label="Ghi chú phiên bản"
            rows={2}
            value={createNote}
            onChange={(e) => setCreateNote(e.target.value)}
            placeholder="Ví dụ: Phiên bản dự thảo điều chỉnh sau hội nghị đầu năm..."
          />
          <div className="form-actions">
            <Button type="submit" loading={createMutation.isPending}>
              Xác nhận tạo bản nháp
            </Button>
            <Button
              type="button"
              variant="quiet"
              onClick={() => {
                setCreateOpen(false);
                setCreateNote('');
              }}
            >
              Hủy
            </Button>
          </div>
        </form>
      )}

      {/* Filter Toolbar */}
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap', marginBlock: '0.5rem 1rem' }}>
        <div style={{ minWidth: '200px' }}>
          <SelectField
            id="version-status-filter"
            label="Lọc theo trạng thái"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as TimetableVersionStatus | '');
              setPage(1);
            }}
          >
            <option value="">Tất cả trạng thái</option>
            <option value="DRAFT">Bản nháp (DRAFT)</option>
            <option value="VALIDATED">Đã kiểm tra hợp lệ (VALIDATED)</option>
            <option value="APPROVED">Đã phê duyệt (APPROVED)</option>
            <option value="ACTIVE">Đang áp dụng (ACTIVE)</option>
            <option value="SUPERSEDED">Đã thay thế (SUPERSEDED)</option>
          </SelectField>
        </div>
      </div>

      {versionsQuery.isPending ? (
        <PageLoading />
      ) : versionsQuery.isError ? (
        <QueryFailure error={versionsQuery.error} retry={() => void versionsQuery.refetch()} />
      ) : versions.length === 0 ? (
        <EmptyState
          title="Chưa có phiên bản thời khóa biểu nào"
          message="Bạn có thể nạp tệp thời khóa biểu chuẩn Đam San hoặc tạo bản nháp thủ công để bắt đầu."
        />
      ) : (
        <>
          <DataTable
            label="Danh sách các phiên bản thời khóa biểu"
            headings={['Phiên số', 'Trạng thái', 'Ngày hiệu lực', 'Số tiết', 'Cập nhật', 'Thao tác']}
          >
            {versions.map((ver) => {
              const statusMeta = VERSION_STATUS_LABELS[ver.status] ?? { label: ver.status, tone: 'inactive' };
              const isSelected = ver.id === selectedVersionId;
              return (
                <tr key={ver.id} style={isSelected ? { background: '#f8fafc' } : undefined}>
                  <td>
                    <strong>Phiên {ver.versionNumber}</strong>
                    {ver.note && <small className="table-secondary">{ver.note}</small>}
                  </td>
                  <td>
                    <span className={`status-badge status-badge--${statusMeta.tone}`}>
                      {statusMeta.label}
                    </span>
                  </td>
                  <td>
                    {ver.effectiveFrom ? (
                      <>
                        {formatCivilDate(ver.effectiveFrom)}
                        <small className="table-secondary">
                          {ver.effectiveUntil ? `đến ${formatCivilDate(ver.effectiveUntil)}` : 'đến nay'}
                        </small>
                      </>
                    ) : (
                      <span className="table-secondary">Chưa thiết lập ngày</span>
                    )}
                  </td>
                  <td>
                    <strong>{ver.entryCount}</strong> tiết
                  </td>
                  <td>
                    {formatDateTime(ver.updatedAt)}
                  </td>
                  <td>
                    <div className="row-actions">
                      <Button
                        type="button"
                        variant={isSelected ? 'primary' : 'secondary'}
                        onClick={() => setSelectedVersionId(isSelected ? null : ver.id)}
                      >
                        {isSelected ? 'Đóng chi tiết' : 'Xem chi tiết'}
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </DataTable>

          <Pagination
            page={versionsQuery.data?.page ?? 1}
            pageSize={versionsQuery.data?.pageSize ?? 10}
            total={versionsQuery.data?.total ?? 0}
            onPage={setPage}
          />
        </>
      )}

      {/* Selected Version Detail Drawer / Panel */}
      {selectedVersion && (
        <VersionDetailPanel
          key={selectedVersion.id}
          academicYearId={academicYearId}
          versionId={selectedVersion.id}
          onClose={() => setSelectedVersionId(null)}
          onVersionUpdated={() => {
            void queryClient.invalidateQueries({ queryKey: ['timetable-versions', academicYearId] });
          }}
        />
      )}
    </section>
  );
}

// =========================================================================
// VERSION DETAIL & LIFECYCLE ACTIONS
// =========================================================================

function VersionDetailPanel({
  academicYearId,
  versionId,
  onClose,
  onVersionUpdated,
}: {
  academicYearId: string;
  versionId: string;
  onClose(): void;
  onVersionUpdated(): void;
}) {
  const queryClient = useQueryClient();
  const [errorNotice, setErrorNotice] = useState<unknown>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const [lastValidationReport, setLastValidationReport] = useState<TimetableValidationReport | null>(null);
  const [readinessData, setReadinessData] = useState<TimetableReadinessResponse | null>(null);
  const [userFrom, setUserFrom] = useState<string | null>(null);
  const [userTo, setUserTo] = useState<string | null>(null);
  const [activateConfirmOpen, setActivateConfirmOpen] = useState(false);
  const [targetOpen, setTargetOpen] = useState(false);
  const [targetCalendarId, setTargetCalendarId] = useState('');
  const [targetWeekId, setTargetWeekId] = useState('');
  const [entriesPage, setEntriesPage] = useState(1);
  const [weekdayFilter, setWeekdayFilter] = useState<AcademicWeekday | ''>('');

  const readinessGenRef = useRef(0);

  // 1. Fetch version record
  const versionQuery = useQuery({
    queryKey: ['timetable-version-detail', versionId],
    queryFn: () => timetableVersionsApi.get(versionId),
  });

  const version = versionQuery.data;

  const defaultFrom = version?.effectiveFrom ?? '';
  const defaultTo = version?.effectiveUntil || version?.effectiveFrom || '';
  const readinessFrom = userFrom !== null ? userFrom : defaultFrom;
  const readinessTo = userTo !== null ? userTo : defaultTo;

  useEffect(() => {
    readinessGenRef.current++;
    setReadinessData(null);
    setActivateConfirmOpen(false);
  }, [version?.id]);

  // 2. Fetch calendars if target dialog is open
  const calendarsQuery = useQuery({
    queryKey: ['academic-calendars-for-target', academicYearId],
    queryFn: () => calendarVersionsApi.list(academicYearId, { page: 1, pageSize: 50 }),
    enabled: targetOpen,
  });

  const calendarDetailQuery = useQuery({
    queryKey: ['calendar-detail-for-target', targetCalendarId],
    queryFn: () => calendarVersionsApi.get(targetCalendarId),
    enabled: Boolean(targetCalendarId),
  });

  // 3. Fetch Entries
  const entriesQuery = useQuery({
    queryKey: ['timetable-entries', versionId, entriesPage, weekdayFilter],
    queryFn: () =>
      timetableVersionsApi.listEntries(versionId, {
        page: entriesPage,
        pageSize: 20,
        weekday: weekdayFilter || undefined,
      }),
  });

  // 4. Lifecycle mutations
  const validateMutation = useMutation({
    mutationFn: () => {
      if (!version) throw new Error('Không có phiên bản');
      return timetableVersionsApi.validate(version.id, {
        expectedUpdatedAt: version.updatedAt,
      });
    },
    onSuccess: (report) => {
      setLastValidationReport(report);
      if (report.valid) {
        setSuccessNotice('Kiểm tra hoàn tất: Thời khóa biểu hợp lệ và đã chuyển sang trạng thái ĐÃ KIỂM TRA (VALIDATED).');
      } else {
        setErrorNotice(new Error(`Kiểm tra phát hiện ${report.issues.length} vấn đề cần khắc phục trước khi phê duyệt.`));
      }
      void queryClient.invalidateQueries({ queryKey: ['timetable-version-detail', versionId] });
      onVersionUpdated();
    },
    onError: (err) => setErrorNotice(err),
  });

  const approveMutation = useMutation({
    mutationFn: () => {
      if (!version) throw new Error('Không có phiên bản');
      return timetableVersionsApi.approve(version.id, {
        expectedUpdatedAt: version.updatedAt,
      });
    },
    onSuccess: (appr) => {
      setSuccessNotice(`Phiên ${appr.versionNumber} đã được phê duyệt thành công (APPROVED).`);
      void queryClient.invalidateQueries({ queryKey: ['timetable-version-detail', versionId] });
      onVersionUpdated();
    },
    onError: (err) => setErrorNotice(err),
  });

  const activateMutation = useMutation({
    mutationFn: () => {
      if (!version) throw new Error('Không có phiên bản');
      if (version.academicYearId && version.academicYearId !== academicYearId) {
        throw new Error('Phiên bản không thuộc niên khóa đang chọn. Thao tác đã bị hủy.');
      }
      return timetableVersionsApi.activate(version.id, {
        expectedUpdatedAt: version.updatedAt,
      });
    },
    onSuccess: (result: TimetableActivationResult) => {
      setActivateConfirmOpen(false);
      if (result.activated) {
        setSuccessNotice(`Phiên ${result.version.versionNumber} đã được kích hoạt áp dụng chính thức toàn trường (ACTIVE).`);
      } else {
        setErrorNotice(new Error(`Không thể kích hoạt phiên bản: phát hiện ${result.issues.length} lỗi va chạm.`));
      }
      void queryClient.invalidateQueries({ queryKey: ['timetable-version-detail', versionId] });
      onVersionUpdated();
    },
    onError: (err) => {
      setActivateConfirmOpen(false);
      setErrorNotice(err);
    },
  });

  const setTargetMutation = useMutation({
    mutationFn: () => {
      if (!version) throw new Error('Không có phiên bản');
      return timetableVersionsApi.setTarget(version.id, {
        calendarVersionId: targetCalendarId,
        effectiveAcademicWeekId: targetWeekId,
        expectedUpdatedAt: version.updatedAt,
      });
    },
    onSuccess: (updated) => {
      setSuccessNotice(`Đã thiết lập tuần áp dụng cho Phiên ${updated.versionNumber}.`);
      setTargetOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['timetable-version-detail', versionId] });
      onVersionUpdated();
    },
    onError: (err) => setErrorNotice(err),
  });

  const readinessMutation = useMutation({
    mutationFn: async (vars?: { versionId?: string; from?: string; to?: string; gen?: number }) => {
      const targetVersionId = vars?.versionId ?? version?.id;
      const targetFrom = vars?.from ?? readinessFrom;
      const targetTo = vars?.to ?? readinessTo;
      if (!targetVersionId) throw new Error('Không có phiên bản');
      if (!targetFrom || !targetTo) throw new Error('Vui lòng nhập khoảng ngày from và to');
      const gen = vars?.gen ?? readinessGenRef.current;
      const res = await timetableVersionsApi.readiness(targetVersionId, {
        from: targetFrom,
        to: targetTo,
        profile: 'NORMAL_BASE_PPCT_V1',
      });
      return { res, gen, targetVersionId, targetFrom, targetTo };
    },
    onSuccess: ({ res, gen, targetVersionId, targetFrom, targetTo }) => {
      if (
        gen !== readinessGenRef.current ||
        targetVersionId !== version?.id ||
        targetFrom !== readinessFrom ||
        targetTo !== readinessTo
      ) {
        return;
      }
      setReadinessData(res);
      setSuccessNotice('Đánh giá mức sẵn sàng hoàn tất.');
    },
    onError: (err) => setErrorNotice(err),
  });

  if (versionQuery.isPending) return <PageLoading />;
  if (versionQuery.isError) return <QueryFailure error={versionQuery.error} retry={() => void versionQuery.refetch()} />;
  if (!version) return null;

  if (version.academicYearId && version.academicYearId !== academicYearId) {
    return (
      <article className="calendar-detail" style={{ borderTop: '3px solid var(--danger)', marginTop: '1.5rem', paddingTop: '1.5rem' }}>
        <InlineAlert title="Phiên bản không thuộc năm học đang chọn" tone="error">
          <p>Phiên bản thời khóa biểu này thuộc năm học khác. Để bảo đảm toàn vẹn dữ liệu, không thể thao tác chéo năm học.</p>
          <div style={{ marginTop: '0.75rem' }}>
            <Button type="button" variant="quiet" onClick={onClose}>
              Đóng chi tiết
            </Button>
          </div>
        </InlineAlert>
      </article>
    );
  }

  const statusMeta = VERSION_STATUS_LABELS[version.status] ?? { label: version.status, tone: 'inactive' };
  const isDraft = version.status === 'DRAFT';
  const isValidated = version.status === 'VALIDATED';
  const isApproved = version.status === 'APPROVED';
  const isAssessable = version.status !== 'DRAFT';

  return (
    <article className="calendar-detail" style={{ borderTop: '3px solid var(--primary)', marginTop: '1.5rem', paddingTop: '1.5rem' }}>
      <div className="section-heading">
        <div>
          <p className="utility-label">Chi tiết phiên bản</p>
          <h3>Phiên bản thời khóa biểu: Phiên {version.versionNumber}</h3>
          <p>
            Trạng thái hiện tại:{' '}
            <span className={`status-badge status-badge--${statusMeta.tone}`}>
              {statusMeta.label}
            </span>
            {' · '}Tổng số: <strong>{version.entryCount}</strong> tiết dạy chính khóa
          </p>
        </div>
        <div className="row-actions">
          <Button type="button" variant="quiet" onClick={onClose}>
            Đóng chi tiết
          </Button>
        </div>
      </div>

      <MutationNotice error={errorNotice} success={successNotice ?? undefined} />

      {/* Lifecycle Command Toolbar */}
      <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '6px', border: '1.5px solid var(--border-card)', display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontWeight: 600 }}>Thao tác vòng đời:</span>

        {isDraft && (
          <>
            <Button
              type="button"
              variant="primary"
              loading={validateMutation.isPending}
              onClick={() => {
                setErrorNotice(null);
                setSuccessNotice(null);
                validateMutation.mutate();
              }}
            >
              Kiểm tra hợp lệ (Validate)
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setTargetOpen(!targetOpen);
                setErrorNotice(null);
              }}
            >
              Thiết lập tuần áp dụng
            </Button>
          </>
        )}

        {isValidated && (
          <Button
            type="button"
            variant="primary"
            loading={approveMutation.isPending}
            onClick={() => {
              setErrorNotice(null);
              setSuccessNotice(null);
              approveMutation.mutate();
            }}
          >
            Phê duyệt phiên bản (Approve)
          </Button>
        )}

        {isApproved && (
          <Button
            type="button"
            variant="primary"
            disabled={activateMutation.isPending}
            onClick={() => {
              setErrorNotice(null);
              setSuccessNotice(null);
              setActivateConfirmOpen(true);
            }}
          >
            Kích hoạt áp dụng chính thức (Activate)
          </Button>
        )}

        {version.status === 'ACTIVE' && (
          <span style={{ color: 'var(--success)', fontWeight: 600 }}>
            Phiên bản này đang có hiệu lực áp dụng thực tế trên toàn trường.
          </span>
        )}

        {version.status === 'SUPERSEDED' && (
          <span style={{ color: '#64748b', fontStyle: 'italic' }}>
            Phiên bản lịch sử đã bị thay thế bởi phiên bản mới hơn.
          </span>
        )}
      </div>

      {/* Irreversible Activation Confirmation Box (R4) */}
      {activateConfirmOpen && (
        <div
          style={{
            background: '#fffbeb',
            border: '2px solid #d97706',
            borderRadius: '6px',
            padding: '1.25rem',
            marginBlock: '1rem',
          }}
          role="region"
          aria-labelledby="activate-confirm-heading"
        >
          <h4 id="activate-confirm-heading" style={{ color: '#92400e', margin: '0 0 0.5rem 0' }}>
            Xác nhận kích hoạt áp dụng thời khóa biểu toàn trường
          </h4>
          <p style={{ color: '#78350f', marginBottom: '0.75rem' }}>
            Bạn đang yêu cầu kích hoạt chính thức <strong>Phiên bản {version.versionNumber}</strong> cho toàn trường.
          </p>
          <div
            style={{
              background: '#ffffff',
              padding: '0.75rem',
              borderRadius: '4px',
              border: '1px solid #fde68a',
              marginBottom: '0.75rem',
              fontSize: '0.9rem',
            }}
          >
            <div><strong>Phiên bản:</strong> Phiên {version.versionNumber} ({statusMeta.label})</div>
            <div>
              <strong>Thời gian áp dụng:</strong>{' '}
              {version.effectiveFrom ? formatCivilDate(version.effectiveFrom) : 'Chưa có ngày bắt đầu'}{' '}
              đến {version.effectiveUntil ? formatCivilDate(version.effectiveUntil) : 'nay'}
            </div>
            <div><strong>Quy mô dữ liệu:</strong> {version.entryCount} tiết dạy chính khóa</div>
          </div>
          <p style={{ color: '#b45309', fontWeight: 600, fontSize: '0.88rem', marginBottom: '1rem' }}>
            Cảnh báo tác động: Khi kích hoạt, phiên bản này sẽ thay thế (supersede) phiên bản đang áp dụng hiện hành và điều chỉnh lịch học toàn trường. Thao tác này không thể hoàn tác trực tiếp.
          </p>
          <div className="row-actions">
            <Button
              type="button"
              variant="primary"
              loading={activateMutation.isPending}
              disabled={activateMutation.isPending}
              onClick={() => {
                setErrorNotice(null);
                setSuccessNotice(null);
                activateMutation.mutate();
              }}
            >
              Xác nhận kích hoạt toàn trường
            </Button>
            <Button
              type="button"
              variant="quiet"
              disabled={activateMutation.isPending}
              onClick={() => setActivateConfirmOpen(false)}
            >
              Hủy
            </Button>
          </div>
        </div>
      )}

      {/* Target Setting Form for manual drafts */}
      {targetOpen && (
        <form
          className="long-form"
          style={{ background: '#ffffff', padding: '1rem', border: '1.5px solid var(--border-card)', borderRadius: '6px' }}
          onSubmit={(e) => {
            e.preventDefault();
            setTargetMutation.mutate();
          }}
        >
          <h4>Thiết lập mục tiêu tuần hiệu lực</h4>
          <p>
            Chọn phiên lịch học thuật và tuần học chính thức để xác định ngày bắt đầu hiệu lực (<code className="technical-value">effectiveFrom</code>) cho phiên bản TKB.
          </p>
          <div className="form-grid">
            <SelectField
              id="target-calendar-select"
              label="Phiên lịch học thuật"
              value={targetCalendarId}
              onChange={(e) => {
                setTargetCalendarId(e.target.value);
                setTargetWeekId('');
              }}
              required
            >
              <option value="">-- Chọn phiên lịch --</option>
              {calendarsQuery.data?.items.map((cal) => (
                <option key={cal.id} value={cal.id}>
                  Phiên lịch {cal.versionNumber} ({formatCivilDate(cal.startDate)} – {formatCivilDate(cal.endDate)}) {cal.isActive ? '· Đang áp dụng' : ''}
                </option>
              ))}
            </SelectField>

            <SelectField
              id="target-week-select"
              label="Tuần học bắt đầu áp dụng"
              value={targetWeekId}
              onChange={(e) => setTargetWeekId(e.target.value)}
              disabled={!targetCalendarId || calendarDetailQuery.isPending}
              required
            >
              <option value="">-- Chọn tuần học --</option>
              {calendarDetailQuery.data?.weeks.map((wk) => {
                const seg = wk.segments[0];
                return (
                  <option key={wk.id} value={wk.id}>
                    {wk.displayLabel} ({seg ? `${formatCivilDate(seg.startDate)} đến ${formatCivilDate(seg.endDate)}` : 'Không có ngày'})
                  </option>
                );
              })}
            </SelectField>
          </div>
          <div className="form-actions">
            <Button type="submit" loading={setTargetMutation.isPending} disabled={!targetWeekId}>
              Lưu tuần áp dụng
            </Button>
            <Button type="button" variant="quiet" onClick={() => setTargetOpen(false)}>
              Hủy
            </Button>
          </div>
        </form>
      )}

      {/* Metadata Overview */}
      <dl className="register-summary">
        <div>
          <dt>Mã kiểm chứng toàn vẹn (Checksum)</dt>
          <dd>
            {version.contentChecksum ? (
              <details style={{ display: 'inline-block' }}>
                <summary style={{ cursor: 'pointer' }}>
                  <code className="technical-value">{version.contentChecksum.substring(0, 12)}…</code>
                </summary>
                <code className="technical-value" style={{ display: 'block', marginTop: '0.25rem', wordBreak: 'break-all' }}>
                  {version.contentChecksum}
                </code>
              </details>
            ) : (
              '— (Chưa có)'
            )}
          </dd>
        </div>
        <div>
          <dt>Khoảng ngày áp dụng</dt>
          <dd>
            {version.effectiveFrom ? formatCivilDate(version.effectiveFrom) : '—'}
            {' đến '}
            {version.effectiveUntil ? formatCivilDate(version.effectiveUntil) : 'đến nay'}
          </dd>
        </div>
        <div>
          <dt>Người tạo / Thời gian tạo</dt>
          <dd>
            {formatDateTime(version.createdAt)}
          </dd>
        </div>
        <div>
          <dt>Xác thực / Phê duyệt</dt>
          <dd>
            {version.validatedAt ? `Xác thực lúc ${formatDateTime(version.validatedAt)}` : 'Chưa xác thực'}
            {version.approvedAt ? ` · Duyệt lúc ${formatDateTime(version.approvedAt)}` : ''}
            {version.activatedAt ? ` · Kích hoạt lúc ${formatDateTime(version.activatedAt)}` : ''}
          </dd>
        </div>
      </dl>

      {/* Validation Issues (if validation failed) */}
      {lastValidationReport && !lastValidationReport.valid && (
        <InlineAlert title="Phát hiện lỗi không hợp lệ khi kiểm tra TKB" tone="error">
          <p>Thời khóa biểu chưa thể chuyển sang trạng thái Hợp lệ do có các vấn đề sau:</p>
          <ul>
            {lastValidationReport.issues.map((issue, idx) => (
              <li key={idx}>
                <strong>[{issue.code}]</strong>: {issue.message}
              </li>
            ))}
          </ul>
        </InlineAlert>
      )}

      {/* Readiness Assessment Section (Only for assessable statuses) */}
      {isAssessable && (
        <section style={{ borderTop: '2px solid var(--border-card)', paddingTop: '1.25rem', marginTop: '1.25rem' }}>
          <h4>Đánh giá mức sẵn sàng (Readiness Assessment)</h4>
          <p style={{ color: '#475569', fontSize: '0.92rem' }}>
            Đánh giá tính sẵn sàng của phiên bản thời khóa biểu kết nối với kế hoạch phân phối chương trình (PPCT) theo hồ sơ <code className="technical-value">NORMAL_BASE_PPCT_V1</code>.
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!version) return;
              const nextGen = ++readinessGenRef.current;
              readinessMutation.mutate({
                versionId: version.id,
                from: readinessFrom,
                to: readinessTo,
                gen: nextGen,
              });
            }}
            style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap', marginBlock: '0.75rem' }}
          >
            <div style={{ minWidth: '160px' }}>
              <FormField
                label="Từ ngày (from)"
                name="readiness-from"
                type="date"
                value={readinessFrom}
                onChange={(e) => {
                  setUserFrom(e.target.value);
                  readinessGenRef.current++;
                  setReadinessData(null);
                }}
                required
              />
            </div>
            <div style={{ minWidth: '160px' }}>
              <FormField
                label="Đến ngày (to)"
                name="readiness-to"
                type="date"
                value={readinessTo}
                onChange={(e) => {
                  setUserTo(e.target.value);
                  readinessGenRef.current++;
                  setReadinessData(null);
                }}
                required
              />
            </div>
            <div>
              <Button type="submit" loading={readinessMutation.isPending} disabled={!readinessFrom || !readinessTo}>
                Chạy đánh giá sẵn sàng
              </Button>
            </div>
          </form>

          {readinessData && (
            <div style={{ marginTop: '1rem', background: '#f8fafc', padding: '1rem', borderRadius: '6px', border: '1.5px solid var(--border-card)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <div>
                  <strong>Kết quả đánh giá gốc: </strong>
                  <span className={`status-badge ${readinessData.result === 'PASS' ? 'status-badge--active' : 'status-badge--error'}`}>
                    {readinessData.result === 'PASS' ? 'ĐẠT (PASS)' : 'CHƯA ĐẠT (FAIL)'}
                  </span>
                  <small style={{ marginLeft: '1rem', color: '#64748b' }}>
                    Thời gian: {formatDateTime(readinessData.evaluatedAt)}
                  </small>
                </div>
              </div>

              {(() => {
                const assessedCount = readinessData.dimensions.filter((d) => d.state !== 'NOT_ASSESSED').length;
                const notAssessedCount = readinessData.dimensions.filter((d) => d.state === 'NOT_ASSESSED').length;
                const scopeFrom = (typeof readinessData.scope === 'object' && readinessData.scope?.from) ? readinessData.scope.from : readinessFrom;
                const scopeTo = (typeof readinessData.scope === 'object' && readinessData.scope?.to) ? readinessData.scope.to : readinessTo;
                return (
                  <>
                    <p style={{ fontSize: '0.88rem', color: '#64748b', marginBottom: '0.5rem' }}>
                      Hồ sơ <strong>{readinessData.productLabel || readinessData.profile}</strong> đánh giá <strong>{assessedCount}</strong> chiều bắt buộc về nền tảng và liên kết PPCT. <strong>{notAssessedCount}</strong> chiều điều hành còn lại ở trạng thái <code className="technical-value">NOT_ASSESSED</code> (không đánh giá) và không được tính là đạt hay tự động suy diễn thành hoàn thành toàn diện.
                    </p>
                    <div style={{ background: '#ffffff', padding: '0.6rem 0.75rem', borderRadius: '4px', border: '1px solid var(--border-card)', marginBottom: '0.75rem', fontSize: '0.88rem', color: '#334155' }}>
                      <div>
                        <strong>Phạm vi đánh giá:</strong> Từ ngày {formatCivilDate(scopeFrom)} đến {formatCivilDate(scopeTo)}
                        {readinessData.scope?.affectedStreams?.length ? ` (${readinessData.scope.affectedStreams.length} luồng lớp-môn)` : ''}
                      </div>
                      {readinessData.provenance && (
                        <div style={{ marginTop: '0.25rem', color: '#475569' }}>
                          <strong>Căn cứ:</strong> Phiên TKB: <code className="technical-value">{readinessData.provenance.timetableVersionId}</code>
                          {readinessData.provenance.academicCalendarVersionId && (
                            <> · Phiên lịch: <code className="technical-value">{readinessData.provenance.academicCalendarVersionId}</code></>
                          )}
                          {readinessData.provenance.ppctClassAssociationIds && readinessData.provenance.ppctClassAssociationIds.length > 0 && (
                            <> · Gán PPCT: {readinessData.provenance.ppctClassAssociationIds.length} lớp</>
                          )}
                        </div>
                      )}
                    </div>
                  </>
                );
              })()}

              <DataTable
                label="Bảng các chiều đánh giá mức sẵn sàng"
                headings={['Chiều đánh giá', 'Trạng thái', 'Bắt buộc']}
              >
                {readinessData.dimensions.map((dim) => {
                  const label = READINESS_DIMENSION_LABELS[dim.key] ?? dim.key;
                  return (
                    <tr key={dim.key}>
                      <td>
                        <strong>{label}</strong>
                        <small className="table-secondary">{dim.key}</small>
                      </td>
                      <td>
                        {dim.state === 'PASS' ? (
                          <span className="status-badge status-badge--active">ĐẠT (PASS)</span>
                        ) : dim.state === 'FAIL' ? (
                          <span className="status-badge status-badge--error">CHƯA ĐẠT (FAIL)</span>
                        ) : (
                          <span className="status-badge status-badge--inactive">CHƯA ĐÁNH GIÁ (NOT_ASSESSED)</span>
                        )}
                      </td>
                      <td>{dim.required ? 'Có' : 'Không'}</td>
                    </tr>
                  );
                })}
              </DataTable>

              {readinessData.findings.length > 0 && (
                <div style={{ marginTop: '1rem' }}>
                  <h5>Danh sách phát hiện ({readinessData.findings.length}):</h5>
                  <ul>
                    {readinessData.findings.map((finding, idx) => (
                      <li key={idx}>
                        <span className={`status-badge status-badge--${finding.severity === 'BLOCKER' ? 'error' : 'warning'}`}>
                          {finding.severity}
                        </span>{' '}
                        <strong>[{finding.code}]</strong>: {finding.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* Timetable Entries List */}
      <section style={{ borderTop: '2px solid var(--border-card)', paddingTop: '1.25rem', marginTop: '1.25rem' }}>
        <div className="section-heading">
          <div>
            <h4>Danh sách các tiết dạy trong thời khóa biểu</h4>
            <p>Toàn bộ các tiết học đã được nạp và đối soát trong phiên bản này.</p>
          </div>
          <div style={{ minWidth: '180px' }}>
            <SelectField
              id="entries-weekday-filter"
              label="Lọc theo thứ"
              value={weekdayFilter}
              onChange={(e) => {
                setWeekdayFilter(e.target.value as AcademicWeekday | '');
                setEntriesPage(1);
              }}
            >
              <option value="">Tất cả các ngày</option>
              {WEEKDAYS.map((day) => (
                <option key={day.value} value={day.value}>
                  {day.label}
                </option>
              ))}
            </SelectField>
          </div>
        </div>

        {entriesQuery.isPending ? (
          <PageLoading />
        ) : entriesQuery.isError ? (
          <QueryFailure error={entriesQuery.error} retry={() => void entriesQuery.refetch()} />
        ) : (entriesQuery.data?.items.length ?? 0) === 0 ? (
          <EmptyState
            filtered={Boolean(weekdayFilter)}
            title="Chưa có tiết dạy nào"
            message="Phiên bản này hiện chưa có nội dung tiết dạy hoặc không khớp bộ lọc."
          />
        ) : (
          <>
            <DataTable
              label="Bảng các tiết dạy trong thời khóa biểu"
              headings={['Thứ', 'Tiết số', 'Khung giờ', 'Lớp', 'Môn học', 'Giáo viên phụ trách']}
            >
              {entriesQuery.data?.items.map((entry) => {
                const dayLabel = WEEKDAYS.find((d) => d.value === entry.weekday)?.label ?? entry.weekday;
                return (
                  <tr key={entry.id}>
                    <td><strong>{dayLabel}</strong></td>
                    <td>Tiết {entry.timeSlot?.ordinal ?? '—'}</td>
                    <td>
                      <code className="technical-value">
                        {entry.timeSlot ? `${entry.timeSlot.startTime} – ${entry.timeSlot.endTime}` : '—'}
                      </code>
                    </td>
                    <td><strong>{entry.schoolClass?.name ?? '—'}</strong></td>
                    <td>{entry.subject?.name ?? '—'}</td>
                    <td>
                      <strong>{entry.teacher?.displayName ?? '—'}</strong>
                      {entry.teacher?.staffCode && (
                        <small className="table-secondary">{entry.teacher.staffCode}</small>
                      )}
                    </td>
                  </tr>
                );
              })}
            </DataTable>

            <Pagination
              page={entriesQuery.data?.page ?? 1}
              pageSize={entriesQuery.data?.pageSize ?? 20}
              total={entriesQuery.data?.total ?? 0}
              onPage={setEntriesPage}
            />
          </>
        )}
      </section>
    </article>
  );
}

// =========================================================================
// TAB 2: NHẬP TKB NATIVE ĐAM SAN (WORKBOOK UPLOAD & RECONCILIATION)
// =========================================================================

interface PreviewContextSnapshot {
  fileName: string;
  fileSize: number;
  profileRevisionId: string;
  nativeSessionMode: TimetableImportNativeSessionMode;
  academicYearId: string;
  calendarVersionId: string;
  effectiveAcademicWeekId: string;
}

function createClientRequestIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `req-${crypto.randomUUID()}`;
  }
  return `req-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

function TimetableImportTab({
  academicYearId,
  profiles,
  onImportSuccess,
}: {
  academicYearId: string;
  profiles: TimetableImportProfileRecord[];
  onImportSuccess(version: TimetableVersionRecord): void;
}) {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [selectedProfileRevisionId, setSelectedProfileRevisionId] = useState<string>('');
  const [nativeSessionMode, setNativeSessionMode] = useState<TimetableImportNativeSessionMode>('BOTH');
  const [calendarVersionId, setCalendarVersionId] = useState<string>('');
  const [effectiveAcademicWeekId, setEffectiveAcademicWeekId] = useState<string>('');
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => createClientRequestIdempotencyKey());

  const [inspectResult, setInspectResult] = useState<TimetableImportWorkbookInspectionResponse | null>(null);
  const [previewResult, setPreviewResult] = useState<TimetableImportWorkbookPreviewResponse | null>(null);
  const [previewSnapshot, setPreviewSnapshot] = useState<PreviewContextSnapshot | null>(null);
  const [confirmResult, setConfirmResult] = useState<TimetableImportWorkbookConfirmResponse | null>(null);

  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  const inspectGenRef = useRef(0);
  const previewGenRef = useRef(0);

  // Active profile default
  const defaultProfile = useMemo(() => {
    return profiles.find((p) => p.activeRevision) ?? profiles[0] ?? null;
  }, [profiles]);

  const profileRevisionId = selectedProfileRevisionId || (defaultProfile?.activeRevision?.id ?? '');

  // 1. Calendars for target
  const calendarsQuery = useQuery({
    queryKey: ['academic-calendars-for-import', academicYearId],
    queryFn: () => calendarVersionsApi.list(academicYearId, { page: 1, pageSize: 50 }),
  });

  const calendars = calendarsQuery.data?.items ?? [];
  const currentCalendarId = calendarVersionId || (calendars.find((c) => c.isActive)?.id ?? (calendars[0]?.id ?? ''));

  // 2. Calendar detail for weeks
  const calendarDetailQuery = useQuery({
    queryKey: ['calendar-detail-for-import', currentCalendarId],
    queryFn: () => calendarVersionsApi.get(currentCalendarId),
    enabled: Boolean(currentCalendarId),
  });

  const weeks = calendarDetailQuery.data?.weeks ?? [];
  const currentWeekId = effectiveAcademicWeekId || (weeks[0]?.id ?? '');

  const isPreviewMatching = Boolean(
    previewResult &&
    previewSnapshot &&
    file &&
    previewSnapshot.fileName === file.name &&
    previewSnapshot.fileSize === file.size &&
    previewSnapshot.profileRevisionId === profileRevisionId &&
    previewSnapshot.nativeSessionMode === nativeSessionMode &&
    previewSnapshot.academicYearId === academicYearId &&
    previewSnapshot.calendarVersionId === currentCalendarId &&
    previewSnapshot.effectiveAcademicWeekId === currentWeekId
  );

  const invalidatePreview = () => {
    previewGenRef.current++;
    setPreviewResult(null);
    setPreviewSnapshot(null);
    setErrorNotice(null);
    setSuccessNotice(null);
    setIdempotencyKey(createClientRequestIdempotencyKey());
  };

  // Mutations
  const inspectMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('Vui lòng chọn tệp .xlsx');
      if (!profileRevisionId) throw new Error('Vui lòng chọn cấu hình nhập');
      const gen = ++inspectGenRef.current;
      const data = await timetableImportApi.inspect(file, {
        profileRevisionId,
        sourceFormat: 'DAMSAN_NATIVE',
        nativeSessionMode,
      });
      return { data, gen };
    },
    onSuccess: ({ data, gen }) => {
      if (gen !== inspectGenRef.current) return;
      setInspectResult(data);
      setPreviewResult(null);
      setPreviewSnapshot(null);
      setSuccessNotice('Kiểm tra tệp thành công: Các trang tính khớp định dạng chuẩn Đam San.');
    },
    onError: (err) => setErrorNotice(errorText(err)),
  });

  const previewMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('Vui lòng chọn tệp .xlsx');
      if (!profileRevisionId) throw new Error('Vui lòng chọn cấu hình nhập');
      if (!currentCalendarId) throw new Error('Vui lòng chọn phiên lịch học thuật');
      if (!currentWeekId) throw new Error('Vui lòng chọn tuần học bắt đầu hiệu lực');
      const gen = ++previewGenRef.current;
      const snapshot: PreviewContextSnapshot = {
        fileName: file.name,
        fileSize: file.size,
        profileRevisionId,
        nativeSessionMode,
        academicYearId,
        calendarVersionId: currentCalendarId,
        effectiveAcademicWeekId: currentWeekId,
      };
      const data = await timetableImportApi.preview(file, {
        profileRevisionId,
        sourceFormat: 'DAMSAN_NATIVE',
        nativeSessionMode,
        academicYearId,
        calendarVersionId: currentCalendarId,
        effectiveAcademicWeekId: currentWeekId,
      });
      return { data, gen, snapshot };
    },
    onSuccess: ({ data, gen, snapshot }) => {
      if (gen !== previewGenRef.current) return;
      setPreviewResult(data);
      setPreviewSnapshot(snapshot);
      if (data.canConfirm && data.blockingIssueCount === 0) {
        setSuccessNotice('Xem trước đối soát hoàn tất: Chứng cứ Class-view và Teacher-view khớp; tệp đủ điều kiện để nạp vào bản nháp.');
      } else {
        setErrorNotice(`Xem trước đối soát phát hiện ${data.blockingIssueCount} lỗi chặn và ${data.warningCount} cảnh báo.`);
      }
    },
    onError: (err) => setErrorNotice(errorText(err)),
  });

  const confirmMutation = useMutation({
    mutationFn: () => {
      if (!file) throw new Error('Vui lòng chọn tệp .xlsx');
      if (!previewResult || !isPreviewMatching) {
        throw new Error('Dữ liệu xem trước không khớp cấu hình hiện tại. Vui lòng bấm Xem trước đối soát lại.');
      }
      if (!previewResult.canConfirm || previewResult.blockingIssueCount > 0) {
        throw new Error('Tệp có lỗi chặn đối soát, không đủ điều kiện nạp.');
      }
      let activeKey = idempotencyKey.trim();
      if (!activeKey) {
        activeKey = createClientRequestIdempotencyKey();
        setIdempotencyKey(activeKey);
      }
      return timetableImportApi.confirm(file, {
        profileRevisionId,
        sourceFormat: 'DAMSAN_NATIVE',
        nativeSessionMode,
        academicYearId,
        calendarVersionId: currentCalendarId,
        effectiveAcademicWeekId: currentWeekId,
        requestIdempotencyKey: activeKey,
      });
    },
    onSuccess: (res) => {
      setConfirmResult(res);
      setSuccessNotice(`Xác nhận nạp TKB thành công: Phiên ${res.version.versionNumber} ở trạng thái Bản nháp (DRAFT).`);
      setIdempotencyKey(createClientRequestIdempotencyKey());
      void queryClient.invalidateQueries({ queryKey: ['timetable-versions', academicYearId] });
      onImportSuccess(res.version);
    },
    onError: (err) => setErrorNotice(errorText(err)),
  });

  return (
    <section className="workspace-section" aria-labelledby="import-heading">
      <div className="section-heading">
        <div>
          <p className="utility-label">Nạp dữ liệu thời khóa biểu</p>
          <h2 id="import-heading">Nhập Thời khóa biểu chuẩn Đam San (Native Workbook)</h2>
          <p>
            Quy trình nhập tự động đọc và đối soát chéo 2 chiều giữa <strong>Lịch theo Lớp</strong> (Class-view) và <strong>Lịch theo Giáo viên</strong> (Teacher-view) trên 4 sheet chuẩn. Mọi xung đột hoặc lệch tiết đều được báo cáo trung thực.
          </p>
        </div>
      </div>

      <MutationNotice error={errorNotice ? new Error(errorNotice) : undefined} success={successNotice ?? undefined} />

      {/* Confirmation Success Callout */}
      {confirmResult && (
        <InlineAlert title="Đã nạp thời khóa biểu thành công" tone="success">
          <p>
            Đã tạo/cập nhật phiên bản thời khóa biểu <strong>Phiên {confirmResult.version.versionNumber}</strong> (Trạng thái: <strong>Bản nháp - DRAFT</strong>) với <strong>{confirmResult.receipt.normalizedEntryCount}</strong> tiết dạy hợp lệ.
          </p>
          <details style={{ marginTop: '0.5rem', fontSize: '0.88rem', color: '#475569' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 500 }}>Thông tin kỹ thuật biên nhận (dành cho quản trị viên)</summary>
            <div style={{ marginTop: '0.35rem', padding: '0.5rem', background: '#ffffff', borderRadius: '4px', border: '1px solid var(--border-card)' }}>
              <div>Mã biên nhận: <code className="technical-value">{confirmResult.receipt.id}</code></div>
              {confirmResult.version?.contentChecksum && (
                <div>Mã kiểm tra nội dung (SHA-256): <code className="technical-value">{confirmResult.version.contentChecksum}</code></div>
              )}
              {confirmResult.receipt.requestFingerprint && (
                <div>Dấu vết yêu cầu: <code className="technical-value">{confirmResult.receipt.requestFingerprint}</code></div>
              )}
            </div>
          </details>
        </InlineAlert>
      )}

      {/* Upload & Configuration Form */}
      <form
        className="long-form"
        onSubmit={(e) => {
          e.preventDefault();
        }}
      >
        <FormSection title="1. Chọn tệp thời khóa biểu và cấu hình nhập">
          <div className="form-grid">
            <div className="form-field">
              <label className="form-field__label" htmlFor="tkb-file-input">
                Tệp Excel Thời khóa biểu (.xlsx) <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <input
                id="tkb-file-input"
                name="tkb-file"
                type="file"
                accept=".xlsx"
                className="form-field__input"
                onChange={(e) => {
                  const selected = e.target.files?.[0] ?? null;
                  setFile(selected);
                  inspectGenRef.current++;
                  setInspectResult(null);
                  setConfirmResult(null);
                  invalidatePreview();
                }}
              />
            </div>

            <SelectField
              id="import-session-mode"
              label="Chế độ buổi áp dụng (Session Mode)"
              value={nativeSessionMode}
              onChange={(e) => {
                setNativeSessionMode(e.target.value as TimetableImportNativeSessionMode);
                inspectGenRef.current++;
                setInspectResult(null);
                invalidatePreview();
              }}
              hint="Chọn phiên buổi muốn cập nhật; giữ nguyên buổi còn lại từ TKB baseline."
            >
              <option value="BOTH">Cả hai buổi (Sáng & Chiều - Toàn bộ)</option>
              <option value="MORNING">Chỉ buổi Sáng (Giữ nguyên buổi Chiều từ baseline)</option>
              <option value="AFTERNOON">Chỉ buổi Chiều (Giữ nguyên buổi Sáng từ baseline)</option>
            </SelectField>

            {profiles.length > 1 && (
              <SelectField
                id="import-profile-select"
                label="Cấu hình nhập"
                value={selectedProfileRevisionId || (defaultProfile?.activeRevision?.id ?? '')}
                onChange={(e) => {
                  setSelectedProfileRevisionId(e.target.value);
                  inspectGenRef.current++;
                  setInspectResult(null);
                  invalidatePreview();
                }}
              >
                {profiles.map((p) => (
                  <option key={p.id} value={p.activeRevision?.id ?? ''}>
                    {p.name}
                  </option>
                ))}
              </SelectField>
            )}
          </div>
        </FormSection>

        <FormSection title="2. Chọn mục tiêu áp dụng học thuật">
          <div className="form-grid">
            <SelectField
              id="import-calendar-version"
              label="Phiên lịch học thuật"
              value={currentCalendarId}
              onChange={(e) => {
                setCalendarVersionId(e.target.value);
                setEffectiveAcademicWeekId('');
                invalidatePreview();
              }}
              required
            >
              <option value="">-- Chọn phiên lịch --</option>
              {calendars.map((cal) => (
                <option key={cal.id} value={cal.id}>
                  Phiên lịch {cal.versionNumber} ({formatCivilDate(cal.startDate)} – {formatCivilDate(cal.endDate)}) {cal.isActive ? '· Đang áp dụng' : ''}
                </option>
              ))}
            </SelectField>

            <SelectField
              id="import-effective-week"
              label="Tuần học bắt đầu áp dụng (Effective Week)"
              value={currentWeekId}
              onChange={(e) => {
                setEffectiveAcademicWeekId(e.target.value);
                invalidatePreview();
              }}
              disabled={!currentCalendarId || calendarDetailQuery.isPending}
              required
            >
              <option value="">-- Chọn tuần học --</option>
              {weeks.map((wk) => {
                const seg = wk.segments[0];
                return (
                  <option key={wk.id} value={wk.id}>
                    {wk.displayLabel} ({seg ? `${formatCivilDate(seg.startDate)} đến ${formatCivilDate(seg.endDate)}` : ''})
                  </option>
                );
              })}
            </SelectField>
          </div>
        </FormSection>

        <div className="form-actions">
          <Button
            type="button"
            variant="secondary"
            loading={inspectMutation.isPending}
            disabled={!file}
            onClick={() => {
              setErrorNotice(null);
              inspectMutation.mutate();
            }}
          >
            Kiểm tra tệp (Inspect)
          </Button>

          <Button
            type="button"
            variant="primary"
            loading={previewMutation.isPending}
            disabled={!file || !currentCalendarId || !currentWeekId}
            onClick={() => {
              setErrorNotice(null);
              previewMutation.mutate();
            }}
          >
            Xem trước đối soát (Preview)
          </Button>
        </div>
      </form>

      {/* Inspect Results Section */}
      {inspectResult && (
        <section style={{ marginTop: '1.5rem', background: '#f8fafc', padding: '1rem', borderRadius: '6px', border: '1.5px solid var(--border-card)' }}>
          <h4>Kết quả kiểm tra tệp (Inspect)</h4>
          <p>
            Tệp: <strong>{inspectResult.sourceFileName}</strong> · Số trang tính phát hiện: <strong>{inspectResult.sheets.length}</strong>
          </p>
          <DataTable
            label="Các trang tính trong tệp thời khóa biểu"
            headings={['Tên trang tính (Sheet)', 'Số dòng', 'Số cột', 'Trạng thái']}
          >
            {inspectResult.sheets.map((sh) => (
              <tr key={sh.name}>
                <td><strong>{sh.name}</strong></td>
                <td>{sh.rowCount} dòng</td>
                <td>{sh.columnCount} cột</td>
                <td>
                  <span className="status-badge status-badge--active">Hợp lệ</span>
                </td>
              </tr>
            ))}
          </DataTable>
        </section>
      )}

      {/* Preview Reconciliation Section */}
      {previewResult && (
        <section style={{ marginTop: '1.5rem', borderTop: '2px solid var(--primary)', paddingTop: '1.5rem' }}>
          <div className="section-heading">
            <div>
              <h3>Kết quả đối soát chứng cứ chéo (Peer Reconciliation Report)</h3>
              <p>
                Đối soát chéo dữ liệu Lớp (Class-view) và Giáo viên (Teacher-view). Cả hai góc nhìn đều là chứng cứ ngang hàng; nếu có sự sai lệch về môn, lớp, giáo viên hoặc thời gian, hệ thống sẽ phát hiện ngay tại đây.
              </p>
            </div>
          </div>

          {/* Status summary banner */}
          <div style={{ marginBlock: '1rem' }}>
            {previewResult.canConfirm && previewResult.blockingIssueCount === 0 ? (
              <InlineAlert title="Tệp thời khóa biểu đủ điều kiện nạp vào bản nháp" tone="success">
                <p>
                  Toàn bộ chứng cứ giữa các trang tính khớp nhau. Số lỗi chặn: <strong>0</strong>. Bạn có thể tiến hành xác nhận nạp bên dưới.
                </p>
              </InlineAlert>
            ) : (
              <InlineAlert title="Phát hiện vấn đề đối soát chưa thể nạp" tone="error">
                <p>
                  Tệp có <strong>{previewResult.blockingIssueCount}</strong> lỗi chặn và <strong>{previewResult.warningCount}</strong> cảnh báo. Vui lòng kiểm tra danh sách chi tiết bên dưới.
                </p>
              </InlineAlert>
            )}
          </div>

          {/* Composition summary (if selective carry-forward) */}
          {previewResult.composition && (
            <div style={{ background: '#ffffff', padding: '1rem', border: '1.5px solid var(--border-card)', borderRadius: '6px', marginBottom: '1rem' }}>
              <h5>Tổng hợp thành phần phiên (Composition):</h5>
              <p>
                Chế độ: <strong>{previewResult.composition.mode}</strong> · Phiên bản gốc kế thừa (Baseline):{' '}
                {previewResult.baseline.timetableVersion ? `Phiên ${previewResult.baseline.timetableVersion.versionNumber}` : 'Không có'}
              </p>
              <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
                <div>Số tiết mới soạn trong tệp: <strong>{previewResult.composition.authoredEntryCount}</strong> tiết</div>
                <div>Số tiết kế thừa từ bản gốc: <strong>{previewResult.composition.carriedForwardEntryCount}</strong> tiết</div>
                <div>Tổng số tiết sau hợp nhất: <strong>{previewResult.composition.finalEntryCount}</strong> tiết</div>
              </div>
            </div>
          )}

          {/* Diff Summary */}
          {previewResult.diff && (
            <div style={{ background: '#ffffff', padding: '1rem', border: '1.5px solid var(--border-card)', borderRadius: '6px', marginBottom: '1rem' }}>
              <h5>Biến động so với phiên bản áp dụng hiện hành (Diff):</h5>
              <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
                <span style={{ color: 'var(--success)', fontWeight: 600 }}>Thêm mới: +{previewResult.diff.counts.added}</span>
                <span style={{ color: '#2563eb', fontWeight: 600 }}>Thay đổi: ~{previewResult.diff.counts.changed}</span>
                <span style={{ color: 'var(--danger)', fontWeight: 600 }}>Bị xóa: -{previewResult.diff.counts.removed}</span>
                <span style={{ color: '#64748b' }}>Không đổi: ={previewResult.diff.counts.unchanged}</span>
              </div>
            </div>
          )}

          {/* Mismatch & Issues List */}
          {previewResult.issues.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <h4>Danh sách các vấn đề / sai lệch đối soát ({previewResult.issues.length})</h4>
              <DataTable
                label="Bảng các vấn đề đối soát thời khóa biểu"
                headings={['Mức độ', 'Mã lỗi', 'Vị trí dòng', 'Mô tả chi tiết']}
              >
                {previewResult.issues.map((iss, idx) => (
                  <tr key={idx}>
                    <td>
                      <span className={`status-badge status-badge--${iss.severity === 'ERROR' ? 'error' : iss.severity === 'WARNING' ? 'warning' : 'inactive'}`}>
                        {iss.severity}
                      </span>
                    </td>
                    <td><code className="technical-value">{iss.code}</code></td>
                    <td>
                      {iss.sourceRowNumber ? `Dòng ${iss.sourceRowNumber}` : 'Toàn tệp'}
                    </td>
                    <td>{iss.message}</td>
                  </tr>
                ))}
              </DataTable>
            </div>
          )}

          {/* Confirm Action Box */}
          <div style={{ background: '#f8fafc', padding: '1.25rem', borderRadius: '6px', border: '1.5px solid var(--border-card)' }}>
            <h4>Xác nhận nạp thời khóa biểu vào hệ thống</h4>
            <p>
              Thao tác này sẽ tạo hoặc cập nhật một bản ghi thời khóa biểu ở trạng thái <strong>Bản nháp (DRAFT)</strong>. Hệ thống <strong>không tự ý kích hoạt</strong> phiên bản này vào thực tế giảng dạy.
            </p>
            <div style={{ maxWidth: '480px', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}>
                  <FormField
                    id="idempotency-key"
                    name="idempotency-key"
                    label="Khóa thao tác chống trùng lặp (Idempotency Key)"
                    value={idempotencyKey}
                    readOnly
                    hint="Khóa duy nhất tự sinh cho phiên đối soát này để bảo vệ chống gửi trùng lặp."
                  />
                </div>
                <Button
                  type="button"
                  variant="quiet"
                  onClick={() => {
                    void navigator.clipboard?.writeText(idempotencyKey);
                  }}
                  title="Sao chép khóa"
                  style={{ marginBottom: '1.25rem' }}
                >
                  Sao chép
                </Button>
              </div>
            </div>
            <Button
              type="button"
              variant="primary"
              loading={confirmMutation.isPending}
              disabled={!isPreviewMatching || !previewResult.canConfirm || previewResult.blockingIssueCount > 0}
              onClick={() => {
                setErrorNotice(null);
                confirmMutation.mutate();
              }}
            >
              Xác nhận nạp vào bản nháp (Confirm Import)
            </Button>
          </div>
        </section>
      )}
    </section>
  );
}

// =========================================================================
// TAB 3: KHUNG TIẾT HỌC (TIME SLOTS DEFINITIONS)
// =========================================================================

function TimeSlotsTab({ academicYearId }: { academicYearId: string }) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [weekdayFilter, setWeekdayFilter] = useState<AcademicWeekday | ''>('');
  const [sessionFilter, setSessionFilter] = useState<TimeSlotSession | ''>('');
  const [isActiveFilter, setIsActiveFilter] = useState<string>('');

  const [createOpen, setCreateOpen] = useState(false);
  const [reviseSlot, setReviseSlot] = useState<TimeSlotDefinitionRecord | null>(null);
  const [retireSlot, setRetireSlot] = useState<TimeSlotDefinitionRecord | null>(null);

  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // Time slot form state
  const [slotWeekday, setSlotWeekday] = useState<AcademicWeekday>('MONDAY');
  const [slotSession, setSlotSession] = useState<TimeSlotSession>('MORNING');
  const [slotOrdinal, setSlotOrdinal] = useState(1);
  const [slotLabel, setSlotLabel] = useState('Tiết 1');
  const [slotStartTime, setSlotStartTime] = useState('07:00');
  const [slotEndTime, setSlotEndTime] = useState('07:45');
  const [slotRegular, setSlotRegular] = useState(true);
  const [slotMakeup, setSlotMakeup] = useState(false);
  const [slotSelfStudy, setSlotSelfStudy] = useState(false);

  // Query time slots
  const slotsQuery = useQuery({
    queryKey: ['time-slots', academicYearId, page, weekdayFilter, sessionFilter, isActiveFilter],
    queryFn: () =>
      timeSlotsApi.list(academicYearId, {
        page,
        pageSize: 20,
        weekday: weekdayFilter || undefined,
        session: sessionFilter || undefined,
        isActive: isActiveFilter === '' ? undefined : isActiveFilter === 'true',
      }),
  });

  // Create Slot Mutation
  const createMutation = useMutation({
    mutationFn: (input: CreateTimeSlotInput) => timeSlotsApi.create(academicYearId, input),
    onSuccess: (created) => {
      setSuccessNotice(`Đã tạo khung tiết mới: ${created.displayLabel} (${created.startTime} – ${created.endTime}).`);
      setCreateOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['time-slots', academicYearId] });
    },
    onError: (err) => setErrorNotice(errorText(err)),
  });

  // Revise Slot Mutation
  const reviseMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: ReviseTimeSlotInput }) => {
      if (reviseSlot && reviseSlot.academicYearId && reviseSlot.academicYearId !== academicYearId) {
        throw new Error('Khung tiết không thuộc niên khóa đang chọn. Thao tác đã bị hủy để tránh sai lệch dữ liệu.');
      }
      return timeSlotsApi.revise(id, input);
    },
    onSuccess: (result) => {
      setSuccessNotice(`Đã cập nhật khung tiết thành phiên bản revision ${result.replacement.revision}. Phiên bản cũ đã được lưu trữ lịch sử.`);
      setReviseSlot(null);
      void queryClient.invalidateQueries({ queryKey: ['time-slots', academicYearId] });
    },
    onError: (err) => setErrorNotice(errorText(err)),
  });

  // Retire Slot Mutation
  const retireMutation = useMutation({
    mutationFn: (id: string) => {
      if (retireSlot && retireSlot.academicYearId && retireSlot.academicYearId !== academicYearId) {
        throw new Error('Khung tiết không thuộc niên khóa đang chọn. Thao tác đã bị hủy để tránh sai lệch dữ liệu.');
      }
      return timeSlotsApi.retire(id);
    },
    onSuccess: (retired) => {
      setSuccessNotice(`Đã ngưng sử dụng tiết ${retired.displayLabel}. Toàn bộ lịch sử các phiên trước vẫn được giữ nguyên.`);
      setRetireSlot(null);
      void queryClient.invalidateQueries({ queryKey: ['time-slots', academicYearId] });
    },
    onError: (err) => setErrorNotice(errorText(err)),
  });

  const slots = slotsQuery.data?.items ?? [];

  return (
    <section className="workspace-section" aria-labelledby="slots-heading">
      <div className="section-heading">
        <div>
          <p className="utility-label">Khung giờ dạy học</p>
          <h2 id="slots-heading">Quản trị Khung tiết học</h2>
          <p>
            Định nghĩa giờ bắt đầu, kết thúc và mục đích sử dụng (chính khóa, dạy bù, tự học) của từng tiết học theo thứ và buổi. Khung tiết áp dụng cơ chế lịch sử bất biến: chỉnh sửa sẽ tạo phiên bản mới (<code className="technical-value">revision</code>).
          </p>
        </div>
        <div className="row-actions">
          <Button
            type="button"
            onClick={() => {
              setCreateOpen(true);
              setReviseSlot(null);
              setRetireSlot(null);
              setErrorNotice(null);
              setSuccessNotice(null);
            }}
          >
            Tạo tiết học mới
          </Button>
        </div>
      </div>

      <MutationNotice error={errorNotice ? new Error(errorNotice) : undefined} success={successNotice ?? undefined} />

      {/* Filter toolbar */}
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap', marginBlock: '0.5rem 1rem' }}>
        <div style={{ minWidth: '160px' }}>
          <SelectField
            id="slot-weekday-filter"
            label="Thứ trong tuần"
            value={weekdayFilter}
            onChange={(e) => {
              setWeekdayFilter(e.target.value as AcademicWeekday | '');
              setPage(1);
            }}
          >
            <option value="">Tất cả các ngày</option>
            {WEEKDAYS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </SelectField>
        </div>

        <div style={{ minWidth: '150px' }}>
          <SelectField
            id="slot-session-filter"
            label="Buổi học"
            value={sessionFilter}
            onChange={(e) => {
              setSessionFilter(e.target.value as TimeSlotSession | '');
              setPage(1);
            }}
          >
            <option value="">Tất cả các buổi</option>
            {SESSIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </SelectField>
        </div>

        <div style={{ minWidth: '160px' }}>
          <SelectField
            id="slot-active-filter"
            label="Trạng thái"
            value={isActiveFilter}
            onChange={(e) => {
              setIsActiveFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Tất cả</option>
            <option value="true">Đang áp dụng</option>
            <option value="false">Đã ngưng</option>
          </SelectField>
        </div>
      </div>

      {/* Create Slot Form */}
      {createOpen && (
        <form
          className="long-form"
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate({
              weekday: slotWeekday,
              session: slotSession,
              ordinal: Number(slotOrdinal),
              displayLabel: slotLabel.trim(),
              startTime: slotStartTime,
              endTime: slotEndTime,
              allowRegularTeaching: slotRegular,
              allowMakeupTeaching: slotMakeup,
              allowSelfStudy: slotSelfStudy,
            });
          }}
        >
          <h3>Tạo khung tiết mới</h3>
          <p>
            Chỉ tạo mới khi tọa độ (Thứ, Buổi, Tiết số) chưa từng tồn tại trong niên khóa này. Nếu tọa độ đã có lịch sử, hãy chỉnh sửa phiên bản thay vì tạo mới.
          </p>
          <div className="form-grid">
            <SelectField
              id="new-slot-weekday"
              label="Thứ trong tuần"
              value={slotWeekday}
              onChange={(e) => setSlotWeekday(e.target.value as AcademicWeekday)}
              required
            >
              {WEEKDAYS.map((d) => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </SelectField>

            <SelectField
              id="new-slot-session"
              label="Buổi học"
              value={slotSession}
              onChange={(e) => setSlotSession(e.target.value as TimeSlotSession)}
              required
            >
              {SESSIONS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </SelectField>

            <FormField
              id="new-slot-ordinal"
              name="new-slot-ordinal"
              label="Tiết số (thứ tự)"
              type="number"
              min={1}
              value={String(slotOrdinal)}
              onChange={(e) => setSlotOrdinal(Number(e.target.value))}
              required
            />

            <FormField
              id="new-slot-label"
              name="new-slot-label"
              label="Nhãn hiển thị"
              value={slotLabel}
              onChange={(e) => setSlotLabel(e.target.value)}
              placeholder="Ví dụ: Tiết 1, Tiết 2..."
              required
            />

            <FormField
              id="new-slot-start"
              name="new-slot-start"
              label="Giờ bắt đầu (HH:MM)"
              type="time"
              value={slotStartTime}
              onChange={(e) => setSlotStartTime(e.target.value)}
              required
            />

            <FormField
              id="new-slot-end"
              name="new-slot-end"
              label="Giờ kết thúc (HH:MM)"
              type="time"
              value={slotEndTime}
              onChange={(e) => setSlotEndTime(e.target.value)}
              required
            />
          </div>

          <fieldset className="checkbox-register">
            <legend>Mục đích sử dụng cho phép</legend>
            <label className="check-field">
              <input
                type="checkbox"
                checked={slotRegular}
                onChange={(e) => setSlotRegular(e.target.checked)}
              />{' '}
              Dạy chính khóa
            </label>
            <label className="check-field">
              <input
                type="checkbox"
                checked={slotMakeup}
                onChange={(e) => setSlotMakeup(e.target.checked)}
              />{' '}
              Dạy bù
            </label>
            <label className="check-field">
              <input
                type="checkbox"
                checked={slotSelfStudy}
                onChange={(e) => setSlotSelfStudy(e.target.checked)}
              />{' '}
              Tự học / Khác
            </label>
          </fieldset>

          <div className="form-actions">
            <Button type="submit" loading={createMutation.isPending}>
              Lưu khung tiết mới
            </Button>
            <Button type="button" variant="quiet" onClick={() => setCreateOpen(false)}>
              Hủy
            </Button>
          </div>
        </form>
      )}

      {/* Revise Slot Form */}
      {reviseSlot && (
        <form
          className="long-form"
          onSubmit={(e) => {
            e.preventDefault();
            reviseMutation.mutate({
              id: reviseSlot.id,
              input: {
                displayLabel: slotLabel.trim(),
                startTime: slotStartTime,
                endTime: slotEndTime,
                allowRegularTeaching: slotRegular,
                allowMakeupTeaching: slotMakeup,
                allowSelfStudy: slotSelfStudy,
              },
            });
          }}
        >
          <h3>Chỉnh sửa khung tiết (Tạo revision mới)</h3>
          <p>
            Thao tác này sẽ lưu trữ phiên bản hiện tại (Revision {reviseSlot.revision}) vào lịch sử và tạo Revision {reviseSlot.revision + 1} mới có hiệu lực.
          </p>
          <div className="form-grid">
            <div className="readonly-field">
              <span className="form-field__label">Tọa độ cố định</span>
              <strong>
                {WEEKDAYS.find((d) => d.value === reviseSlot.weekday)?.label} · {SESSIONS.find((s) => s.value === reviseSlot.session)?.label} · Tiết {reviseSlot.ordinal}
              </strong>
            </div>

            <FormField
              id="revise-slot-label"
              name="revise-slot-label"
              label="Nhãn hiển thị"
              value={slotLabel}
              onChange={(e) => setSlotLabel(e.target.value)}
              required
            />

            <FormField
              id="revise-slot-start"
              name="revise-slot-start"
              label="Giờ bắt đầu"
              type="time"
              value={slotStartTime}
              onChange={(e) => setSlotStartTime(e.target.value)}
              required
            />

            <FormField
              id="revise-slot-end"
              name="revise-slot-end"
              label="Giờ kết thúc"
              type="time"
              value={slotEndTime}
              onChange={(e) => setSlotEndTime(e.target.value)}
              required
            />
          </div>

          <fieldset className="checkbox-register">
            <legend>Mục đích sử dụng cho phép</legend>
            <label className="check-field">
              <input
                type="checkbox"
                checked={slotRegular}
                onChange={(e) => setSlotRegular(e.target.checked)}
              />{' '}
              Dạy chính khóa
            </label>
            <label className="check-field">
              <input
                type="checkbox"
                checked={slotMakeup}
                onChange={(e) => setSlotMakeup(e.target.checked)}
              />{' '}
              Dạy bù
            </label>
            <label className="check-field">
              <input
                type="checkbox"
                checked={slotSelfStudy}
                onChange={(e) => setSlotSelfStudy(e.target.checked)}
              />{' '}
              Tự học / Khác
            </label>
          </fieldset>

          <div className="form-actions">
            <Button type="submit" loading={reviseMutation.isPending}>
              Lưu phiên bản thay thế
            </Button>
            <Button type="button" variant="quiet" onClick={() => setReviseSlot(null)}>
              Hủy
            </Button>
          </div>
        </form>
      )}

      {/* Retire confirmation banner */}
      {retireSlot && (
        <div style={{ background: '#fffbeb', border: '1.5px solid #d97706', padding: '1rem', borderRadius: '6px', marginBlock: '1rem' }}>
          <h4>Xác nhận ngưng sử dụng tiết học?</h4>
          <p>
            Bạn có chắc muốn ngưng sử dụng khung tiết <strong>{retireSlot.displayLabel}</strong> ({WEEKDAYS.find((d) => d.value === retireSlot.weekday)?.label}, Tiết {retireSlot.ordinal}, {retireSlot.startTime} – {retireSlot.endTime})?
          </p>
          <p style={{ color: '#64748b', fontSize: '0.9rem' }}>
            Lưu ý: Tiết học sẽ chuyển sang trạng thái ngưng áp dụng. Toàn bộ lịch sử các phiên bản thời khóa biểu trước đây gắn với tiết này vẫn được giữ nguyên vẹn.
          </p>
          <div className="row-actions">
            <Button
              type="button"
              variant="secondary"
              loading={retireMutation.isPending}
              onClick={() => retireMutation.mutate(retireSlot.id)}
            >
              Xác nhận ngưng sử dụng
            </Button>
            <Button type="button" variant="quiet" onClick={() => setRetireSlot(null)}>
              Hủy
            </Button>
          </div>
        </div>
      )}

      {/* Slots Data Table */}
      {slotsQuery.isPending ? (
        <PageLoading />
      ) : slotsQuery.isError ? (
        <QueryFailure error={slotsQuery.error} retry={() => void slotsQuery.refetch()} />
      ) : slots.length === 0 ? (
        <EmptyState
          filtered={Boolean(weekdayFilter || sessionFilter || isActiveFilter)}
          title="Chưa có khung tiết nào"
          message="Hãy tạo khung tiết đầu tiên cho năm học này."
        />
      ) : (
        <>
          <DataTable
            label="Bảng danh sách khung tiết học"
            headings={['Thứ / Buổi', 'Tiết', 'Nhãn hiển thị', 'Khung giờ', 'Mục đích', 'Phiên bản', 'Trạng thái', 'Thao tác']}
          >
            {slots.map((slot) => {
              const dayLabel = WEEKDAYS.find((d) => d.value === slot.weekday)?.label ?? slot.weekday;
              const sesLabel = SESSIONS.find((s) => s.value === slot.session)?.label ?? slot.session;
              const purposes = [
                slot.allowRegularTeaching ? 'Chính khóa' : null,
                slot.allowMakeupTeaching ? 'Dạy bù' : null,
                slot.allowSelfStudy ? 'Tự học' : null,
              ].filter(Boolean).join(', ');

              return (
                <tr key={slot.id}>
                  <td>
                    <strong>{dayLabel}</strong>
                    <small className="table-secondary">{sesLabel}</small>
                  </td>
                  <td>Tiết {slot.ordinal}</td>
                  <td><strong>{slot.displayLabel}</strong></td>
                  <td>
                    <code className="technical-value">
                      {slot.startTime} – {slot.endTime}
                    </code>
                  </td>
                  <td>{purposes || '—'}</td>
                  <td>
                    <code className="technical-value">rev {slot.revision}</code>
                  </td>
                  <td>
                    <StatusText active={slot.isActive} activeLabel="Đang áp dụng" inactiveLabel="Đã ngưng" />
                  </td>
                  <td>
                    <div className="row-actions">
                      {slot.isActive ? (
                        <>
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => {
                              setReviseSlot(slot);
                              setSlotLabel(slot.displayLabel);
                              setSlotStartTime(slot.startTime);
                              setSlotEndTime(slot.endTime);
                              setSlotRegular(slot.allowRegularTeaching);
                              setSlotMakeup(slot.allowMakeupTeaching);
                              setSlotSelfStudy(slot.allowSelfStudy);
                              setRetireSlot(null);
                              setCreateOpen(false);
                            }}
                          >
                            Sửa (Revise)
                          </Button>
                          <Button
                            type="button"
                            variant="quiet"
                            onClick={() => {
                              setRetireSlot(slot);
                              setReviseSlot(null);
                              setCreateOpen(false);
                            }}
                          >
                            Ngưng dùng
                          </Button>
                        </>
                      ) : (
                        <span className="table-secondary">Bản ghi lịch sử</span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </DataTable>

          <Pagination
            page={slotsQuery.data?.page ?? 1}
            pageSize={slotsQuery.data?.pageSize ?? 20}
            total={slotsQuery.data?.total ?? 0}
            onPage={setPage}
          />
        </>
      )}
    </section>
  );
}
