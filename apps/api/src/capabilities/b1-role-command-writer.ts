/**
 * P5-057 / WS1 — STAGED B1 transactional role writer.
 *
 * Deliberately NOT an Injectable, Controller, module provider, CLI job or route.
 * No production caller. This is a source-aware command implementation using
 * existing B1 Prisma models, not a separate grant evaluator.
 *
 * Activation requires legacy inventory/reconciliation, full PG16/17 simulation,
 * direct-API bypass closure, 7-persona UAT and separate PO-approved cutover.
 */
import { createHash, randomUUID } from 'node:crypto';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { AuditResult, Prisma, PrismaClient, UserStatus } from '@prisma/client';

export type B1Role = 'PRINCIPAL' | 'VICE_PRINCIPAL_ACADEMIC';
export type B1RoleOperation = 'APPOINT' | 'DISMISS' | 'TRANSFER';
export interface B1RoleCommandInput {
  operation: B1RoleOperation;
  role: B1Role;
  targetUserId: string; // NEW holder on TRANSFER; current holder on DISMISS
  previousUserId?: string; // mandatory only on TRANSFER
  expectedAppointmentId?: string; // mandatory on DISMISS/TRANSFER
  expectedSeatVersion: string; // authority policy version
  expectedAuthorizationEpoch: string; // compare actual B1 mutation epoch
  requestKey: string; // client idempotency token; never an authority signal
}
export interface B1TrustedActor {
  userId: string; // MUST be supplied by verified session, never request body
  requestId?: string;
}
export interface B1RoleReceipt {
  state: 'APPLIED';
  commandId: string;
  role: B1Role;
  operation: B1RoleOperation;
  targetUserId: string;
  previousUserId: string | null;
  appointmentId: string | null;
  effectiveAt: string;
  sourcesOpened: number;
  sourcesClosed: number;
  grantsCreated: number;
  grantsRevoked: number;
}

const supportedSeatsForKey: Readonly<Record<string, readonly string[]>> = Object.freeze({
  APPROVAL_PRINCIPAL: Object.freeze(['PRINCIPAL']),
  AUDIT_VIEW: Object.freeze(['PRINCIPAL', 'TECHNICAL_ACCOUNT_ADMIN']),
  APPROVAL_VICE_PRINCIPAL: Object.freeze(['VICE_PRINCIPAL_ACADEMIC']),
  ADDITIONAL_DUTY_CATALOG_MANAGE: Object.freeze(['VICE_PRINCIPAL_ACADEMIC', 'TECHNICAL_ACCOUNT_ADMIN']),
});
const roles: Readonly<Record<B1Role, readonly string[]>> = Object.freeze({
  PRINCIPAL: Object.freeze(['APPROVAL_PRINCIPAL', 'AUDIT_VIEW']),
  VICE_PRINCIPAL_ACADEMIC: Object.freeze([
    'APPROVAL_VICE_PRINCIPAL', 'ADDITIONAL_DUTY_CATALOG_MANAGE',
  ]),
});
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const token = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
function error(reason: string): never { throw new ConflictException(reason); }
const current = (from: Date, until: Date | null, at: Date): boolean =>
  from instanceof Date && Number.isFinite(from.getTime()) && from <= at &&
  (until === null || until instanceof Date && Number.isFinite(until.getTime()) && at < until);

type Tx = Prisma.TransactionClient;
type SourceRev = { sourceId: string; revisionId: string; validFrom: Date; validUntil: Date | null };
type Summary = {
  sourcesOpened: number; sourcesClosed: number; grantsCreated: number; grantsRevoked: number;
};

