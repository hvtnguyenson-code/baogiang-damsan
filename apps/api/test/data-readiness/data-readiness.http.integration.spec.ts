import { ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataReadinessController } from '../../src/data-readiness/data-readiness.controller';
import { DataReadinessService } from '../../src/data-readiness/data-readiness.service';
import { SessionAuthGuard } from '../../src/auth/session-auth.guard';
import { PrismaService } from '../../src/prisma/prisma.service';
import { CapabilityAuthorizationService } from '../../src/authorization/capability-authorization.service';
import { BusinessConfigurationService } from '../../src/business-configuration/business-configuration.service';
import { BUSINESS_POLICY_REGISTRY, PRODUCTION_BUSINESS_POLICY_FAMILIES } from '../../src/business-configuration/business-policy-registry';
import { AuditService } from '../../src/audit/audit.service';

// HTTP/controller/readiness/policy-resolver integration with a mocked persistence
// adapter. PostgreSQL constraints and actual sessions are tested in the sibling suite.
describe('Data readiness HTTP + authoritative policy resolver (mocked persistence)', () => {
  let app: INestApplication;
  let db: Record<string, Record<string, jest.Mock>>;
  const from = new Date('2026-09-01');
  const until = new Date('2027-06-01');

  beforeEach(async () => {
    db = {
      user: { findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE', lockedUntil: null }) },
      academicYear: { findMany: jest.fn().mockResolvedValue([{ id: '00000000-0000-4000-8000-000000000001', code: '2026', name: 'Year' }]) },
      timetableVersion: { findMany: jest.fn().mockResolvedValue([]) },
      academicCalendarVersion: { findFirst: jest.fn().mockResolvedValue({ startDate: from, endDate: until }) },
      timeSlotDefinition: { count: jest.fn().mockResolvedValue(10) },
      teachingAssignment: { findMany: jest.fn().mockResolvedValue([]) },
      ppctPlan: { findMany: jest.fn().mockResolvedValue([]) },
      ppctClassAssociation: { findMany: jest.fn().mockResolvedValue([]) },
      businessPolicyStream: { findFirst: jest.fn().mockResolvedValue({ id: 'stream' }) },
      businessPolicyVersion: { findMany: jest.fn().mockResolvedValue([]) },
      historicalTeachingImportBatch: { findMany: jest.fn().mockResolvedValue([]) },
      curricularTeachingExecution: { count: jest.fn().mockResolvedValue(0) },
      programmeMaster: { findMany: jest.fn().mockResolvedValue([]) },
      programmePlanVersion: { findMany: jest.fn().mockResolvedValue([]) },
      plannedProgrammeOccurrence: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const module = await Test.createTestingModule({
      controllers: [DataReadinessController],
      providers: [DataReadinessService, BusinessConfigurationService,
        { provide: PrismaService, useValue: db },
        { provide: CapabilityAuthorizationService, useValue: { listEffectiveCapabilities: jest.fn().mockResolvedValue([{ key: 'APPROVAL_PRINCIPAL', scope: 'SCHOOL_WIDE' }]) } },
        { provide: AuditService, useValue: {} },
        { provide: BUSINESS_POLICY_REGISTRY, useValue: PRODUCTION_BUSINESS_POLICY_FAMILIES },
      ],
    }).overrideGuard(SessionAuthGuard).useValue({ canActivate(context: ExecutionContext) {
      context.switchToHttp().getRequest().auth = { user: { id: 'principal', mustChangePassword: false } };
      return true;
    } }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });
  afterEach(async () => app?.close());
  function policy(date = '2026-09-01') {
    return { id: 'policy', streamId: 'stream', validatorVersion: 'v1', payload: { operationalStartDate: date }, effectiveFrom: new Date('2026-01-01'), effectiveUntil: null };
  }
  async function domain(key: string) {
    const res = await request(app.getHttpServer()).get('/api/data-readiness/summary?academicYearId=00000000-0000-4000-8000-000000000001');
    expect(res.status).toBe(200);
    expect(res.body.overallStatus).not.toBe('READY');
    return res.body.domains.find((item: { key: string }) => item.key === key);
  }
  it('rejects an explicit unknown year through HTTP', async () => {
    expect((await request(app.getHttpServer()).get('/api/data-readiness/summary?academicYearId=unknown')).status).toBe(404);
  });
  it.each(['missing', 'ambiguous', 'corrupt', 'calendar'])('history fails closed with %s evidence', async (problem) => {
    if (problem === 'missing') db.businessPolicyStream.findFirst.mockResolvedValue(null);
    if (problem === 'ambiguous') db.businessPolicyVersion.findMany.mockResolvedValue([policy(), policy()]);
    if (problem === 'corrupt') db.businessPolicyVersion.findMany.mockResolvedValue([policy('2026-02-30')]);
    if (problem === 'calendar') {
      db.businessPolicyVersion.findMany.mockResolvedValue([policy()]);
      db.academicCalendarVersion.findFirst.mockResolvedValue(null);
    }
    const item = await domain('HISTORICAL_TEACHING');
    expect(item.status).toBe('NOT_READY');
    expect(item.findings).toHaveLength(1);
    expect(item.findings[0].code).toBe({ missing: 'POLICY_NOT_CONFIGURED', ambiguous: 'POLICY_AMBIGUOUS', corrupt: 'POLICY_CORRUPT', calendar: 'HISTORY_CALENDAR_INVALID' }[problem]);
  });
  it('preserves valid day-one READY and queries date-effective policy authority', async () => {
    db.businessPolicyVersion.findMany.mockResolvedValue([policy()]);
    expect((await domain('HISTORICAL_TEACHING')).status).toBe('READY');
    expect(db.businessPolicyVersion.findMany).toHaveBeenCalledWith({ where: expect.objectContaining({ status: 'PUBLISHED', effectiveFrom: { lte: expect.any(Date) }, OR: expect.any(Array) }) });
  });
  it('does not turn delayed history receipts into reconciled READY', async () => {
    db.businessPolicyVersion.findMany.mockResolvedValue([policy('2026-10-01')]);
    db.historicalTeachingImportBatch.findMany.mockResolvedValue([{ id: 'batch', createdAt: new Date(), _count: { rows: 1 } }]);
    expect((await domain('HISTORICAL_TEACHING')).status).toBe('ATTENTION_REQUIRED');
  });
  it.each(['GDDP', 'HDTN_HN'] as const)('%s does not accept a master without a published plan', async (kind) => {
    db.programmeMaster.findMany.mockImplementation(async ({ where }: { where: { kind: string } }) => where.kind === kind ? [10, 11, 12].map((gradeLevel) => ({ id: `m${gradeLevel}`, gradeLevel })) : []);
    db.programmePlanVersion.findMany.mockResolvedValue([{ programmeMasterId: 'm10', versionNumber: 1, status: 'PUBLISHED', updatedAt: new Date() }]);
    expect((await domain(kind)).status).toBe('NOT_READY');
  });
  it('PPCT requires issued versions and actual required grade coverage', async () => {
    db.ppctPlan.findMany.mockResolvedValue([{ id: 'p', subjectId: 'math', gradeLevel: 10, versions: [] }]);
    db.teachingAssignment.findMany.mockResolvedValue([{ subjectId: 'math', schoolClassId: 'class', schoolClass: { gradeLevel: 11 }, validFrom: from, validUntil: until }]);
    const item = await domain('PPCT');
    expect(item.status).toBe('NOT_READY');
    expect(item.stats).toMatchObject({ unissuedCount: 1, missingSubjectCount: 1 });
  });
  it('TKB ACTIVE is not authoritative range readiness', async () => {
    db.timetableVersion.findMany.mockResolvedValue([{ id: 'tkb', status: 'ACTIVE', versionNumber: 1, _count: { entries: 10 } }]);
    expect((await domain('TKB')).status).toBe('NOT_ASSESSED');
  });
});
