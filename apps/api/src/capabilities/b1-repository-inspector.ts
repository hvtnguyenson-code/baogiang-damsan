/**
 * WS1-B / B1: bounded, repeatable-read, PostgreSQL READ ONLY evidence snapshot.
 * This class is intentionally NOT registered in NestJS modules or exposed by an
 * HTTP route. It does not authorize or mutate a capability grant.
 *
 * A caller supplies only the server-validated grant ID. The database supplies
 * the grant's user, coordinate and transaction timestamp. No caller may claim
 * historiesComplete on its own.
 */
import { Prisma, PrismaClient } from '@prisma/client';
import {
  B1EvidenceInput, B1EvidenceResult, B1ProjectionEvidence,
  B1ProjectionSliceEvidence, B1SourceRevisionEvidence, inspectB1SourceEvidence,
} from './b1-source-evidence-inspector';

export const B1_SNAPSHOT_LIMITS = Object.freeze({
  sources: 32,
  sourceRevisions: 256,
  projections: 64,
  slices: 512,
  supports: 1024,
  maxWaitMs: 1500,
  transactionTimeoutMs: 6000,
  statementTimeoutMs: 4000,
});

type GrantRow = {
  id: string; userId: string; coordinateId: string | null;
  capabilityKey: string; scopeType: string; scopeResourceId: string | null;
  validFrom: Date; validUntil: Date | null; revokedAt: Date | null;
};
type CoordinateRow = {
  id: string; userId: string; capabilityKey: string;
  scopeType: string; scopeResourceId: string | null; version: bigint;
};
type SourceRow = {
  id: string; coordinateId: string; userId: string; kind: string;
  appointmentId: string | null; legacyGrantId: string | null;
  supersedesSourceId: string | null; createdCommandId: string;
  commandActorId: string | null; commandTargetId: string | null; commandType: string | null;
  appointmentUserId: string | null; appointmentCreatedCommandId: string | null;
  appointmentActorId: string | null; appointmentTargetId: string | null;
  appointmentSeatId: string | null; appointmentValidFrom: Date | null;
  appointmentValidUntil: Date | null; appointmentCancelledAt: Date | null;
  seatEnabled: boolean | null; seatPolicyVersion: bigint | null;
};
type RevisionRow = {
  id: string; sourceId: string; coordinateId: string; revision: bigint;
  validFrom: Date; validUntil: Date | null; disposition: string;
};
type ProjectionRow = {
  id: string; coordinateId: string; version: bigint;
};
type SliceRow = {
  id: string; projectionRevisionId: string; coordinateId: string;
  grantId: string; validFrom: Date; validUntil: Date | null;
};
type SupportRow = {
  sliceId: string; sourceRevisionId: string; coordinateId: string;
  coveredFrom: Date; coveredUntil: Date | null;
};

type UnverifiedReason = Exclude<B1EvidenceResult['reason'], 'CANDIDATE_ONLY'>;
const unverified = (reason: UnverifiedReason): B1EvidenceResult => ({
  verdict: 'UNVERIFIED',
  reason,
  canConfirm: false,
  provenanceVerified: false,
  supportingSourceCount: 0,
});

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sameNullable = (a: string | null, b: string | null) => a === b;
const within = <T>(rows: T[], limit: number): boolean =>
  Array.isArray(rows) && rows.length <= limit;
const unique = (values: string[]) => new Set(values).size === values.length;

