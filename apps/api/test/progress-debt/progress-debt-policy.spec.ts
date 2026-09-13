import { hcmCivilDate as commonHcmCivilDate } from '../../src/common/validation/civil-date';
import { hasEndedAt, hcmCivilDate, hcmSlotEndFor } from '../../src/progress-debt/progress-debt.policy';

describe('progress/debt policy', () => {
  it('P1 converts the UTC+7 civil-date boundary deterministically', () => {
    expect(hcmCivilDate(new Date('2026-08-10T16:59:59.999Z'))).toBe('2026-08-10');
    expect(hcmCivilDate(new Date('2026-08-10T17:00:00.000Z'))).toBe('2026-08-11');
    expect(hcmCivilDate(new Date('2026-09-12T16:59:59.999Z'))).toBe('2026-09-12');
    expect(hcmCivilDate(new Date('2026-09-12T17:00:00.000Z'))).toBe('2026-09-13');
    expect(commonHcmCivilDate(new Date('2026-09-12T16:59:59.999Z'))).toBe('2026-09-12');
    expect(commonHcmCivilDate(new Date('2026-09-12T17:00:00.000Z'))).toBe('2026-09-13');
  });

  it('rejects invalid Date with TypeError', () => {
    expect(() => hcmCivilDate(new Date('invalid-date'))).toThrow(TypeError);
    expect(() => commonHcmCivilDate(null as never)).toThrow(TypeError);
  });

  it('uses the canonical Ho Chi Minh slot-end instant', () => {
    expect(hcmSlotEndFor('2026-08-10', '07:45:00').toISOString()).toBe('2026-08-10T00:45:00.000Z');
    expect(hasEndedAt('2026-08-10', '07:45:00', new Date('2026-08-10T00:45:00.000Z'))).toBe(true);
  });
});
