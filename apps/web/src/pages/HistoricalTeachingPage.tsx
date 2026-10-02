import type {
  HistoricalTeachingOptionsResponse,
  HistoricalTeachingPreviewResponse,
  HistoricalTeachingReconciliationResponse,
} from '@baogiang/contracts/historical-teaching';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '../components/ui/button';
import { InlineAlert } from '../components/ui/feedback';
import { DataTable, EmptyState, PageHeader, SelectField } from '../components/ui/management';
import { ApiError } from '../lib/api-client';
import { historicalTeachingApi } from '../lib/historical-teaching-api';

const CSV_HEADER = 'LOP,MON,NGAY_GOC,BUOI_GOC,TIET_GOC,GIAO_VIEN_THUC_DAY,LOAI,NGAY_DAY_THUC_TE,BUOI_THUC_TE,TIET_THUC_TE,GHI_CHU';

function errorText(error: unknown): string {
  if (error instanceof ApiError) {
    return error.serverError ? `${error.serverError}: ${error.message}` : error.message;
  }
  return error instanceof Error ? error.message : 'Yêu cầu không thực hiện được.';
}

function kindLabel(kind: 'NORMAL' | 'SUBSTITUTION' | 'MAKEUP'): string {
  if (kind === 'NORMAL') return 'Bình thường';
  if (kind === 'SUBSTITUTION') return 'Dạy thay';
  return 'Dạy bù';
}

function statusLabel(status: 'CONFIRMED' | 'UNCONFIRMED' | 'CONFLICT'): string {
  if (status === 'CONFIRMED') return 'Đã xác nhận';
  if (status === 'UNCONFIRMED') return 'Chưa có minh chứng';
  return 'Xung đột';
}

