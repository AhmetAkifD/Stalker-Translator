import { Bot, RotateCcw } from 'lucide-react';
import ModelSelector from '../ModelSelector';
import ApiKeyList from './ApiKeyList';
import { SettingsSection } from './SettingsPage';
import { accentOf } from './theme';

// Model selection, system prompt and API key — identical for every game.
// `ai` is the object returned by useAiSettings(); `promptHint` is an optional game-specific note.
export default function AiSettingsSection({ ai, accent = 'blue', promptHint }) {
  const a = accentOf(accent);

  return (
    <SettingsSection
      icon={Bot}
      accent={accent}
      title="Yapay Zeka"
      description="API anahtarları ve model listesi tüm oyunlarda ortaktır; çeviri komutu bu oyuna özeldir."
    >
      <div className="space-y-5">
        <div className="flex flex-wrap gap-4 items-end">
          <ModelSelector selectedModel={ai.model} onSelectModel={ai.setModel} models={ai.models} setModels={ai.setModels} />
          <p className="text-xs text-gray-500 flex-1 min-w-[200px] pb-1.5">
            Seçili model başarısız olursa listede altındaki modeller sırayla denenir; hepsi başarısız olursa sıradaki API anahtarına geçilir. Sırayı ok tuşlarıyla değiştirebilirsiniz.
          </p>
        </div>

        <ApiKeyList keys={ai.apiKeys} setKeys={ai.setApiKeys} accent={accent} />

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
