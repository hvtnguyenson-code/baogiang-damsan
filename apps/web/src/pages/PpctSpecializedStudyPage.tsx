import type {
  CivilDateString,
  PpctClassAssociationRecord,
  PpctClassCurricularProfile,
} from '@baogiang/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '../components/ui/button';
import { InlineAlert } from '../components/ui/feedback';
import { FormField } from '../components/ui/form-field';
import {
  DataTable,
  EmptyState,
  MutationNotice,
  PageHeader,
  PageLoading,
  QueryFailure,
  SelectField,
} from '../components/ui/management';
import { formatCivilDate } from '../lib/academic-structure-api';
import { ApiError } from '../lib/api-client';
import { ppctApi, type SwitchPpctAssociationInput } from '../lib/ppct-api';

function isCivilDate(value: string): value is CivilDateString {
  return /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
}

export function PpctSpecializedStudyPage() {
  const queryClient = useQueryClient();

  const [selectedYearId, setSelectedYearId] = useState('');
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedSubjectId, setSelectedSubjectId] = useState('');

  const [targetVersionId, setTargetVersionId] = useState('');
  const [curricularProfile, setCurricularProfile] = useState<PpctClassCurricularProfile>('CORE_ONLY');
  const [effectiveFrom, setEffectiveFrom] = useState('');

  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // 1. Academic years
  const years = useQuery({
    queryKey: ['ppct-options', 'academic-years'],
    queryFn: () => ppctApi.years({ page: 1, pageSize: 100 }),
  });

  // Auto-select deterministic first year
  useEffect(() => {
    if (!selectedYearId && years.data?.items[0]) {
      setSelectedYearId(years.data.items[0].id);
    }
  }, [selectedYearId, years.data]);

  // 2. Workspace options (classes, subjects)
  const workspace = useQuery({
    queryKey: ['ppct-options', 'workspace', selectedYearId],
    queryFn: () => ppctApi.workspace(selectedYearId),
    enabled: Boolean(selectedYearId),
  });

  const selectedClass = workspace.data?.classes.find((c) => c.id === selectedClassId);

  // 3. Plans
  const plans = useQuery({
    queryKey: ['ppct-plans', selectedYearId, selectedSubjectId, selectedClass?.gradeLevel],
    queryFn: () =>
      ppctApi.plans(selectedYearId, {
        subjectId: selectedSubjectId,
        gradeLevel: selectedClass?.gradeLevel,
        page: 1,
        pageSize: 10,
      }),
    enabled: Boolean(selectedYearId && selectedClassId && selectedSubjectId && selectedClass?.gradeLevel),
  });

  const planList = plans.data?.items ?? [];
  const singlePlan = planList.length === 1 ? planList[0] : null;
  const multiplePlans = planList.length > 1;

  // 4. Versions for the plan
  const versions = useQuery({
    queryKey: ['ppct-versions', singlePlan?.id],
    queryFn: () => ppctApi.versions(singlePlan!.id, { page: 1, pageSize: 100 }),
    enabled: Boolean(singlePlan?.id),
  });

  const publishedVersions = (versions.data?.items ?? []).filter((v) => v.status === 'PUBLISHED');

  // Auto-select first published version
  useEffect(() => {
    if (!targetVersionId && publishedVersions.length > 0) {
      setTargetVersionId(publishedVersions[0].id);
    }
  }, [targetVersionId, publishedVersions]);

  // 5. Version content preflight (only needed for specialized profile)
  const isSpecializedProfile = curricularProfile === 'CORE_PLUS_SPECIALIZED_STUDY';
  const versionContent = useQuery({
    queryKey: ['ppct-version-content', targetVersionId],
    queryFn: () => ppctApi.versionContent(targetVersionId),
    enabled: Boolean(targetVersionId && isSpecializedProfile),
  });

  const hasSpecializedItems =
    versionContent.data?.items.some((item) => item.component === 'SPECIALIZED_STUDY') ?? false;

  // 6. Association history
  const history = useQuery({
    queryKey: ['ppct-associations', selectedYearId, selectedClassId, selectedSubjectId],
    queryFn: () => ppctApi.associationHistory(selectedYearId, selectedClassId, selectedSubjectId),
    enabled: Boolean(selectedYearId && selectedClassId && selectedSubjectId),
  });

  const sortedHistory = [...(history.data?.items ?? [])].sort(
    (a, b) =>
      b.effectiveFrom.localeCompare(a.effectiveFrom) ||
      b.createdAt.localeCompare(a.createdAt) ||
      b.id.localeCompare(a.id),
  );
  const latestAssociation = sortedHistory[0] ?? null;
  const expectedLatestAssociationId = latestAssociation ? latestAssociation.id : null;

  // 7. Mutation
  const switchMutation = useMutation({
    mutationFn: (input: SwitchPpctAssociationInput) =>
      ppctApi.switchAssociation(selectedYearId, selectedClassId, selectedSubjectId, input),
    retry: false,
    onMutate: () => {
      setSuccessMessage('');
      setErrorMessage('');
    },
    onSuccess: async () => {
      setSuccessMessage('Đã cập nhật hồ sơ áp dụng PPCT và giữ lại lịch sử trước đó.');
      setErrorMessage('');
      await queryClient.invalidateQueries({
        queryKey: ['ppct-associations', selectedYearId, selectedClassId, selectedSubjectId],
      });
    },
    onError: (error) => {
      if (
        error instanceof ApiError &&
        error.statusCode === 409 &&
        error.serverError === 'PPCT_COMPONENT_APPLICABILITY_WEEK_SPLIT'
      ) {
        setErrorMessage(
          'Ngày hiệu lực làm thay đổi hồ sơ trong cùng một tuần học. Hãy chọn ranh giới tuần hợp lệ.',
        );
        return;
      }
      if (
        error instanceof ApiError &&
        error.statusCode === 409 &&
        error.message.includes('Liên kết PPCT mới nhất của lớp đã thay đổi; hãy tải lại trước khi tiếp tục.')
      ) {
        setErrorMessage(
          'Dữ liệu áp dụng đã thay đổi. Hệ thống đã tải lại lịch sử mới nhất; hãy kiểm tra trước khi lưu lại.',
        );
        void queryClient.invalidateQueries({
          queryKey: ['ppct-associations', selectedYearId, selectedClassId, selectedSubjectId],
        });
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : 'Yêu cầu không thực hiện được.');
    },
  });

  // Event handlers
  function handleYearChange(yearId: string) {
    setSelectedYearId(yearId);
    setSelectedClassId('');
    setSelectedSubjectId('');
    setTargetVersionId('');
    setCurricularProfile('CORE_ONLY');
    setEffectiveFrom('');
    setSuccessMessage('');
    setErrorMessage('');
  }

  function handleClassChange(classId: string) {
    setSelectedClassId(classId);
    setSelectedSubjectId('');
    setTargetVersionId('');
    setCurricularProfile('CORE_ONLY');
    setEffectiveFrom('');
    setSuccessMessage('');
    setErrorMessage('');
  }

  function handleSubjectChange(subjectId: string) {
    setSelectedSubjectId(subjectId);
    setTargetVersionId('');
    setCurricularProfile('CORE_ONLY');
    setEffectiveFrom('');
    setSuccessMessage('');
    setErrorMessage('');
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!selectedYearId || !selectedClassId || !selectedSubjectId) {
      setErrorMessage('Vui lòng chọn đầy đủ Năm học, Lớp học và Môn học.');
      return;
    }
    if (!targetVersionId) {
      setErrorMessage('Vui lòng chọn phiên bản PPCT công bố.');
      return;
    }
    if (!effectiveFrom || !isCivilDate(effectiveFrom)) {
      setErrorMessage('Vui lòng chọn ngày hiệu lực hợp lệ (YYYY-MM-DD).');
      return;
    }
    if (curricularProfile === 'CORE_PLUS_SPECIALIZED_STUDY' && !hasSpecializedItems) {
      setErrorMessage('Phiên bản PPCT đích không chứa chuyên đề học tập để áp dụng hồ sơ chuyên đề.');
      return;
    }

    switchMutation.mutate({
      ppctVersionId: targetVersionId,
      curricularProfile,
      effectiveFrom: effectiveFrom as CivilDateString,
      expectedLatestAssociationId,
    });
  }

  // Preconditions for submit button
  const canSubmit = Boolean(
    selectedYearId &&
    selectedClassId &&
    selectedSubjectId &&
    singlePlan &&
    !multiplePlans &&
    versions.isSuccess &&
    publishedVersions.length > 0 &&
    targetVersionId &&
    isCivilDate(effectiveFrom) &&
    !history.isPending &&
    !history.isError &&
    (curricularProfile === 'CORE_ONLY' ||
      (isSpecializedProfile &&
        versionContent.isSuccess &&
        !versionContent.isPending &&
        !versionContent.isError &&
        hasSpecializedItems))
  );

  if (years.isPending) {
    return (
      <div className="management-page">
        <PageLoading />
      </div>
    );
  }

  if (years.isError) {
    return (
      <div className="management-page">
        <QueryFailure error={years.error} retry={() => void years.refetch()} />
      </div>
    );
  }

  if (!years.data.items.length) {
    return (
      <div className="management-page">
        <PageHeader eyebrow="Phân phối chương trình" title="Áp dụng chuyên đề">
          Quản trị hồ sơ áp dụng PPCT (cốt lõi / chuyên đề) theo từng cặp Lớp - Môn học.
        </PageHeader>
        <EmptyState
          title="Chưa có năm học"
          message="Chưa có dữ liệu năm học cho quản trị PPCT."
        />
      </div>
    );
  }

  const authorizedSubjects = workspace.data?.subjects ?? [];
  const classesList = workspace.data?.classes ?? [];

  return (
    <div className="management-page ppct-specialized-study-page">
      <PageHeader eyebrow="Phân phối chương trình" title="Áp dụng chuyên đề">
        Quản trị hồ sơ áp dụng PPCT (cốt lõi / chuyên đề) theo từng cặp Lớp - Môn học.
      </PageHeader>

      {/* Context filters: Year, Class, Subject */}
      <section className="management-page__context" aria-labelledby="ppct-context-heading">
        <h2 id="ppct-context-heading">Ngữ cảnh quản trị</h2>
        <div className="filter-bar">
          <SelectField
            label="Năm học"
            id="ppct-year"
            value={selectedYearId}
            onChange={(e) => handleYearChange(e.target.value)}
          >
            {years.data.items.map((y) => (
              <option key={y.id} value={y.id}>
                {y.code} — {y.name}
              </option>
            ))}
          </SelectField>

          {workspace.isPending ? (
            <PageLoading />
          ) : workspace.isError ? (
            <QueryFailure error={workspace.error} retry={() => void workspace.refetch()} />
          ) : (
            <>
              <SelectField
                label="Lớp học"
                id="ppct-class"
                value={selectedClassId}
                onChange={(e) => handleClassChange(e.target.value)}
              >
                <option value="">Chọn lớp học</option>
                {classesList.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} — {c.name} (Khối {c.gradeLevel})
                  </option>
                ))}
              </SelectField>

              <SelectField
                label="Môn học"
                id="ppct-subject"
                value={selectedSubjectId}
                onChange={(e) => handleSubjectChange(e.target.value)}
              >
                <option value="">Chọn môn học</option>
                {authorizedSubjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} — {s.name}
                  </option>
                ))}
              </SelectField>
            </>
          )}
        </div>
      </section>

      {/* When workspace has no authorized subjects */}
      {workspace.data && authorizedSubjects.length === 0 && (
        <EmptyState
          title="Chưa có môn học được cấp quyền"
          message="Bạn chưa được phân quyền PPCT_MANAGE cho môn học nào trong năm học này."
        />
      )}

      {/* When selections are incomplete */}
      {(!selectedClassId || !selectedSubjectId) && authorizedSubjects.length > 0 && (
        <EmptyState
          filtered
          title="Chưa chọn đủ điều kiện"
          message="Vui lòng chọn Lớp học và Môn học để xem lịch sử áp dụng và thực hiện chuyển đổi."
        />
      )}

      {/* When year + class + subject selected */}
      {selectedYearId && selectedClassId && selectedSubjectId && (
        <>
          {/* Plan invariants & validation */}
          {plans.isPending ? (
            <PageLoading />
          ) : plans.isError ? (
            <QueryFailure error={plans.error} retry={() => void plans.refetch()} />
          ) : multiplePlans ? (
            <div role="alert" className="form-field__error">
              <span aria-hidden="true">!</span> Phát hiện nhiều hơn một kế hoạch PPCT cho cùng năm học, môn và khối lớp. Vui lòng liên hệ quản trị viên.
            </div>
          ) : !singlePlan ? (
            <EmptyState
              title="Chưa có kế hoạch PPCT phù hợp"
              message="Khối lớp và môn học được chọn chưa có kế hoạch PPCT trong năm học này."
            />
          ) : (
            <>
              {/* Feedback notices */}
              {successMessage && <MutationNotice success={successMessage} />}
              {errorMessage && (
                <p className="form-field__error" role="alert">
                  <span aria-hidden="true">!</span> {errorMessage}
                </p>
              )}

              {/* Mutation form */}
              <form
                className="inline-work-form ppct-switch-form"
                onSubmit={handleSubmit}
                noValidate
              >
                <h2>Chuyển đổi hồ sơ áp dụng PPCT</h2>

                <div className="form-grid">
                  {versions.isPending ? (
                    <div className="form-field">
                      <label className="form-field__label" htmlFor="ppct-target-version">Phiên bản PPCT công bố</label>
                      <p className="form-field__hint">Đang tải danh sách phiên bản PPCT...</p>
                    </div>
                  ) : versions.isError ? (
                    <div className="form-field">
                      <label className="form-field__label" htmlFor="ppct-target-version">Phiên bản PPCT công bố</label>
                      <QueryFailure error={versions.error} retry={() => void versions.refetch()} />
                    </div>
                  ) : (
                    <SelectField
                      label="Phiên bản PPCT công bố"
                      id="ppct-target-version"
                      value={targetVersionId}
                      onChange={(e) => {
                        setTargetVersionId(e.target.value);
                        setSuccessMessage('');
                        setErrorMessage('');
                      }}
                      required
                    >
                      {publishedVersions.length === 0 ? (
                        <option value="">Chưa có phiên bản nào được công bố (PUBLISHED)</option>
                      ) : (
                        publishedVersions.map((v) => (
                          <option key={v.id} value={v.id}>
                            Bản {v.versionNumber} ({v.itemCount} bài học)
                          </option>
                        ))
                      )}
                    </SelectField>
                  )}

                  <SelectField
                    label="Hồ sơ áp dụng"
                    id="ppct-curricular-profile"
                    value={curricularProfile}
                    onChange={(e) => {
                      setCurricularProfile(e.target.value as PpctClassCurricularProfile);
                      setSuccessMessage('');
                      setErrorMessage('');
                    }}
                    required
                  >
                    <option value="CORE_ONLY">Chỉ nội dung cốt lõi</option>
                    <option value="CORE_PLUS_SPECIALIZED_STUDY">Cốt lõi + Chuyên đề</option>
                  </SelectField>

                  <div className="form-field">
                    <FormField
                      label="Hiệu lực từ"
                      name="ppct-effective-from"
                      type="date"
                      value={effectiveFrom}
                      onChange={(e) => {
                        setEffectiveFrom(e.target.value);
                        setSuccessMessage('');
                        setErrorMessage('');
                      }}
                      required
                    />
                    <p className="form-field__hint">
                      Thay đổi hồ sơ áp dụng phải bắt đầu tại ranh giới tuần học hợp lệ.
                    </p>
                  </div>
                </div>

                {/* Preflight alert / loading / error for specialized study */}
                {isSpecializedProfile && targetVersionId && (
                  <>
                    {versionContent.isPending && (
                      <p className="form-field__hint" data-testid="version-content-loading">
                        Đang kiểm tra nội dung chuyên đề của phiên bản...
                      </p>
                    )}
                    {versionContent.isError && (
                      <div className="form-field">
                        <QueryFailure
                          error={versionContent.error}
                          retry={() => void versionContent.refetch()}
                        />
                      </div>
                    )}
                    {versionContent.isSuccess && !hasSpecializedItems && (
                      <InlineAlert title="Phiên bản không có chuyên đề" tone="warning">
                        Phiên bản PPCT được chọn không chứa bài chuyên đề nào (SPECIALIZED_STUDY). Không thể áp dụng hồ sơ chuyên đề.
                      </InlineAlert>
                    )}
                  </>
                )}

                {versions.isSuccess && publishedVersions.length === 0 && (
                  <p className="limitation-note">
                    Kế hoạch PPCT chưa có phiên bản nào được công bố (PUBLISHED). Không thể chuyển đổi liên kết.
                  </p>
                )}

                <div className="form-actions">
                  <Button
                    type="submit"
                    loading={switchMutation.isPending}
                    disabled={!canSubmit || switchMutation.isPending}
                  >
                    Lưu thay đổi hồ sơ
                  </Button>
                </div>
              </form>

              {/* Association History */}
              <section aria-labelledby="ppct-history-heading">
                <h2 id="ppct-history-heading">Lịch sử áp dụng hồ sơ PPCT</h2>
                {history.isPending ? (
                  <PageLoading />
                ) : history.isError ? (
                  <QueryFailure error={history.error} retry={() => void history.refetch()} />
                ) : sortedHistory.length === 0 ? (
                  <EmptyState
                    title="Chưa có lịch sử liên kết"
                    message="Lớp và môn này chưa từng có liên kết PPCT nào. Hãy chọn phiên bản và hồ sơ để thiết lập liên kết ban đầu."
                  />
                ) : (
                  <DataTable
                    label="Lịch sử áp dụng PPCT"
                    headings={[
                      'Hiệu lực từ',
                      'Hiệu lực đến',
                      'Hồ sơ áp dụng',
                      'ID phiên bản PPCT',
                      'Trạng thái phiên bản',
                      'Nhãn / Trạng thái',
                    ]}
                  >
                    {sortedHistory.map((row) => (
                      <HistoryRow
                        key={row.id}
                        row={row}
                        isLatest={row.id === latestAssociation?.id}
                      />
                    ))}
                  </DataTable>
                )}
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}

function HistoryRow({
  row,
  isLatest,
}: {
  row: PpctClassAssociationRecord;
  isLatest: boolean;
}) {
  const profileLabel =
    row.curricularProfile === 'CORE_ONLY'
      ? 'Chỉ nội dung cốt lõi'
      : 'Cốt lõi + Chuyên đề';

  return (
    <tr>
      <td>
        <span className="technical-value">{formatCivilDate(row.effectiveFrom)}</span>
      </td>
      <td>
        {row.effectiveUntil ? (
          <span className="technical-value">{formatCivilDate(row.effectiveUntil)}</span>
        ) : (
          <span className="technical-value">Không giới hạn</span>
        )}
      </td>
      <td>
        <strong>{profileLabel}</strong>
      </td>
      <td>
        <span className="technical-value">{row.ppctVersionId}</span>
      </td>
      <td>
        <span className="status-badge status-badge--active">{row.ppctVersionStatus}</span>
      </td>
      <td>
        <div className="row-badges">
          {isLatest ? (
            <span className="status-badge status-badge--active">Mới nhất</span>
          ) : (
            <span className="technical-value">—</span>
          )}
        </div>
      </td>
    </tr>
  );
}
