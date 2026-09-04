import { BadRequestException, ConflictException } from '@nestjs/common';
import { CatalogStatus, UserStatus } from '@prisma/client';
import {
  classifyHomeroomInterval,
  ensureHomeroomCalendarActivationCompatibility,
  previousHomeroomCivilDate,
  requireHomeroomEnvelope,
  validateHomeroomCandidate,
} from '../../src/homeroom-assignments/homeroom-assignment-policy';

const calendar = {
  startDate: new Date('2026-08-03T00:00:00.000Z'),
  endDate: new Date('2027-05-31T00:00:00.000Z'),
};

describe('Homeroom assignment policy', () => {
  it('classifies bounded history and performs inclusive civil-date validation', () => {
    expect(classifyHomeroomInterval('2026-08-10', '2026-08-11')).toBe('BOUNDED_HISTORICAL');
    expect(classifyHomeroomInterval('2026-08-11', '2026-08-11')).toBe('CURRENT_OR_FUTURE');
    expect(classifyHomeroomInterval(null, '2026-08-11')).toBe('CURRENT_OR_FUTURE');
    expect(previousHomeroomCivilDate('2026-09-01')).toBe('2026-08-31');
    expect(() => requireHomeroomEnvelope('2026-08-03', '2027-05-31', calendar as never)).not.toThrow();
    expect(() => requireHomeroomEnvelope('2026-08-04', '2026-08-03', calendar as never)).toThrow(BadRequestException);
  });

  it('permits bounded history for a retained inactive teacher with provenance and no StaffSubject lookup', async () => {
    const db = {
      schoolClass: { findUnique: jest.fn().mockResolvedValue({ academicYearId: 'year', status: CatalogStatus.INACTIVE }) },
      user: { findUnique: jest.fn().mockResolvedValue({ status: UserStatus.DISABLED, profile: { isTeachingStaff: false } }) },
      homeroomAssignment: { findFirst: jest.fn().mockResolvedValue(null) },
      staffSubject: { findFirst: jest.fn() },
    };
    await expect(validateHomeroomCandidate(db as never, {
      academicYearId: 'year', schoolClassId: 'class', teacherUserId: 'teacher',
      validFrom: '2026-08-03', validUntil: '2026-08-10', businessDate: '2026-08-11', entryReason: 'Nhập lịch sử',
    })).resolves.toBeUndefined();
    expect(db.staffSubject.findFirst).not.toHaveBeenCalled();
    await expect(validateHomeroomCandidate(db as never, {
      academicYearId: 'year', schoolClassId: 'class', teacherUserId: 'teacher',
      validFrom: '2026-08-03', validUntil: '2026-08-10', businessDate: '2026-08-11', entryReason: ' ',
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires current operational eligibility, rejects overlap, and never consults StaffSubject', async () => {
    const db = {
      schoolClass: { findUnique: jest.fn().mockResolvedValue({ academicYearId: 'year', status: CatalogStatus.ACTIVE }) },
      user: { findUnique: jest.fn().mockResolvedValue({ status: UserStatus.ACTIVE, profile: { isTeachingStaff: true } }) },
      homeroomAssignment: { findFirst: jest.fn().mockResolvedValue(null) },
      staffSubject: { findFirst: jest.fn() },
    };
    const input = {
      academicYearId: 'year', schoolClassId: 'class', teacherUserId: 'teacher',
      validFrom: '2026-08-11', validUntil: null, businessDate: '2026-08-11', entryReason: 'cannot bypass',
    } as const;
    await expect(validateHomeroomCandidate(db as never, input)).resolves.toBeUndefined();
    expect(db.staffSubject.findFirst).not.toHaveBeenCalled();
    db.user.findUnique.mockResolvedValue({ status: UserStatus.DISABLED, profile: { isTeachingStaff: true } });
    await expect(validateHomeroomCandidate(db as never, input)).rejects.toBeInstanceOf(ConflictException);
    db.user.findUnique.mockResolvedValue({ status: UserStatus.ACTIVE, profile: { isTeachingStaff: true } });
    db.homeroomAssignment.findFirst.mockResolvedValue({ id: 'overlap' });
    await expect(validateHomeroomCandidate(db as never, input)).rejects.toBeInstanceOf(ConflictException);
  });

  it('checks both ACTIVE and REVERSED retained evidence without current class/teacher joins', async () => {
    const findMany = jest.fn().mockResolvedValue([
      { status: 'ACTIVE', validFrom: new Date('2026-08-03T00:00:00Z'), validUntil: new Date('2026-08-10T00:00:00Z') },
      { status: 'REVERSED', validFrom: new Date('2026-08-11T00:00:00Z'), validUntil: new Date('2026-08-20T00:00:00Z') },
    ]);
    const db = { homeroomAssignment: { findMany }, user: { findUnique: jest.fn() }, schoolClass: { findUnique: jest.fn() } };
    await expect(ensureHomeroomCalendarActivationCompatibility(db as never, { academicYearId: 'year', ...calendar } as never)).resolves.toBeUndefined();
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { academicYearId: 'year' } }));
    expect(db.user.findUnique).not.toHaveBeenCalled();
    findMany.mockResolvedValue([{ validFrom: new Date('2026-08-02T00:00:00Z'), validUntil: null }]);
    await expect(ensureHomeroomCalendarActivationCompatibility(db as never, { academicYearId: 'year', ...calendar } as never)).rejects.toBeInstanceOf(ConflictException);
  });
});
