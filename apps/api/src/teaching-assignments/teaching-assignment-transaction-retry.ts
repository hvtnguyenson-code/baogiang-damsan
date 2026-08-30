import { Prisma } from '@prisma/client';

export const TEACHING_ASSIGNMENT_TRANSACTION_MAX_ATTEMPTS = 3;

export function isRetryableTeachingAssignmentTransactionRace(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) return error.code === 'P2034';
  return error instanceof Prisma.PrismaClientUnknownRequestError && /\b40P01\b/u.test(error.message);
}

export async function retryTeachingAssignmentSerializableMutation<T>(
  operation: () => Promise<T>,
  maximumAttempts = TEACHING_ASSIGNMENT_TRANSACTION_MAX_ATTEMPTS,
): Promise<T> {
  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === maximumAttempts || !isRetryableTeachingAssignmentTransactionRace(error)) throw error;
    }
  }
  throw new Error('Teaching Assignment transaction retry exhausted unexpectedly.');
}
