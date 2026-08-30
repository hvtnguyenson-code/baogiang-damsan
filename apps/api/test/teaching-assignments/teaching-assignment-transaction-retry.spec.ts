import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  isRetryableTeachingAssignmentTransactionRace,
  retryTeachingAssignmentSerializableMutation,
  TEACHING_ASSIGNMENT_TRANSACTION_MAX_ATTEMPTS,
} from '../../src/teaching-assignments/teaching-assignment-transaction-retry';

describe('Teaching Assignment SERIALIZABLE transaction retry', () => {
  const p2034 = () => new Prisma.PrismaClientKnownRequestError('serialization conflict', { code: 'P2034', clientVersion: '5' });
  const deadlock = () => new Prisma.PrismaClientUnknownRequestError('PostgreSQL error 40P01: deadlock detected', { clientVersion: '5' });

  it('retries P2034 from a fresh whole-operation attempt', async () => {
    const operation = jest.fn().mockRejectedValueOnce(p2034()).mockResolvedValue('success');
    await expect(retryTeachingAssignmentSerializableMutation(operation)).resolves.toBe('success');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('retries an exact PostgreSQL 40P01 surfaced through Prisma Unknown', async () => {
    const operation = jest.fn().mockRejectedValueOnce(deadlock()).mockResolvedValue('success');
    await expect(retryTeachingAssignmentSerializableMutation(operation)).resolves.toBe('success');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('propagates the final raw deadlock after the bounded attempt budget', async () => {
    const final = deadlock();
    const operation = jest.fn().mockRejectedValueOnce(deadlock()).mockRejectedValueOnce(deadlock()).mockRejectedValue(final);
    await expect(retryTeachingAssignmentSerializableMutation(operation)).rejects.toBe(final);
    expect(operation).toHaveBeenCalledTimes(TEACHING_ASSIGNMENT_TRANSACTION_MAX_ATTEMPTS);
  });

  it('does not retry a generic Prisma Unknown error', async () => {
    const error = new Prisma.PrismaClientUnknownRequestError('connection failed', { clientVersion: '5' });
    const operation = jest.fn().mockRejectedValue(error);
    await expect(retryTeachingAssignmentSerializableMutation(operation)).rejects.toBe(error);
    expect(operation).toHaveBeenCalledTimes(1);
    expect(isRetryableTeachingAssignmentTransactionRace(error)).toBe(false);
  });

  it('does not retry deterministic domain exceptions', async () => {
    const error = new ConflictException('domain conflict');
    const operation = jest.fn().mockRejectedValue(error);
    await expect(retryTeachingAssignmentSerializableMutation(operation)).rejects.toBe(error);
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
