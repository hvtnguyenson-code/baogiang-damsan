import type { UserManagementRecord } from '@baogiang/contracts';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LeadershipAppointmentsPanel } from '../components/LeadershipAppointmentsPanel';
import type { LeadershipCommand, LeadershipContext, LeadershipPreview } from '../lib/b1-leadership-api';
import { jsonResponse, renderWithQuery } from './test-utils';

const id = '11111111-1111-4111-8111-111111111111';
const admin = '22222222-2222-4222-8222-222222222222';
const oldId = '33333333-3333-4333-8333-333333333333';
const appointmentId = '44444444-4444-4444-8444-444444444444';
const target = { id, username: 'teacher-fixture', status: 'ACTIVE', profile: {
  displayName: 'Nhân sự kiểm thử', isTeachingStaff: true,
} } as UserManagementRecord;
const holder = { appointmentId, userId: oldId, username: 'old-fixture',
  displayName: 'Người bàn giao', validFrom: '2026-11-22T00:00:00Z' };
const context: LeadershipContext = { role: 'PRINCIPAL', mode: 'READ_ONLY', canConfirm: false,
  commandSubmissionReady: true, verifiedTechnicalSeat: true, activationBlockers: [],
  seatEnabled: true, expectedSeatVersion: '1', expectedAuthorizationEpoch: '42',
  inventoryTruncated: false, activeAppointments: [],
};
const preview: LeadershipPreview = { role: 'PRINCIPAL', targetUserId: id, mode: 'READ_ONLY',
  canConfirm: false, provenanceVerified: false, eligibleTeachingStaff: true,
  inventoryTruncated: false, requiredCount: 2, capabilities: [
    { capabilityKey: 'TEACHER_BASE', scopeType: 'PERSONAL',
      sourceManagedByFullRoleWriter: false, state: 'ACTIVE_LEGACY_UNLINKED' },
    { capabilityKey: 'AUDIT_VIEW', scopeType: 'SCHOOL_WIDE',
      sourceManagedByFullRoleWriter: true, state: 'MISSING' },
  ] };
function setup(options: {
  ctx?: Partial<LeadershipContext>; pre?: Partial<LeadershipPreview>;
  actor?: string; responses?: number[];
} = {}) {
  const writes: LeadershipCommand[] = [];
  const statusCodes = [...(options.responses ?? [200])];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('command-context')) return jsonResponse({ ...context, ...options.ctx });
    if (url.includes('operability-preview')) return jsonResponse({ ...preview, ...options.pre });
    if (url.endsWith('/role-appointments/commands') && init?.method === 'POST') {
      const body = JSON.parse(String(init.body)) as LeadershipCommand;
      writes.push(body);
      const status = statusCodes.shift() ?? 200;
      return status === 200 ? jsonResponse({ state: 'APPLIED', operation: body.operation,
        role: body.role, targetUserId: body.targetUserId, sourcesOpened: 2, sourcesClosed: 0 })
        : jsonResponse({ message: 'RAW_INTERNAL_FIXTURE' }, status);
    }
    throw new Error('Unexpected endpoint');
  });
  vi.stubGlobal('fetch', fetchMock);
  renderWithQuery(<LeadershipAppointmentsPanel user={target} actorId={options.actor ?? admin} />);
  return { writes, fetchMock, user: userEvent.setup() };
}
const check = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: 'Kiểm tra chức trách' }));
  await screen.findByRole('heading', { name: 'Người đang giữ chức trách' });
};
const affirm = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('checkbox', { name: /Tôi xác nhận/ }));
  await user.click(screen.getByRole('button', { name: /Xác nhận ghi nhận/ }));
};

