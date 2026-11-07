import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, BookOpen, Key, FolderOpen, Download, RotateCcw } from 'lucide-react';
import DarkMessiahFileBrowser from '../../components/darkmessiah/DarkMessiahFileBrowser';
import DarkMessiahEditor from '../../components/darkmessiah/DarkMessiahEditor';
import PatchManager from '../../components/darkmessiah/PatchManager';
import GlossaryEditor from '../../components/GlossaryEditor';
import ModelSelector from '../../components/ModelSelector';
import { resolveResourceDir, loadManifest, computeStats, collectPatchFiles } from '../../utils/darkmessiah/workspace';
import { saveHandle, loadHandle } from '../../utils/darkmessiah/handleStore';
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
  const [savedHandle, setSavedHandle] = useState(null);
  const [resource, setResource] = useState(null); // { resourceDir, label }
  const [files, setFiles] = useState([]);
  const [stats, setStats] = useState({});
  const [selectedFile, setSelectedFile] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [viewMode, setViewMode] = useState('patch'); // patch | editor | glossary

  // Gemini (API key / models shared with the other games, prompt is per game)
  const [apiKey, setApiKey] = useState(localStorage.getItem('geminiApiKey') || '');
  const [prompt, setPrompt] = useState(localStorage.getItem('dmGeminiPrompt') || DEFAULT_PROMPT);
  const defaultModels = ['gemini-3.7-flash', 'gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.6-pro'];
  const savedModels = localStorage.getItem('geminiCustomModels');
  const [models, setModels] = useState(savedModels ? JSON.parse(savedModels) : defaultModels);
  const [model, setModel] = useState(localStorage.getItem('geminiModel') || models[0] || 'gemini-3.7-flash');

  const [glossariesMap, setGlossariesMap] = useState({});
  const [activeGlossaryName, setActiveGlossaryName] = useState('Ana_Sozluk');

  const openWorkspace = useCallback(async (handle) => {
    const res = await resolveResourceDir(handle);
    if (!res) {
      alert('Bu klasörde "mm/resource/english" ve "mm_itemnames_english.txt" bulunamadı. Lütfen çıkarılmış VPK klasörünü (ör. "vpk unpacked") seçin.');
      return;
    }
    setRootHandle(handle);
    setResource(res);
    setSelectedFile(null);
    setViewMode('patch');
    await saveHandle(HANDLE_KEY, handle);

    const manifest = await loadManifest(res.resourceDir);
    setFiles(manifest);
    setStats({});
    const all = {};
    for (const f of manifest) all[f.id] = await computeStats(res.resourceDir, f);
    setStats(all);

    const glossaries = await initGlossarySystem(handle, DM_GLOSSARY_SEED);
    setGlossariesMap(glossaries);
    setActiveGlossaryName(glossaries['Ana_Sozluk'] ? 'Ana_Sozluk' : Object.keys(glossaries)[0] || '');
  }, []);

  useEffect(() => {
    (async () => {
      const h = await loadHandle(HANDLE_KEY);
      if (!h) return;
      if ((await h.queryPermission?.({ mode: 'readwrite' })) === 'granted') await openWorkspace(h);
      else setSavedHandle(h);
    })();
  }, [openWorkspace]);

  const confirmDiscard = () => !dirty || confirm('Kaydedilmemiş değişiklikler kaybolacak. Devam edilsin mi?');

  const handleSelectDirectory = async () => {
    if (!confirmDiscard()) return;
    try {
      const handle = await window.showDirectoryPicker({ id: 'darkmessiah', mode: 'readwrite' });
      setDirty(false);
      await openWorkspace(handle);
    } catch (err) {
      if (err.name !== 'AbortError') alert('Klasör açılamadı: ' + err.message);
    }
  };

  const handleReopenSaved = async () => {
    try {
      if ((await savedHandle.requestPermission({ mode: 'readwrite' })) === 'granted') {
        setSavedHandle(null);
        await openWorkspace(savedHandle);
      }
    } catch (err) {
      alert('Klasör açılamadı: ' + err.message);
    }
  };

  const switchView = (mode) => {
    if (mode !== 'editor' && viewMode === 'editor' && !confirmDiscard()) return;
    if (mode !== 'editor') setDirty(false);
    setViewMode(mode);
  };

  const handleSelectFile = (f) => {
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

  const flatGlossary = useMemo(() => {
    const out = [];
    const seen = new Set();
    for (const term of Object.values(glossariesMap).flat()) {
      const key = (term?.original || '').trim().toLowerCase();
      if (key && !seen.has(key)) { seen.add(key); out.push(term); }
    }
    return out;
  }, [glossariesMap]);

  const headerBtn = (mode, Icon, label) => (
    <button
      onClick={() => switchView(viewMode === mode ? (selectedFile ? 'editor' : 'patch') : mode)}
      disabled={mode === 'glossary' && !rootHandle}
      className={`px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 text-sm font-medium transition-colors disabled:opacity-40 ${viewMode === mode ? 'bg-red-700 text-white' : 'text-gray-300 hover:text-white hover:bg-gray-800'}`}
    >
      <Icon size={17} />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );

  return (
    <div className="flex flex-col h-screen bg-gray-100 font-sans overflow-hidden">
      <header className="h-12 bg-gray-900 border-b border-gray-800 flex items-center px-4 justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => confirmDiscard() && navigate('/')} className="text-gray-400 hover:text-white" title="Ana Menüye Dön">
            <ArrowLeft size={20} />
          </button>
          <div className="h-4 w-px bg-gray-700" />
          <h1 className="text-white font-bold text-sm tracking-wide">DARK MESSIAH OF MIGHT &amp; MAGIC · TÜRKÇE YAMA</h1>
        </div>
        <div className="flex items-center gap-1">
          {headerBtn('patch', Download, 'Yama')}
          {headerBtn('glossary', BookOpen, `Sözlük (${flatGlossary.length})`)}
        </div>
      </header>

      {/* AI settings bar (same fields as the S.T.A.L.K.E.R. translator): model, system prompt, API key */}
      <div className="bg-white border-b border-gray-200 shadow-sm px-4 py-2.5 flex gap-3 items-end flex-wrap shrink-0">
        <ModelSelector
          selectedModel={model}
          onSelectModel={(m) => { setModel(m); localStorage.setItem('geminiModel', m); }}
          models={models}
          setModels={(m) => { setModels(m); localStorage.setItem('geminiCustomModels', JSON.stringify(m)); }}
        />
        <div className="flex-1 min-w-[260px]">
          <label className="flex items-center gap-2 text-xs font-semibold text-gray-500 mb-1">
            System Prompt
            <span className="font-normal text-gray-400">(tuş kodu / \n koruma kuralları otomatik eklenir)</span>
            {prompt !== DEFAULT_PROMPT && (
              <button
                type="button"
                onClick={() => { setPrompt(DEFAULT_PROMPT); localStorage.setItem('dmGeminiPrompt', DEFAULT_PROMPT); }}
                className="ml-auto flex items-center gap-1 text-red-700 hover:underline font-normal"
                title="Dark Messiah için hazırlanan varsayılan komuta dön"
              >
                <RotateCcw size={11} /> Varsayılan
              </button>
            )}
          </label>
          <input
            type="text"
            value={prompt}
            onChange={(e) => { setPrompt(e.target.value); localStorage.setItem('dmGeminiPrompt', e.target.value); }}
            title={prompt}
            className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:ring-2 focus:ring-red-500 outline-none"
            placeholder="Örn. Translate to Turkish..."
          />
        </div>
        <div className="w-56">
          <label className="block text-xs font-semibold text-gray-500 mb-1 flex items-center gap-1"><Key size={12} /> Gemini API Key</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => { setApiKey(e.target.value); localStorage.setItem('geminiApiKey', e.target.value); }}
            className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:ring-2 focus:ring-red-500 outline-none"
            placeholder="AIzaSy..."
          />
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        <DarkMessiahFileBrowser
          files={files}
          stats={stats}
          selectedId={viewMode === 'editor' ? selectedFile?.id : null}
          onSelectFile={handleSelectFile}
          onSelectDirectory={handleSelectDirectory}
          onOpenPatch={() => switchView('patch')}
          patchActive={viewMode === 'patch'}
          workspaceLabel={resource?.label}
        />

        <main className="flex-1 flex flex-col min-w-0 bg-white">
          {savedHandle && !rootHandle && (
            <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-sm text-amber-900 flex items-center gap-3">
              <FolderOpen size={16} />
              Son çalışma klasörü: <b>{savedHandle.name}</b>
              <button onClick={handleReopenSaved} className="ml-auto px-3 py-1 rounded-md bg-amber-600 hover:bg-amber-700 text-white font-semibold">Aç</button>
            </div>
          )}

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
              collectPatch={() => collectPatchFiles(resource.resourceDir, files)}
            />
          )}
        </main>
      </div>
    </div>
  );
}
