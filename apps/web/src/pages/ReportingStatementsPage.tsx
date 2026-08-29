import type { CivilDateString, ReportingStatementPreviewResponse, ReportingStatementSubmitRequest } from '@baogiang/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { ReportingCountsView, ReportingEvidenceTable, StatementListTable } from '../components/reporting-statements/ReportingPresentation';
import { Button } from '../components/ui/button';
import { InlineAlert } from '../components/ui/feedback';
import { EmptyState, PageHeader, PageLoading, Pagination, QueryFailure, SelectField } from '../components/ui/management';
import { FormField } from '../components/ui/form-field';
import { ApiError } from '../lib/api-client';
import { canOpenReportingDetail, canReadPersonalReporting, canSubmitPersonalReporting } from '../lib/capabilities';
import { createReportingStatementRequestKey, reportingStatementsApi } from '../lib/reporting-statements-api';
import { displayReference, makeReportingLabels } from '../lib/reporting-statement-presentation';

type PreviewState = { fingerprint: string; data: ReportingStatementPreviewResponse };
type PendingSubmitCommand = ReportingStatementSubmitRequest;

const PAGE_SIZE = 10;
const canonicalDatePattern = /^\d{4}-\d{2}-\d{2}$/;

function dateError(value: string, label: string, min?: string, max?: string): string | undefined {
  if (!value) return `${label} là bắt buộc.`;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!canonicalDatePattern.test(value) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return `${label} không đúng định dạng ngày.`;
  if (min && value < min) return `${label} phải từ ${min} trở đi.`;
  if (max && value > max) return `${label} không được sau ${max}.`;
  return undefined;
}

