import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { BusinessConfigurationService } from './business-configuration.service';
import { CreateBusinessPolicyDraftDto } from './dto';

describe('BusinessConfigurationService PostgreSQL exclusion conflict mapping', () => {
  const dto: CreateBusinessPolicyDraftDto = {
    family: 'UNUSED_TEST_FAMILY',
    resource: { kind: 'SCHOOL_WIDE' },
    payload: {},
    commandId: 'constraint-conflict-test',
    effectiveFrom: '2026-09-01',
  };

  const meta = {
    ip: '127.0.0.1',
    userAgent: 'test-agent',
    origin: 'http://localhost',
    requestId: 'req-constraint-conflict',
  };

  const overlapError = () =>
    new Prisma.PrismaClientUnknownRequestError(
      'PostgreSQL error 23P01: conflicting key value violates exclusion constraint "business_policy_versions_no_published_overlap"',
      { clientVersion: '5' },
    );

  const unrelatedExclusionError = () =>
    new Prisma.PrismaClientUnknownRequestError(
      'PostgreSQL error 23P01: conflicting key value violates exclusion constraint "some_other_exclusion_constraint"',
      { clientVersion: '5' },
    );

  it('maps the exact published-overlap 23P01 to typed conflict without retrying', async () => {
    const prisma = { $transaction: jest.fn().mockRejectedValueOnce(overlapError()) };
    const service = new BusinessConfigurationService(
      prisma as unknown as PrismaService,
      { write: jest.fn() } as unknown as AuditService,
      [],
    );

    try {
      await service.createDraft(dto, 'actor-1', meta);
      throw new Error('Expected BUSINESS_POLICY_CONFLICT');
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).message).toBe('BUSINESS_POLICY_CONFLICT');
    }
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('does not mis-map an unrelated 23P01 exclusion error', async () => {
    const error = unrelatedExclusionError();
    const prisma = { $transaction: jest.fn().mockRejectedValueOnce(error) };
    const service = new BusinessConfigurationService(
      prisma as unknown as PrismaService,
      { write: jest.fn() } as unknown as AuditService,
      [],
    );

    await expect(service.createDraft(dto, 'actor-1', meta)).rejects.toBe(error);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
