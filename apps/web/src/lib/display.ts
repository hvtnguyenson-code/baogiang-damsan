import { BUSINESS_TIME_ZONE } from '@baogiang/config';

export function formatDateTime(value?: string): string {
  return value ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short', timeZone: BUSINESS_TIME_ZONE }).format(new Date(value)) : 'Không giới hạn';
}

export function isActiveWindow(validFrom: string, validUntil?: string): boolean {
  const now = Date.now();
  return new Date(validFrom).getTime() <= now && (!validUntil || new Date(validUntil).getTime() > now);
}
