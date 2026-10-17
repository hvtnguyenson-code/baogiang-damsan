import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditResult,
  CatalogStatus,
  Prisma,
  UserStatus,
} from '@prisma/client';
import {
  BaselineReconciliationApplyRequest,
  BaselineReconciliationApplyResponse,
  BaselineReconciliationConflictUser,
  BaselineReconciliationExcludedUser,
  BaselineReconciliationMissingUser,
  BaselineReconciliationPreviewResponse,
  BaselineReconciliationUserResult,
  CapabilityGrantRecord,
  CapabilityScope,
  GrantDeltaItem,
  ResponsibilityTemplateApplyRequest,
  ResponsibilityTemplateApplyResponse,
  ResponsibilityTemplateConflictItem,
  ResponsibilityTemplateGrantSpec,
  ResponsibilityTemplateKey,
  ResponsibilityTemplatePreviewRequest,
  ResponsibilityTemplatePreviewResponse,
} from '@baogiang/contracts';
import { AuditService } from '../audit/audit.service';
import { RequestMeta } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { toCapabilityGrantRecord } from './capabilities.service';
import { evaluateCoordinateEffectivity } from './effectivity-evaluator';
import {
  getTemplateDefinition,
  materializeTemplateGrants,
} from './responsibility-template-catalog';

export interface EnsureBaselineResult {
  status: 'SUCCESS' | 'ALREADY_COMPLIANT' | 'CONFLICT' | 'INELIGIBLE';
  grant?: CapabilityGrantRecord;
  reason?: string;
}

