/**
 * WS1/B1: server-fetched, bounded and READ ONLY sensitive source preflight.
 * Not registered in NestJS, not exposed by HTTP, and not used by any writer.
 * The session actor ID must come from trusted authentication, not a body field.
 *
 * Even when all records cohere, this cannot confirm a capability change:
 * legal office-holder authority, issuer scope over time, complete provenance,
 * projection union, CAS, audit and idempotency are NOT established here.
 */
import { Prisma, PrismaClient } from '@prisma/client';
import {
  inspectSensitiveCapabilityPolicy,
  SensitiveCommand,
  SensitivePolicyCandidateInput,
  SENSITIVE_CAPABILITY_KEYS,
} from './sensitive-capability-policy';

export type SensitiveAuthorityReason =
  | 'CANDIDATE_ONLY' | 'INVALID_REQUEST' | 'UNSUPPORTED_COMMAND'
  | 'GENERIC_WRITER_BLOCKED' | 'AI_PHASE_11_NOT_ACTIVE'
  | 'INACTIVE_OR_UNKNOWN_USER' | 'NO_TECHNICAL_CAPABILITIES'
  | 'NO_UNAMBIGUOUS_ACTOR_SEAT' | 'SOURCE_NOT_FOUND_OR_UNTRUSTED'
  | 'SOURCE_NOT_CURRENT' | 'POLICY_BLOCKED' | 'DATABASE_EVIDENCE_UNAVAILABLE';

export interface SensitiveAuthorityRequest {
  actorUserId: string; // session-owned in any future trusted caller
  targetUserId: string;
  capabilityKey: string;
  scopeType: string;
  scopeResourceId: string | null;
  command: SensitiveCommand;
  exactSourceId?: string | null;
}

export interface SensitiveAuthorityResult {
  mode: 'READ_ONLY';
  verdict: 'SOURCE_CANDIDATE' | 'UNVERIFIED';
  reason: SensitiveAuthorityReason;
  canConfirm: false;
  provenanceVerified: false;
  writerEnabled: false;
  actorSeatEvidence: 'READ_ONLY_CURRENT' | 'UNVERIFIED';
  sourceEvidence: 'CURRENT_SOURCE_MATCH' | 'NOT_APPLICABLE' | 'UNVERIFIED';
}

export const SENSITIVE_AUTHORITY_LIMITS = Object.freeze({
  users: 3,
  activeActorGrants: 9,
  actorAppointments: 3,
  sourceRows: 2,
  maxWait: 1500,
  timeout: 6000,
});

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const AI = new Set<string>(SENSITIVE_CAPABILITY_KEYS.filter((key) => key.startsWith('AI_')));
const sourceRole: Readonly<Record<string, 'PRINCIPAL' | 'VICE_PRINCIPAL_ACADEMIC'>> = Object.freeze({
  APPROVAL_PRINCIPAL: 'PRINCIPAL',
  APPROVAL_VICE_PRINCIPAL: 'VICE_PRINCIPAL_ACADEMIC',
  AUDIT_VIEW: 'PRINCIPAL',
  ADDITIONAL_DUTY_CATALOG_MANAGE: 'VICE_PRINCIPAL_ACADEMIC',
});

type UserRow = { id: string; status: string; mustChangePassword: boolean };
type GrantRow = { capabilityKey: string };
type ActorSeatRow = {
  id: string; userId: string; templateKey: string; seatKey: string;
  validFrom: Date; validUntil: Date | null; cancelledAt: Date | null;
  enabled: boolean; policyVersion: bigint;
  originalActorId: string; originalTargetId: string;
};
type SourceRow = {
  id: string; userId: string; coordinateUserId: string; capabilityKey: string;
  scopeType: string; scopeResourceId: string | null; kind: string;
  legacyGrantId: string | null; appointmentId: string | null;
  appointmentUserId: string | null; appointmentTemplateKey: string | null;
  appointmentValidFrom: Date | null; appointmentValidUntil: Date | null;
  appointmentCancelledAt: Date | null;
  seatKey: string | null; seatEnabled: boolean | null; seatPolicyVersion: bigint | null;
  sourceActorId: string | null; sourceTargetId: string | null;
  appointmentActorId: string | null; appointmentTargetId: string | null;
  disposition: string | null; revisionFrom: Date | null; revisionUntil: Date | null;
};

