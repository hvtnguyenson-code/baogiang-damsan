import type { ReportingStatementAllowedAction, ReportingStatementDecideRequest } from '@baogiang/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import {
  LifecycleStatus,
  ReportingCountsView,
  ReportingEvidenceTable,
} from '../components/reporting-statements/ReportingPresentation';
import { Button } from '../components/ui/button';
import { InlineAlert } from '../components/ui/feedback';
import { PageHeader, PageLoading, QueryFailure } from '../components/ui/management';
import { ApiError } from '../lib/api-client';
import { canReadAccessibleReporting, canReadPersonalReporting, canReviewReportingStatements } from '../lib/capabilities';
import { createReportingStatementRequestKey, reportingStatementsApi } from '../lib/reporting-statements-api';
import { displayReference, formatCivilDate, formatInstant, lifecycleLabels, makeReportingLabels } from '../lib/reporting-statement-presentation';

type DecisionCommand = {
  revisionId: string;
  action: ReportingStatementAllowedAction;
  request: ReportingStatementDecideRequest;
};

type DetailRefreshState = 'idle' | 'success-loading' | 'conflict-loading' | 'conflict-ready';

const actionLabels = { APPROVE: 'Phê duyệt', REJECT: 'Từ chối' } as const;

export function ReportingStatementDetailPage() {
  const { revisionId = '' } = useParams();
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [confirmAction, setConfirmAction] = useState<ReportingStatementAllowedAction | null>(null);
  const [pendingCommand, setPendingCommand] = useState<DecisionCommand | null>(null);
  const [decisionSuccess, setDecisionSuccess] = useState<string | null>(null);
  const [refreshState, setRefreshState] = useState<DetailRefreshState>('idle');

  const detailQuery = useQuery({
    queryKey: ['reporting-statement-detail', revisionId],
    queryFn: () => reportingStatementsApi.getDetail(revisionId),
    enabled: Boolean(revisionId),
  });
  const detail = detailQuery.data;
  const contextQuery = useQuery({
    queryKey: ['reporting-workspace-context', detail?.academicYearId],
    queryFn: () => reportingStatementsApi.workspaceContext(detail!.academicYearId),
    enabled: Boolean(detail?.academicYearId),
  });
  const context = contextQuery.data?.selectedAcademicYear;
  const labels = useMemo(() => makeReportingLabels(context?.schoolClasses ?? [], context?.subjects ?? []), [context]);

  const decisionMutation = useMutation({
    mutationFn: ({ revisionId: commandRevisionId, action, request }: DecisionCommand) => action === 'APPROVE'
      ? reportingStatementsApi.approve(commandRevisionId, request)
      : reportingStatementsApi.reject(commandRevisionId, request),
    onSuccess: (result, command) => {
      setPendingCommand(null);
      setConfirmAction(null);
      setRefreshState('success-loading');
      setDecisionSuccess(result.replay
        ? `Yêu cầu ${actionLabels[command.action].toLowerCase()} trước đó đã được hệ thống xác nhận.`
        : `Đã ${actionLabels[command.action].toLowerCase()} báo cáo.`);
      void detailQuery.refetch().then(() => setRefreshState('idle'));
      void queryClient.invalidateQueries({ queryKey: ['reporting-statements-pending'] });
      void queryClient.invalidateQueries({ queryKey: ['reporting-statements-accessible'] });
      void queryClient.invalidateQueries({ queryKey: ['reporting-statements-mine'] });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.statusCode === 409) {
        setPendingCommand(null);
        setConfirmAction(null);
        setRefreshState('conflict-loading');
        void detailQuery.refetch().then(() => setRefreshState('conflict-ready'));
        void queryClient.invalidateQueries({ queryKey: ['reporting-statements-pending'] });
      }
    },
  });

  if (detailQuery.isLoading) return <PageLoading />;
  if (detailQuery.isError) return <QueryFailure error={detailQuery.error} retry={() => void detailQuery.refetch()} />;
  if (!detail) return null;

  const beginDecision = (action: ReportingStatementAllowedAction) => {
    if (refreshState !== 'idle' || pendingCommand || decisionMutation.isPending) return;
    setDecisionSuccess(null);
    decisionMutation.reset();
    setConfirmAction(action);
  };
  const confirmDecision = () => {
    if (!confirmAction) return;
    const command = {
      revisionId,
      action: confirmAction,
      request: { expectedLifecycleToken: detail.lifecycleToken, requestKey: createReportingStatementRequestKey() },
    };
    setPendingCommand(command);
    setConfirmAction(null);
    decisionMutation.mutate(command);
  };
  const uncertainDecision = decisionMutation.error instanceof ApiError
    ? decisionMutation.error.statusCode === 0 || decisionMutation.error.statusCode >= 500
    : Boolean(decisionMutation.error);
  const yearLabel = context ? `${context.name} (${context.code})` : 'Không còn nhãn năm học trong danh mục hiện tại';
  const commandUncertain = uncertainDecision && pendingCommand !== null;
  const interactionLocked = refreshState === 'success-loading' || refreshState === 'conflict-loading' || pendingCommand !== null || decisionMutation.isPending || commandUncertain;
  const showFreshActions = !interactionLocked;
  const capabilities = auth.auth?.capabilities ?? [];
  const navigation = [
    canReadPersonalReporting(capabilities) && { to: '/bao-cao-ke-khai', label: 'Quay lại báo cáo cá nhân' },
    canReadAccessibleReporting(capabilities) && { to: '/bao-cao-ke-khai/duoc-xem', label: 'Xem báo cáo được phép xem' },
    canReviewReportingStatements(capabilities) && { to: '/phe-duyet-bao-cao', label: 'Quay lại hàng đợi phê duyệt' },
  ].filter(Boolean) as Array<{ to: string; label: string }>;

  return <div className="reporting-page reporting-detail">
    <PageHeader eyebrow="Bản báo cáo đã lưu" title="Chi tiết báo cáo kê khai">Nội dung báo cáo này là bản đã được lưu tại thời điểm gửi.</PageHeader>

    <section className="ledger-section" aria-labelledby="identity-heading">
      <h2 id="identity-heading">Thông tin bản báo cáo</h2>
      <dl className="detail-ledger">
        <div><dt>Người gửi</dt><dd><strong>{detail.submitterDisplayNameSnapshot ?? 'Người gửi không còn tên hiển thị'}</strong>{detail.submitterStaffCodeSnapshot && <span className="table-secondary technical-value">{detail.submitterStaffCodeSnapshot}</span>}</dd></div>
        <div><dt>Năm học</dt><dd>{yearLabel}</dd></div>
        <div><dt>Khoảng báo cáo</dt><dd className="technical-value">{formatCivilDate(detail.fromCivilDate)} – {formatCivilDate(detail.toCivilDate)}</dd></div>
        <div><dt>Đã gửi</dt><dd className="technical-value">{formatInstant(detail.submittedAt)}</dd></div>
        <div><dt>Trạng thái</dt><dd><LifecycleStatus state={detail.lifecycleState} /></dd></div>
        <div><dt>Thời điểm chốt dữ liệu</dt><dd className="technical-value">{formatInstant(detail.asOfInstant)}</dd></div>
      </dl>
      {detail.predecessorRevisionId && <p className="limitation-note">Đây là một phiên bản tiếp theo của cùng kỳ báo cáo.</p>}
      {detail.supersedesRevisionId && detail.lifecycleState === 'SUBMITTED' && <p className="limitation-note">Nếu được phê duyệt, phiên bản này sẽ thay thế bản đã được phê duyệt trước.</p>}
    </section>

    <section className="ledger-section" aria-labelledby="counts-heading"><h2 id="counts-heading">Tổng hợp</h2><ReportingCountsView counts={detail.counts} /></section>

    <section className="ledger-section" aria-labelledby="responsibility-heading">
      <h2 id="responsibility-heading">Phạm vi trách nhiệm</h2>
      <p className="muted-copy">Tên lớp và môn dưới đây lấy từ danh mục hiện tại để hỗ trợ đọc; bằng chứng và khoảng trách nhiệm vẫn là nội dung đã lưu của báo cáo.</p>
      <div className="responsibility-register">{detail.responsibilityManifest.map((interval, index) => <dl key={index}>
        <div><dt>Lớp</dt><dd>{displayReference(interval.schoolClassId, labels.classes, 'class')}</dd></div>
        <div><dt>Môn học</dt><dd>{displayReference(interval.subjectId, labels.subjects, 'subject')}</dd></div>
        <div><dt>Hiệu lực</dt><dd className="technical-value">{formatCivilDate(interval.validFrom)} – {interval.validUntil ? formatCivilDate(interval.validUntil) : 'đến nay'}</dd></div>
      </dl>)}</div>
    </section>

    <section className="ledger-section" aria-labelledby="evidence-heading">
      <h2 id="evidence-heading">Bằng chứng chi tiết</h2>
      {detail.sections.map((section) => <article className="reporting-evidence-section" key={`${section.schoolClassId}-${section.subjectId}`}>
        <header><h3>{displayReference(section.schoolClassId, labels.classes, 'class')} · {displayReference(section.subjectId, labels.subjects, 'subject')}</h3><p>Bản đã lưu tại thời điểm gửi; nhãn danh mục chỉ hỗ trợ hiển thị hiện tại.</p></header>
        {section.counts && <ReportingCountsView counts={section.counts} />}
        {section.findings.length > 0 && <InlineAlert title="Bằng chứng cần lưu ý"><ul>{section.findings.map((finding, index) => <li key={index}>{finding.message}</li>)}</ul></InlineAlert>}
        <ReportingEvidenceTable details={section.details} />
      </article>)}
    </section>

    <section className="ledger-section" aria-labelledby="history-heading">
      <h2 id="history-heading">Lịch sử báo cáo</h2>
      <ol className="reporting-history">{detail.history.map((event) => <li key={event.id}>
        <div><strong>{lifecycleLabels[event.eventType]}</strong><span className="technical-value">{formatInstant(event.createdAt)}</span></div>
        <p>{event.actorDisplayNameSnapshot ?? 'Tác nhân hệ thống không còn tên hiển thị'}{event.actorStaffCodeSnapshot ? ` · ${event.actorStaffCodeSnapshot}` : ''}</p>
      </li>)}</ol>
    </section>

    {refreshState === 'conflict-loading' && <InlineAlert title="Báo cáo đang được cập nhật" tone="warning">Đang tải trạng thái mới của báo cáo. Trong lúc này chưa thể thực hiện thêm quyết định.</InlineAlert>}
    {refreshState === 'conflict-ready' && <InlineAlert title="Báo cáo đã có trạng thái mới" tone="warning">Nội dung vừa được tải lại. Hãy đọc trạng thái hiện tại trước khi thực hiện một quyết định mới.</InlineAlert>}
    {decisionSuccess && <InlineAlert title="Đã ghi nhận quyết định" tone="success">{decisionSuccess}</InlineAlert>}

    {(detail.allowedActions.length > 0 || commandUncertain || refreshState === 'conflict-loading') && <section className="reporting-decision" aria-labelledby="decision-heading">
      <div className="reporting-section-heading"><div className="margin-rail" aria-hidden="true" /><div><h2 id="decision-heading">Quyết định sau khi đọc bằng chứng</h2><p>Quyết định dùng trạng thái hiện tại của báo cáo. Nếu có thay đổi đồng thời, hệ thống sẽ yêu cầu bạn xem lại.</p></div></div>
      {commandUncertain && <InlineAlert title="Chưa xác định được kết quả quyết định">
        <p>{decisionMutation.error instanceof ApiError ? decisionMutation.error.message : 'Kết nối đang gián đoạn.'}</p>
        {uncertainDecision && pendingCommand && <Button type="button" variant="secondary" loading={decisionMutation.isPending} onClick={() => decisionMutation.mutate(pendingCommand)}>Thử lại cùng yêu cầu</Button>}
      </InlineAlert>}
      {showFreshActions && !confirmAction && <div className="form-actions">
        {detail.allowedActions.includes('APPROVE') && <Button type="button" onClick={() => beginDecision('APPROVE')}>Phê duyệt báo cáo</Button>}
        {detail.allowedActions.includes('REJECT') && <Button type="button" variant="secondary" onClick={() => beginDecision('REJECT')}>Từ chối báo cáo</Button>}
      </div>}
      {showFreshActions && confirmAction && <div className="decision-confirm" role="group" aria-label={`Xác nhận ${actionLabels[confirmAction].toLowerCase()} báo cáo`}>
        <p><strong>Xác nhận {actionLabels[confirmAction].toLowerCase()}?</strong> Hành động sẽ được ghi vào lịch sử báo cáo.</p>
        {confirmAction === 'REJECT' && <p>Phiên bản này sẽ kết thúc ở trạng thái bị từ chối. Hệ thống hiện không yêu cầu nhập lý do từ chối.</p>}
        <div className="form-actions"><Button type="button" loading={decisionMutation.isPending} onClick={confirmDecision}>Xác nhận {actionLabels[confirmAction].toLowerCase()}</Button><Button type="button" variant="quiet" disabled={decisionMutation.isPending} onClick={() => setConfirmAction(null)}>Hủy</Button></div>
      </div>}
    </section>}

    {navigation.length > 0 && <div className="workspace-actions">{navigation.map((item) => <Link className="text-link" key={item.to} to={item.to}>{item.label}</Link>)}</div>}
  </div>;
}