export function ReportingStatementsPage() {
  const auth = useAuth();
  const capabilities = auth.auth?.capabilities ?? [];
  const canSubmit = canSubmitPersonalReporting(capabilities);
  const canReadMine = canReadPersonalReporting(capabilities);
  const canOpenDetail = canOpenReportingDetail(capabilities);
  const queryClient = useQueryClient();
  const [academicYearId, setAcademicYearId] = useState('');
  const [fromCivilDate, setFromCivilDate] = useState('');
  const [toCivilDate, setToCivilDate] = useState('');
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [pendingSubmit, setPendingSubmit] = useState<PendingSubmitCommand | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<{ revisionId: string; replay: boolean } | null>(null);
  const [attemptedPreview, setAttemptedPreview] = useState(false);
  const [page, setPage] = useState(1);

  const contextQuery = useQuery({ queryKey: ['reporting-workspace-context'], queryFn: () => reportingStatementsApi.workspaceContext() });
  useEffect(() => {
    if (!academicYearId && contextQuery.data?.academicYears.length === 1) setAcademicYearId(contextQuery.data.academicYears[0].id);
  }, [academicYearId, contextQuery.data]);

  const selectedContextQuery = useQuery({
    queryKey: ['reporting-workspace-context', academicYearId],
    queryFn: () => reportingStatementsApi.workspaceContext(academicYearId),
    enabled: Boolean(academicYearId),
  });
  const selected = selectedContextQuery.data?.selectedAcademicYear ?? null;
  const calendar = selected?.activeCalendar ?? null;
  const labels = useMemo(() => makeReportingLabels(selected?.schoolClasses ?? [], selected?.subjects ?? []), [selected]);
  const academicYearLabels = useMemo(() => new Map((contextQuery.data?.academicYears ?? []).map((year) => [year.id, `${year.name} (${year.code})`])), [contextQuery.data]);
  const fingerprint = `${academicYearId}|${fromCivilDate}|${toCivilDate}`;
  const currentPreview = preview?.fingerprint === fingerprint ? preview.data : null;

  const fromError = dateError(fromCivilDate, 'Từ ngày', calendar?.startDate, calendar?.endDate);
  const toError = dateError(toCivilDate, 'Đến ngày', calendar?.startDate, calendar?.endDate);
  const rangeError = !fromError && !toError && fromCivilDate > toCivilDate ? 'Từ ngày phải trước hoặc bằng Đến ngày.' : undefined;
  const formValid = Boolean(academicYearId && calendar && !fromError && !toError && !rangeError);

  const previewMutation = useMutation({
    mutationFn: () => reportingStatementsApi.preview({ academicYearId, fromCivilDate: fromCivilDate as CivilDateString, toCivilDate: toCivilDate as CivilDateString }),
    onSuccess: (data) => setPreview({ fingerprint, data }),
  });

  const submitMutation = useMutation({
    mutationFn: (command: PendingSubmitCommand) => reportingStatementsApi.submit(command),
    onSuccess: (result) => {
      setPendingSubmit(null);
      setSubmitSuccess({ revisionId: result.revisionId, replay: result.replay });
      void queryClient.invalidateQueries({ queryKey: ['reporting-statements-mine'] });
    },
    onError: (error) => {
      const status = error instanceof ApiError ? error.statusCode : 0;
      if (status === 409) {
        setPendingSubmit(null);
        setPreview(null);
        void queryClient.invalidateQueries({ queryKey: ['reporting-statements-mine'] });
      } else if (status !== 0 && status < 500) {
        setPendingSubmit(null);
      }
    },
  });

  const invalidateCommandState = () => {
    setPreview(null);
    setPendingSubmit(null);
    setSubmitSuccess(null);
    setAttemptedPreview(false);
    previewMutation.reset();
    submitMutation.reset();
  };

  const mineQuery = useQuery({
    queryKey: ['reporting-statements-mine', page],
    queryFn: () => reportingStatementsApi.listMine({ page, pageSize: PAGE_SIZE }),
    enabled: canReadMine,
  });

  if (contextQuery.isLoading) return <PageLoading />;
  if (contextQuery.isError) return <QueryFailure error={contextQuery.error} retry={() => void contextQuery.refetch()} />;

  const startSubmit = () => {
    if (pendingSubmit || submitMutation.isPending || uncertainSubmit || submitSuccess) return;
    const command: PendingSubmitCommand = { academicYearId, fromCivilDate: fromCivilDate as CivilDateString, toCivilDate: toCivilDate as CivilDateString, requestKey: createReportingStatementRequestKey() };
    setPendingSubmit(command);
    setSubmitSuccess(null);
    submitMutation.mutate(command);
  };
  const uncertainSubmit = submitMutation.error instanceof ApiError
    ? submitMutation.error.statusCode === 0 || submitMutation.error.statusCode >= 500
    : Boolean(submitMutation.error);

  return <div className="reporting-page">
    <PageHeader eyebrow="Sổ công tác" title="Báo cáo kê khai cá nhân">Xem trước sự thật báo cáo, kiểm tra bằng chứng rồi gửi một bản chính thức.</PageHeader>

    {canSubmit && <section className="reporting-form" aria-labelledby="reporting-range-heading">
      <div className="reporting-section-heading"><div className="margin-rail" aria-hidden="true" /><div><h2 id="reporting-range-heading">01 · Chọn phạm vi báo cáo</h2><p>Bản xem trước chỉ được lập khi bạn yêu cầu và không tự cập nhật theo từng lần đổi ngày.</p></div></div>
      <div className="reporting-form__fields">
        <SelectField label="Năm học" id="reporting-academic-year" value={academicYearId} onChange={(event) => { setAcademicYearId(event.target.value); setFromCivilDate(''); setToCivilDate(''); invalidateCommandState(); }}>
          <option value="">Chọn năm học</option>
          {(contextQuery.data?.academicYears ?? []).map((year) => <option key={year.id} value={year.id}>{year.name} ({year.code})</option>)}
        </SelectField>
        <FormField label="Từ ngày" name="fromCivilDate" type="date" value={fromCivilDate} min={calendar?.startDate} max={calendar?.endDate} disabled={!calendar} error={attemptedPreview || fromCivilDate ? fromError ?? rangeError : undefined} onChange={(event) => { setFromCivilDate(event.target.value); invalidateCommandState(); }} />
        <FormField label="Đến ngày" name="toCivilDate" type="date" value={toCivilDate} min={calendar?.startDate} max={calendar?.endDate} disabled={!calendar} error={attemptedPreview || toCivilDate ? toError : undefined} onChange={(event) => { setToCivilDate(event.target.value); invalidateCommandState(); }} />
      </div>
      {academicYearId && selectedContextQuery.isLoading && <p role="status">Đang tải lịch và danh mục năm học…</p>}
      {academicYearId && selectedContextQuery.isError && <QueryFailure error={selectedContextQuery.error} retry={() => void selectedContextQuery.refetch()} />}
      {selected && !calendar && <InlineAlert title="Chưa có lịch đang hoạt động" tone="warning">Năm học này chưa có lịch đang hoạt động nên chưa thể xem trước báo cáo.</InlineAlert>}
      {calendar && <p className="calendar-envelope">Khoảng ngày của lịch đang hoạt động: <span className="technical-value">{calendar.startDate} – {calendar.endDate}</span></p>}
      <Button type="button" disabled={!academicYearId || !calendar} loading={previewMutation.isPending} onClick={() => { setAttemptedPreview(true); if (formValid) previewMutation.mutate(); }}>Xem trước báo cáo</Button>
      {previewMutation.isError && <InlineAlert title="Chưa thể xem trước báo cáo">{previewMutation.error instanceof ApiError ? previewMutation.error.message : 'Kết nối đang gián đoạn. Hãy thử lại.'}</InlineAlert>}
    </section>}

    {currentPreview && <section className="reporting-preview" aria-labelledby="reporting-preview-heading">
      <div className="reporting-section-heading"><div className="margin-rail" aria-hidden="true" /><div><h2 id="reporting-preview-heading">02 · Bằng chứng xem trước</h2><p>Dữ liệu này phục vụ kiểm tra trước khi gửi, chưa phải bản chính thức đã lưu.</p></div></div>
      {currentPreview.responsibilityState === 'ZERO_RESPONSIBILITY' && <InlineAlert title="Không có trách nhiệm trong kỳ" tone="success">Không có trách nhiệm giảng dạy thuộc phạm vi báo cáo trong khoảng thời gian này.</InlineAlert>}
      {currentPreview.status === 'BLOCKED' && <InlineAlert title="Chưa thể lập báo cáo từ dữ liệu hiện tại"><ul>{currentPreview.findings.map((finding, index) => <li key={index}>{finding.message}</li>)}</ul></InlineAlert>}
      {currentPreview.counts && <ReportingCountsView counts={currentPreview.counts} />}
      {currentPreview.sections.map((section) => <article className="reporting-evidence-section" key={`${section.schoolClassId}-${section.subjectId}`}>
        <header><h3>{displayReference(section.schoolClassId, labels.classes, 'class')} · {displayReference(section.subjectId, labels.subjects, 'subject')}</h3><p>Tên lớp và môn lấy từ danh mục hiện tại để hiển thị; khoảng trách nhiệm là kết quả của bản xem trước này.</p></header>
        {section.counts && <ReportingCountsView counts={section.counts} />}
        <dl className="responsibility-ledger">{section.responsibilityIntervals.map((interval, index) => <div key={index}><dt>Thời gian chịu trách nhiệm</dt><dd className="technical-value">{interval.validFrom} – {interval.validUntil ?? 'đến nay'}</dd></div>)}</dl>
        {section.findings.length > 0 && <ul>{section.findings.map((finding, index) => <li key={index}>{finding.message}</li>)}</ul>}
        <ReportingEvidenceTable details={section.details} />
      </article>)}
      <div className="reporting-submit">
        <p>Hệ thống sẽ kiểm tra lại dữ liệu tại thời điểm gửi chính thức.</p>
        {!pendingSubmit && !submitSuccess && <Button type="button" disabled={!currentPreview.eligibleForSubmission || submitMutation.isPending} loading={submitMutation.isPending} onClick={startSubmit}>Gửi báo cáo</Button>}
        {submitMutation.isError && <InlineAlert title={submitMutation.error instanceof ApiError && submitMutation.error.statusCode === 409 ? 'Dữ liệu đã thay đổi' : 'Chưa xác định được kết quả gửi'}>
          <p>{submitMutation.error instanceof ApiError ? submitMutation.error.message : 'Kết nối đang gián đoạn.'}</p>
          {submitMutation.error instanceof ApiError && submitMutation.error.statusCode === 409 && <p>Hãy xem trước lại báo cáo trước khi tạo yêu cầu mới.</p>}
          {uncertainSubmit && pendingSubmit && <Button type="button" variant="secondary" loading={submitMutation.isPending} onClick={() => submitMutation.mutate(pendingSubmit)}>Thử gửi lại</Button>}
        </InlineAlert>}
        {submitSuccess && <InlineAlert title="Đã gửi báo cáo" tone="success"><p>{submitSuccess.replay ? 'Yêu cầu trước đó đã được hệ thống xác nhận.' : 'Báo cáo chính thức đã được lưu.'}</p>{canOpenDetail && <Link className="text-link" to={`/bao-cao-ke-khai/${submitSuccess.revisionId}`}>Mở báo cáo vừa gửi</Link>}</InlineAlert>}
      </div>
    </section>}

    {canReadMine && <section className="ledger-section" aria-labelledby="mine-heading">
      <h2 id="mine-heading">Báo cáo của tôi</h2>
      {mineQuery.isLoading && <PageLoading />}
      {mineQuery.isError && <QueryFailure error={mineQuery.error} retry={() => void mineQuery.refetch()} />}
      {mineQuery.data?.items.length === 0 && <EmptyState title="Chưa có báo cáo cá nhân" message="Báo cáo chính thức sẽ xuất hiện tại đây sau khi được gửi." />}
      {mineQuery.data && mineQuery.data.items.length > 0 && <><StatementListTable items={mineQuery.data.items} academicYearLabels={academicYearLabels} /><Pagination page={page} pageSize={PAGE_SIZE} total={mineQuery.data.total} onPage={setPage} /></>}
    </section>}
  </div>;
}
