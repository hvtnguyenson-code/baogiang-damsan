import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildHomeroomInput, homeroomAssignmentApi, isBoundedHistorical } from '../lib/homeroom-assignment-api';
import { jsonResponse } from './test-utils';

describe('homeroom assignment API boundary', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('uses only the narrow Homeroom workspace and candidate routes', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse({ items: [], page: 1, pageSize: 100, total: 0 })));
    vi.stubGlobal('fetch', fetchMock);
    await homeroomAssignmentApi.years({ page: 1, pageSize: 100 });
    await homeroomAssignmentApi.workspace('year-1');
    await homeroomAssignmentApi.eligibleTeachers('year-1', { validFrom: '2026-09-01', page: 1, pageSize: 100 });
    await homeroomAssignmentApi.historicalTeachers('year-1', { q: '  An ', page: 1, pageSize: 100 });
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      '/api/homeroom-assignment-options/academic-years?page=1&pageSize=100',
      '/api/homeroom-assignment-options/academic-years/year-1',
      '/api/homeroom-assignment-options/academic-years/year-1/eligible-teachers?validFrom=2026-09-01&page=1&pageSize=100',
      '/api/homeroom-assignment-options/academic-years/year-1/historical-teacher-identities?q=++An+&page=1&pageSize=100',
    ]);
    expect(fetchMock.mock.calls.some(([url]) => /\/api\/(users|teaching-assignment-options)/.test(String(url)))).toBe(false);
  });

  it('uses only create, end, change and correction commands with civil dates', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse({ id: 'assignment-1' }))); vi.stubGlobal('fetch', fetchMock);
    await homeroomAssignmentApi.create('year-1', buildHomeroomInput({ schoolClassId: 'class-1', teacherUserId: 'teacher-1', validFrom: '2026-08-31', validUntil: '', note: '  ', entryReason: '  ' }));
    await homeroomAssignmentApi.end('assignment-1', '2026-09-02');
    await homeroomAssignmentApi.changeTeacher('assignment-1', { newTeacherUserId: 'teacher-2', effectiveFrom: '2026-09-03' });
    await homeroomAssignmentApi.correct('assignment-1', { reason: 'Sửa dữ liệu', replacements: [{ teacherUserId: 'teacher-1', validFrom: '2026-08-31', validUntil: '2026-09-01' }] });
    const serialized = fetchMock.mock.calls.map(([url, init]) => `${url} ${String(init?.body ?? '')}`).join(' ');
    expect(serialized).not.toMatch(/T00:00|Z|PATCH|DELETE/);
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]!.body))).toEqual({ schoolClassId: 'class-1', teacherUserId: 'teacher-1', validFrom: '2026-08-31' });
  });

  it('classifies bounded history only before the server-owned business date', () => {
    expect(isBoundedHistorical('2026-09-03', '2026-09-04')).toBe(true);
    expect(isBoundedHistorical('2026-09-04', '2026-09-04')).toBe(false);
    expect(isBoundedHistorical('', '2026-09-04')).toBe(false);
  });
});
