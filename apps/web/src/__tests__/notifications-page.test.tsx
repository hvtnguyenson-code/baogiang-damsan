import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as apiClient from '../lib/api-client';
import { NotificationsPage } from '../pages/NotificationsPage';
import { renderWithQuery } from './test-utils';

describe('NotificationsPage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const sampleNotifications = [
    {
      id: 'n-1',
      eventType: 'REPORTING_SUBMITTED',
      category: 'ACTION_REQUIRED' as const,
      priority: 'HIGH' as const,
      title: 'Báo cáo mới cần duyệt',
      body: 'Giáo viên Nguyễn Văn A đã gửi báo cáo.',
      actionKey: 'REPORTING_APPROVAL',
      createdAt: new Date().toISOString(),
      readAt: null,
      resolvedAt: null,
    },
    {
      id: 'n-2',
      eventType: 'REPORTING_DECIDED',
      category: 'INFORMATION' as const,
      priority: 'NORMAL' as const,
      title: 'Báo cáo đã được phê duyệt',
      body: 'Báo cáo kê khai của bạn đã được duyệt.',
      actionKey: 'REPORTING_VIEW',
      createdAt: new Date(Date.now() - 3600000).toISOString(),
      readAt: new Date().toISOString(),
      resolvedAt: null,
    },
  ];

  it('renders page header and list of notifications', async () => {
    vi.spyOn(apiClient, 'fetchNotifications').mockResolvedValue({
      items: sampleNotifications,
      nextCursor: null,
    });
    vi.spyOn(apiClient, 'fetchUnreadNotificationCount').mockResolvedValue({ count: 1 });
    vi.spyOn(apiClient, 'fetchNotificationPushConfig').mockResolvedValue({
      enabled: true,
      maxSubscriptionsPerUser: 5,
    });
    vi.spyOn(apiClient, 'fetchWebPushSubscriptions').mockResolvedValue({ items: [] });

    renderWithQuery(<NotificationsPage />, '/thong-bao');

    expect(await screen.findByRole('heading', { level: 1, name: 'Trung tâm thông báo' })).toBeInTheDocument();
    expect(await screen.findByText('Báo cáo mới cần duyệt')).toBeInTheDocument();
    expect(screen.getByText('Báo cáo đã được phê duyệt')).toBeInTheDocument();
    expect(screen.getAllByText('Cần xử lý').length).toBeGreaterThanOrEqual(1);
  });

  it('filters notifications by tab: UNREAD and ACTION_REQUIRED', async () => {
    vi.spyOn(apiClient, 'fetchNotifications').mockResolvedValue({
      items: sampleNotifications,
      nextCursor: null,
    });
    vi.spyOn(apiClient, 'fetchUnreadNotificationCount').mockResolvedValue({ count: 1 });
    vi.spyOn(apiClient, 'fetchNotificationPushConfig').mockResolvedValue({
      enabled: false,
      maxSubscriptionsPerUser: 5,
    });
    vi.spyOn(apiClient, 'fetchWebPushSubscriptions').mockResolvedValue({ items: [] });

    renderWithQuery(<NotificationsPage />, '/thong-bao');

    await screen.findByText('Báo cáo mới cần duyệt');

    // Click "Chưa đọc" filter button
    const unreadTab = screen.getByRole('button', { name: /Chưa đọc/i });
    fireEvent.click(unreadTab);

    expect(screen.getByText('Báo cáo mới cần duyệt')).toBeInTheDocument();
    expect(screen.queryByText('Báo cáo đã được phê duyệt')).not.toBeInTheDocument();

    // Click "Cần xử lý" filter button
    const actionTab = screen.getByRole('button', { name: /Cần xử lý/i });
    fireEvent.click(actionTab);

    expect(screen.getByText('Báo cáo mới cần duyệt')).toBeInTheDocument();
    expect(screen.queryByText('Báo cáo đã được phê duyệt')).not.toBeInTheDocument();
  });

  it('marks notification as read when clicking "Đã đọc"', async () => {
    vi.spyOn(apiClient, 'fetchNotifications').mockResolvedValue({
      items: [sampleNotifications[0]],
      nextCursor: null,
    });
    vi.spyOn(apiClient, 'fetchUnreadNotificationCount').mockResolvedValue({ count: 1 });
    vi.spyOn(apiClient, 'fetchNotificationPushConfig').mockResolvedValue({
      enabled: false,
      maxSubscriptionsPerUser: 5,
    });
    vi.spyOn(apiClient, 'fetchWebPushSubscriptions').mockResolvedValue({ items: [] });
    const markReadSpy = vi.spyOn(apiClient, 'markNotificationRead').mockResolvedValue({
      success: true,
      readAt: new Date().toISOString(),
    });

    renderWithQuery(<NotificationsPage />, '/thong-bao');

    const markReadBtn = await screen.findByRole('button', { name: 'Đã đọc' });
    fireEvent.click(markReadBtn);

    await waitFor(() => {
      expect(markReadSpy).toHaveBeenCalledWith('n-1');
    });
  });

  it('navigates to action route when clicking "Mở công việc"', async () => {
    vi.spyOn(apiClient, 'fetchNotifications').mockResolvedValue({
      items: [sampleNotifications[0]],
      nextCursor: null,
    });
    vi.spyOn(apiClient, 'fetchUnreadNotificationCount').mockResolvedValue({ count: 1 });
    vi.spyOn(apiClient, 'fetchNotificationPushConfig').mockResolvedValue({
      enabled: false,
      maxSubscriptionsPerUser: 5,
    });
    vi.spyOn(apiClient, 'fetchWebPushSubscriptions').mockResolvedValue({ items: [] });
    vi.spyOn(apiClient, 'markNotificationRead').mockResolvedValue({
      success: true,
      readAt: new Date().toISOString(),
    });
    const actionSpy = vi.spyOn(apiClient, 'fetchNotificationAction').mockResolvedValue({
      targetUrl: '/phe-duyet-bao-cao?revisionId=rev-1',
    });

    renderWithQuery(<NotificationsPage />, '/thong-bao');

    const actionBtn = await screen.findByRole('button', { name: 'Mở công việc' });
    fireEvent.click(actionBtn);

    await waitFor(() => {
      expect(actionSpy).toHaveBeenCalledWith('n-1');
    });
  });

  it('displays registered devices and allows revoking', async () => {
    vi.spyOn(apiClient, 'fetchNotifications').mockResolvedValue({
      items: [],
      nextCursor: null,
    });
    vi.spyOn(apiClient, 'fetchUnreadNotificationCount').mockResolvedValue({ count: 0 });
    vi.spyOn(apiClient, 'fetchNotificationPushConfig').mockResolvedValue({
      enabled: true,
      maxSubscriptionsPerUser: 5,
    });
    vi.spyOn(apiClient, 'fetchWebPushSubscriptions').mockResolvedValue({
      items: [
        {
          id: 'dev-1',
          deviceLabel: 'Máy tính trường học',
          createdAt: new Date().toISOString(),
          lastSeenAt: new Date().toISOString(),
        },
      ],
    });
    const revokeSpy = vi.spyOn(apiClient, 'revokeWebPushSubscription').mockResolvedValue({
      success: true,
    });

    renderWithQuery(<NotificationsPage />, '/thong-bao');

    expect(await screen.findByText('Máy tính trường học')).toBeInTheDocument();
    const revokeBtn = screen.getByRole('button', { name: 'Hủy đăng ký' });
    fireEvent.click(revokeBtn);

    await waitFor(() => {
      expect(revokeSpy).toHaveBeenCalledWith('dev-1');
    });
  });
});
