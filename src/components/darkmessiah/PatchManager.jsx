import { useState, useEffect, useCallback } from 'react';
import { getStatus, installPatch, uninstallPatch, setLanguage } from '../../utils/darkmessiah/gameApi';
import { Download, Trash2, Loader2, CheckCircle2, XCircle, RefreshCw, Languages, AlertTriangle, Gamepad2, Info, Settings } from 'lucide-react';

// `game` comes from useGamePath() (the location itself is edited on the settings page).
export default function PatchManager({ hasWorkspace, collectPatch, progress, game, onOpenSettings }) {
  const validation = game.validation;
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState(null); // { type, text }
  const [enableTurkish, setEnableTurkish] = useState(true);

  const refresh = useCallback(async () => {
    if (!validation?.ok) { setStatus(null); return; }
    try {
      setStatus(await getStatus(validation.root));
    } catch (err) {
      setStatus(null);
      setMessage({ type: 'error', text: err.message });
    }
  }, [validation]);

  useEffect(() => { refresh(); }, [refresh]);

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
        {/* Game location summary (edited in Settings) */}
        <section className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-4 flex items-center gap-3">
          <div className="bg-red-100 p-2 rounded-lg shrink-0"><Gamepad2 className="text-red-700" size={20} /></div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-gray-500 uppercase">Oyun Konumu</div>
            {validation?.ok ? (
              <div className="flex items-center gap-1.5 text-sm text-green-700 min-w-0">
                <CheckCircle2 size={15} className="shrink-0" />
                <span className="font-mono truncate" title={validation.root}>{validation.root}</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-sm text-red-600">
                <XCircle size={15} className="shrink-0" />
                <span>{game.detecting ? 'Oyun aranıyor...' : validation?.error || game.detectError || 'Oyun konumu ayarlanmadı.'}</span>
              </div>
            )}
          </div>
          <button onClick={onOpenSettings} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold bg-gray-100 hover:bg-gray-200 rounded-md border border-gray-300 shrink-0">
            <Settings size={15} /> Değiştir
          </button>
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