@Injectable()
export class AccessBaselineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Single server-owned eligibility rule for professional baseline:
   * Status === ACTIVE AND profile exists AND profile.isTeachingStaff === true.
   * Never inferred from positionTitle, duty, membership, assignment, or username.
   */
  isEligibleForProfessionalBaseline(user: {
    status?: UserStatus;
    profile?: { isTeachingStaff: boolean } | null;
  }): boolean {
    return (
      (user.status === undefined || user.status === UserStatus.ACTIVE) &&
      !!user.profile &&
      user.profile.isTeachingStaff === true
    );
  }

  /**
   * Server-owned validation helper enforcing CapabilityDefinition semantics
   * for every grant spec before insertion:
   * 1. CapabilityDefinition exists
   * 2. definition.isActive === true
   * 3. definition.allowedScopeTypes includes spec.scopeType
   *
   * Fails closed with Vietnamese error if any spec is invalid.
   */
  async validateCapabilityGrantSpecs(
    specs: Array<{ capabilityKey: string; scopeType: CapabilityScope }>,
    client: Prisma.TransactionClient | PrismaService,
  ): Promise<void> {
    if (specs.length === 0) return;

    const keys = [...new Set(specs.map((s) => s.capabilityKey))];
    const definitions = await client.capabilityDefinition.findMany({
      where: { key: { in: keys } },
      select: {
        key: true,
        isActive: true,
        allowedScopeTypes: true,
      },
    });

    const defMap = new Map(definitions.map((d) => [d.key, d]));

    for (const spec of specs) {
      const def = defMap.get(spec.capabilityKey);
      if (!def) {
        throw new NotFoundException(
          `Không tìm thấy định nghĩa quyền: ${spec.capabilityKey}.`,
        );
      }
      if (!def.isActive) {
        throw new ConflictException(
          `Quyền ${spec.capabilityKey} đang bị vô hiệu hóa hoặc không khả dụng.`,
        );
      }
      if (!def.allowedScopeTypes.includes(spec.scopeType)) {
        throw new ConflictException(
          `Phạm vi ${spec.scopeType} không được phép cho quyền ${spec.capabilityKey}.`,
        );
      }
    }
  }

  /**
   * Serialized, idempotent ensure of TEACHER_BASE / PERSONAL / resourceId = null
   * for an active professional user.
   */
  async ensureProfessionalBaseline(
    userId: string,
    actorUserId: string,
    meta: RequestMeta,
    externalTx?: Prisma.TransactionClient,
    trigger = 'MANUAL',
  ): Promise<EnsureBaselineResult> {
    const run = async (tx: Prisma.TransactionClient): Promise<EnsureBaselineResult> => {
      // 1. Serialization lock: lock user row first before evaluating or inserting grants
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;

      // 2. Re-read user state and profile
      const user = await tx.user.findUnique({
        where: { id: userId },
        include: { profile: true },
      });

      if (!user) throw new NotFoundException('Không tìm thấy người dùng.');
      if (user.status !== UserStatus.ACTIVE) {
        return {
          status: 'INELIGIBLE',
          reason: 'Người dùng không ở trạng thái hoạt động (ACTIVE).',
        };
      }

      if (!this.isEligibleForProfessionalBaseline(user)) {
        return {
          status: 'INELIGIBLE',
          reason: 'Người dùng không phải nhân sự giảng dạy (isTeachingStaff=false).',
        };
      }

      // 3. Re-read non-revoked grants for coordinate (userId, 'TEACHER_BASE', 'PERSONAL', null)
      const existingGrants = await tx.capabilityGrant.findMany({
        where: {
          userId,
          capabilityKey: 'TEACHER_BASE',
          scopeType: 'PERSONAL',
          scopeResourceId: null,
          revokedAt: null,
        },
        select: {
          id: true,
          validFrom: true,
          validUntil: true,
          revokedAt: true,
        },
      });

      const now = new Date();
      const effectivity = evaluateCoordinateEffectivity(now, null, existingGrants);

      if (effectivity.status === 'ALREADY_COVERED') {
        return {
          status: 'ALREADY_COMPLIANT',
          reason: 'Đã có quyền TEACHER_BASE vô thời hạn đang hoạt động.',
        };
      }

      if (effectivity.status !== 'MISSING') {
        throw new ConflictException(
          `Xung đột hiệu lực TEACHER_BASE: ${effectivity.reason}`,
        );
      }

      // 4. Validate capability definition before insert
      await this.validateCapabilityGrantSpecs(
        [{ capabilityKey: 'TEACHER_BASE', scopeType: 'PERSONAL' }],
        tx,
      );

      // 5. Insert missing TEACHER_BASE grant
      const grant = await tx.capabilityGrant.create({
        data: {
          userId,
          capabilityKey: 'TEACHER_BASE',
          scopeType: 'PERSONAL',
          scopeResourceId: null,
          validFrom: now,
          validUntil: null,
          grantedByUserId: actorUserId,
        },
      });

      // 5. Write audit
      await this.audit.write(
        {
          actorUserId,
          action: 'PROFESSIONAL_BASELINE_GRANTED',
          entityType: 'CapabilityGrant',
          entityId: grant.id,
          requestId: meta.requestId,
          result: AuditResult.SUCCESS,
          metadata: {
            targetUserId: userId,
            capabilityKey: 'TEACHER_BASE',
            scopeType: 'PERSONAL',
            trigger,
          },
        },
        tx,
      );

      return {
        status: 'SUCCESS',
        grant: toCapabilityGrantRecord(grant),
      };
    };

    if (externalTx) {
      return run(externalTx);
    }
    return this.prisma.$transaction(run);
  }

  /**
   * Server-owned preview of a Responsibility Template for a target user.
   */
  async previewTemplate(
    userId: string,
    dto: ResponsibilityTemplatePreviewRequest,
  ): Promise<ResponsibilityTemplatePreviewResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });
    if (!user) throw new NotFoundException('Không tìm thấy người dùng.');

    const templateDef = getTemplateDefinition(dto.templateKey);

    // Eligibility check
    const isTeachingStaff = user.profile?.isTeachingStaff === true;
    let isEligible = true;
    let ineligibilityReason: string | undefined;

    if (templateDef.requiresTeachingStaff && !isTeachingStaff) {
      isEligible = false;
      ineligibilityReason =
        'Tài khoản không phải nhân sự giảng dạy (isTeachingStaff=false); không thể áp dụng template chuyên môn này.';
    }

    // Resolve and validate resources
    const resourceInput = {
      subjectGroupId: dto.subjectGroupId ?? dto.resources?.subjectGroupId,
      subjectIds: dto.subjectIds ?? dto.resources?.subjectIds,
      programmeMasterId: dto.programmeMasterId ?? dto.resources?.programmeMasterId,
    };
    const resolved = await this.resolveTemplateResources(
      dto.templateKey,
      resourceInput,
      this.prisma,
    );

    // Materialize grant specs
    const grantSpecs = materializeTemplateGrants({
      templateKey: dto.templateKey,
      subjectGroupId: resolved.subjectGroupId,
      resolvedSubjectIds: resolved.subjectIds,
      programmeMasterId: resolved.programmeMasterId,
    });

    // Read all non-revoked grants for target user
    const existingGrants = await this.prisma.capabilityGrant.findMany({
      where: { userId, revokedAt: null },
      select: {
        id: true,
        capabilityKey: true,
        scopeType: true,
        scopeResourceId: true,
        validFrom: true,
        validUntil: true,
        revokedAt: true,
      },
    });

    const now = new Date();
    const grantsToAdd: GrantDeltaItem[] = [];
    const alreadyPresent: GrantDeltaItem[] = [];
    const conflicts: ResponsibilityTemplateConflictItem[] = [];

    for (const spec of grantSpecs) {
      const matchingExisting = existingGrants.filter(
        (g) =>
          g.capabilityKey === spec.capabilityKey &&
          g.scopeType === spec.scopeType &&
          (g.scopeResourceId ?? null) === (spec.scopeResourceId ?? null),
      );

      const evalResult = evaluateCoordinateEffectivity(now, null, matchingExisting);

      if (evalResult.status === 'ALREADY_COVERED') {
        alreadyPresent.push({
          capabilityKey: spec.capabilityKey,
          scopeType: spec.scopeType,
          scopeResourceId: spec.scopeResourceId,
          status: 'ALREADY_COVERED',
          existingGrantId: evalResult.existingGrantId,
          category: spec.category,
          description: spec.description,
        });
      } else if (evalResult.status === 'MISSING') {
        grantsToAdd.push({
          capabilityKey: spec.capabilityKey,
          scopeType: spec.scopeType,
          scopeResourceId: spec.scopeResourceId,
          status: 'MISSING',
          category: spec.category,
          description: spec.description,
        });
      } else {
        conflicts.push({
          capabilityKey: spec.capabilityKey,
          scopeType: spec.scopeType,
          scopeResourceId: spec.scopeResourceId,
          status: evalResult.status,
          reason: evalResult.reason ?? 'Xung đột khoảng thời gian hiệu lực.',
          conflictingGrantId: evalResult.existingGrantId,
          validFrom: evalResult.conflictingGrant?.validFrom,
          validUntil: evalResult.conflictingGrant?.validUntil,
        });
      }
    }

    return {
      templateKey: dto.templateKey,
      version: templateDef.version,
      targetUser: {
        id: user.id,
        username: user.username,
        displayName: user.profile?.displayName ?? user.username,
        isTeachingStaff,
        status: user.status,
      },
      eligibility: {
        isEligible,
        ...(ineligibilityReason ? { reason: ineligibilityReason } : {}),
      },
      requiredResources: {
        kind: templateDef.requiredResourceKind,
        provided: resolved.provided,
        ...(resolved.subjectGroupId ? { resolvedSubjectGroupId: resolved.subjectGroupId } : {}),
        ...(resolved.subjectIds ? { resolvedSubjectIds: resolved.subjectIds } : {}),
        ...(resolved.programmeMasterId ? { resolvedProgrammeMasterId: resolved.programmeMasterId } : {}),
        ...(resolved.details ? { details: resolved.details } : {}),
      },
      grantsToAdd,
      alreadyPresent,
      conflicts,
      forbiddenDefaults: templateDef.forbiddenDefaults,
      notes: templateDef.notes,
    };
  }

  /**
   * Server-owned, serialized apply of a Responsibility Template for a target user.
   */
  async applyTemplate(
    userId: string,
    dto: ResponsibilityTemplateApplyRequest,
    actorUserId: string,
    meta: RequestMeta,
  ): Promise<ResponsibilityTemplateApplyResponse> {
    const templateDef = getTemplateDefinition(dto.templateKey);

    return this.prisma.$transaction(async (tx) => {
      // 1. Serialization: lock user row FOR UPDATE
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;

      // 2. Re-read user state
      const user = await tx.user.findUnique({
        where: { id: userId },
        include: { profile: true },
      });
      if (!user) throw new NotFoundException('Không tìm thấy người dùng.');

      const isTeachingStaff = user.profile?.isTeachingStaff === true;
      if (templateDef.requiresTeachingStaff && !isTeachingStaff) {
        throw new ConflictException(
          'Tài khoản không phải nhân sự giảng dạy (isTeachingStaff=false); không thể áp dụng responsibility template chuyên môn.',
        );
      }

      // 3. Resolve and validate resources inside transaction
      const resourceInput = {
        subjectGroupId: dto.subjectGroupId ?? dto.resources?.subjectGroupId,
        subjectIds: dto.subjectIds ?? dto.resources?.subjectIds,
        programmeMasterId: dto.programmeMasterId ?? dto.resources?.programmeMasterId,
      };
      const resolved = await this.resolveTemplateResources(
        dto.templateKey,
        resourceInput,
        tx,
      );

      if (templateDef.requiredResourceKind !== 'NONE' && !resolved.provided) {
        throw new BadRequestException(
          `Template ${dto.templateKey} yêu cầu resource ${templateDef.requiredResourceKind} nhưng chưa được cung cấp.`,
        );
      }

      // 4. Materialize grant specifications
      const grantSpecs = materializeTemplateGrants({
        templateKey: dto.templateKey,
        subjectGroupId: resolved.subjectGroupId,
        resolvedSubjectIds: resolved.subjectIds,
        programmeMasterId: resolved.programmeMasterId,
      });

      // Validate all grant specs before checking or inserting grants
      await this.validateCapabilityGrantSpecs(grantSpecs, tx);

      // 5. Re-read non-revoked grants
      const existingGrants = await tx.capabilityGrant.findMany({
        where: { userId, revokedAt: null },
        select: {
          id: true,
          capabilityKey: true,
          scopeType: true,
          scopeResourceId: true,
          validFrom: true,
          validUntil: true,
          revokedAt: true,
        },
      });

      const now = new Date();
      const specsToAdd: ResponsibilityTemplateGrantSpec[] = [];
      const alreadyPresent: GrantDeltaItem[] = [];
      const conflicts: ResponsibilityTemplateConflictItem[] = [];

      for (const spec of grantSpecs) {
        const matchingExisting = existingGrants.filter(
          (g) =>
            g.capabilityKey === spec.capabilityKey &&
            g.scopeType === spec.scopeType &&
            (g.scopeResourceId ?? null) === (spec.scopeResourceId ?? null),
        );

        const evalResult = evaluateCoordinateEffectivity(now, null, matchingExisting);

        if (evalResult.status === 'ALREADY_COVERED') {
          alreadyPresent.push({
            capabilityKey: spec.capabilityKey,
            scopeType: spec.scopeType,
            scopeResourceId: spec.scopeResourceId,
            status: 'ALREADY_COVERED',
            existingGrantId: evalResult.existingGrantId,
            category: spec.category,
            description: spec.description,
          });
        } else if (evalResult.status === 'MISSING') {
          specsToAdd.push(spec);
        } else {
          conflicts.push({
            capabilityKey: spec.capabilityKey,
            scopeType: spec.scopeType,
            scopeResourceId: spec.scopeResourceId,
            status: evalResult.status,
            reason: evalResult.reason ?? 'Xung đột khoảng thời gian hiệu lực.',
            conflictingGrantId: evalResult.existingGrantId,
          });
        }
      }

      // If conflicts exist: fail closed!
      if (conflicts.length > 0) {
        const first = conflicts[0];
        throw new ConflictException(
          `Không thể áp dụng template do xung đột hiệu lực capability ${first.capabilityKey}: ${first.reason}`,
        );
      }

      // 6. Insert missing grants
      const createdGrants: CapabilityGrantRecord[] = [];
      for (const spec of specsToAdd) {
        const created = await tx.capabilityGrant.create({
          data: {
            userId,
            capabilityKey: spec.capabilityKey,
            scopeType: spec.scopeType,
            scopeResourceId: spec.scopeResourceId ?? null,
            validFrom: now,
            validUntil: null,
            grantedByUserId: actorUserId,
          },
        });
        createdGrants.push(toCapabilityGrantRecord(created));
      }

      // 7. Write retained audit record
      const auditPayload = {
        templateKey: dto.templateKey,
        templateVersion: templateDef.version,
        targetUserId: userId,
        grantsAddedCount: createdGrants.length,
        alreadyPresentCount: alreadyPresent.length,
        grantsAdded: createdGrants.map((g) => ({
          key: g.capabilityKey,
          scope: g.scopeType,
          resourceId: g.scopeResourceId,
        })),
        alreadyPresent: alreadyPresent.map((g) => ({
          key: g.capabilityKey,
          scope: g.scopeType,
          resourceId: g.scopeResourceId,
        })),
      };

      await this.audit.write(
        {
          actorUserId,
          action: 'RESPONSIBILITY_TEMPLATE_APPLIED',
          entityType: 'User',
          entityId: userId,
          requestId: meta.requestId,
          result: AuditResult.SUCCESS,
          metadata: auditPayload,
        },
        tx,
      );

      return {
        applied: true,
        templateKey: dto.templateKey,
        version: templateDef.version,
        targetUserId: userId,
        grantsAdded: createdGrants,
        alreadyPresent,
      };
    });
  }

  /**
   * Preview baseline reconciliation across active users.
   */
  async previewReconciliation(): Promise<BaselineReconciliationPreviewResponse> {
    const activeUsers = await this.prisma.user.findMany({
      where: { status: UserStatus.ACTIVE },
      include: {
        profile: true,
        capabilityGrants: {
          where: {
            capabilityKey: 'TEACHER_BASE',
            scopeType: 'PERSONAL',
            scopeResourceId: null,
            revokedAt: null,
          },
          select: {
            id: true,
            validFrom: true,
            validUntil: true,
            revokedAt: true,
          },
        },
      },
      orderBy: [{ username: 'asc' }, { id: 'asc' }],
    });

    const totalActiveUsers = activeUsers.length;
    let eligibleProfessionals = 0;
    let alreadyCompliant = 0;
    const missing: BaselineReconciliationMissingUser[] = [];
    const excluded: BaselineReconciliationExcludedUser[] = [];
    const conflicts: BaselineReconciliationConflictUser[] = [];

    const now = new Date();

    for (const user of activeUsers) {
      if (!user.profile) {
        excluded.push({
          userId: user.id,
          username: user.username,
          status: user.status,
          reason: 'Chưa có hồ sơ nhân sự (StaffProfile).',
        });
        continue;
      }

      if (user.profile.isTeachingStaff !== true) {
        excluded.push({
          userId: user.id,
          username: user.username,
          displayName: user.profile.displayName,
          status: user.status,
          reason: 'Không phải nhân sự giảng dạy (isTeachingStaff=false).',
        });
        continue;
      }

      eligibleProfessionals++;

      const effectivity = evaluateCoordinateEffectivity(
        now,
        null,
        user.capabilityGrants,
      );

      if (effectivity.status === 'ALREADY_COVERED') {
        alreadyCompliant++;
      } else if (effectivity.status === 'MISSING') {
        missing.push({
          userId: user.id,
          username: user.username,
          displayName: user.profile.displayName,
          status: user.status,
        });
      } else {
        conflicts.push({
          userId: user.id,
          username: user.username,
          displayName: user.profile.displayName,
          status: user.status,
          statusConflict: effectivity.status,
          reason: effectivity.reason ?? 'Xung đột khoảng thời gian hiệu lực.',
          conflictingGrant: effectivity.conflictingGrant,
        });
      }
    }

    return {
      totalActiveUsers,
      eligibleProfessionals,
      alreadyCompliant,
      missing,
      excluded,
      conflicts,
    };
  }

  /**
   * Apply baseline reconciliation:
   * - Server-owned eligibility invariant
   * - Sorted deterministic lock order
   * - Only fixes MISSING
   * - CONFLICT and EXCLUDED are safely skipped (no corruption)
   * - Idempotent
   */
  async applyReconciliation(
    dto: BaselineReconciliationApplyRequest,
    actorUserId: string,
    meta: RequestMeta,
  ): Promise<BaselineReconciliationApplyResponse> {
    return this.prisma.$transaction(async (tx) => {
      // 1. Determine target users
      if (dto.targetUserIds !== undefined && dto.targetUserIds.length === 0) {
        throw new BadRequestException('targetUserIds không được là mảng rỗng.');
      }

      let candidateIds: string[];
      if (dto.targetUserIds && dto.targetUserIds.length > 0) {
        candidateIds = [...new Set(dto.targetUserIds)];
      } else {
        // All active users
        const activeUsers = await tx.user.findMany({
          where: { status: UserStatus.ACTIVE },
          select: { id: true },
        });
        candidateIds = activeUsers.map((u) => u.id);
      }

      // Deterministic sort order
      candidateIds.sort();

      // Enforce capability definition validation before evaluating or inserting
      await this.validateCapabilityGrantSpecs(
        [{ capabilityKey: 'TEACHER_BASE', scopeType: 'PERSONAL' }],
        tx,
      );

      // 2. Lock target user rows deterministically
      for (const id of candidateIds) {
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${id}::uuid FOR UPDATE`;
      }

      // 3. Re-read users with profiles and active TEACHER_BASE grants
      const users = await tx.user.findMany({
        where: { id: { in: candidateIds } },
        include: {
          profile: true,
          capabilityGrants: {
            where: {
              capabilityKey: 'TEACHER_BASE',
              scopeType: 'PERSONAL',
              scopeResourceId: null,
              revokedAt: null,
            },
            select: {
              id: true,
              validFrom: true,
              validUntil: true,
              revokedAt: true,
            },
          },
        },
        orderBy: [{ username: 'asc' }, { id: 'asc' }],
      });

      const now = new Date();
      let grantsCreated = 0;
      let skippedAlreadyCompliant = 0;
      let skippedConflict = 0;
      let skippedExcluded = 0;
      const results: BaselineReconciliationUserResult[] = [];

      for (const user of users) {
        if (user.status !== UserStatus.ACTIVE) {
          skippedExcluded++;
          results.push({
            userId: user.id,
            username: user.username,
            status: 'EXCLUDED',
            reason: `Người dùng không ở trạng thái hoạt động (${user.status}).`,
          });
          continue;
        }

        if (!user.profile || user.profile.isTeachingStaff !== true) {
          skippedExcluded++;
          results.push({
            userId: user.id,
            username: user.username,
            status: 'EXCLUDED',
            reason: !user.profile
              ? 'Chưa có hồ sơ nhân sự.'
              : 'Không phải nhân sự giảng dạy (isTeachingStaff=false).',
          });
          continue;
        }

        const effectivity = evaluateCoordinateEffectivity(
          now,
          null,
          user.capabilityGrants,
        );

        if (effectivity.status === 'ALREADY_COVERED') {
          skippedAlreadyCompliant++;
          results.push({
            userId: user.id,
            username: user.username,
            status: 'ALREADY_COMPLIANT',
            reason: 'Đã có TEACHER_BASE vô thời hạn.',
          });
          continue;
        }

        if (effectivity.status !== 'MISSING') {
          skippedConflict++;
          results.push({
            userId: user.id,
            username: user.username,
            status: 'CONFLICT',
            reason: effectivity.reason,
          });
          continue;
        }

        // MISSING: safely create TEACHER_BASE grant
        const grant = await tx.capabilityGrant.create({
          data: {
            userId: user.id,
            capabilityKey: 'TEACHER_BASE',
            scopeType: 'PERSONAL',
            scopeResourceId: null,
            validFrom: now,
            validUntil: null,
            grantedByUserId: actorUserId,
          },
        });

        grantsCreated++;
        results.push({
          userId: user.id,
          username: user.username,
          status: 'SUCCESS',
          grantId: grant.id,
        });

        await this.audit.write(
          {
            actorUserId,
            action: 'PROFESSIONAL_BASELINE_GRANTED',
            entityType: 'CapabilityGrant',
            entityId: grant.id,
            requestId: meta.requestId,
            result: AuditResult.SUCCESS,
            metadata: {
              targetUserId: user.id,
              capabilityKey: 'TEACHER_BASE',
              scopeType: 'PERSONAL',
              trigger: 'BASELINE_RECONCILIATION',
            },
          },
          tx,
        );
      }

      // Check for any candidate IDs that were not found in database
      const userMap = new Map(users.map((u) => [u.id, u]));
      for (const id of candidateIds) {
        if (!userMap.has(id)) {
          skippedExcluded++;
          results.push({
            userId: id,
            username: '',
            status: 'EXCLUDED',
            reason: 'Không tìm thấy người dùng.',
          });
        }
      }

      // Summary audit
      await this.audit.write(
        {
          actorUserId,
          action: 'BASELINE_RECONCILIATION_APPLIED',
          entityType: 'User',
          entityId: actorUserId,
          requestId: meta.requestId,
          result: AuditResult.SUCCESS,
          metadata: {
            processedCount: candidateIds.length,
            grantsCreated,
            skippedAlreadyCompliant,
            skippedConflict,
            skippedExcluded,
          },
        },
        tx,
      );

      return {
        processedCount: candidateIds.length,
        grantsCreated,
        skippedAlreadyCompliant,
        skippedConflict,
        skippedExcluded,
        results,
      };
    });
  }

  private async resolveTemplateResources(
    templateKey: ResponsibilityTemplateKey,
    input:
      | {
          subjectGroupId?: string;
          subjectIds?: string[];
          programmeMasterId?: string;
        }
      | undefined,
    prisma: PrismaService | Prisma.TransactionClient,
  ): Promise<{
    provided: boolean;
    subjectGroupId?: string;
    subjectIds?: string[];
    programmeMasterId?: string;
    details?: string;
  }> {
    if (templateKey === 'GDDP_COORDINATOR') {
      if (!input?.programmeMasterId) {
        return { provided: false, details: 'Chưa cung cấp programmeMasterId cho GDĐP.' };
      }
      const master = await prisma.programmeMaster.findUnique({
        where: { id: input.programmeMasterId },
        select: { id: true, kind: true, gradeLevel: true },
      });
      if (!master) throw new NotFoundException('Không tìm thấy chương trình GDĐP.');
      if (master.kind !== 'GDDP') {
        throw new ConflictException('Chương trình không phải Giáo dục địa phương (GDĐP).');
      }
      return {
        provided: true,
        programmeMasterId: master.id,
        details: `GDĐP (Khối ${master.gradeLevel ?? 'chung'})`,
      };
    }

    if (templateKey === 'HDTN_COORDINATOR') {
      if (!input?.programmeMasterId) {
        return { provided: false, details: 'Chưa cung cấp programmeMasterId cho HĐTN-HN.' };
      }
      const master = await prisma.programmeMaster.findUnique({
        where: { id: input.programmeMasterId },
        select: { id: true, kind: true, gradeLevel: true },
      });
      if (!master) throw new NotFoundException('Không tìm thấy chương trình HĐTN-HN.');
      if (master.kind !== 'HDTN_HN') {
        throw new ConflictException('Chương trình không phải Hoạt động trải nghiệm, hướng nghiệp (HDTN_HN).');
      }
      return {
        provided: true,
        programmeMasterId: master.id,
        details: `HĐTN-HN (Toàn trường)`,
      };
    }

    if (templateKey === 'SUBJECT_LEADER') {
      if (!input?.subjectGroupId) {
        return { provided: false, details: 'Chưa cung cấp subjectGroupId cho Tổ trưởng.' };
      }
      const group = await prisma.subjectGroup.findUnique({
        where: { id: input.subjectGroupId },
        select: { id: true, code: true, name: true, status: true },
      });
      if (!group) throw new NotFoundException('Không tìm thấy tổ chuyên môn.');
      if (group.status !== CatalogStatus.ACTIVE) {
        throw new ConflictException('Tổ chuyên môn không hoạt động.');
      }

      let resolvedSubjectIds: string[] = [];

      if (input.subjectIds && input.subjectIds.length > 0) {
        const uniqueSubjectIds = [...new Set(input.subjectIds)].sort();
        const subjects = await prisma.subject.findMany({
          where: { id: { in: uniqueSubjectIds } },
          select: { id: true, code: true, name: true, status: true },
        });
        if (subjects.length !== uniqueSubjectIds.length) {
          throw new NotFoundException('Một hoặc nhiều môn học không tồn tại.');
        }
        const inactive = subjects.find((s) => s.status !== CatalogStatus.ACTIVE);
        if (inactive) {
          throw new ConflictException(
            `Môn học ${inactive.name} (${inactive.code}) không ở trạng thái hoạt động.`,
          );
        }
        resolvedSubjectIds = uniqueSubjectIds;
      }

      return {
        provided: true,
        subjectGroupId: group.id,
        subjectIds: resolvedSubjectIds,
        details: `Tổ: ${group.name} (${group.code})${resolvedSubjectIds.length > 0 ? ` - ${resolvedSubjectIds.length} môn chuyên môn được giao cho tổ trưởng` : ''}`,
      };
    }

    return { provided: true };
  }
}
