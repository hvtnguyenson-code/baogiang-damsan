import { createHash } from 'node:crypto';

export const TEACHING_EXECUTION_CLOCK = Symbol('TEACHING_EXECUTION_CLOCK');
export interface TeachingExecutionClock { now(): Date; }
export class SystemTeachingExecutionClock implements TeachingExecutionClock { now(): Date { return new Date(); } }

function fingerprint(value: Record<string, unknown>): string {
  return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}
export const createFingerprint = (family: string, value: Record<string, unknown>) => fingerprint({ version: 'teaching-execution-v1', family, ...value });
export const reverseFingerprint = (id: string, expectedUpdatedAt: string, reason: string) => fingerprint({ version: 'teaching-execution-reverse-v1', id, expectedUpdatedAt, reason });

/** PostgreSQL DATE is a civil day; this builds the Asia/Ho_Chi_Minh instant without host-local parsing. */
export function hcmSlotEnd(civilDate: Date, endTime: Date): Date {
  const [hour, minute, second, millisecond] = endTime.toISOString().slice(11, 23).split(/[:.]/u).map(Number);
  return new Date(Date.UTC(civilDate.getUTCFullYear(), civilDate.getUTCMonth(), civilDate.getUTCDate(), hour!, minute!, second!, millisecond!) - 7 * 60 * 60 * 1000);
}
