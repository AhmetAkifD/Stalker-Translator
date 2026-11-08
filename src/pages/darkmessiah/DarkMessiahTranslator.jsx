import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Download } from 'lucide-react';
import DarkMessiahFileBrowser from '../../components/darkmessiah/DarkMessiahFileBrowser';
import DarkMessiahEditor from '../../components/darkmessiah/DarkMessiahEditor';
import PatchManager from '../../components/darkmessiah/PatchManager';
import GamePathSection from '../../components/darkmessiah/GamePathSection';
import GlossaryEditor from '../../components/GlossaryEditor';
import AppHeader, { HeaderButton } from '../../components/shared/AppHeader';
import SettingsPage from '../../components/shared/SettingsPage';
import AiSettingsSection from '../../components/shared/AiSettingsSection';
import { useAiSettings } from '../../hooks/useAiSettings';
import { useGamePath } from '../../utils/darkmessiah/useGamePath';
import { resolveResourceDir, loadManifest, computeStats, collectPatchFiles } from '../../utils/darkmessiah/workspace';
import { useRememberedFolder } from '../../hooks/useRememberedFolder';
import ReopenFolderBanner from '../../components/shared/ReopenFolderBanner';
import { initGlossarySystem, saveGlossary, deleteGlossary } from '../../utils/glossaryManager';

const HANDLE_KEY = 'darkmessiah-workspace';
const DEFAULT_PROMPT = 'You are translating Dark Messiah of Might and Magic, a dark fantasy action RPG, from English to Turkish. Use natural, fluent Turkish that fits a medieval fantasy setting. Keep character and place names (Sareth, Leanna, Xana, Arantir, Phenrig, Menelag, Stonehelm, Ashan) as they are.';
const DM_GLOSSARY_SEED = [
  { id: 'dm_1', original: 'Skull of Shadows', translation: 'Gölgeler Kafatası', pronunciation: '' },
  { id: 'dm_2', original: 'Stonehelm', translation: 'Stonehelm', pronunciation: "Stonhelm (Stonehelm'e, Stonehelm'in)" },
  { id: 'dm_3', original: 'Sareth', translation: 'Sareth', pronunciation: "Sareth (Sareth'e, Sareth'in)" },
  { id: 'dm_4', original: 'Arantir', translation: 'Arantir', pronunciation: "Arantir (Arantir'e, Arantir'in)" },
];

