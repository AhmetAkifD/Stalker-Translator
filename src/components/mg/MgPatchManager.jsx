import { useState, useEffect, useCallback } from 'react';
import { getStatus, installPatch, uninstallPatch } from '../../utils/mg/gameApi';
import { MG_GAMES } from '../../utils/mg/mgRaw';
import { Download, Trash2, Loader2, CheckCircle2, XCircle, RefreshCw, AlertTriangle, Gamepad2, Info, Settings } from 'lucide-react';

// `game` comes from useGamePath(); `collectPatch()` returns { mg1: [{ id, text }], mg2: [...] }.
export default function MgPatchManager({ hasWorkspace, collectPatch, progress, game, onOpenSettings, sourceError }) {
  const validation = game.validation;
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState(null); // { type, text }

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
    const total = Object.values(patch).reduce((s, rows) => s + rows.length, 0);
    if (total === 0) throw new Error('Çalışma klasöründe henüz kaydedilmiş Türkçe satır yok.');
    const res = await installPatch(validation.root, patch);
    const parts = Object.entries(res.games).map(([g, r]) => `${MG_GAMES[g].title}: ${r.rows} satır`);
    const replaced = [...new Set(Object.values(res.games).flatMap((r) => r.replaced))];
    const unknown = [...new Set(Object.values(res.games).flatMap((r) => r.unknown))];
    let text = `Yama kuruldu. ${parts.join(' · ')}.`;
    if (replaced.length) text += ` Fontta olmayan harfler en yakın harfle yazıldı: ${replaced.join(' ')}.`;
    if (unknown.length) text += ` Oyunda karşılığı olmayan karakterler "?" oldu: ${unknown.join(' ')}.`;
    return text;
  });

  const handleUninstall = () => {
    if (!confirm('Türkçe yama oyundan kaldırılacak: orijinal İngilizce metin dosyaları yedekten geri yüklenir. Çalışma klasöründeki çevirilerinize dokunulmaz. Devam edilsin mi?')) return;
    run('uninstall', async () => {
      await uninstallPatch(validation.root);
      return 'Yama kaldırıldı. Oyun orijinal İngilizce metinlerine döndü.';
    });
  };

  const pct = progress.total ? Math.round((progress.translated / progress.total) * 100) : 0;
  const replacedOutside = status && Object.values(status.games || {}).some((g) => g.replaced);

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 p-6">
      <div className="max-w-3xl mx-auto space-y-5">
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

        {sourceError && (
          <div className="flex items-start gap-2 text-sm bg-red-50 border border-red-200 text-red-700 rounded-md p-3">
            <XCircle size={16} className="shrink-0 mt-0.5" /> <span>Oyunun metinleri okunamadı: {sourceError}</span>
          </div>
        )}

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
            {Object.entries(MG_GAMES).map(([g, info]) => {
              const s = status?.games?.[g];
              return (
                <div key={g} className="rounded-lg bg-gray-50 border border-gray-200 p-3">
                  <div className="text-xs font-semibold text-gray-500 uppercase truncate" title={info.title}>{info.title}</div>
                  <div className={`text-base font-bold mt-1 ${s?.installed ? 'text-green-700' : 'text-gray-500'}`}>
                    {!s ? '—' : s.installed ? 'Kurulu' : 'Kurulu değil'}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">{s?.installed ? `${s.rows} Türkçe satır` : s?.replaced ? 'Dosya sonradan değişmiş' : ''}</div>
                </div>
              );
            })}
          </div>

          {status?.running && (
            <div className="mb-4 flex items-center gap-2 text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded-md p-3">
              <AlertTriangle size={16} /> Oyun şu an açık. Kurma ve kaldırma için önce oyunu ve başlatıcısını kapatın.
            </div>
          )}
          {replacedOutside && (
            <div className="mb-4 flex items-start gap-2 text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded-md p-3">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <span>Yama kurulduktan sonra oyun dosyası değişmiş (Steam güncellemesi veya "dosyaları doğrula"). Türkçe metinler için yamayı yeniden kurun.</span>
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleInstall}
              disabled={!hasWorkspace || !validation?.ok || !!busy || status?.running || !!sourceError}
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
          </div>

          {message && (
            <div className={`mt-4 text-sm rounded-md p-3 border ${message.type === 'error' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-green-50 border-green-200 text-green-800'}`}>
              {message.text}
            </div>
          )}
        </section>

        <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 text-sm text-gray-600 space-y-2">
          <div className="flex items-center gap-2 font-bold text-gray-800"><Info size={16} /> Nasıl çalışır?</div>
          <p>Oyun İngilizce metinleri <span className="font-mono">fr\stage\mg1\cache\ovr_stm\ovr_eu\english.raw</span> ve <span className="font-mono">...\mg2\...\english.raw</span> dosyalarından okur. Yama bu iki dosyadaki İngilizce metinleri Türkçeyle değiştirir; çevrilmemiş satırlar İngilizce kalır. Oyunu İngilizce dilinde oynayın.</p>
          <p>İlk kurulumda orijinal dosyalar <span className="font-mono">turkce_yama\yedek</span> klasörüne kopyalanır; "Yamayı Kaldır" bunları geri koyar. Steam'in "Oyun dosyalarını doğrula" özelliği de orijinal dosyaları geri getirir.</p>
          <p>Oyunun fontunda <b>ç ö ü Ç Ö Ü â î û</b> var; <b>ğ ş ı İ</b> yok. Bunlar şimdilik <b>g s i I</b> olarak yazılır.</p>
        </section>
      </div>
    </div>
  );
}
