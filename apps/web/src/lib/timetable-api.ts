import type {
  AcademicWeekday,
  TimeSlotDefinitionListResponse,
  TimeSlotDefinitionRecord,
  TimeSlotRevisionResult,
  TimeSlotSession,
  TimetableActivationResult,
  TimetableEffectiveResolution,
  TimetableEntryListResponse,
  TimetableImportAliasEntityType,
  TimetableImportAliasListResponse,
  TimetableImportAliasRecord,
  TimetableImportNativeSessionMode,
  TimetableImportProfileDetail,
  TimetableImportProfileListResponse,
  TimetableImportSourceFormat,
  TimetableImportWorkbookConfirmResponse,
  TimetableImportWorkbookInspectionResponse,
  TimetableImportWorkbookPreviewResponse,
  TimetableReadinessProfile,
  TimetableReadinessResponse,
  TimetableValidationReport,
  TimetableVersionListResponse,
  TimetableVersionRecord,
  TimetableVersionStatus,
} from '@baogiang/contracts';
import { apiFetch } from './api-client';

type QueryValue = string | number | boolean | undefined;

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

const json = (method: string, body?: unknown) => ({
  method,
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  notifyUnauthorized: true,
});

function workbookFormData(file: File, fields: Record<string, string | number | undefined>): FormData {
  const form = new FormData();
  form.append('file', file);
  Object.entries(fields).forEach(([key, value]) => {
    if (value !== undefined) {
      form.append(key, String(value));
    }
  });
  return form;
}

// =========================================================================
// TIME SLOTS
// =========================================================================

export interface ListTimeSlotsQuery {
  page?: number;
  pageSize?: number;
  weekday?: AcademicWeekday;
  session?: TimeSlotSession;
  isActive?: boolean;
}

export interface CreateTimeSlotInput {
  weekday: AcademicWeekday;
  session: TimeSlotSession;
  ordinal: number;
  displayLabel: string;
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  allowRegularTeaching?: boolean;
  allowMakeupTeaching?: boolean;
  allowSelfStudy?: boolean;
}

export interface ReviseTimeSlotInput {
  displayLabel: string;
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  allowRegularTeaching: boolean;
  allowMakeupTeaching: boolean;
  allowSelfStudy: boolean;
}

export const timeSlotsApi = {
  list: (academicYearId: string, query: ListTimeSlotsQuery = {}) =>
    apiFetch<TimeSlotDefinitionListResponse>(
      `/academic-years/${academicYearId}/time-slots${queryString(query as Record<string, QueryValue>)}`,
      { notifyUnauthorized: true },
    ),

  create: (academicYearId: string, input: CreateTimeSlotInput) =>
    apiFetch<TimeSlotDefinitionRecord>(
      `/academic-years/${academicYearId}/time-slots`,
      json('POST', input),
    ),

  get: (id: string) =>
    apiFetch<TimeSlotDefinitionRecord>(
      `/time-slots/${id}`,
      { notifyUnauthorized: true },
    ),

  revise: (id: string, input: ReviseTimeSlotInput) =>
    apiFetch<TimeSlotRevisionResult>(
      `/time-slots/${id}/revise`,
      json('POST', input),
    ),

  retire: (id: string) =>
    apiFetch<TimeSlotDefinitionRecord>(
      `/time-slots/${id}/retire`,
      json('POST', {}),
    ),
};

// =========================================================================
// TIMETABLE VERSIONS & LIFECYCLE
// =========================================================================

export interface ListTimetableVersionsQuery {
  page?: number;
  pageSize?: number;
  status?: TimetableVersionStatus;
}

export interface CreateTimetableVersionInput {
  note?: string;
}

export interface SetTimetableTargetInput {
  calendarVersionId: string;
  effectiveAcademicWeekId: string;
  expectedUpdatedAt: string;
}

export interface ListTimetableEntriesQuery {
  page?: number;
  pageSize?: number;
  weekday?: AcademicWeekday;
  schoolClassId?: string;
  subjectId?: string;
  teacherUserId?: string;
}

export interface ValidateTimetableVersionInput {
  expectedUpdatedAt: string;
}

export interface ApproveTimetableVersionInput {
  expectedUpdatedAt: string;
}

export interface ActivateTimetableVersionInput {
  expectedUpdatedAt: string;
  expectedActiveVersionId?: string | null;
}

export interface EvaluateTimetableReadinessQuery {
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
  profile?: TimetableReadinessProfile;
}

