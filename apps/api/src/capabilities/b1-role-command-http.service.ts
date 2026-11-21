import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
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
    this.writer = new B1RoleCommandWriter(prisma);
  }

  static activationBlockers(role: B1RoleCommandInput['role'], env: NodeJS.ProcessEnv = process.env): string[] {
    const required = [
      'B1_ROLE_COMMANDS_ENABLED',
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
      && issuerSeats[0].command.targetUserId === actorUserId
      && issuerSeats[0].command.actorUserId !== actorUserId;
    const appointments = seat ? await this.prisma.roleAppointment.findMany({
      where: { seatId: seat.id, templateKey: role, cancelledAt: null,
        validFrom: { lte: now }, OR: [{ validUntil: null }, { validUntil: { gt: now } }] },
      select: { id: true, userId: true, validFrom: true },
      orderBy: { userId: 'asc' }, take: 33,
    }) : [];
    return { mode: 'READ_ONLY' as const, canConfirm: false as const,
      verifiedTechnicalSeat, activationBlockers: B1RoleCommandHttpService.activationBlockers(role),
      seatEnabled: seat?.enabled ?? false,
      expectedSeatVersion: seat?.policyVersion.toString() ?? null,
      expectedAuthorizationEpoch: (epoch?.epoch ?? 0n).toString(),
      activeAppointments: appointments.map((item) => ({
        appointmentId: item.id, userId: item.userId, validFrom: item.validFrom.toISOString(),
      })),
      inventoryTruncated: appointments.length === 33,
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
