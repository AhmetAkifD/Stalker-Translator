import { useState, useEffect, useMemo, useRef } from 'react';
import { translateText, translateKeyed, countKeyedTokens } from '../../utils/geminiApi';
import { readEntries, writeEntries } from '../../utils/darkmessiah/workspace';
import { checkFormatting, DM_FORMAT_RULES } from '../../utils/darkmessiah/valveLocalization';
import { createFallbackRunner } from '../../utils/aiFallback';
import { Save, Loader2, Zap, Copy, Check, BookOpen, Search, AlertTriangle, ChevronLeft, ChevronRight, Square, Calculator } from 'lucide-react';

const fmt = (n) => Number(n || 0).toLocaleString('tr-TR');
// Row IDs sent to the API are the row's position inside its request ("r0", "r1", ...).
const toEntries = (chunk) => chunk.map((b, k) => ({ id: 'r' + k, text: b.original }));

const PAGE_SIZE = 50;
// Source text per request. ~40k characters stays far below Gemini's output limit even after
// Turkish expansion, so almost every file is translated in a single request.
const MAX_CHUNK_CHARS = 40000;
const MAX_CHUNK_ITEMS = 1500;
const MIN_SPLIT = 20;

// Some game rows have an empty (or whitespace-only) English text, e.g. "Arantir_striking0" "".
const isEmptyRow = (item) => !item.original.trim();