// Read-only source-origin coherence, NOT an issuer/scope policy decision.
// Even a coherent source remains an advisory candidate: provenanceVerified=false.
const B1_SOURCE_KINDS = new Set([
  'ROLE_TEMPLATE', 'ACADEMIC_DIRECT', 'PROFESSIONAL_BASELINE',
  'TECHNICAL_DIRECT', 'LEGACY_UNCLASSIFIED',
]);
function coherentSourceOrigins(rows: SourceRow[], userId: string, coordinateId: string): boolean {
  const ids = new Set(rows.map((row) => row.id));
  if (!rows.every((row) => {
    if (!row.id || row.userId !== userId || row.coordinateId !== coordinateId ||
        !B1_SOURCE_KINDS.has(row.kind) || row.kind === 'LEGACY_UNCLASSIFIED' ||
        row.legacyGrantId !== null ||
        !row.createdCommandId || !row.commandActorId || !row.commandTargetId ||
        row.commandActorId === userId || row.commandTargetId !== userId ||
        !row.commandType?.trim() ||
        (row.supersedesSourceId !== null &&
          (row.supersedesSourceId === row.id || !ids.has(row.supersedesSourceId)))) {
      return false;
    }
    if (row.kind !== 'ROLE_TEMPLATE') return row.appointmentId === null;
    return !!row.appointmentId && row.appointmentUserId === userId &&
      !!row.appointmentCreatedCommandId && !!row.appointmentActorId &&
      row.appointmentActorId !== userId && row.appointmentTargetId === userId &&
      !!row.appointmentSeatId && row.seatEnabled === true &&
      typeof row.seatPolicyVersion === 'bigint' && row.seatPolicyVersion > 0n &&
      row.appointmentValidFrom instanceof Date &&
      Number.isFinite(row.appointmentValidFrom.getTime()) &&
      (row.appointmentValidUntil === null ||
        (row.appointmentValidUntil instanceof Date &&
          row.appointmentValidUntil.getTime() > row.appointmentValidFrom.getTime())) &&
      row.appointmentCancelledAt === null;
  })) return false;
  // A finite same-coordinate predecessor chain must not contain a cycle.
  const predecessor = new Map(rows.map((row) => [row.id, row.supersedesSourceId]));
  return rows.every((row) => {
    const visited = new Set<string>();
    let cursor: string | null = row.id;
    while (cursor !== null) {
      if (visited.has(cursor)) return false;
      visited.add(cursor);
      cursor = predecessor.get(cursor) ?? null;
    }
    return true;
  });
}

