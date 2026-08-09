import type { ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { Button } from './button';
import { InlineAlert, LoadingState } from './feedback';
import { ApiError } from '../../lib/api-client';

export function PageHeader({ eyebrow, title, children, action }: { eyebrow: string; title: string; children: ReactNode; action?: ReactNode }) {
  return <header className="page-heading page-heading--rail management-heading"><div className="margin-rail" aria-hidden="true" /><div><p className="utility-label">{eyebrow}</p><div className="management-heading__row"><div><h1>{title}</h1><p>{children}</p></div>{action}</div></div></header>;
}

export function DataTable({ label, headings, children }: { label: string; headings: string[]; children: ReactNode }) {
  return <div className="table-region" role="region" aria-label={label} tabIndex={0}><table><thead><tr>{headings.map((heading) => <th key={heading} scope="col">{heading}</th>)}</tr></thead><tbody>{children}</tbody></table></div>;
}

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage(page: number): void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return <nav className="pagination" aria-label="Phân trang"><p>Trang <strong>{page}</strong> / {pages} · {total} bản ghi</p><div><Button type="button" variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>Trang trước</Button><Button type="button" variant="secondary" disabled={page >= pages} onClick={() => onPage(page + 1)}>Trang sau</Button></div></nav>;
}

export function StatusText({ active, activeLabel = 'Đang hoạt động', inactiveLabel = 'Đã kết thúc' }: { active: boolean; activeLabel?: string; inactiveLabel?: string }) {
  return <span className={`status-badge ${active ? 'status-badge--active' : 'status-badge--inactive'}`}>{active ? activeLabel : inactiveLabel}</span>;
}

export function EmptyState({ filtered = false, title, message }: { filtered?: boolean; title?: string; message?: string }) {
  return <div className="empty-state"><h2>{title ?? (filtered ? 'Không có kết quả phù hợp' : 'Chưa có dữ liệu')}</h2><p>{message ?? (filtered ? 'Hãy điều chỉnh điều kiện lọc rồi thử lại.' : 'Dữ liệu sẽ xuất hiện tại đây sau khi được tạo.')}</p></div>;
}

export function QueryFailure({ error, retry }: { error: unknown; retry(): void }) {
  const message = error instanceof ApiError && error.statusCode === 403 ? 'Bạn không còn quyền truy cập khu vực này.' : 'Không thể tải dữ liệu. Dữ liệu hiện có chưa bị thay đổi.';
  return <InlineAlert title="Chưa tải được dữ liệu"><p>{message}</p><Button type="button" variant="secondary" onClick={retry}>Thử lại</Button></InlineAlert>;
}

export function MutationNotice({ error, success }: { error?: unknown; success?: string }) {
  if (success) return <InlineAlert title="Đã hoàn tất" tone="success">{success}</InlineAlert>;
  if (!error) return null;
  const status = error instanceof ApiError ? error.statusCode : 0;
  const message = status === 409 ? 'Dữ liệu xung đột với bản ghi hiện có. Hãy giữ nguyên biểu mẫu, kiểm tra lại rồi thử lại.' : status === 403 ? 'Bạn không có quyền thực hiện thao tác này.' : status === 404 ? 'Bản ghi không còn tồn tại. Hãy tải lại danh sách.' : status === 400 || status === 422 ? 'Một số giá trị chưa hợp lệ. Hãy kiểm tra lại biểu mẫu.' : 'Không thể hoàn tất yêu cầu. Hãy thử lại khi kết nối ổn định.';
  return <InlineAlert title="Chưa thể lưu thay đổi">{message}</InlineAlert>;
}

export function SelectField({ label, id, children, hint, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { label: string; id: string; hint?: string; children: ReactNode }) {
  return <div className="form-field"><label className="form-field__label" htmlFor={id}>{label}</label>{hint && <p className="form-field__hint" id={`${id}-hint`}>{hint}</p>}<select {...props} id={id} className="form-field__input" aria-describedby={hint ? `${id}-hint` : undefined}>{children}</select></div>;
}

export function TextareaField({ label, id, hint, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; id: string; hint?: string }) {
  return <div className="form-field"><label className="form-field__label" htmlFor={id}>{label}</label>{hint && <p className="form-field__hint" id={`${id}-hint`}>{hint}</p>}<textarea {...props} id={id} className="form-field__input form-field__textarea" aria-describedby={hint ? `${id}-hint` : undefined} /></div>;
}

export function FormSection({ title, children }: { title: string; children: ReactNode }) { return <fieldset className="form-section"><legend>{title}</legend>{children}</fieldset>; }
export function PageLoading() { return <LoadingState label="Đang tải dữ liệu" />; }
