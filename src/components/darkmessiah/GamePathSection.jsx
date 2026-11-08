import { Gamepad2, Search, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { SettingsSection } from '../shared/SettingsPage';

// Dark Messiah-specific setting: where mm.exe is installed. `game` comes from useGamePath().
export default function GamePathSection({ game }) {
  const v = game.validation;
  return (
    <SettingsSection
      icon={Gamepad2}
      accent="red"
      title="Oyun Konumu"
      description="mm.exe dosyasının bulunduğu klasör. Yama bu klasöre kurulur; bilgi tarayıcıda saklanır."
    >
      <div className="flex gap-2">
        <input
          value={game.gamePath}
          onChange={(e) => game.setGamePath(e.target.value)}
          onBlur={(e) => game.savePath(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && game.savePath(e.currentTarget.value)}
          placeholder="C:\Program Files (x86)\Steam\steamapps\common\Dark Messiah Might and Magic Single Player"
          className="flex-1 min-w-0 border border-gray-300 rounded-md px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-red-500 outline-none"
        />
        <button
          onClick={game.detect}
          disabled={game.detecting}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold bg-gray-100 hover:bg-gray-200 rounded-md border border-gray-300 disabled:opacity-50 shrink-0"
        >
          {game.detecting ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
          Otomatik Bul
        </button>
      </div>
      {game.detectError && (
        <div className="mt-3 flex items-center gap-2 text-sm text-red-600"><XCircle size={16} /> {game.detectError}</div>
      )}
      {v && !game.detectError && (
        <div className={`mt-3 flex items-center gap-2 text-sm ${v.ok ? 'text-green-700' : 'text-red-600'}`}>
          {v.ok ? <CheckCircle2 size={16} className="shrink-0" /> : <XCircle size={16} className="shrink-0" />}
          {v.ok ? <span className="break-all">Bulundu: <span className="font-mono">{v.exe}</span></span> : v.error}
        </div>
      )}
    </SettingsSection>
  );
}
