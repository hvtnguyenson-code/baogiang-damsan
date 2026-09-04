import { BadRequestException, ConflictException, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  classifyHomeroomResolutionRows,
  HomeroomAssignmentsService,
  HomeroomResolutionRow,
} from '../../src/homeroom-assignments/homeroom-assignments.service';

function lineage(overrides: Partial<HomeroomResolutionRow> = {}): HomeroomResolutionRow {
  return {
    id: 'assignment', academicYearId: 'year', schoolClassId: 'class', status: 'ACTIVE', replacesId: null,
    reversedByUserId: null, reversedAt: null, reversalReason: null, ...overrides,
  };
}

const activeCalendar = {
  startDate: new Date('2026-08-01T00:00:00Z'),
  endDate: new Date('2026-12-31T00:00:00Z'),
};

describe('Homeroom resolver classification', () => {
  it('returns RESOLVED, MISSING, AMBIGUOUS and a real CORRUPT branch', () => {
    const active = lineage();
    expect(classifyHomeroomResolutionRows([active], [active])).toEqual({ outcome: 'RESOLVED', assignment: active });
    expect(classifyHomeroomResolutionRows([], [])).toEqual({ outcome: 'MISSING' });
    expect(classifyHomeroomResolutionRows([active, lineage({ id: 'other' })], [active])).toEqual({ outcome: 'AMBIGUOUS' });
    const corrupt = lineage({ replacesId: 'missing-parent' });
    expect(classifyHomeroomResolutionRows([corrupt], [corrupt])).toEqual({ outcome: 'CORRUPT' });
  });

  it('accepts multiple children sharing one reversed source and rejects cycles/active parents', () => {
    const source = lineage({ id: 'source', status: 'REVERSED', reversedByUserId: 'actor', reversedAt: new Date(), reversalReason: 'fix' });
    const first = lineage({ id: 'first', replacesId: source.id });
    const second = lineage({ id: 'second', replacesId: source.id });
    expect(classifyHomeroomResolutionRows([first], [source, first, second]).outcome).toBe('RESOLVED');
    expect(classifyHomeroomResolutionRows([first], [lineage({ id: 'source' }), first]).outcome).toBe('CORRUPT');
    const cyclic = lineage({ id: 'cyclic', replacesId: 'cyclic' });
    expect(classifyHomeroomResolutionRows([cyclic], [cyclic]).outcome).toBe('CORRUPT');
  });
});

