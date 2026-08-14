import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TimetableReadinessService } from '../../src/timetables/timetable-readiness.service';

const evaluatedFrom = '2026-09-07';
const evaluatedTo = '2026-09-14';
const version = (overrides: Record<string, unknown> = {}) => ({
  id: 'version-1',
  academicYearId: 'year-1',
  status: 'VALIDATED',
  calendarVersionId: 'calendar-1',
  effectiveAcademicWeekId: 'week-1',
  effectiveFrom: new Date('2026-09-07Z'),
  effectiveUntil: null,
  validatedAt: new Date('2026-08-14T00:00:00Z'),
  validatedByUserId: 'actor',
  entries: [
    { id: 'entry-b', weekday: 'MONDAY', schoolClassId: 'class-1', subjectId: 'subject-1' },
    { id: 'entry-a', weekday: 'MONDAY', schoolClassId: 'class-1', subjectId: 'subject-1' },
  ],
  ...overrides,
});
const calendar = (overrides: Record<string, unknown> = {}) => ({
  id: 'calendar-1',
  academicYearId: 'year-1',
  endDate: new Date('2027-05-31Z'),
  teachingWeekdays: ['MONDAY'],
  weeks: [
    { id: 'week-1', segments: [{ startDate: new Date('2026-09-07Z'), endDate: new Date('2026-09-07Z'), segmentOrder: 1 }] },
    { id: 'week-2', segments: [{ startDate: new Date('2026-09-14Z'), endDate: new Date('2026-09-14Z'), segmentOrder: 1 }] },
  ],
  ...overrides,
});
const association = (overrides: Record<string, unknown> = {}) => ({
  id: 'association-1',
  academicYearId: 'year-1',
  schoolClassId: 'class-1',
  subjectId: 'subject-1',
  ppctPlanId: 'plan-1',
  ppctVersionId: 'ppct-version-1',
  ppctVersionStatus: 'PUBLISHED',
  effectiveFrom: new Date('2026-09-01Z'),
  effectiveUntil: null,
  ...overrides,
});

function harness(options: {
  version?: ReturnType<typeof version> | null;
  calendar?: ReturnType<typeof calendar> | null;
  associations?: Array<ReturnType<typeof association>>;
} = {}) {
  const tx = {
    timetableVersion: { findUnique: jest.fn().mockResolvedValue(options.version === undefined ? version() : options.version) },
    academicCalendarVersion: { findUnique: jest.fn().mockResolvedValue(options.calendar === undefined ? calendar() : options.calendar) },
  };
  const prisma = {
    $transaction: jest.fn((callback: (client: typeof tx) => unknown, _transactionOptions: unknown) => callback(tx)),
  };
  const associationRead = {
    findOverlappingRange: jest.fn().mockResolvedValue(options.associations ?? [association()]),
  };
  return {
    service: new TimetableReadinessService(prisma as never, associationRead as never),
    prisma,
    tx,
    associationRead,
  };
}

