import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createReportingStatementRequestKey,
  reportingStatementsApi,
} from '../lib/reporting-statements-api';
import { jsonResponse } from './test-utils';

describe('reporting statements API adapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('createReportingStatementRequestKey', () => {
    it('generates a valid UUID string', () => {
      const key1 = createReportingStatementRequestKey();
      const key2 = createReportingStatementRequestKey();
      expect(key1).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
      expect(key2).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
      expect(key1).not.toBe(key2);
    });
  });

  describe('reportingStatementsApi methods', () => {
    it('preview sends POST to /api/reporting-statements/preview with typed body', async () => {
      const mockResult = {
        previewAsOfInstant: '2026-08-25T08:00:00.000Z',
        status: 'PASS',
        responsibilityState: 'RESPONSIBILITY_PRESENT',
        eligibleForSubmission: true,
        counts: {
          distributedElapsedCount: 2,
          completedCount: 2,
          openDebtCount: 0,
          lateCount: 0,
          unconfirmedGapCount: 0,
        },
        sections: [],
        findings: [],
        responsibilityManifest: [],
      };
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(mockResult));
      vi.stubGlobal('fetch', fetchMock);

      const request = {
        academicYearId: 'year-1',
        fromCivilDate: '2026-08-01' as const,
        toCivilDate: '2026-08-31' as const,
      };

      const res = await reportingStatementsApi.preview(request);
      expect(res).toEqual(mockResult);
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/reporting-statements/preview',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(request),
        }),
      );
    });

    it('listMine sends GET to /api/reporting-statements/mine with query params', async () => {
      const mockList = { items: [], page: 1, pageSize: 20, total: 0 };
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(mockList));
      vi.stubGlobal('fetch', fetchMock);

      const res = await reportingStatementsApi.listMine({ page: 1, pageSize: 20 });
      expect(res).toEqual(mockList);
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/reporting-statements/mine?page=1&pageSize=20',
        expect.anything(),
      );
    });

    it('listAccessible sends GET to /api/reporting-statements/accessible with query params', async () => {
      const mockList = { items: [], page: 2, pageSize: 10, total: 0 };
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(mockList));
      vi.stubGlobal('fetch', fetchMock);

      const res = await reportingStatementsApi.listAccessible({ page: 2, pageSize: 10 });
      expect(res).toEqual(mockList);
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/reporting-statements/accessible?page=2&pageSize=10',
        expect.anything(),
      );
    });

    it('listPendingDecision sends GET to /api/reporting-statements/pending-decision with query params', async () => {
      const mockList = { items: [], page: 1, pageSize: 50, total: 0 };
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(mockList));
      vi.stubGlobal('fetch', fetchMock);

      const res = await reportingStatementsApi.listPendingDecision({ page: 1, pageSize: 50 });
      expect(res).toEqual(mockList);
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/reporting-statements/pending-decision?page=1&pageSize=50',
        expect.anything(),
      );
    });

    it('getDetail sends GET to /api/reporting-statements/:revisionId', async () => {
      const mockDetail = {
        revisionId: 'rev-uuid-1',
        seriesId: 'series-uuid-1',
        statementProfile: 'PERSONAL_REPORTING_STATEMENT_V1',
        submitterUserId: 'user-1',
        submitterDisplayNameSnapshot: 'Teacher A',
        submitterStaffCodeSnapshot: 'GV001',
        academicYearId: 'year-1',
        fromCivilDate: '2026-08-01',
        toCivilDate: '2026-08-31',
        asOfInstant: '2026-08-25T08:00:00.000Z',
        submittedAt: '2026-08-25T08:00:00.000Z',
        lifecycleState: 'SUBMITTED',
        lifecycleToken: 'token-uuid-1',
        predecessorRevisionId: null,
        supersedesRevisionId: null,
        counts: {
          distributedElapsedCount: 2,
          completedCount: 2,
          openDebtCount: 0,
          lateCount: 0,
          unconfirmedGapCount: 0,
        },
        sections: [],
        responsibilityManifest: [],
        frozenSubjectIds: ['sub-1'],
        history: [],
        allowedActions: ['APPROVE', 'REJECT'],
      };
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(mockDetail));
      vi.stubGlobal('fetch', fetchMock);

      const res = await reportingStatementsApi.getDetail('rev-uuid-1');
      expect(res).toEqual(mockDetail);
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/reporting-statements/rev-uuid-1',
        expect.anything(),
      );
    });

    it('submit sends POST to /api/reporting-statements with command payload', async () => {
      const mockCmdResult = {
        revisionId: 'rev-uuid-1',
        seriesId: 'series-uuid-1',
        lifecycleState: 'SUBMITTED',
        lifecycleToken: 'token-uuid-1',
        asOfInstant: '2026-08-25T08:00:00.000Z',
        replay: false,
      };
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(mockCmdResult));
      vi.stubGlobal('fetch', fetchMock);

      const payload = {
        academicYearId: 'year-1',
        fromCivilDate: '2026-08-01' as const,
        toCivilDate: '2026-08-31' as const,
        requestKey: 'submit-key-1',
      };

      const res = await reportingStatementsApi.submit(payload);
      expect(res).toEqual(mockCmdResult);
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/reporting-statements',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(payload),
        }),
      );
    });

    it('approve sends POST to /api/reporting-statements/:revisionId/approve', async () => {
      const mockCmdResult = {
        revisionId: 'rev-uuid-1',
        seriesId: 'series-uuid-1',
        lifecycleState: 'APPROVED',
        lifecycleToken: 'token-uuid-2',
        asOfInstant: null,
        replay: false,
      };
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(mockCmdResult));
      vi.stubGlobal('fetch', fetchMock);

      const payload = {
        expectedLifecycleToken: 'token-uuid-1',
        requestKey: 'approve-key-1',
      };

      const res = await reportingStatementsApi.approve('rev-uuid-1', payload);
      expect(res).toEqual(mockCmdResult);
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/reporting-statements/rev-uuid-1/approve',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(payload),
        }),
      );
    });

    it('reject sends POST to /api/reporting-statements/:revisionId/reject', async () => {
      const mockCmdResult = {
        revisionId: 'rev-uuid-1',
        seriesId: 'series-uuid-1',
        lifecycleState: 'REJECTED',
        lifecycleToken: 'token-uuid-3',
        asOfInstant: null,
        replay: false,
      };
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(mockCmdResult));
      vi.stubGlobal('fetch', fetchMock);

      const payload = {
        expectedLifecycleToken: 'token-uuid-1',
        requestKey: 'reject-key-1',
      };

      const res = await reportingStatementsApi.reject('rev-uuid-1', payload);
      expect(res).toEqual(mockCmdResult);
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/reporting-statements/rev-uuid-1/reject',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(payload),
        }),
      );
    });
  });
});
