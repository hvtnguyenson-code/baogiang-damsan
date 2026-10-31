import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

describe('public push worker privacy and navigation', () => {
  function worker() {
    const listeners: Record<string, (event: unknown) => void> = {};
    const showNotification = jest.fn().mockResolvedValue(undefined);
    const openWindow = jest.fn().mockResolvedValue(undefined);
    const self = {
      addEventListener: (name: string, handler: (event: unknown) => void) => { listeners[name] = handler; },
      registration: { showNotification }, clients: { matchAll: jest.fn().mockResolvedValue([]), openWindow },
    };
    runInNewContext(readFileSync(resolve(__dirname, '../../../web/public/push-worker.js'), 'utf8'), { self });
    return { listeners, showNotification, openWindow };
  }

  it.each([null, { title: 'Private name', body: 'Private report', clickUrl: 'https://evil.example' }])('renders fixed generic copy regardless of provider payload %j', async data => {
    const w = worker(); let pending: Promise<unknown> | undefined;
    w.listeners.push({ data: { json: () => data, text: () => 'Private data' }, waitUntil: (p: Promise<unknown>) => { pending = p; } });
    await pending;
    expect(w.showNotification).toHaveBeenCalledWith('Báo giảng Đam San', expect.objectContaining({
      body: 'Bạn có thông báo mới trong ứng dụng.', data: { clickUrl: '/thong-bao' },
    }));
    expect(JSON.stringify(w.showNotification.mock.calls)).not.toContain('Private');
  });

  it.each(['//evil.example', '/\\evil.example', '/other-route', 'https://evil.example'])('ignores forged click target %s', async clickUrl => {
    const w = worker(); let pending: Promise<unknown> | undefined;
    w.listeners.notificationclick({ notification: { close: jest.fn(), data: { clickUrl } }, waitUntil: (p: Promise<unknown>) => { pending = p; } });
    await pending;
    expect(w.openWindow).toHaveBeenCalledWith('/thong-bao');
  });
});
