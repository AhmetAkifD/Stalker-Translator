import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import WitcherFileBrowser from '../../components/witcher/WitcherFileBrowser';
import WitcherEditor from '../../components/witcher/WitcherEditor';
import GlossaryEditor from '../../components/GlossaryEditor';
import ModelSelector from '../../components/ModelSelector';
import SearchBar from '../../components/SearchBar';
import { ArrowLeft, Construction, Settings, BookOpen } from 'lucide-react';
import { tlgToXml, xmlToTlg } from '../../utils/witcher/tlgConverter';

export default function WitcherTranslator() {
  const [directoryHandle, setDirectoryHandle] = useState(null);
  const [tlgFiles, setTlgFiles] = useState([]);
  const [xmlFiles, setXmlFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileCategory, setFileCategory] = useState(null);

  // Gemini state
  const [apiKey, setApiKey] = useState(localStorage.getItem('geminiApiKey') || '');
  const [prompt, setPrompt] = useState(localStorage.getItem('geminiPrompt') || 'Translate this game dialogue to Turkish. Just return the translation without any markdown or quotes.');
  
  const defaultModels = ['gemini-3.7-flash', 'gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.6-pro'];
  const savedModels = localStorage.getItem('geminiCustomModels');
  const [models, setModels] = useState(savedModels ? JSON.parse(savedModels) : defaultModels);
  const [model, setModel] = useState(localStorage.getItem('geminiModel') || models[0] || 'gemini-3.7-flash');

  // Glossary and UI State
  const [viewMode, setViewMode] = useState('editor'); // editor | glossary
  const [glossariesMap, setGlossariesMap] = useState({});
  const [activeGlossaryName, setActiveGlossaryName] = useState('Ana_Sozluk');
  const [targetItemId, setTargetItemId] = useState(null);

  const navigate = useNavigate();

  const handleSelectDirectory = async () => {
    try {
      const dirHandle = await window.showDirectoryPicker();
      setDirectoryHandle(dirHandle);
      
      await loadFiles(dirHandle);

      // Initialize Glossary System
      const { initGlossarySystem } = await import('../../utils/glossaryManager.js');
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

    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error(error);
      }
    }
  };

  // Recursively scan all files and subdirectories
  const scanDirectoryRecursively = async (dirHandle, pathSegments = []) => {
    const files = [];
    for await (const entry of dirHandle.values()) {
      if (entry.kind === 'file') {
        const isTlgOrDlg = /\.(tlg|dlg)$/i.test(entry.name);
        const isXml = /\.xml$/i.test(entry.name);
        if (isTlgOrDlg || isXml) {
          files.push({
            fileHandle: entry,
            name: entry.name,
            pathSegments: [...pathSegments, entry.name],
            relativePath: [...pathSegments, entry.name].join('/'),
            dirPath: pathSegments.join('/') || 'Kök Dizin',
            type: isXml ? 'xml' : 'tlg'
          });
        }
      } else if (entry.kind === 'directory') {
        if (!entry.name.startsWith('.')) {
          const subFiles = await scanDirectoryRecursively(entry, [...pathSegments, entry.name]);
          files.push(...subFiles);
        }
      }
    }
    return files;
  };

  const loadFiles = async (dirHandle) => {
    const allFiles = await scanDirectoryRecursively(dirHandle);
    
    const tlg = allFiles.filter(f => f.type === 'tlg').sort((a, b) => a.relativePath.localeCompare(b.relativePath));
    const xml = allFiles.filter(f => f.type === 'xml').sort((a, b) => a.relativePath.localeCompare(b.relativePath));
    
    setTlgFiles(tlg);
    setXmlFiles(xml);
    setSelectedFile(null);
  };

  // Helper: resolves target directory at the same level as "Original files" (or at root)
  // and creates any subdirectories inside it to mirror the original structure
  const resolveTargetDirectory = async (rootHandle, pathSegments, targetFolderName) => {
    const origIndex = pathSegments.findIndex(s => /original/i.test(s));
    let currentHandle = rootHandle;
    let subSegments = [];

    if (origIndex !== -1) {
      // Navigate to the parent directory of 'Original files'
      for (let i = 0; i < origIndex; i++) {
        currentHandle = await currentHandle.getDirectoryHandle(pathSegments[i], { create: true });
      }
      // Target directory (xml_workspace / tlg_output) is created at the SAME level as 'Original files'
      currentHandle = await currentHandle.getDirectoryHandle(targetFolderName, { create: true });
      // Inner subdirectories that were inside 'Original files'
      subSegments = pathSegments.slice(origIndex + 1, -1);
    } else {
      // If not under an 'Original files' directory, check if it's in xml_workspace / tlg_output
      const workspaceIndex = pathSegments.findIndex(s => /^(xml_workspace|tlg_output)$/i.test(s));
      if (workspaceIndex !== -1) {
        for (let i = 0; i < workspaceIndex; i++) {
          currentHandle = await currentHandle.getDirectoryHandle(pathSegments[i], { create: true });
        }
        currentHandle = await currentHandle.getDirectoryHandle(targetFolderName, { create: true });
        subSegments = pathSegments.slice(workspaceIndex + 1, -1);
      } else {
        // Created at root level
        currentHandle = await currentHandle.getDirectoryHandle(targetFolderName, { create: true });
        subSegments = pathSegments.slice(0, -1);
      }
    }

    // Create matching nested subfolders inside the target directory
    for (const seg of subSegments) {
      currentHandle = await currentHandle.getDirectoryHandle(seg, { create: true });
    }

    return currentHandle;
  };

  const handleConvertToXml = async () => {
    if (!directoryHandle || tlgFiles.length === 0) return;
    
    if (!confirm("Tüm .TLG / .DLG dosyaları XML formatına dönüştürülecek. Dosyalar 'Original files' ile aynı dizinde 'xml_workspace' klasöründe ve aynı alt dizin yapısıyla oluşturulacak. Onaylıyor musunuz?")) return;

    try {
      let count = 0;
      for (const tlgItem of tlgFiles) {
        const file = await tlgItem.fileHandle.getFile();
        const buffer = await file.arrayBuffer();
        
        const xmlContent = tlgToXml(buffer);
        
        // Resolve target folder beside 'Original files' preserving nested paths
        const targetDirHandle = await resolveTargetDirectory(directoryHandle, tlgItem.pathSegments, 'xml_workspace');
        
        const xmlFileName = tlgItem.name.replace(/\.(tlg|dlg)$/i, '.xml');
        const xmlFileHandle = await targetDirHandle.getFileHandle(xmlFileName, { create: true });
        
        const writable = await xmlFileHandle.createWritable();
        await writable.write(xmlContent);
        await writable.close();
        
        count++;
      }
      
      alert(`${count} adet dosya başarıyla XML'e dönüştürüldü ve 'xml_workspace' klasörüne alt dizin yapısı korunarak kaydedildi!`);
      // Refresh list to show newly created XML files
      await loadFiles(directoryHandle);
      
    } catch (err) {
      console.error("Dönüştürme hatası:", err);
      alert("Hata oluştu: " + err.message);
    }
  };

  const handleConvertToTlg = async () => {
    if (!directoryHandle || xmlFiles.length === 0) return;
    
    if (!confirm("Tüm .XML dosyaları tekrar .TLG / .DLG formatına dönüştürülecek. Dosyalar 'tlg_output' klasöründe aynı alt dizin yapısıyla oluşturulacak. Onaylıyor musunuz?")) return;

    try {
      let count = 0;
      for (const xmlItem of xmlFiles) {
        const file = await xmlItem.fileHandle.getFile();
        const xmlText = await file.text();
        
        // Match original binary file:
        // 1. By relative subpath similarity
        const baseNameNoExt = xmlItem.name.replace(/\.xml$/i, '').toLowerCase();
        let origItem = tlgFiles.find(f => {
          const fBase = f.name.replace(/\.(tlg|dlg)$/i, '').toLowerCase();
          return fBase === baseNameNoExt && xmlItem.relativePath.includes(f.name.replace(/\.(tlg|dlg)$/i, ''));
        });
        
        // 2. Fallback: match by name
        if (!origItem) {
          origItem = tlgFiles.find(f => f.name.replace(/\.(tlg|dlg)$/i, '').toLowerCase() === baseNameNoExt);
        }
        
        if (!origItem) {
          console.warn(`Orijinal dosya bulunamadı: ${xmlItem.name}, bu XML atlanıyor.`);
          continue;
        }
        
        const origFile = await origItem.fileHandle.getFile();
        const origBuffer = await origFile.arrayBuffer();
        
        const tlgContent = xmlToTlg(origBuffer, xmlText);
        
        // Target folder beside 'Original files' or under root 'tlg_output'
        const targetDirHandle = await resolveTargetDirectory(directoryHandle, xmlItem.pathSegments, 'tlg_output');
        
        // Keep original extension (.dlg or .tlg)
        const targetFileName = origItem.name;
        const tlgFileHandle = await targetDirHandle.getFileHandle(targetFileName, { create: true });
        
        const writable = await tlgFileHandle.createWritable();
        await writable.write(tlgContent);
        await writable.close();
        
        count++;
      }
      
      alert(`${count} adet .XML dosyası başarıyla TLG/DLG formatına dönüştürüldü ve 'tlg_output' klasörüne kaydedildi!`);
      // Refresh list to show newly created TLG files
      await loadFiles(directoryHandle);
      
    } catch (err) {
      console.error("Dönüştürme hatası:", err);
      alert("Hata oluştu: " + err.message);
    }
  };

  return (
    <div className="flex h-screen bg-gray-100 font-sans overflow-hidden">
      {/* Header bar */}
      <div className="absolute top-0 left-0 right-0 h-12 bg-gray-900 border-b border-gray-800 flex items-center px-4 z-10 justify-between shadow-md">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => navigate('/')}
            className="text-gray-400 hover:text-white transition-colors"
            title="Ana Menüye Dön"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="h-4 w-px bg-gray-700"></div>
          <h1 className="text-white font-bold text-sm tracking-wide">
            THE WITCHER 1 TRANSLATOR
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode(viewMode === 'settings' ? 'editor' : 'settings')}
            className={`p-1.5 rounded-lg transition-colors flex items-center gap-1.5 text-sm font-medium ${
              viewMode === 'settings' 
                ? 'bg-blue-500 text-white' 
                : 'text-gray-300 hover:text-white hover:bg-gray-800'
            }`}
          >
            <Settings size={18} />
            <span className="hidden sm:inline">Ayarlar</span>
          </button>
        </div>
      </div>

      <div className="flex flex-1 pt-12 h-full">
        <WitcherFileBrowser 
          tlgFiles={tlgFiles}
          xmlFiles={xmlFiles}
          hasDirectory={!!directoryHandle}
          sidebarWidth={280}
          selectedFile={selectedFile}
          onSelectFile={(f, category) => {
            setSelectedFile(f);
            setFileCategory(category);
          }}
          onSelectDirectory={handleSelectDirectory}
          onConvertToXml={handleConvertToXml}
          onConvertToTlg={handleConvertToTlg}
        />
        
        <main className="flex-1 flex flex-col relative bg-white h-full overflow-hidden">
          {viewMode === 'glossary' ? (
            <GlossaryEditor 
              directoryHandle={directoryHandle} 
              onClose={() => setViewMode('editor')} 
              glossariesMap={glossariesMap}
              setGlossariesMap={setGlossariesMap}
              activeGlossaryName={activeGlossaryName}
              setActiveGlossaryName={setActiveGlossaryName}
            />
          ) : viewMode === 'settings' ? (
            <div className="flex-1 flex flex-col bg-gray-50 p-6 overflow-y-auto">
              <div className="max-w-2xl mx-auto w-full bg-white rounded-xl shadow-sm border border-gray-200 p-8">
                <div className="flex items-center gap-3 mb-6 pb-6 border-b border-gray-100">
                  <div className="bg-blue-100 p-2.5 rounded-lg">
                    <Settings className="text-blue-600" size={24} />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-gray-800">Ayarlar</h2>
                    <p className="text-sm text-gray-500 mt-1">API anahtarı ve model seçimi yapılandırması</p>
                  </div>
                </div>
                
                <ModelSelector 
                  apiKey={apiKey} 
                  setApiKey={(val) => { setApiKey(val); localStorage.setItem('geminiApiKey', val); }} 
                  prompt={prompt} 
                  setPrompt={(val) => { setPrompt(val); localStorage.setItem('geminiPrompt', val); }} 
                  model={model} 
                  setModel={(val) => { setModel(val); localStorage.setItem('geminiModel', val); }} 
                  models={models}
                  setModels={(val) => { setModels(val); localStorage.setItem('geminiCustomModels', JSON.stringify(val)); }}
                  defaultModels={defaultModels}
                />

                <div className="mt-8 pt-6 border-t border-gray-100 flex justify-end">
                  <button
                    onClick={() => setViewMode('editor')}
                    className="px-6 py-2.5 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition-colors"
                  >
                    Kaydet ve Dön
                  </button>
                </div>
              </div>
            </div>
          ) : selectedFile ? (
            <WitcherEditor 
              fileHandle={selectedFile.fileHandle}
              apiKey={apiKey} 
              prompt={prompt} 
              selectedModel={model}
              fallbackModels={models}
              glossary={glossariesMap[activeGlossaryName] || []}
              onOpenGlossary={() => setViewMode('glossary')}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center bg-white p-8">
              <div className="text-center max-w-md">
                <div className="w-16 h-16 bg-blue-50 border border-blue-100 text-blue-500 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-sm">
                  <ArrowLeft size={28} strokeWidth={2.5} />
                </div>
                <h2 className="text-2xl font-bold text-gray-800 mb-3 tracking-tight">Bir Dosya Seçin</h2>
                <p className="text-gray-500 leading-relaxed">
                  Lütfen sol taraftaki panelden bir <span className="font-semibold text-gray-700">.tlg</span> veya <span className="font-semibold text-gray-700">.xml</span> dosyası seçerek düzenlemeye başlayın.
                </p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
