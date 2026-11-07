// Local API used by the Dark Messiah page to install / uninstall the Turkish patch.
// Browsers cannot write into "C:\Program Files (x86)" (the File System Access API blocks it),
// so these operations run inside the Vite dev/preview server (Node) on the user's own machine.
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';

const BASE = '/api/darkmessiah';
const GAME_DIR_NAME = 'Dark Messiah Might and Magic Single Player';
const ITEMNAMES_FILE = 'mm_itemnames_turkish.txt';
const INFO_FILE = 'turkce_yama.json';
const NAME_RE = /^[A-Za-z0-9_]+\.txt$/;
const MAX_BODY = 64 * 1024 * 1024;

const exists = async (p) => {
  try { await fs.access(p); return true; } catch { return false; }
};

function normalizeGameRoot(input) {
  if (typeof input !== 'string') return '';
  let p = input.trim().replace(/^"+|"+$/g, '');
  if (!p) return '';
  if (/mm\.exe$/i.test(p)) p = path.dirname(p);
  return path.resolve(p);
}

function gamePaths(root) {
  return {
    root,
    exe: path.join(root, 'mm.exe'),
    resource: path.join(root, 'mm', 'resource'),
    patchDir: path.join(root, 'mm', 'resource', 'turkish'),
    itemnames: path.join(root, 'mm', 'resource', ITEMNAMES_FILE),
    info: path.join(root, 'mm', 'resource', 'turkish', INFO_FILE),
    config: path.join(root, 'mm', 'cfg', 'config.cfg'),
  };
}

async function validateGame(input) {
  const root = normalizeGameRoot(input);
  if (!root) return { ok: false, error: 'Oyun yolu boş.' };
  const p = gamePaths(root);
  if (!(await exists(p.exe))) return { ok: false, root, error: 'Bu klasörde mm.exe bulunamadı.' };
  if (!(await exists(p.resource))) return { ok: false, root, error: 'mm\\resource klasörü bulunamadı.' };
  return { ok: true, root, exe: p.exe };
}

async function detectGame() {
  const steamRoots = ['C:\\Program Files (x86)\\Steam', 'C:\\Program Files\\Steam'];
  const candidates = [];
  for (const steam of steamRoots) {
    candidates.push(path.join(steam, 'steamapps', 'common', GAME_DIR_NAME));
    try {
      const vdf = await fs.readFile(path.join(steam, 'steamapps', 'libraryfolders.vdf'), 'utf8');
      for (const m of vdf.matchAll(/"path"\s+"([^"]+)"/g)) {
        candidates.push(path.join(m[1].replace(/\\\\/g, '\\'), 'steamapps', 'common', GAME_DIR_NAME));
      }
    } catch { /* no vdf here */ }
  }
  for (const c of candidates) {
    const v = await validateGame(c);
    if (v.ok) return v;
  }
  return { ok: false, error: 'Oyun otomatik bulunamadı. Lütfen mm.exe yolunu elle girin.' };
}

function isGameRunning() {
  if (process.platform !== 'win32') return Promise.resolve(false);
  return new Promise((resolve) => {
    execFile('tasklist', ['/FI', 'IMAGENAME eq mm.exe', '/NH'], { windowsHide: true }, (err, stdout) => {
      resolve(!err && /\bmm\.exe\b/i.test(stdout || ''));
    });
  });
}

// ---- config.cfg helpers (game rewrites this file on exit, so only edit while it is closed) ----
async function readConfig(p) {
  try { return await fs.readFile(p.config, 'latin1'); } catch { return null; }
}

function getCvar(text, name) {
  const m = text?.match(new RegExp(`^\\s*${name}\\s+"([^"]*)"`, 'mi'));
  return m ? m[1] : null;
}

function setCvar(text, name, value) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const re = new RegExp(`^(\\s*${name}\\s+)"[^"]*"`, 'mi');
  if (re.test(text)) return text.replace(re, `$1"${value}"`);
  return text.replace(/\s*$/, '') + eol + `${name} "${value}"` + eol;
}

async function applyLanguage(p, lang) {
  const cfg = await readConfig(p);
  if (cfg === null) return { changed: false, reason: 'config.cfg yok (oyunu en az bir kez açıp kapatın).' };
  let next = setCvar(cfg, 'cc_lang', lang === 'turkish' ? 'turkish' : '');
  if (lang === 'turkish') next = setCvar(next, 'closecaption', '1');
  if (next !== cfg) await fs.writeFile(p.config, next, 'latin1');
  return { changed: next !== cfg };
}

async function readInfo(p) {
  try { return JSON.parse(await fs.readFile(p.info, 'utf8')); } catch { return null; }
}

async function getStatus(input) {
  const v = await validateGame(input);
  if (!v.ok) return { valid: false, error: v.error, root: v.root };
  const p = gamePaths(v.root);
  const info = await readInfo(p);
  let patchFiles = [];
  try {
    patchFiles = (await fs.readdir(p.patchDir)).filter((n) => NAME_RE.test(n));
  } catch { /* not installed */ }
  const hasItemnames = await exists(p.itemnames);
  const cfg = await readConfig(p);
  return {
    valid: true,
    root: v.root,
    installed: patchFiles.length > 0 || hasItemnames,
    managed: !!info,
    installedAt: info?.installedAt || null,
    fileCount: patchFiles.length + (hasItemnames ? 1 : 0),
    configExists: cfg !== null,
    ccLang: getCvar(cfg, 'cc_lang'),
    closecaption: getCvar(cfg, 'closecaption'),
    running: await isGameRunning(),
  };
}

