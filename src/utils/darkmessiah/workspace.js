// Working folder = the unpacked VPK ("vpk unpacked"). English sources and Turkish outputs both live in
// <...>/mm/resource: english/*.txt -> turkish/*.txt and mm_itemnames_english.txt -> mm_itemnames_turkish.txt
import { decodeText, encodeUtf16le, parseLocalization, serializeLocalization, tokenize } from './valveLocalization';

const CANDIDATES = [
  ['root', 'mm', 'resource'],
  ['mm', 'resource'],
  ['resource'],
  [],
];

async function tryDir(root, segs) {
  let dir = root;
  for (const s of segs) dir = await dir.getDirectoryHandle(s);
  return dir;
}

export async function resolveResourceDir(rootHandle) {
  for (const segs of CANDIDATES) {
    try {
      const dir = await tryDir(rootHandle, segs);
      await dir.getDirectoryHandle('english');
      await dir.getFileHandle('mm_itemnames_english.txt');
      return { resourceDir: dir, label: [rootHandle.name, ...segs].join('/') };
    } catch { /* try next */ }
  }
  return null;
}

export async function getFile(dir, segs, create = false) {
  let d = dir;
  for (const s of segs.slice(0, -1)) d = await d.getDirectoryHandle(s, { create });
  return d.getFileHandle(segs[segs.length - 1], { create });
}

export async function readBytes(dir, segs) {
  try {
    const fh = await getFile(dir, segs);
    return new Uint8Array(await (await fh.getFile()).arrayBuffer());
  } catch {
    return null;
  }
}

export async function readEntries(dir, segs) {
  const bytes = await readBytes(dir, segs);
  if (!bytes) return null;
  return parseLocalization(decodeText(bytes.buffer)).entries;
}

export async function writeEntries(dir, segs, entries) {
  const fh = await getFile(dir, segs, true);
  const w = await fh.createWritable();
  await w.write(encodeUtf16le(serializeLocalization(entries)));
  await w.close();
}

function groupOf(name) {
  if (name.startsWith('mm_itemnames')) return 'ui';
  if (name.startsWith('closecaption')) return 'captions';
  return 'texts';
}

export const GROUPS = {
  ui: { title: 'Arayüz, Menü ve Eşyalar', hint: 'Ana menü, ayarlar, yükleme ekranı, eşya/büyü/yetenek adları' },
  captions: { title: 'Diyalog Altyazıları', hint: 'Konuşma altyazıları (closecaption)' },
  texts: { title: 'Görev, İpucu ve Kitaplar', hint: 'Görevler, ipuçları, okunabilir kitaplar' },
};

export function labelOf(name) {
  const lvl = name.match(/lvl_(\d+)/);
  if (name.startsWith('mm_itemnames')) return 'Arayüz ve eşya adları';
  if (name.includes('monsters')) return 'Yaratık sesleri';
  if (name.includes('generic')) return 'Genel diyaloglar';
  if (name.includes('fpp_tutorial')) return 'Eğitim bölümü';
  if (lvl) return `Bölüm ${lvl[1]}`;
  return name;
}

// Only files that the game really loads (closecaption_manifest.txt) are offered for translation.
export async function loadManifest(resourceDir) {
  const result = [];
  const bytes = await readBytes(resourceDir, ['closecaption_manifest.txt']);
  if (bytes) {
    const toks = tokenize(decodeText(bytes.buffer));
    for (let k = 0; k < toks.length - 1; k++) {
      if (toks[k].t !== 's' || toks[k].v.toLowerCase() !== 'load_file' || toks[k + 1].t !== 's') continue;
      const rel = toks[k + 1].v.replace(/\\/g, '/').replace(/^resource\//i, '');
      if (!/%language%/i.test(rel)) continue;
      const englishSegs = rel.replace(/%language%/gi, 'english').split('/');
      const turkishSegs = rel.replace(/%language%/gi, 'turkish').split('/');
      if (!(await readBytes(resourceDir, englishSegs))) continue;
      const name = turkishSegs[turkishSegs.length - 1];
      result.push({ id: turkishSegs.join('/'), name, englishSegs, turkishSegs, group: groupOf(name), label: labelOf(name) });
    }
  }
  if (result.length === 0) {
    // Fallback: everything inside english/
    const englishDir = await resourceDir.getDirectoryHandle('english');
    for await (const entry of englishDir.values()) {
      if (entry.kind !== 'file' || !entry.name.endsWith('.txt')) continue;
      result.push({ id: `turkish/${entry.name}`, name: entry.name, englishSegs: ['english', entry.name], turkishSegs: ['turkish', entry.name], group: groupOf(entry.name), label: labelOf(entry.name) });
    }
    result.unshift({ id: 'mm_itemnames_turkish.txt', name: 'mm_itemnames_turkish.txt', englishSegs: ['mm_itemnames_english.txt'], turkishSegs: ['mm_itemnames_turkish.txt'], group: 'ui', label: labelOf('mm_itemnames') });
  }
  return result;
}

export async function computeStats(resourceDir, file) {
  const english = (await readEntries(resourceDir, file.englishSegs)) || [];
  const turkish = (await readEntries(resourceDir, file.turkishSegs)) || [];
  const ids = new Set(english.map((e) => e.id));
  const translated = turkish.filter((e) => ids.has(e.id) && e.value.trim() !== '').length;
  return { total: english.length, translated };
}

// Files to send to the installer: the Turkish files from the working folder, as raw bytes.
export async function collectPatchFiles(resourceDir, files) {
  const out = { files: [], itemnames: null };
  for (const f of files) {
    const bytes = await readBytes(resourceDir, f.turkishSegs);
    if (!bytes) continue;
    if (f.turkishSegs.length === 1) out.itemnames = bytes;
    else out.files.push({ name: f.name, bytes });
  }
  return out;
}
