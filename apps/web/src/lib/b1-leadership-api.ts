import { ApiError, apiFetch } from './api-client';
import { queryString } from './management-api';

export type LeadershipRole = 'PRINCIPAL' | 'VICE_PRINCIPAL_ACADEMIC';
export type LeadershipOperation = 'APPOINT' | 'DISMISS' | 'TRANSFER';
export interface LeadershipAppointment {
  appointmentId: string;
  userId: string;
  displayName: string;
  username: string;
  validFrom: string;
}
export interface LeadershipContext {
  role: LeadershipRole;
  mode: 'READ_ONLY';
  canConfirm: false;
  commandSubmissionReady: boolean;
  verifiedTechnicalSeat: boolean;
  seatEnabled: boolean;
  activationBlockers: string[];
  expectedSeatVersion: string | null;
  expectedAuthorizationEpoch: string;
  inventoryTruncated: boolean;
  activeAppointments: LeadershipAppointment[];
}
export interface LeadershipCapability {
  capabilityKey: string;
  scopeType: string;
  sourceManagedByFullRoleWriter: boolean;
  state: 'MISSING' | 'OVERLAPPING_GRANTS' | 'ACTIVE_LEGACY_UNLINKED' | 'ACTIVE_LINKED_UNVERIFIED';
}
export interface LeadershipPreview {
  role: LeadershipRole;
  targetUserId: string;
  mode: 'READ_ONLY';
  canConfirm: false;
  provenanceVerified: false;
  eligibleTeachingStaff: boolean;
  inventoryTruncated: boolean;
  requiredCount: number;
  capabilities: LeadershipCapability[];
}
export interface LeadershipCommand {
  role: LeadershipRole;
  operation: LeadershipOperation;
  targetUserId: string;
  previousUserId?: string;
  expectedAppointmentId?: string;
  expectedSeatVersion: string;
  expectedAuthorizationEpoch: string;
  requestKey: string;
}
export interface LeadershipReceipt {
  state: 'APPLIED';
  operation: LeadershipOperation;
  role: LeadershipRole;
  targetUserId: string;
  sourcesOpened: number;
  sourcesClosed: number;
}

export const leadershipApi = {
  async inspect(role: LeadershipRole, targetUserId: string) {
    const [context, preview] = await Promise.all([
      apiFetch<LeadershipContext>('/role-appointments/command-context' + queryString({ role })),
      apiFetch<LeadershipPreview>('/role-appointments/operability-preview' + queryString({ role, targetUserId })),
    ]);
    // Refuse incomplete, old or mismatched payloads. No authority is inferred
    // from a successful GET, a client-side permission list, or a title.
    if (!context || !preview || context.role !== role || preview.role !== role ||
        preview.targetUserId !== targetUserId || context.mode !== 'READ_ONLY' ||
        preview.mode !== 'READ_ONLY' || context.canConfirm !== false ||
        preview.canConfirm !== false || preview.provenanceVerified !== false ||
        typeof context.commandSubmissionReady !== 'boolean' ||
        !Array.isArray(context.activeAppointments) || !Array.isArray(context.activationBlockers) ||
        !Array.isArray(preview.capabilities) || preview.requiredCount !== preview.capabilities.length ||
        typeof context.inventoryTruncated !== 'boolean' || typeof preview.inventoryTruncated !== 'boolean') {
      throw new ApiError(0, 'Không thể đọc bản kiểm tra chức trách.');
    }
    return { context, preview };
  },
  async execute(command: LeadershipCommand): Promise<LeadershipReceipt> {
    const receipt = await apiFetch<LeadershipReceipt>('/role-appointments/commands', {
      method: 'POST', body: JSON.stringify(command),
    });
    if (!receipt || receipt.state !== 'APPLIED' || receipt.operation !== command.operation ||
        receipt.role !== command.role || receipt.targetUserId !== command.targetUserId) {
      throw new ApiError(0, 'Chưa xác minh được kết quả thao tác.');
    }
    return receipt;
  },
};
