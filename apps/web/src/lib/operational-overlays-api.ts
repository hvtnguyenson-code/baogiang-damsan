import type {
  CalendarExceptionCreateResult,
  CalendarExceptionListResponse,
  CalendarExceptionRecord,
  CalendarExceptionReverseResult,
  CalendarExceptionScope,
  CalendarExceptionTimeSelector,
  CivilDateString,
  OperationalLessonDispositionCreateResult,
  OperationalLessonDispositionListResponse,
  OperationalLessonDispositionRecord,
  OperationalLessonDispositionReverseResult,
  OperationalLessonDispositionType,
  OperationalOverlayStatus,
} from '@baogiang/contracts';
import { apiFetch } from './api-client';

type QueryValue = string | number | undefined;
function queryString(query: Record<string, QueryValue>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const suffix = params.toString();
  return suffix ? `?${suffix}` : '';
}

const json = (body: unknown) => ({
  method: 'POST',
  body: JSON.stringify(body),
  notifyUnauthorized: true,
});

export interface CalendarExceptionListQuery {
  academicYearId: string;
  civilDate?: CivilDateString;
  status?: OperationalOverlayStatus;
  scope?: CalendarExceptionScope;
  page?: number;
  pageSize?: number;
}

export interface CalendarExceptionCreateInput {
  academicYearId: string;
  academicCalendarVersionId: string;
  civilDate: CivilDateString;
  scope: CalendarExceptionScope;
  gradeLevel?: 10 | 11 | 12;
  schoolClassId?: string;
  timeSelector: CalendarExceptionTimeSelector;
  session?: 'MORNING' | 'AFTERNOON';
  exactTimeSlotDefinitionIds?: string[];
  note?: string;
  replacesId?: string;
  requestKey: string;
}

export interface LessonDispositionListQuery {
  academicYearId: string;
  subjectId?: string;
  schoolClassId?: string;
  sourceCivilDate?: CivilDateString;
  status?: OperationalOverlayStatus;
  dispositionType?: OperationalLessonDispositionType;
  page?: number;
  pageSize?: number;
}

export interface LessonDispositionCreateInput {
  timetableEntryId: string;
  sourceCivilDate: CivilDateString;
  dispositionType: OperationalLessonDispositionType;
  assignedTeacherUserId?: string;
  note?: string;
  replacesId?: string;
  requestKey: string;
}

export interface OverlayReverseInput {
  requestKey: string;
  expectedUpdatedAt: string;
  reversalReason: string;
}

export interface OperationalSourceOccurrence {
  occurrenceKey: string;
  timetableEntryId: string;
  civilDate: CivilDateString;
  schoolClassId: string;
  schoolClassName: string | null;
  gradeLevel: number;
  subjectId: string;
  responsibleTeacherUserId: string;
  responsibleTeacherName: string | null;
  subjectName: string | null;
  slot: { id: string; weekday: string; session: string; startTime: string; endTime: string };
  effectiveKind: 'BASE_TIMETABLE' | 'CALENDAR_INTERRUPTION' | 'CALENDAR_EXCEPTION' | 'SPECIAL_ACTIVITY_SUPPRESSED' | 'OPERATIONAL_DISPOSITION';
  selectable: boolean;
}
export type OperationalSourceOccurrencesResponse =
  | { status: 'PASS'; items: OperationalSourceOccurrence[]; coverage: { ppctItemAllocation: 'NOT_ASSESSED' } }
  | { status: 'BLOCKED'; items: []; reason: string; coverage: { ppctItemAllocation: 'NOT_ASSESSED' } };
export interface OperationalWorkspaceContext {
  years: Array<{ id: string; code: string; name: string }>;
  subjects: Array<{ id: string; code: string; name: string }>;
  permissions: {
    calendarSchoolWide: boolean;
    teachingSchoolWide: boolean;
    teachingSubjectIds: string[];
  };
}
/** Exact existing API only; validation and authorization remain server-side. */
export const operationalOverlaysApi = {
  listSourceOccurrences: (query: { academicYearId: string; civilDate: CivilDateString; subjectId?: string }) =>
    apiFetch<OperationalSourceOccurrencesResponse>(
      `/operational-overlays/workspace/source-occurrences${queryString(query)}`,
      { notifyUnauthorized: true },
    ),
  getWorkspaceContext: () => apiFetch<OperationalWorkspaceContext>('/operational-overlays/workspace/context', { notifyUnauthorized: true }),
  listCalendarExceptions: (query: CalendarExceptionListQuery) =>
    apiFetch<CalendarExceptionListResponse>(
      `/operational-overlays/calendar-exceptions${queryString({ ...query })}`,
      { notifyUnauthorized: true },
    ),
  getCalendarException: (id: string) =>
    apiFetch<CalendarExceptionRecord>(
      `/operational-overlays/calendar-exceptions/${encodeURIComponent(id)}`,
      { notifyUnauthorized: true },
    ),
  createCalendarException: (input: CalendarExceptionCreateInput) =>
    apiFetch<CalendarExceptionCreateResult>('/operational-overlays/calendar-exceptions', json(input)),
  reverseCalendarException: (id: string, input: OverlayReverseInput) =>
    apiFetch<CalendarExceptionReverseResult>(
      `/operational-overlays/calendar-exceptions/${encodeURIComponent(id)}/reverse`,
      json(input),
    ),
  listLessonDispositions: (query: LessonDispositionListQuery) =>
    apiFetch<OperationalLessonDispositionListResponse>(
      `/operational-overlays/lesson-dispositions${queryString({ ...query })}`,
      { notifyUnauthorized: true },
    ),
  getLessonDisposition: (id: string) =>
    apiFetch<OperationalLessonDispositionRecord>(
      `/operational-overlays/lesson-dispositions/${encodeURIComponent(id)}`,
      { notifyUnauthorized: true },
    ),
  createLessonDisposition: (input: LessonDispositionCreateInput) =>
    apiFetch<OperationalLessonDispositionCreateResult>('/operational-overlays/lesson-dispositions', json(input)),
  reverseLessonDisposition: (id: string, input: OverlayReverseInput) =>
    apiFetch<OperationalLessonDispositionReverseResult>(
      `/operational-overlays/lesson-dispositions/${encodeURIComponent(id)}/reverse`,
      json(input),
    ),
};
