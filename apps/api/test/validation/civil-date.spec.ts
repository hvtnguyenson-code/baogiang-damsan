import { formatCivilDate, isCivilDate, parseCivilDate } from '../../src/common/validation/civil-date';

describe('strict civil dates', () => {
  it.each(['2026-08-10', '2028-02-29'])('accepts %s', (value) => {
    expect(isCivilDate(value)).toBe(true);
    expect(formatCivilDate(parseCivilDate(value))).toBe(value);
  });

  it.each([
    '2026-02-29', '2026-8-10', '10/08/2026', '2026-08-10T00:00',
    '2026-08-10T00:00:00Z', '2026-08-10+07:00', ' 2026-08-10', '2026-08-10 ',
    '0000-01-01', '2026-13-01', 'not-a-date', '',
  ])('rejects %s', (value) => expect(isCivilDate(value)).toBe(false));

  it('formats Prisma DATE values only through UTC calendar fields', () => {
    const date = new Date('2026-08-10T00:00:00.000Z');
    expect(formatCivilDate(date)).toBe('2026-08-10');
    expect(parseCivilDate('0099-01-02').getUTCFullYear()).toBe(99);
  });
});