const covers = (from: Date | null, until: Date | null, at: number): boolean =>
  from instanceof Date && Number.isFinite(from.getTime()) &&
  from.getTime() <= at && (until === null ||
    (until instanceof Date && Number.isFinite(until.getTime()) && until.getTime() > at));

function unverified(
  reason: SensitiveAuthorityReason,
  actorSeatEvidence: SensitiveAuthorityResult['actorSeatEvidence'] = 'UNVERIFIED',
  sourceEvidence: SensitiveAuthorityResult['sourceEvidence'] = 'UNVERIFIED',
): SensitiveAuthorityResult {
  return {
    mode: 'READ_ONLY', verdict: 'UNVERIFIED', reason,
    canConfirm: false, provenanceVerified: false, writerEnabled: false,
    actorSeatEvidence, sourceEvidence,
  };
}

const candidate = (sourceEvidence: SensitiveAuthorityResult['sourceEvidence']): SensitiveAuthorityResult => ({
  mode: 'READ_ONLY', verdict: 'SOURCE_CANDIDATE', reason: 'CANDIDATE_ONLY',
  canConfirm: false, provenanceVerified: false, writerEnabled: false,
  actorSeatEvidence: 'READ_ONLY_CURRENT', sourceEvidence,
});

export class SensitiveAuthorityRepositoryPreflight {
  constructor(private readonly prisma: PrismaClient) {}

