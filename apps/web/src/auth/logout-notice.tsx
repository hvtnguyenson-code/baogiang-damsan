import { useAuth } from './auth-context';
import { Button } from '../components/ui/button';
import { InlineAlert } from '../components/ui/feedback';

export function LogoutNotice() {
  const auth = useAuth();
  if (!auth.logoutError) return null;

  const message = auth.logoutError.statusCode === 0
    ? 'Không thể kết nối để đăng xuất. Kiểm tra kết nối rồi thử lại.'
    : auth.logoutError.statusCode >= 500
      ? 'Hệ thống tạm thời chưa thể đăng xuất. Vui lòng thử lại.'
      : 'Chưa thể đăng xuất. Vui lòng thử lại.';

  return (
    <InlineAlert title="Chưa thể đăng xuất">
      <p>{message}</p>
      <Button aria-label="Thử đăng xuất lại" type="button" variant="secondary" loading={auth.isMutating} onClick={() => void auth.logout().catch(() => undefined)}>
        Thử đăng xuất lại
      </Button>
    </InlineAlert>
  );
}