describe('TimetableReadinessService', () => {
  it('rejects DRAFT as not assessable and never fabricates a result (A1)', async () => {
    const { service } = harness({ version: version({ status: 'DRAFT' }) });
    await expect(service.evaluate('version-1', { from: evaluatedFrom, to: evaluatedTo }))
      .rejects.toBeInstanceOf(ConflictException);
  });

  it.each([
    ['from after to', '2026-09-15', '2026-09-14'],
    ['from before timetable effectivity', '2026-09-06', '2026-09-14'],
  ])('rejects an invalid explicit range: %s', async (_label, from, to) => {
    const { service } = harness();
    await expect(service.evaluate('version-1', { from, to })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects ranges beyond the exact retained calendar or bounded timetable', async () => {
    const bounded = version({ effectiveUntil: new Date('2026-09-14Z') });
    const { service } = harness({ version: bounded });
    await expect(service.evaluate('version-1', { from: evaluatedFrom, to: '2026-09-15' }))
      .rejects.toBeInstanceOf(BadRequestException);
    const beyondCalendar = harness({ calendar: calendar({ endDate: new Date('2026-09-13Z') }) });
    await expect(beyondCalendar.service.evaluate('version-1', { from: evaluatedFrom, to: evaluatedTo }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it.each([
    ['VALIDATED', null],
    ['APPROVED', null],
    ['ACTIVE', null],
    ['SUPERSEDED', new Date('2026-09-14Z')],
  ])('assesses immutable %s lifecycle evidence for its explicit retained interval (A2-A4)', async (status, effectiveUntil) => {
    const { service } = harness({ version: version({ status, effectiveUntil }) });
    await expect(service.evaluate('version-1', { from: evaluatedFrom, to: evaluatedTo }))
      .resolves.toMatchObject({ result: 'PASS' });
  });

  it('returns deterministic PASS, exact provenance, and visible NOT_ASSESSED dimensions (A2, A3, A5, A12, A13)', async () => {
    const { service, prisma, associationRead } = harness();
    const result = await service.evaluate('version-1', { from: evaluatedFrom, to: evaluatedTo });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    });
    expect(associationRead.findOverlappingRange).toHaveBeenCalledWith(
      expect.anything(),
      [{ academicYearId: 'year-1', schoolClassId: 'class-1', subjectId: 'subject-1' }],
      new Date('2026-09-07Z'),
      new Date('2026-09-14Z'),
    );
    expect(result).toMatchObject({
      profile: 'NORMAL_BASE_PPCT_V1',
      productLabel: 'TIMETABLE READINESS — NORMAL BASE + PPCT BINDING',
      result: 'PASS',
      scope: { affectedStreams: [{ schoolClassId: 'class-1', subjectId: 'subject-1' }] },
      provenance: {
        timetableVersionId: 'version-1', academicCalendarVersionId: 'calendar-1',
        ppctClassAssociationIds: ['association-1'], ppctVersionIds: ['ppct-version-1'],
      },
    });
    expect(result.findings).toEqual([]);
    expect(result.dimensions).toEqual([
      { key: 'NORMAL_BASE_TIMETABLE_FOUNDATION', state: 'PASS', required: true },
      { key: 'PPCT_ASSOCIATION_BINDING', state: 'PASS', required: true },
      { key: 'PPCT_CAPACITY', state: 'NOT_ASSESSED', required: false },
      { key: 'OPERATIONAL_OVERLAYS', state: 'NOT_ASSESSED', required: false },
      { key: 'SUBSTITUTION_CANCELLATION_MAKEUP', state: 'NOT_ASSESSED', required: false },
      { key: 'LOCAL_OPERATIONAL_EXCEPTIONS', state: 'NOT_ASSESSED', required: false },
      { key: 'SPECIAL_ACTIVITY_COLLISIONS', state: 'NOT_ASSESSED', required: false },
      { key: 'RESOLVED_OCCURRENCE_EXECUTION', state: 'NOT_ASSESSED', required: false },
      { key: 'PROGRESS_DEBT_REPORTING', state: 'NOT_ASSESSED', required: false },
    ]);
  });

  it('groups duplicate entries by stream/date and emits one sorted missing-binding blocker (A6)', async () => {
    const { service } = harness({ associations: [] });
    const result = await service.evaluate('version-1', { from: evaluatedFrom, to: evaluatedFrom });
    expect(result.result).toBe('FAIL');
    expect(result.findings).toEqual([expect.objectContaining({
      code: 'PPCT_ASSOCIATION_MISSING', severity: 'BLOCKER', date: evaluatedFrom,
      timetableEntryIds: ['entry-a', 'entry-b'],
    })]);
    expect(result.dimensions[1]).toEqual({ key: 'PPCT_ASSOCIATION_BINDING', state: 'FAIL', required: true });
  });

  it('accepts a deterministic mid-range switch and historical SUPERSEDED PPCT identity (A7, A8)', async () => {
    const { service } = harness({ associations: [
      association({ id: 'association-b', ppctVersionId: 'version-b', ppctVersionStatus: 'SUPERSEDED', effectiveUntil: new Date('2026-09-07Z') }),
      association({ id: 'association-a', ppctVersionId: 'version-a', effectiveFrom: new Date('2026-09-08Z') }),
    ] });
    const result = await service.evaluate('version-1', { from: evaluatedFrom, to: evaluatedTo });
    expect(result.result).toBe('PASS');
    expect(result.provenance).toMatchObject({
      ppctClassAssociationIds: ['association-a', 'association-b'],
      ppctVersionIds: ['version-a', 'version-b'],
    });
  });

  it('fails closed instead of selecting an ambiguous historical binding', async () => {
    const { service } = harness({ associations: [association({ id: 'association-a' }), association({ id: 'association-b' })] });
    const result = await service.evaluate('version-1', { from: evaluatedFrom, to: evaluatedFrom });
    expect(result).toMatchObject({ result: 'FAIL' });
    expect(result.findings).toEqual([expect.objectContaining({ code: 'PPCT_ASSOCIATION_AMBIGUOUS', severity: 'BLOCKER' })]);
  });

  it('fails closed when retained association integrity unexpectedly targets a DRAFT PPCT version', async () => {
    const { service } = harness({ associations: [association({ ppctVersionStatus: 'DRAFT' })] });
    const result = await service.evaluate('version-1', { from: evaluatedFrom, to: evaluatedFrom });
    expect(result).toMatchObject({ result: 'FAIL' });
    expect(result.findings).toEqual([expect.objectContaining({
      code: 'PPCT_ASSOCIATION_INVALID_TARGET',
      ppctClassAssociationId: 'association-1',
      ppctVersionId: 'ppct-version-1',
    })]);
  });

  it('requires no PPCT association where exact calendar segments create no opportunity (A9, A10, A11)', async () => {
    const noMonday = calendar({
      weeks: [{ id: 'week-1', segments: [{ startDate: new Date('2026-09-08Z'), endDate: new Date('2026-09-08Z'), segmentOrder: 1 }] }],
    });
    const retainedTarget = version({ effectiveFrom: new Date('2026-09-08Z') });
    const { service, associationRead } = harness({ version: retainedTarget, calendar: noMonday, associations: [] });
    const result = await service.evaluate('version-1', { from: '2026-09-08', to: '2026-09-08' });
    expect(result.result).toBe('PASS');
    expect(result.scope.affectedStreams).toEqual([]);
    expect(result.provenance.ppctClassAssociationIds).toEqual([]);
    expect(associationRead.findOverlappingRange).toHaveBeenCalledWith(expect.anything(), [], expect.any(Date), expect.any(Date));
  });

  it('fails closed for retained foundation corruption without rechecking mutable master data', async () => {
    const { service, tx } = harness({ version: version({ validatedAt: null, validatedByUserId: null }) });
    const result = await service.evaluate('version-1', { from: evaluatedFrom, to: evaluatedFrom });
    expect(result).toMatchObject({ result: 'FAIL', dimensions: [
      { key: 'NORMAL_BASE_TIMETABLE_FOUNDATION', state: 'FAIL', required: true },
      expect.anything(),
      ...Array(7).fill(expect.anything()),
    ] });
    expect(result.findings.map((finding) => finding.code)).toContain('TIMETABLE_VALIDATION_EVIDENCE_MISSING');
    expect(tx).not.toHaveProperty('user');
    expect(tx).not.toHaveProperty('schoolClass');
    expect(tx).not.toHaveProperty('subject');
  });

  it('recomputes each request and does not mutate the prior response (A14)', async () => {
    const { service, associationRead } = harness();
    const first = await service.evaluate('version-1', { from: evaluatedFrom, to: evaluatedFrom });
    associationRead.findOverlappingRange.mockResolvedValueOnce([]);
    const second = await service.evaluate('version-1', { from: evaluatedFrom, to: evaluatedFrom });
    expect(first.result).toBe('PASS');
    expect(first.findings).toEqual([]);
    expect(second.result).toBe('FAIL');
    expect(associationRead.findOverlappingRange).toHaveBeenCalledTimes(2);
  });
});
