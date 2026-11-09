// METAL GEAR / METAL GEAR 2 (Master Collection) text files: <lang>/stage/mg1|mg2/cache/.../english.raw
// Pure JS (Uint8Array only) so both the browser and the local patch service (Node) can use it.
//
// File   = [0x40][u24 BE size of the rest] + chunks
// Chunk  = [0x40][u24 BE size][data]
// The text chunk is a list of sections: [u32 BE size][entries]
//   MG1 entry = [u8 flag][u16 BE length][text]   (chunk 72, sections start at +0x366)
//   MG2 entry = [u16 BE length][text]            (chunk 2, sections start at +0)
// Some MG1 sections are binary data (not entries); they are kept as they are.

export const MG_GAMES = {
  mg1: { id: 'mg1', title: 'METAL GEAR', textChunk: 72, start: 0x366, header: 3, relPath: 'fr/stage/mg1/cache/ovr_stm/ovr_eu/english.raw' },
  mg2: { id: 'mg2', title: 'METAL GEAR 2: SOLID SNAKE', textChunk: 2, start: 0, header: 2, relPath: 'fr/stage/mg2/cache/ovr_stm/ovr_eu/english.raw' },
};

const u24 = (b, o) => (b[o] << 16) | (b[o + 1] << 8) | b[o + 2];
const u32 = (b, o) => ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3];
const be = (n, len) => {
  const out = new Uint8Array(len);
  for (let i = len - 1; i >= 0; i--) { out[i] = n & 0xff; n = Math.floor(n / 256); }
  return out;
};
function concat(parts) {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

function readChunks(d) {
  if (d[0] !== 0x40 || u24(d, 1) !== d.length - 4) throw new Error('Tanınmayan .raw dosyası (başlık uyuşmuyor).');
  const chunks = [];
  let o = 4;
  while (o < d.length) {
    if (d[o] !== 0x40) throw new Error(`Bozuk .raw dosyası (0x${o.toString(16)}).`);
    const size = u24(d, o + 1);
    chunks.push(d.subarray(o + 4, o + 4 + size));
    o += 4 + size;
  }
  return chunks;
}

function parseEntries(sec, header) {
  const out = [];
  let p = 0;
  while (p < sec.length) {
    if (p + header > sec.length) return null;
    const len = (sec[p + header - 2] << 8) | sec[p + header - 1];
    if (p + header + len > sec.length) return null;
    const text = sec.subarray(p + header, p + header + len);
    for (const b of text) if (b < 32 && b !== 10) return null;
    out.push({ flag: header === 3 ? sec[p] : null, bytes: text });
    p += header + len;
  }
  return out;
}

// Returns { chunks, prefix, sections: [{ raw, entries|null }] } for one game's raw file.
export function parseRaw(bytes, gameId) {
  const g = MG_GAMES[gameId];
  const d = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const chunks = readChunks(d);
  const c = chunks[g.textChunk];
  if (!c) throw new Error('Metin bölümü bulunamadı.');
  const sections = [];
  let o = g.start;
  while (o < c.length) {
    const size = u32(c, o);
    if (o + 4 + size > c.length) throw new Error('Metin bölümleri okunamadı (dosya bu oyuna ait olmayabilir).');
    const raw = c.subarray(o + 4, o + 4 + size);
    sections.push({ raw, entries: parseEntries(raw, g.header) });
    o += 4 + size;
  }
  if (!sections.some((s) => s.entries?.length)) throw new Error('Dosyada metin bulunamadı.');
  return { gameId, chunks, prefix: c.subarray(0, g.start), sections };
}

// `replace` = Map("sec:idx" -> Uint8Array) of entries to change. Everything else is copied unchanged.
export function buildRaw(parsed, replace = new Map()) {
  const g = MG_GAMES[parsed.gameId];
  const secParts = [parsed.prefix];
  parsed.sections.forEach((s, si) => {
    let body = s.raw;
    if (s.entries) {
      const parts = [];
      s.entries.forEach((e, ei) => {
        const text = replace.get(`${si}:${ei}`) ?? e.bytes;
        if (text.length > 0xffff) throw new Error(`Metin çok uzun (${si}:${ei}).`);
        if (g.header === 3) parts.push(Uint8Array.of(e.flag));
        parts.push(be(text.length, 2), text);
      });
      body = concat(parts);
    }
    secParts.push(be(body.length, 4), body);
  });
  const chunks = parsed.chunks.map((c, i) => (i === g.textChunk ? concat(secParts) : c));
  const body = concat(chunks.flatMap((c) => [Uint8Array.of(0x40), be(c.length, 3), c]));
  return concat([Uint8Array.of(0x40), be(body.length, 3), body]);
}

// ---- Character encoding ----
// The games use their own single-byte table for accented letters (0xA0-0xFF, worked out from the
// French/German/Italian/Spanish/Czech texts). Bytes 0x81-0x9F start a two-byte Shift-JIS character.
const BYTE_TO_CHAR = {
  0xa7: 'č', 0xa8: 'ě', 0xa9: 'ř', 0xaa: 'ů', 0xab: 'ý', 0xac: 'ž',
  0xb0: 'à', 0xb1: 'á', 0xb2: 'â', 0xb3: 'ä', 0xb4: 'À', 0xb5: 'Á', 0xb7: 'Ä',
  0xb8: 'è', 0xb9: 'é', 0xba: 'ê', 0xbb: 'ë', 0xbd: 'É',
  0xc0: 'ì', 0xc1: 'í', 0xc2: 'î',
  0xc8: 'ò', 0xc9: 'ó', 0xca: 'ô', 0xcb: 'ö', 0xcd: 'Ó', 0xcf: 'Ö',
  0xd0: 'ù', 0xd1: 'ú', 0xd2: 'û', 0xd3: 'ü', 0xd4: 'Ù', 0xd5: 'Ú', 0xd7: 'Ü',
  0xd8: 'ñ', 0xd9: 'ç', 0xda: 'ß', 0xdb: 'Ç', 0xdc: '¡', 0xdd: '¿', 0xde: '®',
};
const CHAR_TO_BYTE = Object.fromEntries(Object.entries(BYTE_TO_CHAR).map(([b, ch]) => [ch, Number(b)]));

// Turkish letters the game font does not have, and common typography, written with the closest letter.
export const MG_FALLBACK = {
  'ğ': 'g', 'Ğ': 'G', 'ş': 's', 'Ş': 'S', 'ı': 'i', 'İ': 'I', 'Â': 'A', 'Î': 'I', 'Û': 'U',
  '‘': "'", '’': "'", '“': '"', '”': '"', '…': '...', '–': '-', '—': '-', ' ': ' ',
};

const hex = (n, w) => n.toString(16).toUpperCase().padStart(w, '0');

// Bytes -> editable text. Bytes without a known letter are shown as {XX} / {XXXX} and written back as they were.
export function decodeMgText(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b < 0x80) s += String.fromCharCode(b);
    else if (b >= 0x81 && b <= 0x9f && i + 1 < bytes.length) { s += `{${hex(b, 2)}${hex(bytes[i + 1], 2)}}`; i++; }
    else if (BYTE_TO_CHAR[b]) s += BYTE_TO_CHAR[b];
    else s += `{${hex(b, 2)}}`;
  }
  return s;
}

