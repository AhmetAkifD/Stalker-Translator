import { useState, useEffect, useCallback } from 'react';
import { detectGame, validateGame, getStatus, installPatch, uninstallPatch, setLanguage } from '../../utils/darkmessiah/gameApi';
import { Download, Trash2, Loader2, CheckCircle2, XCircle, Search, RefreshCw, Languages, AlertTriangle, Gamepad2, Info } from 'lucide-react';

const STORAGE_KEY = 'dmGamePath';

export default function PatchManager({ hasWorkspace, collectPatch, progress }) {
  const [gamePath, setGamePath] = useState(localStorage.getItem(STORAGE_KEY) || '');
  const [validation, setValidation] = useState(null);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState(null); // { type, text }
  const [enableTurkish, setEnableTurkish] = useState(true);

  const refresh = useCallback(async (p = gamePath) => {
    if (!p.trim()) { setValidation(null); setStatus(null); return; }
    try {
      const v = await validateGame(p);
      setValidation(v);
      setStatus(v.ok ? await getStatus(v.root) : null);
    } catch (err) {
      setValidation({ ok: false, error: err.message });
      setStatus(null);
    }
  }, [gamePath]);

  useEffect(() => {
    (async () => {
      if (gamePath) return refresh(gamePath);
      try {
        const d = await detectGame();
        if (d.ok) {
          setGamePath(d.root);
          localStorage.setItem(STORAGE_KEY, d.root);
          refresh(d.root);
        }
      } catch (err) {
        setMessage({ type: 'error', text: err.message });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const savePath = async (p) => {
    setGamePath(p);
    localStorage.setItem(STORAGE_KEY, p);
    await refresh(p);
  };

  const handleDetect = async () => {
    setBusy('detect');
    setMessage(null);
    try {
      const d = await detectGame();
      if (d.ok) await savePath(d.root);
      else setMessage({ type: 'error', text: d.error });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
    setBusy('');
  };

  const run = async (key, fn) => {
    setBusy(key);
    setMessage(null);
    try {
      const text = await fn();
      if (text) setMessage({ type: 'success', text });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
    await refresh();
    setBusy('');
  };

  const handleInstall = () => run('install', async () => {
    const patch = await collectPatch();
    const count = patch.files.length + (patch.itemnames ? 1 : 0);
    if (count === 0) throw new Error('Çalışma klasöründe henüz kaydedilmiş Türkçe dosya yok.');
    const res = await installPatch(validation.root, patch, enableTurkish);
    let text = `${res.written} dosya oyuna kuruldu.`;
    if (enableTurkish) text += res.language?.reason ? ` Dil ayarlanamadı: ${res.language.reason}` : ' Oyun dili Türkçe olarak ayarlandı.';
    return text;
  });

  const handleUninstall = () => {
    if (!confirm('Türkçe yama oyundan kaldırılacak (mm\\resource\\turkish klasörü ve mm_itemnames_turkish.txt silinir). Çalışma klasöründeki çevirilerinize dokunulmaz. Devam edilsin mi?')) return;
    run('uninstall', async () => {
      await uninstallPatch(validation.root);
      return 'Yama kaldırıldı. Oyun İngilizce dosyalarına döndü.';
    });
  };

  const handleLanguage = (lang) => run('lang', async () => {
    await setLanguage(validation.root, lang);
    return lang === 'turkish' ? 'Oyun dili Türkçe yapıldı.' : 'Oyun dili İngilizce yapıldı.';
  });

  const turkishActive = status?.ccLang === 'turkish';
  const pct = progress.total ? Math.round((progress.translated / progress.total) * 100) : 0;

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 p-6">
      <div className="max-w-3xl mx-auto space-y-5">
        {/* Game location */}
        <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-red-100 p-2 rounded-lg"><Gamepad2 className="text-red-700" size={22} /></div>
            <div>
              <h2 className="text-lg font-bold text-gray-800">Oyun Konumu</h2>
              <p className="text-sm text-gray-500">mm.exe dosyasının bulunduğu klasör. Bu bilgi tarayıcıda saklanır.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <input
              value={gamePath}
              onChange={(e) => setGamePath(e.target.value)}
              onBlur={(e) => savePath(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && savePath(e.currentTarget.value)}
              placeholder="C:\Program Files (x86)\Steam\steamapps\common\Dark Messiah Might and Magic Single Player"
              className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-red-500 outline-none"
            />
            <button onClick={handleDetect} disabled={!!busy} className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold bg-gray-100 hover:bg-gray-200 rounded-md border border-gray-300 disabled:opacity-50">
              {busy === 'detect' ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
              Otomatik Bul
            </button>
          </div>
          {validation && (
            <div className={`mt-3 flex items-center gap-2 text-sm ${validation.ok ? 'text-green-700' : 'text-red-600'}`}>
              {validation.ok ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
              {validation.ok ? <span>Bulundu: <span className="font-mono">{validation.exe}</span></span> : validation.error}
            </div>
          )}
        </section>

        {/* Status + actions */}
        <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-800">Türkçe Yama</h2>
            <button onClick={() => refresh()} disabled={!validation?.ok || !!busy} className="text-gray-500 hover:text-gray-800 disabled:opacity-40" title="Durumu yenile">
              <RefreshCw size={16} />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
            <div className="rounded-lg bg-gray-50 border border-gray-200 p-3">
              <div className="text-xs font-semibold text-gray-500 uppercase">Çeviri ilerlemesi</div>
              <div className="text-xl font-bold text-gray-800 mt-1">{pct}%</div>
              <div className="h-1.5 bg-gray-200 rounded-full mt-2 overflow-hidden"><div className="h-full bg-red-600" style={{ width: `${pct}%` }} /></div>
              <div className="text-xs text-gray-500 mt-1">{progress.translated} / {progress.total} satır</div>
            </div>
            <div className="rounded-lg bg-gray-50 border border-gray-200 p-3">
              <div className="text-xs font-semibold text-gray-500 uppercase">Oyundaki durum</div>
              <div className={`text-base font-bold mt-1 ${status?.installed ? 'text-green-700' : 'text-gray-500'}`}>
                {status ? (status.installed ? 'Kurulu' : 'Kurulu değil') : '—'}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {status?.installed ? `${status.fileCount} dosya${status.installedAt ? ' · ' + new Date(status.installedAt).toLocaleString('tr-TR') : ''}` : ''}
              </div>
            </div>
            <div className="rounded-lg bg-gray-50 border border-gray-200 p-3">
              <div className="text-xs font-semibold text-gray-500 uppercase">Oyun dili (cc_lang)</div>
              <div className={`text-base font-bold mt-1 ${turkishActive ? 'text-red-700' : 'text-gray-700'}`}>
                {!status ? '—' : !status.configExists ? 'config.cfg yok' : turkishActive ? 'Türkçe' : 'İngilizce'}
              </div>
              <div className="text-xs text-gray-500 mt-1">{status?.closecaption === '1' ? 'Altyazılar açık' : status ? 'Altyazılar kapalı' : ''}</div>
            </div>
          </div>

          {status?.running && (
            <div className="mb-4 flex items-center gap-2 text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded-md p-3">
              <AlertTriangle size={16} /> Oyun şu an açık. Kurma, kaldırma ve dil değiştirme için önce oyunu kapatın.
            </div>
          )}

          <label className="flex items-center gap-2 text-sm text-gray-700 mb-4 cursor-pointer select-none">
            <input type="checkbox" checked={enableTurkish} onChange={(e) => setEnableTurkish(e.target.checked)} className="accent-red-600" />
            Kurulumdan sonra oyun dilini Türkçe yap ve altyazıları aç
          </label>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleInstall}
              disabled={!hasWorkspace || !validation?.ok || !!busy || status?.running}
              title={!hasWorkspace ? 'Önce çalışma klasörünü açın' : ''}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold bg-red-700 hover:bg-red-800 text-white shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busy === 'install' ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
              {status?.installed ? 'Yamayı Güncelle' : 'Yamayı Kur'}
            </button>
            <button
              onClick={handleUninstall}
              disabled={!validation?.ok || !status?.installed || !!busy || status?.running}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold bg-white hover:bg-gray-100 text-gray-800 border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busy === 'uninstall' ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
              Yamayı Kaldır
            </button>
            <div className="flex items-center gap-1 ml-auto bg-gray-100 rounded-lg p-1">
              <Languages size={16} className="text-gray-500 mx-1" />
              {[['turkish', 'Türkçe'], ['english', 'İngilizce']].map(([lang, label]) => {
                const active = lang === 'turkish' ? turkishActive : status && !turkishActive;
                return (
                  <button
                    key={lang}
                    onClick={() => handleLanguage(lang)}
                    disabled={!validation?.ok || !status?.configExists || !!busy || status?.running || active || (lang === 'turkish' && !status?.installed)}
                    className={`px-3 py-1.5 rounded-md text-sm font-semibold transition-colors disabled:cursor-not-allowed ${active ? 'bg-white shadow text-gray-900' : 'text-gray-600 hover:bg-gray-200 disabled:opacity-50'}`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {message && (
            <div className={`mt-4 text-sm rounded-md p-3 border ${message.type === 'error' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-green-50 border-green-200 text-green-800'}`}>
              {message.text}
            </div>
          )}
        </section>

        {/* How it works */}
        <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 text-sm text-gray-600 space-y-2">
          <div className="flex items-center gap-2 font-bold text-gray-800"><Info size={16} /> Nasıl çalışır?</div>
          <p>Yama İngilizce dosyaların üzerine yazmaz. Oyun önce İngilizce metinleri, ardından <span className="font-mono">mm\resource\turkish</span> klasöründeki Türkçe metinleri yükler. Çevrilmemiş satırlar oyunda İngilizce görünür.</p>
          <p>Türkçe, oyunun <span className="font-mono">cc_lang</span> ayarıyla seçilir. Bu sayfadaki dil düğmesi dışında şu yollarla da değiştirilebilir:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Oyun içi konsola <span className="font-mono bg-gray-100 px-1 rounded">cc_lang turkish</span> veya <span className="font-mono bg-gray-100 px-1 rounded">cc_lang english</span> yazmak (menülerin tamamen değişmesi için oyunu yeniden başlatın).</li>
            <li>Steam → Özellikler → Başlatma Seçenekleri: <span className="font-mono bg-gray-100 px-1 rounded">+cc_lang turkish</span> (bu, buradaki ayarı her açılışta ezer).</li>
          </ul>
          <p>Diyalog çevirileri altyazı olarak görünür; oyunda altyazıların açık olması gerekir (Seçenekler → Ses). Seslendirme İngilizce kalır.</p>
        </section>
      </div>
    </div>
  );
}
