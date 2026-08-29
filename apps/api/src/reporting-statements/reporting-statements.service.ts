import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AuditResult, Prisma, ReportingStatementCommandType as Command, ReportingStatementHistoryEvent as Event, ReportingStatementLifecycleState as State } from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import {
  CapabilityKey,
  ReportingStatementAllowedAction,
  ReportingStatementDetailResponse,
  ReportingStatementListResponse,
  ReportingStatementPreviewResponse,
  ReportingStatementWorkspaceContextResponse,
} from '@baogiang/contracts';
import { AuditService } from '../audit/audit.service';
import { requestMeta } from '../auth/auth-http';
import { AuthenticatedRequest } from '../auth/auth.types';
import { CapabilityAuthorizationService } from '../authorization/capability-authorization.service';
import { formatCivilDate, parseCivilDate } from '../common/validation/civil-date';
import { PersonalReportingProjectionService } from '../personal-reporting-projection/personal-reporting-projection.service';
import { freezeReportingStatementSnapshot } from '../reporting-statement-internal/reporting-statement-canonicalizer';
import { ReportingStatementRepository } from '../reporting-statement-internal/reporting-statement.repository';
import { PrismaService } from '../prisma/prisma.service';
import {
  DecideReportingStatementDto,
  ListReportingStatementsQueryDto,
  PreviewReportingStatementDto,
  ReportingStatementWorkspaceContextQueryDto,
  SubmitReportingStatementDto,
} from './dto';
import { PERSONAL_REPORTING_STATEMENT_PROFILE, REPORTING_STATEMENT_CLOCK, ReportingStatementClock } from './reporting-statement.policy';
import {
  mapToPublicFinding,
  presentReportingStatementDetail,
  presentReportingStatementSummary,
} from './reporting-statement.presenter';

const fingerprint = (value: object) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