// Text -> bytes. Returns { bytes, replaced: Set of letters written with a stand-in, unknown: Set }.
export function encodeMgText(text) {
  const out = [];
  const replaced = new Set();
  const unknown = new Set();
  const src = text.replace(/\r\n?/g, '\n');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') {
      const m = /^\{([0-9A-Fa-f]{2}|[0-9A-Fa-f]{4})\}/.exec(src.slice(i));
      if (m) {
        for (let k = 0; k < m[1].length; k += 2) out.push(parseInt(m[1].slice(k, k + 2), 16));
        i += m[0].length - 1;
        continue;
      }
    }
    const code = ch.charCodeAt(0);
    if (code === 10 || (code >= 32 && code < 127)) { out.push(code); continue; }
    if (CHAR_TO_BYTE[ch] !== undefined) { out.push(CHAR_TO_BYTE[ch]); continue; }
    const fb = MG_FALLBACK[ch];
    if (fb !== undefined) {
      replaced.add(ch);
      for (const c of fb) out.push(c.charCodeAt(0));
      continue;
    }
    unknown.add(ch);
    out.push(0x3f); // '?'
  }
  return { bytes: Uint8Array.from(out), replaced, unknown };
}

// Rows the editor offers: decoded English with a stable id ("sec:idx").
export function listEntries(parsed) {
  const rows = [];
  parsed.sections.forEach((s, si) => {
    s.entries?.forEach((e, ei) => rows.push({ id: `${si}:${ei}`, section: si, index: ei, text: decodeMgText(e.bytes) }));
  });
  return rows;
}

// Section markers ("-"), empty rows and Japanese-only developer strings are not translated.
export const isTranslatableMg = (text) => /[A-Za-z]/.test(text.replace(/\{[0-9A-F]+\}/gi, '')) && text.trim() !== '-';

// ---- Formatting codes ----
// MG2: \r \s \w \W \e \f \1 \2 \3 \B14 \S99 ...   EU files: |0 |1 (button names)   both: {XX} raw bytes
const CODE_RE = /\\[A-Za-z]\d*|\\\d|\|\d|\{[0-9A-Fa-f]{2,4}\}/g;

const countCodes = (s) => {
  const m = new Map();
  for (const c of s.match(CODE_RE) || []) m.set(c, (m.get(c) || 0) + 1);
  return m;
};

export function checkMgFormatting(original, translation) {
  if (!translation.trim()) return [];
  const problems = [];
  const a = countCodes(original);
  const b = countCodes(translation);
  const missing = [...a].filter(([c, n]) => (b.get(c) || 0) < n).map(([c]) => c);
  const extra = [...b].filter(([c, n]) => (a.get(c) || 0) < n).map(([c]) => c);
  if (missing.length) problems.push(`Eksik kod: ${missing.join(' ')}`);
  if (extra.length) problems.push(`Fazla kod: ${extra.join(' ')}`);
  const speaker = /^([^\n\\]+)\\[rs]/.exec(original);
  if (speaker && !translation.startsWith(speaker[0])) problems.push(`Konuşmacı başı "${speaker[0]}" korunmalı`);
  const { unknown } = encodeMgText(translation);
  if (unknown.size) problems.push(`Oyunda olmayan karakter: ${[...unknown].join(' ')}`);
  return problems;
}

export const MG_FORMAT_RULES = `

FORMATTING RULES (very important):
- Keep every control code exactly as written and in the same place: backslash codes such as \\r \\s \\w \\W \\e \\f \\1 \\2 \\3 \\B14 \\S99, button placeholders such as |0 |1, and raw byte codes in braces such as {81A0}.
- Codec lines start with the speaker, e.g. "Campbell\\r: " or "Snake\\s: ". Keep that speaker part unchanged at the start; "\\w" separates speakers and must stay where it is.
- Keep line breaks (\\n) where the original has them. Translations may be a little longer, but keep menu and item names short.
- Do not translate code names such as FOXHOUND, Outer Heaven, Zanzibar Land, Metal Gear, Big Boss, Solid Snake, Gray Fox.`;
