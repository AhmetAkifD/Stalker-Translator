// Remembers the working folder handle between visits (IndexedDB can store FileSystemDirectoryHandle).
const DB = 'game-translator';
const STORE = 'handles';

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error);
  });
}

export async function saveHandle(key, handle) {
  try { await tx('readwrite', (s) => s.put(handle, key)); } catch (e) { console.warn('Handle could not be saved', e); }
}

export async function loadHandle(key) {
  try { return (await tx('readonly', (s) => s.get(key))) || null; } catch { return null; }
}