@Injectable()
export class ReportingStatementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: ReportingStatementRepository,
    private readonly projection: PersonalReportingProjectionService,
    private readonly authorization: CapabilityAuthorizationService,
    private readonly audit: AuditService,
    @Inject(REPORTING_STATEMENT_CLOCK) private readonly clock: ReportingStatementClock,
  ) {}

  async preview(dto: PreviewReportingStatementDto, request: AuthenticatedRequest): Promise<ReportingStatementPreviewResponse> {
    const actor = request.auth!.user.id;
    await this.require(request, 'REPORTING_STATEMENT_SUBMIT', 'PERSONAL');
    const from = parseCivilDate(dto.fromCivilDate), to = parseCivilDate(dto.toCivilDate);
    if (from > to) throw new BadRequestException('Khoảng thời gian không hợp lệ.');
    const asOf = this.clock.now();
    const projection = await this.projection.resolve({
      academicYearId: dto.academicYearId,
      targetUserId: actor,
      fromCivilDate: dto.fromCivilDate as never,
      toCivilDate: dto.toCivilDate as never,
      asOfInstant: asOf,
    });
    const eligibleForSubmission =
      projection.status === 'PASS' && projection.responsibilityState === 'RESPONSIBILITY_PRESENT';
    return {
      previewAsOfInstant: asOf.toISOString(),
      status: projection.status,
      responsibilityState: projection.responsibilityState,
      eligibleForSubmission,
      counts: projection.counts,
      sections: projection.sections.map((s) => ({
        schoolClassId: s.schoolClassId,
        subjectId: s.subjectId,
        responsibilityIntervals: s.responsibilityIntervals.map((i) => ({ ...i })),
        status: s.status,
        counts: s.counts,
        details: s.details.map((d) => ({ ...d })),
        findings: s.findings.map((f) => mapToPublicFinding(f)),
      })),
      findings: projection.findings.map((f) => mapToPublicFinding(f)),
      responsibilityManifest: projection.responsibilityManifest.map((i) => ({ ...i })),
    };
  }

  async workspaceContext(
    query: ReportingStatementWorkspaceContextQueryDto,
    request: AuthenticatedRequest,
  ): Promise<ReportingStatementWorkspaceContextResponse> {
    const actor = request.auth!.user.id;
    const capabilities = await this.authorization.listEffectiveCapabilities(actor);
    const allowed = capabilities.some((capability) =>
      (capability.key === 'REPORTING_STATEMENT_SUBMIT' && capability.scope === 'PERSONAL')
      || (capability.key === 'REPORTING_STATEMENT_READ'
        && ['PERSONAL', 'SUBJECT', 'SCHOOL_WIDE'].includes(capability.scope)),
    );
    if (!allowed) return this.deny(request, 'REPORTING_STATEMENT_READ');

    const academicYearRows = await this.prisma.academicYear.findMany({
      select: {
        id: true,
        code: true,
        name: true,
        calendarVersions: {
          where: { isActive: true },
          select: { startDate: true, endDate: true },
          orderBy: [{ id: 'asc' }],
          take: 1,
        },
      },
      orderBy: [{ code: 'asc' }, { id: 'asc' }],
    });
    const academicYears = academicYearRows.map((year) => ({
      id: year.id,
      code: year.code,
      name: year.name,
      activeCalendar: year.calendarVersions[0]
        ? {
            startDate: formatCivilDate(year.calendarVersions[0].startDate),
            endDate: formatCivilDate(year.calendarVersions[0].endDate),
          }
        : null,
    }));

    if (!query.academicYearId) return { academicYears, selectedAcademicYear: null };
    const selectedAcademicYear = academicYears.find((year) => year.id === query.academicYearId);
    if (!selectedAcademicYear) throw new NotFoundException('Không tìm thấy năm học.');

    const [schoolClasses, subjects] = await Promise.all([
      this.prisma.schoolClass.findMany({
        where: { academicYearId: query.academicYearId },
        select: { id: true, code: true, name: true, status: true },
        orderBy: [{ code: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.subject.findMany({
        select: { id: true, code: true, name: true, status: true },
        orderBy: [{ code: 'asc' }, { id: 'asc' }],
      }),
    ]);

    return {
      academicYears,
      selectedAcademicYear: {
        ...selectedAcademicYear,
        schoolClasses,
        subjects,
      },
    };
  }


  async listMine(query: ListReportingStatementsQueryDto, request: AuthenticatedRequest): Promise<ReportingStatementListResponse> {
    const actor = request.auth!.user.id;
    await this.require(request, 'REPORTING_STATEMENT_READ', 'PERSONAL');
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const { items, total } = await this.repository.listRevisions(
      this.prisma,
      { series: { submitterUserId: actor } },
      page,
      pageSize,
    );
    return {
      items: items.map((r) => presentReportingStatementSummary(r as never)),
      page,
      pageSize,
      total,
    };
  }

  async listAccessible(query: ListReportingStatementsQueryDto, request: AuthenticatedRequest): Promise<ReportingStatementListResponse> {
    const actor = request.auth!.user.id;
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const [personalDecision, schoolWideDecision, effectiveGrants] = await Promise.all([
      this.authorization.evaluate({ userId: actor, capabilityKey: 'REPORTING_STATEMENT_READ', requestedScope: 'PERSONAL' }),
      this.authorization.evaluate({ userId: actor, capabilityKey: 'REPORTING_STATEMENT_READ', requestedScope: 'SCHOOL_WIDE' }),
      this.authorization.listEffectiveCapabilities(actor),
    ]);

    const hasPersonal = personalDecision.allowed;
    const hasSchoolWide = schoolWideDecision.allowed;
    const subjectGrants = effectiveGrants
      .filter((g) => g.key === 'REPORTING_STATEMENT_READ' && g.scope === 'SUBJECT' && g.resourceId)
      .map((g) => g.resourceId!);

    const conditions: Prisma.ReportingStatementRevisionWhereInput[] = [];

    if (hasPersonal) {
      conditions.push({ series: { submitterUserId: actor } });
    }

    if (hasSchoolWide) {
      conditions.push({ series: { submitterUserId: { not: actor } } });
    } else if (subjectGrants.length > 0) {
      conditions.push({
        series: { submitterUserId: { not: actor } },
        subjects: {
          some: {},
          none: {
            subjectId: { notIn: subjectGrants },
          },
        },
      });
    }

    if (conditions.length === 0) {
      return { items: [], page, pageSize, total: 0 };
    }

    const where: Prisma.ReportingStatementRevisionWhereInput =
      conditions.length === 1 ? conditions[0] : { OR: conditions };

    const { items, total } = await this.repository.listRevisions(this.prisma, where, page, pageSize);
    return {
      items: items.map((r) => presentReportingStatementSummary(r as never)),
      page,
      pageSize,
      total,
    };
  }

  async listPendingDecision(query: ListReportingStatementsQueryDto, request: AuthenticatedRequest): Promise<ReportingStatementListResponse> {
    const actor = request.auth!.user.id;
    await this.requireApproval(request);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const [schoolWideRead, effectiveGrants] = await Promise.all([
      this.authorization.evaluate({ userId: actor, capabilityKey: 'REPORTING_STATEMENT_READ', requestedScope: 'SCHOOL_WIDE' }),
      this.authorization.listEffectiveCapabilities(actor),
    ]);

    const hasSchoolWideRead = schoolWideRead.allowed;
    const subjectGrants = effectiveGrants
      .filter((g) => g.key === 'REPORTING_STATEMENT_READ' && g.scope === 'SUBJECT' && g.resourceId)
      .map((g) => g.resourceId!);

    if (!hasSchoolWideRead && subjectGrants.length === 0) {
      return { items: [], page, pageSize, total: 0 };
    }

    const where: Prisma.ReportingStatementRevisionWhereInput = {
      state: { lifecycleState: State.SUBMITTED },
      series: { submitterUserId: { not: actor } },
      ...(hasSchoolWideRead
        ? {}
        : {
            subjects: {
              some: {},
              none: {
                subjectId: { notIn: subjectGrants },
              },
            },
          }),
    };

    const { items, total } = await this.repository.listRevisions(this.prisma, where, page, pageSize);
    return {
      items: items.map((r) => presentReportingStatementSummary(r as never)),
      page,
      pageSize,
      total,
    };
  }

  async submit(dto: SubmitReportingStatementDto, request: AuthenticatedRequest) {
    const actor = request.auth!.user.id;
    await this.require(request, 'REPORTING_STATEMENT_SUBMIT', 'PERSONAL');
    const from = parseCivilDate(dto.fromCivilDate), to = parseCivilDate(dto.toCivilDate);
    if (from > to) throw new BadRequestException('Khoảng thời gian không hợp lệ.');
    const fp = fingerprint({ command: 'SUBMIT', statementProfile: PERSONAL_REPORTING_STATEMENT_PROFILE, academicYearId: dto.academicYearId, fromCivilDate: dto.fromCivilDate, toCivilDate: dto.toCivilDate });
    const prior = await this.repository.classifyAcceptedCommand(this.prisma, actor, Command.SUBMIT, dto.requestKey, fp);
    if (prior.kind === 'FINGERPRINT_CONFLICT') throw new ConflictException('requestKey được dùng với nội dung khác.');
    if (prior.kind === 'REPLAY') return this.result(prior.command, true);
    const asOf = this.clock.now();
    return this.retry(async () => {
      await this.require(request, 'REPORTING_STATEMENT_SUBMIT', 'PERSONAL');
      return this.prisma.$transaction(async tx => {
        const replay = await this.repository.classifyAcceptedCommand(tx, actor, Command.SUBMIT, dto.requestKey, fp);
        if (replay.kind === 'FINGERPRINT_CONFLICT') throw new ConflictException('requestKey được dùng với nội dung khác.');
        if (replay.kind === 'REPLAY') return this.result(replay.command, true);
        const key = { statementProfile: PERSONAL_REPORTING_STATEMENT_PROFILE, submitterUserId: actor, academicYearId: dto.academicYearId, fromCivilDate: from, toCivilDate: to };
        const existing = await this.repository.findSeriesByLogicalKey(tx, key);
        if (existing) {
          await this.repository.lockSeries(tx, existing.id);
          if (await this.repository.loadCurrentSubmitted(tx, existing.id)) throw new ConflictException('Đã có Statement SUBMITTED chưa được xử lý.');
        }
        const projection = await this.projection.resolveInTransaction(tx, { academicYearId: dto.academicYearId, targetUserId: actor, fromCivilDate: dto.fromCivilDate as never, toCivilDate: dto.toCivilDate as never, asOfInstant: asOf });
        const profile = await tx.user.findUnique({ where: { id: actor }, include: { profile: true } });
        const frozen = freezeReportingStatementSnapshot({ statementProfile: PERSONAL_REPORTING_STATEMENT_PROFILE, submitterUserId: actor, submitterDisplayNameSnapshot: profile?.profile?.displayName ?? null, submitterStaffCodeSnapshot: profile?.profile?.staffCode ?? null, asOfInstant: asOf, projection });
        const tail = existing ? await this.repository.lineageTail(tx, existing.id) : null;
        if (tail === undefined) throw new ConflictException('Statement lineage không xác định.');
        const approved = existing ? await this.repository.loadCurrentApproved(tx, existing.id) : null;
        const saved = await this.repository.persistSubmittedRevision(tx, { series: key, frozen, revision: { predecessorRevisionId: tail?.id ?? null, supersedesRevisionId: approved?.revisionId ?? null }, lifecycleToken: randomUUID(), command: { actorUserId: actor, requestKey: dto.requestKey, requestFingerprint: fp }, history: { actorUserId: actor, actorDisplayNameSnapshot: profile?.profile?.displayName ?? null, actorStaffCodeSnapshot: profile?.profile?.staffCode ?? null } });
        await this.audit.write({ actorUserId: actor, action: 'REPORTING_STATEMENT_SUBMITTED', entityType: 'ReportingStatementRevision', entityId: saved.revision.id, requestId: requestMeta(request).requestId, result: AuditResult.SUCCESS, metadata: { commandType: 'SUBMIT', seriesId: saved.series.id, lifecycleState: 'SUBMITTED' } }, tx);
        return { revisionId: saved.revision.id, seriesId: saved.series.id, lifecycleState: saved.state.lifecycleState, lifecycleToken: saved.state.lifecycleToken, asOfInstant: asOf.toISOString(), replay: false };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    });
  }

  async read(revisionId: string, request: AuthenticatedRequest): Promise<ReportingStatementDetailResponse> {
    const row = await this.repository.readFrozenRevision(this.prisma, revisionId);
    if (!row) throw new NotFoundException('Không tìm thấy Statement.');
    const actor = request.auth!.user.id;
    if (row.series.submitterUserId === actor) {
      await this.require(request, 'REPORTING_STATEMENT_READ', 'PERSONAL');
    } else {
      const wide = await this.authorization.evaluate({ userId: actor, capabilityKey: 'REPORTING_STATEMENT_READ', requestedScope: 'SCHOOL_WIDE' });
      if (!wide.allowed) {
        if (!row.subjects.length) return this.deny(request, 'REPORTING_STATEMENT_READ');
        for (const subject of row.subjects) {
          if (!(await this.authorization.evaluate({ userId: actor, capabilityKey: 'REPORTING_STATEMENT_READ', requestedScope: 'SUBJECT', resourceId: subject.subjectId })).allowed) {
            return this.deny(request, 'REPORTING_STATEMENT_READ');
          }
        }
      }
    }
    const allowedActions = await this.computeAllowedActions(row as never, actor);
    return presentReportingStatementDetail(row as never, allowedActions);
  }

  private async computeAllowedActions(
    row: { series: { submitterUserId: string }; state: { lifecycleState: State } | null },
    actorUserId: string,
  ): Promise<ReportingStatementAllowedAction[]> {
    if (!row.state || row.state.lifecycleState !== State.SUBMITTED || row.series.submitterUserId === actorUserId) {
      return [];
    }
    const keys: readonly CapabilityKey[] = ['APPROVAL_PRINCIPAL', 'APPROVAL_VICE_PRINCIPAL'];
    for (const key of keys) {
      if ((await this.authorization.evaluate({ userId: actorUserId, capabilityKey: key, requestedScope: 'SCHOOL_WIDE' })).allowed) {
        return ['APPROVE', 'REJECT'];
      }
    }
    return [];
  }

  async decide(revisionId: string, dto: DecideReportingStatementDto, request: AuthenticatedRequest, command: 'APPROVE' | 'REJECT') {
    const actor = request.auth!.user.id;
    await this.requireApproval(request);
    const type = command === 'APPROVE' ? Command.APPROVE : Command.REJECT, fp = fingerprint({ command, revisionId, expectedLifecycleToken: dto.expectedLifecycleToken });
    const prior = await this.repository.classifyAcceptedCommand(this.prisma, actor, type, dto.requestKey, fp);
    if (prior.kind === 'FINGERPRINT_CONFLICT') throw new ConflictException('requestKey được dùng với nội dung khác.');
    if (prior.kind === 'REPLAY') return this.result(prior.command, true);
    return this.retryDecision(async () => {
      await this.requireApproval(request);
      return this.prisma.$transaction(async tx => {
        const accepted = await this.repository.classifyAcceptedCommand(tx, actor, type, dto.requestKey, fp);
        if (accepted.kind === 'FINGERPRINT_CONFLICT') throw new ConflictException('requestKey được dùng với nội dung khác.');
        if (accepted.kind === 'REPLAY') return this.result(accepted.command, true);
        const row = await this.repository.loadRevision(tx, revisionId);
        if (!row || !row.state) throw new ConflictException('Statement không còn ở trạng thái có thể quyết định.');
        await this.repository.lockSeries(tx, row.seriesId);
        const target = await this.repository.loadRevision(tx, revisionId);
        if (!target?.state || target.state.lifecycleState !== State.SUBMITTED || target.state.lifecycleToken !== dto.expectedLifecycleToken) throw new ConflictException('Statement không còn ở trạng thái có thể quyết định.');
        if (target.series.submitterUserId === actor) return this.deny(request, 'APPROVAL_PRINCIPAL');
        const profile = await tx.user.findUnique({ where: { id: actor }, include: { profile: true } });
        const next = randomUUID();
        const approved = command === 'APPROVE' ? await this.repository.loadCurrentApproved(tx, target.seriesId) : null;
        if (command === 'APPROVE' && (target.supersedesRevisionId === null ? approved !== null : !approved || approved.revisionId !== target.supersedesRevisionId)) throw new ConflictException('Statement correction không nhất quán.');
        const receipt = await this.repository.createDecision(tx, { actorUserId: actor, commandType: type, requestKey: dto.requestKey, requestFingerprint: fp, seriesId: target.seriesId, targetRevisionId: revisionId, resultRevisionId: revisionId, resultLifecycleState: command === 'APPROVE' ? State.APPROVED : State.REJECTED, resultLifecycleToken: next });
        if (approved) {
          const old = randomUUID();
          const changedOld = await this.repository.transitionLifecycleCas(tx, { revisionId: approved.revisionId, seriesId: target.seriesId, expectedLifecycleState: State.APPROVED, expectedLifecycleToken: approved.lifecycleToken, nextLifecycleState: State.SUPERSEDED, nextLifecycleToken: old });
          if (!changedOld.transitioned) throw new ConflictException('Statement predecessor đã thay đổi.');
          await this.repository.appendDecisionHistory(tx, { seriesId: target.seriesId, revisionId: approved.revisionId, eventType: Event.SUPERSEDED, stateBefore: State.APPROVED, stateAfter: State.SUPERSEDED, actorUserId: actor, actorDisplayNameSnapshot: profile?.profile?.displayName ?? null, actorStaffCodeSnapshot: profile?.profile?.staffCode ?? null, commandId: receipt.id, lifecycleTokenBefore: approved.lifecycleToken, lifecycleTokenAfter: old, causedByRevisionId: revisionId });
        }
        const changed = await this.repository.transitionLifecycleCas(tx, { revisionId, seriesId: target.seriesId, expectedLifecycleState: State.SUBMITTED, expectedLifecycleToken: dto.expectedLifecycleToken, nextLifecycleState: command === 'APPROVE' ? State.APPROVED : State.REJECTED, nextLifecycleToken: next });
        if (!changed.transitioned) throw new ConflictException('Lifecycle token đã cũ.');
        await this.repository.appendDecisionHistory(tx, { seriesId: target.seriesId, revisionId, eventType: command === 'APPROVE' ? Event.APPROVED : Event.REJECTED, stateBefore: State.SUBMITTED, stateAfter: command === 'APPROVE' ? State.APPROVED : State.REJECTED, actorUserId: actor, actorDisplayNameSnapshot: profile?.profile?.displayName ?? null, actorStaffCodeSnapshot: profile?.profile?.staffCode ?? null, commandId: receipt.id, lifecycleTokenBefore: dto.expectedLifecycleToken, lifecycleTokenAfter: next });
        await this.audit.write({ actorUserId: actor, action: command === 'APPROVE' ? 'REPORTING_STATEMENT_APPROVED' : 'REPORTING_STATEMENT_REJECTED', entityType: 'ReportingStatementRevision', entityId: revisionId, requestId: requestMeta(request).requestId, result: AuditResult.SUCCESS, metadata: { commandType: command, seriesId: target.seriesId, lifecycleState: command === 'APPROVE' ? 'APPROVED' : 'REJECTED' } }, tx);
        return { revisionId, seriesId: target.seriesId, lifecycleState: command === 'APPROVE' ? State.APPROVED : State.REJECTED, lifecycleToken: next, replay: false };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    });
  }

  private async require(request: AuthenticatedRequest, key: CapabilityKey, scope: 'PERSONAL' | 'SCHOOL_WIDE') {
    const d = await this.authorization.evaluate({ userId: request.auth!.user.id, capabilityKey: key, requestedScope: scope });
    if (!d.allowed) return this.deny(request, key);
  }

  private async requireApproval(request: AuthenticatedRequest) {
    const keys: readonly CapabilityKey[] = ['APPROVAL_PRINCIPAL', 'APPROVAL_VICE_PRINCIPAL'];
    for (const key of keys) {
      if ((await this.authorization.evaluate({ userId: request.auth!.user.id, capabilityKey: key, requestedScope: 'SCHOOL_WIDE' })).allowed) return;
    }
    return this.deny(request, 'APPROVAL_PRINCIPAL');
  }

  private async deny(request: AuthenticatedRequest, key: CapabilityKey): Promise<never> {
    await this.audit.write({ actorUserId: request.auth?.user.id, action: 'AUTHORIZATION_DENIED', entityType: 'CapabilityDefinition', entityId: key, result: AuditResult.DENIED, metadata: { capabilityKey: key } });
    throw new ForbiddenException('Bạn không có quyền thực hiện thao tác này.');
  }

  private result(command: { resultRevisionId: string; seriesId: string; resultLifecycleState: State; resultLifecycleToken: string; submissionAsOfInstant: Date | null }, replay: boolean) {
    return { revisionId: command.resultRevisionId, seriesId: command.seriesId, lifecycleState: command.resultLifecycleState, lifecycleToken: command.resultLifecycleToken, asOfInstant: command.submissionAsOfInstant?.toISOString() ?? null, replay };
  }

  private async retry<T>(operation: () => Promise<T>) {
    for (let i = 0; ; i++) {
      try {
        return await operation();
      } catch (e) {
        if (i >= 2 || !this.isRetryableSubmitRace(e)) throw e;
      }
    }
  }

  private isRetryableSubmitRace(error: unknown): boolean {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
    if (error.code === 'P2034') return true;
    if (error.code !== 'P2002') return false;
    const metadata = JSON.stringify(error.meta ?? {});
    const series = metadata.includes('reporting_statement_series_logical_key') || (metadata.includes('statementProfile') && metadata.includes('submitterUserId') && metadata.includes('academicYearId') && metadata.includes('fromCivilDate') && metadata.includes('toCivilDate'));
    const command = metadata.includes('reporting_statement_commands_actor_type_request_key') || (metadata.includes('actorUserId') && metadata.includes('commandType') && metadata.includes('requestKey'));
    return series || command;
  }

  private async retryDecision<T>(operation: () => Promise<T>) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        if (attempt === 3 || !this.isRetryableDecisionRace(error)) throw error;
      }
    }
    throw new ConflictException('Xung đột đồng thời; hãy thử lại.');
  }

  private isRetryableDecisionRace(error: unknown): boolean {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
    if (error.code === 'P2034') return true;
    if (error.code !== 'P2002') return false;
    const metadata = JSON.stringify(error.meta ?? {});
    return metadata.includes('reporting_statement_commands_actor_type_request_key') || (metadata.includes('actorUserId') && metadata.includes('commandType') && metadata.includes('requestKey'));
  }
}
