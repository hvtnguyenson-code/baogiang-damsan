import type {
  AdditionalDutyDefinitionListResponse, AdditionalDutyDefinitionOptionsResponse, AdditionalDutyDefinitionRecord,
  AuditEventListResponse, CapabilityDefinitionListResponse, CapabilityGrantListResponse, CapabilityGrantRecord,
  CapabilityScope, CatalogEntry, CatalogListResponse, StaffAdditionalDutyAssignmentListResponse,
  StaffAdditionalDutyAssignmentRecord, StaffSubjectListResponse, StaffSubjectRecord,
  SubjectGroupMembershipListResponse, SubjectGroupMembershipRecord, UserManagementListResponse, UserManagementRecord,
} from '@baogiang/contracts';
import { apiFetch } from './api-client';

type QueryValue = string | number | boolean | undefined;
export function queryString(query: Record<string, QueryValue>): string {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => { if (value !== undefined && value !== '') params.set(key, String(value)); });
  const value = params.toString();
  return value ? `?${value}` : '';
}

const json = (method: string, body?: unknown) => ({ method, ...(body === undefined ? {} : { body: JSON.stringify(body) }), notifyUnauthorized: true });

export type UserInput = { username: string; password?: string; profile?: { staffCode?: string | null; displayName?: string; email?: string | null; phone?: string | null; positionTitle?: string | null; isTeachingStaff?: boolean } };
export const usersApi = {
  list: (q: { page: number; pageSize: number }) => apiFetch<UserManagementListResponse>(`/users${queryString(q)}`, { notifyUnauthorized: true }),
  create: (input: UserInput) => apiFetch<UserManagementRecord>('/users', json('POST', input)),
  update: (id: string, input: Omit<UserInput, 'password'>) => apiFetch<UserManagementRecord>(`/users/${id}`, json('PATCH', input)),
  action: (id: string, action: 'activate' | 'disable' | 'unlock') => apiFetch<UserManagementRecord>(`/users/${id}/${action}`, json('POST')),
};

export type CatalogInput = { code: string; name: string };
export const catalogApi = (kind: 'subject-groups' | 'subjects') => ({
  list: (q: { page: number; pageSize: number; status?: string }) => apiFetch<CatalogListResponse>(`/${kind}${queryString(q)}`, { notifyUnauthorized: true }),
  create: (input: CatalogInput) => apiFetch<CatalogEntry>(`/${kind}`, json('POST', input)),
  update: (id: string, input: CatalogInput) => apiFetch<CatalogEntry>(`/${kind}/${id}`, json('PATCH', input)),
  action: (id: string, action: 'activate' | 'deactivate') => apiFetch<CatalogEntry>(`/${kind}/${id}/${action}`, json('POST')),
});

export type AssignmentInput = { userId: string; resourceId: string; validFrom?: string; validUntil?: string; isPrimary?: boolean };
export type AssignmentUpdate = { validFrom?: string; validUntil?: string; isPrimary?: boolean };
export type TemporalAssignmentFormValues = { validFrom: string; validUntil: string; isPrimary: boolean };
export type TemporalAssignmentOriginal = Pick<SubjectGroupMembershipRecord | StaffSubjectRecord, 'validFrom' | 'validUntil' | 'isPrimary'>;

