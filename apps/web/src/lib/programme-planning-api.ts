import type {
  GddpWorkbookConfirmResponse,
  GddpWorkbookInspectionResponse,
  GddpWorkbookPreviewResponse,
  HdtnWorkbookConfirmResponse,
  HdtnWorkbookInspectionResponse,
  HdtnWorkbookPreviewResponse,
  ProgrammeWorkspaceDetailResponse,
  ProgrammeWorkspaceOptionsResponse,
} from '@baogiang/contracts';
import { apiFetch } from './api-client';

export function createCommandId(): string {
  return crypto.randomUUID();
}

export interface ConfirmHdtnWorkbookInput {
  academicYearId: string;
  expectedPreviewFingerprint: string;
  commandId: string;
}

export interface ConfirmGddpWorkbookInput {
  academicYearId: string;
  gradeLevel: number;
  expectedPreviewFingerprint: string;
  commandId: string;
}

export interface PublishPlanVersionInput {
  expectedRevision: number;
  commandId: string;
}

export interface PublishOccurrenceInput {
  expectedRevision: number;
  commandId: string;
}

export interface MaterializeOccurrenceInput {
  commandId: string;
}

export async function getWorkspaceOptions(
  academicYearId?: string,
): Promise<ProgrammeWorkspaceOptionsResponse> {
  const query = academicYearId ? `?academicYearId=${encodeURIComponent(academicYearId)}` : '';
  return apiFetch<ProgrammeWorkspaceOptionsResponse>(`/programme-planning/workspace/options${query}`);
}

export async function getWorkspaceMasterDetail(
  masterId: string,
): Promise<ProgrammeWorkspaceDetailResponse> {
  return apiFetch<ProgrammeWorkspaceDetailResponse>(
    `/programme-planning/workspace/masters/${encodeURIComponent(masterId)}`,
  );
}

export async function inspectHdtnWorkbook(file: File): Promise<HdtnWorkbookInspectionResponse> {
  const body = new FormData();
  body.append('file', file);
  return apiFetch<HdtnWorkbookInspectionResponse>('/programme-planning/hdtn-import/inspect', {
    method: 'POST',
    body,
  });
}

export async function previewHdtnWorkbook(
  file: File,
  academicYearId: string,
): Promise<HdtnWorkbookPreviewResponse> {
  const body = new FormData();
  body.append('file', file);
  body.append('academicYearId', academicYearId);
  return apiFetch<HdtnWorkbookPreviewResponse>('/programme-planning/hdtn-import/preview', {
    method: 'POST',
    body,
  });
}

export async function confirmHdtnWorkbook(
  file: File,
  input: ConfirmHdtnWorkbookInput,
): Promise<HdtnWorkbookConfirmResponse> {
  const body = new FormData();
  body.append('file', file);
  body.append('academicYearId', input.academicYearId);
  body.append('expectedPreviewFingerprint', input.expectedPreviewFingerprint);
  body.append('commandId', input.commandId);
  return apiFetch<HdtnWorkbookConfirmResponse>('/programme-planning/hdtn-import/confirm', {
    method: 'POST',
    body,
  });
}

export async function inspectGddpWorkbook(file: File): Promise<GddpWorkbookInspectionResponse> {
  const body = new FormData();
  body.append('file', file);
  return apiFetch<GddpWorkbookInspectionResponse>('/programme-planning/gddp-import/inspect', {
    method: 'POST',
    body,
  });
}

export async function previewGddpWorkbook(
  file: File,
  academicYearId: string,
  gradeLevel?: number,
): Promise<GddpWorkbookPreviewResponse> {
  const body = new FormData();
  body.append('file', file);
  body.append('academicYearId', academicYearId);
  if (typeof gradeLevel === 'number') {
    body.append('gradeLevel', String(gradeLevel));
  }
  return apiFetch<GddpWorkbookPreviewResponse>('/programme-planning/gddp-import/preview', {
    method: 'POST',
    body,
  });
}

export async function confirmGddpWorkbook(
  file: File,
  input: ConfirmGddpWorkbookInput,
): Promise<GddpWorkbookConfirmResponse> {
  const body = new FormData();
  body.append('file', file);
  body.append('academicYearId', input.academicYearId);
  body.append('gradeLevel', String(input.gradeLevel));
  body.append('expectedPreviewFingerprint', input.expectedPreviewFingerprint);
  body.append('commandId', input.commandId);
  return apiFetch<GddpWorkbookConfirmResponse>('/programme-planning/gddp-import/confirm', {
    method: 'POST',
    body,
  });
}

export async function publishPlanVersion(
  planVersionId: string,
  input: PublishPlanVersionInput,
): Promise<unknown> {
  return apiFetch(`/programme-planning/plan-versions/${encodeURIComponent(planVersionId)}/publish`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function publishOccurrence(
  occurrenceId: string,
  input: PublishOccurrenceInput,
): Promise<unknown> {
  return apiFetch(`/programme-planning/occurrences/${encodeURIComponent(occurrenceId)}/publish`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function materializeOccurrence(
  occurrenceId: string,
  input: MaterializeOccurrenceInput,
): Promise<unknown> {
  return apiFetch(`/programme-planning/occurrences/${encodeURIComponent(occurrenceId)}/materialize`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export const programmePlanningApi = {
  createCommandId,
  getWorkspaceOptions,
  getWorkspaceMasterDetail,
  inspectHdtnWorkbook,
  previewHdtnWorkbook,
  confirmHdtnWorkbook,
  inspectGddpWorkbook,
  previewGddpWorkbook,
  confirmGddpWorkbook,
  publishPlanVersion,
  publishOccurrence,
  materializeOccurrence,
};
