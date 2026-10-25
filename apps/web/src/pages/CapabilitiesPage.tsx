import type { CapabilityDefinitionRecord, CapabilityScope, CatalogEntry, UserManagementRecord } from '@baogiang/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useAuth } from '../auth/auth-context';
import { Button } from '../components/ui/button';
import { FormField } from '../components/ui/form-field';
import { DataTable, EmptyState, MutationNotice, PageHeader, PageLoading, Pagination, QueryFailure, SelectField, StatusText } from '../components/ui/management';
import { capabilityLabels, hasSchoolCapability, scopeLabels } from '../lib/capabilities';
import { formatDateTime, isActiveWindow } from '../lib/display';
import { capabilitiesApi, catalogApi, toIso, usersApi } from '../lib/management-api';

const PAGE_SIZE = 100;

type Draft = {
  capabilityKey: string;
  scopeType: CapabilityScope | '';
  scopeResourceId: string;
  validFrom: string;
  validUntil: string;
};

function FieldPagination({
  label,
  page,
  pages,
  total,
  unit,
  onPageChange,
}: {
  label: string;
  page: number;
  pages: number;
  total: number;
  unit: string;
  onPageChange(page: number): void;
}) {
  if (pages <= 1) return null;
  return (
    <nav className="field-pagination" aria-label={label}>
      <span className="field-pagination__label">
        Trang <strong>{page}</strong> / {pages} · {total} {unit}
      </span>
      <div className="field-pagination__actions">
        <Button
          type="button"
          variant="quiet"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Trang trước
        </Button>
        <Button
          type="button"
          variant="quiet"
          disabled={page >= pages}
          onClick={() => onPageChange(page + 1)}
        >
          Trang sau
        </Button>
      </div>
    </nav>
  );
}

