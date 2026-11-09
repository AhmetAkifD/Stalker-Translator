// Local API used by the METAL GEAR / METAL GEAR 2 page (Master Collection, "MG and MG2").
// The game reads its English text from fr/stage/mg{1,2}/cache/ovr_stm/ovr_eu/english.raw (checked in game).
// The patch writes the Turkish text into those files; the original files are copied to
// <game>/turkce_yama/yedek/ first and are put back by "uninstall".
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { exists, steamGameCandidates, isProcessRunning, createApiPlugin } from './apiUtils.js';
import { MG_GAMES, parseRaw, buildRaw, listEntries, encodeMgText, isTranslatableMg } from '../src/utils/mg/mgRaw.js';

const BASE = '/api/metalgear';
const GAME_DIR_NAME = 'MG and MG2';
const EXE = 'METAL GEAR.exe';
const PATCH_DIR = 'turkce_yama';
const INFO_FILE = 'turkce_yama.json';

const sha1 = (buf) => crypto.createHash('sha1').update(buf).digest('hex');

function normalizeGameRoot(input) {
  if (typeof input !== 'string') return '';
  let p = input.trim().replace(/^"+|"+$/g, '');
  if (!p) return '';
  if (/\.exe$/i.test(p)) p = path.dirname(p);
  return path.resolve(p);
}

const paths = (root) => ({
  root,
  exe: path.join(root, EXE),
  patchDir: path.join(root, PATCH_DIR),
  info: path.join(root, PATCH_DIR, INFO_FILE),
  target: (g) => path.join(root, ...MG_GAMES[g].relPath.split('/')),
  backup: (g) => path.join(root, PATCH_DIR, 'yedek', ...MG_GAMES[g].relPath.split('/')),
});

async function validateGame(input) {
  const root = normalizeGameRoot(input);
  if (!root) return { ok: false, error: 'Oyun yolu boş.' };
  const p = paths(root);
  if (!(await exists(p.exe))) return { ok: false, root, error: `Bu klasörde "${EXE}" bulunamadı.` };
  for (const g of Object.keys(MG_GAMES)) {
    if (!(await exists(p.target(g)))) return { ok: false, root, error: `Metin dosyası bulunamadı: ${MG_GAMES[g].relPath}` };
  }
  return { ok: true, root, exe: p.exe };
}

async function detectGame() {
  for (const c of await steamGameCandidates(GAME_DIR_NAME)) {
    const v = await validateGame(c);
    if (v.ok) return v;
  }
  return { ok: false, error: `Oyun otomatik bulunamadı. Lütfen "${EXE}" dosyasının bulunduğu klasörü elle girin.` };
}

const isRunning = async () => (await isProcessRunning(EXE)) || (await isProcessRunning('launcher.exe'));

async function readInfo(p) {
  try { return JSON.parse(await fs.readFile(p.info, 'utf8')); } catch { return null; }
}

// The untouched English file of a game. When our patch is installed the game file holds Turkish,
// so the backup is used; when the game file is anything else (never patched, or replaced by a Steam
// update) the game file itself is the original.
async function loadOriginal(p, info, g) {
  const current = await fs.readFile(p.target(g));
  const mine = info?.games?.[g];
  if (mine && sha1(current) === mine.installedHash) {
    const backup = await fs.readFile(p.backup(g)).catch(() => null);
    if (!backup || sha1(backup) !== mine.originalHash) throw new Error(`${MG_GAMES[g].title}: yama yedeği bulunamadı veya bozuk. Steam'den "Oyun dosyalarını doğrula" ile orijinal dosyayı geri alın.`);
    return { bytes: backup, fromBackup: true };
  }
  return { bytes: current, fromBackup: false };
}

async function getSource(body) {
  const v = await validateGame(body.gamePath);
  if (!v.ok) throw new Error(v.error);
  const g = body.game;
  if (!MG_GAMES[g]) throw new Error('Bilinmeyen oyun: ' + g);
  const p = paths(v.root);
  const { bytes } = await loadOriginal(p, await readInfo(p), g);
  const parsed = parseRaw(new Uint8Array(bytes), g);
  return { game: g, file: MG_GAMES[g].relPath, rows: listEntries(parsed).map((r) => ({ ...r, translatable: isTranslatableMg(r.text) })) };
}

