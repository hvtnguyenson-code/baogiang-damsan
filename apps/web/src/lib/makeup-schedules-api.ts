import type {
  CreateMakeupScheduleRequest,
  MakeupTargetOptionsResponse,
  MakeupTeachingCandidateListResponse,
  MakeupTeachingScheduleCreateResult,
  MakeupTeachingScheduleListResponse,
  MakeupTeachingScheduleRecord,
  MakeupTeachingScheduleReverseResult,
  ReverseMakeupScheduleRequest,
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

export type CreateMakeupScheduleInput = CreateMakeupScheduleRequest & { expectedConsequenceFingerprint?: string };
export interface MakeupConsequencePreview {
  status: 'PASS';
  consequenceFingerprint: string;
  coverage: { ppctItemAllocation: 'ASSESSED'; workload: 'ASSESSED'; debt: 'ASSESSED' };
  before: { completedCount: number; openDebtCount: number };
  after: { completedCount: number; openDebtCount: number };
  consumesNewPpctItem: boolean;
  createsExecution: boolean;
  teachers: Array<{ earnedCreditUnchanged: boolean; requiredCreditUnchanged: boolean }>;
}
export type ReverseMakeupScheduleInput = ReverseMakeupScheduleRequest;

export const makeupSchedulesApi = {
  previewSchedule: (input: CreateMakeupScheduleInput) =>
    apiFetch<MakeupConsequencePreview>('/operational-overlays/makeup-schedules/preview', json('POST', input)),
  listCandidates: (query: { academicYearId: string; schoolClassId?: string; subjectId?: string; page?: number; pageSize?: number }) =>
    apiFetch<MakeupTeachingCandidateListResponse>(`/operational-overlays/makeup-schedules/candidates${queryString(query)}`, { notifyUnauthorized: true }),

  getTargetOptions: (query: { academicYearId: string; sourceNormalOccurrenceKey: string; targetCivilDate: string }) =>
    apiFetch<MakeupTargetOptionsResponse>(`/operational-overlays/makeup-schedules/target-options${queryString(query)}`, { notifyUnauthorized: true }),

  listSchedules: (query: { academicYearId?: string; schoolClassId?: string; subjectId?: string; status?: 'ACTIVE' | 'REVERSED'; page?: number; pageSize?: number }) =>
    apiFetch<MakeupTeachingScheduleListResponse>(`/operational-overlays/makeup-schedules${queryString(query)}`, { notifyUnauthorized: true }),

  getSchedule: (id: string) =>
    apiFetch<MakeupTeachingScheduleRecord>(`/operational-overlays/makeup-schedules/${id}`, { notifyUnauthorized: true }),

  createSchedule: (input: CreateMakeupScheduleInput) =>
    apiFetch<MakeupTeachingScheduleCreateResult>('/operational-overlays/makeup-schedules', json('POST', input)),

  reverseSchedule: (id: string, input: ReverseMakeupScheduleInput) =>
    apiFetch<MakeupTeachingScheduleReverseResult>(`/operational-overlays/makeup-schedules/${id}/reverse`, json('POST', input)),
};
