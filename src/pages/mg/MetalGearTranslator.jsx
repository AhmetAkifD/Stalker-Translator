import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Download } from 'lucide-react';
import DarkMessiahFileBrowser from '../../components/darkmessiah/DarkMessiahFileBrowser';
import DarkMessiahEditor from '../../components/darkmessiah/DarkMessiahEditor';
import GamePathSection from '../../components/darkmessiah/GamePathSection';
import MgPatchManager from '../../components/mg/MgPatchManager';
import GlossaryEditor from '../../components/GlossaryEditor';
import AppHeader, { HeaderButton } from '../../components/shared/AppHeader';
import SettingsPage from '../../components/shared/SettingsPage';
import AiSettingsSection from '../../components/shared/AiSettingsSection';
import ReopenFolderBanner from '../../components/shared/ReopenFolderBanner';
import { useAiSettings } from '../../hooks/useAiSettings';
import { useRememberedFolder } from '../../hooks/useRememberedFolder';
import { useGamePath } from '../../utils/darkmessiah/useGamePath';
import * as mgApi from '../../utils/mg/gameApi';
import { MG_FORMAT_RULES, checkMgFormatting } from '../../utils/mg/mgRaw';
import { GROUPS, loadSources, buildFiles, computeAllStats, createEditorSource, collectPatch } from '../../utils/mg/workspace';
import { initGlossarySystem, saveGlossary, deleteGlossary } from '../../utils/glossaryManager';

const HANDLE_KEY = 'metalgear-workspace';
const GAME_PATH_OPTIONS = { storageKey: 'mgGamePath', api: mgApi };
const DEFAULT_PROMPT = 'You are translating METAL GEAR (1987) and METAL GEAR 2: SOLID SNAKE (1990), classic military stealth action games, from English to Turkish. Use natural, fluent Turkish with a military radio (codec) tone: short, clear sentences. Address Snake informally ("sen"). Keep character names, code names and place names (Solid Snake, Big Boss, Gray Fox, Campbell, Holly White, Master Miller, Dr. Madnar, Outer Heaven, Zanzibar Land, FOXHOUND, Metal Gear) as they are.';
const MG_GLOSSARY_SEED = [
  { id: 'mg_1', original: 'Outer Heaven', translation: 'Outer Heaven', pronunciation: "Auter Hevın (Outer Heaven'a, Outer Heaven'ın)" },
  { id: 'mg_2', original: 'Zanzibar Land', translation: 'Zanzibar Land', pronunciation: "Zanzibar Land (Zanzibar Land'e, Zanzibar Land'in)" },
  { id: 'mg_3', original: 'Ration', translation: 'Erzak', pronunciation: '' },
  { id: 'mg_4', original: 'Card', translation: 'Kart', pronunciation: '' },
  { id: 'mg_5', original: 'Transceiver', translation: 'Telsiz', pronunciation: '' },
];
const EMPTY_HINT = 'Çevirilerin kaydedileceği bir klasör seçin (ör. Belgeler\\MG Türkçe). İngilizce metinler oyunun kendisinden okunur.';

