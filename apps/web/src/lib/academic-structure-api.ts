import type {
  AcademicCalendarVersionDetail, AcademicCalendarVersionListResponse, AcademicWeekday, AcademicWeekKind,
  AcademicYearListResponse, AcademicYearRecord, CivilDateString, SchoolClassListResponse, SchoolClassRecord,
} from '@baogiang/contracts';
import { apiFetch } from './api-client';

type QueryValue = string | number | undefined;
function queryString(query: Record<string, QueryValue>): string {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => { if (value !== undefined && value !== '') params.set(key, String(value)); });
  const text = params.toString();
  return text ? `?${text}` : '';
}
const json = (method: string, body?: unknown) => ({ method, ...(body === undefined ? {} : { body: JSON.stringify(body) }), notifyUnauthorized: true });

export type AcademicYearInput = { code: string; name: string };
export type SchoolClassInput = { code: string; name: string; gradeLevel: 10 | 11 | 12 };
export type CalendarSegmentInput = { label: string; segmentOrder: number; startDate: CivilDateString; endDate: CivilDateString };
export type CalendarWeekInput = { kind: AcademicWeekKind; officialWeekNumber?: number; reserveWeekNumber?: number; displayLabel: string; sortOrder: number; segments: CalendarSegmentInput[] };
export type CalendarVersionInput = {
  startDate: CivilDateString; endDate: CivilDateString; officialWeekCount: number; reserveWeekCount: number;
  teachingWeekdays: AcademicWeekday[]; note?: string;
  semesters: { code: string; name: string; ordinal: number; startDate: CivilDateString; endDate: CivilDateString }[];
  weeks: CalendarWeekInput[];
  interruptions: { code: string; name: string; startDate: CivilDateString; endDate: CivilDateString }[];
};

export const academicYearsApi = {
  list: (query: { page: number; pageSize: number }) => apiFetch<AcademicYearListResponse>(`/academic-years${queryString(query)}`, { notifyUnauthorized: true }),
  get: (id: string) => apiFetch<AcademicYearRecord>(`/academic-years/${id}`, { notifyUnauthorized: true }),
  create: (input: AcademicYearInput) => apiFetch<AcademicYearRecord>('/academic-years', json('POST', input)),
  update: (id: string, input: Partial<AcademicYearInput>) => apiFetch<AcademicYearRecord>(`/academic-years/${id}`, json('PATCH', input)),
};

export const calendarVersionsApi = {
  list: (academicYearId: string, query: { page: number; pageSize: number }) => apiFetch<AcademicCalendarVersionListResponse>(`/academic-years/${academicYearId}/calendar-versions${queryString(query)}`, { notifyUnauthorized: true }),
  get: (id: string) => apiFetch<AcademicCalendarVersionDetail>(`/academic-calendar-versions/${id}`, { notifyUnauthorized: true }),
  create: (academicYearId: string, input: CalendarVersionInput) => apiFetch<AcademicCalendarVersionDetail>(`/academic-years/${academicYearId}/calendar-versions`, json('POST', input)),
  activate: (id: string) => apiFetch<AcademicCalendarVersionDetail>(`/academic-calendar-versions/${id}/activate`, json('POST', {})),
};

export const schoolClassesApi = {
  list: (academicYearId: string, query: { page: number; pageSize: number; status?: string; gradeLevel?: number }) => apiFetch<SchoolClassListResponse>(`/academic-years/${academicYearId}/classes${queryString(query)}`, { notifyUnauthorized: true }),
  create: (academicYearId: string, input: SchoolClassInput) => apiFetch<SchoolClassRecord>(`/academic-years/${academicYearId}/classes`, json('POST', input)),
  update: (id: string, input: Partial<SchoolClassInput>) => apiFetch<SchoolClassRecord>(`/school-classes/${id}`, json('PATCH', input)),
  action: (id: string, action: 'activate' | 'deactivate') => apiFetch<SchoolClassRecord>(`/school-classes/${id}/${action}`, json('POST', {})),
};

export function normalizeCode(value: string): string { return value.trim().toUpperCase(); }
export function formatCivilDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}
export function academicYearPatch(values: AcademicYearInput, original: AcademicYearRecord): Partial<AcademicYearInput> {
  const code = normalizeCode(values.code); const name = values.name.trim();
  return { ...(code !== original.code ? { code } : {}), ...(name !== original.name ? { name } : {}) };
}
export function schoolClassPatch(values: SchoolClassInput, original: SchoolClassRecord): Partial<SchoolClassInput> {
  const code = normalizeCode(values.code); const name = values.name.trim();
  return { ...(code !== original.code ? { code } : {}), ...(name !== original.name ? { name } : {}), ...(values.gradeLevel !== original.gradeLevel ? { gradeLevel: values.gradeLevel } : {}) };
}
export function calendarDetailToInput(detail: AcademicCalendarVersionDetail): CalendarVersionInput {
  return {
    startDate: detail.startDate, endDate: detail.endDate, officialWeekCount: detail.officialWeekCount, reserveWeekCount: detail.reserveWeekCount,
    teachingWeekdays: [...detail.teachingWeekdays], ...(detail.note ? { note: detail.note } : {}),
    semesters: detail.semesters.map(({ code, name, startDate, endDate }, index) => ({ code, name, startDate, endDate, ordinal: index + 1 })),
    weeks: detail.weeks.map(({ kind, officialWeekNumber, reserveWeekNumber, displayLabel, segments }, index) => ({
      kind, ...(officialWeekNumber === null ? {} : { officialWeekNumber }), ...(reserveWeekNumber === null ? {} : { reserveWeekNumber }), displayLabel, sortOrder: index + 1,
      segments: segments.map(({ label, startDate, endDate }, segmentIndex) => ({ label, startDate, endDate, segmentOrder: segmentIndex + 1 })),
    })),
    interruptions: detail.interruptions.map(({ code, name, startDate, endDate }) => ({ code, name, startDate, endDate })),
  };
}