  async inspect(input: SensitiveAuthorityRequest): Promise<SensitiveAuthorityResult> {
    if (!uuid.test(input.actorUserId || '') || !uuid.test(input.targetUserId || '') ||
        input.actorUserId === input.targetUserId ||
        input.scopeType !== 'SCHOOL_WIDE' || input.scopeResourceId !== null ||
        !SENSITIVE_CAPABILITY_KEYS.some((key) => key === input.capabilityKey)) {
      return unverified('INVALID_REQUEST');
    }
    if (input.command === 'GENERIC_GRANT' || input.command === 'GENERIC_REVOKE') {
      return unverified('GENERIC_WRITER_BLOCKED');
    }
    if (input.command !== 'APPOINT_SOURCE' && input.command !== 'REMOVE_SOURCE') {
      return unverified('UNSUPPORTED_COMMAND');
    }
    if (AI.has(input.capabilityKey)) return unverified('AI_PHASE_11_NOT_ACTIVE');
    const role = sourceRole[input.capabilityKey];
    if (!role) return unverified('INVALID_REQUEST');
    if (input.command === 'REMOVE_SOURCE' && !uuid.test(input.exactSourceId || '')) {
      return unverified('SOURCE_NOT_FOUND_OR_UNTRUSTED');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        // PostgreSQL enforces read-only before ANY SELECT in this transaction.
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        await tx.$executeRaw`SET LOCAL statement_timeout = '4000ms'`;
        const clock = await tx.$queryRaw<Array<{ at: Date }>>`
          SELECT transaction_timestamp() AS "at"
        `;
        if (clock.length !== 1 || !(clock[0].at instanceof Date) ||
            !Number.isFinite(clock[0].at.getTime())) {
          return unverified('DATABASE_EVIDENCE_UNAVAILABLE');
        }
        const at = clock[0].at.getTime();
        const users = await tx.$queryRaw<UserRow[]>`
          SELECT id, status::text AS status, must_change_password AS "mustChangePassword"
          FROM users
          WHERE id IN (${input.actorUserId}::uuid, ${input.targetUserId}::uuid)
          ORDER BY id LIMIT ${SENSITIVE_AUTHORITY_LIMITS.users}
        `;
        if (users.length !== 2 ||
            users.some((u) => u.id !== input.actorUserId && u.id !== input.targetUserId) ||
            users.find((u) => u.id === input.actorUserId)?.status !== 'ACTIVE' ||
            users.find((u) => u.id === input.actorUserId)?.mustChangePassword !== false ||
            (input.command === 'APPOINT_SOURCE' &&
              !['ACTIVE', 'PENDING'].includes(users.find((u) => u.id === input.targetUserId)?.status ?? '')) ||
            !users.some((u) => u.id === input.targetUserId)) {
          return unverified('INACTIVE_OR_UNKNOWN_USER');
        }

        // Current technical capabilities are only a NECESSARY check, never proof
        // of issuer authorization for professional grants.
        const grants = await tx.$queryRaw<GrantRow[]>`
          SELECT capability_key AS "capabilityKey"
          FROM capability_grants
          WHERE user_id = ${input.actorUserId}::uuid
            AND capability_key IN ('USER_MANAGE', 'CAPABILITY_GRANT')
            AND scope_type = 'SCHOOL_WIDE' AND scope_resource_id IS NULL
            AND revoked_at IS NULL
            AND valid_from <= ${clock[0].at}
            AND (valid_until IS NULL OR valid_until > ${clock[0].at})
          ORDER BY capability_key, id LIMIT ${SENSITIVE_AUTHORITY_LIMITS.activeActorGrants}
        `;
        if (grants.length >= SENSITIVE_AUTHORITY_LIMITS.activeActorGrants ||
            !['USER_MANAGE', 'CAPABILITY_GRANT'].every((key) =>
              grants.some((grant) => grant.capabilityKey === key))) {
          return unverified('NO_TECHNICAL_CAPABILITIES');
        }

        // Never infer actor's technical seat from a job title or request body.
        const seats = await tx.$queryRaw<ActorSeatRow[]>`
          SELECT a.id, a.user_id AS "userId", a.template_key AS "templateKey",
                 s.key AS "seatKey", a.valid_from AS "validFrom",
                 a.valid_until AS "validUntil", a.cancelled_at AS "cancelledAt",
                 s.enabled, s.policy_version AS "policyVersion",
                 c.actor_user_id AS "originalActorId",
                 c.target_user_id AS "originalTargetId"
          FROM role_appointments a
          JOIN authority_seats s ON s.id = a.seat_id
          JOIN access_commands c ON c.id = a.created_command_id
          WHERE a.user_id = ${input.actorUserId}::uuid
            AND a.template_key = 'TECHNICAL_ACCOUNT_ADMIN'
            AND a.cancelled_at IS NULL
            AND a.valid_from <= ${clock[0].at}
            AND (a.valid_until IS NULL OR a.valid_until > ${clock[0].at})
          ORDER BY a.id LIMIT ${SENSITIVE_AUTHORITY_LIMITS.actorAppointments}
        `;
        if (seats.length !== 1 || seats[0].userId !== input.actorUserId ||
            seats[0].templateKey !== 'TECHNICAL_ACCOUNT_ADMIN' ||
            seats[0].seatKey !== 'TECHNICAL_ACCOUNT_ADMIN' ||
            seats[0].enabled !== true ||
            typeof seats[0].policyVersion !== 'bigint' || seats[0].policyVersion < 1n ||
            seats[0].originalTargetId !== input.actorUserId ||
            seats[0].originalActorId === input.actorUserId ||
            !uuid.test(seats[0].originalActorId) ||
            !covers(seats[0].validFrom, seats[0].validUntil, at) ||
            seats[0].cancelledAt !== null) {
          return unverified('NO_UNAMBIGUOUS_ACTOR_SEAT');
        }

        let sourceEvidence: SensitiveAuthorityResult['sourceEvidence'] = 'NOT_APPLICABLE';
        if (input.command === 'REMOVE_SOURCE') {
          // Explicit source AND server-owned coordinate/appointment/command/revision.
          const rows = await tx.$queryRaw<SourceRow[]>`
            SELECT src.id, src.user_id AS "userId",
                   ac.user_id AS "coordinateUserId",
                   ac.capability_key AS "capabilityKey",
                   ac.scope_type AS "scopeType",
                   ac.scope_resource_id AS "scopeResourceId",
                   src.kind, src.legacy_grant_id AS "legacyGrantId",
                   src.appointment_id AS "appointmentId",
                   a.user_id AS "appointmentUserId",
                   a.template_key AS "appointmentTemplateKey",
                   a.valid_from AS "appointmentValidFrom",
                   a.valid_until AS "appointmentValidUntil",
                   a.cancelled_at AS "appointmentCancelledAt",
                   s.key AS "seatKey", s.enabled AS "seatEnabled",
                   s.policy_version AS "seatPolicyVersion",
                   src_cmd.actor_user_id AS "sourceActorId",
                   src_cmd.target_user_id AS "sourceTargetId",
                   app_cmd.actor_user_id AS "appointmentActorId",
                   app_cmd.target_user_id AS "appointmentTargetId",
                   last_rev.disposition,
                   last_rev.valid_from AS "revisionFrom",
                   last_rev.valid_until AS "revisionUntil"
            FROM grant_sources src
            JOIN access_coordinates ac ON ac.id = src.coordinate_id
            LEFT JOIN role_appointments a ON a.id = src.appointment_id
            LEFT JOIN authority_seats s ON s.id = a.seat_id
            LEFT JOIN access_commands src_cmd ON src_cmd.id = src.created_command_id
            LEFT JOIN access_commands app_cmd ON app_cmd.id = a.created_command_id
            LEFT JOIN LATERAL (
              SELECT disposition, valid_from, valid_until
              FROM grant_source_revisions
              WHERE source_id = src.id
              ORDER BY revision DESC LIMIT 1
            ) last_rev ON TRUE
            WHERE src.id = ${input.exactSourceId}::uuid
            LIMIT ${SENSITIVE_AUTHORITY_LIMITS.sourceRows}
          `;
          const row = rows[0];
          if (rows.length !== 1 || !row || row.id !== input.exactSourceId ||
              row.userId !== input.targetUserId ||
              row.coordinateUserId !== input.targetUserId ||
              row.capabilityKey !== input.capabilityKey ||
              row.scopeType !== input.scopeType || row.scopeResourceId !== null ||
              row.kind !== 'ROLE_TEMPLATE' || row.legacyGrantId !== null ||
              !row.appointmentId || row.appointmentUserId !== input.targetUserId ||
              row.appointmentTemplateKey !== role || row.seatKey !== role ||
              row.seatEnabled !== true ||
              typeof row.seatPolicyVersion !== 'bigint' || row.seatPolicyVersion < 1n ||
              row.appointmentCancelledAt !== null ||
              !covers(row.appointmentValidFrom, row.appointmentValidUntil, at) ||
              row.sourceTargetId !== input.targetUserId ||
              row.appointmentTargetId !== input.targetUserId ||
              row.sourceActorId === input.targetUserId ||
              row.appointmentActorId === input.targetUserId ||
              !uuid.test(row.sourceActorId || '') || !uuid.test(row.appointmentActorId || '') ||
              row.disposition !== 'ACCEPTED' ||
              !covers(row.revisionFrom, row.revisionUntil, at)) {
            return unverified('SOURCE_NOT_FOUND_OR_UNTRUSTED', 'READ_ONLY_CURRENT');
          }
          sourceEvidence = 'CURRENT_SOURCE_MATCH';
        }

        const proposal: SensitivePolicyCandidateInput = {
          actorUserId: input.actorUserId,
          targetUserId: input.targetUserId,
          actorResponsibility: seats[0].templateKey,
          targetResponsibility: role, // desired role, NOT current office-holder proof
          sourceResponsibility: role,
          sourceKind: 'ROLE_TEMPLATE', // expected source kind, not granted evidence
          capabilityKey: input.capabilityKey,
          scopeType: input.scopeType,
          scopeResourceId: input.scopeResourceId,
          command: input.command,
          ...(input.exactSourceId ? { exactSourceId: input.exactSourceId } : {}),
        };
        const policy = inspectSensitiveCapabilityPolicy(proposal);
        if (policy.verdict !== 'CANDIDATE_ONLY' || policy.canConfirm !== false ||
            policy.provenanceVerified !== false || policy.writerEnabled !== false) {
          return unverified('POLICY_BLOCKED', 'READ_ONLY_CURRENT', sourceEvidence);
        }
        return candidate(sourceEvidence);
      }, {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        maxWait: SENSITIVE_AUTHORITY_LIMITS.maxWait,
        timeout: SENSITIVE_AUTHORITY_LIMITS.timeout,
      });
    } catch {
      // No database error, timeout, or missing B1 table can imply authority.
      return unverified('DATABASE_EVIDENCE_UNAVAILABLE');
    }
  }
}
