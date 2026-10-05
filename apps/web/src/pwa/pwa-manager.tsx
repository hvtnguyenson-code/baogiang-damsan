import { useEffect, useState, useCallback, useRef } from 'react';
import { PwaUpdateNotice } from './pwa-update-notice';

export function PwaManager() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const updateServiceWorkerRef = useRef<((reloadPage?: boolean) => Promise<void>) | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    let isMounted = true;
    import('virtual:pwa-register')
      .then(({ registerSW }) => {
        if (!isMounted) return;
        const update = registerSW({
          immediate: true,
          onNeedRefresh() {
            setNeedRefresh(true);
            setDismissed(false);
          },
          onOfflineReady() {
            // Per spec §10: Do not display an "offline ready" marketing message.
          },
        });
        updateServiceWorkerRef.current = update;
      })
      .catch(() => {
        // Safe graceful degradation if virtual:pwa-register is not available (e.g. tests or dev)
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleUpdate = useCallback(async () => {
    if (updateServiceWorkerRef.current) {
      await updateServiceWorkerRef.current(true);
    } else {
      window.location.reload();
    }
  }, []);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
  }, []);

  return (
    <PwaUpdateNotice
      isOpen={needRefresh && !dismissed}
      onUpdate={handleUpdate}
      onDismiss={handleDismiss}
    />
  );
}
