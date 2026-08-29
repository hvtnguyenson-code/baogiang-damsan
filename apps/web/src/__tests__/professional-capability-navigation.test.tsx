import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CapabilityKey, CapabilityScope } from '@baogiang/contracts';
import { jsonResponse, normalAuth, renderApp } from './test-utils';

function authWith(capabilities: Array<{ key: CapabilityKey; scope: CapabilityScope; resourceId?: string }>) {
  return { ...normalAuth, capabilities };
}

describe('professional Reporting Statement routes', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('shows the personal workspace only for exact PERSONAL submit or read authority', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(authWith([{ key: 'REPORTING_STATEMENT_SUBMIT', scope: 'PERSONAL' }]))));
    renderApp('/');
    expect((await screen.findAllByRole('link', { name: 'Báo cáo kê khai' })).length).toBeGreaterThanOrEqual(1);
  });

  it('shows accessible reporting for SUBJECT read authority', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(authWith([{ key: 'REPORTING_STATEMENT_READ', scope: 'SUBJECT', resourceId: 'subject-1' }]))));
    renderApp('/');
    expect((await screen.findAllByRole('link', { name: 'Báo cáo được phép xem' })).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByRole('link', { name: 'Báo cáo kê khai' })).not.toBeInTheDocument();
  });

  it('shows approval only when school-wide approval and non-personal read are both present', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(authWith([
      { key: 'APPROVAL_PRINCIPAL', scope: 'SCHOOL_WIDE' },
      { key: 'REPORTING_STATEMENT_READ', scope: 'SCHOOL_WIDE' },
    ]))));
    renderApp('/');
    expect((await screen.findAllByRole('link', { name: 'Phê duyệt báo cáo' })).length).toBeGreaterThanOrEqual(1);
  });

  it('does not infer professional work from SYSTEM_ADMIN or an approval grant alone', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(authWith([
      { key: 'SYSTEM_ADMIN', scope: 'SCHOOL_WIDE' },
      { key: 'APPROVAL_VICE_PRINCIPAL', scope: 'SCHOOL_WIDE' },
    ]))));
    renderApp('/');
    await screen.findByRole('heading', { name: /chào/i });
    expect(screen.queryByRole('link', { name: 'Báo cáo kê khai' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Báo cáo được phép xem' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Phê duyệt báo cáo' })).not.toBeInTheDocument();
  });

  it('guards direct professional routes before rendering the page', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(authWith([]))));
    renderApp('/phe-duyet-bao-cao');
    expect(await screen.findByRole('heading', { name: /không có quyền thực hiện thao tác này/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Báo cáo chờ phê duyệt' })).not.toBeInTheDocument();
  });
});
