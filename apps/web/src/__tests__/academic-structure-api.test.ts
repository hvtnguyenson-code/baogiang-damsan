import type { AcademicCalendarVersionDetail, AcademicYearRecord, SchoolClassRecord } from '@baogiang/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { academicYearPatch, academicYearsApi, calendarDetailToInput, calendarVersionsApi, formatCivilDate, normalizeCode, schoolClassPatch, schoolClassesApi } from '../lib/academic-structure-api';
import { jsonResponse } from './test-utils';

const year: AcademicYearRecord = { id: 'year-1', code: '2026-2027', name: 'Năm học 2026–2027', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' };
const schoolClass: SchoolClassRecord = { id: 'class-1', academicYearId: 'year-1', code: '10A1', name: 'Lớp 10A1', gradeLevel: 10, status: 'ACTIVE', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' };

describe('academic structure API', () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  it('normalizes codes and produces sparse PATCH payloads', () => {
    expect(normalizeCode('  hk-i ')).toBe('HK-I');
    expect(academicYearPatch({ code: '2026-2027', name: year.name }, year)).toEqual({});
    expect(academicYearPatch({ code: '  2027-2028 ', name: year.name }, year)).toEqual({ code: '2027-2028' });
    expect(schoolClassPatch({ code: schoolClass.code, name: schoolClass.name, gradeLevel: 10 }, schoolClass)).toEqual({});
    expect(schoolClassPatch({ code: '10a1', name: ' Lớp 10A1 mới ', gradeLevel: 11 }, schoolClass)).toEqual({ name: 'Lớp 10A1 mới', gradeLevel: 11 });
  });

  it('formats civil dates without timezone conversion', () => {
    expect(formatCivilDate('2026-08-31')).toBe('31/08/2026');
    expect(formatCivilDate('not-a-date')).toBe('not-a-date');
  });

  it('uses exact nested routes and raw civil-date payloads', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse({ items: [], page: 2, pageSize: 20, total: 0 }))); vi.stubGlobal('fetch', fetchMock);
    await academicYearsApi.list({ page: 2, pageSize: 20 });
    await schoolClassesApi.list('year-1', { page: 1, pageSize: 20, status: 'ACTIVE', gradeLevel: 10 });
    await calendarVersionsApi.create('year-1', { startDate: '2026-08-31', endDate: '2027-05-31', officialWeekCount: 1, reserveWeekCount: 0, teachingWeekdays: ['MONDAY'], semesters: [{ code: 'HK1', name: 'Học kỳ 1', ordinal: 1, startDate: '2026-08-31', endDate: '2027-01-15' }], weeks: [{ kind: 'OFFICIAL', officialWeekNumber: 1, displayLabel: 'Tuần 1', sortOrder: 1, segments: [{ label: 'Khoảng học', segmentOrder: 1, startDate: '2026-08-31', endDate: '2026-09-04' }] }], interruptions: [] });
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/academic-years?page=2&pageSize=20');
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/academic-years/year-1/classes?page=1&pageSize=20&status=ACTIVE&gradeLevel=10');
    expect(fetchMock.mock.calls[2]?.[0]).toBe('/api/academic-years/year-1/calendar-versions');
    const body = JSON.parse((fetchMock.mock.calls[2]?.[1] as RequestInit).body as string);
    expect(body.startDate).toBe('2026-08-31'); expect(body.weeks[0].segments[0].endDate).toBe('2026-09-04');
  });

  it('sends empty command bodies for lifecycle actions', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse({}))); vi.stubGlobal('fetch', fetchMock);
    await calendarVersionsApi.activate('version-1'); await schoolClassesApi.action('class-1', 'deactivate');
    expect(fetchMock.mock.calls.map((call) => [call[0], (call[1] as RequestInit).method, (call[1] as RequestInit).body])).toEqual([
      ['/api/academic-calendar-versions/version-1/activate', 'POST', '{}'], ['/api/school-classes/class-1/deactivate', 'POST', '{}'],
    ]);
  });

  it('clones business fields while stripping ids and lifecycle state', () => {
    const detail = { id: 'version-1', academicYearId: 'year-1', versionNumber: 3, startDate: '2026-08-31', endDate: '2027-05-31', officialWeekCount: 1, reserveWeekCount: 0, teachingWeekdays: ['MONDAY'], isActive: true, activatedAt: '2026-08-01T00:00:00Z', note: 'Ghi chú', createdAt: '', updatedAt: '', semesters: [{ id: 'semester-1', code: 'HK1', name: 'Học kỳ 1', ordinal: 4, startDate: '2026-08-31', endDate: '2027-01-15', createdAt: '', updatedAt: '' }], weeks: [{ id: 'week-1', kind: 'OFFICIAL', officialWeekNumber: 1, reserveWeekNumber: null, displayLabel: 'Tuần 1', sortOrder: 7, createdAt: '', updatedAt: '', segments: [{ id: 'segment-1', label: 'Khoảng học', segmentOrder: 9, startDate: '2026-08-31', endDate: '2026-09-04', createdAt: '', updatedAt: '' }] }], interruptions: [] } as AcademicCalendarVersionDetail;
    const cloned = calendarDetailToInput(detail);
    expect(cloned.semesters[0]?.ordinal).toBe(1); expect(cloned.weeks[0]?.sortOrder).toBe(1); expect(cloned.weeks[0]?.segments[0]?.segmentOrder).toBe(1);
    expect(JSON.stringify(cloned)).not.toMatch(/version-1|semester-1|segment-1|isActive|activatedAt/);
  });
});
