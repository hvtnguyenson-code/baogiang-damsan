import { createHash } from 'node:crypto';
import { AcademicWeekday } from '@prisma/client';

export const SPECIAL_ACTIVITY_COLLISION_COVERAGE = { profile: 'CANONICAL_CLASS_TEACHER_TIME_V1', specialActivity: 'ASSESSED', room: 'NOT_ASSESSED' } as const;
export const SPECIAL_ACTIVITY_CLOCK = Symbol('SPECIAL_ACTIVITY_CLOCK');
export interface SpecialActivityClock { now(): Date; }
export class SystemSpecialActivityClock implements SpecialActivityClock { now(): Date { return new Date(); } }

function hash(value: Record<string, unknown>): string { return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex'); }
export function specialActivityCreateFingerprint(value: Record<string, unknown>): string { return hash({ version: 'special-activity-create-v1', ...value }); }
export function specialActivityReverseFingerprint(entityId: string, expectedUpdatedAt: string, reversalReason: string): string { return hash({ version: 'special-activity-reverse-v1', entityId, expectedUpdatedAt, reversalReason }); }
export function weekdayForCivilDate(date: Date): AcademicWeekday { return ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'][date.getUTCDay()] as AcademicWeekday; }
export function intervalsOverlap(left: { startTime: Date; endTime: Date }, right: { startTime: Date; endTime: Date }): boolean { return left.startTime < right.endTime && right.startTime < left.endTime; }
