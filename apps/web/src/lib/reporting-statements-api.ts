import type {
  ReportingStatementCommandResult,
  ReportingStatementDecideRequest,
  ReportingStatementDetailResponse,
  ReportingStatementListResponse,
  ReportingStatementPreviewRequest,
  ReportingStatementPreviewResponse,
  ReportingStatementSubmitRequest,
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

/**
 * Tạo một idempotency requestKey ngẫu nhiên cho một logical command.
 *
 * QUY TẮC BẮT BUỘC:
 * Một logical user command phải giữ cùng requestKey khi retry một request chưa rõ kết quả
 * (ví dụ: network timeout, client error). Không tạo requestKey mới cho mỗi transport retry.
 * Chỉ command mới thật sự mới được tạo requestKey mới.
 */
export function createReportingStatementRequestKey(): string {
  return crypto.randomUUID();
}

export const reportingStatementsApi = {
  preview: (input: ReportingStatementPreviewRequest): Promise<ReportingStatementPreviewResponse> =>
    apiFetch<ReportingStatementPreviewResponse>('/reporting-statements/preview', json('POST', input)),

  listMine: (query: { page: number; pageSize: number }): Promise<ReportingStatementListResponse> =>
    apiFetch<ReportingStatementListResponse>(`/reporting-statements/mine${queryString(query)}`, {
      notifyUnauthorized: true,
    }),

  listAccessible: (query: { page: number; pageSize: number }): Promise<ReportingStatementListResponse> =>
    apiFetch<ReportingStatementListResponse>(`/reporting-statements/accessible${queryString(query)}`, {
      notifyUnauthorized: true,
    }),

  listPendingDecision: (query: { page: number; pageSize: number }): Promise<ReportingStatementListResponse> =>
    apiFetch<ReportingStatementListResponse>(`/reporting-statements/pending-decision${queryString(query)}`, {
      notifyUnauthorized: true,
    }),

  getDetail: (revisionId: string): Promise<ReportingStatementDetailResponse> =>
    apiFetch<ReportingStatementDetailResponse>(`/reporting-statements/${revisionId}`, {
      notifyUnauthorized: true,
    }),

  submit: (input: ReportingStatementSubmitRequest): Promise<ReportingStatementCommandResult> =>
    apiFetch<ReportingStatementCommandResult>('/reporting-statements', json('POST', input)),

  approve: (
    revisionId: string,
    input: ReportingStatementDecideRequest,
  ): Promise<ReportingStatementCommandResult> =>
    apiFetch<ReportingStatementCommandResult>(
      `/reporting-statements/${revisionId}/approve`,
      json('POST', input),
    ),

  reject: (
    revisionId: string,
    input: ReportingStatementDecideRequest,
  ): Promise<ReportingStatementCommandResult> =>
    apiFetch<ReportingStatementCommandResult>(
      `/reporting-statements/${revisionId}/reject`,
      json('POST', input),
    ),
};
