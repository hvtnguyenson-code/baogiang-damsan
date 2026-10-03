import type {
  MakeupTeachingCandidateListResponse,
  MakeupTeachingScheduleCreateResult,
  MakeupTeachingScheduleListResponse,
  MakeupTeachingScheduleRecord,
  MakeupTeachingScheduleReverseResult,
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

const json = (method: string, body?: unknown) => ({
  method,
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  notifyUnauthorized: true,
});

export type CreateMakeupScheduleInput = {
  academicYearId: string;
  sourceTimetableEntryId: string;
  sourceCivilDate: string;
  sourceDispositionId?: string;
  sourcePpctPlanId?: string;
  sourcePpctItemId?: string;
  targetCivilDate: string;
  targetTimeSlotDefinitionId: string;
  scheduledTeacherUserId: string;
  replacesId?: string;
  note?: string;
  requestKey: string;
};

export type ReverseMakeupScheduleInput = {
  expectedUpdatedAt: string;
  reversalReason: string;
  requestKey: string;
};

export const makeupSchedulesApi = {
  listCandidates: (query: { academicYearId: string; schoolClassId?: string; subjectId?: string; page?: number; pageSize?: number }) =>
    apiFetch<MakeupTeachingCandidateListResponse>(`/operational-overlays/makeup-schedules/candidates${queryString(query)}`, { notifyUnauthorized: true }),

  listSchedules: (query: { academicYearId?: string; schoolClassId?: string; subjectId?: string; status?: 'ACTIVE' | 'REVERSED'; page?: number; pageSize?: number }) =>
    apiFetch<MakeupTeachingScheduleListResponse>(`/operational-overlays/makeup-schedules${queryString(query)}`, { notifyUnauthorized: true }),

  getSchedule: (id: string) =>
    apiFetch<MakeupTeachingScheduleRecord>(`/operational-overlays/makeup-schedules/${id}`, { notifyUnauthorized: true }),

  createSchedule: (input: CreateMakeupScheduleInput) =>
    apiFetch<MakeupTeachingScheduleCreateResult>('/operational-overlays/makeup-schedules', json('POST', input)),

  reverseSchedule: (id: string, input: ReverseMakeupScheduleInput) =>
    apiFetch<MakeupTeachingScheduleReverseResult>(`/operational-overlays/makeup-schedules/${id}/reverse`, json('POST', input)),
};
