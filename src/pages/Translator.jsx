import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import FileBrowser from '../components/FileBrowser'
import Editor from '../components/Editor'
import XmlViewer from '../components/XmlViewer'
import GlossaryEditor from '../components/GlossaryEditor'
import SearchBar from '../components/SearchBar'
import AppHeader, { HeaderButton } from '../components/shared/AppHeader'
import SettingsPage from '../components/shared/SettingsPage'
import AiSettingsSection from '../components/shared/AiSettingsSection'
import { useAiSettings } from '../hooks/useAiSettings'
import { BookOpen } from 'lucide-react'

const STALKER_DEFAULT_PROMPT = 'Translate this game dialogue to Turkish. Just return the translation without any markdown or quotes.'

import { readXmlFile } from '../utils/fileSystem'

export default function Translator({ initialMode = 'editor' }) {
  const [directoryHandle, setDirectoryHandle] = useState(null)
  const [originalFiles, setOriginalFiles] = useState([])
  const [translatedFiles, setTranslatedFiles] = useState([])
  const [backupFiles, setBackupFiles] = useState([])
  const [invalidFiles, setInvalidFiles] = useState(new Set())
  const [isFixing, setIsFixing] = useState(false)
  const [selectedFile, setSelectedFile] = useState(null)
  const [fileCategory, setFileCategory] = useState("original")
  const [targetItemId, setTargetItemId] = useState(null)
  const [viewMode, setViewMode] = useState(initialMode) // 'editor' | 'viewer' | 'glossary'
  const [settingsOpen, setSettingsOpen] = useState(false)
  const ai = useAiSettings({ promptKey: 'geminiPrompt', defaultPrompt: STALKER_DEFAULT_PROMPT })
  const { apiKey, prompt, model, models } = ai

  useEffect(() => {
    if (initialMode) {
      setViewMode(initialMode);
    }
  }, [initialMode]);

  const [glossariesMap, setGlossariesMap] = useState({});
  const [activeGlossaryName, setActiveGlossaryName] = useState('Ana_Sozluk');

  const [sidebarWidth, setSidebarWidth] = useState(256)
  const [isResizing, setIsResizing] = useState(false)
  const navigate = useNavigate();

  const handleSelectDirectory = async () => {
    try {
      const dirHandle = await window.showDirectoryPicker()
      setDirectoryHandle(dirHandle)
      
      const origFiles = []
      const transFiles = []
      const bckFiles = []
      
      for await (const entry of dirHandle.values()) {
        if (entry.kind === 'file' && entry.name.endsWith('.xml')) {
          origFiles.push(entry)
        } else if (entry.kind === 'directory' && entry.name === 'translated_files') {
          for await (const subEntry of entry.values()) {
            if (subEntry.kind === 'file' && subEntry.name.endsWith('.xml')) {
              transFiles.push(subEntry)
            }
          }
        } else if (entry.kind === 'directory' && entry.name === 'backups') {
          for await (const subEntry of entry.values()) {
            if (subEntry.kind === 'file' && subEntry.name.endsWith('.xml')) {
              bckFiles.push(subEntry)
            }
          }
        }
      }
      
      const sortedOrig = origFiles.sort((a, b) => a.name.localeCompare(b.name));
      const sortedTrans = transFiles.sort((a, b) => a.name.localeCompare(b.name));
      const sortedBck = bckFiles.sort((a, b) => a.name.localeCompare(b.name));

      setOriginalFiles(sortedOrig);
      setTranslatedFiles(sortedTrans);
      setBackupFiles(sortedBck);
      setSelectedFile(null);

      // Initialize Glossary System
      const { initGlossarySystem } = await import('../utils/glossaryManager.js');
      
      // Pass local storage legacy glossary if available
      let localLegacy = [];
      try {
        const saved = localStorage.getItem('geminiGlossary');
        if (saved) localLegacy = JSON.parse(saved);
      } catch (e) {}

      const loadedGlossaries = await initGlossarySystem(dirHandle, localLegacy);
      setGlossariesMap(loadedGlossaries);
      if (loadedGlossaries['Ana_Sozluk']) {
        setActiveGlossaryName('Ana_Sozluk');
      } else {
        setActiveGlossaryName(Object.keys(loadedGlossaries)[0] || '');
      }

      // Detect files that do not have <string_table> tag
      await revalidateFiles(sortedOrig, sortedTrans, sortedBck);
    } catch (error) {
      console.error(error);
    }
  }

  const handleCreateGlossary = async (name) => {
    if (!directoryHandle) return;
    const { saveGlossary } = await import('../utils/glossaryManager.js');
    await saveGlossary(directoryHandle, name, []);
    setGlossariesMap(prev => ({ ...prev, [name]: [] }));
    setActiveGlossaryName(name);
  };

  const handleDeleteGlossary = async (name) => {
    if (!directoryHandle) return;
    const { deleteGlossary } = await import('../utils/glossaryManager.js');
    try {
      await deleteGlossary(directoryHandle, name);
      const newMap = { ...glossariesMap };
      delete newMap[name];
      setGlossariesMap(newMap);
      const remaining = Object.keys(newMap);
      setActiveGlossaryName(remaining[0] || '');
    } catch (err) {
      alert(err.message);
    }
  };

  const handleRenameGlossary = async (oldName, newName) => {
    if (!directoryHandle) return;
    const { saveGlossary } = await import('../utils/glossaryManager.js');
    const dataToCopy = glossariesMap[oldName] || [];
    await saveGlossary(directoryHandle, newName, dataToCopy);
    setGlossariesMap(prev => ({ ...prev, [newName]: dataToCopy }));
    setActiveGlossaryName(newName);
    alert(`"${oldName}" sözlüğü "${newName}" olarak kopyalandı! Eski dosya silinmedi.`);
  };

  const handleSaveGlossary = async (name, newTerms) => {
    if (!directoryHandle) return;
    const { saveGlossary } = await import('../utils/glossaryManager.js');
    await saveGlossary(directoryHandle, name, newTerms);
    setGlossariesMap(prev => ({ ...prev, [name]: newTerms }));
  };

  const handleMoveTerm = async (termId, fromName, toName) => {
    if (!directoryHandle) return;
    const term = glossariesMap[fromName]?.find(t => t.id === termId);
    if (!term) return;

    const newFrom = glossariesMap[fromName].filter(t => t.id !== termId);
    const newTo = [...(glossariesMap[toName] || []), term];

    const { saveGlossary } = await import('../utils/glossaryManager.js');
    await saveGlossary(directoryHandle, fromName, newFrom);
    await saveGlossary(directoryHandle, toName, newTo);

    setGlossariesMap(prev => ({
      ...prev,
      [fromName]: newFrom,
      [toName]: newTo
    }));
  };

  // Flatten and deduplicate all glossaries for the API
  const flatGlossary = [];
  const seenOriginals = new Set();
  const seenIds = new Set();
  
  for (const term of Object.values(glossariesMap).flat()) {
    if (!term) continue;
    const lowerOriginal = (term.original || "").trim().toLowerCase();
    
    // Deduplicate by original text or exact ID
    if (lowerOriginal && !seenOriginals.has(lowerOriginal) && !seenIds.has(term.id)) {
      seenOriginals.add(lowerOriginal);
      seenIds.add(term.id);
      flatGlossary.push(term);
    }
  }

  const revalidateFiles = async () => {
    return new Set();
  };

  const handleFixBrokenFiles = async () => {
    // Disabled
  };

  const startResizing = (e) => setIsResizing(true)
  const stopResizing = () => setIsResizing(false)
  const resize = (e) => {
    if (isResizing) {
      setSidebarWidth(Math.max(200, Math.min(e.clientX, 800)))
    }
  }

  return (
    <div 
      className="flex flex-col h-screen bg-gray-100 font-sans"
      onMouseMove={resize}
      onMouseUp={stopResizing}
      onMouseLeave={stopResizing}
    >
      <AppHeader
        title="S.T.A.L.K.E.R.: SHADOW OF CHERNOBYL · XML ÇEVİRİ"
        accent="blue"
        onBack={() => navigate('/')}
        settingsOpen={settingsOpen}
        onToggleSettings={() => setSettingsOpen((o) => !o)}
      >
        <div className="mr-2">
          <SearchBar
            directoryHandle={directoryHandle}
            files={originalFiles}
            onSelectResult={(fileHandle, id) => {
              setSettingsOpen(false);
              setViewMode('editor');
              setSelectedFile(fileHandle);
              setTargetItemId(id);
            }}
          />
        </div>
        <HeaderButton
          icon={BookOpen}
          label={`Sözlük (${flatGlossary.length})`}
          accent="blue"
          active={viewMode === 'glossary' && !settingsOpen}
          onClick={() => { setSettingsOpen(false); setViewMode(viewMode === 'glossary' ? 'editor' : 'glossary'); }}
        />
      </AppHeader>

      {/* Main Content */}
      <main className="flex-1 flex overflow-hidden">
        <FileBrowser 
          originalFiles={originalFiles} 
          translatedFiles={translatedFiles}
          backupFiles={backupFiles}
          sidebarWidth={sidebarWidth}
          invalidFiles={invalidFiles}
          viewMode={viewMode}
          onViewModeChange={(mode) => { setSettingsOpen(false); setViewMode(mode); }}
          onFixBrokenFiles={handleFixBrokenFiles}
          isFixing={isFixing}
          hasDirectory={!!directoryHandle}
          glossaryCount={flatGlossary.length}
          onSelectFile={(f, category = "original") => {
            setSettingsOpen(false);
            setSelectedFile(f);
            setFileCategory(category);
            setTargetItemId(null);
          }} 
          selectedFile={selectedFile}
          onSelectDirectory={handleSelectDirectory}
        />
        
        {/* Resizer Handle */}
        <div 
          className="w-1 cursor-col-resize hover:bg-blue-400 bg-gray-200 active:bg-blue-600 transition-colors shrink-0"
          onMouseDown={startResizing}
        />

        <div className="flex-1 flex min-w-0 relative">
        {settingsOpen && (
          <SettingsPage gameName="S.T.A.L.K.E.R.: Shadow of Chernobyl" accent="blue" onClose={() => setSettingsOpen(false)}>
            <AiSettingsSection ai={ai} accent="blue" />
          </SettingsPage>
        )}
        {viewMode === 'editor' ? (
          <Editor
            fileHandle={selectedFile} 
            fileCategory={fileCategory}
            directoryHandle={directoryHandle}
            apiKey={apiKey}
            prompt={prompt}
            selectedModel={model}
            targetItemId={targetItemId}
            onClearTargetItem={() => setTargetItemId(null)}
            onSwitchToViewer={() => setViewMode('viewer')}
            onFixCurrentFile={() => handleFixBrokenFiles(selectedFile?.name)}
            isFixing={isFixing}
            fallbackModels={models}
            glossary={flatGlossary}
            onOpenGlossary={() => setViewMode('glossary')}
          />
        ) : viewMode === 'viewer' ? (
          <XmlViewer 
            fileHandle={selectedFile} 
            onSwitchToEditor={() => setViewMode('editor')}
            onFixCurrentFile={() => handleFixBrokenFiles(selectedFile?.name)}
            isFixing={isFixing}
          />
        ) : (
          <GlossaryEditor 
            directoryHandle={directoryHandle}
            glossariesMap={glossariesMap}
            activeGlossaryName={activeGlossaryName}
            onSelectGlossary={setActiveGlossaryName}
            onCreateGlossary={handleCreateGlossary}
            onRenameGlossary={handleRenameGlossary}
            onDeleteGlossary={handleDeleteGlossary}
            onSaveGlossary={handleSaveGlossary}
            onMoveTerm={handleMoveTerm}
          />
        )}
        </div>
      </main>
    </div>
  )
}
