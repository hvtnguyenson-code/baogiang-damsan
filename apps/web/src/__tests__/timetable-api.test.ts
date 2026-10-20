import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  timeSlotsApi,
  timetableImportApi,
  timetableVersionsApi,
} from '../lib/timetable-api';
import { jsonResponse } from './test-utils';

describe('timetable-api client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('timeSlotsApi', () => {
    it('lists time slots with query parameters', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]));
      vi.stubGlobal('fetch', fetchMock);

      await timeSlotsApi.list('year-1', { weekday: 'MONDAY', session: 'MORNING' });

      expect(fetchMock).toHaveBeenCalledWith(
        '/api/academic-years/year-1/time-slots?weekday=MONDAY&session=MORNING',
        expect.objectContaining({ credentials: 'same-origin' }),
      );
    });

    it('creates a new time slot coordinate', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 'ts-1', ordinal: 1 }));
      vi.stubGlobal('fetch', fetchMock);

      const payload = {
        weekday: 'MONDAY' as const,
        session: 'MORNING' as const,
        ordinal: 1,
        displayLabel: 'Tiết 1',
        startTime: '07:00',
        endTime: '07:45',
        allowRegularTeaching: true,
        allowMakeupTeaching: true,
        allowSelfStudy: false,
      };
      await timeSlotsApi.create('year-1', payload);

      expect(fetchMock).toHaveBeenCalledWith(
        '/api/academic-years/year-1/time-slots',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(payload),
        }),
      );
    });

    it('revises an active time slot', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 'ts-2', revision: 2 }));
      vi.stubGlobal('fetch', fetchMock);

      const payload = {
        displayLabel: 'Tiết 1 điều chỉnh',
        startTime: '07:15',
        endTime: '08:00',
        allowRegularTeaching: true,
        allowMakeupTeaching: true,
        allowSelfStudy: false,
      };
      await timeSlotsApi.revise('ts-1', payload);

      expect(fetchMock).toHaveBeenCalledWith(
        '/api/time-slots/ts-1/revise',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(payload),
        }),
      );
    });

    it('retires an active time slot', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 'ts-1', status: 'INACTIVE' }));
      vi.stubGlobal('fetch', fetchMock);

      await timeSlotsApi.retire('ts-1');

      expect(fetchMock).toHaveBeenCalledWith(
        '/api/time-slots/ts-1/retire',
        expect.objectContaining({
          method: 'POST',
        }),
      );
    });
  });

  describe('timetableVersionsApi', () => {
    it('lists timetable versions with academicYearId filter', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]));
      vi.stubGlobal('fetch', fetchMock);

      await timetableVersionsApi.list('year-1', { status: 'DRAFT' });

      expect(fetchMock).toHaveBeenCalledWith(
        '/api/academic-years/year-1/timetable-versions?status=DRAFT',
        expect.objectContaining({ credentials: 'same-origin' }),
      );
    });

    it('creates a draft timetable version', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 'ttv-1', status: 'DRAFT' }));
      vi.stubGlobal('fetch', fetchMock);

      const payload = {
        note: 'Tạo thủ công',
      };
      await timetableVersionsApi.create('year-1', payload);

      expect(fetchMock).toHaveBeenCalledWith(
        '/api/academic-years/year-1/timetable-versions',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(payload),
        }),
      );
    });

    it('sets target for timetable version', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 'ttv-1' }));
      vi.stubGlobal('fetch', fetchMock);

      const payload = {
        calendarVersionId: 'cal-ver-1',
        effectiveAcademicWeekId: 'week-1',
        expectedUpdatedAt: '2026-10-19T00:00:00.000Z',
      };
      await timetableVersionsApi.setTarget('ttv-1', payload);

      expect(fetchMock).toHaveBeenCalledWith(
        '/api/timetable-versions/ttv-1/target',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(payload),
        }),
      );
    });

    it('validates a timetable version', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 'ttv-1', status: 'VALIDATED' }));
      vi.stubGlobal('fetch', fetchMock);

      const payload = { expectedUpdatedAt: '2026-10-19T00:00:00.000Z' };
      await timetableVersionsApi.validate('ttv-1', payload);

      expect(fetchMock).toHaveBeenCalledWith(
        '/api/timetable-versions/ttv-1/validate',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(payload),
        }),
      );
    });

    it('approves a timetable version', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 'ttv-1', status: 'APPROVED' }));
      vi.stubGlobal('fetch', fetchMock);

      const payload = { expectedUpdatedAt: '2026-10-19T00:00:00.000Z' };
      await timetableVersionsApi.approve('ttv-1', payload);

      expect(fetchMock).toHaveBeenCalledWith(
        '/api/timetable-versions/ttv-1/approve',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(payload),
        }),
      );
    });

    it('activates an approved timetable version', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 'ttv-1', status: 'ACTIVE' }));
      vi.stubGlobal('fetch', fetchMock);

      const payload = { expectedUpdatedAt: '2026-10-19T00:00:00.000Z' };
      await timetableVersionsApi.activate('ttv-1', payload);

      expect(fetchMock).toHaveBeenCalledWith(
        '/api/timetable-versions/ttv-1/activate',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(payload),
        }),
      );
    });

    it('fetches readiness assessment with date range and profile query', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ versionId: 'ttv-1', overallStatus: 'READY' }));
      vi.stubGlobal('fetch', fetchMock);

      await timetableVersionsApi.readiness('ttv-1', {
        from: '2026-09-05',
        to: '2027-01-15',
        profile: 'NORMAL_BASE_PPCT_V1',
      });

      expect(fetchMock).toHaveBeenCalledWith(
        '/api/timetable-versions/ttv-1/readiness?from=2026-09-05&to=2027-01-15&profile=NORMAL_BASE_PPCT_V1',
        expect.objectContaining({ credentials: 'same-origin' }),
      );
    });

    it('resolves effective timetable on a given date', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ version: null, entries: [] }));
      vi.stubGlobal('fetch', fetchMock);

      await timetableVersionsApi.resolveEffective('year-1', '2026-10-19');

      expect(fetchMock).toHaveBeenCalledWith(
        '/api/academic-years/year-1/timetable-resolution?date=2026-10-19',
        expect.objectContaining({ credentials: 'same-origin' }),
      );
    });
  });

  describe('timetableImportApi', () => {
    it('inspects workbook using FormData', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ valid: true, sheets: [] }));
      vi.stubGlobal('fetch', fetchMock);

      const fakeFile = new File(['dummy xlsx content'], 'tkb.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      await timetableImportApi.inspect(fakeFile, { profileRevisionId: 'prof-rev-1' });

      expect(fetchMock).toHaveBeenCalledWith(
        '/api/timetable-import/workbooks/inspect',
        expect.objectContaining({
          method: 'POST',
          body: expect.any(FormData),
        }),
      );
    });

    it('previews workbook with selective session mode and calendar options', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ canCommit: true, issues: [] }));
      vi.stubGlobal('fetch', fetchMock);

      const fakeFile = new File(['dummy xlsx content'], 'tkb.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      await timetableImportApi.preview(fakeFile, {
        profileRevisionId: 'prof-rev-1',
        academicYearId: 'year-1',
        nativeSessionMode: 'MORNING',
        calendarVersionId: 'cal-ver-1',
        effectiveAcademicWeekId: 'week-1',
      });

      expect(fetchMock).toHaveBeenCalledWith(
        '/api/timetable-import/workbooks/preview',
        expect.objectContaining({
          method: 'POST',
          body: expect.any(FormData),
        }),
      );
    });

    it('confirms workbook import into draft version', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ timetableVersionId: 'ttv-draft-1', entryCount: 150 }));
      vi.stubGlobal('fetch', fetchMock);

      const fakeFile = new File(['dummy xlsx content'], 'tkb.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      await timetableImportApi.confirm(fakeFile, {
        profileRevisionId: 'prof-rev-1',
        academicYearId: 'year-1',
        nativeSessionMode: 'BOTH',
        calendarVersionId: 'cal-ver-1',
        effectiveAcademicWeekId: 'week-1',
      });

      expect(fetchMock).toHaveBeenCalledWith(
        '/api/timetable-import/workbooks/confirm',
        expect.objectContaining({
          method: 'POST',
          body: expect.any(FormData),
        }),
      );
    });
  });
});
