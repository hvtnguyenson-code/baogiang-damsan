import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateWebPushSubscriptionDto,
  InAppNotificationItem,
} from '@baogiang/contracts';
import { Button } from '../components/ui/button';
import {
  createWebPushSubscription,
  fetchNotificationAction,
  fetchNotificationPushConfig,
  fetchNotifications,
  fetchUnreadNotificationCount,
  fetchWebPushSubscriptions,
  markNotificationRead,
  revokeWebPushSubscription,
} from '../lib/api-client';

type TabFilter = 'ALL' | 'UNREAD' | 'ACTION_REQUIRED';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function formatNotificationTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    if (diffMins < 1) return 'Vừa xong';
    if (diffMins < 60) return `${diffMins} phút trước`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} giờ trước`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays} ngày trước`;
    return date.toLocaleDateString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return isoString;
  }
}

export function NotificationsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabFilter>('ALL');
  const [actionError, setActionError] = useState<string | null>(null);
  const [pushStatusMessage, setPushStatusMessage] = useState<string | null>(null);

  // Client-determined browser notification state
  const isPushSupported = typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator;
  const [browserPermission, setBrowserPermission] = useState<NotificationPermission>(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'default',
  );

  const notificationsQuery = useQuery({
    queryKey: ['notifications-list'],
    queryFn: () => fetchNotifications(undefined, 50),
  });

  const unreadCountQuery = useQuery({
    queryKey: ['notifications-unread-count'],
    queryFn: fetchUnreadNotificationCount,
    refetchInterval: 30_000,
  });

  const pushConfigQuery = useQuery({
    queryKey: ['notifications-push-config'],
    queryFn: fetchNotificationPushConfig,
  });

  const subscriptionsQuery = useQuery({
    queryKey: ['notifications-subscriptions'],
    queryFn: fetchWebPushSubscriptions,
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications-list'] });
      void queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
    },
  });

  const revokeSubscriptionMutation = useMutation({
    mutationFn: (id: string) => revokeWebPushSubscription(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications-subscriptions'] });
      setPushStatusMessage('Đã hủy kích hoạt thiết bị thành công.');
    },
  });

  const handleOpenAction = useCallback(
    async (item: InAppNotificationItem) => {
      setActionError(null);
      try {
        if (!item.readAt) {
          await markReadMutation.mutateAsync(item.id);
        }
        const res = await fetchNotificationAction(item.id);
        if (res.targetUrl) {
          navigate(res.targetUrl);
        }
      } catch (err) {
        setActionError(
          err instanceof Error ? err.message : 'Không thể chuyển tới công việc được liên kết.',
        );
      }
    },
    [markReadMutation, navigate],
  );

  const handleSubscribePush = useCallback(async () => {
    setPushStatusMessage(null);
    if (!isPushSupported) {
      setPushStatusMessage('Trình duyệt hiện tại không hỗ trợ thông báo đẩy Web Push.');
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      setBrowserPermission(permission);

      if (permission !== 'granted') {
        setPushStatusMessage('Quyền nhận thông báo không được cấp trên trình duyệt.');
        return;
      }

      const vapidKey = pushConfigQuery.data?.vapidPublicKey;
      if (!vapidKey) {
        setPushStatusMessage('Máy chủ chưa bật cấu hình Web Push VAPID.');
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        const convertedKey = urlBase64ToUint8Array(vapidKey);
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: convertedKey as unknown as BufferSource,
        });
      }

      const subJson = subscription.toJSON();
      if (!subJson.endpoint || !subJson.keys?.p256dh || !subJson.keys?.auth) {
        throw new Error('Thông tin đăng ký thiết bị không đầy đủ.');
      }

      const dto: CreateWebPushSubscriptionDto = {
        endpoint: subJson.endpoint,
        keys: {
          p256dh: subJson.keys.p256dh,
          auth: subJson.keys.auth,
        },
        deviceLabel: navigator.userAgent.includes('Mobile') ? 'Điện thoại di động' : 'Máy tính làm việc',
      };

      await createWebPushSubscription(dto);
      await queryClient.invalidateQueries({ queryKey: ['notifications-subscriptions'] });
      setPushStatusMessage('Đã đăng ký nhận thông báo đẩy trên thiết bị này thành công.');
    } catch (err) {
      setPushStatusMessage(
        `Không thể kích hoạt thông báo đẩy: ${err instanceof Error ? err.message : 'Lỗi không xác định'}`,
      );
    }
  }, [isPushSupported, pushConfigQuery.data?.vapidPublicKey, queryClient]);

  const items = useMemo(() => {
    const all = notificationsQuery.data?.items ?? [];
    if (activeTab === 'UNREAD') {
      return all.filter((i) => !i.readAt);
    }
    if (activeTab === 'ACTION_REQUIRED') {
      return all.filter((i) => i.category === 'ACTION_REQUIRED');
    }
    return all;
  }, [notificationsQuery.data?.items, activeTab]);

  const unreadCount = unreadCountQuery.data?.count ?? 0;
  const actionRequiredCount = (notificationsQuery.data?.items ?? []).filter(
    (i) => i.category === 'ACTION_REQUIRED' && !i.resolvedAt,
  ).length;

  return (
    <div className="space-y-6">
      <header className="page-header border-b pb-4">
        <h1 className="text-2xl font-bold text-slate-900">Trung tâm thông báo</h1>
        <p className="text-sm text-slate-600 mt-1">
          Hộp thư thông báo cá nhân, theo dõi công việc cần xử lý và đăng ký nhận tin đẩy trên thiết bị.
        </p>
      </header>

      {actionError && (
        <div className="p-3 bg-rose-50 border border-rose-300 rounded text-sm text-rose-900" role="alert">
          {actionError}
        </div>
      )}

      {/* Tabs / Filter bar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-300 pb-2" role="tablist" aria-label="Bộ lọc thông báo">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'ALL'}
          className={`min-h-[44px] px-4 py-2 text-sm font-medium rounded transition-colors ${
            activeTab === 'ALL'
              ? 'bg-slate-900 text-white'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
          onClick={() => setActiveTab('ALL')}
        >
          Tất cả ({(notificationsQuery.data?.items ?? []).length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'UNREAD'}
          className={`min-h-[44px] px-4 py-2 text-sm font-medium rounded transition-colors flex items-center gap-1.5 ${
            activeTab === 'UNREAD'
              ? 'bg-blue-600 text-white'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
          onClick={() => setActiveTab('UNREAD')}
        >
          <span>Chưa đọc</span>
          {unreadCount > 0 && (
            <span className="px-1.5 py-0.5 text-xs bg-white text-blue-800 rounded-full font-bold">
              {unreadCount}
            </span>
          )}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'ACTION_REQUIRED'}
          className={`min-h-[44px] px-4 py-2 text-sm font-medium rounded transition-colors flex items-center gap-1.5 ${
            activeTab === 'ACTION_REQUIRED'
              ? 'bg-amber-700 text-white'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
          onClick={() => setActiveTab('ACTION_REQUIRED')}
        >
          <span>Cần xử lý</span>
          {actionRequiredCount > 0 && (
            <span className="px-1.5 py-0.5 text-xs bg-amber-200 text-amber-900 rounded-full font-bold">
              {actionRequiredCount}
            </span>
          )}
        </button>
      </div>

      {/* Main notification list */}
      <section aria-label="Danh sách thông báo" className="space-y-3">
        {notificationsQuery.isLoading && (
          <div className="p-8 text-center text-slate-600 bg-white border border-slate-300 rounded-lg">
            Đang tải thông báo...
          </div>
        )}

        {notificationsQuery.isError && (
          <div className="p-6 text-center bg-rose-50 border border-rose-300 rounded-lg space-y-3">
            <p className="text-rose-900 font-medium">Không thể tải danh sách thông báo.</p>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void notificationsQuery.refetch()}
            >
              Thử lại
            </Button>
          </div>
        )}

        {notificationsQuery.isSuccess && items.length === 0 && (
          <div className="p-8 text-center text-slate-600 bg-white border border-slate-300 rounded-lg">
            {activeTab === 'UNREAD'
              ? 'Bạn không có thông báo chưa đọc nào.'
              : activeTab === 'ACTION_REQUIRED'
              ? 'Không có công việc nào cần xử lý.'
              : 'Chưa có thông báo nào trong hộp thư.'}
          </div>
        )}

        {notificationsQuery.isSuccess &&
          items.map((item) => {
            const isUnread = !item.readAt;
            return (
              <article
                key={item.id}
                className={`p-4 rounded-lg border transition-shadow bg-white ${
                  isUnread
                    ? 'border-l-4 border-l-blue-600 border-slate-300 shadow-sm'
                    : 'border-slate-300'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="space-y-1.5 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-900 text-base">
                        {item.title}
                      </span>
                      {item.category === 'ACTION_REQUIRED' && (
                        <span className="px-2 py-0.5 text-xs font-semibold rounded bg-amber-100 text-amber-800 border border-amber-300">
                          Cần xử lý
                        </span>
                      )}
                      {item.category === 'INFORMATION' && (
                        <span className="px-2 py-0.5 text-xs font-medium rounded bg-blue-50 text-blue-700 border border-blue-200">
                          Thông tin
                        </span>
                      )}
                      {item.category === 'SYSTEM' && (
                        <span className="px-2 py-0.5 text-xs font-medium rounded bg-slate-100 text-slate-700 border border-slate-300">
                          Hệ thống
                        </span>
                      )}
                      {item.resolvedAt && (
                        <span className="px-2 py-0.5 text-xs font-medium rounded bg-teal-50 text-teal-800 border border-teal-300">
                          ✓ Đã giải quyết
                        </span>
                      )}
                      {isUnread && (
                        <span className="px-2 py-0.5 text-xs font-bold rounded bg-blue-600 text-white">
                          Mới
                        </span>
                      )}
                    </div>
                    <p className="text-slate-700 text-sm whitespace-pre-line leading-relaxed">
                      {item.body}
                    </p>
                    <div className="text-xs text-slate-500 pt-1">
                      {formatNotificationTime(item.createdAt)}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-2 sm:pt-0 self-end sm:self-start">
                    {item.actionKey && (
                      <Button
                        type="button"
                        variant="primary"
                        className="min-h-[44px]"
                        onClick={() => void handleOpenAction(item)}
                      >
                        Mở công việc
                      </Button>
                    )}
                    {isUnread && (
                      <Button
                        type="button"
                        variant="secondary"
                        className="min-h-[44px]"
                        loading={markReadMutation.isPending}
                        onClick={() => void markReadMutation.mutateAsync(item.id)}
                      >
                        Đã đọc
                      </Button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
      </section>

      {/* Web Push Configuration Section */}
      <section aria-labelledby="web-push-settings-heading" className="bg-white border border-slate-300 rounded-lg p-5 space-y-4">
        <div>
          <h2 id="web-push-settings-heading" className="text-lg font-bold text-slate-900">
            Cài đặt thông báo đẩy trên trình duyệt
          </h2>
          <p className="text-sm text-slate-600 mt-0.5">
            Nhận thông báo ngay cả khi không mở trang web. Tính năng này hoạt động độc lập và không làm mất dữ liệu hộp thư nếu tắt.
          </p>
        </div>

        {pushStatusMessage && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-900">
            {pushStatusMessage}
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
          <div className="space-y-1">
            <span className="text-sm font-semibold text-slate-800">
              Trạng thái quyền trình duyệt:{' '}
              {browserPermission === 'granted'
                ? 'Đã cho phép'
                : browserPermission === 'denied'
                ? 'Bị chặn'
                : 'Chưa cấp quyền'}
            </span>
            <p className="text-xs text-slate-500">
              {browserPermission === 'granted'
                ? 'Trình duyệt này đã sẵn sàng nhận thông báo đẩy từ hệ thống.'
                : browserPermission === 'denied'
                ? 'Vui lòng mở cài đặt quyền trang web của trình duyệt để gỡ chặn thông báo nếu cần.'
                : 'Nhấn nút bên cạnh để cấp quyền nhận tin đẩy trên thiết bị này.'}
            </p>
          </div>

          <Button
            type="button"
            variant="primary"
            className="min-h-[44px]"
            disabled={!isPushSupported || browserPermission === 'denied'}
            onClick={() => void handleSubscribePush()}
          >
            {browserPermission === 'granted' ? 'Kích hoạt lại thiết bị này' : 'Bật thông báo đẩy'}
          </Button>
        </div>

        {/* Device list */}
        <div className="space-y-2 pt-2">
          <h3 className="text-sm font-semibold text-slate-800">Thiết bị đang hoạt động</h3>
          {subscriptionsQuery.isLoading && (
            <p className="text-xs text-slate-500">Đang tải danh sách thiết bị...</p>
          )}
          {subscriptionsQuery.isSuccess && (subscriptionsQuery.data?.items ?? []).length === 0 && (
            <p className="text-xs text-slate-500">Chưa có thiết bị nào đăng ký nhận thông báo đẩy.</p>
          )}
          {subscriptionsQuery.isSuccess && (subscriptionsQuery.data?.items ?? []).length > 0 && (
            <div className="divide-y border rounded-lg bg-white">
              {(subscriptionsQuery.data?.items ?? []).map((sub) => (
                <div key={sub.id} className="p-3 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-slate-800">
                      {sub.deviceLabel || 'Thiết bị trình duyệt'}
                    </p>
                    <p className="text-xs text-slate-500">
                      Hoạt động: {formatNotificationTime(sub.lastSeenAt)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="quiet"
                    className="min-h-[44px] text-rose-700 hover:text-rose-900"
                    loading={revokeSubscriptionMutation.isPending}
                    onClick={() => void revokeSubscriptionMutation.mutateAsync(sub.id)}
                  >
                    Hủy đăng ký
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

