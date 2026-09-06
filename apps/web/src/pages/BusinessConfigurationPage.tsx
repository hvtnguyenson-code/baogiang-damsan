import type {
  BusinessConfigurationResource,
  BusinessPolicyFamilyMetadata,
  BusinessPolicyResolution,
  BusinessPolicyVersionRecord,
} from '@baogiang/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Button } from '../components/ui/button';
import { InlineAlert } from '../components/ui/feedback';
import { FormField } from '../components/ui/form-field';
import {
  DataTable,
  EmptyState,
  PageHeader,
  PageLoading,
  Pagination,
  QueryFailure,
  SelectField,
  StatusText,
  TextareaField,
} from '../components/ui/management';
import {
  businessConfigurationApi,
  formatAuditTimestamp,
  isValidCivilDate,
  normalizeCivilDate,
  translatePolicyError,
  type CorrectInput,
  type CreateDraftInput,
  type EditDraftInput,
  type ReplaceInput,
  type RetireInput,
} from '../lib/business-configuration-api';
import {
  findUiAdapter,
  matchUiAdapter,
  PRODUCTION_BUSINESS_POLICY_UI_ADAPTERS,
  type BusinessPolicyUiAdapter,
} from '../lib/business-policy-ui-registry';

type CreateWorkflow = {
  kind: 'create';
  familyKey: string;
  resource: BusinessConfigurationResource;
  effectiveFrom: string;
  effectiveUntil: string;
  payload: Record<string, unknown>;
};

type EditWorkflow = {
  kind: 'edit';
  streamId: string;
  version: BusinessPolicyVersionRecord;
  family: BusinessPolicyFamilyMetadata;
  payload: Record<string, unknown>;
};

type PublishWorkflow = {
  kind: 'publish';
  streamId: string;
  version: BusinessPolicyVersionRecord;
  family: BusinessPolicyFamilyMetadata;
};

type ReplaceWorkflow = {
  kind: 'replace';
  streamId: string;
  version: BusinessPolicyVersionRecord;
  family: BusinessPolicyFamilyMetadata;
  effectiveFrom: string;
  payload: Record<string, unknown>;
};

type RetireWorkflow = {
  kind: 'retire';
  streamId: string;
  version: BusinessPolicyVersionRecord;
  family: BusinessPolicyFamilyMetadata;
  effectiveUntil: string;
  reason: string;
};

type CorrectWorkflow = {
  kind: 'correct';
  streamId: string;
  version: BusinessPolicyVersionRecord;
  family: BusinessPolicyFamilyMetadata;
  reason: string;
  effectiveFrom: string;
  effectiveUntil: string;
  payload: Record<string, unknown>;
};

type Workflow =
  | CreateWorkflow
  | EditWorkflow
  | PublishWorkflow
  | ReplaceWorkflow
  | RetireWorkflow
  | CorrectWorkflow;

export interface BusinessConfigurationPageProps {
  adapters?: readonly BusinessPolicyUiAdapter[];
}

