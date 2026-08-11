import type {
  CivilDateString,
  TeachingAssignmentAcademicYearOptionListResponse,
  TeachingAssignmentChangeResult,
  TeachingAssignmentEligibleTeacherListResponse,
  TeachingAssignmentListResponse,
  TeachingAssignmentRecord,
  TeachingAssignmentWorkspaceOptionsResponse,
} from '@baogiang/contracts';
import { apiFetch } from './api-client';

type QueryValue = string | number | undefined;

function queryString(query: Record<string, QueryValue>): string {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== '') params.set(key, String(value));
  });
  const text = params.toString();
  return text ? `?${text}` : '';
}

const json = (body: unknown) => ({ method: 'POST', body: JSON.stringify(body), notifyUnauthorized: true });

export type TeachingAssignmentFilters = {
  page: number;
  pageSize: number;
  schoolClassId?: string;
  subjectId?: string;
  teacherUserId?: string;
  activeOn?: CivilDateString;
};

export type CreateTeachingAssignmentInput = {
  schoolClassId: string;
  subjectId: string;
  teacherUserId: string;
  validFrom: CivilDateString;
  validUntil?: CivilDateString;
  note?: string;
};

export type ChangeTeachingAssignmentTeacherInput = {
  newTeacherUserId: string;
  effectiveFrom: CivilDateString;
  note?: string;
};

export const teachingAssignmentApi = {
  years: (query: { page: number; pageSize: number }) =>
    apiFetch<TeachingAssignmentAcademicYearOptionListResponse>(
      `/teaching-assignment-options/academic-years${queryString(query)}`,
      { notifyUnauthorized: true },
    ),
  workspace: (academicYearId: string) =>
    apiFetch<TeachingAssignmentWorkspaceOptionsResponse>(
      `/teaching-assignment-options/academic-years/${academicYearId}`,
      { notifyUnauthorized: true },
    ),
  eligibleTeachers: (
    academicYearId: string,
    query: {
      subjectId: string;
      validFrom: CivilDateString;
      validUntil?: CivilDateString;
      page: number;
      pageSize: number;
    },
  ) => apiFetch<TeachingAssignmentEligibleTeacherListResponse>(
    `/teaching-assignment-options/academic-years/${academicYearId}/eligible-teachers${queryString(query)}`,
    { notifyUnauthorized: true },
  ),
  list: (academicYearId: string, query: TeachingAssignmentFilters) =>
    apiFetch<TeachingAssignmentListResponse>(
      `/academic-years/${academicYearId}/teaching-assignments${queryString(query)}`,
      { notifyUnauthorized: true },
    ),
  create: (academicYearId: string, input: CreateTeachingAssignmentInput) =>
    apiFetch<TeachingAssignmentRecord>(`/academic-years/${academicYearId}/teaching-assignments`, json(input)),
  end: (id: string, endDate: CivilDateString) =>
    apiFetch<TeachingAssignmentRecord>(`/teaching-assignments/${id}/end`, json({ endDate })),
  changeTeacher: (id: string, input: ChangeTeachingAssignmentTeacherInput) =>
    apiFetch<TeachingAssignmentChangeResult>(`/teaching-assignments/${id}/change-teacher`, json(input)),
};

const CIVIL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isCivilDate(value: string): value is CivilDateString {
  const match = CIVIL_DATE_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

export function nextCivilDate(value: CivilDateString): CivilDateString {
  if (!isCivilDate(value)) throw new RangeError('Invalid civil date.');
  let [year, month, day] = value.split('-').map(Number);
  day += 1;
  if (day > daysInMonth(year, month)) {
    day = 1;
    month += 1;
  }
  if (month > 12) {
    month = 1;
    year += 1;
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` as CivilDateString;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function optionalNote(value: string): string | undefined {
  return value.trim() || undefined;
}

export function buildCreateTeachingAssignmentInput(values: {
  schoolClassId: string;
  subjectId: string;
  teacherUserId: string;
  validFrom: CivilDateString;
  validUntil: string;
  note: string;
}): CreateTeachingAssignmentInput {
  const note = optionalNote(values.note);
  return {
    schoolClassId: values.schoolClassId,
    subjectId: values.subjectId,
    teacherUserId: values.teacherUserId,
    validFrom: values.validFrom,
    ...(isCivilDate(values.validUntil) ? { validUntil: values.validUntil } : {}),
    ...(note ? { note } : {}),
  };
}

export function buildChangeTeachingAssignmentTeacherInput(values: {
  newTeacherUserId: string;
  effectiveFrom: CivilDateString;
  note: string;
}): ChangeTeachingAssignmentTeacherInput {
  const note = optionalNote(values.note);
  return {
    newTeacherUserId: values.newTeacherUserId,
    effectiveFrom: values.effectiveFrom,
    ...(note ? { note } : {}),
  };
}
