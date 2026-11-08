import { useState } from 'react';
import { Bot, Key, Eye, EyeOff, RotateCcw } from 'lucide-react';
import ModelSelector from '../ModelSelector';
import { SettingsSection } from './SettingsPage';
import { accentOf } from './theme';

// Model selection, system prompt and API key — identical for every game.
// `ai` is the object returned by useAiSettings(); `promptHint` is an optional game-specific note.
export default function AiSettingsSection({ ai, accent = 'blue', promptHint }) {
  const a = accentOf(accent);
  const [showKey, setShowKey] = useState(false);

  return (
    <SettingsSection
      icon={Bot}
      accent={accent}
      title="Yapay Zeka"
      description="API anahtarı ve model listesi tüm oyunlarda ortaktır; çeviri komutu bu oyuna özeldir."
    >
      <div className="space-y-5">
        <div className="flex flex-wrap gap-4 items-end">
          <ModelSelector selectedModel={ai.model} onSelectModel={ai.setModel} models={ai.models} setModels={ai.setModels} />
          <p className="text-xs text-gray-500 flex-1 min-w-[200px] pb-1.5">
            Toplu çeviride seçili model başarısız olursa listede altındaki modeller sırayla denenir. Sırayı ok tuşlarıyla değiştirebilirsiniz.
          </p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1 flex items-center gap-1"><Key size={12} /> Gemini API Key</label>
          <div className="flex gap-2">
            <input
              type={showKey ? 'text' : 'password'}
              value={ai.apiKey}
              onChange={(e) => ai.setApiKey(e.target.value)}
              placeholder="AIzaSy..."
              autoComplete="off"
              className={`flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm font-mono focus:ring-2 ${a.ring} outline-none`}
            />
            <button
              type="button"
              onClick={() => setShowKey((s) => !s)}
              className="px-3 rounded-md border border-gray-300 text-gray-500 hover:bg-gray-100"
              title={showKey ? 'Gizle' : 'Göster'}
            >
              {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {!ai.apiKey && <p className="text-xs text-amber-700 mt-1">API anahtarı girilmeden yapay zeka çevirisi yapılamaz.</p>}
        </div>

        <div>
          <div className="flex items-center gap-2 mb-1">
            <label className="text-xs font-semibold text-gray-500">System Prompt</label>
            {ai.prompt !== ai.defaultPrompt && (
              <button type="button" onClick={ai.resetPrompt} className={`ml-auto flex items-center gap-1 text-xs ${a.link} hover:underline`}>
                <RotateCcw size={11} /> Varsayılana dön
              </button>
            )}
          </div>
          <textarea
            value={ai.prompt}
            onChange={(e) => ai.setPrompt(e.target.value)}
            rows={5}
            className={`w-full border border-gray-300 rounded-md px-3 py-2 text-sm leading-relaxed focus:ring-2 ${a.ring} outline-none resize-y`}
          />
          <p className="text-xs text-gray-500 mt-1">Bu komut her çeviri isteğinde yapay zekaya gönderilir.{promptHint ? ' ' + promptHint : ''}</p>
        </div>
      </div>
    </SettingsSection>
  );
}
