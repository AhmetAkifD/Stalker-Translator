// Valve (Source engine) localization files used by Dark Messiah:
//   "lang" { "Language" "English" "Tokens" { "key" "value" ... } }
// Files are UTF-16 LE with BOM. Values may contain literal "\n" escapes and even real newlines.

export function decodeText(buffer) {
  const b = new Uint8Array(buffer);
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder('utf-16le').decode(b.subarray(2));
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder('utf-16be').decode(b.subarray(2));
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return new TextDecoder('utf-8').decode(b.subarray(3));
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(b);
  } catch {
    return new TextDecoder('windows-1252').decode(b);
  }
}

export function encodeUtf16le(text) {
  const out = new Uint8Array(2 + text.length * 2);
  out[0] = 0xff;
  out[1] = 0xfe;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    out[2 + i * 2] = c & 0xff;
    out[3 + i * 2] = c >> 8;
  }
  return out;
}

// KeyValues tokenizer: quoted strings (may span lines), bare words, braces, // comments.
export function tokenize(text) {
  const toks = [];
  const n = text.length;
  let i = 0;
  while (i < n) {
    const c = text[i];
    if (c === ' ' || c === '\t' || c === '\r' || c === '\n' || c === '\uFEFF') { i++; continue; }
    if (c === '/' && text[i + 1] === '/') {
      while (i < n && text[i] !== '\n') i++;
      continue;
    }
    if (c === '{' || c === '}') { toks.push({ t: c }); i++; continue; }
    if (c === '"') {
      let j = i + 1;
      while (j < n && text[j] !== '"') j += text[j] === '\\' && j + 1 < n ? 2 : 1;
      toks.push({ t: 's', v: text.slice(i + 1, j) });
      i = j + 1;
      continue;
    }
    let j = i;
    while (j < n && !/[\s{}"]/.test(text[j])) j++;
    toks.push({ t: 's', v: text.slice(i, j), bare: true });
    i = j;
  }
  return toks;
}

// Returns entries in file order. `id` is unique even when a key repeats (n-th occurrence).
export function parseLocalization(text) {
  const toks = tokenize(text);
  let language = null;
  let start = -1;
  for (let k = 0; k < toks.length - 1; k++) {
    if (toks[k].t !== 's') continue;
    const name = toks[k].v.toLowerCase();
    if (name === 'language' && toks[k + 1].t === 's' && language === null) language = toks[k + 1].v;
    if (name === 'tokens' && toks[k + 1].t === '{') { start = k + 2; break; }
  }
  const entries = [];
  if (start < 0) return { language, entries };

  const seen = new Map();
  let p = start;
  while (p < toks.length && toks[p].t !== '}') {
    const key = toks[p];
    const val = toks[p + 1];
    if (key.t !== 's' || !val || val.t !== 's') { p++; continue; }
    p += 2;
    // Optional platform conditional, e.g. [$WIN32]
    while (toks[p]?.t === 's' && toks[p].bare && toks[p].v.startsWith('[')) p++;
    if (/^\[english\]/i.test(key.v)) continue;
    const lower = key.v.toLowerCase();
    const n = seen.get(lower) || 0;
    seen.set(lower, n + 1);
    entries.push({ id: n === 0 ? lower : `${lower}#${n}`, key: key.v, value: val.v });
  }
  return { language, entries };
}

// Game files never contain \" escapes, so a typed double quote is turned into an apostrophe.
export function sanitizeValue(value) {
  return String(value).replace(/\r\n|\r|\n/g, '\\n').replace(/"/g, "'");
}

export function serializeLocalization(entries, language = 'Turkish') {
  const lines = entries.map((e) => `\t\t"${e.key}"\t"${sanitizeValue(e.value)}"`);
  return [
    '"lang"',
    '{',
    `\t"Language" "${language}"`,
    '\t"Tokens"',
    '\t{',
    ...lines,
    '\t}',
    '}',
    '',
  ].join('\r\n');
}

const PLACEHOLDER_RE = /%[^%\s]+%/g;
const VALVE_TAG_RE = /<(?:clr|playerclr|I|B|U|cr|sfx|delay|len|norepeat|sameline)(?::[^>]*)?>/gi;

// Formatting codes that must survive translation. Returns a list of problems (empty = ok).
export function checkFormatting(original, translation) {
  if (!translation || !translation.trim()) return [];
  const problems = [];
  const need = [...(original.match(PLACEHOLDER_RE) || []), ...(original.match(VALVE_TAG_RE) || [])];
  for (const token of new Set(need)) {
    const want = need.filter((x) => x === token).length;
    const have = translation.split(token).length - 1;
    if (have < want) problems.push(`Eksik kod: ${token}`);
  }
  const nl = (s) => (s.match(/\\n/g) || []).length + (s.match(/\n/g) || []).length;
  if (nl(original) !== nl(translation)) problems.push(`Satır sonu sayısı farklı (\\n: ${nl(original)} → ${nl(translation)})`);
  return problems;
}

export const DM_FORMAT_RULES = `

FORMAT RULES (mandatory):
- Keep every %...% placeholder (for example %+use%, %+forward%, %mm_objectives_show%) exactly as written. They are replaced by key names in-game.
- Keep every literal \\n sequence (backslash + n) in the same places; it is a line break.
- Text in angle brackets such as <Chicken noises> describes a sound: translate the words but keep the angle brackets.
- Never output the double quote character ("). Use ' instead.
- Return only the translation, no explanations.`;