export function buildTemporalAssignmentUpdate(values: TemporalAssignmentFormValues, original: TemporalAssignmentOriginal): AssignmentUpdate {
  const validFrom = changedIso(values.validFrom, original.validFrom);
  const validUntil = changedIso(values.validUntil, original.validUntil);
  return {
    ...(validFrom ? { validFrom } : {}),
    ...(validUntil ? { validUntil } : {}),
    ...(values.isPrimary !== original.isPrimary ? { isPrimary: values.isPrimary } : {}),
  };
}
export const assignmentApi = (kind: 'subject-group-memberships' | 'staff-subjects') => ({
  list: (q: Record<string, QueryValue>) => apiFetch<SubjectGroupMembershipListResponse | StaffSubjectListResponse>(`/${kind}${queryString(q)}`, { notifyUnauthorized: true }),
  create: (input: AssignmentInput) => {
    const resourceKey = kind === 'subject-group-memberships' ? 'subjectGroupId' : 'subjectId';
    const { resourceId, ...rest } = input;
    return apiFetch<SubjectGroupMembershipRecord | StaffSubjectRecord>(`/${kind}`, json('POST', { ...rest, [resourceKey]: resourceId }));
  },
  update: (id: string, input: AssignmentUpdate) => apiFetch<SubjectGroupMembershipRecord | StaffSubjectRecord>(`/${kind}/${id}`, json('PATCH', input)),
  end: (id: string, endAt?: string) => apiFetch<SubjectGroupMembershipRecord | StaffSubjectRecord>(`/${kind}/${id}/end`, json('POST', endAt ? { endAt } : {})),
});

export const capabilitiesApi = {
  definitions: (q: Record<string, QueryValue>) => apiFetch<CapabilityDefinitionListResponse>(`/capabilities${queryString(q)}`, { notifyUnauthorized: true }),
  grants: (userId: string, q: Record<string, QueryValue>) => apiFetch<CapabilityGrantListResponse>(`/users/${userId}/capabilit${''}y-grants${queryString(q)}`, { notifyUnauthorized: true }),
  create: (userId: string, input: { capabilityKey: string; scopeType: CapabilityScope; scopeResourceId?: string; validFrom?: string; validUntil?: string }) => apiFetch<CapabilityGrantRecord>(`/users/${userId}/capabilit${''}y-grants`, json('POST', input)),
  revoke: (id: string, revokeReason?: string) => apiFetch<CapabilityGrantRecord>(`/capabilit${''}y-grants/${id}/revoke`, json('POST', revokeReason ? { revokeReason } : {})),
};

export const auditApi = { list: (q: Record<string, QueryValue>) => apiFetch<AuditEventListResponse>(`/audit-events${queryString(q)}`, { notifyUnauthorized: true }) };

type DutyDefinitionBaseInput = { code: string; name: string; category: string; sortOrder?: number; validFrom?: string; validUntil?: string };
export type DutyDefinitionCreateInput = DutyDefinitionBaseInput & { description?: string };
export type DutyDefinitionUpdateInput = Partial<DutyDefinitionBaseInput> & { description?: string | null };
export type DutyDefinitionFormValues = { code: string; name: string; description: string; category: string; sortOrder: string; validFrom: string; validUntil: string };
export type DutyDefinitionOriginal = Pick<AdditionalDutyDefinitionRecord, 'code' | 'name' | 'description' | 'category' | 'sortOrder' | 'validFrom' | 'validUntil'>;

export function buildDutyDefinitionInput(values: DutyDefinitionFormValues, operation: 'create'): DutyDefinitionCreateInput;
export function buildDutyDefinitionInput(values: DutyDefinitionFormValues, operation: 'update', original: DutyDefinitionOriginal): DutyDefinitionUpdateInput;
export function buildDutyDefinitionInput(values: DutyDefinitionFormValues, operation: 'create' | 'update', original?: DutyDefinitionOriginal): DutyDefinitionCreateInput | DutyDefinitionUpdateInput {
  const code = values.code.trim().toUpperCase();
  const name = values.name.trim();
  const description = values.description.trim();
  const category = values.category.trim();
  const sortOrderText = values.sortOrder.trim();
  const parsedSortOrder = Number(sortOrderText);
  const sortOrder = sortOrderText && Number.isFinite(parsedSortOrder) ? parsedSortOrder : undefined;
  if (operation === 'create') {
    const validFrom = toIso(values.validFrom);
    const validUntil = toIso(values.validUntil);
    return { code, name, category, ...(sortOrder === undefined ? {} : { sortOrder }), ...(validFrom ? { validFrom } : {}), ...(validUntil ? { validUntil } : {}), ...(description ? { description } : {}) };
  }

  const validFrom = changedIso(values.validFrom, original!.validFrom);
  const validUntil = changedIso(values.validUntil, original!.validUntil);
  return {
    ...(code !== original!.code ? { code } : {}),
    ...(name !== original!.name ? { name } : {}),
    ...(description !== (original!.description ?? '') ? { description: description || null } : {}),
    ...(category !== original!.category ? { category } : {}),
    ...(sortOrder !== undefined && sortOrder !== original!.sortOrder ? { sortOrder } : {}),
    ...(validFrom ? { validFrom } : {}),
    ...(validUntil ? { validUntil } : {}),
  };
}