function splitIntoChunks(list) {
  const chunks = [];
  let current = [];
  let size = 0;
  for (const it of list) {
    const len = it.original.length + it.key.length + 8;
    if (current.length && (size + len > MAX_CHUNK_CHARS || current.length >= MAX_CHUNK_ITEMS)) {
      chunks.push(current);
      current = [];
      size = 0;
    }
    current.push(it);
    size += len;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

export default function DarkMessiahEditor({
  file,
  resourceDir,
  apiKey,
  apiKeys = [],
  prompt,
  selectedModel,
  fallbackModels = [],
  glossary = [],
  onOpenGlossary = () => {},
  onSaved = () => {},
  onDirtyChange = () => {},
}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [translatingId, setTranslatingId] = useState(null);
  const [bulk, setBulk] = useState(null); // { done, total }
  const [copiedId, setCopiedId] = useState(null);
  const abortRef = useRef(false);
  const controllerRef = useRef(null);
  // Token info: estimate before a bulk run (input tokens) and real usage reported after it.
  const [tokenEstimate, setTokenEstimate] = useState(null); // { loading } | { tokens, requests, rows, estimated }
  const [lastUsage, setLastUsage] = useState(null); // { input, output, total, requests }
  const usageRef = useRef(null);

  const fullPrompt = prompt + DM_FORMAT_RULES;
  const keys = apiKeys.length ? apiKeys : [apiKey];
  const newRunner = (onSwitch) => createFallbackRunner({ apiKeys: keys, models: fallbackModels, selectedModel, onSwitch });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const english = (await readEntries(resourceDir, file.englishSegs)) || [];
        const turkish = (await readEntries(resourceDir, file.turkishSegs)) || [];
        const tr = new Map(turkish.map((e) => [e.id, e.value]));
        if (cancelled) return;
        setItems(english.map((e) => ({ id: e.id, key: e.key, original: e.value, translation: tr.get(e.id) || '' })));
        setDirty(false);
        setSaveStatus('');
        setPage(0);
      } catch (err) {
        console.error(err);
        alert('Dosya okunamadı: ' + err.message);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [file, resourceDir]);

  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);

  // Leaving the file (or the page) cancels a running bulk translation.
  useEffect(() => () => {
    abortRef.current = true;
    controllerRef.current?.abort();
  }, [file]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const warnings = useMemo(() => {
    const m = new Map();
    for (const it of items) {
      const p = checkFormatting(it.original, it.translation);
      if (p.length) m.set(it.id, p);
    }
    return m;
  }, [items]);

  // Rows whose English text is empty have nothing to translate: they are never sent to the AI
  // and are left out of the progress counts (the game shows them empty either way).
  const translatable = items.filter((i) => !isEmptyRow(i));
  const translatedCount = translatable.filter((i) => i.translation.trim()).length;

  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr');
    return items.filter((it) => {
      if (filter === 'untranslated' && (it.translation.trim() || isEmptyRow(it))) return false;
      if (filter === 'translated' && !it.translation.trim()) return false;
      if (filter === 'warnings' && !warnings.has(it.id)) return false;
      if (!q) return true;
      return [it.key, it.original, it.translation].some((s) => s.toLocaleLowerCase('tr').includes(q));
    });
  }, [items, filter, query, warnings]);

  // Rows "Toplu Çevir" would send right now (untranslated, non-empty, in the current filter/search).
  const todoRows = useMemo(() => visible.filter((i) => !i.translation.trim() && !isEmptyRow(i)), [visible]);

  // An old estimate no longer matches once the rows, prompt, model or glossary change.
  useEffect(() => { setTokenEstimate(null); }, [todoRows, fullPrompt, selectedModel, glossary]);

  // Counts the input tokens of every request a bulk run would send (one per chunk).
  const estimateTokens = async (rows) => {
    const chunks = splitIntoChunks(rows);
    setTokenEstimate({ loading: true });
    const counts = await Promise.all(chunks.map((c) => countKeyedTokens(toEntries(c), apiKey, fullPrompt, selectedModel, glossary)));
    const est = {
      tokens: counts.reduce((s, c) => s + c.tokens, 0),
      estimated: counts.some((c) => c.estimated),
      requests: chunks.length,
      rows: rows.length,
    };
    setTokenEstimate(est);
    return est;
  };

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageItems = visible.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  const updateTranslations = (updates) => {
    setItems((prev) => prev.map((it) => (updates.has(it.id) ? { ...it, translation: updates.get(it.id) } : it)));
    setDirty(true);
    setSaveStatus('Kaydedilmemiş değişiklikler var');
  };

  const handleSave = async () => {
    setSaveStatus('Kaydediliyor...');
    try {
      // Repeated keys are matched by occurrence order, so once one copy is translated every copy is written
      // (untranslated copies keep the English text) to keep the order intact when the file is reopened.
      const lower = (i) => i.key.toLowerCase();
      const counts = new Map();
      for (const i of items) counts.set(lower(i), (counts.get(lower(i)) || 0) + 1);
      const translatedKeys = new Set(items.filter((i) => i.translation.trim()).map(lower));
      const entries = items
        .filter((i) => i.translation.trim() || (counts.get(lower(i)) > 1 && translatedKeys.has(lower(i))))
        .map((i) => ({ key: i.key, value: i.translation.trim() ? i.translation : i.original }));
      await writeEntries(resourceDir, file.turkishSegs, entries);
      setDirty(false);
      setSaveStatus('Kaydedildi');
      const nonEmpty = items.filter((i) => !isEmptyRow(i));
      onSaved({ total: nonEmpty.length, translated: nonEmpty.filter((i) => i.translation.trim()).length });
      setTimeout(() => setSaveStatus((s) => (s === 'Kaydedildi' ? '' : s)), 3000);
    } catch (err) {
      console.error(err);
      setSaveStatus('Kayıt hatası: ' + err.message);
    }
  };

  const handleTranslateSingle = async (item) => {
    if (isEmptyRow(item)) return;
    if (!apiKey) return alert('Önce sağ üstteki Ayarlar bölümünden Gemini API anahtarınızı girin.');
    setTranslatingId(item.id);
    const res = await newRunner().run(async (key, m) => {
      const t = await translateText(item.original, key, fullPrompt, m, glossary);
      if (!t) throw new Error('Boş cevap');
      return t;
    });
    if (res.ok) updateTranslations(new Map([[item.id, res.value]]));
    else alert('Çeviri tüm API anahtarları ve modellerde başarısız oldu (ayrıntı tarayıcı konsolunda).');
    setTranslatingId(null);
  };

  // One request per chunk. Rows are sent with IDs and answers are matched by ID, so a skipped row
  // can never shift the others. Returns Map(itemId -> translation) with the rows that came back,
  // 'split' when the JSON answer was cut off (too big), or null when every model failed / stop.
  // `runner` keeps its place between chunks: once a key is used up, later chunks start at the next key.
  const requestChunk = async (chunk, runner) => {
    const canSplit = chunk.length > MIN_SPLIT;
    const entries = toEntries(chunk);
    const r = await runner.run(
      (key, m) => translateKeyed(entries, key, fullPrompt, m, glossary, controllerRef.current?.signal),
      {
        shouldStop: () => abortRef.current,
        // A cut-off JSON answer means the request was too big, not that the key/model is broken.
        onError: (err) => (canSplit && /JSON/i.test(err.message) ? 'abort' : undefined),
      },
    );
    if (r.error) return 'split';
    if (!r.ok) return null;
    const res = r.value;
    if (res.usage && usageRef.current) {
      const u = usageRef.current;
      u.input += res.usage.promptTokenCount || 0;
      u.output += res.usage.candidatesTokenCount || 0;
      u.total += res.usage.totalTokenCount || 0;
      u.requests++;
    }
    // A valid answer is returned even if some (or all) rows are missing: those rows are retried
    // on their own by the caller instead of being treated as an API failure.
    return new Map(chunk.flatMap((b, k) => (res.has('r' + k) ? [[b.id, res.get('r' + k)]] : [])));
  };

  // Like the S.T.A.L.K.E.R. editor, the whole selection goes in as few requests as possible.
  // Only very large files are split (by text size) so a single answer is never cut off.
  const handleBulkTranslate = async () => {
    if (!apiKey) return alert('Önce sağ üstteki Ayarlar bölümünden Gemini API anahtarınızı girin.');
    const todo = todoRows;
    if (todo.length === 0) return alert('Bu görünümde çevrilmemiş satır yok.');
    const chunks = splitIntoChunks(todo);
    // Reuse the estimate on screen when it is still valid (it is cleared whenever the rows change).
    const est = tokenEstimate && !tokenEstimate.loading ? tokenEstimate : await estimateTokens(todo);
    if (!confirm(`${todo.length} çevrilmemiş satır yapay zekayla çevrilecek (${chunks.length} API isteği).\nGönderilecek metin: ${est.estimated ? 'yaklaşık ' : ''}${fmt(est.tokens)} token (cevap tokenleri buna dahil değil).\n\nDevam edilsin mi?`)) return;

    usageRef.current = { input: 0, output: 0, total: 0, requests: 0 };
    abortRef.current = false;
    controllerRef.current = new AbortController();
    let done = 0;
    let requests = 0;
    let failed = 0;
    const skipped = [];
    const retries = new Map();
    let using = null; // shown on the stop button after a switch: "Anahtar 2 · model"
    setBulk({ done, total: todo.length, requests, using });
    const runner = newRunner((c) => {
      using = `Anahtar ${c.keyIndex + 1} · ${c.model}`;
      setBulk((b) => (b ? { ...b, using } : b));
    });

    const queue = [...chunks];
    while (queue.length && !abortRef.current) {
      const chunk = queue.shift();
      requests++;
      setBulk({ done, total: todo.length, requests, using });
      const res = await requestChunk(chunk, runner);
      if (res === 'split') {
        // Answer was cut off: send the same rows again as two smaller requests.
        const mid = Math.ceil(chunk.length / 2);
        queue.unshift(chunk.slice(0, mid), chunk.slice(mid));
      } else if (res) {
        updateTranslations(res);
        done += res.size;
        // Rows the model skipped are re-sent on their own (at most twice), then left untranslated.
        const missing = chunk.filter((b) => !res.has(b.id));
        const again = [];
        for (const b of missing) {
          const n = (retries.get(b.id) || 0) + 1;
          retries.set(b.id, n);
          if (n <= 2) again.push(b);
          else { skipped.push(b); done++; }
        }
        if (again.length) queue.unshift(again);
      } else if (!abortRef.current) {
        // Every key and model failed (usually quota or network): stop instead of burning more requests.
        failed = todo.length - done;
        break;
      }
      setBulk({ done, total: todo.length, requests, using });
    }
    controllerRef.current = null;
    setBulk(null);
    if (usageRef.current?.requests) setLastUsage({ ...usageRef.current });
    usageRef.current = null;
    if (failed) alert(`Tüm API anahtarları ve modeller hata verdiği için ${failed} satır çevrilemedi (kota veya bağlantı sorunu olabilir; ayrıntı tarayıcı konsolunda). Çevrilenler korunur, "Toplu Çevir" ile kalanlara devam edebilirsiniz.`);
    else if (skipped.length) alert(`Model ${skipped.length} satırı tekrar denemelere rağmen çevirmedi; bu satırlar boş bırakıldı ve diğer çevirileri etkilemedi:\n${skipped.slice(0, 10).map((b) => b.key.trim()).join(', ')}${skipped.length > 10 ? ', ...' : ''}`);
  };

  const handleStop = () => {
    abortRef.current = true;
    controllerRef.current?.abort();
  };

  const handleCopyOriginal = (item) => {
    updateTranslations(new Map([[item.id, item.original]]));
    setCopiedId(item.id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-gray-500">
        <Loader2 className="w-10 h-10 animate-spin mb-4 text-red-600" />
        <p className="text-lg font-medium">Dosya yükleniyor...</p>
      </div>
    );
  }

  const filterBtn = (id, label, count) => (
    <button
      key={id}
      onClick={() => { setFilter(id); setPage(0); }}
      className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${filter === id ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-200'}`}
    >
      {label} <span className="opacity-70">({count})</span>
    </button>
  );

  return (
    <div className="flex flex-col h-full bg-white w-full min-w-0">
      <div className="sticky top-0 z-10 border-b border-gray-200 bg-white/95 backdrop-blur shadow-sm">
        <div className="flex items-center justify-between gap-3 p-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex flex-col min-w-0">
              <h2 className="text-lg font-bold text-gray-800 truncate" title={file.turkishSegs.join('/')}>{file.label}</h2>
              <span className="text-xs font-mono text-gray-500 truncate">{file.englishSegs.join('/')} → {file.turkishSegs.join('/')}</span>
            </div>
            <button
              onClick={onOpenGlossary}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-md text-sm font-medium transition-colors border border-indigo-200 shrink-0"
            >
              <BookOpen size={16} />
              Sözlük
              {glossary.length > 0 && <span className="bg-indigo-200 text-indigo-800 text-[10px] px-1.5 py-0.5 rounded-full">{glossary.length}</span>}
            </button>
          </div>

          <div className="flex items-center gap-3">
            {!bulk && todoRows.length > 0 && (
              tokenEstimate?.loading ? (
                <span className="flex items-center gap-1.5 text-xs text-gray-500 px-2">
                  <Loader2 size={12} className="animate-spin" /> Hesaplanıyor
                </span>
              ) : tokenEstimate ? (
                <button
                  onClick={() => estimateTokens(todoRows)}
                  title={`Toplu Çevir ile gönderilecek ${tokenEstimate.rows} satırın giriş tokeni (${tokenEstimate.requests} istek). Cevap tokenleri buna dahil değildir. Yeniden hesaplamak için tıklayın.`}
                  className="text-xs px-2.5 py-1.5 rounded-md bg-gray-100 text-gray-700 font-medium hover:bg-gray-200"
                >
                  {tokenEstimate.estimated ? '≈' : '~'}{fmt(tokenEstimate.tokens)} token · {tokenEstimate.requests} istek
                </button>
              ) : (
                <button
                  onClick={() => estimateTokens(todoRows)}
                  disabled={!apiKey}
                  title={apiKey ? 'Toplu Çevir ile gönderilecek metnin token sayısını hesapla' : 'Sağ üstteki Ayarlar bölümünden API anahtarı girin'}
                  className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md bg-gray-100 text-gray-700 font-medium hover:bg-gray-200 disabled:opacity-50"
                >
                  <Calculator size={13} /> Token Hesapla
                </button>
              )
            )}
            {bulk ? (
              <button
                onClick={handleStop}
                title={`${bulk.requests}. API isteği bekleniyor${bulk.using ? ` (şu an: ${bulk.using})` : ''}`}
                className="flex items-center gap-1.5 bg-red-100 hover:bg-red-200 text-red-700 px-3 py-1.5 rounded-md text-sm font-bold border border-red-200"
              >
                <Loader2 size={16} className="animate-spin" />
                {bulk.done}/{bulk.total} · İstek {bulk.requests}{bulk.using ? ` · ${bulk.using}` : ''} · Durdur
                <Square size={12} className="fill-red-700" />
              </button>
            ) : (
              <button
                onClick={handleBulkTranslate}
                disabled={!apiKey || items.length === 0}
                title={apiKey ? 'Görünümdeki çevrilmemiş satırları çevir' : 'Sağ üstteki Ayarlar bölümünden API anahtarı girin'}
                className="flex items-center gap-1.5 bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700 text-white px-3 py-1.5 rounded-md text-sm font-bold shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Zap size={16} className="text-yellow-200 fill-yellow-200" />
                Toplu Çevir
              </button>
            )}
            <span className="text-sm font-medium text-gray-500 min-w-[140px] text-right">{saveStatus}</span>
            <button
              onClick={handleSave}
              disabled={!dirty || !!bulk}
              className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold transition-all shadow-sm ${dirty && !bulk ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}
            >
              <Save size={18} />
              Kaydet
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3 px-3 pb-3 flex-wrap">
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            {filterBtn('all', 'Tümü', items.length)}
            {filterBtn('untranslated', 'Çevrilmemiş', translatable.length - translatedCount)}
            {filterBtn('translated', 'Çevrilmiş', translatedCount)}
            {filterBtn('warnings', 'Uyarılı', warnings.size)}
          </div>
          <div className="relative flex-1 min-w-[180px] max-w-md">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={query}
              onChange={(e) => { setQuery(e.target.value); setPage(0); }}
              placeholder="Anahtar, orijinal veya çeviride ara..."
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-red-500 outline-none"
            />
          </div>
          <div className="text-xs text-gray-500 ml-auto">
            İlerleme: <b className="text-gray-700">{translatedCount}/{translatable.length}</b> ({translatable.length ? Math.round((translatedCount / translatable.length) * 100) : 100}%)
            {items.length > translatable.length && <span className="text-gray-400"> · {items.length - translatable.length} boş satır</span>}
            {lastUsage && (
              <span
                className="ml-2 pl-2 border-l border-gray-300"
                title={`Son toplu çeviride API'nin bildirdiği gerçek kullanım (${lastUsage.requests} başarılı istek). Giriş: gönderilen metin, çıkış: gelen çeviri.`}
              >
                Son toplu çeviri: <b className="text-gray-700">{fmt(lastUsage.total)}</b> token ({fmt(lastUsage.input)} giriş + {fmt(lastUsage.output)} çıkış)
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
        <div className="max-w-6xl mx-auto space-y-3 pb-6">
          {pageItems.map((item) => {
            const problems = warnings.get(item.id);
            return (
              <div key={item.id} className={`bg-white rounded-xl shadow-sm border overflow-hidden ${problems ? 'border-amber-300' : 'border-gray-200'}`}>
                <div className="flex">
                  <div className="w-1/2 p-4 bg-gray-50/60 border-r border-gray-100 min-w-0">
                    <div className="flex items-center justify-between mb-2 gap-2">
                      <span className="text-[11px] font-mono font-semibold text-gray-400 truncate" title={item.key.trim()}>{item.key.trim()}</span>
                      <button
                        onClick={() => handleCopyOriginal(item)}
                        className="text-gray-400 hover:text-red-600 transition-colors shrink-0"
                        title="Orijinali çeviriye kopyala"
                      >
                        {copiedId === item.id ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                      </button>
                    </div>
                    {isEmptyRow(item)
                      ? <p className="text-gray-400 italic">(İngilizce metin boş — çevrilecek bir şey yok)</p>
                      : <p className="text-gray-800 whitespace-pre-wrap break-words leading-relaxed">{item.original}</p>}
                  </div>
                  <div className="w-1/2 p-4 min-w-0">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] font-bold text-red-700 uppercase tracking-wider">Türkçe</span>
                      <button
                        onClick={() => handleTranslateSingle(item)}
                        disabled={translatingId === item.id || !!bulk || !apiKey || isEmptyRow(item)}
                        className="text-xs bg-red-50 hover:bg-red-100 text-red-700 px-3 py-1 rounded-full font-semibold flex items-center gap-1 disabled:opacity-50"
                      >
                        {translatingId === item.id ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} className="fill-red-600" />}
                        Yapay Zeka
                      </button>
                    </div>
                    <textarea
                      value={item.translation}
                      onChange={(e) => updateTranslations(new Map([[item.id, e.target.value]]))}
                      className="w-full min-h-[72px] p-2 border border-gray-200 rounded-md resize-y focus:ring-2 focus:ring-red-400 focus:outline-none text-gray-800 leading-relaxed placeholder-gray-300"
                      placeholder="Boş bırakılırsa oyunda İngilizcesi görünür..."
                    />
                    {problems && (
                      <div className="mt-1.5 flex items-start gap-1.5 text-xs text-amber-700">
                        <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                        <span>{problems.join(' · ')}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {visible.length === 0 && (
            <div className="text-center p-12 bg-white rounded-xl border border-gray-200 border-dashed text-gray-500 font-medium">
              Bu görünümde satır yok.
            </div>
          )}
        </div>
      </div>

      {pageCount > 1 && (
        <div className="border-t border-gray-200 bg-white px-4 py-2 flex items-center justify-center gap-3 text-sm">
          <button disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)} className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"><ChevronLeft size={18} /></button>
          <span className="text-gray-600">Sayfa <b>{currentPage + 1}</b> / {pageCount} · {visible.length} satır</span>
          <button disabled={currentPage >= pageCount - 1} onClick={() => setPage(currentPage + 1)} className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"><ChevronRight size={18} /></button>
        </div>
      )}
    </div>
  );
}
