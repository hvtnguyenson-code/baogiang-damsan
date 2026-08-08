import { BadRequestException } from '@nestjs/common';
import { toUserManagementRecord, normalizeStaffCode, normalizeUsername, UsersService } from '../../src/users/users.service';

describe('UsersService foundations', () => {
  it('normalizes usernames and staff codes according to database invariants', () => {
    expect(normalizeUsername('  Admin.User  ')).toBe('admin.user');
    expect(normalizeStaffCode('  gv-01  ')).toBe('GV-01');
  });

  it('maps a public-safe record without password hash or failed attempts', () => {
    const record = toUserManagementRecord({
      id: '11111111-1111-4111-8111-111111111111', username: 'teacher', passwordHash: 'secret-hash', status: 'PENDING',
      mustChangePassword: true, failedLoginCount: 3, lockedUntil: null, lastLoginAt: null,
      createdAt: new Date('2026-08-08T00:00:00Z'), updatedAt: new Date('2026-08-08T00:00:00Z'), profile: null,
    });
    expect(record).toMatchObject({ username: 'teacher', profile: null });
    expect(JSON.stringify(record)).not.toMatch(/passwordHash|failedLoginCount/i);
  });

  it('rejects an empty patch before any database operation', async () => {
    const prisma = { $transaction: jest.fn() };
    const service = new UsersService(prisma as never, {} as never, {} as never);
    await expect(service.update('11111111-1111-4111-8111-111111111111', {}, 'actor', {})).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