export function CapabilitiesPage() {
  const { auth } = useAuth();
  const queryClient = useQueryClient();
  const canUsers = hasSchoolCapability(auth?.capabilities ?? [], 'USER_MANAGE');
  const canGroups = hasSchoolCapability(auth?.capabilities ?? [], 'SUBJECT_GROUP_MANAGE');
  const canSubjects = hasSchoolCapability(auth?.capabilities ?? [], 'SUBJECT_MANAGE');

  const [userId, setUserId] = useState('');
  const [draft, setDraft] = useState<Draft>({ capabilityKey: '', scopeType: '', scopeResourceId: '', validFrom: '', validUntil: '' });
  const [revokeId, setRevokeId] = useState<string>();
  const [reason, setReason] = useState('');
  const [success, setSuccess] = useState('');

  // Pagination state for all 5 queries
  const [definitionsPage, setDefinitionsPage] = useState(1);
  const [userPage, setUserPage] = useState(1);
  const [groupPage, setGroupPage] = useState(1);
  const [subjectPage, setSubjectPage] = useState(1);
  const [grantsPage, setGrantsPage] = useState(1);

  // Cache maps to preserve items across page transitions
  const [knownUsers, setKnownUsers] = useState<Map<string, UserManagementRecord>>(() => new Map());
  const [knownGroups, setKnownGroups] = useState<Map<string, CatalogEntry>>(() => new Map());
  const [knownSubjects, setKnownSubjects] = useState<Map<string, CatalogEntry>>(() => new Map());
  const [knownDefinitions, setKnownDefinitions] = useState<Map<string, CapabilityDefinitionRecord>>(() => new Map());

  // Known totals & page sizes to maintain pagination navigation even on query failure
  const [knownUserTotal, setKnownUserTotal] = useState<number | undefined>();
  const [knownGroupTotal, setKnownGroupTotal] = useState<number | undefined>();
  const [knownSubjectTotal, setKnownSubjectTotal] = useState<number | undefined>();
  const [knownDefinitionTotal, setKnownDefinitionTotal] = useState<number | undefined>();

  const [knownUserPageSize, setKnownUserPageSize] = useState<number>(PAGE_SIZE);
  const [knownGroupPageSize, setKnownGroupPageSize] = useState<number>(PAGE_SIZE);
  const [knownSubjectPageSize, setKnownSubjectPageSize] = useState<number>(PAGE_SIZE);
  const [knownDefinitionPageSize, setKnownDefinitionPageSize] = useState<number>(PAGE_SIZE);

  // 5 queries with pagination parameters and reflective queryKeys
  const definitions = useQuery({
    queryKey: ['capabilities', 'definitions', { page: definitionsPage }],
    queryFn: () => capabilitiesApi.definitions({ page: definitionsPage, pageSize: PAGE_SIZE, isActive: true }),
  });

  const users = useQuery({
    queryKey: ['users', 'rights-lookup', { page: userPage }],
    queryFn: () => usersApi.list({ page: userPage, pageSize: PAGE_SIZE }),
    enabled: canUsers,
  });

  const groups = useQuery({
    queryKey: ['catalog', 'groups', 'rights-history-lookup', { page: groupPage }],
    queryFn: () => catalogApi('subject-groups').list({ page: groupPage, pageSize: PAGE_SIZE }),
    enabled: canGroups,
  });

  const subjects = useQuery({
    queryKey: ['catalog', 'subjects', 'rights-history-lookup', { page: subjectPage }],
    queryFn: () => catalogApi('subjects').list({ page: subjectPage, pageSize: PAGE_SIZE }),
    enabled: canSubjects,
  });

  const grants = useQuery({
    queryKey: ['rights-grants', userId, { page: grantsPage }],
    queryFn: () => capabilitiesApi.grants(userId, { page: grantsPage, pageSize: PAGE_SIZE }),
    enabled: Boolean(userId),
  });

  // Accumulate fetched records in cache maps and record known totals / page sizes
  useEffect(() => {
    if (users.data) {
      if (users.data.total !== undefined) setKnownUserTotal(users.data.total);
      if (users.data.pageSize) setKnownUserPageSize(users.data.pageSize);
      if (users.data.items) {
        setKnownUsers((prev) => {
          const next = new Map(prev);
          users.data.items.forEach((u) => next.set(u.id, u));
          return next;
        });
      }
    }
  }, [users.data]);

  useEffect(() => {
    if (groups.data) {
      if (groups.data.total !== undefined) setKnownGroupTotal(groups.data.total);
      if (groups.data.pageSize) setKnownGroupPageSize(groups.data.pageSize);
      if (groups.data.items) {
        setKnownGroups((prev) => {
          const next = new Map(prev);
          groups.data.items.forEach((g) => next.set(g.id, g));
          return next;
        });
      }
    }
  }, [groups.data]);

  useEffect(() => {
    if (subjects.data) {
      if (subjects.data.total !== undefined) setKnownSubjectTotal(subjects.data.total);
      if (subjects.data.pageSize) setKnownSubjectPageSize(subjects.data.pageSize);
      if (subjects.data.items) {
        setKnownSubjects((prev) => {
          const next = new Map(prev);
          subjects.data.items.forEach((s) => next.set(s.id, s));
          return next;
        });
      }
    }
  }, [subjects.data]);

  useEffect(() => {
    if (definitions.data) {
      if (definitions.data.total !== undefined) setKnownDefinitionTotal(definitions.data.total);
      if (definitions.data.pageSize) setKnownDefinitionPageSize(definitions.data.pageSize);
      if (definitions.data.items) {
        setKnownDefinitions((prev) => {
          const next = new Map(prev);
          definitions.data.items.forEach((d) => next.set(d.key, d));
          return next;
        });
      }
    }
  }, [definitions.data]);

  // Total pages with fallback to known totals when query has error
  const effectiveUserTotal = users.data?.total ?? knownUserTotal ?? 0;
  const userPageSize = users.data?.pageSize || knownUserPageSize;
  const userPages = Math.max(1, Math.ceil(effectiveUserTotal / userPageSize));

  const effectiveDefinitionTotal = definitions.data?.total ?? knownDefinitionTotal ?? 0;
  const definitionPageSize = definitions.data?.pageSize || knownDefinitionPageSize;
  const definitionPages = Math.max(1, Math.ceil(effectiveDefinitionTotal / definitionPageSize));

  const effectiveGroupTotal = groups.data?.total ?? knownGroupTotal ?? 0;
  const groupPageSize = groups.data?.pageSize || knownGroupPageSize;
  const groupPages = Math.max(1, Math.ceil(effectiveGroupTotal / groupPageSize));

  const effectiveSubjectTotal = subjects.data?.total ?? knownSubjectTotal ?? 0;
  const subjectPageSize = subjects.data?.pageSize || knownSubjectPageSize;
  const subjectPages = Math.max(1, Math.ceil(effectiveSubjectTotal / subjectPageSize));

  const grantsPages = Math.max(1, Math.ceil((grants.data?.total ?? 0) / (grants.data?.pageSize || PAGE_SIZE)));

  // Clamp current page when total pages decrease in loaded data
  useEffect(() => {
    if (users.data && userPage > userPages) {
      setUserPage(userPages);
    }
  }, [users.data, userPage, userPages]);

  useEffect(() => {
    if (groups.data && groupPage > groupPages) {
      setGroupPage(groupPages);
    }
  }, [groups.data, groupPage, groupPages]);

  useEffect(() => {
    if (subjects.data && subjectPage > subjectPages) {
      setSubjectPage(subjectPages);
    }
  }, [subjects.data, subjectPage, subjectPages]);

  useEffect(() => {
    if (definitions.data && definitionsPage > definitionPages) {
      setDefinitionsPage(definitionPages);
    }
  }, [definitions.data, definitionsPage, definitionPages]);

  useEffect(() => {
    if (grants.data && grantsPage > grantsPages) {
      setGrantsPage(grantsPages);
    }
  }, [grants.data, grantsPage, grantsPages]);

  // Options with retention across page changes
  const userOptions = useMemo(() => {
    const items = users.data?.items ?? [];
    if (!userId) return items;
    if (items.some((u) => u.id === userId)) return items;
    const retained = knownUsers.get(userId);
    return retained ? [retained, ...items] : items;
  }, [users.data?.items, userId, knownUsers]);

  const definitionOptions = useMemo(() => {
    const items = definitions.data?.items ?? [];
    if (!draft.capabilityKey) return items;
    if (items.some((d) => d.key === draft.capabilityKey)) return items;
    const retained = knownDefinitions.get(draft.capabilityKey);
    return retained ? [retained, ...items] : items;
  }, [definitions.data?.items, draft.capabilityKey, knownDefinitions]);

  const selected = knownDefinitions.get(draft.capabilityKey) ?? definitions.data?.items.find((item) => item.key === draft.capabilityKey);

  const resourceOptions = useMemo(() => {
    if (draft.scopeType === 'SUBJECT_GROUP') {
      const activeItems = (groups.data?.items ?? []).filter((item) => item.status === 'ACTIVE');
      if (!draft.scopeResourceId) return activeItems;
      if (activeItems.some((item) => item.id === draft.scopeResourceId)) return activeItems;
      const retained = knownGroups.get(draft.scopeResourceId);
      return retained && retained.status === 'ACTIVE' ? [retained, ...activeItems] : activeItems;
    }
    if (draft.scopeType === 'SUBJECT') {
      const activeItems = (subjects.data?.items ?? []).filter((item) => item.status === 'ACTIVE');
      if (!draft.scopeResourceId) return activeItems;
      if (activeItems.some((item) => item.id === draft.scopeResourceId)) return activeItems;
      const retained = knownSubjects.get(draft.scopeResourceId);
      return retained && retained.status === 'ACTIVE' ? [retained, ...activeItems] : activeItems;
    }
    return undefined;
  }, [draft.scopeType, draft.scopeResourceId, groups.data?.items, subjects.data?.items, knownGroups, knownSubjects]);

  const resourceReadable = draft.scopeType === 'SUBJECT_GROUP' ? canGroups : draft.scopeType === 'SUBJECT' ? canSubjects : true;

  // Mutations
  const create = useMutation({
    mutationFn: () => capabilitiesApi.create(userId, {
      capabilityKey: draft.capabilityKey,
      scopeType: draft.scopeType as CapabilityScope,
      ...((draft.scopeType === 'SUBJECT_GROUP' || draft.scopeType === 'SUBJECT') && draft.scopeResourceId ? { scopeResourceId: draft.scopeResourceId } : {}),
      validFrom: toIso(draft.validFrom),
      validUntil: toIso(draft.validUntil),
    }),
    onMutate: () => {
      setSuccess('');
      revoke.reset();
    },
    onSuccess: async () => {
      setSuccess('Đã cấp quyền.');
      setDraft({ capabilityKey: '', scopeType: '', scopeResourceId: '', validFrom: '', validUntil: '' });
      await queryClient.invalidateQueries({ queryKey: ['rights-grants', userId] });
    },
  });

  const revoke = useMutation({
    mutationFn: () => capabilitiesApi.revoke(revokeId!, reason || undefined),
    onMutate: () => {
      setSuccess('');
      create.reset();
    },
    onSuccess: async () => {
      setSuccess('Đã thu hồi quyền; lịch sử được giữ lại.');
      setRevokeId(undefined);
      setReason('');
      await queryClient.invalidateQueries({ queryKey: ['rights-grants', userId] });
    },
  });

  // Name resolution
  const names = useMemo(() => {
    const map = new Map<string, string>();
    knownUsers.forEach((u, id) => map.set(id, u.profile?.displayName ?? u.username));
    return map;
  }, [knownUsers]);

  const groupNames = useMemo(() => {
    const map = new Map<string, string>();
    knownGroups.forEach((item, id) => map.set(id, `${item.code} — ${item.name}`));
    return map;
  }, [knownGroups]);

  const subjectNames = useMemo(() => {
    const map = new Map<string, string>();
    knownSubjects.forEach((item, id) => map.set(id, `${item.code} — ${item.name}`));
    return map;
  }, [knownSubjects]);

  function resourceName(scope: CapabilityScope, id?: string | null) {
    if (!id) return undefined;
    return scope === 'SUBJECT_GROUP' ? groupNames.get(id) : scope === 'SUBJECT' ? subjectNames.get(id) : undefined;
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!userId || !draft.capabilityKey || !draft.scopeType || draft.scopeType === 'ACTIVITY' || (!resourceReadable && ['SUBJECT_GROUP', 'SUBJECT'].includes(draft.scopeType)) || (['SUBJECT_GROUP', 'SUBJECT'].includes(draft.scopeType) && !draft.scopeResourceId)) return;
    create.mutate();
  }

  return (
    <div className="management-page authorization-register">
      <PageHeader eyebrow="Quyền và phạm vi" title="Cấp quyền">
        Quyền có hiệu lực theo quyền, phạm vi và thời gian. Quản trị kỹ thuật không thay thế quyền nghiệp vụ.
      </PageHeader>
      {!canUsers && (
        <div className="limitation-note">
          <strong>Chưa thể chọn người nhận quyền.</strong> Tài khoản này không có quyền đọc danh sách người dùng; giao diện không nhận mã người dùng thô.
        </div>
      )}
      <MutationNotice error={create.error ?? revoke.error} success={success} />
      {definitions.isPending && !knownDefinitions.size ? (
        <PageLoading />
      ) : definitions.isError && !knownDefinitions.size ? (
        <QueryFailure error={definitions.error} retry={() => void definitions.refetch()} />
      ) : (
        <>
          <section className="inline-work-form" aria-labelledby="grant-heading">
            <h2 id="grant-heading">Cấp quyền mới</h2>
            <form onSubmit={submit}>
              <div className="form-grid">
                <div>
                  <SelectField
                    label="Người nhận"
                    id="grant-user"
                    disabled={!canUsers}
                    value={userId}
                    onChange={(e) => {
                      setSuccess('');
                      setUserId(e.target.value);
                      setGrantsPage(1);
                    }}
                    required
                  >
                    <option value="">Chọn người</option>
                    {userOptions.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.profile?.displayName ?? user.username} — {user.username}
                      </option>
                    ))}
                  </SelectField>
                  {canUsers && users.isError && (
                    <QueryFailure error={users.error} retry={() => void users.refetch()} />
                  )}
                  {canUsers && userPages > 1 && (
                    <FieldPagination
                      label="Chuyển trang người dùng"
                      page={users.data?.page ?? userPage}
                      pages={userPages}
                      total={effectiveUserTotal}
                      unit="người dùng"
                      onPageChange={setUserPage}
                    />
                  )}
                </div>

                <div>
                  <SelectField
                    label="Quyền"
                    id="grant-right"
                    value={draft.capabilityKey}
                    onChange={(e) => setDraft({ ...draft, capabilityKey: e.target.value, scopeType: '', scopeResourceId: '' })}
                    required
                  >
                    <option value="">Chọn quyền</option>
                    {definitionOptions.map((definition) => (
                      <option key={definition.key} value={definition.key}>
                        {capabilityLabels[definition.key] ?? definition.description}
                      </option>
                    ))}
                  </SelectField>
                  {definitionPages > 1 && (
                    <FieldPagination
                      label="Chuyển trang danh mục định nghĩa"
                      page={definitions.data?.page ?? definitionsPage}
                      pages={definitionPages}
                      total={effectiveDefinitionTotal}
                      unit="quyền"
                      onPageChange={setDefinitionsPage}
                    />
                  )}
                </div>

                {selected && (
                  <SelectField
                    label="Phạm vi"
                    id="grant-scope"
                    value={draft.scopeType}
                    onChange={(e) => {
                      setDraft({ ...draft, scopeType: e.target.value as CapabilityScope, scopeResourceId: '' });
                      setGroupPage(1);
                      setSubjectPage(1);
                    }}
                    required
                  >
                    <option value="">Chọn phạm vi</option>
                    {selected.allowedScopeTypes.map((scope) => (
                      <option key={scope} value={scope}>{scopeLabels[scope]}</option>
                    ))}
                  </SelectField>
                )}

                {draft.scopeType === 'ACTIVITY' && (
                  <div className="limitation-note">
                    <strong>Chưa thể cấp theo hoạt động.</strong> Chưa có danh mục hoạt động để chọn phạm vi hợp lệ.
                  </div>
                )}

                {(draft.scopeType === 'SUBJECT_GROUP' || draft.scopeType === 'SUBJECT') && (
                  resourceReadable ? (
                    <div>
                      <SelectField
                        label={draft.scopeType === 'SUBJECT_GROUP' ? 'Tổ chuyên môn' : 'Môn học'}
                        id="grant-resource"
                        value={draft.scopeResourceId}
                        onChange={(e) => setDraft({ ...draft, scopeResourceId: e.target.value })}
                        required
                      >
                        <option value="">Chọn tổ hoặc môn học</option>
                        {resourceOptions?.map((item) => (
                          <option key={item.id} value={item.id}>{item.code} — {item.name}</option>
                        ))}
                      </SelectField>
                      {draft.scopeType === 'SUBJECT_GROUP' && groups.isError && (
                        <QueryFailure error={groups.error} retry={() => void groups.refetch()} />
                      )}
                      {draft.scopeType === 'SUBJECT_GROUP' && groupPages > 1 && (
                        <FieldPagination
                          label="Chuyển trang tổ chuyên môn"
                          page={groups.data?.page ?? groupPage}
                          pages={groupPages}
                          total={effectiveGroupTotal}
                          unit="tổ"
                          onPageChange={setGroupPage}
                        />
                      )}
                      {draft.scopeType === 'SUBJECT' && subjects.isError && (
                        <QueryFailure error={subjects.error} retry={() => void subjects.refetch()} />
                      )}
                      {draft.scopeType === 'SUBJECT' && subjectPages > 1 && (
                        <FieldPagination
                          label="Chuyển trang danh mục môn học"
                          page={subjects.data?.page ?? subjectPage}
                          pages={subjectPages}
                          total={effectiveSubjectTotal}
                          unit="môn"
                          onPageChange={setSubjectPage}
                        />
                      )}
                    </div>
                  ) : (
                    <div className="limitation-note">
                      Không có quyền đọc danh mục tương ứng nên chưa thể chọn tài nguyên.
                    </div>
                  )
                )}

                <FormField
                  label="Có hiệu lực từ"
                  name="grant-from"
                  type="datetime-local"
                  value={draft.validFrom}
                  onChange={(e) => setDraft({ ...draft, validFrom: e.target.value })}
                />
                <FormField
                  label="Có hiệu lực đến"
                  name="grant-until"
                  type="datetime-local"
                  value={draft.validUntil}
                  onChange={(e) => setDraft({ ...draft, validUntil: e.target.value })}
                />
              </div>
              <Button type="submit" loading={create.isPending} disabled={!canUsers || draft.scopeType === 'ACTIVITY'}>
                Cấp quyền
              </Button>
            </form>
          </section>

          <section className="ledger-section" aria-labelledby="definitions-heading">
            <h2 id="definitions-heading">Danh mục quyền đang hoạt động</h2>
            {definitions.isPending ? (
              <PageLoading />
            ) : definitions.isError ? (
              <QueryFailure error={definitions.error} retry={() => void definitions.refetch()} />
            ) : definitions.data.items.length === 0 ? (
              <EmptyState title="Chưa có quyền" message="Danh mục quyền hệ thống sẽ xuất hiện tại đây." />
            ) : (
              <>
                <DataTable label="Danh mục quyền" headings={['Quyền', 'Phạm vi cho phép', 'Loại']}>
                  {definitions.data.items.map((definition: CapabilityDefinitionRecord) => (
                    <tr key={definition.key}>
                      <td>
                        <strong>{capabilityLabels[definition.key] ?? definition.description}</strong>
                        <small className="technical-value table-secondary">{definition.key}</small>
                      </td>
                      <td>{definition.allowedScopeTypes.map((scope) => scopeLabels[scope]).join(', ')}</td>
                      <td>{definition.isSystem ? 'Kỹ thuật hệ thống' : 'Nghiệp vụ'}</td>
                    </tr>
                  ))}
                </DataTable>
                <Pagination
                  page={definitions.data.page}
                  pageSize={definitions.data.pageSize}
                  total={definitions.data.total}
                  onPage={setDefinitionsPage}
                  ariaLabel="Phân trang danh mục quyền"
                />
              </>
            )}
          </section>
        </>
      )}

      {userId && (
        <section className="ledger-section" aria-labelledby="history-heading">
          <h2 id="history-heading">Lịch sử quyền của {names.get(userId) ?? 'người đã chọn'}</h2>
          {grants.isPending ? (
            <PageLoading />
          ) : grants.isError ? (
            <QueryFailure error={grants.error} retry={() => void grants.refetch()} />
          ) : grants.data.items.length === 0 ? (
            <EmptyState title="Chưa có lần cấp quyền" message="Lịch sử cấp và thu hồi quyền của người đã chọn sẽ xuất hiện tại đây." />
          ) : (
            <>
              <DataTable label="Lịch sử cấp quyền" headings={['Quyền', 'Phạm vi', 'Hiệu lực', 'Trạng thái', 'Thao tác']}>
                {grants.data.items.map((grant) => {
                  const active = !grant.revokedAt && isActiveWindow(grant.validFrom, grant.validUntil);
                  const readableResource = resourceName(grant.scopeType, grant.scopeResourceId);
                  return (
                    <tr key={grant.id}>
                      <td>{capabilityLabels[grant.capabilityKey] ?? grant.capabilityKey}</td>
                      <td>
                        {scopeLabels[grant.scopeType]}
                        {grant.scopeResourceId && (
                          <small className={readableResource ? 'table-secondary' : 'technical-value table-secondary'}>
                            {readableResource ?? 'Chưa có tên phạm vi hoặc chưa được cấp quyền xem'}
                          </small>
                        )}
                      </td>
                      <td>
                        {formatDateTime(grant.validFrom)}
                        <small className="table-secondary">đến {formatDateTime(grant.validUntil)}</small>
                      </td>
                      <td>
                        <StatusText active={active} activeLabel="Đang hiệu lực" inactiveLabel={grant.revokedAt ? 'Đã thu hồi' : grant.validFrom && new Date(grant.validFrom).getTime() > Date.now() ? 'Chưa đến thời điểm hiệu lực' : 'Hết hiệu lực'} />
                      </td>
                      <td>
                        {!grant.revokedAt && (
                          revokeId === grant.id ? (
                            <div className="row-confirm">
                              <FormField label="Lý do (không bắt buộc)" name={`reason-${grant.id}`} value={reason} onChange={(e) => setReason(e.target.value)} />
                              <Button type="button" variant="secondary" loading={revoke.isPending} onClick={() => revoke.mutate()}>Xác nhận thu hồi</Button>
                              <Button type="button" variant="quiet" onClick={() => setRevokeId(undefined)}>Hủy</Button>
                            </div>
                          ) : (
                            <Button type="button" variant="quiet" onClick={() => { setSuccess(''); setRevokeId(grant.id); }}>Thu hồi</Button>
                          )
                        )}
                      </td>
                    </tr>
                  );
                })}
              </DataTable>
              <Pagination
                page={grants.data.page}
                pageSize={grants.data.pageSize}
                total={grants.data.total}
                onPage={setGrantsPage}
                ariaLabel="Phân trang lịch sử cấp quyền"
              />
            </>
          )}
        </section>
      )}
    </div>
  );
}