export const timetableVersionsApi = {
  list: (academicYearId: string, query: ListTimetableVersionsQuery = {}) =>
    apiFetch<TimetableVersionListResponse>(
      `/academic-years/${academicYearId}/timetable-versions${queryString(query as Record<string, QueryValue>)}`,
      { notifyUnauthorized: true },
    ),

  create: (academicYearId: string, input: CreateTimetableVersionInput = {}) =>
    apiFetch<TimetableVersionRecord>(
      `/academic-years/${academicYearId}/timetable-versions`,
      json('POST', input),
    ),

  get: (id: string) =>
    apiFetch<TimetableVersionRecord>(
      `/timetable-versions/${id}`,
      { notifyUnauthorized: true },
    ),

  setTarget: (id: string, input: SetTimetableTargetInput) =>
    apiFetch<TimetableVersionRecord>(
      `/timetable-versions/${id}/target`,
      json('POST', input),
    ),

  listEntries: (id: string, query: ListTimetableEntriesQuery = {}) =>
    apiFetch<TimetableEntryListResponse>(
      `/timetable-versions/${id}/entries${queryString(query as Record<string, QueryValue>)}`,
      { notifyUnauthorized: true },
    ),

  validate: (id: string, input: ValidateTimetableVersionInput) =>
    apiFetch<TimetableValidationReport>(
      `/timetable-versions/${id}/validate`,
      json('POST', input),
    ),

  approve: (id: string, input: ApproveTimetableVersionInput) =>
    apiFetch<TimetableVersionRecord>(
      `/timetable-versions/${id}/approve`,
      json('POST', input),
    ),

  activate: (id: string, input: ActivateTimetableVersionInput) =>
    apiFetch<TimetableActivationResult>(
      `/timetable-versions/${id}/activate`,
      json('POST', input),
    ),

  readiness: (id: string, query: EvaluateTimetableReadinessQuery) =>
    apiFetch<TimetableReadinessResponse>(
      `/timetable-versions/${id}/readiness${queryString(query as unknown as Record<string, QueryValue>)}`,
      { notifyUnauthorized: true },
    ),

  resolveEffective: (academicYearId: string, date: string) =>
    apiFetch<TimetableEffectiveResolution>(
      `/academic-years/${academicYearId}/timetable-resolution${queryString({ date })}`,
      { notifyUnauthorized: true },
    ),
};

// =========================================================================
// TIMETABLE IMPORT (WORKBOOKS, PROFILES, ALIASES)
// =========================================================================

export interface InspectTimetableWorkbookOptions {
  profileRevisionId: string;
  sourceFormat?: TimetableImportSourceFormat;
  nativeSessionMode?: TimetableImportNativeSessionMode;
}

export interface PreviewTimetableWorkbookOptions extends InspectTimetableWorkbookOptions {
  academicYearId: string;
  calendarVersionId: string;
  effectiveAcademicWeekId: string;
  sheetName?: string;
  headerRowNumber?: number;
}

export interface ConfirmTimetableWorkbookOptions extends PreviewTimetableWorkbookOptions {
  requestIdempotencyKey?: string;
}

export interface ListTimetableAliasesQuery {
  entityType?: TimetableImportAliasEntityType;
  academicYearId?: string;
  includeRetired?: boolean;
}

export interface CreateTimetableAliasInput {
  entityType: TimetableImportAliasEntityType;
  sourceValue: string;
  teacherUserId?: string;
  academicYearId?: string;
  schoolClassId?: string;
  subjectId?: string;
}

export const timetableImportApi = {
  listProfiles: () =>
    apiFetch<TimetableImportProfileListResponse>(
      '/timetable-import/profiles',
      { notifyUnauthorized: true },
    ),

  getProfile: (profileId: string) =>
    apiFetch<TimetableImportProfileDetail>(
      `/timetable-import/profiles/${profileId}`,
      { notifyUnauthorized: true },
    ),

  inspect: (file: File, options?: InspectTimetableWorkbookOptions) =>
    apiFetch<TimetableImportWorkbookInspectionResponse>(
      '/timetable-import/workbooks/inspect',
      {
        method: 'POST',
        body: workbookFormData(file, {
          profileRevisionId: options?.profileRevisionId,
          sourceFormat: options?.sourceFormat,
          nativeSessionMode: options?.nativeSessionMode,
        }),
        notifyUnauthorized: true,
      },
    ),

  preview: (file: File, options: PreviewTimetableWorkbookOptions) =>
    apiFetch<TimetableImportWorkbookPreviewResponse>(
      '/timetable-import/workbooks/preview',
      {
        method: 'POST',
        body: workbookFormData(file, {
          profileRevisionId: options.profileRevisionId,
          sourceFormat: options.sourceFormat,
          nativeSessionMode: options.nativeSessionMode,
          academicYearId: options.academicYearId,
          calendarVersionId: options.calendarVersionId,
          effectiveAcademicWeekId: options.effectiveAcademicWeekId,
          sheetName: options.sheetName,
          headerRowNumber: options.headerRowNumber,
        }),
        notifyUnauthorized: true,
      },
    ),

  confirm: (file: File, options: ConfirmTimetableWorkbookOptions) =>
    apiFetch<TimetableImportWorkbookConfirmResponse>(
      '/timetable-import/workbooks/confirm',
      {
        method: 'POST',
        body: workbookFormData(file, {
          profileRevisionId: options.profileRevisionId,
          sourceFormat: options.sourceFormat,
          nativeSessionMode: options.nativeSessionMode,
          academicYearId: options.academicYearId,
          calendarVersionId: options.calendarVersionId,
          effectiveAcademicWeekId: options.effectiveAcademicWeekId,
          sheetName: options.sheetName,
          headerRowNumber: options.headerRowNumber,
          requestIdempotencyKey: options.requestIdempotencyKey,
        }),
        notifyUnauthorized: true,
      },
    ),

  listAliases: (profileId: string, query: ListTimetableAliasesQuery = {}) =>
    apiFetch<TimetableImportAliasListResponse>(
      `/timetable-import/profiles/${profileId}/aliases${queryString(query as Record<string, QueryValue>)}`,
      { notifyUnauthorized: true },
    ),

  createAlias: (profileId: string, input: CreateTimetableAliasInput) =>
    apiFetch<TimetableImportAliasRecord>(
      `/timetable-import/profiles/${profileId}/aliases`,
      json('POST', input),
    ),

  retireAlias: (aliasId: string) =>
    apiFetch<TimetableImportAliasRecord>(
      `/timetable-import/aliases/${aliasId}/retire`,
      json('POST', {}),
    ),
};
