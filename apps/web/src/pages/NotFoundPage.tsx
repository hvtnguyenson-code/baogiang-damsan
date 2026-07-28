import { Link } from 'react-router-dom';
import { HomeIcon } from '../components/icons';

/**
 * NotFoundPage - catch-all 404 route
 */
export function NotFoundPage() {
  return (
    <div className="max-w-md mx-auto text-center py-20">
      <div className="text-6xl font-bold text-brand-200 mb-4" aria-hidden="true">
        404
      </div>
      <h1 className="text-xl font-bold text-gray-900 mb-2">
        Trang không tồn tại
      </h1>
      <p className="text-gray-500 mb-8">
        Trang bạn đang tìm kiếm không có trong hệ thống.
      </p>
      <Link
        to="/"
        id="link-go-home"
        className="btn-primary inline-flex items-center gap-2"
      >
        <HomeIcon className="w-4 h-4" aria-hidden="true" />
        Về trang chủ
      </Link>
    </div>
  );
}
