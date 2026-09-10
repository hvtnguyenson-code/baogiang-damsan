import { TimetableReadinessResponse } from '@baogiang/contracts';

export const NORMAL_BASE_PPCT_COMPONENT_V2 = 'NORMAL_BASE_PPCT_COMPONENT_V2' as const;
export const NORMAL_BASE_PPCT_COMPONENT_V2_LABEL = 'TIMETABLE READINESS — NORMAL BASE + PPCT COMPONENTS' as const;

export interface TimetableReadinessV2Response extends Omit<TimetableReadinessResponse, 'profile' | 'productLabel'> {
  profile: typeof NORMAL_BASE_PPCT_COMPONENT_V2;
  productLabel: typeof NORMAL_BASE_PPCT_COMPONENT_V2_LABEL;
}
