import type {
  BusinessConfigurationResource,
  BusinessPolicyFamilyMetadata,
  BusinessPolicyListResponse,
  BusinessPolicyMutationResult,
  BusinessPolicyResolution,
  BusinessPolicyStreamRecord,
  CivilDateString,
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

function nextCommandId(): string {
  return crypto.randomUUID();
}

const jsonPost = (body: unknown) => ({
  method: 'POST',
  body: JSON.stringify(body),
  notifyUnauthorized: true,
});

export const KNOWN_POLICY_ERROR_MESSAGES: Record<string, string> = {
  BUSINESS_POLICY_CONFLICT: 'Xung đột dữ liệu hoặc trạng thái chính sách không cho phép thao tác này (409 Conflict).',
  UNKNOWN_POLICY_FAMILY: 'Nhóm chính sách không tồn tại trên hệ thống.',
  INVALID_POLICY_RESOURCE: 'Phạm vi tài nguyên chính sách không hợp lệ.',
  INVALID_EFFECTIVE_DATE: 'Ngày hiệu lực không hợp lệ theo quy định ngày dân sự (YYYY-MM-DD).',
  POLICY_FAMILY_PUBLICATION_DISABLED: 'Nhóm chính sách này hiện đang tạm dừng công bố.',
  INVALID_POLICY_REPLACEMENT: 'Dữ liệu thay thế không hợp lệ (ngày hiệu lực mới phải sau ngày bắt đầu hiện tại và sau ngày nghiệp vụ).',
  CORRECTION_REASON_REQUIRED: 'Bắt buộc phải nhập lý do khi thực hiện sửa sai lịch sử.',
  POLICY_NOT_CONFIGURED: 'Chưa có chính sách nào được cấu hình cho phạm vi và ngày dân sự này.',
  POLICY_AMBIGUOUS: 'Xung đột dữ liệu nghiêm trọng: phát hiện nhiều chính sách trùng lắp hiệu lực (POLICY_AMBIGUOUS).',
  POLICY_CORRUPT: 'Dữ liệu chính sách không toàn vẹn hoặc phiên bản kiểm tra không khớp (POLICY_CORRUPT).',
};

export function translatePolicyError(message: string | undefined): string {
  if (!message) return 'Đã xảy ra lỗi khi thực hiện thao tác.';
  for (const [code, vietnamese] of Object.entries(KNOWN_POLICY_ERROR_MESSAGES)) {
    if (message.includes(code)) return vietnamese;
  }
  return message;
}

export function normalizeCivilDate(value: unknown): CivilDateString | null {
  if (typeof value !== 'string') return null;
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? (match[1] as CivilDateString) : null;
}

export function isValidCivilDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
}

export function formatAuditTimestamp(timestamp: string | null | undefined): string {
  if (!timestamp) return '—';
  return timestamp.replace('T', ' ').slice(0, 19);
}

export interface ResolvePolicyParams {
  family: string;
  resource: BusinessConfigurationResource;
  civilDate?: string;
}

export interface CreateDraftInput {
  family: string;
  resource: BusinessConfigurationResource;
  payload: Record<string, unknown>;
  effectiveFrom: string;
  effectiveUntil?: string;
}

export interface EditDraftInput {
  payload: Record<string, unknown>;
  expectedRevision: number;
}

export interface ReplaceInput {
  effectiveFrom: string;
  payload: Record<string, unknown>;
}

export interface RetireInput {
  effectiveUntil: string;
  reason?: string;
}

export interface CorrectInput {
  reason: string;
  payload: Record<string, unknown>;
  effectiveFrom?: string;
  effectiveUntil?: string;
}

export const businessConfigurationApi = {
  getFamilies: () =>
    apiFetch<BusinessPolicyFamilyMetadata[]>('/business-configuration/families', { notifyUnauthorized: true }),

  listStreams: (page = 1, pageSize = 25) =>
    apiFetch<BusinessPolicyListResponse>(
      `/business-configuration/policies${queryString({ page, pageSize })}`,
      { notifyUnauthorized: true },
    ),

  getStream: (streamId: string) =>
    apiFetch<BusinessPolicyStreamRecord>(
      `/business-configuration/policies/${encodeURIComponent(streamId)}`,
      { notifyUnauthorized: true },
    ),

  resolvePolicy: (params: ResolvePolicyParams) => {
    const query: Record<string, QueryValue> = {
      family: params.family,
      kind: params.resource.kind,
      academicYearId: params.resource.kind === 'ACADEMIC_YEAR' ? params.resource.academicYearId : undefined,
      civilDate: params.civilDate || undefined,
    };
    return apiFetch<BusinessPolicyResolution>(
      `/business-configuration/resolve${queryString(query)}`,
      { notifyUnauthorized: true },
    );
  },

  createDraft: (input: CreateDraftInput) =>
    apiFetch<BusinessPolicyMutationResult>(
      '/business-configuration/policies/drafts',
      jsonPost({
        family: input.family,
        resource: input.resource,
        payload: input.payload,
        effectiveFrom: input.effectiveFrom,
        ...(input.effectiveUntil ? { effectiveUntil: input.effectiveUntil } : {}),
        commandId: nextCommandId(),
      }),
    ),

  editDraft: (versionId: string, input: EditDraftInput) =>
    apiFetch<BusinessPolicyMutationResult>(
      `/business-configuration/policy-versions/${encodeURIComponent(versionId)}/edit-draft`,
      jsonPost({
        payload: input.payload,
        expectedRevision: input.expectedRevision,
        commandId: nextCommandId(),
      }),
    ),

  publish: (versionId: string) =>
    apiFetch<BusinessPolicyMutationResult>(
      `/business-configuration/policy-versions/${encodeURIComponent(versionId)}/publish`,
      jsonPost({
        commandId: nextCommandId(),
      }),
    ),

  replace: (versionId: string, input: ReplaceInput) =>
    apiFetch<BusinessPolicyMutationResult>(
      `/business-configuration/policy-versions/${encodeURIComponent(versionId)}/replace`,
      jsonPost({
        effectiveFrom: input.effectiveFrom,
        payload: input.payload,
        commandId: nextCommandId(),
      }),
    ),

  retire: (versionId: string, input: RetireInput) =>
    apiFetch<BusinessPolicyMutationResult>(
      `/business-configuration/policy-versions/${encodeURIComponent(versionId)}/retire`,
      jsonPost({
        effectiveUntil: input.effectiveUntil,
        ...(input.reason ? { reason: input.reason.trim() } : {}),
        commandId: nextCommandId(),
      }),
    ),

  correct: (versionId: string, input: CorrectInput) =>
    apiFetch<BusinessPolicyMutationResult>(
      `/business-configuration/policy-versions/${encodeURIComponent(versionId)}/correct`,
      jsonPost({
        reason: input.reason.trim(),
        payload: input.payload,
        ...(input.effectiveFrom ? { effectiveFrom: input.effectiveFrom } : {}),
        ...(input.effectiveUntil ? { effectiveUntil: input.effectiveUntil } : {}),
        commandId: nextCommandId(),
      }),
    ),
};