export function HistoricalTeachingPage() {
  const [options, setOptions] = useState<HistoricalTeachingOptionsResponse | null>(null);
  const [academicYearId, setAcademicYearId] = useState('');
  const [sourceText, setSourceText] = useState(CSV_HEADER);
  const [preview, setPreview] = useState<HistoricalTeachingPreviewResponse | null>(null);
  const [reconciliation, setReconciliation] = useState<HistoricalTeachingReconciliationResponse | null>(null);
  const [classCode, setClassCode] = useState('');
  const [subjectCode, setSubjectCode] = useState('');
  const [reversalReason, setReversalReason] = useState('Điều chỉnh minh chứng lịch sử');
  const [busy, setBusy] = useState<'options' | 'preview' | 'confirm' | 'reconcile' | 'reverse' | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const blockerCount = useMemo(() => {
    if (!preview) return 0;
    return preview.issues.filter((issue) => issue.severity === 'BLOCKER').length
      + preview.rows.reduce((sum, row) => sum + row.issues.filter((issue) => issue.severity === 'BLOCKER').length, 0);
  }, [preview]);

  useEffect(() => {
    let active = true;
    setBusy('options');
    historicalTeachingApi.options()
      .then((result) => {
        if (!active) return;
        setOptions(result);
        const yearId = result.selectedAcademicYearId ?? '';
        setAcademicYearId(yearId);
        setClassCode(result.classes[0]?.code ?? '');
        setSubjectCode(result.subjects[0]?.code ?? '');
      })
      .catch((caught) => {
        if (active) setError(errorText(caught));
      })
      .finally(() => {
        if (active) setBusy(null);
      });
    return () => { active = false; };
  }, []);

  async function changeYear(nextYearId: string) {
    setAcademicYearId(nextYearId);
    setPreview(null);
    setReconciliation(null);
    setBusy('options');
    setError('');
    setSuccess('');
    try {
      const result = await historicalTeachingApi.options(nextYearId);
      setOptions(result);
      setClassCode(result.classes[0]?.code ?? '');
      setSubjectCode(result.subjects[0]?.code ?? '');
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(null);
    }
  }

  async function previewImport() {
    if (!academicYearId || sourceText.trim() === CSV_HEADER) {
      setError('Hãy chọn năm học và dán ít nhất một dòng dữ liệu dưới dòng tiêu đề.');
      return;
    }
    setBusy('preview');
    setError('');
    setSuccess('');
    try {
      const result = await historicalTeachingApi.preview(academicYearId, sourceText);
      setPreview(result);
      if (!result.canConfirm) {
        setError('Bản xem trước còn lỗi chặn. Sửa dữ liệu theo các dòng được đánh dấu rồi xem trước lại.');
      }
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(null);
    }
  }

  async function confirmImport() {
    if (!preview?.canConfirm || !academicYearId) return;
    setBusy('confirm');
    setError('');
    setSuccess('');
    try {
      const result = await historicalTeachingApi.confirm(
        academicYearId,
        sourceText,
        preview.requestFingerprint,
        crypto.randomUUID(),
      );
      setSuccess(`Đã xác nhận ${result.rows.length} dòng lịch sử. Hệ thống đã ghi minh chứng vào luồng tiết dạy chính thức.`);
      setPreview(null);
      if (classCode && subjectCode) await loadReconciliation();
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(null);
    }
  }

  async function loadReconciliation() {
    if (!academicYearId || !classCode || !subjectCode) return;
    setBusy('reconcile');
    setError('');
    try {
      const result = await historicalTeachingApi.reconciliation(academicYearId, classCode, subjectCode);
      setReconciliation(result);
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(null);
    }
  }

  async function reverseExecution(executionId: string, expectedUpdatedAt: string | null) {
    if (!expectedUpdatedAt) return;
    if (!reversalReason.trim()) {
      setError('Phải nhập lý do điều chỉnh trước khi đảo bằng chứng.');
      return;
    }
    setBusy('reverse');
    setError('');
    setSuccess('');
    try {
      await historicalTeachingApi.reverse(executionId, {
        requestKey: crypto.randomUUID(),
        expectedUpdatedAt,
        reversalReason: reversalReason.trim(),
      });
      setSuccess('Đã đảo bằng chứng lịch sử. Sửa dòng CSV tương ứng và nạp lại; hệ thống sẽ nối lineage thay thế.');
      await loadReconciliation();
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="management-page historical-teaching-page">
      <PageHeader eyebrow="Vận hành đầu năm" title="Nạp lịch sử giảng dạy">
        Dùng khi hệ thống bắt đầu vận hành sau ngày khai giảng. Dữ liệu ở đây là minh chứng tiết đã dạy thực tế trước mốc vận hành; dòng không có minh chứng không tự biến thành nợ hoặc trễ.
      </PageHeader>

      {error && <InlineAlert title="Chưa thể tiếp tục"><p>{error}</p></InlineAlert>}
      {success && <InlineAlert title="Đã hoàn tất" tone="success"><p>{success}</p></InlineAlert>}

      <section className="inline-work-form" aria-labelledby="history-source-heading">
        <h2 id="history-source-heading">1. Dán dữ liệu lịch sử</h2>
        <SelectField
          label="Năm học"
          id="history-academic-year"
          value={academicYearId}
          onChange={(event) => void changeYear(event.target.value)}
          disabled={busy !== null}
        >
          <option value="">Chọn năm học</option>
          {(options?.academicYears ?? []).map((year) => (
            <option key={year.id} value={year.id}>{year.code} · {year.name}</option>
          ))}
        </SelectField>

        <div className="form-field">
          <label className="form-field__label" htmlFor="history-source-text">CSV lịch sử</label>
          <textarea
            id="history-source-text"
            className="form-field__input"
            rows={12}
            spellCheck={false}
            value={sourceText}
            onChange={(event) => {
              setSourceText(event.target.value);
              setPreview(null);
              setSuccess('');
            }}
          />
          <p className="form-field__hint">
            Loại: BINH_THUONG, DAY_THAY hoặc DAY_BU. Buổi: SANG, CHIEU, TOI. DAY_BU bắt buộc điền NGAY_DAY_THUC_TE, BUOI_THUC_TE và TIET_THUC_TE. Không nhập UUID hay số thứ tự PPCT.
          </p>
        </div>

        <Button type="button" onClick={() => void previewImport()} loading={busy === 'preview'} disabled={!academicYearId || busy !== null}>
          Xem trước và đối chiếu
        </Button>
      </section>

      {preview && (
        <section className="inline-work-form" aria-labelledby="history-preview-heading">
          <h2 id="history-preview-heading">2. Kết quả đối chiếu</h2>
          <p>
            <strong>Mốc vận hành:</strong> {preview.operationalStartDate}
            {' · '}<strong>Số dòng:</strong> {preview.rows.length}
            {' · '}<strong>Lỗi chặn:</strong> {blockerCount}
          </p>

          {preview.issues.length > 0 && (
            <InlineAlert title="Lỗi toàn bộ nguồn">
              <ul>{preview.issues.map((issue, index) => <li key={`${issue.code}-${index}`}>{issue.message}</li>)}</ul>
            </InlineAlert>
          )}

          <DataTable label="Bản xem trước lịch sử" headings={['Dòng', 'Loại', 'Lớp · Môn', 'Tiết gốc', 'GV thực dạy', 'PPCT', 'Kết quả']}>
            {preview.rows.map((row) => (
              <tr key={row.rowRef}>
                <td>{row.rowNumber}</td>
                <td>{kindLabel(row.kind)}</td>
                <td><strong>{row.schoolClassCode}</strong> · {row.subjectCode}</td>
                <td>{row.sourceCivilDate} · {row.sourceSession} · tiết {row.sourceOrdinal}</td>
                <td>{row.actualTeacherDisplayName ?? row.actualTeacherStaffCode}</td>
                <td>{row.ppct ? `${row.ppct.component} · tiết ${row.ppct.sequence} · ${row.ppct.title}` : '—'}</td>
                <td>
                  {row.status === 'READY' ? (
                    <span>Sẵn sàng{row.replacementCandidate ? ' · thay thế bản đã đảo' : ''}</span>
                  ) : (
                    <ul>{row.issues.map((issue, index) => <li key={`${issue.code}-${index}`}>{issue.message}</li>)}</ul>
                  )}
                </td>
              </tr>
            ))}
          </DataTable>

          <div className="button-row">
            <Button type="button" variant="secondary" onClick={() => void previewImport()} loading={busy === 'preview'} disabled={busy !== null}>
              Đối chiếu lại
            </Button>
            <Button type="button" onClick={() => void confirmImport()} loading={busy === 'confirm'} disabled={!preview.canConfirm || busy !== null}>
              Xác nhận nạp {preview.rows.length} dòng
            </Button>
          </div>
        </section>
      )}

      <section className="inline-work-form" aria-labelledby="history-reconciliation-heading">
        <h2 id="history-reconciliation-heading">3. Đối soát lịch sử trước vận hành</h2>
        <div className="form-grid">
          <SelectField label="Lớp" id="history-class" value={classCode} onChange={(event) => { setClassCode(event.target.value); setReconciliation(null); }}>
            <option value="">Chọn lớp</option>
            {(options?.classes ?? []).map((item) => <option key={item.id} value={item.code}>{item.code} · {item.name}</option>)}
          </SelectField>
          <SelectField label="Môn" id="history-subject" value={subjectCode} onChange={(event) => { setSubjectCode(event.target.value); setReconciliation(null); }}>
            <option value="">Chọn môn</option>
            {(options?.subjects ?? []).map((item) => <option key={item.id} value={item.code}>{item.code} · {item.name}</option>)}
          </SelectField>
        </div>
        <Button type="button" onClick={() => void loadReconciliation()} loading={busy === 'reconcile'} disabled={!classCode || !subjectCode || busy !== null}>
          Tải đối soát
        </Button>

        {reconciliation && (
          <>
            <p>
              <strong>Đã xác nhận:</strong> {reconciliation.counts.confirmed}
              {' · '}<strong>Chưa có minh chứng:</strong> {reconciliation.counts.unconfirmed}
              {' · '}<strong>Xung đột:</strong> {reconciliation.counts.conflict}
            </p>
            {reconciliation.findings.length > 0 && (
              <InlineAlert title="Phát hiện cần rà soát">
                <ul>{reconciliation.findings.map((finding) => <li key={finding}>{finding}</li>)}</ul>
              </InlineAlert>
            )}
            <div className="form-field">
              <label className="form-field__label" htmlFor="history-reversal-reason">Lý do điều chỉnh minh chứng</label>
              <input
                id="history-reversal-reason"
                className="form-field__input"
                value={reversalReason}
                onChange={(event) => setReversalReason(event.target.value)}
                maxLength={500}
              />
            </div>
            <DataTable label="Đối soát nghĩa vụ trước vận hành" headings={['Ngày · tiết', 'Giáo viên', 'PPCT', 'Trạng thái', 'Thao tác']}>
              {reconciliation.rows.map((row) => (
                <tr key={row.occurrenceKey}>
                  <td>{row.sourceCivilDate} · {row.sourceSlotLabel}</td>
                  <td>{row.actualTeacherDisplayName ?? row.responsibleTeacherDisplayName}</td>
                  <td>{row.ppct ? `${row.ppct.component} · tiết ${row.ppct.sequence} · ${row.ppct.title}` : '—'}</td>
                  <td>{statusLabel(row.status)}{row.findings.length ? ` · ${row.findings.join(', ')}` : ''}</td>
                  <td>
                    {row.status === 'CONFIRMED' && row.executionId && row.executionUpdatedAt ? (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => void reverseExecution(row.executionId!, row.executionUpdatedAt)}
                        loading={busy === 'reverse'}
                        disabled={busy !== null}
                      >
                        Đảo để sửa
                      </Button>
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </DataTable>
          </>
        )}
      </section>

      {!preview && !reconciliation && busy === null && (
        <EmptyState
          title="Chưa có dữ liệu đang đối soát"
          message="Dán CSV lịch sử để xem trước hoặc chọn lớp và môn để xem toàn bộ nghĩa vụ trước mốc vận hành."
        />
      )}
    </div>
  );
}
