import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AuditResult, Prisma } from '@prisma/client';
import { BusinessConfigurationResource, BusinessPolicyResolution } from '@baogiang/contracts';
import { createHash } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { RequestMeta } from '../auth/auth.types';
import { formatCivilDate, hcmCivilDate, isCivilDate } from '../common/validation/civil-date';
import { PrismaService } from '../prisma/prisma.service';

import {
  BUSINESS_POLICY_REGISTRY,
  BusinessPolicyFamilyDefinition,
  currentValidator,
  familyFor,
  validateResource,
  validatorForVersion,
} from './business-policy-registry';
import { CreateBusinessPolicyDraftDto, EditBusinessPolicyDraftDto, LifecycleBusinessPolicyDto } from './dto';

const conflict = () => new ConflictException('BUSINESS_POLICY_CONFLICT');
type Db = Prisma.TransactionClient | PrismaService;

@Injectable()
export class BusinessConfigurationService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, @Inject(BUSINESS_POLICY_REGISTRY) private readonly families: readonly BusinessPolicyFamilyDefinition[]) {}
  familiesList() { return this.families.map(({ validators: _validators, ...family }) => family); }

  async list(page = 1, pageSize = 25) { const [items, total] = await this.prisma.$transaction([this.prisma.businessPolicyStream.findMany({ include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } }, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }), this.prisma.businessPolicyStream.count()]); return { items, page, pageSize, total }; }
  async get(streamId: string) { const stream = await this.prisma.businessPolicyStream.findUnique({ where: { id: streamId }, include: { versions: { orderBy: { versionNumber: 'asc' } } } }); if (!stream) throw new NotFoundException('Không tìm thấy policy stream.'); return stream; }

  async createDraft(dto: CreateBusinessPolicyDraftDto, actor: string, meta: RequestMeta) {
    return this.mutate(actor, dto.commandId, dto, async (tx) => {
      const family = this.family(dto.family);
      const resource = this.resource(dto.resource);
      validateResource(family, resource);
      const validator = currentValidator(family);
      const payload = validator.validate(dto.payload);
      const dates = this.dates(dto.effectiveFrom, dto.effectiveUntil);
      if (resource.kind === 'ACADEMIC_YEAR' && !await tx.academicYear.findUnique({ where: { id: resource.academicYearId }, select: { id: true } })) throw new BadRequestException('INVALID_POLICY_RESOURCE');
      let stream = await tx.businessPolicyStream.findFirst({ where: { familyKey: family.key, resourceKind: resource.kind, academicYearId: resource.kind === 'ACADEMIC_YEAR' ? resource.academicYearId : null } });
      if (!stream) stream = await tx.businessPolicyStream.create({ data: { familyKey: family.key, resourceKind: resource.kind, academicYearId: resource.kind === 'ACADEMIC_YEAR' ? resource.academicYearId : null } });
      const last = await tx.businessPolicyVersion.aggregate({ where: { streamId: stream.id }, _max: { versionNumber: true } });
      const version = await tx.businessPolicyVersion.create({
        data: {
          streamId: stream.id,
          versionNumber: (last._max.versionNumber ?? 0) + 1,
          payload: payload as Prisma.InputJsonValue,
          validatorVersion: validator.version,
          effectiveFrom: this.date(dates.from),
          effectiveUntil: dates.until ? this.date(dates.until) : null,
          createdByUserId: actor,
        },
      });
      await this.successAudit(tx, actor, meta, 'BUSINESS_POLICY_DRAFT_CREATED', version.id, {
        family: family.key,
        resource,
        versionId: version.id,
        effectiveFrom: dates.from,
        effectiveUntil: dates.until,
        validatorVersion: validator.version,
        commandId: dto.commandId,
        payloadFingerprint: this.fingerprint(payload),
      });
      return { outcome: 'CREATED', streamId: stream.id, versionId: version.id };
    });
  }

  async editDraft(id: string, dto: EditBusinessPolicyDraftDto, actor: string, meta: RequestMeta) {
    return this.mutate(actor, dto.commandId, dto, async (tx) => {
      const current = await tx.businessPolicyVersion.findUnique({ where: { id }, include: { stream: true } });
      if (!current) throw new NotFoundException('Không tìm thấy policy version.');
      if (current.status !== 'DRAFT' || current.draftRevision !== dto.expectedRevision) throw conflict();
      const family = this.family(current.stream.familyKey);
      const validator = validatorForVersion(family, current.validatorVersion);
      if (!validator) throw new BadRequestException('POLICY_CORRUPT');
      const payload = validator.validate(dto.payload);
      const updated = await tx.businessPolicyVersion.updateMany({
        where: { id, status: 'DRAFT', draftRevision: dto.expectedRevision },
        data: { payload: payload as Prisma.InputJsonValue, draftRevision: { increment: 1 } },
      });
      if (updated.count !== 1) throw conflict();
      const resultingRevision = current.draftRevision + 1;
      await this.successAudit(tx, actor, meta, 'BUSINESS_POLICY_DRAFT_EDITED', id, {
        family: family.key,
        resource: this.streamResource(current.stream),
        versionId: id,
        effectiveFrom: this.format(current.effectiveFrom),
        effectiveUntil: current.effectiveUntil ? this.format(current.effectiveUntil) : null,
        validatorVersion: current.validatorVersion,
        commandId: dto.commandId,
        payloadFingerprint: this.fingerprint(payload),
        draftRevision: resultingRevision,
      });
      return { outcome: 'UPDATED', versionId: id };
    });
  }

  async publish(id: string, dto: LifecycleBusinessPolicyDto, actor: string, meta: RequestMeta) {
    return this.mutate(actor, dto.commandId, dto, async (tx) => {
      const row = await tx.businessPolicyVersion.findUnique({ where: { id }, include: { stream: true } });
      if (!row) throw new NotFoundException('Không tìm thấy policy version.');
      const family = this.family(row.stream.familyKey);
      if (!family.publicationEnabled) throw new BadRequestException('POLICY_FAMILY_PUBLICATION_DISABLED');
      const resource = this.streamResource(row.stream);
      validateResource(family, resource);
      const validator = validatorForVersion(family, row.validatorVersion);
      if (!validator) throw new BadRequestException('POLICY_CORRUPT');
      const validatedPayload = validator.validate(row.payload);
      if (row.status !== 'DRAFT') throw conflict();
      if (family.key === 'OPERATIONAL_START') {
        if (resource.kind !== 'ACADEMIC_YEAR') throw new BadRequestException('INVALID_POLICY_RESOURCE');
        const calendar = await this.requireActiveCalendar(tx, resource.academicYearId);
        const payload = validatedPayload as { operationalStartDate: string };
        const calStart = formatCivilDate(calendar.startDate);
        const calEnd = formatCivilDate(calendar.endDate);
        if (payload.operationalStartDate < calStart || payload.operationalStartDate > calEnd) {
          throw new BadRequestException('OPERATIONAL_START_DATE_OUTSIDE_CALENDAR');
        }
        const effectiveFrom = this.format(row.effectiveFrom);
        if (effectiveFrom > payload.operationalStartDate) {
          throw new BadRequestException('OPERATIONAL_START_INITIAL_PUBLICATION_INVALID');
        }
      }
      const updated = await tx.businessPolicyVersion.updateMany({

        where: { id, status: 'DRAFT' },
        data: { status: 'PUBLISHED', publishedByUserId: actor, publishedAt: new Date() },
      });
      if (updated.count !== 1) throw conflict();
      await this.successAudit(tx, actor, meta, 'BUSINESS_POLICY_PUBLISHED', id, {
        family: family.key,
        resource,
        versionId: id,
        effectiveFrom: this.format(row.effectiveFrom),
        effectiveUntil: row.effectiveUntil ? this.format(row.effectiveUntil) : null,
        validatorVersion: row.validatorVersion,
        commandId: dto.commandId,
      });
      return { outcome: 'PUBLISHED', versionId: id };
    });
  }

  async replace(id: string, dto: LifecycleBusinessPolicyDto, actor: string, meta: RequestMeta) {
    return this.mutate(actor, dto.commandId, dto, async (tx) => {
      const source = await tx.businessPolicyVersion.findUnique({ where: { id }, include: { stream: true } });
      if (!source || source.status !== 'PUBLISHED' || source.effectiveUntil !== null) throw conflict();
      const family = this.family(source.stream.familyKey);
      if (!family.publicationEnabled || !dto.effectiveFrom || !dto.payload) throw new BadRequestException('INVALID_POLICY_REPLACEMENT');
      const from = this.dates(dto.effectiveFrom).from;
      if (from <= this.businessDate() || from <= this.format(source.effectiveFrom)) throw new BadRequestException('INVALID_POLICY_REPLACEMENT');
      const validator = currentValidator(family);
      const payload = validator.validate(dto.payload);
      const nextNumber = (await tx.businessPolicyVersion.aggregate({ where: { streamId: source.streamId }, _max: { versionNumber: true } }))._max.versionNumber! + 1;
      const previousUntil = this.previousDate(from);
      const close = await tx.businessPolicyVersion.updateMany({ where: { id, status: 'PUBLISHED', effectiveUntil: null }, data: { effectiveUntil: this.date(previousUntil) } });
      if (close.count !== 1) throw conflict();
      const replacement = await tx.businessPolicyVersion.create({
        data: {
          streamId: source.streamId,
          versionNumber: nextNumber,
          status: 'PUBLISHED',
          payload: payload as Prisma.InputJsonValue,
          validatorVersion: validator.version,
          effectiveFrom: this.date(from),
          effectiveUntil: null,
          createdByUserId: actor,
          publishedByUserId: actor,
          publishedAt: new Date(),
          replacesVersionId: source.id,
        },
      });
      await this.successAudit(tx, actor, meta, 'BUSINESS_POLICY_REPLACED', source.id, {
        family: family.key,
        resource: this.streamResource(source.stream),
        sourceVersionId: source.id,
        replacementVersionId: replacement.id,
        sourceEffectiveFrom: this.format(source.effectiveFrom),
        sourceEffectiveUntilBefore: null,
        sourceEffectiveUntilAfter: previousUntil,
        replacementEffectiveFrom: from,
        replacementEffectiveUntil: null,
        validatorVersion: validator.version,
        replacesVersionId: source.id,
        commandId: dto.commandId,
        payloadFingerprint: this.fingerprint(payload),
      });
      return { outcome: 'REPLACED', versionId: replacement.id };
    });
  }

  async retire(id: string, dto: LifecycleBusinessPolicyDto, actor: string, meta: RequestMeta) {
    return this.mutate(actor, dto.commandId, dto, async (tx) => {
      const row = await tx.businessPolicyVersion.findUnique({ where: { id }, include: { stream: true } });
      if (!row || row.status !== 'PUBLISHED' || row.effectiveUntil !== null || !dto.effectiveUntil) throw conflict();
      const until = this.dates(this.format(row.effectiveFrom), dto.effectiveUntil).until!;
      if (until < this.businessDate()) throw conflict();
      const updated = await tx.businessPolicyVersion.updateMany({ where: { id, status: 'PUBLISHED', effectiveUntil: null }, data: { effectiveUntil: this.date(until) } });
      if (updated.count !== 1) throw conflict();
      const family = this.family(row.stream.familyKey);
      await this.successAudit(tx, actor, meta, 'BUSINESS_POLICY_RETIRED', id, {
        family: family.key,
        resource: this.streamResource(row.stream),
        versionId: id,
        effectiveFrom: this.format(row.effectiveFrom),
        effectiveUntilBefore: null,
        effectiveUntilAfter: until,
        reason: dto.reason?.trim() || null,
        commandId: dto.commandId,
      });
      return { outcome: 'RETIRED', versionId: id };
    });
  }

  async correct(id: string, dto: LifecycleBusinessPolicyDto, actor: string, meta: RequestMeta) {
    return this.mutate(actor, dto.commandId, dto, async (tx) => {
      if (!dto.reason?.trim() || !dto.payload) throw new BadRequestException('CORRECTION_REASON_REQUIRED');
      const source = await tx.businessPolicyVersion.findUnique({ where: { id }, include: { stream: true } });
      if (!source || source.status !== 'PUBLISHED') throw conflict();
      const family = this.family(source.stream.familyKey);
      if (!family.publicationEnabled) throw new BadRequestException('POLICY_FAMILY_PUBLICATION_DISABLED');
      const validator = currentValidator(family);
      const payload = validator.validate(dto.payload);
      const dates = dto.effectiveFrom
        ? this.dates(dto.effectiveFrom, dto.effectiveUntil)
        : { from: this.format(source.effectiveFrom), until: source.effectiveUntil ? this.format(source.effectiveUntil) : null };
      const nextNumber = (await tx.businessPolicyVersion.aggregate({ where: { streamId: source.streamId }, _max: { versionNumber: true } }))._max.versionNumber! + 1;
      const changed = await tx.businessPolicyVersion.updateMany({
        where: { id, status: 'PUBLISHED' },
        data: { status: 'REVERSED', reversedByUserId: actor, reversedAt: new Date(), correctionReason: dto.reason.trim() },
      });
      if (changed.count !== 1) throw conflict();
      const corrected = await tx.businessPolicyVersion.create({
        data: {
          streamId: source.streamId,
          versionNumber: nextNumber,
          status: 'PUBLISHED',
          payload: payload as Prisma.InputJsonValue,
          validatorVersion: validator.version,
          effectiveFrom: this.date(dates.from),
          effectiveUntil: dates.until ? this.date(dates.until) : null,
          createdByUserId: actor,
          publishedByUserId: actor,
          publishedAt: new Date(),
          correctsVersionId: source.id,
        },
      });
      await this.successAudit(tx, actor, meta, 'BUSINESS_POLICY_CORRECTED', id, {
        family: family.key,
        resource: this.streamResource(source.stream),
        sourceVersionId: source.id,
        sourceEffectiveFrom: this.format(source.effectiveFrom),
        sourceEffectiveUntil: source.effectiveUntil ? this.format(source.effectiveUntil) : null,
        correctedVersionId: corrected.id,
        correctedEffectiveFrom: dates.from,
        correctedEffectiveUntil: dates.until,
        validatorVersion: validator.version,
        correctsVersionId: source.id,
        reason: dto.reason.trim(),
        commandId: dto.commandId,
        payloadFingerprint: this.fingerprint(payload),
      });
      return { outcome: 'CORRECTED', versionId: corrected.id };
    });
  }

  async resolveEffectiveBusinessPolicy(familyKey: string, resource: BusinessConfigurationResource, civilDate: string, db: Db = this.prisma): Promise<BusinessPolicyResolution> {
    if (!isCivilDate(civilDate)) return { outcome: 'INVALID_EFFECTIVE_DATE', family: familyKey, resource, requestedCivilDate: civilDate as never };
    const family = familyFor(this.families, familyKey);
    if (!family) return { outcome: 'UNKNOWN_POLICY_FAMILY', family: familyKey, resource, requestedCivilDate: civilDate as never };
    try { validateResource(family, resource); } catch { return { outcome: 'INVALID_POLICY_RESOURCE', family: familyKey, resource, requestedCivilDate: civilDate as never }; }
    const stream = await db.businessPolicyStream.findFirst({ where: { familyKey, resourceKind: resource.kind, academicYearId: resource.kind === 'ACADEMIC_YEAR' ? resource.academicYearId : null } });
    if (!stream) return { outcome: 'POLICY_NOT_CONFIGURED', family: familyKey, resource, requestedCivilDate: civilDate as never };
    const rows = await db.businessPolicyVersion.findMany({ where: { streamId: stream.id, status: 'PUBLISHED', effectiveFrom: { lte: this.date(civilDate) }, OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: this.date(civilDate) } }] } });
    if (rows.length === 0) return { outcome: 'POLICY_NOT_CONFIGURED', family: familyKey, resource, requestedCivilDate: civilDate as never };
    if (rows.length !== 1) return { outcome: 'POLICY_AMBIGUOUS', family: familyKey, resource, requestedCivilDate: civilDate as never };
    const row = rows[0];
    try {
      const validator = validatorForVersion(family, row.validatorVersion);
      if (!validator) throw new Error('UNKNOWN_VALIDATOR_VERSION');
      const payload = validator.validate(row.payload);
      if (row.replacesVersionId) {
        const ancestor = await db.businessPolicyVersion.findUnique({ where: { id: row.replacesVersionId } });
        if (!ancestor || ancestor.streamId !== row.streamId || ancestor.effectiveUntil === null || ancestor.effectiveUntil >= row.effectiveFrom) {
          throw new Error('CORRUPT_REPLACEMENT_LINEAGE');
        }
      }
      if (row.correctsVersionId) {
        const ancestor = await db.businessPolicyVersion.findUnique({ where: { id: row.correctsVersionId } });
        if (!ancestor || ancestor.streamId !== row.streamId || ancestor.status !== 'REVERSED') {
          throw new Error('CORRUPT_CORRECTION_LINEAGE');
        }
      }
      return { outcome: 'RESOLVED', family: familyKey, resource, requestedCivilDate: civilDate as never, policyVersionId: row.id, validatorVersion: row.validatorVersion, payload, effectiveFrom: this.format(row.effectiveFrom) as never, effectiveUntil: row.effectiveUntil ? this.format(row.effectiveUntil) as never : null };
    } catch {
      return { outcome: 'POLICY_CORRUPT', family: familyKey, resource, requestedCivilDate: civilDate as never };
    }
  }

  private family(key: string) { const family = familyFor(this.families, key); if (!family) throw new BadRequestException('UNKNOWN_POLICY_FAMILY'); return family; }
  private resource(resource: { kind: 'SCHOOL_WIDE' | 'ACADEMIC_YEAR'; academicYearId?: string }): BusinessConfigurationResource { if (resource.kind === 'SCHOOL_WIDE') { if (resource.academicYearId !== undefined) throw new BadRequestException('INVALID_POLICY_RESOURCE'); return { kind: 'SCHOOL_WIDE' }; } return { kind: 'ACADEMIC_YEAR', academicYearId: resource.academicYearId! }; }
  private streamResource(stream: { resourceKind: 'SCHOOL_WIDE' | 'ACADEMIC_YEAR'; academicYearId: string | null }): BusinessConfigurationResource { return stream.resourceKind === 'SCHOOL_WIDE' ? { kind: 'SCHOOL_WIDE' } : { kind: 'ACADEMIC_YEAR', academicYearId: stream.academicYearId! }; }
  private dates(from: string, until?: string) { if (!isCivilDate(from) || (until !== undefined && !isCivilDate(until)) || (until && until < from)) throw new BadRequestException('INVALID_EFFECTIVE_DATE'); return { from, until: until ?? null }; }
  private date(value: string) { return new Date(`${value}T00:00:00.000Z`); }
  private format(value: Date) { return value.toISOString().slice(0, 10); }
  businessCivilDate(): string { return hcmCivilDate(new Date()); }
  private businessDate() { return this.businessCivilDate(); }
  private async requireActiveCalendar(tx: Prisma.TransactionClient, academicYearId: string) {
    const calendars = await tx.academicCalendarVersion.findMany({
      where: { academicYearId, isActive: true },
      select: { id: true, startDate: true, endDate: true, versionNumber: true },
    });
    if (calendars.length !== 1) {
      throw new BadRequestException('ACADEMIC_CALENDAR_VERSION_INVALID');
    }
    return calendars[0]!;
  }

  private previousDate(value: string) { const date = this.date(value); date.setUTCDate(date.getUTCDate() - 1); return this.format(date); }
  private fingerprint(value: unknown) { return createHash('sha256').update(this.canonicalJson(value)).digest('hex'); }
  private canonicalJson(value: unknown): string { if (Array.isArray(value)) return `[${value.map((item) => this.canonicalJson(item)).join(',')}]`; if (value && typeof value === 'object') return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${this.canonicalJson((value as Record<string, unknown>)[key])}`).join(',')}}`; return JSON.stringify(value); }
  private async mutate<T>(actor: string, commandId: string, input: unknown, operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    const fingerprint = this.fingerprint(input);
    try {
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          return await this.prisma.$transaction(
            async (tx) => {
              const receipt = await tx.businessPolicyCommand.findUnique({
                where: { actorUserId_commandId: { actorUserId: actor, commandId } },
              });
              if (receipt) {
                if (receipt.fingerprint !== fingerprint) throw conflict();
                return receipt.result as T;
              }
              const result = await operation(tx);
              await tx.businessPolicyCommand.create({
                data: { actorUserId: actor, commandId, fingerprint, result: result as Prisma.InputJsonValue },
              });
              return result;
            },
            { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
          );
        } catch (error) {
          if (!this.isRetryableRace(error) || attempt === 3) throw error;
        }
      }
    } catch (error) {
      if (error instanceof ConflictException || error instanceof BadRequestException || error instanceof NotFoundException) throw error;
      if (this.isRetryableRace(error)) throw conflict();
      if (this.isPolicyConstraintConflict(error)) throw conflict();
      if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2003', 'P2004', 'P2034'].includes(error.code)) throw conflict();
      if (error instanceof Prisma.PrismaClientUnknownRequestError && /\b(?:40P01|40001)\b/u.test(error.message)) throw conflict();
      throw error;
    }
    throw conflict();
  }

  private isRetryableRace(error: unknown): boolean {
    if (error instanceof Prisma.PrismaClientKnownRequestError) return error.code === 'P2034';
    if (error instanceof Prisma.PrismaClientUnknownRequestError) return /\b(?:40P01|40001)\b/u.test(error.message);
    const code = (error as { code?: unknown })?.code;
    if (typeof code === 'string' && (code === '40001' || code === '40P01' || code === 'P2034')) return true;
    const message = (error as { message?: unknown })?.message;
    if (typeof message === 'string' && /\b(?:40P01|40001)\b/u.test(message)) return true;
    return false;
  }

  private isPolicyConstraintConflict(error: unknown): boolean {
    const message = (error as { message?: unknown })?.message;
    return typeof message === 'string'
      && /\b23P01\b/u.test(message)
      && /business_policy_versions_no_published_overlap/u.test(message);
  }

  private async successAudit(tx: Prisma.TransactionClient, actor: string, meta: RequestMeta, action: string, id: string, metadata: Record<string, unknown>) { await this.audit.write({ actorUserId: actor, action, entityType: 'BusinessPolicyVersion', entityId: id, requestId: meta.requestId, result: AuditResult.SUCCESS, metadata }, tx); }
}
