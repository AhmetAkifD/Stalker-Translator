import { Settings, X } from 'lucide-react';
import { accentOf } from './theme';

// Settings page shown over the main work area. Each game passes its own <SettingsSection>s as children.
// It is drawn on top (not instead) of the editor, so unsaved editor work is kept while settings are open.
export default function SettingsPage({ gameName, accent = 'blue', onClose, children }) {
  const a = accentOf(accent);
  return (
    <div className="absolute inset-0 z-30 overflow-y-auto bg-gray-50 p-6">
      <div className="max-w-3xl mx-auto space-y-5">
        <div className="flex items-center gap-3">
          <div className={`${a.iconBg} p-2 rounded-lg`}><Settings className={a.icon} size={22} /></div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-gray-800">Ayarlar</h2>
            <p className="text-sm text-gray-500 truncate">{gameName}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-gray-500 hover:bg-gray-200 hover:text-gray-800" title="Ayarları kapat">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function SettingsSection({ icon: Icon, title, description, accent = 'blue', children }) {
  const a = accentOf(accent);
  return (
    <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
      <div className="flex items-center gap-3 mb-5">
        {Icon && <div className={`${a.iconBg} p-2 rounded-lg`}><Icon className={a.icon} size={20} /></div>}
        <div>
          <h3 className="text-lg font-bold text-gray-800">{title}</h3>
          {description && <p className="text-sm text-gray-500">{description}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}
