import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { RoleAppointmentPreflightRequest, RoleAppointmentPreflightResponse } from '@baogiang/contracts';
import { CapabilityAuthorizationService } from '../authorization/capability-authorization.service';
import { PrismaService } from '../prisma/prisma.service';
import { AccessBaselineService } from './access-baseline.service';

/**
 * WS1/D2-D3 evidence-only gate. Does not decide the legal/current office holder
 * and cannot write any appointment, grant, source, projection or audit receipt.
 */
@Injectable()
export class AppointmentPreflightService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: CapabilityAuthorizationService,
    private readonly baselines: AccessBaselineService,
  ) {}

  async preview(
    input: RoleAppointmentPreflightRequest,
    actorUserId: string,
    mustChangePassword = false,
  ): Promise<RoleAppointmentPreflightResponse> {
    if (mustChangePassword) throw new ForbiddenException('Cần đổi mật khẩu trước khi sử dụng chức năng quản trị.');
    if (input.targetUserId === actorUserId) throw new ForbiddenException('Không được tự bổ nhiệm hoặc tự thay đổi chức trách.');
    if (input.templateKey === 'SUBJECT_LEADER' && !input.subjectGroupId) {
      throw new BadRequestException('Cần chọn tổ chuyên môn trước khi xem xét bổ nhiệm Tổ trưởng.');
    }
    if (input.templateKey === 'VICE_PRINCIPAL_ACADEMIC' && input.subjectGroupId) {
      throw new BadRequestException('Chức trách Phó Hiệu trưởng chuyên môn không sử dụng phạm vi tổ.');
    }

    // A capability check is necessary for information access but is never
    // sufficient evidence for a future appointment/dismissal command.
    if (input.templateKey === 'VICE_PRINCIPAL_ACADEMIC') {
      const userManage = await this.authorization.hasCapability({
        userId: actorUserId, capabilityKey: 'USER_MANAGE', requestedScope: 'SCHOOL_WIDE',
      });
      const grantAdmin = await this.authorization.hasCapability({
        userId: actorUserId, capabilityKey: 'CAPABILITY_GRANT', requestedScope: 'SCHOOL_WIDE',
      });
      if (!userManage || !grantAdmin) throw new ForbiddenException('Chỉ quản trị viên được xem trước việc bổ nhiệm Phó Hiệu trưởng.');
    } else {
      const pht = await this.authorization.hasCapability({
        userId: actorUserId, capabilityKey: 'APPROVAL_VICE_PRINCIPAL', requestedScope: 'SCHOOL_WIDE',
      });
      if (!pht) throw new ForbiddenException('Chỉ Phó Hiệu trưởng chuyên môn được xem trước việc bổ nhiệm Tổ trưởng.');
    }

    const templatePreview = await this.baselines.previewTemplate(input.targetUserId, {
      templateKey: input.templateKey,
      ...(input.subjectGroupId ? { subjectGroupId: input.subjectGroupId } : {}),
    });

    const now = new Date();
    const [grants, activeRoleAppointmentCount] = await Promise.all([
      this.prisma.capabilityGrant.findMany({
        where: {
          userId: input.targetUserId,
          revokedAt: null,
          validFrom: { lte: now },
          OR: [{ validUntil: null }, { validUntil: { gt: now } }],
        },
        select: { coordinateId: true },
      }),
      this.prisma.roleAppointment.count({
        where: {
          userId: input.targetUserId,
          templateKey: input.templateKey,
          cancelledAt: null,
          validFrom: { lte: now },
          OR: [{ validUntil: null }, { validUntil: { gt: now } }],
        },
      }),
    ]);
    const legacyUnlinkedActiveGrantCount = grants.filter((grant) => grant.coordinateId === null).length;

    // coordinateId alone does NOT prove source/support union coverage.
    // Deliberately never return an actionable revocation proposal.
    return {
      mode: 'READ_ONLY',
      canConfirm: false,
      confirmationBlocker: 'B1_SOURCE_WRITER_NOT_ACTIVE',
      authorityBasis: 'CAPABILITY_PRECHECK_ONLY',
      templatePreview,
      evidence: {
        activeGrantCount: grants.length,
        legacyUnlinkedActiveGrantCount,
        b1LinkedButUnverifiedActiveGrantCount: grants.length - legacyUnlinkedActiveGrantCount,
        activeRoleAppointmentCount,
        provenanceVerified: false,
      },
    };
  }
}