export function BusinessConfigurationPage({ adapters = PRODUCTION_BUSINESS_POLICY_UI_ADAPTERS }: BusinessConfigurationPageProps) {
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [selectedStreamId, setSelectedStreamId] = useState<string | null>(null);
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Resolution tool state
  const [resolveFamilyKey, setResolveFamilyKey] = useState('');
  const [resolveCivilDate, setResolveCivilDate] = useState('');
  const [resolutionResult, setResolutionResult] = useState<BusinessPolicyResolution | null>(null);
  const [resolutionError, setResolutionError] = useState<string | null>(null);
  const [isResolving, setIsResolving] = useState(false);

  const familiesQuery = useQuery({
    queryKey: ['business-policy-families'],
    queryFn: () => businessConfigurationApi.getFamilies(),
  });

  const streamsQuery = useQuery({
    queryKey: ['business-policy-streams', page, pageSize],
    queryFn: () => businessConfigurationApi.listStreams(page, pageSize),
  });

  const selectedStreamQuery = useQuery({
    queryKey: ['business-policy-stream-detail', selectedStreamId],
    queryFn: () => businessConfigurationApi.getStream(selectedStreamId!),
    enabled: Boolean(selectedStreamId),
  });

  const invalidateData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['business-policy-families'] }),
      queryClient.invalidateQueries({ queryKey: ['business-policy-streams'] }),
      queryClient.invalidateQueries({ queryKey: ['business-policy-stream-detail', selectedStreamId] }),
    ]);
  };

  const clearFeedback = () => {
    setFormError(null);
    setSuccessMessage(null);
  };

  const createMutation = useMutation({
    mutationFn: (input: CreateDraftInput) => businessConfigurationApi.createDraft(input),
    onMutate: clearFeedback,
    onSuccess: async (res) => {
      setWorkflow(null);
      setSuccessMessage('Đã tạo bản nháp chính sách nghiệp vụ mới.');
      if (res.streamId) {
        setSelectedStreamId(res.streamId);
      }
      await invalidateData();
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      setFormError(translatePolicyError(msg));
    },
  });

  const editMutation = useMutation({
    mutationFn: ({ versionId, input }: { versionId: string; input: EditDraftInput }) =>
      businessConfigurationApi.editDraft(versionId, input),
    onMutate: clearFeedback,
    onSuccess: async () => {
      setWorkflow(null);
      setSuccessMessage('Đã cập nhật nội dung bản nháp.');
      await invalidateData();
    },
    onError: async (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      setFormError(translatePolicyError(msg));
      await invalidateData();
    },
  });

  const publishMutation = useMutation({
    mutationFn: (versionId: string) => businessConfigurationApi.publish(versionId),
    onMutate: clearFeedback,
    onSuccess: async () => {
      setWorkflow(null);
      setSuccessMessage('Đã công bố chính sách nghiệp vụ thành công.');
      await invalidateData();
    },
    onError: async (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      setFormError(translatePolicyError(msg));
      await invalidateData();
    },
  });

  const replaceMutation = useMutation({
    mutationFn: ({ versionId, input }: { versionId: string; input: ReplaceInput }) =>
      businessConfigurationApi.replace(versionId, input),
    onMutate: clearFeedback,
    onSuccess: async () => {
      setWorkflow(null);
      setSuccessMessage('Đã tạo phiên bản thay thế trong tương lai thành công.');
      await invalidateData();
    },
    onError: async (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      setFormError(translatePolicyError(msg));
      await invalidateData();
    },
  });

  const retireMutation = useMutation({
    mutationFn: ({ versionId, input }: { versionId: string; input: RetireInput }) =>
      businessConfigurationApi.retire(versionId, input),
    onMutate: clearFeedback,
    onSuccess: async () => {
      setWorkflow(null);
      setSuccessMessage('Đã kết thúc hiệu lực chính sách thành công.');
      await invalidateData();
    },
    onError: async (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      setFormError(translatePolicyError(msg));
      await invalidateData();
    },
  });

  const correctMutation = useMutation({
    mutationFn: ({ versionId, input }: { versionId: string; input: CorrectInput }) =>
      businessConfigurationApi.correct(versionId, input),
    onMutate: clearFeedback,
    onSuccess: async () => {
      setWorkflow(null);
      setSuccessMessage('Đã thực hiện sửa sai lịch sử: phiên bản trước đã đảo ngược và phiên bản hiệu chỉnh đã được công bố.');
      await invalidateData();
    },
    onError: async (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      setFormError(translatePolicyError(msg));
      await invalidateData();
    },
  });

  // Action handlers
  const handleStartCreate = (family: BusinessPolicyFamilyMetadata) => {
    clearFeedback();
    const match = matchUiAdapter(adapters, family);
    if (!match.isEligibleForMutation || !match.adapter) {
      setFormError(match.mismatchReason ?? 'Không thể tạo bản nháp cho nhóm chính sách này.');
      return;
    }
    const initialPayload = match.adapter.initialPayload();
    setWorkflow({
      kind: 'create',
      familyKey: family.key,
      resource: { kind: family.resourceKind } as BusinessConfigurationResource,
      effectiveFrom: '',
      effectiveUntil: '',
      payload: initialPayload,
    });
  };

  const handleStartEdit = (version: BusinessPolicyVersionRecord, family: BusinessPolicyFamilyMetadata, streamId: string) => {
    clearFeedback();
    const match = matchUiAdapter(adapters, family);
    if (!match.isEligibleForMutation || !match.adapter) {
      setFormError(match.mismatchReason ?? 'Không thể chỉnh sửa bản nháp vì nhóm chính sách này chưa có giao diện quản trị đã được phê duyệt.');
      return;
    }
    setWorkflow({
      kind: 'edit',
      streamId,
      version,
      family,
      payload: { ...version.payload },
    });
  };

  const handleStartPublish = (version: BusinessPolicyVersionRecord, family: BusinessPolicyFamilyMetadata, streamId: string) => {
    clearFeedback();
    const match = matchUiAdapter(adapters, family);
    if (!match.isEligibleForMutation || !match.adapter) {
      setFormError(match.mismatchReason ?? 'Không thể công bố vì nhóm chính sách này chưa có giao diện quản trị đã được phê duyệt.');
      return;
    }
    setWorkflow({
      kind: 'publish',
      streamId,
      version,
      family,
    });
  };

  const handleStartReplace = (version: BusinessPolicyVersionRecord, family: BusinessPolicyFamilyMetadata, streamId: string) => {
    clearFeedback();
    const match = matchUiAdapter(adapters, family);
    if (!match.isEligibleForMutation || !match.adapter) {
      setFormError(match.mismatchReason ?? 'Không thể thay thế vì nhóm chính sách này chưa có giao diện quản trị đã được phê duyệt.');
      return;
    }
    setWorkflow({
      kind: 'replace',
      streamId,
      version,
      family,
      effectiveFrom: '',
      payload: match.adapter.initialPayload(),
    });
  };

  const handleStartRetire = (version: BusinessPolicyVersionRecord, family: BusinessPolicyFamilyMetadata, streamId: string) => {
    clearFeedback();
    setWorkflow({
      kind: 'retire',
      streamId,
      version,
      family,
      effectiveUntil: '',
      reason: '',
    });
  };

  const handleStartCorrect = (version: BusinessPolicyVersionRecord, family: BusinessPolicyFamilyMetadata, streamId: string) => {
    clearFeedback();
    const match = matchUiAdapter(adapters, family);
    if (!match.isEligibleForMutation || !match.adapter) {
      setFormError(match.mismatchReason ?? 'Không thể sửa sai vì nhóm chính sách này chưa có giao diện quản trị đã được phê duyệt.');
      return;
    }
    setWorkflow({
      kind: 'correct',
      streamId,
      version,
      family,
      reason: '',
      effectiveFrom: normalizeCivilDate(version.effectiveFrom) ?? '',
      effectiveUntil: normalizeCivilDate(version.effectiveUntil) ?? '',
      payload: { ...version.payload },
    });
  };

  // Submit handlers
  const handleSubmitCreate = (e: FormEvent) => {
    e.preventDefault();
    if (workflow?.kind !== 'create') return;
    const adapter = findUiAdapter(adapters, workflow.familyKey);
    if (!adapter) {
      setFormError('Nhóm chính sách này chưa có giao diện quản trị đã được phê duyệt.');
      return;
    }
    if (!isValidCivilDate(workflow.effectiveFrom)) {
      setFormError('Ngày bắt đầu hiệu lực phải là ngày dân sự hợp lệ (YYYY-MM-DD).');
      return;
    }
    if (workflow.effectiveUntil && !isValidCivilDate(workflow.effectiveUntil)) {
      setFormError('Ngày kết thúc hiệu lực phải là ngày dân sự hợp lệ (YYYY-MM-DD).');
      return;
    }
    const valResult = adapter.validatePayload(workflow.payload);
    if (!valResult.valid) {
      setFormError(valResult.error);
      return;
    }
    createMutation.mutate({
      family: workflow.familyKey,
      resource: workflow.resource,
      payload: valResult.payload,
      effectiveFrom: workflow.effectiveFrom,
      ...(workflow.effectiveUntil ? { effectiveUntil: workflow.effectiveUntil } : {}),
    });
  };

  const handleSubmitEdit = (e: FormEvent) => {
    e.preventDefault();
    if (workflow?.kind !== 'edit') return;
    const adapter = findUiAdapter(adapters, workflow.family.key);
    if (!adapter) {
      setFormError('Nhóm chính sách này chưa có giao diện quản trị đã được phê duyệt.');
      return;
    }
    const valResult = adapter.validatePayload(workflow.payload);
    if (!valResult.valid) {
      setFormError(valResult.error);
      return;
    }
    editMutation.mutate({
      versionId: workflow.version.id,
      input: {
        payload: valResult.payload,
        expectedRevision: workflow.version.draftRevision,
      },
    });
  };

  const handleSubmitPublish = (e: FormEvent) => {
    e.preventDefault();
    if (workflow?.kind !== 'publish') return;
    publishMutation.mutate(workflow.version.id);
  };

  const handleSubmitReplace = (e: FormEvent) => {
    e.preventDefault();
    if (workflow?.kind !== 'replace') return;
    const adapter = findUiAdapter(adapters, workflow.family.key);
    if (!adapter) {
      setFormError('Nhóm chính sách này chưa có giao diện quản trị đã được phê duyệt.');
      return;
    }
    if (!isValidCivilDate(workflow.effectiveFrom)) {
      setFormError('Ngày bắt đầu hiệu lực mới phải là ngày dân sự hợp lệ (YYYY-MM-DD).');
      return;
    }
    const valResult = adapter.validatePayload(workflow.payload);
    if (!valResult.valid) {
      setFormError(valResult.error);
      return;
    }
    replaceMutation.mutate({
      versionId: workflow.version.id,
      input: {
        effectiveFrom: workflow.effectiveFrom,
        payload: valResult.payload,
      },
    });
  };

  const handleSubmitRetire = (e: FormEvent) => {
    e.preventDefault();
    if (workflow?.kind !== 'retire') return;
    if (!isValidCivilDate(workflow.effectiveUntil)) {
      setFormError('Ngày kết thúc hiệu lực phải là ngày dân sự hợp lệ (YYYY-MM-DD).');
      return;
    }
    retireMutation.mutate({
      versionId: workflow.version.id,
      input: {
        effectiveUntil: workflow.effectiveUntil,
        ...(workflow.reason.trim() ? { reason: workflow.reason.trim() } : {}),
      },
    });
  };

  const handleSubmitCorrect = (e: FormEvent) => {
    e.preventDefault();
    if (workflow?.kind !== 'correct') return;
    if (!workflow.reason.trim()) {
      setFormError('Bắt buộc phải nhập lý do khi thực hiện sửa sai lịch sử.');
      return;
    }
    const adapter = findUiAdapter(adapters, workflow.family.key);
    if (!adapter) {
      setFormError('Nhóm chính sách này chưa có giao diện quản trị đã được phê duyệt.');
      return;
    }
    if (workflow.effectiveFrom && !isValidCivilDate(workflow.effectiveFrom)) {
      setFormError('Ngày bắt đầu hiệu lực phải là ngày dân sự hợp lệ (YYYY-MM-DD).');
      return;
    }
    if (workflow.effectiveUntil && !isValidCivilDate(workflow.effectiveUntil)) {
      setFormError('Ngày kết thúc hiệu lực phải là ngày dân sự hợp lệ (YYYY-MM-DD).');
      return;
    }
    const valResult = adapter.validatePayload(workflow.payload);
    if (!valResult.valid) {
      setFormError(valResult.error);
      return;
    }
    correctMutation.mutate({
      versionId: workflow.version.id,
      input: {
        reason: workflow.reason.trim(),
        payload: valResult.payload,
        ...(workflow.effectiveFrom ? { effectiveFrom: workflow.effectiveFrom } : {}),
        ...(workflow.effectiveUntil ? { effectiveUntil: workflow.effectiveUntil } : {}),
      },
    });
  };

  // Resolution lookup handler
  const handleResolve = async (e: FormEvent) => {
    e.preventDefault();
    setResolutionError(null);
    setResolutionResult(null);

    if (!resolveFamilyKey) {
      setResolutionError('Vui lòng chọn nhóm chính sách.');
      return;
    }
    if (!isValidCivilDate(resolveCivilDate)) {
      setResolutionError('Vui lòng nhập ngày dân sự hợp lệ (YYYY-MM-DD).');
      return;
    }

    const family = familiesQuery.data?.find((f) => f.key === resolveFamilyKey);
    const resource: BusinessConfigurationResource = family?.resourceKind === 'ACADEMIC_YEAR'
      ? { kind: 'ACADEMIC_YEAR', academicYearId: '' }
      : { kind: 'SCHOOL_WIDE' };

    setIsResolving(true);
    try {
      const res = await businessConfigurationApi.resolvePolicy({
        family: resolveFamilyKey,
        resource,
        civilDate: resolveCivilDate,
      });
      setResolutionResult(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setResolutionError(translatePolicyError(msg));
    } finally {
      setIsResolving(false);
    }
  };

  if (familiesQuery.isPending || streamsQuery.isPending) {
    return (
      <div className="management-page">
        <PageLoading />
      </div>
    );
  }

  if (familiesQuery.isError) {
    return (
      <div className="management-page">
        <QueryFailure error={familiesQuery.error} retry={() => void familiesQuery.refetch()} />
      </div>
    );
  }

  const families = familiesQuery.data ?? [];
  const streams = streamsQuery.data?.items ?? [];
  const streamsTotal = streamsQuery.data?.total ?? 0;
  const selectedStream = selectedStreamQuery.data ?? null;

  return (
    <div className="management-page business-configuration-workspace">
      <PageHeader
        eyebrow="Quản trị cấu hình"
        title="Chính sách nghiệp vụ"
      >
        Quản lý và theo dõi các luồng chính sách nghiệp vụ đã được phê duyệt và công bố theo ngày dân sự.
      </PageHeader>

      {successMessage && (
        <InlineAlert title="Thành công" tone="success">
          {successMessage}
        </InlineAlert>
      )}

      {formError && (
        <InlineAlert title="Thông báo lỗi" tone="error">
          {formError}
        </InlineAlert>
      )}

      {/* SECTION A: APPROVED POLICY FAMILIES */}
      <section className="family-section" aria-labelledby="families-heading" style={{ marginBottom: '32px' }}>
        <h2 id="families-heading" style={{ fontSize: '1.25rem', marginBottom: '16px' }}>
          Nhóm chính sách được phê duyệt
        </h2>
        {families.length === 0 ? (
          <EmptyState
            title="Chưa có nhóm chính sách nghiệp vụ nào được phê duyệt và kích hoạt."
            message="Các nhóm chính sách chỉ xuất hiện sau khi nhiệm vụ nghiệp vụ tương ứng được phê duyệt."
          />
        ) : (
          <DataTable
            label="Danh sách nhóm chính sách"
            headings={[
              'Mã nhóm',
              'Tên hiển thị',
              'Phạm vi tài nguyên',
              'Phiên bản xác thực',
              'Trạng thái công bố',
              'Quyền sở hữu',
              'Giao diện quản trị',
              'Thao tác',
            ]}
          >
            {families.map((family) => {
              const adapter = findUiAdapter(adapters, family.key);
              const match = matchUiAdapter(adapters, family);
              return (
                <tr key={family.key}>
                  <td className="technical-value">{family.key}</td>
                  <td>{adapter ? adapter.displayName : '—'}</td>
                  <td>{family.resourceKind === 'SCHOOL_WIDE' ? 'Toàn trường' : 'Năm học'}</td>
                  <td className="technical-value">{family.currentValidatorVersion}</td>
                  <td>
                    <StatusText
                      active={family.publicationEnabled}
                      activeLabel="Được phép công bố"
                      inactiveLabel="Tạm dừng công bố"
                    />
                  </td>
                  <td>{family.downstreamAuthority}</td>
                  <td>
                    {adapter ? (
                      <span style={{ color: '#246b45', fontWeight: 600 }}>Đã phê duyệt</span>
                    ) : (
                      <span className="muted-copy">Chưa có giao diện quản trị đã được phê duyệt.</span>
                    )}
                  </td>
                  <td className="row-actions">
                    {match.isEligibleForMutation ? (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => handleStartCreate(family)}
                      >
                        Tạo bản nháp
                      </Button>
                    ) : (
                      <span className="muted-copy" style={{ fontSize: '0.8rem' }}>
                        {match.mismatchReason}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </DataTable>
        )}
      </section>

      {/* SECTION D: WORKFLOW FORM (IF ACTIVE) */}
      {workflow && (
        <section
          className="inline-work-form"
          aria-labelledby="workflow-heading"
          style={{
            borderLeftColor: workflow.kind === 'correct' ? '#a32929' : '#1f4358',
          }}
        >
          {workflow.kind === 'create' && (
            <form onSubmit={handleSubmitCreate}>
              <h2 id="workflow-heading">Tạo bản nháp chính sách nghiệp vụ</h2>
              <div className="form-grid">
                <FormField
                  id="create-family"
                  label="Nhóm chính sách"
                  value={workflow.familyKey}
                  readOnly
                  disabled
                />
                <FormField
                  id="create-resource"
                  label="Phạm vi tài nguyên"
                  value={workflow.resource.kind === 'SCHOOL_WIDE' ? 'Toàn trường (SCHOOL_WIDE)' : 'Năm học (ACADEMIC_YEAR)'}
                  readOnly
                  disabled
                />
                <FormField
                  id="create-effective-from"
                  label="Ngày bắt đầu hiệu lực (YYYY-MM-DD)"
                  type="date"
                  required
                  value={workflow.effectiveFrom}
                  onChange={(e) => setWorkflow({ ...workflow, effectiveFrom: e.target.value })}
                />
                <FormField
                  id="create-effective-until"
                  label="Ngày kết thúc hiệu lực (Tùy chọn)"
                  type="date"
                  value={workflow.effectiveUntil}
                  onChange={(e) => setWorkflow({ ...workflow, effectiveUntil: e.target.value })}
                />
              </div>

              {(() => {
                const adapter = findUiAdapter(adapters, workflow.familyKey);
                if (!adapter) return null;
                const Editor = adapter.EditorComponent;
                return (
                  <div style={{ marginTop: '16px' }}>
                    <h3 style={{ fontSize: '1rem', marginBottom: '8px' }}>Nội dung chính sách (Theo mẫu phê duyệt)</h3>
                    <Editor
                      value={workflow.payload}
                      onChange={(next) => setWorkflow({ ...workflow, payload: next as Record<string, unknown> })}
                      disabled={createMutation.isPending}
                    />
                  </div>
                );
              })()}

              <div className="form-actions" style={{ marginTop: '20px', display: 'flex', gap: '12px' }}>
                <Button type="submit" loading={createMutation.isPending}>
                  Lưu bản nháp
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={createMutation.isPending}
                  onClick={() => setWorkflow(null)}
                >
                  Hủy
                </Button>
              </div>
            </form>
          )}

          {workflow.kind === 'edit' && (
            <form onSubmit={handleSubmitEdit}>
              <h2 id="workflow-heading">Chỉnh sửa bản nháp chính sách</h2>
              <p className="muted-copy" style={{ marginBottom: '16px' }}>
                Phiên bản v{workflow.version.versionNumber} · Lần sửa đổi hiện tại: {workflow.version.draftRevision}
              </p>
              {(() => {
                const adapter = findUiAdapter(adapters, workflow.family.key);
                if (!adapter) return null;
                const Editor = adapter.EditorComponent;
                return (
                  <div>
                    <Editor
                      value={workflow.payload}
                      onChange={(next) => setWorkflow({ ...workflow, payload: next as Record<string, unknown> })}
                      disabled={editMutation.isPending}
                    />
                  </div>
                );
              })()}
              <div className="form-actions" style={{ marginTop: '20px', display: 'flex', gap: '12px' }}>
                <Button type="submit" loading={editMutation.isPending}>
                  Lưu thay đổi
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={editMutation.isPending}
                  onClick={() => setWorkflow(null)}
                >
                  Hủy
                </Button>
              </div>
            </form>
          )}

          {workflow.kind === 'publish' && (
            <form onSubmit={handleSubmitPublish}>
              <h2 id="workflow-heading">Xác nhận công bố chính sách nghiệp vụ</h2>
              <p style={{ marginBlock: '12px 20px' }}>
                Bạn có chắc chắn muốn công bố phiên bản <strong>v{workflow.version.versionNumber}</strong> của nhóm{' '}
                <strong>{workflow.family.key}</strong>? Sau khi công bố, chính sách sẽ có hiệu lực từ ngày{' '}
                <strong>{normalizeCivilDate(workflow.version.effectiveFrom)}</strong>.
              </p>
              <div className="form-actions" style={{ display: 'flex', gap: '12px' }}>
                <Button type="submit" loading={publishMutation.isPending}>
                  Công bố chính thức
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={publishMutation.isPending}
                  onClick={() => setWorkflow(null)}
                >
                  Hủy
                </Button>
              </div>
            </form>
          )}

          {workflow.kind === 'replace' && (
            <form onSubmit={handleSubmitReplace}>
              <h2 id="workflow-heading">Thay đổi chính sách trong tương lai</h2>
              <div className="limitation-note" style={{ marginBlock: '12px' }}>
                <strong>Lưu ý:</strong> Ngày hiệu lực được máy chủ kiểm tra theo ngày nghiệp vụ. Phiên bản hiện tại sẽ tự động được kết thúc hiệu lực vào ngày liền kề trước ngày bắt đầu mới.
              </div>
              <div className="form-grid">
                <FormField
                  id="replace-effective-from"
                  label="Ngày bắt đầu hiệu lực mới (YYYY-MM-DD)"
                  type="date"
                  required
                  value={workflow.effectiveFrom}
                  onChange={(e) => setWorkflow({ ...workflow, effectiveFrom: e.target.value })}
                />
              </div>
              {(() => {
                const adapter = findUiAdapter(adapters, workflow.family.key);
                if (!adapter) return null;
                const Editor = adapter.EditorComponent;
                return (
                  <div style={{ marginTop: '16px' }}>
                    <h3 style={{ fontSize: '1rem', marginBottom: '8px' }}>Nội dung chính sách mới</h3>
                    <Editor
                      value={workflow.payload}
                      onChange={(next) => setWorkflow({ ...workflow, payload: next as Record<string, unknown> })}
                      disabled={replaceMutation.isPending}
                    />
                  </div>
                );
              })()}
              <div className="form-actions" style={{ marginTop: '20px', display: 'flex', gap: '12px' }}>
                <Button type="submit" loading={replaceMutation.isPending}>
                  Xác nhận thay thế
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={replaceMutation.isPending}
                  onClick={() => setWorkflow(null)}
                >
                  Hủy
                </Button>
              </div>
            </form>
          )}

          {workflow.kind === 'retire' && (
            <form onSubmit={handleSubmitRetire}>
              <h2 id="workflow-heading">Kết thúc hiệu lực chính sách</h2>
              <div className="limitation-note" style={{ marginBlock: '12px' }}>
                <strong>Lưu ý:</strong> Ngày kết thúc hiệu lực được máy chủ kiểm tra theo ngày nghiệp vụ.
              </div>
              <div className="form-grid">
                <FormField
                  id="retire-effective-until"
                  label="Ngày kết thúc hiệu lực (YYYY-MM-DD)"
                  type="date"
                  required
                  value={workflow.effectiveUntil}
                  onChange={(e) => setWorkflow({ ...workflow, effectiveUntil: e.target.value })}
                />
              </div>
              <TextareaField
                id="retire-reason"
                label="Lý do kết thúc (Tùy chọn)"
                value={workflow.reason}
                onChange={(e) => setWorkflow({ ...workflow, reason: e.target.value })}
              />
              <div className="form-actions" style={{ marginTop: '20px', display: 'flex', gap: '12px' }}>
                <Button type="submit" loading={retireMutation.isPending}>
                  Xác nhận kết thúc
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={retireMutation.isPending}
                  onClick={() => setWorkflow(null)}
                >
                  Hủy
                </Button>
              </div>
            </form>
          )}

          {workflow.kind === 'correct' && (
            <form onSubmit={handleSubmitCorrect}>
              <h2 id="workflow-heading" style={{ color: '#a32929' }}>
                Sửa sai lịch sử chính sách nghiệp vụ
              </h2>
              <div className="alert alert--error" style={{ marginBlock: '12px' }}>
                <strong>Cảnh báo:</strong> Thao tác này sẽ đảo ngược (REVERSED) phiên bản <strong>v{workflow.version.versionNumber}</strong> và tạo một phiên bản mới thay thế đã hiệu chỉnh. Lịch sử đảo ngược được lưu vết vĩnh viễn trong nhật ký kiểm toán.
              </div>
              <TextareaField
                id="correct-reason"
                label="Lý do sửa sai lịch sử (Bắt buộc)"
                required
                value={workflow.reason}
                onChange={(e) => setWorkflow({ ...workflow, reason: e.target.value })}
                hint="Nhập giải trình rõ ràng về sai sót lịch sử cần hiệu chỉnh."
              />
              <div className="form-grid" style={{ marginTop: '12px' }}>
                <FormField
                  id="correct-effective-from"
                  label="Ngày bắt đầu hiệu lực (Tùy chọn thay đổi)"
                  type="date"
                  value={workflow.effectiveFrom}
                  onChange={(e) => setWorkflow({ ...workflow, effectiveFrom: e.target.value })}
                />
                <FormField
                  id="correct-effective-until"
                  label="Ngày kết thúc hiệu lực (Tùy chọn thay đổi)"
                  type="date"
                  value={workflow.effectiveUntil}
                  onChange={(e) => setWorkflow({ ...workflow, effectiveUntil: e.target.value })}
                />
              </div>
              {(() => {
                const adapter = findUiAdapter(adapters, workflow.family.key);
                if (!adapter) return null;
                const Editor = adapter.EditorComponent;
                return (
                  <div style={{ marginTop: '16px' }}>
                    <h3 style={{ fontSize: '1rem', marginBottom: '8px' }}>Nội dung hiệu chỉnh</h3>
                    <Editor
                      value={workflow.payload}
                      onChange={(next) => setWorkflow({ ...workflow, payload: next as Record<string, unknown> })}
                      disabled={correctMutation.isPending}
                    />
                  </div>
                );
              })()}
              <div className="form-actions" style={{ marginTop: '20px', display: 'flex', gap: '12px' }}>
                <Button type="submit" loading={correctMutation.isPending} className="button--danger">
                  Xác nhận sửa sai
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={correctMutation.isPending}
                  onClick={() => setWorkflow(null)}
                >
                  Hủy
                </Button>
              </div>
            </form>
          )}
        </section>
      )}

      {/* SECTION B: POLICY STREAMS LIST */}
      <section className="streams-section" aria-labelledby="streams-heading" style={{ marginBottom: '32px' }}>
        <h2 id="streams-heading" style={{ fontSize: '1.25rem', marginBottom: '16px' }}>
          Danh sách luồng chính sách
        </h2>
        {streams.length === 0 ? (
          <EmptyState
            title="Chưa có luồng chính sách nào"
            message="Các luồng chính sách sẽ xuất hiện tại đây khi bản nháp đầu tiên được tạo."
          />
        ) : (
          <>
            <DataTable
              label="Danh sách luồng chính sách"
              headings={[
                'Nhóm chính sách',
                'Phạm vi tài nguyên',
                'Phiên bản mới nhất',
                'Trạng thái gần nhất',
                'Thời gian hiệu lực',
                'Thao tác',
              ]}
            >
              {streams.map((stream) => {
                const latestVersion = stream.versions?.[0];
                const adapter = findUiAdapter(adapters, stream.familyKey);
                const isSelected = selectedStreamId === stream.id;
                return (
                  <tr key={stream.id} style={{ background: isSelected ? '#f3f6f7' : undefined }}>
                    <td>
                      <strong>{adapter ? adapter.displayName : stream.familyKey}</strong>
                      <span className="table-secondary technical-value">{stream.familyKey}</span>
                    </td>
                    <td>
                      {stream.resourceKind === 'SCHOOL_WIDE'
                        ? 'Toàn trường'
                        : `Năm học (${stream.academicYearId})`}
                    </td>
                    <td>{latestVersion ? `v${latestVersion.versionNumber}` : '—'}</td>
                    <td>
                      {latestVersion ? (
                        <StatusText
                          active={latestVersion.status === 'PUBLISHED'}
                          activeLabel="Đã công bố"
                          inactiveLabel={
                            latestVersion.status === 'DRAFT'
                              ? 'Bản nháp'
                              : 'Đã đảo ngược (sửa sai)'
                          }
                          inactiveTone={latestVersion.status === 'REVERSED' ? 'error' : 'warning'}
                        />
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      {latestVersion ? (
                        <span>
                          Từ <strong>{normalizeCivilDate(latestVersion.effectiveFrom)}</strong> đến{' '}
                          <strong>
                            {latestVersion.effectiveUntil
                              ? normalizeCivilDate(latestVersion.effectiveUntil)
                              : 'Không thời hạn'}
                          </strong>
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="row-actions">
                      <Button
                        type="button"
                        variant={isSelected ? 'primary' : 'secondary'}
                        onClick={() => {
                          clearFeedback();
                          setSelectedStreamId(isSelected ? null : stream.id);
                        }}
                      >
                        {isSelected ? 'Đóng chi tiết' : 'Xem lịch sử'}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </DataTable>
            {streamsTotal > pageSize && (
              <Pagination
                page={page}
                pageSize={pageSize}
                total={streamsTotal}
                onPage={(p) => setPage(p)}
              />
            )}
          </>
        )}
      </section>

      {/* SECTION C: SELECTED STREAM HISTORY */}
      {selectedStream && (
        <section
          className="stream-detail-section"
          aria-labelledby="detail-heading"
          style={{
            marginBottom: '32px',
            border: '1px solid #c9d4da',
            padding: '24px',
            background: '#fff',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 id="detail-heading" style={{ fontSize: '1.25rem', margin: 0 }}>
              Chi tiết luồng và lịch sử phiên bản
            </h2>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setSelectedStreamId(null)}
            >
              Đóng chi tiết
            </Button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '20px', padding: '12px', background: '#f8fafb', border: '1px solid #e1e8ec' }}>
            <div>
              <span className="muted-copy" style={{ fontSize: '0.8rem' }}>Mã luồng:</span>
              <div className="technical-value" style={{ fontSize: '0.8rem' }}>{selectedStream.id}</div>
            </div>
            <div>
              <span className="muted-copy" style={{ fontSize: '0.8rem' }}>Nhóm chính sách:</span>
              <div>{selectedStream.familyKey}</div>
            </div>
            <div>
              <span className="muted-copy" style={{ fontSize: '0.8rem' }}>Phạm vi:</span>
              <div>{selectedStream.resourceKind === 'SCHOOL_WIDE' ? 'Toàn trường' : 'Năm học'}</div>
            </div>
          </div>

          <h3 style={{ fontSize: '1.05rem', marginBottom: '12px' }}>Các phiên bản đã lưu trữ</h3>

          {(!selectedStream.versions || selectedStream.versions.length === 0) ? (
            <EmptyState title="Chưa có phiên bản nào" message="Luồng này chưa có phiên bản được tạo." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {selectedStream.versions.map((ver) => {
                const family = families.find((f) => f.key === selectedStream.familyKey);
                const adapter = findUiAdapter(adapters, selectedStream.familyKey);
                const match = family ? matchUiAdapter(adapters, family) : { isEligibleForMutation: false };
                const isOpenEnded = ver.status === 'PUBLISHED' && !ver.effectiveUntil;

                return (
                  <div
                    key={ver.id}
                    className="version-card"
                    style={{
                      border: '1px solid #c9d4da',
                      borderLeft: `5px solid ${ver.status === 'PUBLISHED' ? '#246b45' : ver.status === 'REVERSED' ? '#a32929' : '#7a4b00'}`,
                      padding: '16px',
                      background: '#fff',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                      <div>
                        <span style={{ fontSize: '1.1rem', fontWeight: 700, marginRight: '12px' }}>
                          Phiên bản v{ver.versionNumber}
                        </span>
                        <StatusText
                          active={ver.status === 'PUBLISHED'}
                          activeLabel="Đã công bố"
                          inactiveLabel={
                            ver.status === 'DRAFT'
                              ? 'Bản nháp'
                              : 'Đã đảo ngược (sửa sai)'
                          }
                          inactiveTone={ver.status === 'REVERSED' ? 'error' : 'warning'}
                        />
                        <span className="technical-value" style={{ marginLeft: '12px', fontSize: '0.8rem', color: '#49616f' }}>
                          Xác thực: {ver.validatorVersion}
                        </span>
                      </div>

                      {/* Action buttons fail-closed */}
                      <div className="row-actions">
                        {ver.status === 'DRAFT' && match.isEligibleForMutation && family && (
                          <>
                            <Button
                              type="button"
                              variant="secondary"
                              onClick={() => handleStartEdit(ver, family, selectedStream.id)}
                            >
                              Chỉnh sửa bản nháp
                            </Button>
                            <Button
                              type="button"
                              variant="primary"
                              onClick={() => handleStartPublish(ver, family, selectedStream.id)}
                            >
                              Công bố
                            </Button>
                          </>
                        )}

                        {ver.status === 'PUBLISHED' && match.isEligibleForMutation && family && (
                          <>
                            {isOpenEnded && (
                              <>
                                <Button
                                  type="button"
                                  variant="secondary"
                                  onClick={() => handleStartReplace(ver, family, selectedStream.id)}
                                >
                                  Thay đổi trong tương lai
                                </Button>
                                <Button
                                  type="button"
                                  variant="secondary"
                                  onClick={() => handleStartRetire(ver, family, selectedStream.id)}
                                >
                                  Kết thúc hiệu lực
                                </Button>
                              </>
                            )}
                            <Button
                              type="button"
                              variant="secondary"
                              onClick={() => handleStartCorrect(ver, family, selectedStream.id)}
                              style={{ color: '#a32929', borderColor: '#a32929' }}
                            >
                              Sửa sai lịch sử
                            </Button>
                          </>
                        )}

                        {ver.status === 'REVERSED' && (
                          <span className="muted-copy" style={{ fontSize: '0.82rem', fontStyle: 'italic' }}>
                            Bản ghi chỉ đọc (Đã sửa sai)
                          </span>
                        )}

                        {!match.isEligibleForMutation && ver.status !== 'REVERSED' && (
                          <span className="muted-copy" style={{ fontSize: '0.8rem' }}>
                            Chưa có giao diện quản trị đã được phê duyệt.
                          </span>
                        )}
                      </div>
                    </div>

                    <div style={{ marginBlock: '10px 14px', fontSize: '0.9rem' }}>
                      Hiệu lực: Từ <strong>{normalizeCivilDate(ver.effectiveFrom)}</strong> đến{' '}
                      <strong>{ver.effectiveUntil ? normalizeCivilDate(ver.effectiveUntil) : 'Không thời hạn'}</strong>
                      {ver.status === 'DRAFT' && (
                        <span style={{ marginLeft: '16px', color: '#7a4b00', fontWeight: 600 }}>
                          (Lần sửa đổi nháp: {ver.draftRevision})
                        </span>
                      )}
                    </div>

                    {/* Lineage and provenance evidence */}
                    {(ver.replacesVersionId || ver.correctsVersionId || ver.correctionReason || ver.reversedAt) && (
                      <div
                        style={{
                          marginBlock: '8px 14px',
                          padding: '8px 12px',
                          background: '#f8fafb',
                          border: '1px solid #e1e8ec',
                          fontSize: '0.85rem',
                        }}
                      >
                        {ver.replacesVersionId && (
                          <div>Thay thế cho phiên bản ID: <span className="technical-value">{ver.replacesVersionId}</span></div>
                        )}
                        {ver.correctsVersionId && (
                          <div>Hiệu chỉnh cho phiên bản ID: <span className="technical-value">{ver.correctsVersionId}</span></div>
                        )}
                        {ver.correctionReason && (
                          <div style={{ color: '#a32929', fontWeight: 600 }}>
                            Lý do sửa sai: {ver.correctionReason}
                          </div>
                        )}
                        {ver.reversedAt && (
                          <div className="muted-copy">
                            Đã đảo ngược lúc: {formatAuditTimestamp(ver.reversedAt)}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Typed payload display */}
                    <div style={{ marginTop: '12px' }}>
                      <h4 style={{ fontSize: '0.9rem', color: '#49616f', marginBottom: '6px' }}>
                        Nội dung chính sách:
                      </h4>
                      {adapter ? (
                        <div style={{ padding: '10px', background: '#f8fafb', border: '1px solid #c9d4da' }}>
                          <adapter.SummaryComponent payload={ver.payload} />
                        </div>
                      ) : (
                        <p className="muted-copy" style={{ fontStyle: 'italic', fontSize: '0.85rem' }}>
                          Không thể hiển thị nội dung chi tiết vì nhóm chính sách chưa có giao diện quản trị đã được phê duyệt.
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* SECTION E: EXACT-DATE RESOLUTION LOOKUP TOOL */}
      <section
        className="resolution-lookup-section"
        aria-labelledby="resolution-heading"
        style={{
          borderTop: '2px solid #1f4358',
          paddingTop: '24px',
          marginTop: '40px',
        }}
      >
        <h2 id="resolution-heading" style={{ fontSize: '1.25rem', marginBottom: '8px' }}>
          Kiểm tra chính sách theo ngày
        </h2>
        <p className="muted-copy" style={{ marginBottom: '20px' }}>
          Tra cứu chính sách có hiệu lực chính xác cho một ngày dân sự cụ thể. Không sử dụng giờ cục bộ của trình duyệt làm căn cứ hiệu lực.
        </p>

        <form onSubmit={handleResolve} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', alignItems: 'end', marginBottom: '24px' }}>
          <SelectField
            id="resolve-family"
            label="Nhóm chính sách"
            value={resolveFamilyKey}
            onChange={(e) => setResolveFamilyKey(e.target.value)}
            required
          >
            <option value="">-- Chọn nhóm chính sách --</option>
            {families.map((f) => {
              const adapter = findUiAdapter(adapters, f.key);
              return (
                <option key={f.key} value={f.key}>
                  {adapter ? `${adapter.displayName} (${f.key})` : f.key}
                </option>
              );
            })}
          </SelectField>

          <FormField
            id="resolve-civil-date"
            label="Ngày dân sự cần tra cứu (YYYY-MM-DD)"
            type="date"
            required
            value={resolveCivilDate}
            onChange={(e) => setResolveCivilDate(e.target.value)}
          />

          <div>
            <Button type="submit" loading={isResolving}>
              Tra cứu
            </Button>
          </div>
        </form>

        {resolutionError && (
          <InlineAlert title="Lỗi tra cứu" tone="error">
            {resolutionError}
          </InlineAlert>
        )}

        {resolutionResult && (
          <div
            className="resolution-result-card"
            style={{
              padding: '16px 20px',
              border: '1px solid #c9d4da',
              borderLeft: `6px solid ${
                resolutionResult.outcome === 'RESOLVED'
                  ? '#246b45'
                  : resolutionResult.outcome === 'POLICY_NOT_CONFIGURED'
                  ? '#7a4b00'
                  : '#a32929'
              }`,
              background: '#fff',
            }}
          >
            <h3 style={{ fontSize: '1.05rem', marginBottom: '8px' }}>
              Kết quả tra cứu: {resolutionResult.outcome}
            </h3>

            {resolutionResult.outcome === 'RESOLVED' && (
              <div>
                <p style={{ marginBlock: '4px 8px' }}>
                  Tìm thấy chính sách có hiệu lực: Phiên bản{' '}
                  <span className="technical-value">ID {resolutionResult.policyVersionId}</span> (Bộ xác thực:{' '}
                  <span className="technical-value">{resolutionResult.validatorVersion}</span>)
                </p>
                <p style={{ marginBlock: '4px 12px' }}>
                  Hiệu lực từ <strong>{normalizeCivilDate(resolutionResult.effectiveFrom)}</strong> đến{' '}
                  <strong>
                    {resolutionResult.effectiveUntil
                      ? normalizeCivilDate(resolutionResult.effectiveUntil)
                      : 'Không thời hạn'}
                  </strong>
                </p>
                {(() => {
                  const adapter = findUiAdapter(adapters, resolutionResult.family);
                  if (adapter && resolutionResult.payload) {
                    const Summary = adapter.SummaryComponent;
                    return (
                      <div style={{ padding: '12px', background: '#f8fafb', border: '1px solid #c9d4da' }}>
                        <h4 style={{ fontSize: '0.9rem', marginBottom: '8px', color: '#49616f' }}>Nội dung áp dụng:</h4>
                        <Summary payload={resolutionResult.payload} />
                      </div>
                    );
                  }
                  return (
                    <p className="muted-copy" style={{ fontStyle: 'italic' }}>
                      Không thể hiển thị nội dung chi tiết vì nhóm chính sách chưa có giao diện quản trị đã được phê duyệt.
                    </p>
                  );
                })()}
              </div>
            )}

            {resolutionResult.outcome === 'POLICY_NOT_CONFIGURED' && (
              <p style={{ color: '#7a4b00', margin: 0 }}>
                Chưa có chính sách nào được cấu hình cho phạm vi và ngày dân sự này (POLICY_NOT_CONFIGURED).
              </p>
            )}

            {resolutionResult.outcome === 'POLICY_AMBIGUOUS' && (
              <p style={{ color: '#a32929', margin: 0 }}>
                Sự cố tính toàn vẹn: Tồn tại nhiều hơn một chính sách cùng có hiệu lực cho ngày này (POLICY_AMBIGUOUS).
              </p>
            )}

            {resolutionResult.outcome === 'POLICY_CORRUPT' && (
              <p style={{ color: '#a32929', margin: 0 }}>
                Dữ liệu chính sách bị lỗi hoặc không thể kiểm tra hợp lệ bằng bộ xác thực đã lưu (POLICY_CORRUPT).
              </p>
            )}

            {resolutionResult.outcome === 'UNKNOWN_POLICY_FAMILY' && (
              <p style={{ color: '#a32929', margin: 0 }}>
                Nhóm chính sách không tồn tại trên hệ thống (UNKNOWN_POLICY_FAMILY).
              </p>
            )}

            {resolutionResult.outcome === 'INVALID_POLICY_RESOURCE' && (
              <p style={{ color: '#a32929', margin: 0 }}>
                Phạm vi tài nguyên chính sách không hợp lệ (INVALID_POLICY_RESOURCE).
              </p>
            )}

            {resolutionResult.outcome === 'INVALID_EFFECTIVE_DATE' && (
              <p style={{ color: '#a32929', margin: 0 }}>
                Ngày hiệu lực tra cứu không đúng định dạng ngày dân sự (INVALID_EFFECTIVE_DATE).
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
