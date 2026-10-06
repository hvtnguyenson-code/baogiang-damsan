import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/auth-context';
import { PageHeader, StatusText } from '../components/ui/management';
import { Button } from '../components/ui/button';
import { InlineAlert, LoadingState } from '../components/ui/feedback';
import { capabilityLabels, scopeLabels } from '../lib/capabilities';
import {
  createTelegramLinkChallenge,
  fetchTelegramStatus,
  sendTelegramTestNotification,
  unlinkTelegram,
} from '../lib/api-client';
import type { TelegramTestNotificationResponse } from '@baogiang/contracts';

export function ProfilePage() {
  const { auth } = useAuth();
  const queryClient = useQueryClient();

  const [activeDeepLink, setActiveDeepLink] = useState<string | null>(null);
  const [challengeExpiresAt, setChallengeExpiresAt] = useState<string | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<TelegramTestNotificationResponse | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const testRequestKeyRef = useRef<string | null>(null);

  const telegramQuery = useQuery({
    queryKey: ['telegram-status'],
    queryFn: fetchTelegramStatus,
    refetchInterval: (query) => (query.state.data?.pendingChallenge ? 5000 : false),
  });

  const telegramData = telegramQuery.data;

  // Sync pending challenge expiresAt from query if not already set by mutation
  useEffect(() => {
    if (telegramData?.pendingChallenge?.expiresAt) {
      setChallengeExpiresAt(telegramData.pendingChallenge.expiresAt);
    } else if (!telegramData?.pendingChallenge) {
      if (!activeDeepLink) {
        setChallengeExpiresAt(null);
      }
    }
  }, [telegramData, activeDeepLink]);

  // Countdown timer for pending challenge
  useEffect(() => {
    if (!challengeExpiresAt) {
      setRemainingSeconds(null);
      return;
    }

    const updateRemaining = () => {
      const diff = Math.max(0, Math.floor((new Date(challengeExpiresAt).getTime() - Date.now()) / 1000));
      setRemainingSeconds(diff);
    };

    updateRemaining();
    const interval = setInterval(updateRemaining, 1000);
    return () => clearInterval(interval);
  }, [challengeExpiresAt]);

  const createChallengeMutation = useMutation({
    mutationFn: createTelegramLinkChallenge,
    onSuccess: (data) => {
      setActionError(null);
      setActiveDeepLink(data.deepLink);
      setChallengeExpiresAt(data.expiresAt);
      void queryClient.invalidateQueries({ queryKey: ['telegram-status'] });
    },
    onError: (error: Error) => {
      setActionError(error.message || 'Không thể tạo yêu cầu liên kết Telegram.');
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: unlinkTelegram,
    onSuccess: () => {
      setActionError(null);
      setActiveDeepLink(null);
      setChallengeExpiresAt(null);
      setTestResult(null);
      void queryClient.invalidateQueries({ queryKey: ['telegram-status'] });
    },
    onError: (error: Error) => {
      setActionError(error.message || 'Không thể hủy liên kết Telegram.');
    },
  });

  const testMutation = useMutation({
    mutationFn: (requestKey: string) => sendTelegramTestNotification({ requestKey }),
    onSuccess: (data) => {
      setActionError(null);
      setTestResult(data);
      testRequestKeyRef.current = null;
      void queryClient.invalidateQueries({ queryKey: ['telegram-status'] });
    },
    onError: (error: Error) => {
      setActionError(error.message || 'Không thể gửi tin nhắn thử nghiệm.');
    },
  });

  const handleSendTest = () => {
    setActionError(null);
    if (!testRequestKeyRef.current) {
      testRequestKeyRef.current = crypto.randomUUID();
    }
    testMutation.mutate(testRequestKeyRef.current);
  };

  const formatCountdown = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  if (!auth) return null;

  const isPendingLinking = Boolean(
    telegramData?.enabled &&
      !telegramData?.linked &&
      (telegramData?.pendingChallenge || activeDeepLink),
  );

  return (
    <div className="management-page">
      <PageHeader eyebrow="Hồ sơ cá nhân" title={auth.user.displayName}>
        Thông tin xác thực do hệ thống hiện có cung cấp. Trang này không thay đổi hồ sơ.
      </PageHeader>

      <section className="ledger-section" aria-labelledby="identity-heading">
        <h2 id="identity-heading">Thông tin tài khoản</h2>
        <dl className="detail-ledger">
          <div>
            <dt>Tên hiển thị</dt>
            <dd>{auth.user.displayName}</dd>
          </div>
          <div>
            <dt>Tên đăng nhập</dt>
            <dd className="technical-value">{auth.user.username}</dd>
          </div>
          <div>
            <dt>Trạng thái</dt>
            <dd>Đang hoạt động</dd>
          </div>
        </dl>
      </section>

      <section className="ledger-section" aria-labelledby="telegram-heading">
        <h2 id="telegram-heading">Tích hợp Telegram</h2>

        {actionError && (
          <InlineAlert title="Lỗi thao tác" tone="error">
            <p>{actionError}</p>
          </InlineAlert>
        )}

        {telegramQuery.isLoading ? (
          <LoadingState label="Đang kiểm tra trạng thái liên kết Telegram..." />
        ) : telegramQuery.isError ? (
          <InlineAlert title="Chưa tải được trạng thái Telegram" tone="error">
            <p>Không thể kết nối đến máy chủ để lấy trạng thái Telegram.</p>
            <Button type="button" variant="secondary" onClick={() => void telegramQuery.refetch()}>
              Thử lại
            </Button>
          </InlineAlert>
        ) : !telegramData?.enabled ? (
          <p className="muted-copy">Tính năng liên kết Telegram hiện đang tắt trên hệ thống.</p>
        ) : telegramData.linked ? (
          <div>
            <dl className="detail-ledger">
              <div>
                <dt>Trạng thái</dt>
                <dd>
                  <StatusText active={true} activeLabel="Đã liên kết" />
                </dd>
              </div>
              {telegramData.linkedAt && (
                <div>
                  <dt>Thời điểm liên kết</dt>
                  <dd className="technical-value">
                    {new Date(telegramData.linkedAt).toLocaleString('vi-VN')}
                  </dd>
                </div>
              )}
            </dl>

            {testResult && (
              <div style={{ marginTop: '16px' }}>
                {testResult.deliveryStatus === 'SENT' ? (
                  <InlineAlert title="Gửi tin thử thành công" tone="success">
                    <p>Tin nhắn thử nghiệm đã được gửi thành công đến Telegram của bạn.</p>
                  </InlineAlert>
                ) : (
                  <InlineAlert title="Lỗi gửi tin thử" tone="error">
                    <p>
                      Không thể gửi tin nhắn thử nghiệm (trạng thái: {testResult.deliveryStatus}).
                      {testResult.error ? ` Chi tiết: ${testResult.error}` : ''}
                    </p>
                  </InlineAlert>
                )}
              </div>
            )}

            <div className="form-actions" style={{ marginTop: '16px' }}>
              <Button
                type="button"
                variant="secondary"
                onClick={handleSendTest}
                loading={testMutation.isPending}
              >
                Gửi tin thử
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => unlinkMutation.mutate()}
                loading={unlinkMutation.isPending}
              >
                Hủy liên kết
              </Button>
            </div>
          </div>
        ) : isPendingLinking ? (
          <div>
            <dl className="detail-ledger">
              <div>
                <dt>Trạng thái</dt>
                <dd>
                  <StatusText
                    active={false}
                    inactiveLabel="Đang chờ liên kết"
                    inactiveTone="warning"
                  />
                </dd>
              </div>
              <div>
                <dt>Thời hạn yêu cầu</dt>
                <dd className="technical-value">
                  {remainingSeconds !== null && remainingSeconds > 0 ? (
                    <span>Còn {formatCountdown(remainingSeconds)}</span>
                  ) : (
                    <span style={{ color: '#a32929' }}>Yêu cầu đã hết hạn</span>
                  )}
                </dd>
              </div>
            </dl>

            <div className="form-actions" style={{ marginTop: '16px' }}>
              {activeDeepLink && remainingSeconds !== null && remainingSeconds > 0 && (
                <a
                  href={activeDeepLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="button button--primary"
                  style={{
                    minHeight: '44px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textDecoration: 'none',
                  }}
                >
                  Mở Telegram kết nối
                </a>
              )}
              <Button
                type="button"
                variant="secondary"
                onClick={() => createChallengeMutation.mutate()}
                loading={createChallengeMutation.isPending}
              >
                {remainingSeconds === 0 ? 'Tạo yêu cầu mới' : 'Tạo lại liên kết'}
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <p className="muted-copy">
              Chưa liên kết tài khoản với Telegram. Kết nối Telegram giúp bạn nhận thông báo từ Báo giảng Đam San.
            </p>
            <div className="form-actions" style={{ marginTop: '16px' }}>
              <Button
                type="button"
                variant="primary"
                onClick={() => createChallengeMutation.mutate()}
                loading={createChallengeMutation.isPending}
              >
                Liên kết Telegram
              </Button>
            </div>
          </div>
        )}
      </section>

      <section className="ledger-section" aria-labelledby="rights-heading">
        <h2 id="rights-heading">Phạm vi công việc hiện có</h2>
        {auth.capabilities.length === 0 ? (
          <p className="muted-copy">
            Chưa có phạm vi quản lý được giao. Bạn vẫn có thể dùng hồ sơ và các liên kết hệ thống công khai.
          </p>
        ) : (
          <ul className="rights-list">
            {auth.capabilities.map((grant, index) => (
              <li key={`${grant.key}-${grant.scope}-${grant.resourceId ?? index}`}>
                <strong>{capabilityLabels[grant.key] ?? grant.key}</strong>
                <span>
                  {scopeLabels[grant.scope]}
                  {grant.resourceId ? (
                    <small className="technical-value"> · mã tài nguyên {grant.resourceId}</small>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
