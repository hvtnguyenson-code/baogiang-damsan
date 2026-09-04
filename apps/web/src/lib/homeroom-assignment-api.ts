import type {
  CivilDateString,
  HomeroomAssignmentAcademicYearOptionListResponse,
  HomeroomAssignmentChangeResult,
  HomeroomAssignmentCorrectionResult,
  HomeroomAssignmentEligibleTeacherListResponse,
  HomeroomAssignmentHistoricalTeacherIdentityListResponse,
  HomeroomAssignmentListResponse,
  HomeroomAssignmentRecord,
  HomeroomAssignmentWorkspaceOptionsResponse,
} from '@baogiang/contracts';
import { apiFetch } from './api-client';
import { isCivilDate, optionalNote } from './teaching-assignment-api';

type QueryValue = string | number | undefined;
function queryString(query: Record<string, QueryValue>): string {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => { if (value !== undefined && value !== '') params.set(key, String(value)); });
  const text = params.toString();
  return text ? `?${text}` : '';
}
const json = (body: unknown) => ({ method: 'POST', body: JSON.stringify(body), notifyUnauthorized: true });

export type HomeroomAssignmentFilters = { page: number; pageSize: number; schoolClassId?: string; teacherUserId?: string; activeOn?: CivilDateString; };
export type HomeroomAssignmentInput = { schoolClassId: string; teacherUserId: string; validFrom: CivilDateString; validUntil?: CivilDateString; note?: string; entryReason?: string; };
export type ChangeHomeroomTeacherInput = { newTeacherUserId: string; effectiveFrom: CivilDateString; note?: string; entryReason?: string; };
export type CorrectHomeroomAssignmentInput = { reason: string; replacements: Array<{ teacherUserId: string; validFrom: CivilDateString; validUntil?: CivilDateString; note?: string; entryReason?: string; }>; };

export const homeroomAssignmentApi = {
  years: (query: { page: number; pageSize: number }) => apiFetch<HomeroomAssignmentAcademicYearOptionListResponse>(`/homeroom-assignment-options/academic-years${queryString(query)}`, { notifyUnauthorized: true }),
  workspace: (yearId: string) => apiFetch<HomeroomAssignmentWorkspaceOptionsResponse>(`/homeroom-assignment-options/academic-years/${yearId}`, { notifyUnauthorized: true }),
  historicalTeachers: (yearId: string, query: { q: string; page: number; pageSize: number }) => apiFetch<HomeroomAssignmentHistoricalTeacherIdentityListResponse>(`/homeroom-assignment-options/academic-years/${yearId}/historical-teacher-identities${queryString(query)}`, { notifyUnauthorized: true }),
  eligibleTeachers: (yearId: string, query: { validFrom: CivilDateString; validUntil?: CivilDateString; page: number; pageSize: number }) => apiFetch<HomeroomAssignmentEligibleTeacherListResponse>(`/homeroom-assignment-options/academic-years/${yearId}/eligible-teachers${queryString(query)}`, { notifyUnauthorized: true }),
  list: (yearId: string, query: HomeroomAssignmentFilters) => apiFetch<HomeroomAssignmentListResponse>(`/academic-years/${yearId}/homeroom-assignments${queryString(query)}`, { notifyUnauthorized: true }),
  create: (yearId: string, input: HomeroomAssignmentInput) => apiFetch<HomeroomAssignmentRecord>(`/academic-years/${yearId}/homeroom-assignments`, json(input)),
  end: (id: string, endDate: CivilDateString) => apiFetch<HomeroomAssignmentRecord>(`/homeroom-assignments/${id}/end`, json({ endDate })),
  changeTeacher: (id: string, input: ChangeHomeroomTeacherInput) => apiFetch<HomeroomAssignmentChangeResult>(`/homeroom-assignments/${id}/change-teacher`, json(input)),
  correct: (id: string, input: CorrectHomeroomAssignmentInput) => apiFetch<HomeroomAssignmentCorrectionResult>(`/homeroom-assignments/${id}/correct`, json(input)),
};

export function buildHomeroomInput(values: { schoolClassId: string; teacherUserId: string; validFrom: CivilDateString; validUntil: string; note: string; entryReason: string; }): HomeroomAssignmentInput {
  const note = optionalNote(values.note); const entryReason = optionalNote(values.entryReason);
  return { schoolClassId: values.schoolClassId, teacherUserId: values.teacherUserId, validFrom: values.validFrom, ...(isCivilDate(values.validUntil) ? { validUntil: values.validUntil } : {}), ...(note ? { note } : {}), ...(entryReason ? { entryReason } : {}) };
}

export function isBoundedHistorical(validUntil: string, businessDate: CivilDateString): boolean {
  return isCivilDate(validUntil) && validUntil < businessDate;
}
