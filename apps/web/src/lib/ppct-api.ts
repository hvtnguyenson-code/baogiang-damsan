import type {
  CivilDateString,
  PpctAssociationHistoryResponse,
  PpctAssociationSwitchResult,
  PpctClassCurricularProfile,
  PpctPlanListResponse,
  PpctResolution,
  PpctVersionContent,
  PpctVersionListResponse,
  PpctWorkspaceAcademicYearOptionListResponse,
  PpctWorkspaceOptionsResponse,
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

const json = (body: unknown) => ({
  method: 'POST',
  body: JSON.stringify(body),
  notifyUnauthorized: true,
});

export interface SwitchPpctAssociationInput {
  ppctVersionId: string;
  curricularProfile: PpctClassCurricularProfile;
  effectiveFrom: CivilDateString;
  expectedLatestAssociationId: string | null;
}

export interface ListPpctPlansQuery {
  subjectId?: string;
  gradeLevel?: 10 | 11 | 12;
  page?: number;
  pageSize?: number;
}

export const ppctApi = {
  years: (query: { page?: number; pageSize?: number } = {}) =>
    apiFetch<PpctWorkspaceAcademicYearOptionListResponse>(
      `/ppct-options/academic-years${queryString(query)}`,
      { notifyUnauthorized: true },
    ),

  workspace: (academicYearId: string) =>
    apiFetch<PpctWorkspaceOptionsResponse>(
      `/ppct-options/academic-years/${academicYearId}`,
      { notifyUnauthorized: true },
    ),

  plans: (academicYearId: string, query: ListPpctPlansQuery = {}) =>
    apiFetch<PpctPlanListResponse>(
      `/academic-years/${academicYearId}/ppct-plans${queryString(query as Record<string, QueryValue>)}`,
      { notifyUnauthorized: true },
    ),

  versions: (planId: string, query: { page?: number; pageSize?: number } = {}) =>
    apiFetch<PpctVersionListResponse>(
      `/ppct-plans/${planId}/versions${queryString(query)}`,
      { notifyUnauthorized: true },
    ),

  versionContent: (versionId: string) =>
    apiFetch<PpctVersionContent>(
      `/ppct-versions/${versionId}/content`,
      { notifyUnauthorized: true },
    ),

  associationHistory: (academicYearId: string, schoolClassId: string, subjectId: string) =>
    apiFetch<PpctAssociationHistoryResponse>(
      `/academic-years/${academicYearId}/classes/${schoolClassId}/subjects/${subjectId}/ppct-associations`,
      { notifyUnauthorized: true },
    ),

  switchAssociation: (
    academicYearId: string,
    schoolClassId: string,
    subjectId: string,
    input: SwitchPpctAssociationInput,
  ) =>
    apiFetch<PpctAssociationSwitchResult>(
      `/academic-years/${academicYearId}/classes/${schoolClassId}/subjects/${subjectId}/ppct-associations/switch`,
      json(input),
    ),

  resolution: (
    academicYearId: string,
    schoolClassId: string,
    subjectId: string,
    date: CivilDateString,
  ) =>
    apiFetch<PpctResolution>(
      `/academic-years/${academicYearId}/classes/${schoolClassId}/subjects/${subjectId}/ppct-resolution?date=${date}`,
      { notifyUnauthorized: true },
    ),
};
