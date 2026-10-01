import type {
  PpctImportInspectionResponse,
  PpctImportPreviewResponse,
  PpctImportTargetSelection,
} from '@baogiang/contracts/ppct-import';
import { useState } from 'react';
import { Button } from '../components/ui/button';
import { InlineAlert } from '../components/ui/feedback';
import {
  DataTable,
  EmptyState,
  PageHeader,
  SelectField,
} from '../components/ui/management';
import { ApiError } from '../lib/api-client';
import { ppctImportApi } from '../lib/ppct-api';

function defaultTargets(inspection: PpctImportInspectionResponse): PpctImportTargetSelection[] {
  return inspection.gradeLevels.map((gradeLevel) => ({
    gradeLevel,
    targetMode: 'CREATE_NEW_DRAFT',
    targetDraftId: null,
    expectedUpdatedAt: null,
  }));
}

function errorText(error: unknown): string {
  if (error instanceof ApiError) {
    return error.serverError ? `${error.serverError}: ${error.message}` : error.message;
  }
  return error instanceof Error ? error.message : 'Yêu cầu không thực hiện được.';
}

export function PpctImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [inspection, setInspection] = useState<PpctImportInspectionResponse | null>(null);
  const [preview, setPreview] = useState<PpctImportPreviewResponse | null>(null);
  const [targets, setTargets] = useState<PpctImportTargetSelection[]>([]);
  const [previewDirty, setPreviewDirty] = useState(false);
  const [busy, setBusy] = useState<'inspect' | 'preview' | 'confirm' | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const blockers = inspection?.issues.filter((issue) => issue.severity === 'BLOCKER') ?? [];

  function resetForFile(nextFile: File | null) {
    setFile(nextFile);
    setInspection(null);
    setPreview(null);
    setTargets([]);
    setPreviewDirty(false);
    setError('');
    setSuccess('');
  }

  async function inspectFile() {
    if (!file) {
      setError('Vui lòng chọn tệp PPCT .xlsx.');
      return;
    }
    setBusy('inspect');
    setError('');
    setSuccess('');
    try {
      const result = await ppctImportApi.inspect(file);
      setInspection(result);
      setPreview(null);
      setTargets(defaultTargets(result));
      setPreviewDirty(false);
      if (result.issues.some((issue) => issue.severity === 'BLOCKER')) {
        setError('Tệp có lỗi chặn. Hãy sửa workbook trước khi xem trước.');
      }
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(null);
    }
  }

  async function previewFile() {
    if (!file || !inspection || blockers.length > 0) return;
    setBusy('preview');
    setError('');
    setSuccess('');
    try {
      const result = await ppctImportApi.preview(file, targets);
      setPreview(result);
      setTargets(result.grades.map((grade) => grade.target));
      setPreviewDirty(false);
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(null);
    }
  }

  function updateTarget(gradeLevel: 10 | 11 | 12, mode: 'CREATE_NEW_DRAFT' | 'UPDATE_EXACT_DRAFT', draftId?: string) {
    const gradePreview = preview?.grades.find((grade) => grade.gradeLevel === gradeLevel);
    const draft = gradePreview?.drafts.find((candidate) => candidate.id === draftId)
      ?? gradePreview?.drafts[0]
      ?? null;
    const next: PpctImportTargetSelection = mode === 'CREATE_NEW_DRAFT'
      ? { gradeLevel, targetMode: mode, targetDraftId: null, expectedUpdatedAt: null }
      : {
          gradeLevel,
          targetMode: mode,
          targetDraftId: draft?.id ?? null,
          expectedUpdatedAt: draft?.updatedAt ?? null,
        };
    setTargets((current) => current.map((target) => target.gradeLevel === gradeLevel ? next : target));
    setPreviewDirty(true);
    setSuccess('');
  }

  async function confirmImport() {
    if (!file || !preview || previewDirty) return;
    setBusy('confirm');
    setError('');
    setSuccess('');
    try {
      const result = await ppctImportApi.confirm(file, targets, preview.requestFingerprint);
      const summary = result.results
        .map((item) => `Khối ${item.gradeLevel}: ${item.outcome === 'CREATED' ? 'tạo draft' : item.outcome === 'UPDATED' ? 'cập nhật draft' : 'dùng lại draft trùng nội dung'} v${item.version.versionNumber}`)
        .join(' · ');
      setSuccess(`Đã nhập PPCT ở trạng thái DRAFT. ${summary}. Chưa có phiên bản nào được tự động công bố.`);
      setPreview(null);
      setPreviewDirty(false);
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="management-page ppct-import-page">
      <PageHeader eyebrow="Phân phối chương trình" title="Nhập PPCT từ Excel">
        Nạp workbook PPCT_V1 theo quy trình kiểm tra → xem trước → xác nhận. Hệ thống chỉ tạo hoặc cập nhật bản nháp, không tự công bố.
      </PageHeader>

      <section className="inline-work-form" aria-labelledby="ppct-import-file-heading">
        <h2 id="ppct-import-file-heading">1. Chọn và kiểm tra tệp</h2>
        <div className="form-field">
          <label className="form-field__label" htmlFor="ppct-import-file">Tệp PPCT (.xlsx)</label>
          <input
            id="ppct-import-file"
            className="form-field__input"
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(event) => resetForFile(event.target.files?.[0] ?? null)}
          />
          <p className="form-field__hint">Tối đa 8 MiB. Môn học và năm học được đọc từ sheet THONG_TIN, không suy diễn từ tên tệp.</p>
        </div>
        <Button type="button" onClick={() => void inspectFile()} loading={busy === 'inspect'} disabled={!file || busy !== null}>
          Kiểm tra tệp
        </Button>
      </section>

      {error && <InlineAlert title="Chưa thể tiếp tục"><p>{error}</p></InlineAlert>}
      {success && <InlineAlert title="Đã hoàn tất" tone="success"><p>{success}</p></InlineAlert>}

      {inspection && (
        <section className="inline-work-form" aria-labelledby="ppct-import-inspection-heading">
          <h2 id="ppct-import-inspection-heading">2. Kết quả kiểm tra</h2>
          <p><strong>Môn học:</strong> {inspection.metadata.subjectDisplayName ?? '—'} · <strong>Năm học:</strong> {inspection.metadata.academicYearCode ?? '—'} · <strong>Mẫu:</strong> {inspection.metadata.templateVersion ?? '—'}</p>
          <p><strong>Khối có dữ liệu:</strong> {inspection.gradeLevels.length ? inspection.gradeLevels.join(', ') : 'Không có'}</p>

          {inspection.issues.length > 0 ? (
            <DataTable label="Lỗi và cảnh báo PPCT" headings={['Mức', 'Mã', 'Vị trí', 'Nội dung']}>
              {inspection.issues.map((issue, index) => (
                <tr key={`${issue.code}-${issue.sheetName ?? ''}-${issue.sourceRowNumber ?? ''}-${index}`}>
                  <td>{issue.severity === 'BLOCKER' ? 'Chặn' : 'Cảnh báo'}</td>
                  <td><code>{issue.code}</code></td>
                  <td>{issue.sheetName ?? '—'}{issue.sourceRowNumber ? ` / dòng ${issue.sourceRowNumber}` : ''}</td>
                  <td>{issue.message}</td>
                </tr>
              ))}
            </DataTable>
          ) : (
            <InlineAlert title="Tệp đạt kiểm tra cấu trúc" tone="success">Có thể chuyển sang bước xem trước nghiệp vụ.</InlineAlert>
          )}

          <Button
            type="button"
            onClick={() => void previewFile()}
            loading={busy === 'preview'}
            disabled={blockers.length > 0 || inspection.gradeLevels.length === 0 || busy !== null}
          >
            Xem trước nhập PPCT
          </Button>
        </section>
      )}

      {preview && (
        <section className="inline-work-form" aria-labelledby="ppct-import-preview-heading">
          <h2 id="ppct-import-preview-heading">3. Xem trước và chọn bản nháp đích</h2>
          <p><strong>{preview.subject.name}</strong> · {preview.academicYear.code}. Fingerprint khóa theo tệp, người dùng, nội dung và lựa chọn draft đích.</p>

          <DataTable label="Bản xem trước PPCT theo khối" headings={['Khối', 'CORE', 'Chuyên đề', 'Cách nhập', 'Bản nháp đích']}>
            {preview.grades.map((grade) => {
              const target = targets.find((candidate) => candidate.gradeLevel === grade.gradeLevel) ?? grade.target;
              return (
                <tr key={grade.gradeLevel}>
                  <td><strong>{grade.gradeLevel}</strong></td>
                  <td>{grade.corePeriodCount} tiết</td>
                  <td>{grade.specializedPeriodCount} tiết</td>
                  <td>
                    <SelectField
                      label={`Cách nhập khối ${grade.gradeLevel}`}
                      id={`ppct-import-mode-${grade.gradeLevel}`}
                      value={target.targetMode}
                      onChange={(event) => updateTarget(grade.gradeLevel, event.target.value as 'CREATE_NEW_DRAFT' | 'UPDATE_EXACT_DRAFT')}
                    >
                      <option value="CREATE_NEW_DRAFT">Tạo bản nháp mới</option>
                      <option value="UPDATE_EXACT_DRAFT" disabled={grade.drafts.length === 0}>Cập nhật bản nháp chỉ định</option>
                    </SelectField>
                  </td>
                  <td>
                    {target.targetMode === 'UPDATE_EXACT_DRAFT' ? (
                      <SelectField
                        label={`Bản nháp khối ${grade.gradeLevel}`}
                        id={`ppct-import-draft-${grade.gradeLevel}`}
                        value={target.targetDraftId ?? ''}
                        onChange={(event) => updateTarget(grade.gradeLevel, 'UPDATE_EXACT_DRAFT', event.target.value)}
                      >
                        {grade.drafts.map((draft) => (
                          <option key={draft.id} value={draft.id}>Bản {draft.versionNumber} · {draft.itemCount} tiết</option>
                        ))}
                      </SelectField>
                    ) : (
                      <span>Tạo phiên bản DRAFT kế tiếp</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </DataTable>

          {preview.issues.length > 0 && (
            <InlineAlert title="Cảnh báo cần rà soát">
              <ul>{preview.issues.map((issue, index) => <li key={`${issue.code}-${index}`}>{issue.message}</li>)}</ul>
            </InlineAlert>
          )}

          {previewDirty && (
            <InlineAlert title="Lựa chọn bản nháp đã thay đổi">
              Hãy tạo lại bản xem trước để hệ thống phát hành fingerprint mới trước khi xác nhận.
            </InlineAlert>
          )}

          <div className="button-row">
            <Button type="button" variant="secondary" onClick={() => void previewFile()} loading={busy === 'preview'} disabled={busy !== null}>
              {previewDirty ? 'Xem trước lại' : 'Làm mới bản xem trước'}
            </Button>
            <Button type="button" onClick={() => void confirmImport()} loading={busy === 'confirm'} disabled={previewDirty || busy !== null}>
              Xác nhận nhập vào DRAFT
            </Button>
          </div>
        </section>
      )}

      {!inspection && !busy && (
        <EmptyState
          title="Chưa có tệp được kiểm tra"
          message="Chọn workbook PPCT_V1 và bấm “Kiểm tra tệp”. Dữ liệu chỉ được ghi sau bước xác nhận cuối cùng."
        />
      )}
    </div>
  );
}