async function getStatus(input) {
  const v = await validateGame(input);
  if (!v.ok) return { valid: false, error: v.error, root: v.root };
  const p = paths(v.root);
  const info = await readInfo(p);
  const games = {};
  for (const g of Object.keys(MG_GAMES)) {
    const mine = info?.games?.[g];
    const hash = sha1(await fs.readFile(p.target(g)));
    games[g] = {
      installed: !!mine && hash === mine.installedHash,
      // Patch was installed but the file changed since (e.g. Steam "verify files" or an update).
      replaced: !!mine && hash !== mine.installedHash,
      rows: mine?.rows || 0,
    };
  }
  return {
    valid: true,
    root: v.root,
    installedAt: info?.installedAt || null,
    games,
    installed: Object.values(games).some((s) => s.installed),
    running: await isRunning(),
  };
}

async function install(body) {
  const v = await validateGame(body.gamePath);
  if (!v.ok) throw new Error(v.error);
  if (await isRunning()) throw new Error('Oyun açık. Lütfen önce oyunu (ve başlatıcısını) kapatın.');
  const p = paths(v.root);
  const input = body.games && typeof body.games === 'object' ? body.games : {};
  const ids = Object.keys(input).filter((g) => MG_GAMES[g]);
  if (ids.length === 0) throw new Error('Kurulacak çeviri yok.');

  const info = (await readInfo(p)) || { tool: 'Game Translator - METAL GEAR Türkçe Yama', games: {} };
  const result = {};
  for (const g of ids) {
    const translations = Array.isArray(input[g]) ? input[g] : [];
    const original = await loadOriginal(p, info, g);
    const parsed = parseRaw(new Uint8Array(original.bytes), g);
    const known = new Map(listEntries(parsed).map((r) => [r.id, r]));
    const replace = new Map();
    const replaced = new Set();
    const unknown = new Set();
    for (const t of translations) {
      const row = known.get(t?.id);
      if (!row || typeof t.text !== 'string' || !t.text.trim() || !isTranslatableMg(row.text)) continue;
      const enc = encodeMgText(t.text);
      enc.replaced.forEach((c) => replaced.add(c));
      enc.unknown.forEach((c) => unknown.add(c));
      replace.set(t.id, enc.bytes);
    }
    if (replace.size === 0) continue;
    const out = buildRaw(parsed, replace);

    if (!original.fromBackup) {
      await fs.mkdir(path.dirname(p.backup(g)), { recursive: true });
      await fs.writeFile(p.backup(g), original.bytes);
    }
    await fs.writeFile(p.target(g), out);
    info.games[g] = { file: MG_GAMES[g].relPath, originalHash: sha1(original.bytes), installedHash: sha1(out), rows: replace.size };
    result[g] = { rows: replace.size, replaced: [...replaced], unknown: [...unknown] };
  }
  if (Object.keys(result).length === 0) throw new Error('Kaydedilmiş Türkçe satır yok.');
  info.installedAt = new Date().toISOString();
  await fs.mkdir(p.patchDir, { recursive: true });
  await fs.writeFile(p.info, JSON.stringify(info, null, 2), 'utf8');
  return { ok: true, games: result };
}

async function uninstall(body) {
  const v = await validateGame(body.gamePath);
  if (!v.ok) throw new Error(v.error);
  if (await isRunning()) throw new Error('Oyun açık. Lütfen önce oyunu (ve başlatıcısını) kapatın.');
  const p = paths(v.root);
  const info = await readInfo(p);
  const restored = [];
  for (const [g, mine] of Object.entries(info?.games || {})) {
    if (!MG_GAMES[g]) continue;
    const current = await fs.readFile(p.target(g));
    // Only put the backup back over our own patched file; a file Steam replaced is already original.
    if (sha1(current) !== mine.installedHash) continue;
    const backup = await fs.readFile(p.backup(g));
    if (sha1(backup) !== mine.originalHash) throw new Error(`${MG_GAMES[g].title}: yedek bozuk, geri yüklenmedi. Steam'den "Oyun dosyalarını doğrula" kullanın.`);
    await fs.writeFile(p.target(g), backup);
    restored.push(g);
  }
  await fs.rm(p.patchDir, { recursive: true, force: true });
  return { ok: true, restored };
}

export default function metalGearApi() {
  return createApiPlugin('metalgear-api', BASE, async (route, body, method) => {
    if (method === 'GET') return route === '/detect' ? detectGame() : undefined;
    switch (route) {
      case '/validate': return validateGame(body.gamePath);
      case '/status': return getStatus(body.gamePath);
      case '/source': return getSource(body);
      case '/install': return install(body);
      case '/uninstall': return uninstall(body);
      default: return undefined;
    }
  });
}
