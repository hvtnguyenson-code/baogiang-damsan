import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TimeSlotsService, isKnownTimeSlotConflict, validateTimeSlotSemantics } from '../../src/time-slots/time-slots.service';

const row = (overrides: Record<string, unknown> = {}) => ({
  id: 'slot-1', academicYearId: 'year-1', weekday: 'MONDAY', session: 'MORNING', ordinal: 1,
  revision: 1, displayLabel: 'Tiết 1', startTime: new Date('1970-01-01T07:00:00.000Z'),
  endTime: new Date('1970-01-01T07:45:00.000Z'), isActive: true,
  allowRegularTeaching: true, allowMakeupTeaching: false, allowSelfStudy: false,
  createdAt: new Date('2026-08-11T00:00:00.000Z'), updatedAt: new Date('2026-08-11T00:00:00.000Z'),
  ...overrides,
});

function serviceWith(prisma: Record<string, unknown>) {
  const audit = { write: jest.fn() };
  return { service: new TimeSlotsService(prisma as never, audit as never), audit };
}

describe('TimeSlotsService', () => {
  it('rejects invalid range and all-false usage', () => {
    expect(() => validateTimeSlotSemantics({ displayLabel: 'Tiết', startTime: '08:00:00', endTime: '07:00:00', allowRegularTeaching: true, allowMakeupTeaching: false, allowSelfStudy: false })).toThrow(BadRequestException);
    expect(() => validateTimeSlotSemantics({ displayLabel: 'Tiết', startTime: '07:00:00', endTime: '07:45:00', allowRegularTeaching: false, allowMakeupTeaching: false, allowSelfStudy: false })).toThrow(BadRequestException);
  });

  it('returns 404 when listing an unknown academic year', async () => {
    const prisma = { academicYear: { findUnique: jest.fn().mockResolvedValue(null) } };
    const { service } = serviceWith(prisma);
    await expect(service.list('missing', { page: 1, pageSize: 20 })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('applies list filters and keeps inactive history when isActive is omitted', async () => {
    const findMany = jest.fn().mockResolvedValue([row({ isActive: false })]);
    const where = { academicYearId: 'year-1', weekday: 'MONDAY', session: 'MORNING' };
    const prisma = {
      academicYear: { findUnique: jest.fn().mockResolvedValue({ id: 'year-1' }) },
      timeSlotDefinition: { findMany, count: jest.fn().mockResolvedValue(1) },
      $transaction: jest.fn(async (queries: Array<Promise<unknown>>) => Promise.all(queries)),
    };
    const { service } = serviceWith(prisma);
    const result = await service.list('year-1', { page: 1, pageSize: 20, weekday: 'MONDAY', session: 'MORNING' } as never);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where }));
    expect(result.items[0]?.isActive).toBe(false);
  });

  it('gets an exact inactive historical revision', async () => {
    const prisma = { timeSlotDefinition: { findUnique: jest.fn().mockResolvedValue(row({ isActive: false })) } };
    const { service } = serviceWith(prisma);
    await expect(service.get('slot-1')).resolves.toMatchObject({ id: 'slot-1', isActive: false, startTime: '07:00:00' });
  });

  it('returns 404 for an unknown exact revision', async () => {
    const prisma = { timeSlotDefinition: { findUnique: jest.fn().mockResolvedValue(null) } };
    const { service } = serviceWith(prisma);
    await expect(service.get('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('creates explicit revision 1 with defaults and audit', async () => {
    const create = jest.fn().mockResolvedValue(row());
    const tx = {
      academicYear: { findUnique: jest.fn().mockResolvedValue({ id: 'year-1' }) },
      timeSlotDefinition: { findFirst: jest.fn().mockResolvedValue(null), create },
    };
    const prisma = { $transaction: jest.fn((fn: (client: unknown) => unknown) => fn(tx)) };
    const { service, audit } = serviceWith(prisma);
    const result = await service.create('year-1', { weekday: 'MONDAY', session: 'MORNING', ordinal: 1, displayLabel: ' Tiết 1 ', startTime: '07:00:00', endTime: '07:45:00', allowRegularTeaching: true, allowMakeupTeaching: false, allowSelfStudy: false } as never, 'actor', { requestId: 'req' });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ revision: 1, isActive: true, displayLabel: 'Tiết 1' }) }));
    expect(audit.write).toHaveBeenCalledWith(expect.objectContaining({ action: 'TIME_SLOT_CREATED', requestId: 'req' }), tx);
    expect(result.revision).toBe(1);
  });

  it('rejects create when any historical coordinate exists', async () => {
    const tx = {
      academicYear: { findUnique: jest.fn().mockResolvedValue({ id: 'year-1' }) },
      timeSlotDefinition: { findFirst: jest.fn().mockResolvedValue({ id: 'old' }) },
    };
    const { service } = serviceWith({ $transaction: jest.fn((fn: (client: unknown) => unknown) => fn(tx)) });
    await expect(service.create('year-1', { weekday: 'MONDAY', session: 'MORNING', ordinal: 1, displayLabel: 'Tiết 1', startTime: '07:00:00', endTime: '07:45:00', allowRegularTeaching: true, allowMakeupTeaching: false, allowSelfStudy: false } as never, 'actor', {})).rejects.toBeInstanceOf(ConflictException);
  });

  it('revises the latest row without changing source semantics or coordinates', async () => {
    const source = row();
    const update = jest.fn().mockResolvedValue(row({ isActive: false }));
    const create = jest.fn().mockResolvedValue(row({ id: 'slot-2', revision: 2, displayLabel: 'Tiết mới', isActive: true }));
    const tx = { timeSlotDefinition: { findUnique: jest.fn().mockResolvedValue(source), findFirst: jest.fn().mockResolvedValue({ id: 'slot-1' }), update, create } };
    const { service } = serviceWith({ $transaction: jest.fn((fn: (client: unknown) => unknown) => fn(tx)) });
    const result = await service.revise('slot-1', { displayLabel: 'Tiết mới', startTime: '07:05:00', endTime: '07:50:00', allowRegularTeaching: true, allowMakeupTeaching: true, allowSelfStudy: false }, 'actor', {});
    expect(source).toMatchObject({ displayLabel: 'Tiết 1', isActive: true });
    expect(update).toHaveBeenCalledWith({ where: { id: 'slot-1' }, data: { isActive: false } });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ academicYearId: 'year-1', weekday: 'MONDAY', session: 'MORNING', ordinal: 1, revision: 2, isActive: true }) }));
    expect(result).toMatchObject({ previous: { isActive: false }, replacement: { revision: 2, isActive: true } });
  });

  it('revises an inactive latest row into a new active revision without reactivating it', async () => {
    const source = row({ isActive: false, revision: 2 });
    const create = jest.fn().mockResolvedValue(row({ id: 'slot-3', revision: 3, isActive: true }));
    const tx = { timeSlotDefinition: { findUnique: jest.fn().mockResolvedValue(source), findFirst: jest.fn().mockResolvedValue({ id: 'slot-1' }), update: jest.fn(), create } };
    const { service } = serviceWith({ $transaction: jest.fn((fn: (client: unknown) => unknown) => fn(tx)) });
    await service.revise('slot-1', { displayLabel: 'Tiết', startTime: '07:00:00', endTime: '07:45:00', allowRegularTeaching: true, allowMakeupTeaching: false, allowSelfStudy: false }, 'actor', {});
    expect(tx.timeSlotDefinition.update).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ revision: 3, isActive: true }) }));
  });

  it('rejects stale revise and retire requests', async () => {
    const tx = { timeSlotDefinition: { findUnique: jest.fn().mockResolvedValue(row()), findFirst: jest.fn().mockResolvedValue({ id: 'newer' }) } };
    const { service } = serviceWith({ $transaction: jest.fn((fn: (client: unknown) => unknown) => fn(tx)) });
    const revision = { displayLabel: 'Tiết', startTime: '07:00:00', endTime: '07:45:00', allowRegularTeaching: true, allowMakeupTeaching: false, allowSelfStudy: false };
    await expect(service.revise('slot-1', revision, 'actor', {})).rejects.toBeInstanceOf(ConflictException);
    await expect(service.retire('slot-1', 'actor', {})).rejects.toBeInstanceOf(ConflictException);
  });

  it('retires active latest and audits an inactive latest no-op', async () => {
    const active = row();
    const update = jest.fn().mockResolvedValue(row({ isActive: false }));
    const tx = { timeSlotDefinition: { findUnique: jest.fn().mockResolvedValue(active), findFirst: jest.fn().mockResolvedValue({ id: 'slot-1' }), update } };
    const { service, audit } = serviceWith({ $transaction: jest.fn((fn: (client: unknown) => unknown) => fn(tx)) });
    await expect(service.retire('slot-1', 'actor', {})).resolves.toMatchObject({ isActive: false });
    tx.timeSlotDefinition.findUnique.mockResolvedValue(row({ isActive: false }));
    await service.retire('slot-1', 'actor', {});
    expect(update).toHaveBeenCalledTimes(1);
    expect(audit.write).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'TIME_SLOT_RETIRED', metadata: expect.objectContaining({ noOp: true }) }), tx);
  });

  it('classifies only known Prisma slot conflicts', async () => {
    const known = new Prisma.PrismaClientKnownRequestError('serialization', { code: 'P2034', clientVersion: '5' });
    const unknown = new Prisma.PrismaClientKnownRequestError('other', { code: 'P2025', clientVersion: '5' });
    expect(isKnownTimeSlotConflict(known)).toBe(true);
    expect(isKnownTimeSlotConflict(unknown)).toBe(false);
    const prisma = { $transaction: jest.fn().mockRejectedValue(new Error('unexpected')) };
    const { service } = serviceWith(prisma);
    await expect(service.retire('slot-1', 'actor', {})).rejects.toThrow('unexpected');
  });
});
