import { useQuery } from '@tanstack/react-query';
import { Link, NavLink } from 'react-router-dom';
import { PageLoading, QueryFailure } from '../ui/management';
import { academicYearsApi } from '../../lib/academic-structure-api';
import { ApiError } from '../../lib/api-client';

export function AcademicYearWorkspace({ academicYearId, children }: { academicYearId: string; children: React.ReactNode }) {
  const year = useQuery({ queryKey: ['academic-year', academicYearId], queryFn: () => academicYearsApi.get(academicYearId) });
  if (year.isPending) return <PageLoading />;
  if (year.isError) return year.error instanceof ApiError && year.error.statusCode === 404 ? <section className="missing-resource" aria-labelledby="missing-year-heading"><h1 id="missing-year-heading">Không tìm thấy năm học này.</h1><p>Năm học có thể đã được thay đổi hoặc không còn trong sổ. Hãy trở về danh sách để chọn lại.</p><Link className="button button--secondary" to="/quan-tri/cau-truc-nam-hoc">Trở về sổ năm học</Link></section> : <QueryFailure error={year.error} retry={() => void year.refetch()} />;
  const base = `/quan-tri/cau-truc-nam-hoc/${academicYearId}`;
  return <div className="academic-workspace">
    <header className="academic-workspace__header">
      <p className="utility-label">Sổ quản trị học vụ</p>
      <h1>{year.data.name}</h1>
      <p><span className="technical-value">{year.data.code}</span> · Cấu trúc dùng chung cho lịch và lớp của năm học này.</p>
      <Link className="academic-workspace__back" to="/quan-tri/cau-truc-nam-hoc">← Trở về sổ năm học</Link>
    </header>
    <nav className="secondary-nav" aria-label="Cấu trúc năm học">
      <NavLink to={`${base}/lich`}>Lịch năm học</NavLink>
      <NavLink to={`${base}/lop`}>Lớp học</NavLink>
    </nav>
    {children}
  </div>;
}
