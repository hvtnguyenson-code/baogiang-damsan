import type { ReactNode } from 'react';
import { Button } from './button';

export function InlineAlert({ title, children, tone = 'error', focusRef }: {
  title: string;
  children: ReactNode;
  tone?: 'error' | 'warning' | 'success';
  focusRef?: React.Ref<HTMLDivElement>;
}) {
  return (
    <div ref={focusRef} className={`alert alert--${tone}`} role={tone === 'error' ? 'alert' : 'status'} tabIndex={-1}>
      <strong>{title}</strong>
      <div>{children}</div>
    </div>
  );
}

export function LoadingState({ label }: { label: string }) {
  return <div className="loading-state" role="status" aria-label={label}><span className="loading-state__mark" aria-hidden="true" /><p>{label}</p></div>;
}

export function RecoveryState({ title, message, actionLabel, onAction }: {
  title: string;
  message: string;
  actionLabel: string;
  onAction(): void;
}) {
  return (
    <section className="recovery-state" aria-labelledby="recovery-title">
      <div className="margin-rail" aria-hidden="true" />
      <div>
        <h1 id="recovery-title">{title}</h1>
        <p>{message}</p>
        <Button type="button" variant="secondary" onClick={onAction}>{actionLabel}</Button>
      </div>
    </section>
  );
}
