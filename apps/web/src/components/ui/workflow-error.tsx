import { ErrorFeedback, InlineAlert } from './feedback';

// Strings originate only from local validation; transport errors retain HTTP status.
export function WorkflowError({ error, title = 'Chưa thể tiếp tục' }: { error: Error | string | null; title?: string }) {
  if (!error) return null;
  return typeof error === 'string'
    ? <InlineAlert title={title}><p>{error}</p></InlineAlert>
    : <ErrorFeedback error={error} title={title} retry={() => window.location.reload()} />;
}
