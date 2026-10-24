import type {
  DataReadinessDomainItem,
  DataReadinessDomainKey,
  DataReadinessFinding,
  DataReadinessImportWorkflowStep,
  DataReadinessStatus,
  DataReadinessSummaryResponse,
} from '@baogiang/contracts';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { ErrorFeedback, LoadingState } from '../components/ui/feedback';
import { PageHeader } from '../components/ui/management';
import { dataReadinessApi } from '../lib/data-readiness-api';

function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString('vi-VN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function statusBadgeClass(status: DataReadinessStatus): string {
  switch (status) {
    case 'READY':
      return 'data-readiness-badge data-readiness-badge--ready';
    case 'ATTENTION_REQUIRED':
      return 'data-readiness-badge data-readiness-badge--attention';
    case 'NOT_READY':
      return 'data-readiness-badge data-readiness-badge--not-started';
    case 'NO_DATA':
      return 'data-readiness-badge data-readiness-badge--not-started';
    case 'NOT_ASSESSED':
    default:
      return 'data-readiness-badge data-readiness-badge--unverifiable';
  }
}

function statusIcon(status: DataReadinessStatus): string {
  switch (status) {
    case 'READY':
      return '✓';
    case 'ATTENTION_REQUIRED':
      return '!';
    case 'NOT_READY':
      return '✕';
    case 'NO_DATA':
      return '○';
    case 'NOT_ASSESSED':
    default:
      return '?';
  }
}

function findingSeverityBadge(severity: DataReadinessFinding['severity']) {
  switch (severity) {
    case 'BLOCKER':
      return <span className="finding-pill finding-pill--blocker">RÀO CẢN</span>;
    case 'WARNING':
      return <span className="finding-pill finding-pill--warning">CẢNH BÁO</span>;
    case 'INFO':
    default:
      return <span className="finding-pill finding-pill--info">THÔNG TIN</span>;
  }
}

function workflowStepStatusClass(step: DataReadinessImportWorkflowStep): string {
  if (!step.isApplicable) return 'workflow-step-pill workflow-step-pill--na';
  if (step.isCompleted) return 'workflow-step-pill workflow-step-pill--completed';
  if (step.isCurrent) return 'workflow-step-pill workflow-step-pill--current';
  return 'workflow-step-pill workflow-step-pill--pending';
}

function workflowStepStatusSymbol(step: DataReadinessImportWorkflowStep): string {
  if (!step.isApplicable) return '—';
  if (step.isCompleted) return '✓';
  if (step.isCurrent) return '▶';
  return '○';
}

function domainAccentClass(domainKey: DataReadinessDomainKey): string {
  switch (domainKey) {
    case 'TKB':
      return 'domain-card--teal';
    case 'PPCT':
      return 'domain-card--indigo';
    case 'HISTORICAL_TEACHING':
      return 'domain-card--amber';
    case 'GDDP':
      return 'domain-card--blue';
    case 'HDTN_HN':
      return 'domain-card--teal';
    default:
      return '';
  }
}

const WORKFLOW_CONTRACT_STEPS = [
  { step: 1, title: 'Chọn tệp', desc: 'Chọn tệp Excel / CSV theo định dạng chuẩn' },
  { step: 2, title: 'Kiểm tra cấu trúc', desc: 'Xác minh dòng tiêu đề, kiểu cột và tính toàn vẹn' },
  { step: 3, title: 'Xử lý chưa nhận diện', desc: 'Đối chiếu mã giáo viên, mã môn, mã lớp mới' },
  { step: 4, title: 'Xem trước & đối chiếu', desc: 'Phát hiện xung đột phòng học, trùng tiết, vượt định mức' },
  { step: 5, title: 'Xác nhận', desc: 'Ghi nhận dữ liệu vào sổ cái với kiểm soát phiên bản' },
  { step: 6, title: 'Kích hoạt / Công bố', desc: 'Ban hành thời khóa biểu hoặc phê duyệt kế hoạch' },
];

