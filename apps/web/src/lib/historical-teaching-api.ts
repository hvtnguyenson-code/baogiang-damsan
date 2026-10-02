import type {
  HistoricalTeachingConfirmResponse,
  HistoricalTeachingOptionsResponse,
  HistoricalTeachingPreviewResponse,
  HistoricalTeachingReconciliationResponse,
  HistoricalTeachingReverseResponse,
} from '@baogiang/contracts/historical-teaching';
import { apiFetch } from './api-client';

const json = (body: unknown) => ({
  method: 'POST',
  body: JSON.stringify(body),
  notifyUnauthorized: true,
});

function queryString(query: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  const text = params.toString();
  return text ? `?${text}` : '';
}

export const historicalTeachingApi = {
  options: (academicYearId?: string) =>
    apiFetch<HistoricalTeachingOptionsResponse>(
      `/historical-teaching/options${queryString({ academicYearId })}`,
      { notifyUnauthorized: true },
    ),

  preview: (academicYearId: string, sourceText: string) =>
    apiFetch<HistoricalTeachingPreviewResponse>(
      '/historical-teaching/preview',
      json({ academicYearId, sourceText }),
    ),

  confirm: (
    academicYearId: string,
    sourceText: string,
    batchRef: string,
    requestFingerprint: string,
    requestKey: string,
  ) =>
    apiFetch<HistoricalTeachingConfirmResponse>(
      '/historical-teaching/confirm',
      json({ academicYearId, sourceText, batchRef, requestFingerprint, requestKey }),
    ),

  reconciliation: (academicYearId: string, schoolClassCode: string, subjectCode: string) =>
    apiFetch<HistoricalTeachingReconciliationResponse>(
      `/historical-teaching/reconciliation${queryString({ academicYearId, schoolClassCode, subjectCode })}`,
      { notifyUnauthorized: true },
    ),

  reverse: (
    executionId: string,
    input: { requestKey: string; expectedUpdatedAt: string; reversalReason: string },
  ) =>
    apiFetch<HistoricalTeachingReverseResponse>(
      `/historical-teaching/executions/${executionId}/reverse`,
      json(input),
    ),
};
