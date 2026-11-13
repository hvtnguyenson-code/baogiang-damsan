import { ForbiddenException } from '@nestjs/common';
import { CapabilitiesService } from '../../src/capabilities/capabilities.service';
import { AccessBaselineService } from '../../src/capabilities/access-baseline.service';
import { bootstrapAdmin } from '../../src/bootstrap/bootstrap-admin';

const admin = '11111111-1111-4111-8111-111111111111';
const holder = '22222222-2222-4222-8222-222222222222';
const oldFlag = process.env.B1_REJECT_GENERIC_SENSITIVE_WRITES;

beforeEach(() => { process.env.B1_REJECT_GENERIC_SENSITIVE_WRITES = 'true'; });
afterEach(() => {
  if (oldFlag === undefined) delete process.env.B1_REJECT_GENERIC_SENSITIVE_WRITES;
  else process.env.B1_REJECT_GENERIC_SENSITIVE_WRITES = oldFlag;
});

describe('P5-057 — guard is called at generic service write ingress', () => {
  it('rejects sensitive grant creation before any DB read or write', async () => {
    const transaction = jest.fn();
    const requireUserQuery = jest.fn();
    const db = { $transaction: transaction, user: { findUnique: requireUserQuery } };
    const service = new CapabilitiesService(db as never, { write: jest.fn() } as never);
    await expect(service.create(holder, {
      capabilityKey: 'APPROVAL_PRINCIPAL', scopeType: 'SCHOOL_WIDE',
    } as never, admin, { requestId: 'b1-negative' } as never))
      .rejects.toThrow(ForbiddenException);
    expect(transaction).not.toHaveBeenCalled();
    expect(requireUserQuery).not.toHaveBeenCalled();
  });

  it('rejects sensitive revocation after reading target grant but before mutation', async () => {
    const update = jest.fn();
    const findUnique = jest.fn().mockResolvedValue({
      id: '33333333-3333-4333-8333-333333333333',
      userId: holder, capabilityKey: 'AUDIT_VIEW', revokedAt: null,
    });
    const transaction = jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ capabilityGrant: { findUnique, update } }));
    const service = new CapabilitiesService({
      $transaction: transaction,
    } as never, { write: jest.fn() } as never);
    await expect(service.revoke(
      '33333333-3333-4333-8333-333333333333', {} as never,
      admin, { requestId: 'b1-negative' } as never,
    )).rejects.toThrow(ForbiddenException);
    expect(findUnique).toHaveBeenCalledTimes(1);
    expect(update).not.toHaveBeenCalled();
  });
  it('closes bootstrap CLI issuance after B1 cutover without DB access', async () => {
    await expect(bootstrapAdmin({} as never, {} as never, {} as never))
      .rejects.toThrow('Bootstrap technical grants are disabled');
  });


  it('blocks both leadership templates in applyTemplate before any grant write', async () => {
    const writes = jest.fn();
    const users = jest.fn().mockResolvedValue({
      id: holder, status: 'ACTIVE', profile: { isTeachingStaff: true },
    });
    const db = {
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({
        $queryRaw: jest.fn().mockResolvedValue([{ id: holder }]),
        user: { findUnique: users },
        capabilityGrant: { create: writes, findMany: jest.fn() },
      })),
    };
    const service = new AccessBaselineService(db as never, { write: jest.fn() } as never);
    for (const templateKey of ['PRINCIPAL', 'VICE_PRINCIPAL_ACADEMIC'] as const) {
      await expect(service.applyTemplate(holder, { templateKey } as never,
        admin, { requestId: 'b1-negative' } as never)).rejects.toThrow(ForbiddenException);
    }
    expect(db.$transaction).toHaveBeenCalledTimes(2);
    expect(users).toHaveBeenCalledTimes(2);
    expect(writes).not.toHaveBeenCalled();
  });

});