export function DataReadinessPage() {
  const [summary, setSummary] = useState<DataReadinessSummaryResponse | null>(null);
  const [selectedAcademicYearId, setSelectedAcademicYearId] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<unknown>(null);

  const loadData = useCallback(async (yearId?: string, isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const data = await dataReadinessApi.getSummary(yearId || undefined);
      setSummary(data);
      if (data.academicYear) {
        setSelectedAcademicYearId((prev) => prev || data.academicYear!.id);
      }
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleYearChange = (newYearId: string) => {
    setSelectedAcademicYearId(newYearId);
    void loadData(newYearId);
  };

  const handleRefresh = () => {
    void loadData(selectedAcademicYearId, true);
  };

  const readyCount = summary?.domains.filter((d: DataReadinessDomainItem) => d.status === 'READY').length ?? 0;
  const attentionCount = summary?.domains.filter((d: DataReadinessDomainItem) => d.status === 'ATTENTION_REQUIRED').length ?? 0;
  const notReadyCount = summary?.domains.filter((d: DataReadinessDomainItem) => d.status === 'NOT_READY').length ?? 0;
  const noDataCount = summary?.domains.filter((d: DataReadinessDomainItem) => d.status === 'NO_DATA').length ?? 0;
  const totalFindings = summary?.domains.reduce((sum: number, d: DataReadinessDomainItem) => sum + d.findings.length, 0) ?? 0;
  const totalBlockers = summary?.domains.reduce(
    (sum: number, d: DataReadinessDomainItem) => sum + d.findings.filter((f: DataReadinessFinding) => f.severity === 'BLOCKER').length,
    0,
  ) ?? 0;

  return (
    <div className="page-width main-content" data-testid="data-readiness-page">
      <PageHeader
        eyebrow="Quản trị dữ liệu nhà trường"
        title="Trung tâm sẵn sàng dữ liệu & nhập liệu"
        action={
          <div className="readiness-header-actions">
            {summary && summary.academicYears && summary.academicYears.length > 0 && (
              <div className="readiness-year-selector">
                <label htmlFor="readiness-year-select" className="readiness-year-label">
                  Năm học:
                </label>
                <select
                  id="readiness-year-select"
                  className="readiness-year-select"
                  value={selectedAcademicYearId}
                  onChange={(e) => handleYearChange(e.target.value)}
                  disabled={loading || refreshing}
                  aria-label="Chọn năm học kiểm tra sẵn sàng"
                >
                  {summary.academicYears.map((year) => (
                    <option key={year.id} value={year.id}>
                      {year.name} ({year.code})
                    </option>
                  ))}
                </select>
              </div>
            )}
            <Button
              type="button"
              variant="secondary"
              onClick={handleRefresh}
              disabled={loading || refreshing}
              aria-label="Làm mới trạng thái dữ liệu"
            >
              {refreshing ? 'Đang cập nhật…' : 'Làm mới'}
            </Button>
          </div>
        }
      >
        Bảng tổng hợp mức độ sẵn sàng vận hành của 5 nhóm dữ liệu cốt lõi (TKB, PPCT, Lịch sử giảng dạy, GDĐP, HĐTN-HN)
        và hướng dẫn các bước nhập liệu chuẩn hóa dành cho Ban giám hiệu và Quản trị viên.
      </PageHeader>

      {error != null && (
        <div style={{ marginBlock: '1.5rem' }}>
          <ErrorFeedback
            title="Không thể tải dữ liệu sẵn sàng"
            error={error}
            retry={() => void loadData(selectedAcademicYearId)}
          />
        </div>
      )}

      {loading && !summary && (
        <div style={{ marginBlock: '3rem' }}>
          <LoadingState label="Đang kiểm tra mức độ sẵn sàng của các nhóm dữ liệu…" />
        </div>
      )}

      {summary && (
        <>
          {/* Overall Health Card */}
          <section
            className="readiness-overall-card"
            aria-labelledby="readiness-overall-title"
            data-testid="readiness-overall-card"
          >
            <div className="readiness-overall-header">
              <div>
                <p className="readiness-overall-eyebrow">
                  {summary.academicYear
                    ? `Tổng hợp năm học ${summary.academicYear.name} (${summary.academicYear.code})`
                    : 'Tổng hợp năm học hiện hành'}
                </p>
                <h2 id="readiness-overall-title" className="readiness-overall-heading">
                  Trạng thái vận hành:{' '}
                  <span className={statusBadgeClass(summary.overallStatus)} data-testid="overall-status-badge">
                    <span className="badge-icon" aria-hidden="true">{statusIcon(summary.overallStatus)}</span>
                    {summary.overallStatusLabel}
                  </span>
                </h2>
              </div>
            </div>

            <div className="readiness-metrics-grid">
              <div className="readiness-metric-box">
                <span className="readiness-metric-number readiness-metric--ready">{readyCount} / 5</span>
                <span className="readiness-metric-label">Nhóm dữ liệu sẵn sàng</span>
              </div>
              <div className="readiness-metric-box">
                <span className="readiness-metric-number readiness-metric--attention">{attentionCount}</span>
                <span className="readiness-metric-label">Cần can thiệp xử lý</span>
              </div>
              <div className="readiness-metric-box">
                <span className="readiness-metric-number readiness-metric--in-progress">{notReadyCount}</span>
                <span className="readiness-metric-label">Chưa sẵn sàng / Bị chặn</span>
              </div>
              <div className="readiness-metric-box">
                <span className="readiness-metric-number readiness-metric--not-started">{noDataCount}</span>
                <span className="readiness-metric-label">Chưa có dữ liệu</span>
              </div>
              <div className="readiness-metric-box">
                <span className="readiness-metric-number readiness-metric--blocker">{totalBlockers}</span>
                <span className="readiness-metric-label">Rào cản ({totalFindings} cảnh báo)</span>
              </div>
            </div>
          </section>

          {/* Unified Ingestion Workflow Guide */}
          <section className="readiness-guide-box" aria-labelledby="readiness-guide-title">
            <h3 id="readiness-guide-title" className="readiness-guide-title">
              Quy trình 6 bước chuẩn hóa khi nạp dữ liệu nhà trường
            </h3>
            <p className="readiness-guide-desc">
              Mọi luồng nhập dữ liệu (TKB, PPCT, Lịch sử giảng dạy, GDĐP, HĐTN-HN) đều tuân theo trình tự nghiệp vụ
              chặt chẽ để bảo đảm an toàn dữ liệu và tính giải trình:
            </p>
            <div className="readiness-guide-steps">
              {WORKFLOW_CONTRACT_STEPS.map((st) => (
                <div key={st.step} className="guide-step-card">
                  <div className="guide-step-number">{st.step}</div>
                  <h4 className="guide-step-title">{st.title}</h4>
                  <p className="guide-step-text">{st.desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* 5 Domains Grid */}
          <section className="readiness-domains-section" aria-labelledby="readiness-domains-heading">
            <h3 id="readiness-domains-heading" className="visually-hidden">
              Chi tiết 5 nhóm dữ liệu nghiệp vụ
            </h3>

            <div className="readiness-domains-grid">
              {summary.domains.map((domain: DataReadinessDomainItem, index: number) => (
                <article
                  key={domain.key}
                  className={`domain-card ${domainAccentClass(domain.key)}`}
                  data-testid={`domain-card-${domain.key.toLowerCase()}`}
                  aria-labelledby={`domain-heading-${domain.key}`}
                >
                  {/* Card Header */}
                  <header className="domain-card-header">
                    <div>
                      <div className="domain-index-tag">NHÓM {index + 1} / 5</div>
                      <h4 id={`domain-heading-${domain.key}`} className="domain-card-title">
                        {domain.label}
                      </h4>
                    </div>
                    <div>
                      <span
                        className={statusBadgeClass(domain.status)}
                        data-testid={`domain-status-${domain.key.toLowerCase()}`}
                      >
                        <span className="badge-icon" aria-hidden="true">{statusIcon(domain.status)}</span>
                        {domain.statusLabel}
                      </span>
                    </div>
                  </header>

                  {/* Card Body */}
                  <div className="domain-card-body">
                    <p className="domain-card-description">{domain.description}</p>

                    {/* Version & Import Details */}
                    <div className="domain-version-box">
                      <div className="domain-version-row">
                        <span className="domain-version-label">Phiên bản / Lượt nhập gần nhất:</span>
                        <span className="domain-version-value">
                          {domain.latestVersion
                            ? `Phiên bản #${domain.latestVersion.number ?? 1} (${domain.latestVersion.statusLabel ?? domain.latestVersion.status ?? 'Đang lưu'})`
                            : domain.latestImport
                            ? `Lượt nhập ${domain.latestImport.batchRef ?? domain.latestImport.sourceFileName ?? 'Mới nhất'} (${domain.latestImport.rowCount ?? 0} dòng)`
                            : 'Chưa có phiên bản hoặc lượt nhập'}
                        </span>
                      </div>
                      {domain.latestVersion && (
                        <div className="domain-version-meta">
                          <span>Cập nhật: {formatDate(domain.latestVersion.updatedAt)}</span>
                          {domain.latestVersion.effectiveRange && <span> · Hiệu lực: {domain.latestVersion.effectiveRange}</span>}
                        </div>
                      )}
                      {domain.latestImport && !domain.latestVersion && (
                        <div className="domain-version-meta">
                          <span>Nạp lúc: {formatDate(domain.latestImport.importedAt)}</span>
                          {domain.latestImport.importedBy && <span> · Bởi: {domain.latestImport.importedBy}</span>}
                          {domain.latestImport.sourceFileName && <span> · Tệp: {domain.latestImport.sourceFileName}</span>}
                        </div>
                      )}
                    </div>

                    {/* Key Stats Summary */}
                    {domain.stats && Object.keys(domain.stats).length > 0 && (
                      <div className="domain-stats-row">
                        {Object.entries(domain.stats).map(([k, v]) => {
                          if (v === null || v === undefined) return null;
                          return (
                            <div key={k} className="domain-stat-pill">
                              <span className="stat-key">{k}:</span>{' '}
                              <strong className="stat-val">{typeof v === 'boolean' ? (v ? 'Có' : 'Không') : v}</strong>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Findings & Blockers */}
                    <div className="domain-findings-box">
                      <h5 className="domain-section-subtitle">
                        Kiểm tra điều kiện vận hành ({domain.findings.length})
                      </h5>
                      {domain.findings.length === 0 ? (
                        <div className="domain-finding-item domain-finding-item--clean">
                          <span className="finding-clean-icon" aria-hidden="true">✓</span>
                          <span>Không có cảnh báo hoặc rào cản ngăn cản vận hành.</span>
                        </div>
                      ) : (
                        <ul className="domain-findings-list">
                          {domain.findings.map((f: DataReadinessFinding, idx: number) => (
                            <li
                              key={`${f.code}-${idx}`}
                              className={`domain-finding-item domain-finding-item--${f.severity.toLowerCase()}`}
                            >
                              <div className="finding-header">
                                {findingSeverityBadge(f.severity)}
                                <span className="finding-code font-mono">[{f.code}]</span>
                              </div>
                              <p className="finding-message">{f.message}</p>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    {/* Next Safe Action */}
                    <div className="domain-next-action-box">
                      <h5 className="domain-next-action-title">Thao tác tiếp theo an toàn:</h5>
                      <p className="domain-next-action-text">{domain.nextAction}</p>
                    </div>

                    {/* 6-Step Workflow Stepper */}
                    <div className="domain-workflow-stepper">
                      <h5 className="domain-section-subtitle">Tiến trình chuẩn hóa 6 bước:</h5>
                      <ol className="workflow-stepper-list">
                        {domain.workflowSteps.map((step: DataReadinessImportWorkflowStep) => (
                          <li
                            key={step.stepNumber}
                            className={`workflow-stepper-item ${workflowStepStatusClass(step)}`}
                            title={step.description || step.label}
                          >
                            <span className="stepper-bubble" aria-hidden="true">
                              {workflowStepStatusSymbol(step)}
                            </span>
                            <span className="stepper-label">
                              {step.stepNumber}. {step.label}
                            </span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  </div>

                  {/* Card Actions Footer */}
                  <footer className="domain-card-footer">
                    <Link
                      to={domain.key === 'TKB' ? '/quan-tri/thoi-khoa-bieu?tab=import' : domain.primaryAction.to}
                      className="button button--primary domain-action-btn"
                      data-testid={`action-${domain.key.toLowerCase()}`}
                    >
                      {domain.key === 'TKB' ? 'Nhập TKB Đam San' : domain.primaryAction.label}
                    </Link>
                    {domain.secondaryAction && (
                      <Link
                        to={domain.secondaryAction.to}
                        className="button button--secondary domain-action-btn"
                        data-testid={`secondary-action-${domain.key.toLowerCase()}`}
                      >
                        {domain.secondaryAction.label}
                      </Link>
                    )}
                  </footer>
                </article>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
