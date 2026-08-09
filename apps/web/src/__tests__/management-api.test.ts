import { afterEach, describe, expect, it, vi } from 'vitest';
import { assignmentApi, buildDutyAssignmentUpdate, buildDutyDefinitionInput, buildTemporalAssignmentUpdate, capabilitiesApi, catalogApi, dutyAssignmentsApi, dutyDefinitionsApi, hasPatchChanges, queryString, toIso, toLocalInput, usersApi } from '../lib/management-api';
import { jsonResponse } from './test-utils';

describe('typed management API boundary', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('serializes supported list filters without empty values', () => {
    expect(queryString({ page: 2, pageSize: 20, status: 'ACTIVE', activeAt: undefined, search: '' })).toBe('?page=2&pageSize=20&status=ACTIVE');
  });

  it('creates a user with the actual nested profile payload and never transforms the password', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 'u1' })); vi.stubGlobal('fetch', fetchMock);
    await usersApi.create({ username: 'gv01', password: 'Paste-Allowed-123', profile: { displayName: 'Nguyễn An', staffCode: 'GV01', isTeachingStaff: true } });
    expect(fetchMock).toHaveBeenCalledWith('/api/users', expect.objectContaining({ method: 'POST', body: JSON.stringify({ username: 'gv01', password: 'Paste-Allowed-123', profile: { displayName: 'Nguyễn An', staffCode: 'GV01', isTeachingStaff: true } }) }));
  });

  it('maps the generic assignment resource to the real backend DTO field', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 'a1' })); vi.stubGlobal('fetch', fetchMock);
    await assignmentApi('subject-group-memberships').create({ userId: 'user-id', resourceId: 'group-id', isPrimary: true });
    expect(fetchMock).toHaveBeenCalledWith('/api/subject-group-memberships', expect.objectContaining({ body: JSON.stringify({ userId: 'user-id', isPrimary: true, subjectGroupId: 'group-id' }) }));
  });

  it.each(['subject-groups', 'subjects'] as const)('PATCHes %s with DTO fields only', async (kind) => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 'catalog-id' })); vi.stubGlobal('fetch', fetchMock);
    await catalogApi(kind).update('catalog-id', { code: 'CODE', name: 'Tên đã sửa' });
    expect(fetchMock).toHaveBeenCalledWith(`/api/${kind}/catalog-id`, expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ code: 'CODE', name: 'Tên đã sửa' }) }));
    expect(JSON.parse(fetchMock.mock.calls[0]![1]!.body as string)).not.toHaveProperty('id');
  });

  it('serializes all supported temporal assignment filters', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse({ items: [], page: 1, pageSize: 20, total: 0 }))); vi.stubGlobal('fetch', fetchMock);
    await assignmentApi('subject-group-memberships').list({ page: 2, pageSize: 20, userId: 'user-id', subjectGroupId: 'group-id', activeAt: '2026-08-09T08:00:00.000Z', isPrimary: false });
    expect(fetchMock).toHaveBeenCalledWith('/api/subject-group-memberships?page=2&pageSize=20&userId=user-id&subjectGroupId=group-id&activeAt=2026-08-09T08%3A00%3A00.000Z&isPrimary=false', expect.any(Object));
  });

  it('serializes supported duty filters and clears an existing note with null', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse({ items: [], page: 1, pageSize: 20, total: 0 }))); vi.stubGlobal('fetch', fetchMock);
    await dutyAssignmentsApi.list({ page: 1, pageSize: 20, staffProfileId: 'staff-id', dutyDefinitionId: 'duty-id', scopeType: 'SUBJECT_GROUP', scopeResourceId: 'group-id', activeAt: '2026-08-09T08:00:00.000Z' });
    expect(String(fetchMock.mock.calls[0]![0])).toContain('staffProfileId=staff-id&dutyDefinitionId=duty-id&scopeType=SUBJECT_GROUP&scopeResourceId=group-id');
    await dutyAssignmentsApi.update('assignment-id', { note: null });
    expect(fetchMock).toHaveBeenLastCalledWith('/api/staff-additional-duty-assignments/assignment-id', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ note: null }) }));
  });

  it('omits blank optional duty-definition fields from create requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 'duty-id' })); vi.stubGlobal('fetch', fetchMock);
    const input = buildDutyDefinitionInput({ code: 'E2EDUTY', name: 'Kiêm nhiệm E2E', description: '', category: 'Kiểm thử', sortOrder: '0', validFrom: '', validUntil: '' }, 'create');
    await dutyDefinitionsApi.create(input);
    const body = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string);
    expect(body).toEqual({ code: 'E2EDUTY', name: 'Kiêm nhiệm E2E', category: 'Kiểm thử', sortOrder: 0 });
    expect(body).not.toHaveProperty('description');
    expect(body).not.toHaveProperty('validFrom');
    expect(body).not.toHaveProperty('validUntil');
  });

  it('preserves a nonblank duty-definition description on create', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 'duty-id' })); vi.stubGlobal('fetch', fetchMock);
    const input = buildDutyDefinitionInput({ code: 'E2EDUTY', name: 'Kiêm nhiệm E2E', description: '  Mô tả nghiệp vụ  ', category: 'Kiểm thử', sortOrder: '', validFrom: '', validUntil: '' }, 'create');
    await dutyDefinitionsApi.create(input);
    expect(JSON.parse(fetchMock.mock.calls[0]![1]!.body as string)).toEqual({ code: 'E2EDUTY', name: 'Kiêm nhiệm E2E', category: 'Kiểm thử', description: 'Mô tả nghiệp vụ' });
  });

  it('sends only null when an update clears a duty-definition description', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 'duty-id' })); vi.stubGlobal('fetch', fetchMock);
    const original = { code: 'E2EDUTY', name: 'Kiêm nhiệm E2E', description: 'Mô tả cũ', category: 'Kiểm thử', sortOrder: 2, validFrom: '2026-08-09T08:30:45.678Z' };
    const input = buildDutyDefinitionInput({ code: original.code, name: original.name, description: '   ', category: original.category, sortOrder: '2', validFrom: toLocalInput(original.validFrom), validUntil: '' }, 'update', original);
    await dutyDefinitionsApi.update('duty-id', input);
    expect(JSON.parse(fetchMock.mock.calls[0]![1]!.body as string)).toEqual({ description: null });
  });

  it('builds a duty note-only PATCH without truncating exact server timestamps', () => {
    const original = { validFrom: '2026-08-09T08:30:45.678Z', validUntil: '2026-09-09T09:40:59.321Z', note: 'Ghi chú cũ' };
    expect(buildDutyAssignmentUpdate({ validFrom: toLocalInput(original.validFrom), validUntil: toLocalInput(original.validUntil), note: 'Ghi chú mới' }, original)).toEqual({ note: 'Ghi chú mới' });
  });

  it('builds a duty note-clear PATCH as null without temporal fields', () => {
    const original = { validFrom: '2026-08-09T08:30:45.678Z', note: 'Ghi chú cũ' };
    expect(buildDutyAssignmentUpdate({ validFrom: toLocalInput(original.validFrom), validUntil: '', note: '' }, original)).toEqual({ note: null });
  });

  it('includes only an explicitly changed duty-assignment timestamp', () => {
    const original = { validFrom: '2026-08-09T08:30:45.678Z', validUntil: '2026-09-09T09:40:59.321Z', note: 'Giữ nguyên' };
    const changed = '2026-08-10T10:15';
    expect(buildDutyAssignmentUpdate({ validFrom: changed, validUntil: toLocalInput(original.validUntil), note: original.note }, original)).toEqual({ validFrom: toIso(changed) });
  });

  it('builds a subject-group primary-only PATCH without temporal fields', () => {
    const original = { validFrom: '2026-08-09T08:30:45.678Z', validUntil: '2026-09-09T09:40:59.321Z', isPrimary: false };
    expect(buildTemporalAssignmentUpdate({ validFrom: toLocalInput(original.validFrom), validUntil: toLocalInput(original.validUntil), isPrimary: true }, original)).toEqual({ isPrimary: true });
  });

  it('builds a staff-subject primary-only PATCH without temporal fields', () => {
    const original = { validFrom: '2026-08-09T08:30:45.678Z', isPrimary: true };
    expect(buildTemporalAssignmentUpdate({ validFrom: toLocalInput(original.validFrom), validUntil: '', isPrimary: false }, original)).toEqual({ isPrimary: false });
  });

  it('includes only an explicitly changed temporal-assignment date', () => {
    const original = { validFrom: '2026-08-09T08:30:45.678Z', validUntil: '2026-09-09T09:40:59.321Z', isPrimary: false };
    const changed = '2026-09-10T11:25';
    expect(buildTemporalAssignmentUpdate({ validFrom: toLocalInput(original.validFrom), validUntil: changed, isPrimary: false }, original)).toEqual({ validUntil: toIso(changed) });
  });

  it('builds a duty-definition description-only PATCH', () => {
    const original = { code: 'E2EDUTY', name: 'Kiêm nhiệm E2E', description: 'Mô tả cũ', category: 'Kiểm thử', sortOrder: 2, validFrom: '2026-08-09T08:30:45.678Z', validUntil: '2026-09-09T09:40:59.321Z' };
    const values = { code: original.code, name: original.name, description: 'Mô tả mới', category: original.category, sortOrder: '2', validFrom: toLocalInput(original.validFrom), validUntil: toLocalInput(original.validUntil) };
    expect(buildDutyDefinitionInput(values, 'update', original)).toEqual({ description: 'Mô tả mới' });
  });

  it('builds a duty-definition name-only PATCH and omits unchanged code', () => {
    const original = { code: 'E2EDUTY', name: 'Tên cũ', description: undefined, category: 'Kiểm thử', sortOrder: 2, validFrom: '2026-08-09T08:30:45.678Z' };
    const values = { code: 'e2eduty', name: 'Tên mới', description: '', category: original.category, sortOrder: '2', validFrom: toLocalInput(original.validFrom), validUntil: '' };
    expect(buildDutyDefinitionInput(values, 'update', original)).toEqual({ name: 'Tên mới' });
  });

  it('includes one explicitly changed duty-definition validity boundary only', () => {
    const original = { code: 'E2EDUTY', name: 'Kiêm nhiệm E2E', description: undefined, category: 'Kiểm thử', sortOrder: 2, validFrom: '2026-08-09T08:30:45.678Z', validUntil: '2026-09-09T09:40:59.321Z' };
    const changed = '2026-08-10T10:15';
    const values = { code: original.code, name: original.name, description: '', category: original.category, sortOrder: '2', validFrom: changed, validUntil: toLocalInput(original.validUntil) };
    expect(buildDutyDefinitionInput(values, 'update', original)).toEqual({ validFrom: toIso(changed) });
  });

  it('returns no update fields for unchanged edit forms', () => {
    const duty = { validFrom: '2026-08-09T08:30:45.678Z', validUntil: '2026-09-09T09:40:59.321Z', note: 'Giữ nguyên' };
    const temporal = { validFrom: duty.validFrom, validUntil: duty.validUntil, isPrimary: true };
    const definition = { code: 'E2EDUTY', name: 'Kiêm nhiệm E2E', description: 'Mô tả', category: 'Kiểm thử', sortOrder: 2, validFrom: duty.validFrom, validUntil: duty.validUntil };
    expect(hasPatchChanges(buildDutyAssignmentUpdate({ validFrom: toLocalInput(duty.validFrom), validUntil: toLocalInput(duty.validUntil), note: duty.note }, duty))).toBe(false);
    expect(hasPatchChanges(buildTemporalAssignmentUpdate({ validFrom: toLocalInput(temporal.validFrom), validUntil: toLocalInput(temporal.validUntil), isPrimary: temporal.isPrimary }, temporal))).toBe(false);
    expect(hasPatchChanges(buildDutyDefinitionInput({ code: definition.code, name: definition.name, description: definition.description, category: definition.category, sortOrder: '2', validFrom: toLocalInput(definition.validFrom), validUntil: toLocalInput(definition.validUntil) }, 'update', definition))).toBe(false);
  });

  it('omits resource IDs for school-wide capability grants', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 'g1' })); vi.stubGlobal('fetch', fetchMock);
    await capabilitiesApi.create('user-id', { capabilityKey: 'AUDIT_VIEW', scopeType: 'SCHOOL_WIDE' });
    expect(fetchMock).toHaveBeenCalledWith('/api/users/user-id/capability-grants', expect.objectContaining({ body: JSON.stringify({ capabilityKey: 'AUDIT_VIEW', scopeType: 'SCHOOL_WIDE' }) }));
  });

  it('converts datetime-local explicitly and preserves an empty optional date as omitted', () => {
    expect(toIso('')).toBeUndefined();
    const iso = toIso('2026-08-09T08:30');
    expect(iso).toMatch(/^2026-08-09T/);
    expect(toLocalInput(iso)).toBe('2026-08-09T08:30');
  });
});
