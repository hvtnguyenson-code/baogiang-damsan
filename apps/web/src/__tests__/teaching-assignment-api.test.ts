import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildChangeTeachingAssignmentTeacherInput,
  buildCreateTeachingAssignmentInput,
  nextCivilDate,
  teachingAssignmentApi,
} from '../lib/teaching-assignment-api';
import { jsonResponse } from './test-utils';

describe('teaching assignment API boundary', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('uses only the narrow year, workspace and eligible-teacher option routes', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse({ items: [], page: 1, pageSize: 100, total: 0 })));
    vi.stubGlobal('fetch', fetchMock);
    await teachingAssignmentApi.years({ page: 1, pageSize: 100 });
    await teachingAssignmentApi.workspace('year-1');
    await teachingAssignmentApi.eligibleTeachers('year-1', {
      subjectId: 'subject-1', validFrom: '2026-08-31', validUntil: '2026-09-04', page: 1, pageSize: 100,
    });
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      '/api/teaching-assignment-options/academic-years?page=1&pageSize=100',
      '/api/teaching-assignment-options/academic-years/year-1',
      '/api/teaching-assignment-options/academic-years/year-1/eligible-teachers?subjectId=subject-1&validFrom=2026-08-31&validUntil=2026-09-04&page=1&pageSize=100',
    ]);
    expect(fetchMock.mock.calls.some(([url]) => /\/api\/(users|academic-years\?)/.test(String(url)))).toBe(false);
  });

  it('serializes all list filters as unchanged civil dates', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ items: [], page: 2, pageSize: 20, total: 0 }));
    vi.stubGlobal('fetch', fetchMock);
    await teachingAssignmentApi.list('year-1', {
      page: 2, pageSize: 20, schoolClassId: 'class-1', subjectId: 'subject-1',
      teacherUserId: 'teacher-1', activeOn: '2026-09-02',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/academic-years/year-1/teaching-assignments?page=2&pageSize=20&schoolClassId=class-1&subjectId=subject-1&teacherUserId=teacher-1&activeOn=2026-09-02',
      expect.any(Object),
    );
  });

  it('sends exact create, end and change-teacher commands without PATCH or DELETE', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse({ id: 'assignment-1' })));
    vi.stubGlobal('fetch', fetchMock);
    const create = buildCreateTeachingAssignmentInput({
      schoolClassId: 'class-1', subjectId: 'subject-1', teacherUserId: 'teacher-1',
      validFrom: '2026-08-31', validUntil: '', note: '   ',
    });
    await teachingAssignmentApi.create('year-1', create);
    await teachingAssignmentApi.end('assignment-1', '2026-09-03');
    const change = buildChangeTeachingAssignmentTeacherInput({
      newTeacherUserId: 'teacher-2', effectiveFrom: '2026-09-02', note: '  Bàn giao lớp  ',
    });
    await teachingAssignmentApi.changeTeacher('assignment-1', change);

    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]!.body))).toEqual({
      schoolClassId: 'class-1', subjectId: 'subject-1', teacherUserId: 'teacher-1', validFrom: '2026-08-31',
    });
    expect(fetchMock.mock.calls[1]).toEqual(expect.arrayContaining([
      '/api/teaching-assignments/assignment-1/end',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ endDate: '2026-09-03' }) }),
    ]));
    expect(JSON.parse(String(fetchMock.mock.calls[2]![1]!.body))).toEqual({
      newTeacherUserId: 'teacher-2', effectiveFrom: '2026-09-02', note: 'Bàn giao lớp',
    });
    const serialized = fetchMock.mock.calls.map(([url, init]) => `${url} ${String(init?.body ?? '')}`).join(' ');
    expect(serialized).not.toMatch(/T00:00|Z|\+07:00/);
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PATCH' || init?.method === 'DELETE')).toBe(false);
  });

  it('keeps nonblank optional fields and trims the note', () => {
    expect(buildCreateTeachingAssignmentInput({
      schoolClassId: 'class-1', subjectId: 'subject-1', teacherUserId: 'teacher-1',
      validFrom: '2026-08-31', validUntil: '2026-09-04', note: '  Ghi chú  ',
    })).toEqual({
      schoolClassId: 'class-1', subjectId: 'subject-1', teacherUserId: 'teacher-1',
      validFrom: '2026-08-31', validUntil: '2026-09-04', note: 'Ghi chú',
    });
  });

  it('advances strict civil dates across month, year and leap-day boundaries', () => {
    expect(nextCivilDate('2026-08-31')).toBe('2026-09-01');
    expect(nextCivilDate('2026-12-31')).toBe('2027-01-01');
    expect(nextCivilDate('2028-02-28')).toBe('2028-02-29');
    expect(nextCivilDate('2028-02-29')).toBe('2028-03-01');
    expect(() => nextCivilDate('2026-02-30')).toThrow('Invalid civil date');
  });
});