export default function DarkMessiahTranslator() {
  const navigate = useNavigate();
  const [rootHandle, setRootHandle] = useState(null);
  const [resource, setResource] = useState(null); // { resourceDir, label }
  const [files, setFiles] = useState([]);
  const [stats, setStats] = useState({});
  const [selectedFile, setSelectedFile] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [viewMode, setViewMode] = useState('patch'); // patch | editor | glossary

  const [settingsOpen, setSettingsOpen] = useState(false);
  const ai = useAiSettings({ promptKey: 'dmGeminiPrompt', defaultPrompt: DEFAULT_PROMPT });
  const { apiKey, prompt, model, models } = ai;
  const game = useGamePath();

  const [glossariesMap, setGlossariesMap] = useState({});
  const [activeGlossaryName, setActiveGlossaryName] = useState('Ana_Sozluk');

  const openWorkspace = useCallback(async (handle) => {
    const res = await resolveResourceDir(handle);
    if (!res) {
      alert('Bu klasörde "mm/resource/english" ve "mm_itemnames_english.txt" bulunamadı. Lütfen çıkarılmış VPK klasörünü (ör. "vpk unpacked") seçin.');
      return false;
    }
    setRootHandle(handle);
    setResource(res);
    setSelectedFile(null);
    setViewMode('patch');

    const manifest = await loadManifest(res.resourceDir);
    setFiles(manifest);
    setStats({});
    const all = {};
    for (const f of manifest) all[f.id] = await computeStats(res.resourceDir, f);
    setStats(all);

    const glossaries = await initGlossarySystem(handle, DM_GLOSSARY_SEED);
    setGlossariesMap(glossaries);
    setActiveGlossaryName(glossaries['Ana_Sozluk'] ? 'Ana_Sozluk' : Object.keys(glossaries)[0] || '');
    return true;
  }, []);

  const folder = useRememberedFolder(HANDLE_KEY, openWorkspace);

  const confirmDiscard = () => !dirty || confirm('Kaydedilmemiş değişiklikler kaybolacak. Devam edilsin mi?');

  const handleSelectDirectory = async () => {
    if (!confirmDiscard()) return;
    try {
      const handle = await window.showDirectoryPicker({ id: 'darkmessiah', mode: 'readwrite' });
      setDirty(false);
      if (await openWorkspace(handle)) await folder.remember(handle);
    } catch (err) {
      if (err.name !== 'AbortError') alert('Klasör açılamadı: ' + err.message);
    }
  };

  const switchView = (mode) => {
    setSettingsOpen(false);
    if (mode === viewMode) return;
    if (mode !== 'editor' && viewMode === 'editor' && !confirmDiscard()) return;
    if (mode !== 'editor') setDirty(false);
    setViewMode(mode);
  };

  const handleSelectFile = (f) => {
    setSettingsOpen(false);
    if (f.id === selectedFile?.id && viewMode === 'editor') return;
    if (viewMode === 'editor' && !confirmDiscard()) return;
    setDirty(false);
    setSelectedFile(f);
    setViewMode('editor');
  };

  const progress = useMemo(() => Object.values(stats).reduce(
    (acc, s) => ({ total: acc.total + s.total, translated: acc.translated + s.translated }),
    { total: 0, translated: 0 },
  ), [stats]);

  // ---- glossary handlers (same behaviour as the other games) ----
  const handleCreateGlossary = async (name) => {
    await saveGlossary(rootHandle, name, []);
    setGlossariesMap((prev) => ({ ...prev, [name]: [] }));
    setActiveGlossaryName(name);
  };
  const handleDeleteGlossary = async (name) => {
    try {
      await deleteGlossary(rootHandle, name);
      const next = { ...glossariesMap };
      delete next[name];
      setGlossariesMap(next);
      setActiveGlossaryName(Object.keys(next)[0] || '');
    } catch (err) {
      alert(err.message);
    }
  };
  const handleRenameGlossary = async (oldName, newName) => {
    const data = glossariesMap[oldName] || [];
    await saveGlossary(rootHandle, newName, data);
    setGlossariesMap((prev) => ({ ...prev, [newName]: data }));
    setActiveGlossaryName(newName);
    alert(`"${oldName}" sözlüğü "${newName}" olarak kopyalandı! Eski dosya silinmedi.`);
  };
  const handleSaveGlossary = async (name, terms) => {
    await saveGlossary(rootHandle, name, terms);
    setGlossariesMap((prev) => ({ ...prev, [name]: terms }));
  };
  const handleMoveTerm = async (termId, fromName, toName) => {
    const term = glossariesMap[fromName]?.find((t) => t.id === termId);
    if (!term) return;
    const newFrom = glossariesMap[fromName].filter((t) => t.id !== termId);
    const newTo = [...(glossariesMap[toName] || []), term];
    await saveGlossary(rootHandle, fromName, newFrom);
    await saveGlossary(rootHandle, toName, newTo);
    setGlossariesMap((prev) => ({ ...prev, [fromName]: newFrom, [toName]: newTo }));
  };

  // All glossaries merged. When a term is in several files, a copy that already has a Turkish
  // translation wins over an empty one (e.g. wiki-imported lists that are still being filled in).
  const flatGlossary = useMemo(() => {
    const byKey = new Map();
    for (const term of Object.values(glossariesMap).flat()) {
      const key = (term?.original || '').trim().toLowerCase();
      if (!key) continue;
      const prev = byKey.get(key);
      if (!prev || (!prev.translation?.trim() && term.translation?.trim())) byKey.set(key, term);
    }
    return [...byKey.values()];
  }, [glossariesMap]);

  // Header toggles: clicking the active view goes back to the file being edited (or the patch panel).
  const toggleView = (mode) => switchView(viewMode === mode && !settingsOpen ? (selectedFile ? 'editor' : 'patch') : mode);

  return (
    <div className="flex flex-col h-screen bg-gray-100 font-sans overflow-hidden">
      <AppHeader
        title="DARK MESSIAH OF MIGHT & MAGIC · TÜRKÇE YAMA"
        accent="red"
        onBack={() => confirmDiscard() && navigate('/')}
        settingsOpen={settingsOpen}
        onToggleSettings={() => setSettingsOpen((o) => !o)}
      >
        <HeaderButton icon={Download} label="Yama" accent="red" active={viewMode === 'patch' && !settingsOpen} onClick={() => toggleView('patch')} />
        <HeaderButton icon={BookOpen} label={`Sözlük (${flatGlossary.length})`} accent="red" active={viewMode === 'glossary' && !settingsOpen} disabled={!rootHandle} onClick={() => toggleView('glossary')} />
      </AppHeader>

      <div className="flex flex-1 min-h-0">
        <DarkMessiahFileBrowser
          files={files}
          stats={stats}
          selectedId={viewMode === 'editor' ? selectedFile?.id : null}
          onSelectFile={handleSelectFile}
          onSelectDirectory={handleSelectDirectory}
          onOpenPatch={() => switchView('patch')}
          patchActive={viewMode === 'patch' && !settingsOpen}
          workspaceLabel={resource?.label}
        />

        <main className="flex-1 flex flex-col min-w-0 bg-white relative">
          {settingsOpen && (
            <SettingsPage gameName="Dark Messiah of Might & Magic" accent="red" onClose={() => setSettingsOpen(false)}>
              <AiSettingsSection
                ai={ai}
                accent="red"
                promptHint="Tuş kodlarını (%+use%), \n satır sonlarını ve <...> ses açıklamalarını koruma kuralları bu komutun sonuna otomatik eklenir."
              />
              <GamePathSection game={game} />
            </SettingsPage>
          )}
          <ReopenFolderBanner folder={folder} />

          {viewMode === 'glossary' && rootHandle ? (
            <GlossaryEditor
              directoryHandle={rootHandle}
              glossariesMap={glossariesMap}
              activeGlossaryName={activeGlossaryName}
              onSelectGlossary={setActiveGlossaryName}
              onCreateGlossary={handleCreateGlossary}
              onRenameGlossary={handleRenameGlossary}
              onDeleteGlossary={handleDeleteGlossary}
              onSaveGlossary={handleSaveGlossary}
              onMoveTerm={handleMoveTerm}
            />
          ) : viewMode === 'editor' && selectedFile && resource ? (
            <DarkMessiahEditor
              file={selectedFile}
              resourceDir={resource.resourceDir}
              apiKey={apiKey}
              apiKeys={ai.apiKeys}
              prompt={prompt}
              selectedModel={model}
              fallbackModels={models}
              glossary={flatGlossary}
              onOpenGlossary={() => switchView('glossary')}
              onDirtyChange={setDirty}
              onSaved={(s) => setStats((prev) => ({ ...prev, [selectedFile.id]: s }))}
            />
          ) : (
            <PatchManager
              hasWorkspace={!!resource}
              progress={progress}
              game={game}
              onOpenSettings={() => setSettingsOpen(true)}
              collectPatch={() => collectPatchFiles(resource.resourceDir, files)}
            />
          )}
        </main>
      </div>
    </div>
  );
}
