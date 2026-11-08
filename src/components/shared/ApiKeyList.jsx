import { useState } from 'react';
import { Key, Eye, EyeOff, Trash2, Plus, ArrowUp, ArrowDown } from 'lucide-react';
import { accentOf } from './theme';

// Ordered list of Gemini API keys. The first key is used first; when every model fails on a key
// (quota, invalid key...) the translation moves on to the next key in this order.
export default function ApiKeyList({ keys, setKeys, accent = 'blue' }) {
  const a = accentOf(accent);
  const [shown, setShown] = useState(() => new Set());
  const [draft, setDraft] = useState('');

  const update = (i, v) => setKeys(keys.map((k, j) => (j === i ? v : k)));
  const remove = (i) => {
    setKeys(keys.filter((_, j) => j !== i));
    setShown(new Set());
  };
  const move = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= keys.length) return;
    const next = [...keys];
    [next[i], next[j]] = [next[j], next[i]];
    setKeys(next);
    setShown(new Set());
  };
  const toggle = (i) => setShown((s) => {
    const n = new Set(s);
    if (n.has(i)) n.delete(i); else n.add(i);
    return n;
  });
  const add = (e) => {
    e.preventDefault();
    const v = draft.trim();
    if (!v) return;
    if (!keys.some((k) => k.trim() === v)) setKeys([...keys, v]);
    setDraft('');
  };

  const filled = keys.filter((k) => k.trim()).length;
  const input = `flex-1 min-w-0 border border-gray-300 rounded-md px-3 py-2 text-sm font-mono focus:ring-2 ${a.ring} outline-none`;
  const iconBtn = 'p-1.5 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30 disabled:hover:bg-transparent';

  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 mb-1 flex items-center gap-1">
        <Key size={12} /> Gemini API Anahtarları
      </label>

      <div className="space-y-2">
        {keys.map((k, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <span className="w-6 shrink-0 text-center text-xs font-bold text-gray-400">{i + 1}</span>
            <input
              type={shown.has(i) ? 'text' : 'password'}
              value={k}
              onChange={(e) => update(i, e.target.value)}
              placeholder="AIzaSy..."
              autoComplete="off"
              aria-label={`API anahtarı ${i + 1}`}
              className={input}
            />
            <button type="button" onClick={() => toggle(i)} className={iconBtn} title={shown.has(i) ? 'Gizle' : 'Göster'}>
              {shown.has(i) ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
            <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className={iconBtn} title="Yukarı taşı">
              <ArrowUp size={15} />
            </button>
            <button type="button" onClick={() => move(i, 1)} disabled={i === keys.length - 1} className={iconBtn} title="Aşağı taşı">
              <ArrowDown size={15} />
            </button>
            <button type="button" onClick={() => remove(i)} className={`${iconBtn} hover:!text-red-600`} title="Anahtarı sil">
              <Trash2 size={15} />
            </button>
          </div>
        ))}

        <form onSubmit={add} className="flex items-center gap-1.5">
          <span className="w-6 shrink-0 text-center text-xs font-bold text-gray-300">{keys.length + 1}</span>
          <input
            type="password"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={keys.length ? 'Yedek anahtar ekle...' : 'AIzaSy...'}
            autoComplete="off"
            aria-label="Yeni API anahtarı"
            className={input}
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            className={`flex items-center gap-1 px-3 py-2 rounded-md text-sm font-semibold ${a.solid} hover:opacity-90 disabled:opacity-40`}
          >
            <Plus size={14} /> Ekle
          </button>
        </form>
      </div>

      {filled === 0 ? (
        <p className="text-xs text-amber-700 mt-1">API anahtarı girilmeden yapay zeka çevirisi yapılamaz.</p>
      ) : (
        <p className="text-xs text-gray-500 mt-1">
          Çeviri 1. anahtarla başlar. Bir anahtardaki modellerin hepsi hata verirse (ör. kota dolarsa) sıradaki anahtara geçilir.
        </p>
      )}
    </div>
  );
}
