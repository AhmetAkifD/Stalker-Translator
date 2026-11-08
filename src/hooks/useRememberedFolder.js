import { useState, useEffect, useRef, useCallback } from 'react';
import { saveHandle, loadHandle } from '../utils/handleStore';

// Remembers each game's working folder (IndexedDB) and reopens it on the next visit.
// If the browser still has permission, the folder opens automatically. Otherwise browsers
// require one click before access is granted again, so `pending` holds the folder until then.
export function useRememberedFolder(storageKey, openFolder) {
  const [pending, setPending] = useState(null);
  const openRef = useRef(openFolder);
  useEffect(() => { openRef.current = openFolder; });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const handle = await loadHandle(storageKey);
      if (!handle || cancelled) return;
      let state = 'prompt';
      try { state = await handle.queryPermission({ mode: 'readwrite' }); } catch { /* old handle */ }
      if (cancelled) return;
      if (state === 'granted') await openRef.current(handle);
      else setPending(handle);
    })();
    return () => { cancelled = true; };
  }, [storageKey]);

  const remember = useCallback((handle) => {
    setPending(null);
    return saveHandle(storageKey, handle);
  }, [storageKey]);

  // Must be called from a click: asks the browser for access again and opens the folder.
  const reopen = useCallback(async () => {
    if (!pending) return;
    try {
      if ((await pending.requestPermission({ mode: 'readwrite' })) === 'granted') {
        const handle = pending;
        setPending(null);
        await openRef.current(handle);
      }
    } catch (err) {
      alert('Klasör açılamadı: ' + err.message);
    }
  }, [pending]);

  return { pending, reopen, remember, dismiss: () => setPending(null) };
}
