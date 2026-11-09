// METAL GEAR working folder: the Turkish translations are kept as one JSON file per game, e.g.
//   metal_gear_1_turkce.json = { format: 1, game: 'mg1', entries: { "3:12": { en: "...", tr: "..." } } }
// The English text itself is read from the game by the local patch service (from its backup once patched).
import { MG_GAMES } from './mgRaw';
import { getSource } from './gameApi';

export const TRANSLATION_FILES = { mg1: 'metal_gear_1_turkce.json', mg2: 'metal_gear_2_turkce.json' };

export const GROUPS = {
  mg1: { title: 'METAL GEAR', hint: 'MSX2 METAL GEAR (1987)' },
  mg2: { title: 'METAL GEAR 2: SOLID SNAKE', hint: 'MSX2 METAL GEAR 2: SOLID SNAKE (1990)' },
};

// Section labels, by section number in ovr_eu/english.raw. Unknown numbers fall back to "Bölüm N".
const SECTION_LABELS = {
  mg1: {
    0: 'Kurtarılan esirler', 1: 'Düşman ve oyun mesajları', 2: 'Telsiz: Big Boss (görev)', 3: 'Telsiz: Big Boss (eşyalar)',
    4: 'Telsiz: Schneider', 5: 'Telsiz: Steve ve Diane', 6: 'Telsiz: Jennifer', 10: 'Açılış telsizi', 11: 'Final ve kapanış',
    12: 'Menü, silah ve eşyalar',
  },
  mg2: {
    0: 'Eşya açıklamaları', 1: 'Silah açıklamaları', 2: 'Telsiz: Snake (açılış)', 3: 'Telsiz: Campbell', 4: 'Telsiz: 1 numaralı hayran',
    5: 'Telsiz: Holly', 6: 'Telsiz: Kasler', 7: 'Telsiz: Dr. Madnar', 8: 'Telsiz: Marv', 9: 'Telsiz: Master Miller',
    10: 'Telsiz: Jacobsen', 11: 'Telsiz: Gray Fox', 12: 'Telsiz: Snake', 13: 'Telsiz: Gustava', 14: 'Düşman sesleri',
    15: 'Telsiz: Çocuk (Kid)', 16: 'Bulunan eşya mesajları', 17: 'Giriş hikâyesi', 18: 'Jenerik', 19: 'Sahneler: Marv',
    20: 'Sahneler: Dr. Madnar ve final', 21: 'Oda ve kat adları', 22: 'Telsiz adları ve menü', 23: 'Kod adları',
  },
};

const sectionLabel = (game, section) => SECTION_LABELS[game][section] || `Bölüm ${section}`;

// English rows of both games from the local service: { mg1: rows, mg2: rows } (translatable rows only).
export async function loadSources(gamePath) {
  const out = {};
  for (const g of Object.keys(MG_GAMES)) {
    const res = await getSource(gamePath, g);
    out[g] = res.rows.filter((r) => r.translatable);
  }
  return out;
}

// One sidebar entry per text section that has something to translate.
export function buildFiles(sources) {
  const files = [];
  for (const [game, rows] of Object.entries(sources)) {
    const sections = [...new Set(rows.map((r) => r.section))].sort((a, b) => a - b);
    for (const section of sections) {
      files.push({
        id: `${game}:${section}`,
        game,
        section,
        group: game,
        label: sectionLabel(game, section),
        subtitle: `${MG_GAMES[game].title} · bölüm ${section} → ${TRANSLATION_FILES[game]}`,
      });
    }
  }
  return files;
}

async function readJson(dir, name) {
  try {
    const fh = await dir.getFileHandle(name);
    return JSON.parse(await (await fh.getFile()).text());
  } catch {
    return null;
  }
}

// Map(id -> { en, tr }) of a game's saved translations.
export async function readTranslations(dir, game) {
  const data = await readJson(dir, TRANSLATION_FILES[game]);
  return new Map(Object.entries(data?.entries || {}).filter(([, v]) => typeof v?.tr === 'string'));
}

// A saved row is used when its id still holds the same English text. Saved rows whose id no longer
// matches (a game update moved rows around) are found again by their English text. Rows that are
// simply identical in English (e.g. 2:0 and 10:0 in METAL GEAR) are NOT filled from each other.
export function matchTranslations(rows, saved) {
  const current = new Map(rows.map((r) => [r.id, r.text]));
  const byEnglish = new Map();
  for (const [id, v] of saved) {
    if (current.get(id) === v.en) continue;
    if (v.tr.trim() && !byEnglish.has(v.en)) byEnglish.set(v.en, v.tr);
  }
  return new Map(rows.map((r) => {
    const s = saved.get(r.id);
    return [r.id, s && s.en === r.text ? s.tr : byEnglish.get(r.text) || ''];
  }));
}

// Saves the given rows of one game (other rows already in the file are kept).
export async function writeTranslations(dir, game, updates) {
  const saved = await readTranslations(dir, game);
  for (const u of updates) {
    if (u.tr.trim()) saved.set(u.id, { en: u.en, tr: u.tr });
    else saved.delete(u.id);
  }
  const ordered = [...saved.entries()].sort(([a], [b]) => {
    const [as, ai] = a.split(':').map(Number);
    const [bs, bi] = b.split(':').map(Number);
    return as - bs || ai - bi;
  });
  const fh = await dir.getFileHandle(TRANSLATION_FILES[game], { create: true });
  const w = await fh.createWritable();
  await w.write(JSON.stringify({ format: 1, game, source: MG_GAMES[game].relPath, entries: Object.fromEntries(ordered) }, null, 2));
  await w.close();
}

// Editor adapter for one sidebar entry (see DarkMessiahEditor's `source` prop).
const speakerOf = (text) => /^([^\n\\]{1,24})\\[rs]/.exec(text)?.[1];

export function createEditorSource(dir, file, rows, extras) {
  const mine = rows.filter((r) => r.section === file.section);
  return {
    ...extras,
    load: async () => {
      const tr = matchTranslations(mine, await readTranslations(dir, file.game));
      return mine.map((r) => ({
        id: r.id,
        key: `${r.section}:${r.index}${speakerOf(r.text) ? ' · ' + speakerOf(r.text) : ''}`,
        original: r.text,
        translation: tr.get(r.id) || '',
      }));
    },
    save: (items) => writeTranslations(dir, file.game, items.map((i) => ({ id: i.id, en: i.original, tr: i.translation }))),
  };
}

export async function computeAllStats(dir, sources, files) {
  const stats = {};
  for (const game of Object.keys(sources)) {
    const tr = matchTranslations(sources[game], await readTranslations(dir, game));
    for (const f of files.filter((x) => x.game === game)) {
      const mine = sources[game].filter((r) => r.section === f.section);
      stats[f.id] = { total: mine.length, translated: mine.filter((r) => tr.get(r.id)?.trim()).length };
    }
  }
  return stats;
}

// Payload for the installer: { mg1: [{ id, text }], mg2: [...] } with every translated row.
export async function collectPatch(dir, sources) {
  const out = {};
  for (const game of Object.keys(sources)) {
    const tr = matchTranslations(sources[game], await readTranslations(dir, game));
    out[game] = sources[game].filter((r) => tr.get(r.id)?.trim()).map((r) => ({ id: r.id, text: tr.get(r.id) }));
  }
  return out;
}
