import { normalizeHumanText, normalizeLookupKey, normalizeSourceKey } from '../../src/timetable-import/normalization';

describe('timetable import normalization', () => {
  it('normalizes Unicode display text without removing Vietnamese diacritics or punctuation', () => {
    expect(normalizeHumanText('  Thời\t khóa\n biểu — Khối 10!  ')).toBe('Thời khóa biểu — Khối 10!');
    expect(normalizeHumanText('A\u0301nh')).toBe(normalizeHumanText('Ánh'));
  });

  it('creates deterministic lowercase exact keys and retains accents', () => {
    expect(normalizeLookupKey('  TIẾT   HỌC  ')).toBe('tiết học');
    expect(normalizeLookupKey('Địa-lý!')).toBe('địa-lý!');
  });

  it('only trims and lowercases source identifiers', () => {
    expect(normalizeSourceKey('  SIS.DAM_SAN-01  ')).toBe('sis.dam_san-01');
    expect(normalizeHumanText(' \t\n ')).toBe('');
  });
});
