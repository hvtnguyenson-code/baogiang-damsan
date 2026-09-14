import { CivilDateString } from '@baogiang/contracts';
import { hcmCivilDate } from '../common/validation/civil-date';
import { hcmSlotEnd } from '../teaching-executions/teaching-execution-policy';

export { hcmCivilDate };


export function hcmSlotEndFor(civilDate: CivilDateString, endTime: string): Date {
  const match = /^(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/.exec(endTime);
  if (!match) throw new TypeError('Slot end time must use HH:mm:ss format.');
  const slotTime = new Date(Date.UTC(1970, 0, 1, Number(match[1]), Number(match[2]), Number(match[3]), Number((match[4] ?? '').padEnd(3, '0'))));
  const [year, month, day] = civilDate.split('-').map(Number);
  return hcmSlotEnd(new Date(Date.UTC(year!, month! - 1, day!)), slotTime);
}

export function hasEndedAt(civilDate: CivilDateString, endTime: string, asOfInstant: Date): boolean {
  return hcmSlotEndFor(civilDate, endTime) <= asOfInstant;
}