function fingerprint(input: B1RoleCommandInput, actorUserId: string): string {
  const normalized = [
    actorUserId, input.operation, input.role, input.targetUserId,
    input.previousUserId ?? null, input.expectedAppointmentId ?? null,
    input.expectedSeatVersion, input.expectedAuthorizationEpoch,
  ];
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}
function validate(input: B1RoleCommandInput, actor: B1TrustedActor): void {
  if (!uuid.test(actor.userId || '') || !uuid.test(input.targetUserId || '') ||
      actor.userId === input.targetUserId || !token.test(input.requestKey || '') ||
      !Object.prototype.hasOwnProperty.call(roles, input.role) ||
      !['APPOINT', 'DISMISS', 'TRANSFER'].includes(input.operation) ||
      !/^[1-9][0-9]{0,17}$/.test(input.expectedSeatVersion) ||
      !/^(0|[1-9][0-9]{0,18})$/.test(input.expectedAuthorizationEpoch)) {
    throw new ForbiddenException('Yêu cầu chức trách không hợp lệ hoặc tự thay đổi quyền.');
  }
  if (input.operation === 'APPOINT' &&
      (input.previousUserId !== undefined || input.expectedAppointmentId !== undefined)) {
    throw new ForbiddenException('Bổ nhiệm mới không sử dụng nguồn cũ.');
  }
  if (input.operation === 'DISMISS' && (input.previousUserId !== undefined ||
      !uuid.test(input.expectedAppointmentId ?? ''))) {
    throw new ForbiddenException('Miễn nhiệm cần chỉ rõ bản ghi bổ nhiệm.');
  }
  if (input.operation === 'TRANSFER' && (!uuid.test(input.previousUserId ?? '') ||
      !uuid.test(input.expectedAppointmentId ?? '') ||
      input.previousUserId === actor.userId || input.previousUserId === input.targetUserId)) {
    throw new ForbiddenException('Chuyển giao phải chỉ rõ người cũ và bản ghi bổ nhiệm.');
  }
}
function initSummary(): Summary {
  return { sourcesOpened: 0, sourcesClosed: 0, grantsCreated: 0, grantsRevoked: 0 };
}

/** A real mutating class, intentionally unreachable from the running app. */
export class B1RoleCommandWriter {
  constructor(private readonly prisma: PrismaClient) {}

