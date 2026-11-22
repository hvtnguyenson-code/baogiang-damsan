import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { materializeB1RoleGrants } from './b1-approved-role-policy';
import { B1_STAGED_SOURCE_KEYS, b1FullRoleSourceKeys } from './b1-role-command-writer';
import {
  B1RoleCommandInput,
  B1RoleCommandWriter,
  B1RoleReceipt,
} from './b1-role-command-writer';

/**
 * The B1 transactional writer is staged behind independent hard-deny
 * activation checks. HTTP enablement is NOT authority: the writer still
 * verifies an actual technical Admin B1 seat and grants within SERIALIZABLE.
 *
 * No gate is enabled by default; no production env is modified here.
 */
@Injectable()
export class B1RoleCommandHttpService {
  private readonly writer: B1RoleCommandWriter;

  constructor(private readonly prisma: PrismaService) {
    this.writer = new B1RoleCommandWriter(prisma, true);
  }

  static activationBlockers(role: B1RoleCommandInput['role'], env: NodeJS.ProcessEnv = process.env): string[] {
    const required = [
      'B1_ROLE_COMMANDS_ENABLED',
      'B1_FULL_ROLE_SOURCE_CUTOVER_APPROVED',
      'B1_REJECT_GENERIC_SENSITIVE_WRITES',
      'B1_LEGACY_PROVENANCE_RECONCILED',
      role === 'PRINCIPAL' ? 'B1_PRINCIPAL_POLICY_APPROVED' : 'B1_PHT_CATALOG_POLICY_APPROVED',
      ...(role === 'PRINCIPAL' ? ['B1_AUDIT_SOURCE_POLICY_APPROVED'] : []),
    ];
    return required.filter((key) => env[key] !== 'true');
  }

  /** Advisory read only: cannot authorize a later write or promise consistency. */
  async context(role: B1RoleCommandInput['role'], actorUserId: string) {
    const now = new Date();
    const [seat, epoch, issuerSeats] = await Promise.all([
      this.prisma.authoritySeat.findUnique({ where: { key: role } }),
      this.prisma.authorizationState.findUnique({ where: { id: 'B1_GLOBAL' } }),
      this.prisma.roleAppointment.findMany({
        where: { userId: actorUserId, templateKey: 'TECHNICAL_ACCOUNT_ADMIN',
          cancelledAt: null, validFrom: { lte: now },
          OR: [{ validUntil: null }, { validUntil: { gt: now } }] },
        include: { seat: true, command: true }, take: 3,
      }),
    ]);
    const verifiedTechnicalSeat = issuerSeats.length === 1
      && issuerSeats[0].seat?.key === 'TECHNICAL_ACCOUNT_ADMIN'
      && issuerSeats[0].seat.enabled
      && issuerSeats[0].seat.policyVersion >= 1n
      && issuerSeats[0].command.targetUserId === actorUserId
      && issuerSeats[0].command.actorUserId !== actorUserId;
    const appointments = seat ? await this.prisma.roleAppointment.findMany({
      where: { seatId: seat.id, templateKey: role, cancelledAt: null,
        validFrom: { lte: now }, OR: [{ validUntil: null }, { validUntil: { gt: now } }] },
      select: { id: true, userId: true, validFrom: true,
        user: { select: { username: true, profile: { select: { displayName: true } } } } },
      orderBy: { userId: 'asc' }, take: 33,
    }) : [];
    const activationBlockers = B1RoleCommandHttpService.activationBlockers(role);
    const inventoryTruncated = appointments.length >= 32;
    // Submission readiness is a UI precheck only, never writer authorization.
    // All issuer, source, epoch and target conditions are revalidated in the command transaction.
    return { role, mode: 'READ_ONLY' as const, canConfirm: false as const,
      verifiedTechnicalSeat, activationBlockers,
      commandSubmissionReady: verifiedTechnicalSeat && activationBlockers.length === 0
        && seat?.enabled === true && seat.policyVersion >= 1n && !inventoryTruncated,
      seatEnabled: seat?.enabled ?? false,
      expectedSeatVersion: seat?.policyVersion.toString() ?? null,
      expectedAuthorizationEpoch: (epoch?.epoch ?? 0n).toString(),
      activeAppointments: appointments.map((item) => ({
        appointmentId: item.id, userId: item.userId, validFrom: item.validFrom.toISOString(),
        displayName: item.user.profile?.displayName ?? item.user.username,
        username: item.user.username,
      })),
      inventoryTruncated,
    };
  }