export class B1RepositoryInspector {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * A failure is an UNVERIFIED advisory result, not a grant authorisation.
   * No production DB query is performed until a trusted server caller invokes
   * this method. PostgreSQL controls READ ONLY even if a query is changed later.
   */
  async inspect(grantId: string): Promise<B1EvidenceResult> {
    if (!uuidRe.test(grantId)) return unverified('INVALID_EVIDENCE');

    try {
      return await this.prisma.$transaction(async (tx) => {
        // This must be the FIRST SQL statement in the transaction.
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        await tx.$executeRaw`SET LOCAL statement_timeout = '4000ms'`;

        const clock = await tx.$queryRaw<Array<{ at: Date }>>`
          SELECT transaction_timestamp() AS "at"
        `;
        if (clock.length !== 1 || !(clock[0].at instanceof Date) ||
            !Number.isFinite(clock[0].at.getTime())) return unverified('INVALID_EVIDENCE');

        const grants = await tx.$queryRaw<GrantRow[]>`
          SELECT id, user_id AS "userId", coordinate_id AS "coordinateId",
                 capability_key AS "capabilityKey", scope_type AS "scopeType",
                 scope_resource_id AS "scopeResourceId", valid_from AS "validFrom",
                 valid_until AS "validUntil", revoked_at AS "revokedAt"
          FROM capability_grants WHERE id = ${grantId}::uuid LIMIT 1
        `;
        if (grants.length !== 1 || grants[0].id !== grantId)
          return unverified('INVALID_EVIDENCE');
        const grant = grants[0];
        if (!grant.coordinateId) return unverified('MISSING_OR_LEGACY_COORDINATE');
        const coordinateId = grant.coordinateId;

        const coordinates = await tx.$queryRaw<CoordinateRow[]>`
          SELECT id, user_id AS "userId", capability_key AS "capabilityKey",
                 scope_type AS "scopeType", scope_resource_id AS "scopeResourceId",
                 version FROM access_coordinates WHERE id = ${coordinateId}::uuid LIMIT 1
        `;
        if (coordinates.length !== 1) return unverified('INVALID_EVIDENCE');
        const coordinate = coordinates[0];
        if (coordinate.id !== coordinateId || coordinate.userId !== grant.userId ||
            coordinate.capabilityKey !== grant.capabilityKey ||
            coordinate.scopeType !== grant.scopeType ||
            !sameNullable(coordinate.scopeResourceId, grant.scopeResourceId) ||
            typeof coordinate.version !== 'bigint' || coordinate.version < 0n)
          return unverified('INVALID_EVIDENCE');

        const sources = await tx.$queryRaw<SourceRow[]>`
          SELECT s.id, s.coordinate_id AS "coordinateId", s.user_id AS "userId",
                 s.kind, s.appointment_id AS "appointmentId",
                 s.legacy_grant_id AS "legacyGrantId",
                 s.supersedes_source_id AS "supersedesSourceId",
                 s.created_command_id AS "createdCommandId",
                 source_command.actor_user_id AS "commandActorId",
                 source_command.target_user_id AS "commandTargetId",
                 source_command.command_type AS "commandType",
                 appointment.user_id AS "appointmentUserId",
                 appointment.created_command_id AS "appointmentCreatedCommandId",
                 appointment_command.actor_user_id AS "appointmentActorId",
                 appointment_command.target_user_id AS "appointmentTargetId",
                 appointment.seat_id AS "appointmentSeatId",
                 appointment.valid_from AS "appointmentValidFrom",
                 appointment.valid_until AS "appointmentValidUntil",
                 appointment.cancelled_at AS "appointmentCancelledAt",
                 seat.enabled AS "seatEnabled", seat.policy_version AS "seatPolicyVersion"
          FROM grant_sources s
          LEFT JOIN access_commands source_command ON source_command.id = s.created_command_id
          LEFT JOIN role_appointments appointment ON appointment.id = s.appointment_id
          LEFT JOIN access_commands appointment_command
                 ON appointment_command.id = appointment.created_command_id
          LEFT JOIN authority_seats seat ON seat.id = appointment.seat_id
          WHERE s.coordinate_id = ${coordinateId}::uuid
          ORDER BY s.id LIMIT ${B1_SNAPSHOT_LIMITS.sources + 1}
        `;
        if (!within(sources, B1_SNAPSHOT_LIMITS.sources))
          return unverified('INCOMPLETE_HISTORY');
        if (!unique(sources.map((row) => row.id)) ||
            !coherentSourceOrigins(sources, grant.userId, coordinateId))
          return unverified('INVALID_EVIDENCE');
        const sourceIds = new Set(sources.map((row) => row.id));

        const revisions = await tx.$queryRaw<RevisionRow[]>`
          SELECT id, source_id AS "sourceId", coordinate_id AS "coordinateId",
                 revision, valid_from AS "validFrom",
                 valid_until AS "validUntil", disposition
          FROM grant_source_revisions WHERE coordinate_id = ${coordinateId}::uuid
          ORDER BY source_id, revision LIMIT ${B1_SNAPSHOT_LIMITS.sourceRevisions + 1}
        `;
        if (!within(revisions, B1_SNAPSHOT_LIMITS.sourceRevisions))
          return unverified('INCOMPLETE_HISTORY');
        if (!unique(revisions.map((row) => row.id)) ||
            revisions.some((row) => !sourceIds.has(row.sourceId) ||
              row.coordinateId !== coordinateId) ||
            sources.some((row) => !revisions.some((revision) => revision.sourceId === row.id)))
          return unverified('INVALID_EVIDENCE');

        const projections = await tx.$queryRaw<ProjectionRow[]>`
          SELECT id, coordinate_id AS "coordinateId", version
          FROM grant_projection_revisions WHERE coordinate_id = ${coordinateId}::uuid
          ORDER BY version LIMIT ${B1_SNAPSHOT_LIMITS.projections + 1}
        `;
        if (!within(projections, B1_SNAPSHOT_LIMITS.projections))
          return unverified('INCOMPLETE_HISTORY');
        if (!unique(projections.map((row) => row.id)) ||
            projections.some((row) => row.coordinateId !== coordinateId))
          return unverified('INVALID_EVIDENCE');
        // Coordinate CAS version and latest projection must refer to the SAME state.
        const latestVersion = projections.reduce(
          (max, row) => typeof row.version === 'bigint' && row.version > max
            ? row.version : max, -1n,
        );
        if (projections.length && latestVersion !== coordinate.version)
          return unverified('INVALID_EVIDENCE');

        const slices = await tx.$queryRaw<SliceRow[]>`
          SELECT id, projection_revision_id AS "projectionRevisionId",
                 coordinate_id AS "coordinateId", grant_id AS "grantId",
                 valid_from_snapshot AS "validFrom",
                 valid_until_snapshot AS "validUntil"
          FROM grant_projection_slices WHERE coordinate_id = ${coordinateId}::uuid
          ORDER BY projection_revision_id, id LIMIT ${B1_SNAPSHOT_LIMITS.slices + 1}
        `;
        if (!within(slices, B1_SNAPSHOT_LIMITS.slices))
          return unverified('INCOMPLETE_HISTORY');
        const projectionIds = new Set(projections.map((row) => row.id));
        if (!unique(slices.map((row) => row.id)) ||
            slices.some((row) => row.coordinateId !== coordinateId ||
              !projectionIds.has(row.projectionRevisionId)))
          return unverified('INVALID_EVIDENCE');
        const sliceIds = new Set(slices.map((row) => row.id));

        const supports = await tx.$queryRaw<SupportRow[]>`
          SELECT slice_id AS "sliceId", source_revision_id AS "sourceRevisionId",
                 coordinate_id AS "coordinateId", covered_from AS "coveredFrom",
                 covered_until AS "coveredUntil"
          FROM grant_supports WHERE coordinate_id = ${coordinateId}::uuid
          ORDER BY slice_id, source_revision_id LIMIT ${B1_SNAPSHOT_LIMITS.supports + 1}
        `;
        if (!within(supports, B1_SNAPSHOT_LIMITS.supports))
          return unverified('INCOMPLETE_HISTORY');
        const revisionIds = new Set(revisions.map((row) => row.id));
        if (supports.some((row) => row.coordinateId !== coordinateId ||
              !sliceIds.has(row.sliceId) || !revisionIds.has(row.sourceRevisionId)) ||
            !unique(supports.map((row) => row.sliceId + ':' + row.sourceRevisionId)))
          return unverified('INVALID_EVIDENCE');

        const supportBySlice = new Map<string, SupportRow[]>();
        for (const support of supports) {
          const set = supportBySlice.get(support.sliceId) ?? [];
          set.push(support);
          supportBySlice.set(support.sliceId, set);
        }
        const slicesByProjection = new Map<string, B1ProjectionSliceEvidence[]>();
        for (const slice of slices) {
          const set = slicesByProjection.get(slice.projectionRevisionId) ?? [];
          set.push({
            grantId: slice.grantId,
            coordinateId: slice.coordinateId,
            validFrom: slice.validFrom,
            validUntil: slice.validUntil,
            supports: (supportBySlice.get(slice.id) ?? []).map((row) => ({
              sourceRevisionId: row.sourceRevisionId,
              coordinateId: row.coordinateId,
              coveredFrom: row.coveredFrom,
              coveredUntil: row.coveredUntil,
            })),
          });
          slicesByProjection.set(slice.projectionRevisionId, set);
        }

        const snapshot: B1EvidenceInput = {
          userId: grant.userId,
          grantId: grant.id,
          coordinateId,
          at: clock[0].at,
          grantValidFrom: grant.validFrom,
          grantValidUntil: grant.validUntil,
          grantRevokedAt: grant.revokedAt,
          sourceRevisionHistory: revisions.map((row): B1SourceRevisionEvidence => ({
            ...row, userId: grant.userId,
          })),
          projectionHistory: projections.map((row): B1ProjectionEvidence => ({
            coordinateId: row.coordinateId,
            version: row.version,
            slices: slicesByProjection.get(row.id) ?? [],
          })),
          historiesComplete: true,
        };
        return inspectB1SourceEvidence(snapshot);
      }, {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        maxWait: B1_SNAPSHOT_LIMITS.maxWaitMs,
        timeout: B1_SNAPSHOT_LIMITS.transactionTimeoutMs,
      });
    } catch {
      // Database timeout, permission errors, and connection failure are never proof.
      return unverified('INCOMPLETE_HISTORY');
    }
  }
}
