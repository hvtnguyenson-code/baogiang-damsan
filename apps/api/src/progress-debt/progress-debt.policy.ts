import { CivilDateString } from '@baogiang/contracts';
import { hcmSlotEnd } from '../teaching-executions/teaching-execution-policy';

const HCM = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
});

export function hcmCivilDate(instant: Date): CivilDateString {
  if (!(instant instanceof Date) || Number.isNaN(instant.getTime())) throw new TypeError('asOfInstant must be a valid Date.');
  const parts = Object.fromEntries(HCM.formatToParts(instant).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}` as CivilDateString;
}

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
