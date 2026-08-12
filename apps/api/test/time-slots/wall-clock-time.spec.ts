import { BadRequestException } from '@nestjs/common';
import { formatWallClockTime, parseWallClockTime, wallClockSeconds } from '../../src/time-slots/wall-clock-time';

describe('wall-clock time transport', () => {
  it.each(['00:00:00', '07:00:00', '12:34:56', '23:59:59'])('round trips %s through the neutral UTC anchor', (value) => {
    expect(formatWallClockTime(parseWallClockTime(value))).toBe(value);
  });

  it.each([
    '24:00:00', '07:60:00', '07:00:60', '07:00', '7:00:00',
    '2026-08-11T07:00:00', '07:00:00Z', '07:00:00+07:00',
  ])('rejects non-canonical wall-clock value %s', (value) => {
    expect(() => wallClockSeconds(value)).toThrow(BadRequestException);
  });

  it('formats only UTC transport getters', () => {
    const date = {
      getUTCHours: () => 7,
      getUTCMinutes: () => 8,
      getUTCSeconds: () => 9,
      getHours: () => { throw new Error('local getter used'); },
      getMinutes: () => { throw new Error('local getter used'); },
      getSeconds: () => { throw new Error('local getter used'); },
      toISOString: () => { throw new Error('instant conversion used'); },
    } as unknown as Date;
    expect(formatWallClockTime(date)).toBe('07:08:09');
  });
});
