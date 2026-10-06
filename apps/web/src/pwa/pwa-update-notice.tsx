import { Button } from '../components/ui/button';

export interface PwaUpdateNoticeProps {
  isOpen: boolean;
  onUpdate: () => void;
  onDismiss: () => void;
}

export function PwaUpdateNotice({ isOpen, onUpdate, onDismiss }: PwaUpdateNoticeProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <aside
      className="pwa-update-notice"
      role="status"
      aria-live="polite"
      aria-label="Thông báo cập nhật ứng dụng"
    >
      <p className="pwa-update-notice__message">Có phiên bản mới của Báo giảng.</p>
      <div className="pwa-update-notice__actions">
        <Button type="button" variant="primary" onClick={onUpdate}>
          Tải lại để cập nhật
        </Button>
        <Button type="button" variant="secondary" onClick={onDismiss}>
          Để sau
        </Button>
      </div>
    </aside>
  );
}