describe('P5-057 leadership UI command boundary', () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  it('keeps the request read-only while any cutover gate is closed', async () => {
    const { writes, fetchMock, user } = setup({ ctx: {
      commandSubmissionReady: false, activationBlockers: ['B1_ROLE_COMMANDS_ENABLED'],
    } });
    await check(user);
    expect(screen.getByText('Chưa thể ghi nhận chức trách')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Tôi xác nhận/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Xác nhận ghi nhận/ })).toBeDisabled();
    expect(writes).toHaveLength(0);
    expect(fetchMock.mock.calls.every(([, init]) => init?.method !== 'POST')).toBe(true);
    expect(screen.queryByText('B1_ROLE_COMMANDS_ENABLED')).not.toBeInTheDocument();
  });
  it('uses named incumbent and exact seat/epoch tokens for a deliberate transfer', async () => {
    const { writes, user } = setup({ ctx: { activeAppointments: [holder] } });
    await check(user);
    expect(screen.getByLabelText('Thao tác')).toHaveValue('TRANSFER');
    expect(screen.getByLabelText('Người bàn giao chức trách')).toHaveValue(appointmentId);
    expect(screen.getByRole('option', { name: /Người bàn giao/ })).toBeInTheDocument();
    await affirm(user);
    await screen.findByText('Ghi nhận chuyển giao Hiệu trưởng thành công.');
    expect(writes).toHaveLength(1);
    expect(writes[0]).toEqual({ role: 'PRINCIPAL', operation: 'TRANSFER', targetUserId: id,
      previousUserId: oldId, expectedAppointmentId: appointmentId, expectedSeatVersion: '1',
      expectedAuthorizationEpoch: '42', requestKey: expect.stringMatching(/^b1-ui-/) });
  });
  it('dismisses the selected current office holder with no invented previous user', async () => {
    const { writes, user } = setup({ ctx: { activeAppointments: [{ ...holder, userId: id }] },
      pre: { eligibleTeachingStaff: false } });
    await check(user);
    expect(screen.getByLabelText('Thao tác')).toHaveValue('DISMISS');
    await affirm(user);
    await screen.findByText('Ghi nhận miễn nhiệm Hiệu trưởng thành công.');
    expect(writes[0]).toMatchObject({ operation: 'DISMISS', targetUserId: id, expectedAppointmentId: appointmentId });
    expect(writes[0]).not.toHaveProperty('previousUserId');
  });
  it('does not use the client to self-appoint or repair a missing teacher baseline', async () => {
    const a = setup({ actor: id });
    await check(a.user);
    expect(screen.getByRole('button', { name: /Xác nhận ghi nhận/ })).toBeDisabled();
    expect(a.writes).toHaveLength(0);
  });
  it('blocks missing independent personal rights and legacy school-wide conflicts', async () => {
    const { writes, user } = setup({ pre: { capabilities: [
      { ...preview.capabilities[0], state: 'MISSING' },
      { ...preview.capabilities[1], state: 'ACTIVE_LEGACY_UNLINKED' },
    ] } });
    await check(user);
    expect(screen.getByRole('button', { name: /Xác nhận ghi nhận/ })).toBeDisabled();
    expect(writes).toHaveLength(0);
  });
  it('reuses the exact request key after an ambiguous response, never automatically', async () => {
    const { writes, user } = setup({ responses: [500, 200] });
    await check(user);
    await affirm(user);
    const retry = await screen.findByRole('button', { name: 'Gửi lại đúng yêu cầu' });
    expect(writes).toHaveLength(1);
    expect(screen.queryByText('RAW_INTERNAL_FIXTURE')).not.toBeInTheDocument();
    await user.click(retry);
    await screen.findByText('Ghi nhận bổ nhiệm Hiệu trưởng thành công.');
    expect(writes).toHaveLength(2);
    expect(writes[1]).toEqual(writes[0]);
  });
  it('requires a fresh inspection after a conflict and does not silently retry it', async () => {
    const { writes, user } = setup({ responses: [409] });
    await check(user);
    await affirm(user);
    await screen.findByText('Chưa hoàn tất ghi nhận chức trách');
    expect(screen.queryByRole('button', { name: 'Gửi lại đúng yêu cầu' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Xác nhận ghi nhận/ })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Tải lại dữ liệu' }));
    await waitFor(() => expect(screen.getByRole('checkbox', { name: /Tôi xác nhận/ })).not.toBeChecked());
    expect(writes).toHaveLength(1);
  });
});