export const dutyDefinitionsApi = {
  list: (q: Record<string, QueryValue>) => apiFetch<AdditionalDutyDefinitionListResponse>(`/additional-duty-definitions${queryString(q)}`, { notifyUnauthorized: true }),
  options: (q: Record<string, QueryValue>) => apiFetch<AdditionalDutyDefinitionOptionsResponse>(`/additional-duty-definitions/options${queryString(q)}`, { notifyUnauthorized: true }),
  create: (input: DutyDefinitionCreateInput) => apiFetch<AdditionalDutyDefinitionRecord>('/additional-duty-definitions', json('POST', input)),
  update: (id: string, input: DutyDefinitionUpdateInput) => apiFetch<AdditionalDutyDefinitionRecord>(`/additional-duty-definitions/${id}`, json('PATCH', input)),
  disable: (id: string) => apiFetch<AdditionalDutyDefinitionRecord>(`/additional-duty-definitions/${id}/disable`, json('POST')),
};

export type DutyAssignmentInput = { staffProfileId: string; dutyDefinitionId: string; scopeType: 'SCHOOL_WIDE' | 'SUBJECT_GROUP'; scopeResourceId?: string; validFrom?: string; validUntil?: string; note?: string };
export type DutyAssignmentUpdate = { validFrom?: string; validUntil?: string; note?: string | null };
export type DutyAssignmentFormValues = { validFrom: string; validUntil: string; note: string };
export type DutyAssignmentOriginal = Pick<StaffAdditionalDutyAssignmentRecord, 'validFrom' | 'validUntil' | 'note'>;

export function buildDutyAssignmentUpdate(values: DutyAssignmentFormValues, original: DutyAssignmentOriginal): DutyAssignmentUpdate {
  const validFrom = changedIso(values.validFrom, original.validFrom);
  const validUntil = changedIso(values.validUntil, original.validUntil);
  return {
    ...(validFrom ? { validFrom } : {}),
    ...(validUntil ? { validUntil } : {}),
    ...(values.note !== (original.note ?? '') ? { note: values.note.trim() ? values.note : null } : {}),
  };
}
export const dutyAssignmentsApi = {
  list: (q: Record<string, QueryValue>) => apiFetch<StaffAdditionalDutyAssignmentListResponse>(`/staff-additional-duty-assignments${queryString(q)}`, { notifyUnauthorized: true }),
  create: (input: DutyAssignmentInput) => apiFetch<StaffAdditionalDutyAssignmentRecord>('/staff-additional-duty-assignments', json('POST', input)),
  update: (id: string, input: DutyAssignmentUpdate) => apiFetch<StaffAdditionalDutyAssignmentRecord>(`/staff-additional-duty-assignments/${id}`, json('PATCH', input)),
  end: (id: string, endAt?: string) => apiFetch<StaffAdditionalDutyAssignmentRecord>(`/staff-additional-duty-assignments/${id}/end`, json('POST', endAt ? { endAt } : {})),
};

export function toIso(localValue: string): string | undefined { return localValue ? new Date(localValue).toISOString() : undefined; }
export function toLocalInput(iso?: string): string { if (!iso) return ''; const date = new Date(iso); const offset = date.getTimezoneOffset() * 60_000; return new Date(date.getTime() - offset).toISOString().slice(0, 16); }
export function hasPatchChanges(input: object): boolean { return Object.keys(input).length > 0; }

function changedIso(localValue: string, originalIso?: string): string | undefined {
  return localValue === toLocalInput(originalIso) ? undefined : toIso(localValue);
}