  /** Only compares current grants with the full existing responsibility
   * template. Linked does not mean source-verified, and this never
   * authorizes appointment, migration, revocation or automatic backfill. */
  async operabilityPreview(role: B1RoleCommandInput['role'], targetUserId: string) {
    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { status: true, profile: { select: { isTeachingStaff: true } } },
    });
    if (!target) throw new NotFoundException('Không tìm thấy nhân sự cần kiểm tra.');
    // Approved B1-only policy, including G4; legacy templates stay unchanged.
    const specs = materializeB1RoleGrants(role);
    const fullKeys = new Set(b1FullRoleSourceKeys(role));
    const now = new Date();
    const grants = await this.prisma.capabilityGrant.findMany({
      where: { userId: targetUserId, capabilityKey: { in: specs.map((s) => s.capabilityKey) },
        revokedAt: null, validFrom: { lte: now },
        OR: [{ validUntil: null }, { validUntil: { gt: now } }] },
      select: { capabilityKey: true, scopeType: true, scopeResourceId: true,
        coordinateId: true }, take: 257,
    });
    const capabilities = specs.map((spec) => {
      const matching = grants.filter((grant) => grant.capabilityKey === spec.capabilityKey
        && grant.scopeType === spec.scopeType
        && grant.scopeResourceId === (spec.scopeResourceId ?? null));
      const state = matching.length === 0 ? 'MISSING'
        : matching.length > 1 ? 'OVERLAPPING_GRANTS'
          : matching[0].coordinateId === null ? 'ACTIVE_LEGACY_UNLINKED'
            : 'ACTIVE_LINKED_UNVERIFIED';
      return { sourceManagedByB1: B1_STAGED_SOURCE_KEYS[role].includes(spec.capabilityKey)
        && spec.scopeType === 'SCHOOL_WIDE',
        sourceManagedByFullRoleWriter: fullKeys.has(spec.capabilityKey)
          && spec.scopeType === 'SCHOOL_WIDE',
        capabilityKey: spec.capabilityKey, scopeType: spec.scopeType,
        scopeResourceId: spec.scopeResourceId ?? null, category: spec.category, state };
    });
    return { mode: 'READ_ONLY' as const, canConfirm: false as const,
      role, targetUserId, eligibleTeachingStaff:
        target.profile?.isTeachingStaff === true &&
        ['ACTIVE', 'PENDING'].includes(target.status),
      requiredCount: capabilities.length,
      notManagedByStagedWriterCount: capabilities.filter((s) => !s.sourceManagedByB1).length,
      notManagedByFullRoleWriterCount: capabilities.filter((s) => !s.sourceManagedByFullRoleWriter).length,
      missingCount: capabilities.filter((s) => s.state === 'MISSING').length,
      legacyUnlinkedCount: capabilities.filter((s) => s.state === 'ACTIVE_LEGACY_UNLINKED').length,
      overlappingCount: capabilities.filter((s) => s.state === 'OVERLAPPING_GRANTS').length,
      inventoryTruncated: grants.length === 257,
      provenanceVerified: false as const,
      capabilities,
    };
  }

  async execute(
    command: B1RoleCommandInput,
    actorUserId: string,
    requestId?: string,
  ): Promise<B1RoleReceipt> {
    if (B1RoleCommandHttpService.activationBlockers(command.role).length > 0) {
      throw new ForbiddenException('B1_CUTOVER_NOT_AUTHORIZED');
    }
    // This route never reads actorId, seat, issuer or scope from request body.
    return this.writer.execute(command, { userId: actorUserId, requestId });
  }
}
