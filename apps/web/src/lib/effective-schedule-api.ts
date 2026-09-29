import type {
  CivilDateString,
  EffectiveScheduleComparisonResponse,
  EffectiveScheduleContextOptionsResponse,
  EffectiveScheduleTeacherOptionsResponse,
  IndividualWeeklyScheduleResponse,
  SchoolWideDayScheduleResponse,
} from '@baogiang/contracts';
import { apiFetch } from './api-client';

type QueryValue = string | number | undefined;

function queryString(query: Record<string, QueryValue>): string {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== '') {
      params.set(key, String(value));
    }
  });
  const text = params.toString();
  return text ? `?${text}` : '';
}

export async function fetchEffectiveScheduleContext(
  academicYearId?: string,
): Promise<EffectiveScheduleContextOptionsResponse> {
  const qs = queryString({ academicYearId });
  return apiFetch<EffectiveScheduleContextOptionsResponse>(`/effective-schedule/context${qs}`, {
    notifyUnauthorized: true,
  });
}

export async function fetchEffectiveScheduleTeachers(
  search?: string,
  page = 1,
  pageSize = 20,
): Promise<EffectiveScheduleTeacherOptionsResponse> {
  const qs = queryString({ search, page, pageSize });
  return apiFetch<EffectiveScheduleTeacherOptionsResponse>(`/effective-schedule/teachers${qs}`, {
    notifyUnauthorized: true,
  });
}

export async function fetchIndividualWeeklySchedule(
  academicYearId: string,
  academicWeekId: string,
  teacherUserId?: string,
): Promise<IndividualWeeklyScheduleResponse> {
  const qs = queryString({ academicYearId, academicWeekId, teacherUserId });
  return apiFetch<IndividualWeeklyScheduleResponse>(`/effective-schedule/weekly${qs}`, {
    notifyUnauthorized: true,
  });
}

export async function fetchSchoolWideDaySchedule(
  academicYearId: string,
  civilDate: CivilDateString,
): Promise<SchoolWideDayScheduleResponse> {
  const qs = queryString({ academicYearId, civilDate });
  return apiFetch<SchoolWideDayScheduleResponse>(`/effective-schedule/school-wide${qs}`, {
    notifyUnauthorized: true,
  });
}

export async function fetchEffectiveScheduleComparison(
  academicYearId: string,
  academicWeekId: string,
  peerTeacherUserId: string,
): Promise<EffectiveScheduleComparisonResponse> {
  const qs = queryString({ academicYearId, academicWeekId, peerTeacherUserId });
  return apiFetch<EffectiveScheduleComparisonResponse>(`/effective-schedule/compare${qs}`, {
    notifyUnauthorized: true,
  });
}
