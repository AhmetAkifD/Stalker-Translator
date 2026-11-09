const BASE = '/api/metalgear';

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

export const detectGame = () => call('/detect');
export const validateGame = (gamePath) => call('/validate', { gamePath });
export const getStatus = (gamePath) => call('/status', { gamePath });
// English rows of one game: { rows: [{ id, section, index, text, translatable }] }
export const getSource = (gamePath, game) => call('/source', { gamePath, game });
// games = { mg1: [{ id, text }], mg2: [...] }
export const installPatch = (gamePath, games) => call('/install', { gamePath, games });
export const uninstallPatch = (gamePath) => call('/uninstall', { gamePath });