describe('Homeroom mutation transaction behavior', () => {
  const p2034 = () => new Prisma.PrismaClientKnownRequestError('serialization', { code: 'P2034', clientVersion: '5' });
  const mutation = (service: HomeroomAssignmentsService) => (
    service as unknown as { mutate: (operation: () => Promise<unknown>) => Promise<unknown> }
  ).mutate.bind(service);

  it('bounds whole SERIALIZABLE retries and maps exhaustion to deterministic 409', async () => {
    const prisma = { $transaction: jest.fn().mockRejectedValue(p2034()) };
    const service = new HomeroomAssignmentsService(prisma as never, {} as never);
    await expect(mutation(service)(jest.fn())).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
    for (const call of prisma.$transaction.mock.calls) expect(call[1]).toEqual({ isolationLevel: 'Serializable' });
  });

  it('retries a PostgreSQL deadlock and sanitizes non-conflict Prisma failures', async () => {
    const deadlock = new Prisma.PrismaClientUnknownRequestError('PostgreSQL 40P01 deadlock', { clientVersion: '5' });
    const prisma = { $transaction: jest.fn().mockRejectedValueOnce(deadlock).mockResolvedValue('ok') };
    const service = new HomeroomAssignmentsService(prisma as never, {} as never);
    await expect(mutation(service)(jest.fn())).resolves.toBe('ok');
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    prisma.$transaction.mockReset().mockRejectedValue(new Prisma.PrismaClientUnknownRequestError('secret database detail', { clientVersion: '5' }));
    await expect(mutation(service)(jest.fn())).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('writes end audit in the same transaction and records a same-end no-op', async () => {
    const row = {
      ...lineage(), teacherUserId: 'teacher', validFrom: new Date('2026-08-03T00:00:00Z'),
      validUntil: new Date('2026-08-10T00:00:00Z'), note: null, entryReason: null, createdByUserId: 'actor',
      createdAt: new Date(), updatedAt: new Date(), schoolClass: { id: 'class', code: '10A', name: '10A', gradeLevel: 10, status: 'ACTIVE' },
      teacher: { id: 'teacher', username: 'teacher', status: 'DISABLED', profile: { displayName: 'Teacher', staffCode: null, isTeachingStaff: false } },
    };
    const tx = {
      homeroomAssignment: { findUnique: jest.fn().mockResolvedValue(row), updateMany: jest.fn(), findUniqueOrThrow: jest.fn() },
      academicCalendarVersion: { findMany: jest.fn().mockResolvedValue([activeCalendar]) },
    };
    const prisma = { $transaction: jest.fn((operation: (client: typeof tx) => unknown) => operation(tx)) };
    const audit = { write: jest.fn() };
    const service = new HomeroomAssignmentsService(prisma as never, audit as never);
    await service.end('assignment', { endDate: '2026-08-10' }, 'actor', { requestId: 'end' });
    expect(tx.homeroomAssignment.updateMany).not.toHaveBeenCalled();
    expect(audit.write).toHaveBeenCalledWith(expect.objectContaining({
      action: 'HOMEROOM_ASSIGNMENT_ENDED', metadata: expect.objectContaining({ noOp: true }),
    }), tx);
    expect(tx.academicCalendarVersion.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { academicYearId: 'year', isActive: true } }));
  });

  it('rolls back an end when same-transaction audit fails', async () => {
    const row = {
      ...lineage(), teacherUserId: 'teacher', validFrom: new Date('2026-08-03T00:00:00Z'), validUntil: null,
      note: null, entryReason: null, createdByUserId: 'actor', createdAt: new Date(), updatedAt: new Date(),
      schoolClass: { id: 'class', code: '10A', name: '10A', gradeLevel: 10, status: 'ACTIVE' },
      teacher: { id: 'teacher', username: 'teacher', status: 'ACTIVE', profile: { displayName: 'Teacher', staffCode: null, isTeachingStaff: true } },
    };
    const tx = {
      homeroomAssignment: {
        findUnique: jest.fn().mockResolvedValue(row), updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ ...row, validUntil: new Date('2026-08-10T00:00:00Z') }),
      },
      academicCalendarVersion: { findMany: jest.fn().mockResolvedValue([activeCalendar]) },
    };
    const prisma = { $transaction: jest.fn(async (operation: (client: typeof tx) => unknown) => operation(tx)) };
    const failure = new Error('audit failed');
    const audit = { write: jest.fn().mockRejectedValue(failure) };
    const service = new HomeroomAssignmentsService(prisma as never, audit as never);
    await expect(service.end('assignment', { endDate: '2026-08-10' }, 'actor', { requestId: 'end' })).rejects.toBe(failure);
    expect(audit.write).toHaveBeenCalledWith(expect.anything(), tx);
  });

  it('fails closed before end mutation and audit when the source year has no active calendar', async () => {
    const row = {
      ...lineage(), teacherUserId: 'teacher', validFrom: new Date('2026-08-03T00:00:00Z'), validUntil: null,
      note: null, entryReason: null, createdByUserId: 'actor', createdAt: new Date(), updatedAt: new Date(),
      schoolClass: { id: 'class', code: '10A', name: '10A', gradeLevel: 10, status: 'ACTIVE' },
      teacher: { id: 'teacher', username: 'teacher', status: 'ACTIVE', profile: { displayName: 'Teacher', staffCode: null, isTeachingStaff: true } },
    };
    const tx = {
      homeroomAssignment: { findUnique: jest.fn().mockResolvedValue(row), updateMany: jest.fn(), findUniqueOrThrow: jest.fn() },
      academicCalendarVersion: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const prisma = { $transaction: jest.fn((operation: (client: typeof tx) => unknown) => operation(tx)) };
    const audit = { write: jest.fn() };
    const service = new HomeroomAssignmentsService(prisma as never, audit as never);
    await expect(service.end('assignment', { endDate: '2026-08-10' }, 'actor', { requestId: 'end-no-calendar' })).rejects.toBeInstanceOf(ConflictException);
    expect(tx.homeroomAssignment.updateMany).not.toHaveBeenCalled();
    expect(audit.write).not.toHaveBeenCalled();
  });

  it('rejects invalid resolver class identities instead of resolving them as MISSING', async () => {
    const prisma = {
      academicYear: { findUnique: jest.fn().mockResolvedValue({ id: 'year' }) },
      schoolClass: { findUnique: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ academicYearId: 'other-year' }) },
      homeroomAssignment: { findMany: jest.fn() },
    };
    const service = new HomeroomAssignmentsService(prisma as never, {} as never);
    await expect(service.resolve('year', 'missing-class', '2026-08-10')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.resolve('year', 'other-class', '2026-08-10')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.homeroomAssignment.findMany).not.toHaveBeenCalled();
  });

  it('rejects corrupt command lineage without mutation or success audit', async () => {
    const source = {
      ...lineage({ replacesId: 'missing-parent' }), validFrom: new Date('2026-08-03T00:00:00Z'), validUntil: null,
      replacements: [], updatedAt: new Date(), schoolClass: {}, teacher: {},
    };
    const tx = {
      homeroomAssignment: {
        findUnique: jest.fn().mockResolvedValue(source), findMany: jest.fn().mockResolvedValue([source]),
        updateMany: jest.fn(), create: jest.fn(), findUniqueOrThrow: jest.fn(),
      },
    };
    const prisma = { $transaction: jest.fn((operation: (client: typeof tx) => unknown) => operation(tx)) };
    const audit = { write: jest.fn() };
    const service = new HomeroomAssignmentsService(prisma as never, audit as never);
    await expect(service.correct('assignment', {
      reason: 'Corrupt lineage', replacements: [{ teacherUserId: 'teacher', validFrom: '2026-08-03' }],
    }, 'actor', { requestId: 'corrupt-lineage' })).rejects.toBeInstanceOf(ConflictException);
    expect(tx.homeroomAssignment.updateMany).not.toHaveBeenCalled();
    expect(audit.write).not.toHaveBeenCalled();
  });

  it('rejects an external ACTIVE conflict before correction writes or audit', async () => {
    const source = {
      ...lineage(), validFrom: new Date('2026-09-10T00:00:00Z'), validUntil: new Date('2026-09-20T00:00:00Z'),
      replacements: [], updatedAt: new Date(), schoolClass: {}, teacher: {},
    };
    const tx = {
      homeroomAssignment: {
        findUnique: jest.fn().mockResolvedValue(source), findMany: jest.fn().mockResolvedValue([source]),
        findFirst: jest.fn().mockResolvedValue({ id: 'external-active' }), updateMany: jest.fn(), create: jest.fn(), findUniqueOrThrow: jest.fn(),
      },
      academicCalendarVersion: { findMany: jest.fn().mockResolvedValue([activeCalendar]) },
      schoolClass: { findUnique: jest.fn().mockResolvedValue({ academicYearId: 'year', status: 'ACTIVE' }) },
      user: { findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE', profile: { isTeachingStaff: true } }) },
    };
    const prisma = { $transaction: jest.fn((operation: (client: typeof tx) => unknown) => operation(tx)) };
    const audit = { write: jest.fn() };
    const service = new HomeroomAssignmentsService(prisma as never, audit as never);
    await expect(service.correct('assignment', {
      reason: 'Concurrent external conflict', replacements: [{ teacherUserId: 'teacher', validFrom: '2026-09-10', validUntil: '2026-09-20' }],
    }, 'actor', { requestId: 'external-conflict' })).rejects.toBeInstanceOf(ConflictException);
    expect(tx.homeroomAssignment.updateMany).not.toHaveBeenCalled();
    expect(audit.write).not.toHaveBeenCalled();
  });
});
