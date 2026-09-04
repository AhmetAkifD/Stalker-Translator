import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import FileBrowser from '../components/FileBrowser'
import Editor from '../components/Editor'
import XmlViewer from '../components/XmlViewer'
import GlossaryEditor from '../components/GlossaryEditor'
import ModelSelector from '../components/ModelSelector'
import SearchBar from '../components/SearchBar'
import { Settings, Key, ArrowLeft, BookOpen } from 'lucide-react'
import { hasStringTable } from '../utils/xmlUtils'
import { readXmlFile, backupAndFixBrokenFiles } from '../utils/fileSystem'

export default function Translator({ initialMode = 'editor' }) {
  const [directoryHandle, setDirectoryHandle] = useState(null)
  const [originalFiles, setOriginalFiles] = useState([])
  const [translatedFiles, setTranslatedFiles] = useState([])
  const [backupFiles, setBackupFiles] = useState([])
  const [invalidFiles, setInvalidFiles] = useState(new Set())
  const [isFixing, setIsFixing] = useState(false)
  const [selectedFile, setSelectedFile] = useState(null)
  const [targetItemId, setTargetItemId] = useState(null)
  const [viewMode, setViewMode] = useState(initialMode) // 'editor' | 'viewer' | 'glossary'
  const [apiKey, setApiKey] = useState(localStorage.getItem('geminiApiKey') || '')
  const [prompt, setPrompt] = useState(localStorage.getItem('geminiPrompt') || 'Translate this game dialogue to Turkish. Just return the translation without any markdown or quotes.')
  const [model, setModel] = useState(localStorage.getItem('geminiModel') || 'gemini-3.7-flash')
  
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

  // Flatten all glossaries for the API
  const flatGlossary = Object.values(glossariesMap).flat();

  const revalidateFiles = async (orig = originalFiles, trans = translatedFiles, bck = backupFiles) => {
    const allFilesToCheck = [...orig, ...trans, ...bck];
    const checkResults = await Promise.all(
      allFilesToCheck.map(async (f) => {
        try {
          const content = await readXmlFile(f);
          return { name: f.name, valid: hasStringTable(content) };
        } catch {
          return { name: f.name, valid: false };
        }
      })
    );
    const invalidSet = new Set(checkResults.filter(r => !r.valid).map(r => r.name));
    setInvalidFiles(invalidSet);
    return invalidSet;
  };

  const handleFixBrokenFiles = async (targetName = null) => {
    if (!directoryHandle) return;

    const targets = targetName ? [targetName] : Array.from(invalidFiles);
    if (targets.length === 0) {
      alert("Onarılacak bozuk dosya bulunamadı.");
      return;
    }

    setIsFixing(true);
    try {
      const result = await backupAndFixBrokenFiles(
        directoryHandle,
        targets,
        originalFiles,
        translatedFiles,
        backupFiles
      );

      // Re-validate files to update warning icons
      await revalidateFiles();

      // If current selected file was repaired, reload it
      if (selectedFile && targets.includes(selectedFile.name)) {
        const currentName = selectedFile.name;
        setSelectedFile(null);
        setTimeout(() => {
          const reselected = originalFiles.find(f => f.name === currentName) ||
                             translatedFiles.find(f => f.name === currentName) ||
                             backupFiles.find(f => f.name === currentName);
          if (reselected) setSelectedFile(reselected);
        }, 50);
      }

      alert(`${result.count} adet bozuk dosya onarıldı (<string_table> etiketi eklendi). Orijinal halleri 'broken_files' klasörüne güvenle yedeklendi.`);
    } catch (err) {
      console.error("Error fixing broken files:", err);
      alert("Dosyalar onarılırken bir hata oluştu: " + err.message);
    } finally {
      setIsFixing(false);
    }
  };

  const handleApiKeyChange = (e) => {
    const val = e.target.value
    setApiKey(val)
    localStorage.setItem('geminiApiKey', val)
  }

  const handlePromptChange = (e) => {
    const val = e.target.value
    setPrompt(val)
    localStorage.setItem('geminiPrompt', val)
  }

  const handleModelChange = (e) => {
    const val = e.target.value
    setModel(val)
    localStorage.setItem('geminiModel', val)
  }

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
      {/* Header / Settings Bar */}
      <header className="bg-white border-b border-gray-200 shadow-sm p-4 flex gap-4 items-center flex-wrap shrink-0">
        <button 
          onClick={() => navigate('/')} 
          className="mr-2 p-2 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition-colors"
          title="Back to Home"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex items-center gap-2 font-bold text-lg text-gray-800 mr-2">
          <Settings className="text-blue-600" />
          <span>Game XML Translator</span>
        </div>

        <button
          type="button"
          onClick={() => setViewMode(viewMode === 'glossary' ? 'editor' : 'glossary')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
            viewMode === 'glossary' 
              ? 'bg-blue-100 text-blue-800 shadow-inner' 
              : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
          }`}
        >
          <BookOpen size={16} className={viewMode === 'glossary' ? 'text-blue-600' : 'text-gray-500'} />
          <span>Özel Sözlük ({flatGlossary.length})</span>
        </button>
        
        <div className="flex-1 flex gap-3 items-center">
          <ModelSelector 
            selectedModel={model} 
            onSelectModel={(newModel) => {
              setModel(newModel)
              localStorage.setItem('geminiModel', newModel)
            }} 
          />

          <div className="flex-1">
            <label className="block text-xs font-semibold text-gray-500 mb-1">System Prompt</label>
            <input 
              type="text" 
              value={prompt}
              onChange={handlePromptChange}
              className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="E.g. Translate to Turkish..."
            />
          </div>

          <div className="w-56">
            <label className="block text-xs font-semibold text-gray-500 mb-1 flex items-center gap-1">
              <Key size={12}/> Gemini API Key
            </label>
            <input 
              type="password" 
              value={apiKey}
              onChange={handleApiKeyChange}
              className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="AIzaSy..."
            />
          </div>

          <div className="flex flex-col justify-end">
            <label className="block text-xs font-semibold text-gray-500 mb-1">Search in XMLs</label>
            <SearchBar 
              directoryHandle={directoryHandle} 
              files={originalFiles} 
              onSelectResult={(fileHandle, id) => {
                setSelectedFile(fileHandle);
                setTargetItemId(id);
              }}
            />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex overflow-hidden">
        <FileBrowser 
          originalFiles={originalFiles} 
          translatedFiles={translatedFiles}
          backupFiles={backupFiles}
          sidebarWidth={sidebarWidth}
          invalidFiles={invalidFiles}
          viewMode={viewMode}
          onViewModeChange={(mode) => setViewMode(mode)}
          onFixBrokenFiles={handleFixBrokenFiles}
          isFixing={isFixing}
          hasDirectory={!!directoryHandle}
          glossaryCount={flatGlossary.length}
          onSelectFile={(f) => {
            setSelectedFile(f);
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

        {viewMode === 'editor' ? (
          <Editor 
            fileHandle={selectedFile} 
            directoryHandle={directoryHandle}
            apiKey={apiKey}
            prompt={prompt}
            selectedModel={model}
            targetItemId={targetItemId}
            onClearTargetItem={() => setTargetItemId(null)}
            onSwitchToViewer={() => setViewMode('viewer')}
            onFixCurrentFile={() => handleFixBrokenFiles(selectedFile?.name)}
            isFixing={isFixing}
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
      </main>
    </div>
  )
}
