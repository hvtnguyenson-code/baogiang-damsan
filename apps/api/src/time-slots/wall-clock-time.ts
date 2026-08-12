import { BadRequestException } from '@nestjs/common';
import { WallClockTimeString } from '@baogiang/contracts';

export const WALL_CLOCK_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/u;

export function wallClockSeconds(value: string): number {
  if (!WALL_CLOCK_TIME_PATTERN.test(value)) {
    throw new BadRequestException('Giờ phải có định dạng HH:mm:ss.');
  }
  const [hour, minute, second] = value.split(':').map(Number) as [number, number, number];
  return hour * 3600 + minute * 60 + second;
}

export function parseWallClockTime(value: string): Date {
  const seconds = wallClockSeconds(value);
  return new Date(Date.UTC(1970, 0, 1, Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), seconds % 60));
}

export function formatWallClockTime(value: Date): WallClockTimeString {
  const pad = (part: number): string => part.toString().padStart(2, '0');
  return `${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}:${pad(value.getUTCSeconds())}` as WallClockTimeString;
}