async function install(body) {
  const v = await validateGame(body.gamePath);
  if (!v.ok) throw new Error(v.error);
  if (await isGameRunning()) throw new Error('Oyun açık. Lütfen önce oyunu kapatın.');
  const p = gamePaths(v.root);

  const files = Array.isArray(body.files) ? body.files : [];
  for (const f of files) {
    if (!NAME_RE.test(f?.name || '')) throw new Error('Geçersiz dosya adı: ' + f?.name);
  }
  if (files.length === 0 && !body.itemnames) throw new Error('Kurulacak çevrilmiş dosya yok.');

  const prevInfo = await readInfo(p);
  const prevCfg = await readConfig(p);
  let previousCcLang = prevInfo ? prevInfo.previousCcLang : getCvar(prevCfg, 'cc_lang');
  if (previousCcLang === 'turkish') previousCcLang = '';

  // The game has no "turkish" folder of its own: the whole folder belongs to the patch.
  await fs.rm(p.patchDir, { recursive: true, force: true });
  await fs.mkdir(p.patchDir, { recursive: true });
  for (const f of files) {
    await fs.writeFile(path.join(p.patchDir, f.name), Buffer.from(f.data, 'base64'));
  }
  if (body.itemnames) await fs.writeFile(p.itemnames, Buffer.from(body.itemnames, 'base64'));
  else await fs.rm(p.itemnames, { force: true });

  const info = {
    tool: 'Game Translator - Dark Messiah Türkçe Yama',
    installedAt: new Date().toISOString(),
    files: files.map((f) => f.name),
    itemnames: !!body.itemnames,
    previousCcLang: previousCcLang ?? '',
  };
  await fs.writeFile(p.info, JSON.stringify(info, null, 2), 'utf8');

  const lang = body.enableTurkish ? await applyLanguage(p, 'turkish') : { changed: false };
  return { ok: true, written: files.length + (body.itemnames ? 1 : 0), language: lang };
}

async function uninstall(body) {
  const v = await validateGame(body.gamePath);
  if (!v.ok) throw new Error(v.error);
  if (await isGameRunning()) throw new Error('Oyun açık. Lütfen önce oyunu kapatın.');
  const p = gamePaths(v.root);
  const info = await readInfo(p);

  await fs.rm(p.patchDir, { recursive: true, force: true });
  await fs.rm(p.itemnames, { force: true });

  const cfg = await readConfig(p);
  if (cfg !== null && getCvar(cfg, 'cc_lang') === 'turkish') {
    await fs.writeFile(p.config, setCvar(cfg, 'cc_lang', info?.previousCcLang || ''), 'latin1');
  }
  return { ok: true };
}

async function setLanguage(body) {
  const v = await validateGame(body.gamePath);
  if (!v.ok) throw new Error(v.error);
  if (await isGameRunning()) throw new Error('Oyun açık. Dil ayarı oyun kapalıyken değiştirilmeli.');
  const res = await applyLanguage(gamePaths(v.root), body.lang);
  if (res.reason) throw new Error(res.reason);
  return { ok: true, ...res };
}

// ---- HTTP plumbing ----
function send(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('İstek çok büyük.')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); }
      catch { reject(new Error('Geçersiz JSON.')); }
    });
    req.on('error', reject);
  });
}

const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

async function handle(req, res) {
  const origin = req.headers.origin;
  if (origin && !LOCAL_ORIGIN.test(origin)) return send(res, 403, { error: 'Yalnızca yerel istekler kabul edilir.' });

  const route = req.url.slice(BASE.length).split('?')[0];
  if (req.method === 'GET' && route === '/detect') return send(res, 200, await detectGame());

  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  if (!/application\/json/i.test(req.headers['content-type'] || '')) return send(res, 415, { error: 'JSON bekleniyor.' });
  const body = await readBody(req);

  switch (route) {
    case '/validate': return send(res, 200, await validateGame(body.gamePath));
    case '/status': return send(res, 200, await getStatus(body.gamePath));
    case '/install': return send(res, 200, await install(body));
    case '/uninstall': return send(res, 200, await uninstall(body));
    case '/language': return send(res, 200, await setLanguage(body));
    default: return send(res, 404, { error: 'Bilinmeyen istek.' });
  }
}

export default function darkMessiahApi() {
  const middleware = (req, res, next) => {
    if (!req.url || !req.url.startsWith(BASE)) return next();
    handle(req, res).catch((err) => send(res, 500, { error: err.message || String(err) }));
  };
  return {
    name: 'darkmessiah-api',
    configureServer(server) { server.middlewares.use(middleware); },
    configurePreviewServer(server) { server.middlewares.use(middleware); },
  };
}
