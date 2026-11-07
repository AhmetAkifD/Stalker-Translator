const BASE = '/api/darkmessiah';

async function call(route, body) {
  const res = await fetch(BASE + route, body === undefined
    ? undefined
    : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error('Yerel yama servisine ulaşılamadı. Site "npm run dev" ile mi çalışıyor?');
  }
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

export function bytesToBase64(bytes) {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  return btoa(s);
}

export const detectGame = () => call('/detect');
export const validateGame = (gamePath) => call('/validate', { gamePath });
export const getStatus = (gamePath) => call('/status', { gamePath });
export const setLanguage = (gamePath, lang) => call('/language', { gamePath, lang });
export const uninstallPatch = (gamePath) => call('/uninstall', { gamePath });
export const installPatch = (gamePath, patch, enableTurkish) => call('/install', {
  gamePath,
  enableTurkish,
  files: patch.files.map((f) => ({ name: f.name, data: bytesToBase64(f.bytes) })),
  itemnames: patch.itemnames ? bytesToBase64(patch.itemnames) : null,
});
