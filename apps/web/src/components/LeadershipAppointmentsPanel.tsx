import type { UserManagementRecord } from '@baogiang/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { ApiError } from '../lib/api-client';
import {
  leadershipApi, type LeadershipCommand, type LeadershipContext,
  type LeadershipOperation, type LeadershipPreview, type LeadershipRole,
} from '../lib/b1-leadership-api';
import { Button } from './ui/button';
import { ErrorFeedback, InlineAlert } from './ui/feedback';

const roleNames: Record<LeadershipRole, string> = {
  PRINCIPAL: 'Hiệu trưởng',
  VICE_PRINCIPAL_ACADEMIC: 'Phó Hiệu trưởng phụ trách chuyên môn',
};
const operationNames: Record<LeadershipOperation, string> = {
  APPOINT: 'Ghi nhận bổ nhiệm', DISMISS: 'Ghi nhận miễn nhiệm', TRANSFER: 'Ghi nhận chuyển giao',
};
type Snapshot = { context: LeadershipContext; preview: LeadershipPreview };

export function LeadershipAppointmentsPanel({ user, actorId }: {
  user: UserManagementRecord; actorId: string;
}) {
  const queryClient = useQueryClient();
  const [role, setRole] = useState<LeadershipRole>('PRINCIPAL');
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [operation, setOperation] = useState<LeadershipOperation>('APPOINT');
  const [previous, setPrevious] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [pendingCommand, setPendingCommand] = useState<LeadershipCommand | null>(null);
  const [success, setSuccess] = useState('');
  const lock = useRef(false);

  const inspection = useMutation({
    mutationFn: () => leadershipApi.inspect(role, user.id),
    retry: false,
    onSuccess: (value) => {
      const holders = value.context.activeAppointments;
      setSnapshot(value);
      setOperation(holders.some((a) => a.userId === user.id) ? 'DISMISS'
        : role === 'PRINCIPAL' && holders.length === 1 ? 'TRANSFER' : 'APPOINT');
      setPrevious(holders.length === 1 ? holders[0].appointmentId : '');
    },
  });
  const command = useMutation({
    mutationFn: leadershipApi.execute,
    retry: false,
    onSuccess: async (receipt, submitted) => {
      setSuccess(operationNames[receipt.operation] + ' ' + roleNames[submitted.role] + ' thành công.');
      setPendingCommand(null);
      setSnapshot(null);
      setConfirmed(false);
      await queryClient.invalidateQueries({ queryKey: ['users'] });
      await queryClient.invalidateQueries({ queryKey: ['delete-preflight', user.id] });
    },
  });
  const busy = inspection.isPending || command.isPending;
  const reset = () => {
    setSnapshot(null); setConfirmed(false); setPrevious(''); setPendingCommand(null);
    setSuccess(''); inspection.reset(); command.reset();
  };
  const inspect = () => { reset(); inspection.mutate(); };
  const context = snapshot?.context;
  const preview = snapshot?.preview;
  const holders = context?.activeAppointments ?? [];
  const current = holders.find((a) => a.userId === user.id);
  const other = holders.filter((a) => a.userId !== user.id && a.userId !== actorId && a.username);
  const outgoing = other.find((a) => a.appointmentId === previous);
  const eligible = preview?.eligibleTeachingStaff === true && preview.capabilities.length > 0 &&
    preview.capabilities.some((cap) => cap.scopeType === 'PERSONAL') &&
    preview.capabilities.every((cap) => cap.scopeType === 'PERSONAL'
      ? ['ACTIVE_LEGACY_UNLINKED', 'ACTIVE_LINKED_UNVERIFIED'].includes(cap.state)
      : cap.scopeType === 'SCHOOL_WIDE' && cap.sourceManagedByFullRoleWriter &&
        ['MISSING', 'ACTIVE_LINKED_UNVERIFIED'].includes(cap.state));
  const canSubmit = Boolean(context && preview && user.id !== actorId &&
    context.commandSubmissionReady === true && context.verifiedTechnicalSeat === true &&
    context.seatEnabled === true && context.activationBlockers.length === 0 &&
    context.inventoryTruncated === false && preview.inventoryTruncated === false &&
    holders.length < 32 && /^[1-9][0-9]{0,17}$/.test(context.expectedSeatVersion ?? '') &&
    /^(0|[1-9][0-9]{0,18})$/.test(context.expectedAuthorizationEpoch) &&
    (operation === 'DISMISS' ? current
      : eligible && !current && (operation === 'APPOINT'
        ? role !== 'PRINCIPAL' || holders.length === 0
        : outgoing && (role !== 'PRINCIPAL' || holders.length === 1))));

  // Retrying an ambiguous response uses exactly the same payload and key.
  // A conflict/denial requires deliberate re-inspection, not automatic resubmission.
  const uncertain = command.error instanceof ApiError &&
    (command.error.statusCode === 0 || command.error.statusCode >= 500);
  const send = async (submitted: LeadershipCommand) => {
    if (lock.current) return;
    lock.current = true;
    try { await command.mutateAsync(submitted); }
    catch { /* safe error is rendered from the mutation state */ }
    finally { lock.current = false; }
  };
  const confirm = () => {
    if (!context || !canSubmit || !confirmed || busy || pendingCommand || lock.current) return;
    const submitted: LeadershipCommand = {
      role, operation, targetUserId: user.id,
      expectedSeatVersion: context.expectedSeatVersion!,
      expectedAuthorizationEpoch: context.expectedAuthorizationEpoch,
      requestKey: 'b1-ui-' + crypto.randomUUID(),
      ...(operation === 'DISMISS' && current ? { expectedAppointmentId: current.appointmentId } : {}),
      ...(operation === 'TRANSFER' && outgoing ? {
        previousUserId: outgoing.userId, expectedAppointmentId: outgoing.appointmentId,
      } : {}),
    };
    setPendingCommand(submitted);
    void send(submitted);
  };

  return (
    <section className="p-4 space-y-4" aria-labelledby="leadership-title">
      <h2 id="leadership-title" className="text-base font-bold text-slate-900">Ghi nhận chức trách lãnh đạo</h2>
      <p className="text-sm text-slate-700">Ghi nhận theo quyết định của cấp có thẩm quyền. Hệ thống giữ lịch sử chức trách và nguồn quyền; không thay thế quyết định hành chính.</p>
      <div>
        <label className="form-field__label" htmlFor="leadership-duty">Chức trách</label>
        <select id="leadership-duty" className="form-field__input" value={role}
          disabled={busy || Boolean(pendingCommand)}
          onChange={(event) => { reset(); setRole(event.target.value as LeadershipRole); }}>
          <option value="PRINCIPAL">{roleNames.PRINCIPAL}</option>
          <option value="VICE_PRINCIPAL_ACADEMIC">{roleNames.VICE_PRINCIPAL_ACADEMIC}</option>
        </select>
      </div>
      <Button type="button" variant="secondary" loading={inspection.isPending} disabled={busy}
        onClick={inspect}>Kiểm tra chức trách</Button>
      {inspection.error && <ErrorFeedback error={inspection.error} retry={inspect} />}
      {success && <InlineAlert tone="success" title={success}><p>Kiểm tra lại trước khi thực hiện thao tác tiếp theo.</p></InlineAlert>}
      {context && preview && (
        <>
          <div className="border border-slate-300 rounded p-3 space-y-2">
            <h3 className="font-semibold">Người đang giữ chức trách</h3>
            {holders.length === 0 ? <p>Chưa có bản ghi chức trách đang hiệu lực.</p> :
              <ul className="space-y-1">{holders.map((a) => <li key={a.appointmentId}>
                {a.displayName || a.username || 'Chưa xác định được nhân sự'}{a.username ? ' (' + a.username + ')' : ''}
              </li>)}</ul>}
            <p className="text-sm">Quyền cần đối chiếu: {preview.requiredCount}. Hệ thống kiểm tra lại nguồn quyền khi xác nhận.</p>
          </div>
          {!context.commandSubmissionReady || !context.verifiedTechnicalSeat || context.activationBlockers.length > 0 ||
            !context.seatEnabled ? (
            <InlineAlert tone="warning" title="Chưa thể ghi nhận chức trách">
              <p>Luồng ghi nhận mới chưa được kích hoạt hoặc tài khoản quản trị chưa đủ chứng cứ thẩm quyền. Chỉ có thể xem thông tin hiện tại.</p>
            </InlineAlert>
          ) : null}
          <div>
            <label className="form-field__label" htmlFor="leadership-action">Thao tác</label>
            <select id="leadership-action" className="form-field__input" value={operation}
              disabled={busy || Boolean(pendingCommand)}
              onChange={(event) => { setOperation(event.target.value as LeadershipOperation); setConfirmed(false); }}>
              <option value="APPOINT" disabled={Boolean(current) || (role === 'PRINCIPAL' && holders.length !== 0)}>{operationNames.APPOINT}</option>
              <option value="DISMISS" disabled={!current}>{operationNames.DISMISS}</option>
              <option value="TRANSFER" disabled={Boolean(current) || other.length === 0}>{operationNames.TRANSFER}</option>
            </select>
          </div>
          {operation === 'TRANSFER' && <div>
            <label className="form-field__label" htmlFor="leadership-outgoing">Người bàn giao chức trách</label>
            <select id="leadership-outgoing" className="form-field__input" value={previous}
              disabled={busy || Boolean(pendingCommand)}
              onChange={(event) => { setPrevious(event.target.value); setConfirmed(false); }}>
              <option value="">Chọn người bàn giao</option>
              {other.map((a) => <option key={a.appointmentId} value={a.appointmentId}>{a.displayName || a.username} ({a.username})</option>)}
            </select>
          </div>}
          {context.commandSubmissionReady && !canSubmit &&
            <p role="status" className="text-sm text-amber-900">Chưa đủ dữ liệu hợp lệ cho thao tác đã chọn. Kiểm tra nhân sự, quyền chuyên môn và chức trách đang hiệu lực; không tự cấp thêm quyền.</p>}
          <label className="flex items-start gap-2 min-h-11">
            <input type="checkbox" checked={confirmed} disabled={!canSubmit || busy || Boolean(pendingCommand)}
              onChange={(event) => setConfirmed(event.target.checked)} />
            <span>Tôi xác nhận thực hiện theo quyết định của cấp có thẩm quyền.</span>
          </label>
          <Button type="button" variant={operation === 'DISMISS' ? 'danger' : 'primary'}
            loading={command.isPending} disabled={!canSubmit || !confirmed || busy || Boolean(pendingCommand)}
            onClick={confirm}>Xác nhận {operationNames[operation].toLocaleLowerCase('vi-VN')}</Button>
          {command.error && <ErrorFeedback error={command.error} title="Chưa hoàn tất ghi nhận chức trách" retry={inspect} />}
          {uncertain && pendingCommand && <Button type="button" variant="secondary" disabled={busy}
            onClick={() => void send(pendingCommand)}>Gửi lại đúng yêu cầu</Button>}
        </>
      )}
    </section>
  );
}
