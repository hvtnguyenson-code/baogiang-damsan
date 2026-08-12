const UNICODE_WHITESPACE = /\s+/gu;
const SOURCE_KEY_PATTERN = /^[a-z0-9][a-z0-9._-]{0,99}$/;

export function normalizeHumanText(value: string): string {
  return value.normalize('NFKC').trim().replace(UNICODE_WHITESPACE, ' ');
}

export function normalizeLookupKey(value: string): string {
  return normalizeHumanText(value).toLocaleLowerCase('vi-VN');
}

export function normalizeSourceKey(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidSourceKey(value: string): boolean {
  return SOURCE_KEY_PATTERN.test(value);
}
