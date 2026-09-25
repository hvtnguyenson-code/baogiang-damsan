import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type ChangeEvent } from 'react';
import type {
  GddpWorkbookInspectionResponse,
  GddpWorkbookPreviewResponse,
  HdtnWorkbookInspectionResponse,
  HdtnWorkbookPreviewResponse,
  ProgrammeWorkspaceDetailResponse,
  ProgrammeWorkspaceOccurrence,
} from '@baogiang/contracts';
import { Button } from '../components/ui/button';
import { InlineAlert } from '../components/ui/feedback';
import {
  DataTable,
  EmptyState,
  PageHeader,
  PageLoading,
  QueryFailure,
  SelectField,
} from '../components/ui/management';
import { ApiError } from '../lib/api-client';
import {
  createCommandId,
  programmePlanningApi,
} from '../lib/programme-planning-api';

type WorkflowTab = 'hdtn' | 'gddp' | 'review';

function formatCivilDate(value?: string | null): string {
  if (!value) return '—';
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function scopeLabel(mode: string): string {
  switch (mode) {
    case 'CLASS':
      return 'Theo lớp';
    case 'GRADE':
      return 'Theo khối';
    case 'SCHOOL_WIDE':
      return 'Toàn trường';
    default:
      return mode;
  }
}

function planStatusLabel(status: string): string {
  switch (status) {
    case 'DRAFT':
      return 'Bản nháp';
    case 'PUBLISHED':
      return 'Đã ban hành';
    case 'SUPERSEDED':
      return 'Đã thay thế';
    default:
      return status;
  }
}

function occurrenceStatusLabel(status: string): string {
  switch (status) {
    case 'DRAFT':
      return 'Bản nháp';
    case 'PUBLISHED':
      return 'Đã ban hành';
    case 'CANCELLED':
      return 'Đã hủy';
    case 'SUPERSEDED':
      return 'Đã thay thế';
    default:
      return status;
  }
}

export function SpecialProgrammeWorkspacePage() {
  const queryClient = useQueryClient();

  const [selectedAcademicYearId, setSelectedAcademicYearId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<WorkflowTab>('hdtn');
  const [selectedMasterId, setSelectedMasterId] = useState<string | null>(null);

  // File & import state for HĐTN
  const [hdtnFile, setHdtnFile] = useState<File | null>(null);
  const [hdtnInspectResult, setHdtnInspectResult] = useState<HdtnWorkbookInspectionResponse | null>(null);
  const [hdtnPreviewResult, setHdtnPreviewResult] = useState<HdtnWorkbookPreviewResponse | null>(null);
  const [hdtnConfirmOpen, setHdtnConfirmOpen] = useState(false);

  // File & import state for GDĐP
  const [gddpFile, setGddpFile] = useState<File | null>(null);
  const [gddpGradeLevel, setGddpGradeLevel] = useState<number | undefined>(undefined);
  const [gddpInspectResult, setGddpInspectResult] = useState<GddpWorkbookInspectionResponse | null>(null);
  const [gddpPreviewResult, setGddpPreviewResult] = useState<GddpWorkbookPreviewResponse | null>(null);
  const [gddpConfirmOpen, setGddpConfirmOpen] = useState(false);

  // Dialog & operation states
  const [publishPlanConfirmOpen, setPublishPlanConfirmOpen] = useState(false);
  const [materializeTarget, setMaterializeTarget] = useState<ProgrammeWorkspaceOccurrence | null>(null);

  // Notice states
  const [workflowError, setWorkflowError] = useState<string | null>(null);
  const [workflowSuccess, setWorkflowSuccess] = useState<string | null>(null);

  // Idempotency commandId refs
  const confirmCommandIdRef = useRef<string | null>(null);

  // 1. Query workspace options
  const optionsQuery = useQuery({
    queryKey: ['programme-workspace-options', selectedAcademicYearId],
    queryFn: () => programmePlanningApi.getWorkspaceOptions(selectedAcademicYearId || undefined),
  });

  const academicYears = optionsQuery.data?.academicYears ?? [];
  const masters = optionsQuery.data?.masters ?? [];

  // Effective year
  const effectiveYearId = selectedAcademicYearId || (academicYears.length > 0 ? academicYears[0].id : '');

  // 2. Query workspace detail for selected master
  const detailQuery = useQuery({
    queryKey: ['programme-workspace-detail', selectedMasterId],
    queryFn: () => programmePlanningApi.getWorkspaceMasterDetail(selectedMasterId!),
    enabled: Boolean(selectedMasterId),
  });

  // Mutations
  const inspectMutation = useMutation({
    mutationFn: async ({ kind, file }: { kind: 'hdtn' | 'gddp'; file: File }) => {
      setWorkflowError(null);
      setWorkflowSuccess(null);
      if (kind === 'hdtn') {
        const res = await programmePlanningApi.inspectHdtnWorkbook(file);
        setHdtnInspectResult(res);
        return res;
      } else {
        const res = await programmePlanningApi.inspectGddpWorkbook(file);
        setGddpInspectResult(res);
        return res;
      }
    },
    onError: (err) => {
      const msg = err instanceof ApiError ? err.message : 'Lỗi khi kiểm tra tệp.';
      setWorkflowError(msg);
    },
  });

  const previewMutation = useMutation({
    mutationFn: async ({ kind, file }: { kind: 'hdtn' | 'gddp'; file: File }) => {
      setWorkflowError(null);
      setWorkflowSuccess(null);
      if (kind === 'hdtn') {
        const res = await programmePlanningApi.previewHdtnWorkbook(file, effectiveYearId);
        setHdtnPreviewResult(res);
        return res;
      } else {
        const res = await programmePlanningApi.previewGddpWorkbook(file, effectiveYearId, gddpGradeLevel);
        setGddpPreviewResult(res);
        return res;
      }
    },
    onError: (err) => {
      const msg = err instanceof ApiError ? err.message : 'Lỗi khi xem trước kế hoạch.';
      setWorkflowError(msg);
    },
  });

  const confirmMutation = useMutation({
    mutationFn: async (kind: 'hdtn' | 'gddp') => {
      setWorkflowError(null);
      setWorkflowSuccess(null);
      if (!confirmCommandIdRef.current) {
        confirmCommandIdRef.current = createCommandId();
      }
      const commandId = confirmCommandIdRef.current;

      if (kind === 'hdtn') {
        if (!hdtnFile || !hdtnPreviewResult) throw new Error('Chưa có tệp hoặc kết quả xem trước');
        const res = await programmePlanningApi.confirmHdtnWorkbook(hdtnFile, {
          academicYearId: effectiveYearId,
          expectedPreviewFingerprint: hdtnPreviewResult.previewFingerprint,
          commandId,
        });
        confirmCommandIdRef.current = null;
        return res;
      } else {
        if (!gddpFile || !gddpPreviewResult) throw new Error('Chưa có tệp hoặc kết quả xem trước');
        if (typeof gddpPreviewResult.gradeLevel !== 'number') {
          throw new Error('Chưa xác định được khối lớp từ kết quả xem trước.');
        }
        const res = await programmePlanningApi.confirmGddpWorkbook(gddpFile, {
          academicYearId: effectiveYearId,
          gradeLevel: gddpPreviewResult.gradeLevel,
          expectedPreviewFingerprint: gddpPreviewResult.previewFingerprint,
          commandId,
        });
        confirmCommandIdRef.current = null;
        return res;
      }
    },
    onSuccess: (data) => {
      setWorkflowSuccess(
        `Đã tạo thành công bản nháp kế hoạch (${data.topicItemCount} chủ đề, ${data.occurrenceCount} hoạt động).`,
      );
      setHdtnConfirmOpen(false);
      setGddpConfirmOpen(false);
      setSelectedMasterId(data.programmeMasterId);
      setActiveTab('review');
      void queryClient.invalidateQueries({ queryKey: ['programme-workspace-options'] });
      void queryClient.invalidateQueries({ queryKey: ['programme-workspace-detail', data.programmeMasterId] });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.statusCode === 409) {
        setWorkflowError(
          'Dữ liệu kế hoạch đã thay đổi hoặc phiên bản xem trước không còn hợp lệ. Hãy kiểm tra hoặc xem trước lại.',
        );
      } else {
        const msg = err instanceof ApiError ? err.message : 'Không thể xác nhận tạo bản nháp.';
        setWorkflowError(msg);
      }
    },
  });

  const publishPlanMutation = useMutation({
    mutationFn: async ({ planVersionId, expectedRevision }: { planVersionId: string; expectedRevision: number }) => {
      setWorkflowError(null);
      setWorkflowSuccess(null);
      return programmePlanningApi.publishPlanVersion(planVersionId, {
        expectedRevision,
        commandId: createCommandId(),
      });
    },
    onSuccess: () => {
      setWorkflowSuccess('Đã ban hành kế hoạch thành công.');
      setPublishPlanConfirmOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['programme-workspace-options'] });
      void queryClient.invalidateQueries({ queryKey: ['programme-workspace-detail', selectedMasterId] });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.statusCode === 409) {
        setWorkflowError('Phiên bản kế hoạch đã thay đổi trước khi ban hành. Đang tải lại dữ liệu mới nhất.');
        void queryClient.invalidateQueries({ queryKey: ['programme-workspace-detail', selectedMasterId] });
      } else {
        const msg = err instanceof ApiError ? err.message : 'Không thể ban hành kế hoạch.';
        setWorkflowError(msg);
      }
    },
  });

  const publishOccurrenceMutation = useMutation({
    mutationFn: async ({ occurrenceId, expectedRevision }: { occurrenceId: string; expectedRevision: number }) => {
      setWorkflowError(null);
      setWorkflowSuccess(null);
      return programmePlanningApi.publishOccurrence(occurrenceId, {
        expectedRevision,
        commandId: createCommandId(),
      });
    },
    onSuccess: () => {
      setWorkflowSuccess('Đã ban hành hoạt động thành công.');
      void queryClient.invalidateQueries({ queryKey: ['programme-workspace-detail', selectedMasterId] });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.statusCode === 409) {
        setWorkflowError('Hoạt động đã được cập nhật trước đó. Đang làm mới dữ liệu.');
        void queryClient.invalidateQueries({ queryKey: ['programme-workspace-detail', selectedMasterId] });
      } else {
        const msg = err instanceof ApiError ? err.message : 'Không thể ban hành hoạt động.';
        setWorkflowError(msg);
      }
    },
  });

  const materializeMutation = useMutation({
    mutationFn: async (occurrenceId: string) => {
      setWorkflowError(null);
      setWorkflowSuccess(null);
      return programmePlanningApi.materializeOccurrence(occurrenceId, {
        commandId: createCommandId(),
      });
    },
    onSuccess: () => {
      setWorkflowSuccess('Đã đưa hoạt động vào lịch vận hành thành công.');
      setMaterializeTarget(null);
      void queryClient.invalidateQueries({ queryKey: ['programme-workspace-detail', selectedMasterId] });
    },
    onError: (err) => {
      const msg = err instanceof ApiError ? err.message : 'Không thể đưa hoạt động vào lịch vận hành.';
      setWorkflowError(msg);
    },
  });

  // Handlers
  const handleHdtnFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    setWorkflowError(null);
    setWorkflowSuccess(null);
    setHdtnInspectResult(null);
    setHdtnPreviewResult(null);
    setHdtnConfirmOpen(false);
    confirmCommandIdRef.current = null;
    const file = e.target.files?.[0] ?? null;
    setHdtnFile(file);
  };

  const handleGddpFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    setWorkflowError(null);
    setWorkflowSuccess(null);
    setGddpInspectResult(null);
    setGddpPreviewResult(null);
    setGddpConfirmOpen(false);
    confirmCommandIdRef.current = null;
    const file = e.target.files?.[0] ?? null;
    setGddpFile(file);
  };

  if (optionsQuery.isPending) {
    return <PageLoading />;
  }

  if (optionsQuery.isError) {
    return <QueryFailure error={optionsQuery.error} retry={() => void optionsQuery.refetch()} />;
  }

  return (
    <div className="management-page special-programme-workspace">
      <PageHeader
        eyebrow="QUẢN TRỊ KẾ HOẠCH ĐẶC THÙ"
        title="Kế hoạch HĐTN-HN & GDĐP"
      >
        Nhập tệp kế hoạch, rà soát bản nháp, ban hành kế hoạch và đưa hoạt động vào lịch vận hành.
      </PageHeader>

      {/* Thông báo toàn cục */}
      {workflowError && (
        <InlineAlert title="Lỗi thao tác" tone="error">
          <p>{workflowError}</p>
        </InlineAlert>
      )}
      {workflowSuccess && (
        <InlineAlert title="Thành công" tone="success">
          <p>{workflowSuccess}</p>
        </InlineAlert>
      )}

      {/* A. Chọn năm học */}
      <section className="form-field" style={{ maxWidth: '420px', marginBottom: '24px' }}>
        <SelectField
          label="Năm học"
          id="academic-year-select"
          value={effectiveYearId}
          onChange={(e) => {
            setSelectedAcademicYearId(e.target.value);
            setSelectedMasterId(null);
            setHdtnInspectResult(null);
            setHdtnPreviewResult(null);
            setGddpInspectResult(null);
            setGddpPreviewResult(null);
          }}
        >
          {academicYears.map((year) => (
            <option key={year.id} value={year.id}>
              {year.name} ({year.code})
            </option>
          ))}
        </SelectField>
      </section>

      {/* B. Tab Navigation */}
      <nav className="secondary-nav" aria-label="Luồng nghiệp vụ chương trình đặc thù">
        <button
          type="button"
          className={activeTab === 'hdtn' ? 'active' : ''}
          onClick={() => {
            setActiveTab('hdtn');
            setWorkflowError(null);
          }}
        >
          Hoạt động trải nghiệm, hướng nghiệp (HĐTN-HN)
        </button>
        <button
          type="button"
          className={activeTab === 'gddp' ? 'active' : ''}
          onClick={() => {
            setActiveTab('gddp');
            setWorkflowError(null);
          }}
        >
          Giáo dục địa phương (GDĐP)
        </button>
        <button
          type="button"
          className={activeTab === 'review' ? 'active' : ''}
          onClick={() => {
            setActiveTab('review');
            setWorkflowError(null);
          }}
        >
          Rà soát & Vận hành kế hoạch {selectedMasterId ? '★' : ''}
        </button>
      </nav>

      {/* TAB 1: HĐTN-HN */}
      {activeTab === 'hdtn' && (
        <div className="workspace-section">
          <h2>Nhập kế hoạch Hoạt động trải nghiệm, hướng nghiệp</h2>
          <p className="muted-copy">
            Tải tệp bảng tính Excel (.xlsx) chuẩn quy cách phân công HĐTN-HN để kiểm tra cấu trúc và tạo bản nháp.
          </p>

          <div className="form-section">
            <div className="form-field" style={{ maxWidth: '460px' }}>
              <label className="form-field__label" htmlFor="hdtn-file-input">
                Chọn tệp Excel (.xlsx)
              </label>
              <input
                id="hdtn-file-input"
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={handleHdtnFileChange}
                className="form-field__input"
              />
              <p className="form-field__hint">
                Trạng thái:{' '}
                <strong>{hdtnFile ? `Đã chọn tệp: ${hdtnFile.name}` : 'Chưa chọn tệp'}</strong>
              </p>
            </div>

            <div className="form-actions" style={{ marginTop: '16px' }}>
              <Button
                type="button"
                variant="secondary"
                disabled={!hdtnFile || inspectMutation.isPending}
                loading={inspectMutation.isPending}
                onClick={() => hdtnFile && inspectMutation.mutate({ kind: 'hdtn', file: hdtnFile })}
              >
                Kiểm tra tệp
              </Button>
              <Button
                type="button"
                variant="primary"
                disabled={
                  !hdtnFile ||
                  previewMutation.isPending ||
                  (hdtnInspectResult && !hdtnInspectResult.dataSheetFound) ||
                  (hdtnInspectResult?.issues.some((i) => i.severity === 'BLOCKER') ?? false)
                }
                loading={previewMutation.isPending}
                onClick={() => hdtnFile && previewMutation.mutate({ kind: 'hdtn', file: hdtnFile })}
              >
                Xem trước kế hoạch
              </Button>
            </div>
          </div>

          {/* HĐTN Inspect Result */}
          {hdtnInspectResult && (
            <section className="repeat-item" aria-labelledby="hdtn-inspect-heading" style={{ marginTop: '24px' }}>
              <h3 id="hdtn-inspect-heading">Kết quả kiểm tra tệp</h3>
              <p>Tệp: <strong>{hdtnInspectResult.sourceFileName}</strong></p>
              <p>
                Trang dữ liệu hợp lệ:{' '}
                <strong>{hdtnInspectResult.dataSheetFound ? 'Đã tìm thấy trang dữ liệu' : 'Chưa tìm thấy trang dữ liệu chuẩn'}</strong>
              </p>

              <h4>Các trang tính trong tệp:</h4>
              <ul style={{ paddingLeft: '20px' }}>
                {hdtnInspectResult.sheets.map((s) => (
                  <li key={s.name}>
                    <strong>{s.name}</strong>: {s.rowCount} dòng, {s.columnCount} cột{' '}
                    {s.isDataSheet ? '(Trang dữ liệu chính)' : ''}
                    {s.headers.length > 0 && (
                      <small className="table-secondary">Tiêu đề cột: {s.headers.join(' | ')}</small>
                    )}
                  </li>
                ))}
              </ul>

              {hdtnInspectResult.issues.length > 0 && (
                <div style={{ marginTop: '16px' }}>
                  <h4>Vấn đề phát hiện khi kiểm tra tệp:</h4>
                  {renderIssues(hdtnInspectResult.issues)}
                </div>
              )}
            </section>
          )}

          {/* HĐTN Preview Result */}
          {hdtnPreviewResult && (
            <section className="repeat-item" aria-labelledby="hdtn-preview-heading" style={{ marginTop: '24px' }}>
              <h3 id="hdtn-preview-heading">Xem trước kế hoạch HĐTN-HN</h3>
              <dl className="register-summary" style={{ marginBlock: '12px 16px' }}>
                <div>
                  <dt>Tệp nguồn</dt>
                  <dd>{hdtnPreviewResult.sourceFileName}</dd>
                </div>
                <div>
                  <dt>Trang tính</dt>
                  <dd>{hdtnPreviewResult.sheetName}</dd>
                </div>
                <div>
                  <dt>Tổng số hoạt động dự kiến</dt>
                  <dd>{hdtnPreviewResult.totalRows}</dd>
                </div>
                <div>
                  <dt>Điều kiện tạo bản nháp</dt>
                  <dd>
                    {hdtnPreviewResult.canConfirm ? (
                      <span className="status-cue status-cue--ok">Đủ điều kiện tạo bản nháp</span>
                    ) : (
                      <span className="status-cue status-cue--error">Cần xử lý các lỗi trước khi xác nhận</span>
                    )}
                  </dd>
                </div>
              </dl>

              {hdtnPreviewResult.issues.length > 0 && (
                <div style={{ marginBlock: '16px' }}>
                  <h4>Vấn đề cần lưu ý:</h4>
                  {renderIssues(hdtnPreviewResult.issues)}
                </div>
              )}

              <h4>Chi tiết các hoạt động xem trước:</h4>
              <DataTable
                label="Bảng xem trước hoạt động HĐTN-HN"
                headings={['Tuần / Ngày', 'Quy mô / Lớp', 'Tiết học', 'Chủ đề', 'Giáo viên phân công']}
              >
                {hdtnPreviewResult.rows.map((row, idx) => (
                  <tr key={idx}>
                    <td>
                      <strong>Tuần {row.weekFrom === row.weekTo ? row.weekFrom : `${row.weekFrom} – ${row.weekTo}`}</strong>
                      {row.slots.length > 0 && (
                        <small className="table-secondary">
                          {formatCivilDate(row.slots[0].civilDate)}
                        </small>
                      )}
                    </td>
                    <td>
                      <strong>{scopeLabel(row.organizingScope)}</strong>
                      {row.targetClassCodes.length > 0 && (
                        <small className="table-secondary">Lớp: {row.targetClassCodes.join(', ')}</small>
                      )}
                      {row.gradeLevel && (
                        <small className="table-secondary">Khối {row.gradeLevel}</small>
                      )}
                    </td>
                    <td>
                      {row.slots.map((s, sIdx) => (
                        <div key={sIdx}>
                          Tiết {s.periodNumber ?? s.timeSlotDefinitionId}
                          {s.startTime && s.endTime && ` (${s.startTime} - ${s.endTime})`}
                        </div>
                      ))}
                    </td>
                    <td>
                      <strong>{row.topicTitle}</strong>
                    </td>
                    <td>
                      {row.resolvedTeachers.length > 0 ? (
                        row.resolvedTeachers.map((t) => (
                          <div key={t.matchedUserId}>
                            {t.displayName}
                            {t.staffCode && <small className="table-secondary"> ({t.staffCode})</small>}
                          </div>
                        ))
                      ) : (
                        <span className="muted-copy">{row.enteredTeacherText || 'Chưa xác định'}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </DataTable>

              {/* Confirm Dialog / Panel */}
              <div style={{ marginTop: '24px', borderTop: '1px solid #c9d4da', paddingTop: '16px' }}>
                {!hdtnConfirmOpen ? (
                  <Button
                    type="button"
                    variant="primary"
                    disabled={!hdtnPreviewResult.canConfirm || confirmMutation.isPending}
                    onClick={() => setHdtnConfirmOpen(true)}
                  >
                    Xác nhận tạo bản nháp
                  </Button>
                ) : (
                  <div className="decision-confirm" role="region" aria-label="Xác nhận tạo bản nháp kế hoạch HĐTN-HN">
                    <h3>Xác nhận tạo bản nháp kế hoạch</h3>
                    <p style={{ fontWeight: 600 }}>Lưu ý quan trọng trước khi xác nhận:</p>
                    <ul style={{ paddingLeft: '20px', marginBlock: '8px 16px' }}>
                      <li>Thao tác này chỉ tạo <strong>BẢN NHÁP</strong> kế hoạch trong hệ thống;</li>
                      <li>Chưa ban hành kế hoạch chính thức;</li>
                      <li>Chưa đưa vào lịch hoạt động chính thức của nhà trường;</li>
                      <li>Chưa ghi nhận các tiết đã thực hiện;</li>
                      <li>Chưa phát sinh định mức hoặc khối lượng công việc cho giáo viên.</li>
                    </ul>
                    <div className="form-actions">
                      <Button
                        type="button"
                        variant="primary"
                        loading={confirmMutation.isPending}
                        onClick={() => confirmMutation.mutate('hdtn')}
                      >
                        Xác nhận lưu bản nháp
                      </Button>
                      <Button
                        type="button"
                        variant="quiet"
                        disabled={confirmMutation.isPending}
                        onClick={() => setHdtnConfirmOpen(false)}
                      >
                        Hủy
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}
        </div>
      )}

      {/* TAB 2: GDĐP */}
      {activeTab === 'gddp' && (
        <div className="workspace-section">
          <h2>Nhập kế hoạch Giáo dục địa phương</h2>
          <p className="muted-copy">
            Tải tệp bảng tính Excel (.xlsx) chuẩn quy cách GDĐP để kiểm tra cấu trúc và tạo bản nháp kế hoạch theo khối.
          </p>

          <div className="form-section">
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 1fr) minmax(200px, 1fr)', gap: '16px', alignItems: 'start' }}>
              <div className="form-field">
                <label className="form-field__label" htmlFor="gddp-file-input">
                  Chọn tệp Excel (.xlsx)
                </label>
                <input
                  id="gddp-file-input"
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={handleGddpFileChange}
                  className="form-field__input"
                />
                <p className="form-field__hint">
                  Trạng thái:{' '}
                  <strong>{gddpFile ? `Đã chọn tệp: ${gddpFile.name}` : 'Chưa chọn tệp'}</strong>
                </p>
              </div>

              <div className="form-field">
                <SelectField
                  label="Khối lớp (tùy chọn / để trống để tự nhận diện)"
                  id="gddp-grade-select"
                  value={gddpGradeLevel === undefined ? '' : String(gddpGradeLevel)}
                  onChange={(e) => {
                    const val = e.target.value;
                    setGddpGradeLevel(val ? Number(val) : undefined);
                  }}
                >
                  <option value="">Tự động nhận diện từ tệp</option>
                  <option value="10">Khối 10</option>
                  <option value="11">Khối 11</option>
                  <option value="12">Khối 12</option>
                </SelectField>
              </div>
            </div>

            <div className="form-actions" style={{ marginTop: '16px' }}>
              <Button
                type="button"
                variant="secondary"
                disabled={!gddpFile || inspectMutation.isPending}
                loading={inspectMutation.isPending}
                onClick={() => gddpFile && inspectMutation.mutate({ kind: 'gddp', file: gddpFile })}
              >
                Kiểm tra tệp
              </Button>
              <Button
                type="button"
                variant="primary"
                disabled={
                  !gddpFile ||
                  previewMutation.isPending ||
                  (gddpInspectResult && !gddpInspectResult.dataSheetFound) ||
                  (gddpInspectResult?.issues.some((i) => i.severity === 'BLOCKER') ?? false)
                }
                loading={previewMutation.isPending}
                onClick={() => gddpFile && previewMutation.mutate({ kind: 'gddp', file: gddpFile })}
              >
                Xem trước kế hoạch
              </Button>
            </div>
          </div>

          {/* GDĐP Inspect Result */}
          {gddpInspectResult && (
            <section className="repeat-item" aria-labelledby="gddp-inspect-heading" style={{ marginTop: '24px' }}>
              <h3 id="gddp-inspect-heading">Kết quả kiểm tra tệp GDĐP</h3>
              <p>Tệp: <strong>{gddpInspectResult.sourceFileName}</strong></p>
              <p>
                Trang dữ liệu hợp lệ:{' '}
                <strong>{gddpInspectResult.dataSheetFound ? 'Đã tìm thấy trang dữ liệu' : 'Chưa tìm thấy trang dữ liệu chuẩn'}</strong>
              </p>

              <h4>Các trang tính trong tệp:</h4>
              <ul style={{ paddingLeft: '20px' }}>
                {gddpInspectResult.sheets.map((s) => (
                  <li key={s.name}>
                    <strong>{s.name}</strong>: {s.rowCount} dòng, {s.columnCount} cột{' '}
                    {s.isDataSheet ? '(Trang dữ liệu chính)' : ''}
                    {s.headers.length > 0 && (
                      <small className="table-secondary">Tiêu đề cột: {s.headers.join(' | ')}</small>
                    )}
                  </li>
                ))}
              </ul>

              {gddpInspectResult.issues.length > 0 && (
                <div style={{ marginTop: '16px' }}>
                  <h4>Vấn đề phát hiện khi kiểm tra tệp:</h4>
                  {renderIssues(gddpInspectResult.issues)}
                </div>
              )}
            </section>
          )}

          {/* GDĐP Preview Result */}
          {gddpPreviewResult && (
            <section className="repeat-item" aria-labelledby="gddp-preview-heading" style={{ marginTop: '24px' }}>
              <h3 id="gddp-preview-heading">Xem trước kế hoạch Giáo dục địa phương</h3>
              <dl className="register-summary" style={{ marginBlock: '12px 16px' }}>
                <div>
                  <dt>Tệp nguồn</dt>
                  <dd>{gddpPreviewResult.sourceFileName}</dd>
                </div>
                <div>
                  <dt>Khối lớp nhận diện</dt>
                  <dd><strong>Khối {gddpPreviewResult.gradeLevel ?? 'Chưa xác định'}</strong></dd>
                </div>
                <div>
                  <dt>Tổng số hoạt động dự kiến</dt>
                  <dd>{gddpPreviewResult.totalRows}</dd>
                </div>
                <div>
                  <dt>Điều kiện tạo bản nháp</dt>
                  <dd>
                    {gddpPreviewResult.canConfirm ? (
                      <span className="status-cue status-cue--ok">Đủ điều kiện tạo bản nháp</span>
                    ) : (
                      <span className="status-cue status-cue--error">Cần xử lý các lỗi trước khi xác nhận</span>
                    )}
                  </dd>
                </div>
              </dl>

              {gddpPreviewResult.issues.length > 0 && (
                <div style={{ marginBlock: '16px' }}>
                  <h4>Vấn đề cần lưu ý:</h4>
                  {renderIssues(gddpPreviewResult.issues)}
                </div>
              )}

              <h4>Chi tiết các hoạt động xem trước:</h4>
              <DataTable
                label="Bảng xem trước hoạt động GDĐP"
                headings={['Khối / Tuần / Tiết PPCT', 'Ngày & Tiết thời khóa biểu', 'Lớp áp dụng', 'Chủ đề', 'Giáo viên phân công']}
              >
                {gddpPreviewResult.rows.map((row, idx) => (
                  <tr key={idx}>
                    <td>
                      <strong>Khối {row.gradeLevel}</strong>
                      <small className="table-secondary">Tuần: {row.weeksText}</small>
                      <small className="table-secondary">Tiết PPCT: {row.ppctText}</small>
                    </td>
                    <td>
                      {row.slots.map((s, sIdx) => (
                        <div key={sIdx}>
                          {formatCivilDate(s.civilDate)} · Tiết {s.periodNumber ?? '—'}
                          {s.startTime && s.endTime && ` (${s.startTime} - ${s.endTime})`}
                        </div>
                      ))}
                    </td>
                    <td>
                      {row.targetClassCodes.length > 0 ? (
                        <strong>{row.targetClassCodes.join(', ')}</strong>
                      ) : (
                        <span className="muted-copy">Toàn khối</span>
                      )}
                    </td>
                    <td>
                      <strong>{row.topicTitle}</strong>
                      <small className="table-secondary">Số tiết: {row.requiredPeriods}</small>
                    </td>
                    <td>
                      {row.resolvedTeachers.length > 0 ? (
                        row.resolvedTeachers.map((t) => (
                          <div key={t.matchedUserId}>
                            {t.displayName}
                            {t.staffCode && <small className="table-secondary"> ({t.staffCode})</small>}
                          </div>
                        ))
                      ) : (
                        <span className="muted-copy">{row.enteredTeacherText || 'Chưa xác định'}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </DataTable>

              {/* Confirm Dialog / Panel */}
              <div style={{ marginTop: '24px', borderTop: '1px solid #c9d4da', paddingTop: '16px' }}>
                {!gddpConfirmOpen ? (
                  <Button
                    type="button"
                    variant="primary"
                    disabled={!gddpPreviewResult.canConfirm || confirmMutation.isPending}
                    onClick={() => setGddpConfirmOpen(true)}
                  >
                    Xác nhận tạo bản nháp
                  </Button>
                ) : (
                  <div className="decision-confirm" role="region" aria-label="Xác nhận tạo bản nháp kế hoạch GDĐP">
                    <h3>Xác nhận tạo bản nháp kế hoạch</h3>
                    <p style={{ fontWeight: 600 }}>Lưu ý quan trọng trước khi xác nhận:</p>
                    <ul style={{ paddingLeft: '20px', marginBlock: '8px 16px' }}>
                      <li>Thao tác này chỉ tạo <strong>BẢN NHÁP</strong> kế hoạch trong hệ thống;</li>
                      <li>Chưa ban hành kế hoạch chính thức;</li>
                      <li>Chưa đưa vào lịch hoạt động chính thức của nhà trường;</li>
                      <li>Chưa ghi nhận các tiết đã thực hiện;</li>
                      <li>Chưa phát sinh định mức hoặc khối lượng công việc cho giáo viên.</li>
                    </ul>
                    <div className="form-actions">
                      <Button
                        type="button"
                        variant="primary"
                        loading={confirmMutation.isPending}
                        onClick={() => confirmMutation.mutate('gddp')}
                      >
                        Xác nhận lưu bản nháp
                      </Button>
                      <Button
                        type="button"
                        variant="quiet"
                        disabled={confirmMutation.isPending}
                        onClick={() => setGddpConfirmOpen(false)}
                      >
                        Hủy
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}
        </div>
      )}

      {/* TAB 3: Rà soát & Vận hành kế hoạch (Durable Review Flow) */}
      {activeTab === 'review' && (
        <div className="workspace-section">
          <h2>Rà soát & Vận hành kế hoạch</h2>
          <p className="muted-copy">
            Xem xét chi tiết kế hoạch đã lưu trong hệ thống, thực hiện ban hành kế hoạch và đưa các hoạt động vào lịch vận hành.
          </p>

          {/* Danh sách các kế hoạch đã có trong năm học */}
          <div style={{ marginBlock: '16px 24px' }}>
            <h3>Các chương trình đã tạo trong năm học</h3>
            {masters.length === 0 ? (
              <EmptyState
                title="Chưa có chương trình nào"
                message="Hãy chuyển sang tab HĐTN-HN hoặc GDĐP để nhập kế hoạch mới từ tệp Excel."
              />
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
                {masters.map((m) => {
                  const isSelected = m.id === selectedMasterId;
                  return (
                    <div
                      key={m.id}
                      className="repeat-item"
                      style={{
                        borderColor: isSelected ? '#1f4358' : '#c9d4da',
                        background: isSelected ? '#fff' : '#f3f6f7',
                        borderLeftWidth: '6px',
                        cursor: 'pointer',
                      }}
                      onClick={() => setSelectedMasterId(m.id)}
                    >
                      <h4 style={{ margin: 0 }}>{m.label}</h4>
                      <p style={{ margin: '4px 0', fontSize: '0.85rem' }}>
                        {m.kindLabel}
                        {m.gradeLevel ? ` · Khối ${m.gradeLevel}` : ''}
                      </p>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
                        <span className="status-badge status-badge--active">
                          {m.latestVersionNumber ? `Phiên bản v${m.latestVersionNumber}` : 'Chưa có phiên bản'}
                        </span>
                        {m.latestVersionStatus && (
                          <small style={{ fontWeight: 600 }}>{planStatusLabel(m.latestVersionStatus)}</small>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant={isSelected ? 'primary' : 'quiet'}
                        style={{ marginTop: '8px', minHeight: '36px', padding: '4px 10px' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedMasterId(m.id);
                        }}
                      >
                        {isSelected ? 'Đang xem' : 'Chọn xem chi tiết'}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Chi tiết Master được chọn */}
          {selectedMasterId && (
            <div style={{ marginTop: '32px' }}>
              {detailQuery.isPending && <PageLoading />}
              {detailQuery.isError && (
                <QueryFailure error={detailQuery.error} retry={() => void detailQuery.refetch()} />
              )}
              {detailQuery.data && (
                <DurableMasterDetail
                  data={detailQuery.data}
                  publishPlanConfirmOpen={publishPlanConfirmOpen}
                  setPublishPlanConfirmOpen={setPublishPlanConfirmOpen}
                  materializeTarget={materializeTarget}
                  setMaterializeTarget={setMaterializeTarget}
                  isPublishingPlan={publishPlanMutation.isPending}
                  onPublishPlan={(planVersionId, expectedRevision) =>
                    publishPlanMutation.mutate({ planVersionId, expectedRevision })
                  }
                  isPublishingOccurrence={publishOccurrenceMutation.isPending}
                  onPublishOccurrence={(occurrenceId, expectedRevision) =>
                    publishOccurrenceMutation.mutate({ occurrenceId, expectedRevision })
                  }
                  isMaterializingOccurrence={materializeMutation.isPending}
                  onMaterializeOccurrence={(occurrenceId) =>
                    materializeMutation.mutate(occurrenceId)
                  }
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function renderIssues(issues: Array<{ severity: 'BLOCKER' | 'WARNING'; message: string; sourceRowNumber?: number }>) {
  const blockers = issues.filter((i) => i.severity === 'BLOCKER');
  const warnings = issues.filter((i) => i.severity === 'WARNING');

  return (
    <div style={{ display: 'grid', gap: '8px' }}>
      {blockers.map((b, idx) => (
        <div key={`b-${idx}`} className="alert alert--error" style={{ margin: 0 }}>
          <strong>Lỗi cần xử lý{b.sourceRowNumber ? ` (Dòng ${b.sourceRowNumber})` : ''}:</strong> {b.message}
        </div>
      ))}
      {warnings.map((w, idx) => (
        <div key={`w-${idx}`} className="alert alert--warning" style={{ margin: 0 }}>
          <strong>Cảnh báo{w.sourceRowNumber ? ` (Dòng ${w.sourceRowNumber})` : ''}:</strong> {w.message}
        </div>
      ))}
    </div>
  );
}

interface DurableMasterDetailProps {
  data: ProgrammeWorkspaceDetailResponse;
  publishPlanConfirmOpen: boolean;
  setPublishPlanConfirmOpen(open: boolean): void;
  materializeTarget: ProgrammeWorkspaceOccurrence | null;
  setMaterializeTarget(target: ProgrammeWorkspaceOccurrence | null): void;
  isPublishingPlan: boolean;
  onPublishPlan(planVersionId: string, expectedRevision: number): void;
  isPublishingOccurrence: boolean;
  onPublishOccurrence(occurrenceId: string, expectedRevision: number): void;
  isMaterializingOccurrence: boolean;
  onMaterializeOccurrence(occurrenceId: string): void;
}

function DurableMasterDetail({
  data,
  publishPlanConfirmOpen,
  setPublishPlanConfirmOpen,
  materializeTarget,
  setMaterializeTarget,
  isPublishingPlan,
  onPublishPlan,
  isPublishingOccurrence,
  onPublishOccurrence,
  isMaterializingOccurrence,
  onMaterializeOccurrence,
}: DurableMasterDetailProps) {
  const { master, plan, occurrences, lifecycleSummary } = data;

  return (
    <article className="workspace-section" aria-labelledby="durable-detail-title">
      <div className="section-heading">
        <div>
          <p className="utility-label">{master.kindLabel}</p>
          <h3 id="durable-detail-title">{master.label}</h3>
          <p className="muted-copy">
            Năm học: {master.academicYearName} {master.gradeLevel ? `· Khối ${master.gradeLevel}` : ''}
          </p>
        </div>
      </div>

      {/* Thông tin Plan hiện tại */}
      {plan ? (
        <div className="repeat-item" style={{ borderLeftColor: '#1f4358', background: '#fff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h4 style={{ margin: 0 }}>
                Phiên bản kế hoạch: v{plan.versionNumber} ({planStatusLabel(plan.status)})
              </h4>
              {plan.changeReason && (
                <p className="muted-copy" style={{ margin: '4px 0 0' }}>Lý do: {plan.changeReason}</p>
              )}
            </div>

            {plan.status === 'DRAFT' && (
              <div>
                {!publishPlanConfirmOpen ? (
                  <Button
                    type="button"
                    variant="primary"
                    onClick={() => setPublishPlanConfirmOpen(true)}
                  >
                    Ban hành kế hoạch
                  </Button>
                ) : (
                  <div className="decision-confirm" role="region" aria-label="Xác nhận ban hành kế hoạch">
                    <p style={{ fontWeight: 600 }}>Xác nhận ban hành kế hoạch v{plan.versionNumber}:</p>
                    <ul style={{ paddingLeft: '20px', marginBlock: '6px 12px' }}>
                      <li>Sau khi ban hành, kế hoạch này không thể chỉnh sửa trực tiếp.</li>
                      <li>Mọi điều chỉnh sau khi ban hành phải thực hiện thông qua phiên bản kế tiếp hoặc hoạt động thay thế.</li>
                    </ul>
                    <div className="form-actions">
                      <Button
                        type="button"
                        variant="primary"
                        loading={isPublishingPlan}
                        onClick={() => onPublishPlan(plan.id, plan.draftRevision)}
                      >
                        Xác nhận ban hành
                      </Button>
                      <Button
                        type="button"
                        variant="quiet"
                        disabled={isPublishingPlan}
                        onClick={() => setPublishPlanConfirmOpen(false)}
                      >
                        Đóng
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {plan.status === 'PUBLISHED' && (
            <div className="limitation-note" style={{ margin: '16px 0 0' }}>
              <strong>Lưu ý:</strong> Kế hoạch đã ban hành không được sửa trực tiếp. Điều chỉnh phải tạo phiên bản kế tiếp hoặc hoạt động thay thế.
            </div>
          )}
        </div>
      ) : (
        <div className="limitation-note">
          Chưa có phiên bản kế hoạch nào cho chương trình này.
        </div>
      )}

      {/* Lifecycle Summary Tiles */}
      <div className="reporting-counts" style={{ marginBlock: '20px' }}>
        <div>
          <dt>Tổng số hoạt động</dt>
          <dd>{lifecycleSummary.totalOccurrences}</dd>
        </div>
        <div>
          <dt>Đã đưa vào lịch</dt>
          <dd>{lifecycleSummary.materializedOccurrences}</dd>
        </div>
        <div>
          <dt>Đã có xác nhận</dt>
          <dd>{lifecycleSummary.attestedOccurrences}</dd>
        </div>
        <div>
          <dt>Đưa vào lịch toàn bộ</dt>
          <dd style={{ fontSize: '1rem' }}>
            {lifecycleSummary.isFullyMaterialized ? 'Đã hoàn tất' : 'Chưa hoàn tất'}
          </dd>
        </div>
      </div>

      {/* Danh sách chủ đề (Topics) */}
      {plan && plan.topics.length > 0 && (
        <section style={{ marginBlock: '24px 16px' }}>
          <h4>Danh mục chủ đề kế hoạch</h4>
          <ul style={{ paddingLeft: '20px' }}>
            {plan.topics.map((t) => (
              <li key={t.sequence} style={{ paddingBlock: '4px' }}>
                <strong>Chủ đề {t.sequence}: {t.title}</strong> — {t.requiredPeriods} tiết
                {t.guidelineWeekFrom && t.guidelineWeekTo && (
                  <span className="muted-copy"> (Tuần {t.guidelineWeekFrom} – {t.guidelineWeekTo})</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Danh sách hoạt động (Occurrences) */}
      <section style={{ marginTop: '24px' }}>
        <h4>Các hoạt động trong kế hoạch ({occurrences.length})</h4>

        {/* Modal xác nhận Materialize */}
        {materializeTarget && (
          <div
            className="decision-confirm"
            role="region"
            aria-label="Xác nhận đưa hoạt động vào lịch vận hành"
            style={{ marginBlock: '16px 24px', borderLeftWidth: '6px', borderLeftColor: '#1f4358' }}
          >
            <h4>Xác nhận đưa hoạt động vào lịch vận hành</h4>
            <p style={{ fontWeight: 600 }}>Lưu ý nghiệp vụ quan trọng:</p>
            <ul style={{ paddingLeft: '20px', marginBlock: '6px 12px' }}>
              <li>Đây là bước tạo hoạt động vận hành từ kế hoạch đã ban hành;</li>
              <li><strong>KHÔNG</strong> đồng nghĩa hoạt động đã được thực hiện;</li>
              <li><strong>KHÔNG</strong> tự tạo biên bản thực hiện giảng dạy (TeachingExecution);</li>
              <li><strong>KHÔNG</strong> tự tạo chứng thực / xác nhận nghiệp vụ (Attestation);</li>
              <li><strong>KHÔNG</strong> tự sinh định mức hay khối lượng công việc.</li>
            </ul>
            <div className="form-actions">
              <Button
                type="button"
                variant="primary"
                loading={isMaterializingOccurrence}
                onClick={() => onMaterializeOccurrence(materializeTarget.id)}
              >
                Xác nhận đưa vào lịch
              </Button>
              <Button
                type="button"
                variant="quiet"
                disabled={isMaterializingOccurrence}
                onClick={() => setMaterializeTarget(null)}
              >
                Hủy
              </Button>
            </div>
          </div>
        )}

        {occurrences.length === 0 ? (
          <EmptyState
            title="Chưa có hoạt động nào"
            message="Kế hoạch hiện chưa có hoạt động nào được phân công."
          />
        ) : (
          <div style={{ display: 'grid', gap: '16px' }}>
            {occurrences.map((occ, idx) => {
              const canPublishOcc = plan?.status === 'PUBLISHED' && occ.status === 'DRAFT';
              const canMaterialize = occ.status === 'PUBLISHED' && !occ.lifecycleSummary.materialized;

              return (
                <div
                  key={occ.id}
                  className="repeat-item"
                  style={{
                    background: '#fff',
                    borderLeftColor: occ.lifecycleSummary.materialized ? '#246b45' : '#a7462f',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', flexWrap: 'wrap', gap: '12px' }}>
                    <div>
                      <h5 style={{ fontSize: '1.05rem', margin: 0 }}>
                        Hoạt động #{idx + 1}: {formatCivilDate(occ.civilDate)} — {scopeLabel(occ.mode)}
                        {occ.schoolClassCode && ` (Lớp ${occ.schoolClassCode})`}
                        {occ.gradeLevel && !occ.schoolClassCode && ` (Khối ${occ.gradeLevel})`}
                      </h5>
                      {occ.topicTitle && (
                        <p style={{ margin: '4px 0', fontWeight: 600 }}>Chủ đề: {occ.topicTitle}</p>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <span className={`status-badge ${occ.status === 'PUBLISHED' ? 'status-badge--active' : 'status-badge--inactive'}`}>
                        {occurrenceStatusLabel(occ.status)}
                      </span>
                      {occ.lifecycleSummary.materialized ? (
                        <span className="status-badge status-badge--active">Đã đưa vào lịch</span>
                      ) : (
                        <span className="status-badge status-badge--inactive">Chưa đưa vào lịch</span>
                      )}
                      {occ.lifecycleSummary.activeAttestationCount > 0 && (
                        <span className="status-badge status-badge--active">Đã xác nhận thực hiện</span>
                      )}
                    </div>
                  </div>

                  {/* Tiết học & giáo viên */}
                  <div style={{ marginBlock: '8px' }}>
                    <strong>Tiết học & phân công:</strong>
                    {occ.slots.length === 0 ? (
                      <p className="muted-copy" style={{ margin: 0 }}>Chưa phân công tiết học</p>
                    ) : (
                      <ul style={{ paddingLeft: '20px', margin: '4px 0' }}>
                        {occ.slots.map((slot, sIdx) => (
                          <li key={sIdx}>
                            Tiết: <strong>{slot.periodNumber ? `Tiết ${slot.periodNumber}` : `Tiết ${sIdx + 1}`}</strong>
                            {slot.startTime && slot.endTime && ` (${slot.startTime} – ${slot.endTime})`}
                            {' — Giáo viên: '}
                            {slot.staffing.length > 0 ? (
                              slot.staffing.map((teacher, tIdx) => (
                                <span key={tIdx}>
                                  <strong>{teacher.displayName}</strong>
                                  {teacher.staffCode && ` (${teacher.staffCode})`}
                                  {tIdx < slot.staffing.length - 1 ? ', ' : ''}
                                </span>
                              ))
                            ) : (
                              <span className="muted-copy">Chưa có giáo viên</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {occ.note && (
                    <p className="muted-copy" style={{ margin: '4px 0' }}>Ghi chú: {occ.note}</p>
                  )}

                  {/* Thao tác cho từng occurrence */}
                  <div className="row-actions" style={{ marginTop: '12px' }}>
                    {canPublishOcc && (
                      <Button
                        type="button"
                        variant="secondary"
                        loading={isPublishingOccurrence}
                        onClick={() => onPublishOccurrence(occ.id, occ.draftRevision)}
                      >
                        Ban hành hoạt động
                      </Button>
                    )}
                    {canMaterialize && (
                      <Button
                        type="button"
                        variant="primary"
                        onClick={() => setMaterializeTarget(occ)}
                      >
                        Đưa vào lịch hoạt động
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </article>
  );
}
