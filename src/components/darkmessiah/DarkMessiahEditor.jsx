import { useState, useEffect, useMemo, useRef } from 'react';
import { translateText, translateBulk } from '../../utils/geminiApi';
import { readEntries, writeEntries } from '../../utils/darkmessiah/workspace';
import { checkFormatting, DM_FORMAT_RULES } from '../../utils/darkmessiah/valveLocalization';
import { Save, Loader2, Zap, Copy, Check, BookOpen, Search, AlertTriangle, ChevronLeft, ChevronRight, Square } from 'lucide-react';

const PAGE_SIZE = 50;
// Source text per request. ~40k characters stays far below Gemini's output limit even after
// Turkish expansion, so almost every file is translated in a single request.
const MAX_CHUNK_CHARS = 40000;
const MAX_CHUNK_ITEMS = 1500;
const MIN_SPLIT = 20;

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

  const fullPrompt = prompt + DM_FORMAT_RULES;
  const modelsToTry = useMemo(() => {
    const start = fallbackModels.indexOf(selectedModel);
    return fallbackModels.length ? fallbackModels.slice(start >= 0 ? start : 0) : [selectedModel];
  }, [fallbackModels, selectedModel]);

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

  const translatedCount = items.filter((i) => i.translation.trim()).length;

  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr');
    return items.filter((it) => {
      if (filter === 'untranslated' && it.translation.trim()) return false;
      if (filter === 'translated' && !it.translation.trim()) return false;
      if (filter === 'warnings' && !warnings.has(it.id)) return false;
      if (!q) return true;
      return [it.key, it.original, it.translation].some((s) => s.toLocaleLowerCase('tr').includes(q));
    });
  }, [items, filter, query, warnings]);

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
      onSaved({ total: items.length, translated: items.filter((i) => i.translation.trim()).length });
      setTimeout(() => setSaveStatus((s) => (s === 'Kaydedildi' ? '' : s)), 3000);
    } catch (err) {
      console.error(err);
      setSaveStatus('Kayıt hatası: ' + err.message);
    }
  };

  const handleTranslateSingle = async (item) => {
    if (!apiKey) return alert('Önce üst çubuktaki Gemini API Key alanına anahtarınızı girin.');
    setTranslatingId(item.id);
    let ok = false;
    for (const m of modelsToTry) {
      try {
        const t = await translateText(item.original, apiKey, fullPrompt, m, glossary);
        if (t) { updateTranslations(new Map([[item.id, t]])); ok = true; break; }
      } catch (err) { console.error(err); }
    }
    if (!ok) alert('Çeviri tüm modellerde başarısız oldu.');
    setTranslatingId(null);
  };

  // One request per chunk. Returns the translations, 'split' when the answer was the wrong size
  // (missing rows / cut-off JSON: a smaller chunk fixes that, retrying the same size only wastes quota),
  // or null when every model failed (network, quota...) or the user pressed stop.
  const requestChunk = async (chunk) => {
    const canSplit = chunk.length > MIN_SPLIT;
    for (const m of modelsToTry) {
      for (let attempt = 0; attempt < 2; attempt++) {
        if (abortRef.current) return null;
        try {
          const res = await translateBulk(chunk.map((b) => b.original), apiKey, fullPrompt, m, glossary, controllerRef.current?.signal);
          if (Array.isArray(res) && res.length === chunk.length) return res;
          console.warn(`${m}: ${chunk.length} satır gönderildi, ${Array.isArray(res) ? res.length : 'geçersiz'} cevap geldi.`);
          if (canSplit) return 'split';
        } catch (err) {
          if (abortRef.current) return null;
          console.error(err);
          if (canSplit && /JSON/i.test(err.message)) return 'split';
        }
      }
    }
    return null;
  };

  // Like the S.T.A.L.K.E.R. editor, the whole selection goes in as few requests as possible.
  // Only very large files are split (by text size) so a single answer is never cut off.
  const handleBulkTranslate = async () => {
    if (!apiKey) return alert('Önce üst çubuktaki Gemini API Key alanına anahtarınızı girin.');
    const todo = visible.filter((i) => !i.translation.trim());
    if (todo.length === 0) return alert('Bu görünümde çevrilmemiş satır yok.');
    const chunks = splitIntoChunks(todo);
    if (!confirm(`${todo.length} çevrilmemiş satır yapay zekayla çevrilecek (${chunks.length} API isteği). Devam edilsin mi?`)) return;

    abortRef.current = false;
    controllerRef.current = new AbortController();
    let done = 0;
    let requests = 0;
    let failed = 0;
    setBulk({ done, total: todo.length, requests });

    // A chunk whose answer comes back broken is split in half and retried, instead of failing entirely.
    const queue = [...chunks];
    while (queue.length && !abortRef.current) {
      const chunk = queue.shift();
      requests++;
      setBulk({ done, total: todo.length, requests });
      const res = await requestChunk(chunk);
      if (res === 'split') {
        const mid = Math.ceil(chunk.length / 2);
        queue.unshift(chunk.slice(0, mid), chunk.slice(mid));
      } else if (res) {
        updateTranslations(new Map(chunk.map((b, k) => [b.id, String(res[k] ?? '')])));
        done += chunk.length;
      } else if (!abortRef.current) {
        // Every model failed (usually quota or network): stop instead of burning more requests.
        failed = todo.length - done;
        break;
      }
      setBulk({ done, total: todo.length, requests });
    }
    controllerRef.current = null;
    setBulk(null);
    if (failed) alert(`API hatası nedeniyle ${failed} satır çevrilemedi (kota veya bağlantı sorunu olabilir; ayrıntı tarayıcı konsolunda). Çevrilenler korunur, "Toplu Çevir" ile kalanlara devam edebilirsiniz.`);
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
            {bulk ? (
              <button
                onClick={handleStop}
                title={`${bulk.requests}. API isteği bekleniyor`}
                className="flex items-center gap-1.5 bg-red-100 hover:bg-red-200 text-red-700 px-3 py-1.5 rounded-md text-sm font-bold border border-red-200"
              >
                <Loader2 size={16} className="animate-spin" />
                {bulk.done}/{bulk.total} · İstek {bulk.requests} · Durdur
                <Square size={12} className="fill-red-700" />
              </button>
            ) : (
              <button
                onClick={handleBulkTranslate}
                disabled={!apiKey || items.length === 0}
                title={apiKey ? 'Görünümdeki çevrilmemiş satırları çevir' : 'Üst çubuktan API anahtarı girin'}
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
            {filterBtn('untranslated', 'Çevrilmemiş', items.length - translatedCount)}
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
            İlerleme: <b className="text-gray-700">{translatedCount}/{items.length}</b> ({items.length ? Math.round((translatedCount / items.length) * 100) : 0}%)
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
                    <p className="text-gray-800 whitespace-pre-wrap break-words leading-relaxed">{item.original}</p>
                  </div>
                  <div className="w-1/2 p-4 min-w-0">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] font-bold text-red-700 uppercase tracking-wider">Türkçe</span>
                      <button
                        onClick={() => handleTranslateSingle(item)}
                        disabled={translatingId === item.id || !!bulk || !apiKey}
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
