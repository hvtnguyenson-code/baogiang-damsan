import type { ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { Button } from './button';
import { ErrorFeedback, InlineAlert, LoadingState } from './feedback';

export function PageHeader({ eyebrow, title, children, action }: { eyebrow: string; title: string; children: ReactNode; action?: ReactNode }) {
  return <header className="page-heading page-heading--rail management-heading"><div className="margin-rail" aria-hidden="true" /><div><p className="utility-label">{eyebrow}</p><div className="management-heading__row"><div><h1>{title}</h1><p>{children}</p></div>{action}</div></div></header>;
}

export function DataTable({ label, headings, children, className }: { label: string; headings: string[]; children: ReactNode; className?: string }) {
  return <div className={`table-region ${className ?? ''}`} role="region" aria-label={label} tabIndex={0}><table><thead><tr>{headings.map((heading) => <th key={heading} scope="col">{heading}</th>)}</tr></thead><tbody>{children}</tbody></table></div>;
}

export function Pagination({ page, pageSize, total, onPage, ariaLabel }: { page: number; pageSize: number; total: number; onPage(page: number): void; ariaLabel?: string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return <nav className="pagination" aria-label={ariaLabel ?? 'Phân trang'}><p>Trang <strong>{page}</strong> / {pages} · {total} bản ghi</p><div><Button type="button" variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>Trang trước</Button><Button type="button" variant="secondary" disabled={page >= pages} onClick={() => onPage(page + 1)}>Trang sau</Button></div></nav>;
}

export function StatusText({ active, activeLabel = 'Đang hoạt động', inactiveLabel = 'Đã kết thúc', inactiveTone = 'warning' }: { active: boolean; activeLabel?: string; inactiveLabel?: string; inactiveTone?: 'warning' | 'error' }) {
  return <span className={`status-badge ${active ? 'status-badge--active' : `status-badge--${inactiveTone === 'error' ? 'error' : 'inactive'}`}`}>{active ? activeLabel : inactiveLabel}</span>;
}

export function EmptyState({ filtered = false, title, message, action }: { filtered?: boolean; title?: string; message?: string; action?: ReactNode }) {
  return <div className="empty-state"><h2>{title ?? (filtered ? 'Không có kết quả phù hợp' : 'Chưa có dữ liệu')}</h2><p>{message ?? (filtered ? 'Hãy điều chỉnh điều kiện lọc rồi thử lại.' : 'Chưa có bản ghi để hiển thị.')}</p>{action}</div>;
}

export function QueryFailure({ error, retry }: { error: unknown; retry(): void }) {
  return <ErrorFeedback error={error} retry={retry} />;
}

export function MutationNotice({ error, success }: { error?: unknown; success?: string }) {
  if (error) {
    return <ErrorFeedback error={error} title="Chưa thể lưu thay đổi" />;
  }
  if (success) return <InlineAlert title="Đã hoàn tất" tone="success">{success}</InlineAlert>;
  return null;
}

export function SelectField({ label, id, children, hint, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { label: string; id: string; hint?: string; children: ReactNode }) {
  return <div className="form-field"><label className="form-field__label" htmlFor={id}>{label}</label>{hint && <p className="form-field__hint" id={`${id}-hint`}>{hint}</p>}<select {...props} id={id} className="form-field__input" aria-describedby={hint ? `${id}-hint` : undefined}>{children}</select></div>;
}

export function TextareaField({ label, id, hint, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; id: string; hint?: string }) {
  return <div className="form-field"><label className="form-field__label" htmlFor={id}>{label}</label>{hint && <p className="form-field__hint" id={`${id}-hint`}>{hint}</p>}<textarea {...props} id={id} className="form-field__input form-field__textarea" aria-describedby={hint ? `${id}-hint` : undefined} /></div>;
}

export function FormSection({ title, children }: { title: string; children: ReactNode }) { return <fieldset className="form-section"><legend>{title}</legend>{children}</fieldset>; }
export function PageLoading() { return <LoadingState label="Đang tải dữ liệu" />; }