export default function MetalGearTranslator() {
  const navigate = useNavigate();
  const [rootHandle, setRootHandle] = useState(null);
  const [sources, setSources] = useState(null); // { mg1: rows, mg2: rows }
  const [sourceError, setSourceError] = useState(null);
  const [stats, setStats] = useState({});
  const [selectedFile, setSelectedFile] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [viewMode, setViewMode] = useState('patch'); // patch | editor | glossary
  const [settingsOpen, setSettingsOpen] = useState(false);

  const ai = useAiSettings({ promptKey: 'mgGeminiPrompt', defaultPrompt: DEFAULT_PROMPT });
  const game = useGamePath(GAME_PATH_OPTIONS);
  const gameRoot = game.validation?.ok ? game.validation.root : null;

  const [glossariesMap, setGlossariesMap] = useState({});
  const [activeGlossaryName, setActiveGlossaryName] = useState('Ana_Sozluk');

  const files = useMemo(() => (sources ? buildFiles(sources) : []), [sources]);

  // English text comes from the game folder (local service); reload it when the game location changes.
  useEffect(() => {
    if (!gameRoot) { setSources(null); return; }
    let cancelled = false;
    setSourceError(null);
    loadSources(gameRoot)
      .then((s) => { if (!cancelled) setSources(s); })
      .catch((err) => { if (!cancelled) { setSources(null); setSourceError(err.message); } });
    return () => { cancelled = true; };
  }, [gameRoot]);

  useEffect(() => {
    if (!rootHandle || !sources) { setStats({}); return; }
    let cancelled = false;
    computeAllStats(rootHandle, sources, files).then((s) => { if (!cancelled) setStats(s); });
    return () => { cancelled = true; };
  }, [rootHandle, sources, files]);

  const openWorkspace = useCallback(async (handle) => {
    setRootHandle(handle);
    setSelectedFile(null);
    setViewMode('patch');
    const glossaries = await initGlossarySystem(handle, MG_GLOSSARY_SEED);
    setGlossariesMap(glossaries);
    setActiveGlossaryName(glossaries['Ana_Sozluk'] ? 'Ana_Sozluk' : Object.keys(glossaries)[0] || '');
    return true;
  }, []);

  const folder = useRememberedFolder(HANDLE_KEY, openWorkspace);

  const confirmDiscard = () => !dirty || confirm('Kaydedilmemiş değişiklikler kaybolacak. Devam edilsin mi?');

  const handleSelectDirectory = async () => {
    if (!confirmDiscard()) return;
    try {
      const handle = await window.showDirectoryPicker({ id: 'metalgear', mode: 'readwrite' });
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

  const editorSource = useMemo(() => (selectedFile && rootHandle && sources
    ? createEditorSource(rootHandle, selectedFile, sources[selectedFile.game], { formatRules: MG_FORMAT_RULES, check: checkMgFormatting })
    : null), [selectedFile, rootHandle, sources]);

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

  const toggleView = (mode) => switchView(viewMode === mode && !settingsOpen ? (selectedFile ? 'editor' : 'patch') : mode);

  const workspaceLabel = rootHandle ? rootHandle.name : null;
  const emptyHint = !rootHandle ? EMPTY_HINT : !gameRoot ? 'Önce Ayarlar bölümünden oyun konumunu ayarlayın.' : sourceError ? 'Oyunun metinleri okunamadı.' : 'Metinler yükleniyor...';

  return (
    <div className="flex flex-col h-screen bg-gray-100 font-sans overflow-hidden">
      <AppHeader
        title="METAL GEAR & METAL GEAR 2 · TÜRKÇE YAMA"
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
          files={rootHandle ? files : []}
          groups={GROUPS}
          emptyHint={emptyHint}
          stats={stats}
          selectedId={viewMode === 'editor' ? selectedFile?.id : null}
          onSelectFile={handleSelectFile}
          onSelectDirectory={handleSelectDirectory}
          onOpenPatch={() => switchView('patch')}
          patchActive={viewMode === 'patch' && !settingsOpen}
          workspaceLabel={files.length ? workspaceLabel : null}
        />

        <main className="flex-1 flex flex-col min-w-0 bg-white relative">
          {settingsOpen && (
            <SettingsPage gameName="METAL GEAR & METAL GEAR 2: SOLID SNAKE" accent="red" onClose={() => setSettingsOpen(false)}>
              <AiSettingsSection
                ai={ai}
                accent="red"
                promptHint="Telsiz kodlarını (\r \w \s \1 ...), |0 tuş yer tutucularını, {81A0} bayt kodlarını ve satır sonlarını koruma kuralları bu komutun sonuna otomatik eklenir."
              />
              <GamePathSection
                game={game}
                description='"METAL GEAR.exe" dosyasının bulunduğu klasör (Steam: MG and MG2). Yama bu klasördeki metin dosyalarına kurulur.'
                placeholder="C:\Program Files (x86)\Steam\steamapps\common\MG and MG2"
              />
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
          ) : viewMode === 'editor' && selectedFile && editorSource ? (
            <DarkMessiahEditor
              file={selectedFile}
              source={editorSource}
              apiKey={ai.apiKey}
              apiKeys={ai.apiKeys}
              prompt={ai.prompt}
              selectedModel={ai.model}
              fallbackModels={ai.models}
              glossary={flatGlossary}
              onOpenGlossary={() => switchView('glossary')}
              onDirtyChange={setDirty}
              onSaved={(s) => setStats((prev) => ({ ...prev, [selectedFile.id]: s }))}
            />
          ) : (
            <MgPatchManager
              hasWorkspace={!!rootHandle && !!sources}
              progress={progress}
              game={game}
              sourceError={sourceError}
              onOpenSettings={() => setSettingsOpen(true)}
              collectPatch={() => collectPatch(rootHandle, sources)}
            />
          )}
        </main>
      </div>
    </div>
  );
}
