import { afterEach, describe, expect, it, vi } from 'vitest';
import { operationalOverlaysApi } from '../lib/operational-overlays-api';

const calendar = {
  academicYearId: 'year-id',
  academicCalendarVersionId: 'calendar-version-id',
  civilDate: '2026-10-21' as const,
  scope: 'SCHOOL_WIDE' as const,
  timeSelector: 'WHOLE_DAY' as const,
  requestKey: 'calendar-request',
};
const disposition = {
  timetableEntryId: 'entry-id',
  sourceCivilDate: '2026-10-21' as const,
  dispositionType: 'ABSENCE_NO_REPLACEMENT' as const,
  requestKey: 'disposition-request',
};
const reverse = {
  requestKey: 'reverse-request',
  expectedUpdatedAt: '2026-10-21T03:00:00.000Z',
  reversalReason: 'Điều chỉnh theo quyết định nhà trường',
};

function mockFetch() {
  const fetcher = vi.fn(async () =>
    new Response(JSON.stringify({ items: [], page: 1, pageSize: 20, total: 0 }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    }));
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('operational overlays HTTP client – P5-054', () => {
  it('selects canonical source occurrences through a scoped read-only endpoint', async () => {
    const fetcher = mockFetch();
    await operationalOverlaysApi.listSourceOccurrences({
      academicYearId: 'year-id', civilDate: '2026-10-22', subjectId: 'subject-id',
    });
    const [path, options] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    const url = new URL(path, 'https://example.test');
    expect(url.pathname).toMatch(/\/operational-overlays\/workspace\/source-occurrences$/);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      academicYearId: 'year-id', civilDate: '2026-10-22', subjectId: 'subject-id',
    });
    expect(options.method).toBeUndefined();
  });
  it('uses a dedicated scoped workspace context route instead of admin academic-years', async () => {
    const fetcher = mockFetch();
    await operationalOverlaysApi.getWorkspaceContext();
    const [path, options] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(path).toMatch(/\/operational-overlays\/workspace\/context$/);
    expect(options.method).toBeUndefined();
  });
  it('lists calendar exceptions with canonical query and does not invent preview endpoint', async () => {
    const fetcher = mockFetch();
    await operationalOverlaysApi.listCalendarExceptions({
      academicYearId: 'year-id', civilDate: '2026-10-21', scope: 'CLASS', status: 'ACTIVE', page: 2, pageSize: 10,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [path, options] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    const url = new URL(path, 'https://example.test');
    expect(url.pathname).toMatch(/\/operational-overlays\/calendar-exceptions$/);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      academicYearId: 'year-id', civilDate: '2026-10-21', status: 'ACTIVE', scope: 'CLASS', page: '2', pageSize: '10',
    });
    expect(options.method).toBeUndefined();
  });

  it('creates calendar exception and reverses with CAS/idempotency inputs', async () => {
    const fetcher = mockFetch();
    await operationalOverlaysApi.createCalendarException(calendar);
    await operationalOverlaysApi.reverseCalendarException('calendar-id', reverse);
    const [createPath, createOptions] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    const [reversePath, reverseOptions] = fetcher.mock.calls[1] as unknown as [string, RequestInit];
    expect(createPath).toMatch(/\/operational-overlays\/calendar-exceptions$/);
    expect(createOptions.method).toBe('POST');
    expect(JSON.parse(String(createOptions.body))).toEqual(calendar);
    expect(reversePath).toMatch(/\/operational-overlays\/calendar-exceptions\/calendar-id\/reverse$/);
    expect(reverseOptions.method).toBe('POST');
    expect(JSON.parse(String(reverseOptions.body))).toEqual(reverse);
  });

  it('filters dispositions by subject, without broad school-wide enumeration', async () => {
    const fetcher = mockFetch();
    await operationalOverlaysApi.listLessonDispositions({
      academicYearId: 'year-id', subjectId: 'subject-id', sourceCivilDate: '2026-10-21', status: 'REVERSED',
    });
    const [path] = fetcher.mock.calls[0] as unknown as [string];
    const url = new URL(path, 'https://example.test');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      academicYearId: 'year-id', subjectId: 'subject-id', sourceCivilDate: '2026-10-21', status: 'REVERSED',
    });
  });

  it('creates disposition and reverses with exact existing endpoint', async () => {
    const fetcher = mockFetch();
    await operationalOverlaysApi.createLessonDisposition(disposition);
    await operationalOverlaysApi.reverseLessonDisposition('disposition-id', reverse);
    const [createPath, createOptions] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    const [reversePath, reverseOptions] = fetcher.mock.calls[1] as unknown as [string, RequestInit];
    expect(createPath).toMatch(/\/operational-overlays\/lesson-dispositions$/);
    expect(JSON.parse(String(createOptions.body))).toEqual(disposition);
    expect(reversePath).toMatch(/\/operational-overlays\/lesson-dispositions\/disposition-id\/reverse$/);
    expect(JSON.parse(String(reverseOptions.body))).toEqual(reverse);
  });

  it('loads detail by encoded identifier without exposing a new mutation', async () => {
    const fetcher = mockFetch();
    await operationalOverlaysApi.getCalendarException('id/unsafe');
    await operationalOverlaysApi.getLessonDisposition('id/unsafe');
    const paths = fetcher.mock.calls.map((call) => String((call as unknown as [string])[0]));
    expect(paths[0]).toContain('calendar-exceptions/id%2Funsafe');
    expect(paths[1]).toContain('lesson-dispositions/id%2Funsafe');
  });
});
