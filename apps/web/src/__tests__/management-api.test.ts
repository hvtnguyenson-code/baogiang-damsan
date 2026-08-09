import { afterEach, describe, expect, it, vi } from 'vitest';
import { assignmentApi, capabilitiesApi, catalogApi, dutyAssignmentsApi, queryString, toIso, toLocalInput, usersApi } from '../lib/management-api';
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
