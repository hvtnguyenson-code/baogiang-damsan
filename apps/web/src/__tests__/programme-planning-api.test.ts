import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../lib/api-client';
import {
  confirmGddpWorkbook,
  confirmHdtnWorkbook,
  createCommandId,
  getWorkspaceMasterDetail,
  getWorkspaceOptions,
  inspectGddpWorkbook,
  inspectHdtnWorkbook,
  materializeOccurrence,
  previewGddpWorkbook,
  previewHdtnWorkbook,
  programmePlanningApi,
  publishOccurrence,
  publishPlanVersion,
} from '../lib/programme-planning-api';
import { jsonResponse } from './test-utils';

describe('programme-planning-api client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('generates a valid UUIDv4 commandId', () => {
    const id1 = createCommandId();
    const id2 = createCommandId();
    expect(id1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(id2).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(id1).not.toBe(id2);
  });

  it('queries workspace options with or without academicYearId query parameter', async () => {
    const fetchMock = vi.fn().mockImplementation(() => jsonResponse({ academicYears: [], masters: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await getWorkspaceOptions();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/programme-planning/workspace/options',
      expect.objectContaining({ credentials: 'same-origin' }),
    );

    await getWorkspaceOptions('year-123');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/programme-planning/workspace/options?academicYearId=year-123',
      expect.objectContaining({ credentials: 'same-origin' }),
    );
  });

  it('queries workspace master detail by masterId', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        master: { id: 'master-1', label: 'HĐTN K10' },
        plan: null,
        occurrences: [],
        lifecycleSummary: { totalOccurrences: 0, materializedOccurrences: 0, attestedOccurrences: 0, isFullyMaterialized: false },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const res = await getWorkspaceMasterDetail('master-1');
    expect(res.master.id).toBe('master-1');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/programme-planning/workspace/masters/master-1',
      expect.objectContaining({ credentials: 'same-origin' }),
    );
  });

  it('inspects HĐTN workbook with FormData', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        sourceFileName: 'hdtn.xlsx',
        sheets: [],
        dataSheetFound: true,
        issues: [],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const file = new File(['dummy'], 'hdtn.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const res = await inspectHdtnWorkbook(file);

    expect(res.sourceFileName).toBe('hdtn.xlsx');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/programme-planning/hdtn-import/inspect',
      expect.objectContaining({
        method: 'POST',
        body: expect.any(FormData),
      }),
    );
    const body = fetchMock.mock.calls[0][1].body as FormData;
    expect(body.get('file')).toBe(file);
  });

  it('previews HĐTN workbook with FormData including academicYearId', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        sourceFileName: 'hdtn.xlsx',
        previewFingerprint: 'fp-1',
        canConfirm: true,
        blockingIssueCount: 0,
        warningCount: 0,
        totalRows: 5,
        rows: [],
        issues: [],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const file = new File(['dummy'], 'hdtn.xlsx');
    const res = await previewHdtnWorkbook(file, 'year-hdtn-1');

    expect(res.canConfirm).toBe(true);
    const call = fetchMock.mock.calls[0];
    expect(call[0]).toBe('/api/programme-planning/hdtn-import/preview');
    const body = call[1].body as FormData;
    expect(body.get('file')).toBe(file);
    expect(body.get('academicYearId')).toBe('year-hdtn-1');
  });

  it('confirms HĐTN workbook with FormData including fingerprint and commandId', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        outcome: 'CREATED',
        commandId: 'cmd-hdtn-1',
        programmeMasterId: 'master-hdtn-1',
        programmePlanVersionId: 'plan-hdtn-1',
        versionNumber: 1,
        status: 'DRAFT',
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const file = new File(['dummy'], 'hdtn.xlsx');
    const res = await confirmHdtnWorkbook(file, {
      academicYearId: 'year-hdtn-1',
      expectedPreviewFingerprint: 'fp-hdtn-expected',
      commandId: 'cmd-hdtn-1',
    });

    expect(res.programmeMasterId).toBe('master-hdtn-1');
    const call = fetchMock.mock.calls[0];
    expect(call[0]).toBe('/api/programme-planning/hdtn-import/confirm');
    const body = call[1].body as FormData;
    expect(body.get('file')).toBe(file);
    expect(body.get('academicYearId')).toBe('year-hdtn-1');
    expect(body.get('expectedPreviewFingerprint')).toBe('fp-hdtn-expected');
    expect(body.get('commandId')).toBe('cmd-hdtn-1');
  });

  it('inspects GDĐP workbook with FormData', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        sourceFileName: 'gddp.xlsx',
        sheets: [],
        dataSheetFound: true,
        issues: [],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const file = new File(['dummy'], 'gddp.xlsx');
    const res = await inspectGddpWorkbook(file);

    expect(res.sourceFileName).toBe('gddp.xlsx');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/programme-planning/gddp-import/inspect',
      expect.objectContaining({
        method: 'POST',
        body: expect.any(FormData),
      }),
    );
  });

  it('previews GDĐP workbook with FormData including gradeLevel when specified', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        sourceFileName: 'gddp.xlsx',
        previewFingerprint: 'fp-gddp-1',
        canConfirm: true,
        rows: [],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const file = new File(['dummy'], 'gddp.xlsx');
    await previewGddpWorkbook(file, 'year-gddp-1', 11);

    const call = fetchMock.mock.calls[0];
    expect(call[0]).toBe('/api/programme-planning/gddp-import/preview');
    const body = call[1].body as FormData;
    expect(body.get('file')).toBe(file);
    expect(body.get('academicYearId')).toBe('year-gddp-1');
    expect(body.get('gradeLevel')).toBe('11');
  });

  it('confirms GDĐP workbook with FormData including exact gradeLevel', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        outcome: 'CREATED',
        commandId: 'cmd-gddp-1',
        programmeMasterId: 'master-gddp-1',
        versionNumber: 1,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const file = new File(['dummy'], 'gddp.xlsx');
    const res = await confirmGddpWorkbook(file, {
      academicYearId: 'year-gddp-1',
      gradeLevel: 10,
      expectedPreviewFingerprint: 'fp-gddp-123',
      commandId: 'cmd-gddp-1',
    });

    expect(res.programmeMasterId).toBe('master-gddp-1');
    const body = fetchMock.mock.calls[0][1].body as FormData;
    expect(body.get('file')).toBe(file);
    expect(body.get('academicYearId')).toBe('year-gddp-1');
    expect(body.get('gradeLevel')).toBe('10');
    expect(body.get('expectedPreviewFingerprint')).toBe('fp-gddp-123');
    expect(body.get('commandId')).toBe('cmd-gddp-1');
  });

  it('publishes plan version with JSON payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 'plan-1', status: 'PUBLISHED' }));
    vi.stubGlobal('fetch', fetchMock);

    await publishPlanVersion('plan-1', {
      expectedRevision: 2,
      commandId: 'cmd-pub-plan',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/programme-planning/plan-versions/plan-1/publish',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ expectedRevision: 2, commandId: 'cmd-pub-plan' }),
      }),
    );
  });

  it('publishes occurrence with JSON payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 'occ-1', status: 'PUBLISHED' }));
    vi.stubGlobal('fetch', fetchMock);

    await publishOccurrence('occ-1', {
      expectedRevision: 1,
      commandId: 'cmd-pub-occ',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/programme-planning/occurrences/occ-1/publish',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ expectedRevision: 1, commandId: 'cmd-pub-occ' }),
      }),
    );
  });

  it('materializes occurrence with JSON payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([{ id: 'mat-act-1' }]));
    vi.stubGlobal('fetch', fetchMock);

    await materializeOccurrence('occ-1', {
      commandId: 'cmd-mat-occ',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/programme-planning/occurrences/occ-1/materialize',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ commandId: 'cmd-mat-occ' }),
      }),
    );
  });

  it('propagates API errors as ApiError', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: 'Xung đột phiên bản' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      programmePlanningApi.publishPlanVersion('plan-1', {
        expectedRevision: 1,
        commandId: 'cmd-1',
      }),
    ).rejects.toThrow(ApiError);
  });
});
