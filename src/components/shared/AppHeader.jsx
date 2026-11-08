import { ArrowLeft, Settings } from 'lucide-react';
import { accentOf } from './theme';

// Common top bar for every game page: back button, title, page-specific actions, settings button (top right).
export default function AppHeader({ title, accent = 'blue', onBack, settingsOpen = false, onToggleSettings, children }) {
  const a = accentOf(accent);
  return (
    <header className="h-12 bg-gray-900 border-b border-gray-800 flex items-center px-4 gap-3 shrink-0">
      <button onClick={onBack} className="text-gray-400 hover:text-white transition-colors" title="Ana Menüye Dön">
        <ArrowLeft size={20} />
      </button>
      <div className="h-4 w-px bg-gray-700" />
      <h1 className="text-white font-bold text-sm tracking-wide truncate">{title}</h1>

      <div className="ml-auto flex items-center gap-1">
        {children}
        {onToggleSettings && (
          <>
            <div className="h-5 w-px bg-gray-700 mx-1" />
            <button
              onClick={onToggleSettings}
              title="Bu oyunun ayarları"
              className={`px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 text-sm font-medium transition-colors ${settingsOpen ? a.solid : 'text-gray-300 hover:text-white hover:bg-gray-800'}`}
            >
              <Settings size={17} />
              <span className="hidden sm:inline">Ayarlar</span>
            </button>
          </>
        )}
      </div>
    </header>
  );
}

// Button style for actions placed inside the header (glossary, patch, ...).
export function HeaderButton({ icon: Icon, label, active = false, accent = 'blue', onClick, disabled, title }) {
  const a = accentOf(accent);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title || label}
      className={`px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 text-sm font-medium transition-colors disabled:opacity-40 ${active ? a.solid : 'text-gray-300 hover:text-white hover:bg-gray-800'}`}
    >
      <Icon size={17} />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
