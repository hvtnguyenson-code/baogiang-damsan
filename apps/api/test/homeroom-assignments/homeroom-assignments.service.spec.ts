import { ConflictException, InternalServerErrorException } from '@nestjs/common';
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
    const tx = { homeroomAssignment: { findUnique: jest.fn().mockResolvedValue(row), updateMany: jest.fn(), findUniqueOrThrow: jest.fn() } };
    const prisma = { $transaction: jest.fn((operation: (client: typeof tx) => unknown) => operation(tx)) };
    const audit = { write: jest.fn() };
    const service = new HomeroomAssignmentsService(prisma as never, audit as never);
    await service.end('assignment', { endDate: '2026-08-10' }, 'actor', { requestId: 'end' });
    expect(tx.homeroomAssignment.updateMany).not.toHaveBeenCalled();
    expect(audit.write).toHaveBeenCalledWith(expect.objectContaining({
      action: 'HOMEROOM_ASSIGNMENT_ENDED', metadata: expect.objectContaining({ noOp: true }),
    }), tx);
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
    };
    const prisma = { $transaction: jest.fn(async (operation: (client: typeof tx) => unknown) => operation(tx)) };
    const failure = new Error('audit failed');
    const audit = { write: jest.fn().mockRejectedValue(failure) };
    const service = new HomeroomAssignmentsService(prisma as never, audit as never);
    await expect(service.end('assignment', { endDate: '2026-08-10' }, 'actor', { requestId: 'end' })).rejects.toBe(failure);
    expect(audit.write).toHaveBeenCalledWith(expect.anything(), tx);
  });
});