  async execute(input: B1RoleCommandInput, actor: B1TrustedActor): Promise<B1RoleReceipt> {
    validate(input, actor);
    const digest = fingerprint(input, actor.userId);
    const commandType = `B1_${input.operation}_ROLE`;
    const oldUserId = input.operation === 'TRANSFER' ? input.previousUserId! :
      input.operation === 'DISMISS' ? input.targetUserId : null;

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL statement_timeout = '5000ms'`;
      // Seat -> sorted users -> sorted coordinates is the common lock order.
      const lockedSeats = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM authority_seats WHERE key = ${input.role} FOR UPDATE
      `;
      if (lockedSeats.length !== 1) error('AUTHORITY_SEAT_NOT_INITIALIZED');
      const seat = await tx.authoritySeat.findUnique({ where: { key: input.role } });

      const people = [...new Set([actor.userId, input.targetUserId, ...(oldUserId ? [oldUserId] : [])])].sort();
      await tx.$queryRaw`
        SELECT id FROM users WHERE id IN (${Prisma.join(people.map((id) => Prisma.sql`${id}::uuid`))})
        ORDER BY id FOR UPDATE
      `;
      const dbUsers = await tx.user.findMany({ where: { id: { in: people } }, select: {
        id: true, status: true, mustChangePassword: true,
        profile: { select: { isTeachingStaff: true } },
      } });
      if (dbUsers.length !== people.length) error('USER_MISSING');
      const userStatus = new Map(dbUsers.map((u) => [u.id, u]));
      const actorRow = userStatus.get(actor.userId)!;
      if (actorRow.status !== UserStatus.ACTIVE || actorRow.mustChangePassword) {
        throw new ForbiddenException('Admin chưa đủ điều kiện xác nhận.');
      }
      if (input.operation !== 'DISMISS') {
        const candidate = userStatus.get(input.targetUserId)!;
        if (candidate.status !== UserStatus.ACTIVE && candidate.status !== UserStatus.PENDING) {
          error('TARGET_NOT_APPOINTABLE');
        }
        if (candidate.profile?.isTeachingStaff !== true) {
          error('TARGET_NOT_TEACHING_STAFF');
        }
      }

      const clock = await tx.$queryRaw<Array<{ at: Date }>>`SELECT transaction_timestamp() AS "at"`;
      if (clock.length !== 1 || !(clock[0].at instanceof Date)) error('CLOCK_UNAVAILABLE');
      const at = clock[0].at;

      // Initial bootstrap technical grants are necessary but insufficient.
      // Only a *verified active B1 technical seat* may issue this command.
      const actorSeats = await tx.roleAppointment.findMany({
        where: {
          userId: actor.userId, templateKey: 'TECHNICAL_ACCOUNT_ADMIN',
          cancelledAt: null, validFrom: { lte: at },
          OR: [{ validUntil: null }, { validUntil: { gt: at } }],
        },
        include: { seat: true, command: true },
        take: 3,
      });
      if (actorSeats.length !== 1 || actorSeats[0].seat?.enabled !== true ||
          actorSeats[0].seat.key !== 'TECHNICAL_ACCOUNT_ADMIN' ||
          actorSeats[0].seat.policyVersion < 1n ||
          actorSeats[0].command.targetUserId !== actor.userId ||
          actorSeats[0].command.actorUserId === actor.userId) {
        throw new ForbiddenException('Không có nguồn chức trách Admin hợp lệ.');
      }
      const technicalGrants = await tx.capabilityGrant.findMany({
        where: {
          userId: actor.userId, revokedAt: null,
          capabilityKey: { in: ['USER_MANAGE', 'CAPABILITY_GRANT'] },
          scopeType: 'SCHOOL_WIDE', scopeResourceId: null,
          validFrom: { lte: at },
          OR: [{ validUntil: null }, { validUntil: { gt: at } }],
        },
        select: { capabilityKey: true },
        take: 16,
      });
      if (technicalGrants.length >= 16 ||
          !['USER_MANAGE', 'CAPABILITY_GRANT'].every((key) =>
            technicalGrants.some((g) => g.capabilityKey === key))) {
        throw new ForbiddenException('Thiếu quyền kỹ thuật hợp lệ.');
      }

      const existingCommand = await tx.accessCommand.findUnique({
        where: { actorUserId_commandType_requestKey: {
          actorUserId: actor.userId, commandType, requestKey: input.requestKey,
        } },
      });
      if (existingCommand) {
        if (existingCommand.fingerprint !== digest || existingCommand.targetUserId !== input.targetUserId) {
          error('IDEMPOTENCY_KEY_CONFLICT');
        }
        const persisted = existingCommand.result as unknown as B1RoleReceipt;
        if (!persisted || persisted.state !== 'APPLIED' || persisted.commandId !== existingCommand.id) {
          error('IDEMPOTENCY_RECEIPT_INVALID');
        }
        return persisted;
      }

      if (!seat || !seat.enabled || seat.policyVersion.toString() !== input.expectedSeatVersion) {
        error('STALE_OR_DISABLED_AUTHORITY_SEAT');
      }
      const currentState = await tx.authorizationState.findUnique({
        where: { id: 'B1_GLOBAL' }, select: { epoch: true },
      });
      if ((currentState?.epoch ?? 0n).toString() !== input.expectedAuthorizationEpoch) {
        error('STALE_AUTHORIZATION_EPOCH');
      }
      const roleAppointments = await tx.roleAppointment.findMany({
        where: {
          seatId: seat.id, templateKey: input.role,
          cancelledAt: null, validFrom: { lte: at },
          OR: [{ validUntil: null }, { validUntil: { gt: at } }],
        },
        orderBy: { userId: 'asc' }, take: 32,
      });
      if (roleAppointments.length >= 32) error('SEAT_INVENTORY_UNBOUNDED');
      const oldAppointment = oldUserId
        ? roleAppointments.find((a) => a.userId === oldUserId && a.id === input.expectedAppointmentId)
        : null;
      if (oldUserId && !oldAppointment) error('APPOINTMENT_NOT_CURRENT_OR_STALE');
      if (input.operation !== 'DISMISS' &&
          roleAppointments.some((a) => a.userId === input.targetUserId)) {
        error('TARGET_ALREADY_APPOINTED');
      }
      if (input.role === 'PRINCIPAL' &&
          ((input.operation === 'APPOINT' && roleAppointments.length !== 0) ||
            (input.operation === 'TRANSFER' && roleAppointments.length !== 1))) {
        error('PRINCIPAL_SEAT_OCCUPANCY_CONFLICT');
      }

      // AccessCommand is append-only: plan an immutable successful receipt first.
      // Any later failure rolls back the command and every other write together.
      const planned = await this.planSummary(tx, input.role, input.operation,
        input.targetUserId, oldAppointment?.id ?? null, oldUserId, at);
      const commandId = randomUUID();
      const appointmentIdPlanned = input.operation === 'DISMISS' ? null : randomUUID();
      const receipt: B1RoleReceipt = {
        state: 'APPLIED', commandId, role: input.role, operation: input.operation,
        targetUserId: input.targetUserId, previousUserId: oldUserId,
        appointmentId: appointmentIdPlanned, effectiveAt: at.toISOString(), ...planned,
      };
      const command = await tx.accessCommand.create({
        data: {
          id: commandId,
          actorUserId: actor.userId,
          targetUserId: input.targetUserId,
          ...(oldUserId ? { peerUserId: oldUserId } : {}),
          commandType, requestKey: input.requestKey, fingerprint: digest,
          effectiveAt: at, result: receipt as unknown as Prisma.InputJsonValue,
        },
      });
      const summary = initSummary();
      if (oldAppointment) await this.closeAppointment(tx, oldAppointment.id, oldUserId!, input.role, at, command.id, summary);

      let appointmentId: string | null = null;
      if (input.operation !== 'DISMISS') {
        const appointment = await tx.roleAppointment.create({
          data: {
            id: appointmentIdPlanned!,
            userId: input.targetUserId, seatId: seat.id,
            templateKey: input.role, templateVersion: 'WS1-B1-v1',
            templateSnapshot: { key: input.role, version: 'WS1-B1-v1', capabilityKeys: [...roles[input.role]], sensitiveOnly: true },
            validFrom: at, validUntil: null, createdCommandId: command.id,
          },
        });
        appointmentId = appointment.id;
        for (const key of roles[input.role]) {
          await this.openSource(tx, input.targetUserId, key, appointmentId, at, command.id, summary);
        }
      }
      await tx.authorizationState.upsert({
        where: { id: 'B1_GLOBAL' },
        create: { id: 'B1_GLOBAL', epoch: 1n, lastMutationAt: at },
        update: { epoch: { increment: 1n }, lastMutationAt: at },
      });
      if (appointmentId !== receipt.appointmentId ||
          (Object.keys(summary) as Array<keyof Summary>).some((key) => summary[key] !== planned[key])) {
        error('B1_PLAN_ACTUAL_RESULT_MISMATCH');
      }
      await tx.auditEvent.create({ data: {
        actorUserId: actor.userId,
        action: `B1_ROLE_${input.operation}`,
        entityType: 'AccessCommand', entityId: command.id,
        requestId: actor.requestId?.slice(0, 100),
        result: AuditResult.SUCCESS,
        metadata: {
          role: input.role, operation: input.operation, targetUserId: input.targetUserId,
          ...(oldUserId ? { previousUserId: oldUserId } : {}), appointmentId,
          sourcesOpened: summary.sourcesOpened, sourcesClosed: summary.sourcesClosed,
          grantsCreated: summary.grantsCreated, grantsRevoked: summary.grantsRevoked,
        },
      } });
      return receipt;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 2000, timeout: 12000 });
  }

  /**
   * Check issuer authority at the original B1 source creation timestamp.
   * Bootstrap/legacy lacking retained evidence cannot be inferred as valid.
   */
  private async wasTechnicalIssuer(tx: Tx, issuerId: string, at: Date): Promise<boolean> {
    const seats = await tx.roleAppointment.findMany({
      where: {
        userId: issuerId, templateKey: 'TECHNICAL_ACCOUNT_ADMIN',
        cancelledAt: null, validFrom: { lte: at },
        OR: [{ validUntil: null }, { validUntil: { gt: at } }],
      },
      include: { seat: true, command: true }, take: 3,
    });
    if (seats.length !== 1 || seats[0].seat?.key !== 'TECHNICAL_ACCOUNT_ADMIN' ||
        seats[0].command.targetUserId !== issuerId ||
        seats[0].command.actorUserId === issuerId) return false;
    const techGrants = await tx.capabilityGrant.findMany({
      where: {
        userId: issuerId, capabilityKey: { in: ['USER_MANAGE', 'CAPABILITY_GRANT'] },
        scopeType: 'SCHOOL_WIDE', scopeResourceId: null,
        validFrom: { lte: at },
        AND: [
          { OR: [{ validUntil: null }, { validUntil: { gt: at } }] },
          { OR: [{ revokedAt: null }, { revokedAt: { gt: at } }] },
        ],
      },
      select: { capabilityKey: true }, take: 16,
    });
    return techGrants.length < 16 &&
      ['USER_MANAGE', 'CAPABILITY_GRANT'].every((key) =>
        techGrants.some((g) => g.capabilityKey === key));
  }

  /**
   * Calculate and freeze the command receipt before its append-only INSERT.
   * Serialisable locks + actual summary check prevent a false persisted receipt.
   */
  private async planSummary(tx: Tx, role: B1Role, operation: B1RoleOperation,
    targetId: string, oldAppointmentId: string | null,
    oldUserId: string | null, at: Date): Promise<Summary> {
    const planned = initSummary();
    if (oldUserId && oldAppointmentId) {
      const sources = await tx.grantSource.findMany({
        where: { appointmentId: oldAppointmentId }, take: roles[role].length + 1,
      });
      if (sources.length !== roles[role].length) error('SOURCE_INVENTORY_NEEDS_RECONCILIATION');
      for (const key of roles[role]) {
        const before = await this.coordinate(tx, oldUserId, key, at);
        const source = sources.find((s) => s.coordinateId === before.coordinateId &&
          s.userId === oldUserId && s.kind === 'ROLE_TEMPLATE');
        if (!source || !before.active.some((s) => s.sourceId === source.id)) {
          error('SOURCE_NOT_CURRENT_FOR_APPOINTMENT');
        }
        planned.sourcesClosed++;
        if (before.active.length === 1) planned.grantsRevoked++;
      }
    }
    if (operation !== 'DISMISS') {
      for (const key of roles[role]) {
        const before = await this.coordinate(tx, targetId, key, at);
        planned.sourcesOpened++;
        if (!before.grantId) planned.grantsCreated++;
      }
    }
    return planned;
  }

  /** Only current, linked, fully B1-supported grants may be changed. */
  private async coordinate(tx: Tx, userId: string, key: string, at: Date): Promise<{
    coordinateId: string; version: bigint; grantId: string | null; active: SourceRev[];
  }> {
    const coordinates = await tx.accessCoordinate.findMany({
      where: { userId, capabilityKey: key, scopeType: 'SCHOOL_WIDE', scopeResourceId: null }, take: 3,
    });
    if (coordinates.length > 1) error('DUPLICATE_COORDINATES_NEEDS_RECONCILIATION');
    const grants = await tx.capabilityGrant.findMany({
      where: {
        userId, capabilityKey: key, scopeType: 'SCHOOL_WIDE', scopeResourceId: null,
        revokedAt: null, OR: [{ validUntil: null }, { validUntil: { gt: at } }],
      },
      take: 4,
    });
    if (grants.length > 1) error('OVERLAPPING_GRANTS_NEEDS_RECONCILIATION');
    if (grants.length === 1 && grants[0].validFrom > at) error('FUTURE_GRANT_NEEDS_RECONCILIATION');
    let coordinate = coordinates[0];
    if (grants.some((g) => !coordinate || g.coordinateId !== coordinate.id)) {
      error('LEGACY_OR_FOREIGN_GRANT_NEEDS_RECONCILIATION');
    }
    if (!coordinate) {
      coordinate = await tx.accessCoordinate.create({ data: {
        userId, capabilityKey: key, scopeType: 'SCHOOL_WIDE', scopeResourceId: null,
      } });
    }
    const sources = await tx.grantSource.findMany({
      where: { coordinateId: coordinate.id }, include: {
        revisions: { orderBy: { revision: 'desc' }, take: 2 },
        appointment: { include: { seat: true, command: true } }, command: true,
      }, take: 33,
    });
    if (sources.length >= 33) error('SOURCE_HISTORY_LIMIT_NEEDS_RECONCILIATION');
    const active: SourceRev[] = [];
    for (const s of sources) {
      if (s.userId !== userId || s.legacyGrantId !== null ||
          s.command.targetUserId !== userId || s.command.actorUserId === userId ||
          s.revisions.length === 0 ||
          (s.revisions[0].disposition === 'ACCEPTED' &&
            s.revisions[0].commandId !== s.createdCommandId)) {
        error('SOURCE_LINEAGE_NEEDS_RECONCILIATION');
      }
      if (s.kind === 'ROLE_TEMPLATE') {
        if (!s.appointment || !s.appointment.seat ||
            s.appointment.templateKey !== s.appointment.seat.key ||
            !supportedSeatsForKey[key]?.includes(s.appointment.templateKey) ||
            s.createdCommandId !== s.appointment.createdCommandId ||
            s.command.id !== s.appointment.command.id ||
            s.appointment.userId !== userId ||
            s.appointment.command.targetUserId !== userId ||
            s.appointment.command.actorUserId === userId) {
          error('ROLE_SOURCE_ISSUER_OR_SEAT_MISMATCH');
        }
        if (s.appointment.templateKey !== 'TECHNICAL_ACCOUNT_ADMIN' &&
            !await this.wasTechnicalIssuer(tx, s.command.actorUserId, s.command.effectiveAt)) {
          error('ROLE_SOURCE_ISSUER_NOT_PROVEN');
        }
      } else if (s.kind === 'TECHNICAL_DIRECT') {
        if (!['AUDIT_VIEW', 'ADDITIONAL_DUTY_CATALOG_MANAGE'].includes(key) ||
            s.appointment !== null ||
            s.command.commandType !== 'B1_TECHNICAL_DIRECT_GRANT' ||
            !await this.wasTechnicalIssuer(tx, s.command.actorUserId, s.command.effectiveAt)) {
          error('TECHNICAL_SOURCE_ISSUER_NOT_PROVEN');
        }
      } else {
        error('UNSUPPORTED_SOURCE_KIND_NEEDS_RECONCILIATION');
      }
      const last = s.revisions[0];
      const roleAppointment = s.kind === 'ROLE_TEMPLATE' ? s.appointment : null;
      const roleSourceActive = Boolean(roleAppointment &&
        roleAppointment.cancelledAt === null &&
        current(roleAppointment.validFrom, roleAppointment.validUntil, at) &&
        roleAppointment.seat?.enabled);
      const directSourceActive = s.kind === 'TECHNICAL_DIRECT';
      if (last.disposition === 'ACCEPTED' &&
          current(last.validFrom, last.validUntil, at) &&
          (roleSourceActive || directSourceActive)) {
        active.push({
          sourceId: s.id, revisionId: last.id,
          validFrom: last.validFrom, validUntil: last.validUntil,
        });
      } else if (last.disposition !== 'CANCELLED' && last.disposition !== 'ENDED' && last.disposition !== 'ACCEPTED') {
        error('UNKNOWN_SOURCE_DISPOSITION');
      }
    }
    const grant = grants[0] ?? null;
    const latest = await tx.grantProjectionRevision.findFirst({
      where: { coordinateId: coordinate.id }, orderBy: { version: 'desc' },
      include: { slices: { include: { supports: true } } },
    });
    if ((latest?.version ?? 0n) !== coordinate.version) error('STALE_PROJECTION_VERSION');
    if (grant) {
      if (active.length === 0 || !latest) error('GRANT_WITHOUT_PROVEN_SOURCE');
      const relevant = latest.slices.filter((slice) => slice.grantId === grant.id &&
        current(slice.validFromSnapshot, slice.validUntilSnapshot, at));
      if (relevant.length !== 1) error('MISSING_CURRENT_PROJECTION_SLICE');
      const ids = relevant[0].supports.filter((support) =>
        current(support.coveredFrom, support.coveredUntil, at)).map((support) => support.sourceRevisionId).sort();
      const expected = active.map((s) => s.revisionId).sort();
      if (ids.length !== expected.length || ids.some((id, index) => id !== expected[index])) {
        error('PROJECTION_SUPPORT_MISMATCH_NEEDS_RECONCILIATION');
      }
    } else if (active.length > 0) {
      error('ACTIVE_SOURCE_WITHOUT_GRANT');
    }
    return { coordinateId: coordinate.id, version: coordinate.version, grantId: grant?.id ?? null, active };
  }

  private async writeProjection(tx: Tx, coordinateId: string, version: bigint,
    grantId: string | null, sources: SourceRev[], at: Date, commandId: string): Promise<void> {
    const updated = await tx.accessCoordinate.updateMany({
      where: { id: coordinateId, version }, data: { version: { increment: 1n } },
    });
    if (updated.count !== 1) error('STALE_COORDINATE_CAS');
    const projection = await tx.grantProjectionRevision.create({
      data: { coordinateId, version: version + 1n, commandId, effectiveAt: at },
    });
    if (!grantId) {
      if (sources.length > 0) error('SOURCES_WITHOUT_GRANT');
      return;
    }
    if (sources.length === 0) error('GRANT_WITHOUT_SOURCES');
    const grant = await tx.capabilityGrant.findUnique({ where: { id: grantId } });
    if (!grant || grant.coordinateId !== coordinateId || grant.revokedAt !== null) error('GRANT_REVOKED_BEFORE_PROJECTION');
    const slice = await tx.grantProjectionSlice.create({ data: {
      projectionRevisionId: projection.id, coordinateId, grantId,
      validFromSnapshot: grant.validFrom, validUntilSnapshot: grant.validUntil,
    } });
    for (const source of sources) {
      await tx.grantSupport.create({ data: {
        sliceId: slice.id, coordinateId, sourceRevisionId: source.revisionId,
        coveredFrom: source.validFrom, coveredUntil: source.validUntil,
      } });
    }
  }

  private async openSource(tx: Tx, userId: string, key: string, appointmentId: string,
    at: Date, commandId: string, summary: Summary): Promise<void> {
    const context = await this.coordinate(tx, userId, key, at);
    const source = await tx.grantSource.create({ data: {
      coordinateId: context.coordinateId, userId, kind: 'ROLE_TEMPLATE',
      appointmentId, createdCommandId: commandId,
    } });
    const revision = await tx.grantSourceRevision.create({ data: {
      sourceId: source.id, coordinateId: context.coordinateId,
      revision: 1n, validFrom: at, validUntil: null,
      disposition: 'ACCEPTED', commandId,
    } });
    let grantId = context.grantId;
    if (!grantId) {
      const grant = await tx.capabilityGrant.create({ data: {
        userId, capabilityKey: key, scopeType: 'SCHOOL_WIDE', scopeResourceId: null,
        validFrom: at, validUntil: null, grantedByUserId: (await tx.accessCommand.findUniqueOrThrow({ where: { id: commandId } })).actorUserId,
        coordinateId: context.coordinateId,
      } });
      grantId = grant.id;
      summary.grantsCreated++;
    }
    await this.writeProjection(tx, context.coordinateId, context.version, grantId, [
      ...context.active, { sourceId: source.id, revisionId: revision.id, validFrom: at, validUntil: null },
    ], at, commandId);
    summary.sourcesOpened++;
  }

  private async closeAppointment(tx: Tx, appointmentId: string, userId: string, role: B1Role,
    at: Date, commandId: string, summary: Summary): Promise<void> {
    const appointment = await tx.roleAppointment.findUnique({ where: { id: appointmentId } });
    if (!appointment || appointment.userId !== userId || appointment.templateKey !== role ||
        appointment.cancelledAt !== null || !current(appointment.validFrom, appointment.validUntil, at) ||
        at <= appointment.validFrom) {
      error('INVALID_APPOINTMENT_TO_CLOSE');
    }
    const sources = await tx.grantSource.findMany({ where: { appointmentId }, orderBy: { id: 'asc' } });
    if (sources.length !== roles[role].length ||
        sources.some((source) => source.userId !== userId ||
          source.kind !== 'ROLE_TEMPLATE' || source.legacyGrantId !== null)) {
      error('INCOMPLETE_ROLE_SOURCES_NEEDS_RECONCILIATION');
    }
    // Prevalidate all coordinates before changing any source.
    const details = [];
    for (const key of roles[role]) {
      const coords = await tx.accessCoordinate.findMany({ where: {
        userId, capabilityKey: key, scopeType: 'SCHOOL_WIDE', scopeResourceId: null,
      }, take: 3 });
      if (coords.length !== 1) error('MISSING_ROLE_COORDINATE');
      const source = sources.find((s) => s.coordinateId === coords[0].id);
      if (!source) error('ROLE_SOURCE_COORDINATE_MISMATCH');
      const before = await this.coordinate(tx, userId, key, at);
      if (!before.active.some((s) => s.sourceId === source.id)) {
        error('ROLE_SOURCE_NOT_CURRENT');
      }
      details.push({ before, source });
    }
    const updated = await tx.roleAppointment.updateMany({
      where: { id: appointmentId, version: appointment.version, cancelledAt: null },
      data: { validUntil: at, version: { increment: 1n } },
    });
    if (updated.count !== 1) error('APPOINTMENT_CAS_CONFLICT');
    for (const { before, source } of details) {
      const existing = await tx.grantSourceRevision.findFirst({
        where: { sourceId: source.id }, orderBy: { revision: 'desc' },
      });
      if (!existing || existing.disposition !== 'ACCEPTED' ||
          !current(existing.validFrom, existing.validUntil, at) ||
          at <= existing.validFrom) error('SOURCE_REVISION_STALE');
      await tx.grantSourceRevision.create({ data: {
        sourceId: source.id, coordinateId: before.coordinateId,
        revision: existing.revision + 1n, validFrom: existing.validFrom,
        validUntil: at, disposition: 'ENDED', commandId,
      } });
      const remaining = before.active.filter((s) => s.sourceId !== source.id);
      let grantId = before.grantId;
      if (remaining.length === 0) {
        if (!grantId) error('ACTIVE_SOURCE_WITHOUT_GRANT');
        const result = await tx.capabilityGrant.updateMany({
          where: { id: grantId, coordinateId: before.coordinateId, revokedAt: null },
          data: { revokedAt: at, revokedByUserId: (await tx.accessCommand.findUniqueOrThrow({ where: { id: commandId } })).actorUserId },
        });
        if (result.count !== 1) error('GRANT_REVOKE_CAS_CONFLICT');
        grantId = null;
        summary.grantsRevoked++;
      }
      await this.writeProjection(tx, before.coordinateId, before.version, grantId, remaining, at, commandId);
      summary.sourcesClosed++;
    }
  }
}
