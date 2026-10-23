import type { DataReadinessSummaryResponse } from '@baogiang/contracts';
import { apiFetch } from './api-client';

export const dataReadinessApi = {
  getSummary: (academicYearId?: string): Promise<DataReadinessSummaryResponse> => {
    const query = academicYearId ? `?academicYearId=${encodeURIComponent(academicYearId)}` : '';
    return apiFetch<DataReadinessSummaryResponse>(`/data-readiness/summary${query}`);
  },
};
