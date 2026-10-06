import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PwaUpdateNotice } from '../pwa-update-notice';

describe('PwaUpdateNotice', () => {
  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <PwaUpdateNotice isOpen={false} onUpdate={vi.fn()} onDismiss={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders the compact update notice with exact Vietnamese copy and accessible live region when isOpen is true', () => {
    render(
      <PwaUpdateNotice isOpen={true} onUpdate={vi.fn()} onDismiss={vi.fn()} />,
    );

    const notice = screen.getByRole('status');
    expect(notice).toBeInTheDocument();
    expect(notice).toHaveAttribute('aria-live', 'polite');
    expect(notice).toHaveAttribute('aria-label', 'Thông báo cập nhật ứng dụng');

    // Factual Vietnamese notice
    expect(screen.getByText('Có phiên bản mới của Báo giảng.')).toBeInTheDocument();

    // Primary action
    const updateButton = screen.getByRole('button', { name: 'Tải lại để cập nhật' });
    expect(updateButton).toBeInTheDocument();

    // Secondary action
    const dismissButton = screen.getByRole('button', { name: 'Để sau' });
    expect(dismissButton).toBeInTheDocument();
  });

  it('invokes onUpdate when "Tải lại để cập nhật" is clicked', async () => {
    const user = userEvent.setup();
    const handleUpdate = vi.fn();
    const handleDismiss = vi.fn();

    render(
      <PwaUpdateNotice isOpen={true} onUpdate={handleUpdate} onDismiss={handleDismiss} />,
    );

    const updateButton = screen.getByRole('button', { name: 'Tải lại để cập nhật' });
    await user.click(updateButton);

    expect(handleUpdate).toHaveBeenCalledTimes(1);
    expect(handleDismiss).not.toHaveBeenCalled();
  });

  it('invokes onDismiss when "Để sau" is clicked', async () => {
    const user = userEvent.setup();
    const handleUpdate = vi.fn();
    const handleDismiss = vi.fn();

    render(
      <PwaUpdateNotice isOpen={true} onUpdate={handleUpdate} onDismiss={handleDismiss} />,
    );

    const dismissButton = screen.getByRole('button', { name: 'Để sau' });
    await user.click(dismissButton);

    expect(handleDismiss).toHaveBeenCalledTimes(1);
    expect(handleUpdate).not.toHaveBeenCalled();
  });
});
