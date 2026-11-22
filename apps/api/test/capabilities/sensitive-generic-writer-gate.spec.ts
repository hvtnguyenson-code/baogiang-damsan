import { ForbiddenException } from '@nestjs/common';
import { SENSITIVE_CAPABILITY_KEYS } from '../../src/capabilities/sensitive-capability-policy';
import { CapabilitiesService } from '../../src/capabilities/capabilities.service';
import {
  assertGenericCoordinatesUnmanaged,
  assertGenericGrantSourceSafe,
  assertGenericTemplateSourceSafe,
} from '../../src/capabilities/sensitive-generic-writer-gate';

const oldFlag = process.env.B1_REJECT_GENERIC_SENSITIVE_WRITES;
afterEach(() => {
  if (oldFlag === undefined) delete process.env.B1_REJECT_GENERIC_SENSITIVE_WRITES;
  else process.env.B1_REJECT_GENERIC_SENSITIVE_WRITES = oldFlag;
});

describe('P5-057 WS1 generic ingress shadow/cutover guard', () => {
  it('is inactive by default so a staging merge would not change existing authorization', () => {
    delete process.env.B1_REJECT_GENERIC_SENSITIVE_WRITES;
    for (const key of SENSITIVE_CAPABILITY_KEYS) {
      expect(() => assertGenericGrantSourceSafe(key)).not.toThrow();
    }
  });

  it('denies all nine sensitive keys on both generic grant/revoke paths when enabled', () => {
    process.env.B1_REJECT_GENERIC_SENSITIVE_WRITES = 'true';
    for (const key of SENSITIVE_CAPABILITY_KEYS) {
      expect(() => assertGenericGrantSourceSafe(key)).toThrow(ForbiddenException);
    }
  });

  it('blocks entire mixed template atomically when any sensitive capability is present', () => {
    process.env.B1_REJECT_GENERIC_SENSITIVE_WRITES = 'true';
    expect(() => assertGenericTemplateSourceSafe([
      { capabilityKey: 'TEACHER_BASE' },
      { capabilityKey: 'APPROVAL_PRINCIPAL' },
    ])).toThrow(ForbiddenException);
  });

  it('preserves unrelated teacher and subject grants even in cutover mode', () => {
    process.env.B1_REJECT_GENERIC_SENSITIVE_WRITES = 'true';
    for (const key of ['TEACHER_BASE', 'TIMETABLE_VIEW', 'SUBJECT_GROUP_MANAGE']) {
      expect(() => assertGenericGrantSourceSafe(key)).not.toThrow();
    }
    expect(() => assertGenericTemplateSourceSafe([
      { capabilityKey: 'TEACHER_BASE' }, { capabilityKey: 'TIMETABLE_VIEW' },
    ])).not.toThrow();
  });

  it('protects source-linked non-sensitive coordinates without blocking ordinary grants', () => {
    process.env.B1_REJECT_GENERIC_SENSITIVE_WRITES = 'true';
    const linked = '11111111-1111-4111-8111-111111111111';
    const safeCheck = assertGenericGrantSourceSafe as unknown as
      (capabilityKey: string, coordinateId?: string | null) => void;
    expect(() => safeCheck('TIMETABLE_MANAGE', linked)).toThrow(ForbiddenException);
    expect(() => safeCheck('TIMETABLE_MANAGE', null)).not.toThrow();
    expect(() => safeCheck('TIMETABLE_MANAGE')).not.toThrow();
    delete process.env.B1_REJECT_GENERIC_SENSITIVE_WRITES;
    expect(() => safeCheck('TIMETABLE_MANAGE', linked)).not.toThrow();
  });

  it('does not let the legacy revoke writer mutate a B1-linked non-sensitive grant', async () => {
    process.env.B1_REJECT_GENERIC_SENSITIVE_WRITES = 'true';
    const update = jest.fn().mockRejectedValue(new Error('GENERIC_UPDATE_REACHED'));
    const tx = { capabilityGrant: {
      findUnique: jest.fn().mockResolvedValue({
        id: '22222222-2222-4222-8222-222222222222',
        userId: '33333333-3333-4333-8333-333333333333',
        capabilityKey: 'TIMETABLE_MANAGE',
        coordinateId: '11111111-1111-4111-8111-111111111111',
        revokedAt: null,
      }),
      update,
    } };
    const db = { $transaction: jest.fn().mockImplementation(async (run: (value: typeof tx) => unknown) => run(tx)) };
    const audit = { write: jest.fn() };
    const service = new CapabilitiesService(
      db as unknown as ConstructorParameters<typeof CapabilitiesService>[0],
      audit as unknown as ConstructorParameters<typeof CapabilitiesService>[1],
    );
    await expect(service.revoke(
      '22222222-2222-4222-8222-222222222222',
      {} as Parameters<CapabilitiesService['revoke']>[1],
      '44444444-4444-4444-8444-444444444444',
      { requestId: 'b1-linked-revoke' } as Parameters<CapabilitiesService['revoke']>[3],
    )).rejects.toThrow(ForbiddenException);
    expect(update).not.toHaveBeenCalled();
    expect(audit.write).not.toHaveBeenCalled();
  });

  it('checks only exact managed coordinates and avoids extra queries while cutover is OFF', async () => {
    const lookup = jest.fn().mockResolvedValue(null);
    const tx = { accessCoordinate: { findFirst: lookup } };
    const userId = '22222222-2222-4222-8222-222222222222';
    const specs = [{
      capabilityKey: 'TEACHER_BASE', scopeType: 'PERSONAL', scopeResourceId: null,
    }, {
      capabilityKey: 'SUBJECT_MANAGE', scopeType: 'SUBJECT',
      scopeResourceId: '33333333-3333-4333-8333-333333333333',
    }];
    delete process.env.B1_REJECT_GENERIC_SENSITIVE_WRITES;
    await assertGenericCoordinatesUnmanaged(tx as never, userId, specs);
    expect(lookup).not.toHaveBeenCalled();
    process.env.B1_REJECT_GENERIC_SENSITIVE_WRITES = 'true';
    await expect(assertGenericCoordinatesUnmanaged(tx as never, userId, specs))
      .resolves.toBeUndefined();
    expect(lookup).toHaveBeenCalledWith({
      where: { userId, OR: specs },
      select: { id: true },
    });
    lookup.mockResolvedValueOnce({ id: '11111111-1111-4111-8111-111111111111' });
    await expect(assertGenericCoordinatesUnmanaged(tx as never, userId, specs))
      .rejects.toThrow(ForbiddenException);
  });

  it('does not enable cutover on ambiguous environment values', () => {
    for (const flag of ['1', 'TRUE', 'yes', 'enabled', '']) {
      process.env.B1_REJECT_GENERIC_SENSITIVE_WRITES = flag;
      expect(() => assertGenericGrantSourceSafe('AUDIT_VIEW')).not.toThrow();
    }
  });
});
