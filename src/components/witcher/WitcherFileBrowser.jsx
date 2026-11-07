import { useState, useMemo } from 'react';
import { FolderOpen, Folder, FileText, ChevronRight, ChevronDown, Repeat } from 'lucide-react';

export default function WitcherFileBrowser({ 
  tlgFiles = [], 
  xmlFiles = [], 
  onSelectFile, 
  selectedFile, 
  onSelectDirectory, 
  sidebarWidth,
  hasDirectory = false,
  onConvertToXml,
  onConvertToTlg
}) {
  const [tlgOpen, setTlgOpen] = useState(true);
  const [xmlOpen, setXmlOpen] = useState(true);
  const [openFolders, setOpenFolders] = useState({});

  const toggleFolder = (dirKey) => {
    setOpenFolders(prev => ({
      ...prev,
      [dirKey]: prev[dirKey] === undefined ? false : !prev[dirKey]
    }));
  };

  const isFolderOpen = (dirKey) => openFolders[dirKey] !== false; // Default open

  const tlgGroups = useMemo(() => {
    const groups = {};
    for (const file of tlgFiles) {
      const dir = file.dirPath || 'Kök Dizin';
      if (!groups[dir]) groups[dir] = [];
      groups[dir].push(file);
    }
    return groups;
  }, [tlgFiles]);

  const xmlGroups = useMemo(() => {
    const groups = {};
    for (const file of xmlFiles) {
      const dir = file.dirPath || 'Kök Dizin';
      if (!groups[dir]) groups[dir] = [];
      groups[dir].push(file);
    }
    return groups;
  }, [xmlFiles]);

  return (
    <div 
      className="bg-gray-50 border-r border-gray-200 flex flex-col h-full shrink-0 shadow-sm"
      style={{ width: sidebarWidth }}
    >
      <div className="p-4 border-b border-gray-200 bg-white">
        <button 
          onClick={onSelectDirectory}
          className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white px-4 py-2.5 rounded-md text-sm font-semibold transition-colors shadow-sm"
        >
          <FolderOpen size={18} />
          {hasDirectory ? "Klasör Değiştir" : "Klasör Seç"}
        </button>
      </div>
      
      <div className="flex-1 overflow-y-auto p-2 space-y-4">
        {!hasDirectory ? (
          <div className="text-center text-sm text-gray-500 mt-4 px-2">
            Lütfen The Witcher çeviri klasörünü seçin.
          </div>
        ) : (
          <>
            {/* TLG/DLG Files Section */}
            <div>
              <div className="flex items-center justify-between px-2 py-1 mb-1 bg-gray-100 rounded">
                <button 
                  onClick={() => setTlgOpen(!tlgOpen)}
                  className="flex items-center gap-1 text-left text-xs font-bold text-gray-700 uppercase tracking-wider hover:text-blue-600 transition-colors flex-1"
                >
                  {tlgOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  .TLG / .DLG Dosyaları ({tlgFiles.length})
                </button>
                <button
                  onClick={onConvertToXml}
                  className="text-xs bg-blue-100 hover:bg-blue-200 text-blue-700 px-2 py-0.5 rounded font-semibold flex items-center gap-1 transition-colors"
                  title="Tüm TLG/DLG dosyalarını 'xml_workspace' klasörüne alt dizin yapısıyla XML formatında çıkar"
                >
                  <Repeat size={12} /> XML'e Çevir
                </button>
              </div>
              
              {tlgOpen && (
                <div className="space-y-2 mt-1">
                  {Object.entries(tlgGroups).map(([dirName, files]) => {
                    const isOpen = isFolderOpen(`tlg_${dirName}`);
                    return (
                      <div key={dirName} className="rounded border border-gray-200/80 bg-white/70 overflow-hidden">
                        {/* Folder Title */}
                        <button
                          onClick={() => toggleFolder(`tlg_${dirName}`)}
                          className="w-full flex items-center justify-between px-2 py-1 bg-gray-100/70 hover:bg-gray-200/70 text-xs font-semibold text-gray-700 transition-colors text-left"
                          title={dirName}
                        >
                          <div className="flex items-center gap-1.5 truncate">
                            {isOpen ? <ChevronDown size={12} className="text-gray-500 shrink-0" /> : <ChevronRight size={12} className="text-gray-500 shrink-0" />}
                            <Folder size={13} className="text-amber-500 shrink-0" />
                            <span className="truncate">{dirName}</span>
                          </div>
                          <span className="text-[10px] bg-gray-200 text-gray-600 px-1.5 py-0.2 rounded shrink-0 ml-1">
                            {files.length}
                          </span>
                        </button>

                        {/* Files under folder */}
                        {isOpen && (
                          <ul className="p-1 space-y-0.5">
                            {files.map((file, idx) => (
                              <li key={idx}>
                                <button
                                  onClick={() => onSelectFile(file, "tlg")}
                                  className={"w-full flex items-center justify-between px-2.5 py-1 rounded text-xs text-left transition-colors " + (
                                    selectedFile?.relativePath === file.relativePath 
                                      ? 'bg-blue-100 text-blue-700 font-medium' 
                                      : 'hover:bg-gray-100 text-gray-700'
                                  )}
                                  title={file.relativePath}
                                >
                                  <div className="flex items-center gap-1.5 truncate">
                                    <FileText size={13} className={selectedFile?.relativePath === file.relativePath ? 'text-blue-600 shrink-0' : 'text-gray-400 shrink-0'} />
                                    <span className="truncate">{file.name}</span>
                                  </div>
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                  {tlgFiles.length === 0 && (
                    <div className="px-3 py-1 text-xs text-gray-400">Bulunamadı</div>
                  )}
                </div>
              )}
            </div>

            {/* XML Files Section */}
            <div>
              <div className="flex items-center justify-between px-2 py-1 mb-1 bg-green-50 rounded">
                <button 
                  onClick={() => setXmlOpen(!xmlOpen)}
                  className="flex items-center gap-1 text-left text-xs font-bold text-green-800 uppercase tracking-wider hover:text-green-900 transition-colors flex-1"
                >
                  {xmlOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  .XML Dosyaları ({xmlFiles.length})
                </button>
                <button
                  onClick={onConvertToTlg}
                  className="text-xs bg-green-100 hover:bg-green-200 text-green-800 px-2 py-0.5 rounded font-semibold flex items-center gap-1 transition-colors"
                  title="Tüm çevrilmiş XML dosyalarını 'tlg_output' klasörüne alt dizin yapısıyla TLG/DLG formatında geri dönüştür"
                >
                  <Repeat size={12} /> TLG'ye Çevir
                </button>
              </div>
              
              {xmlOpen && (
                <div className="space-y-2 mt-1">
                  {Object.entries(xmlGroups).map(([dirName, files]) => {
                    const isOpen = isFolderOpen(`xml_${dirName}`);
                    return (
                      <div key={dirName} className="rounded border border-green-200/80 bg-white/70 overflow-hidden">
                        {/* Folder Title */}
                        <button
                          onClick={() => toggleFolder(`xml_${dirName}`)}
                          className="w-full flex items-center justify-between px-2 py-1 bg-green-100/50 hover:bg-green-200/50 text-xs font-semibold text-green-900 transition-colors text-left"
                          title={dirName}
                        >
                          <div className="flex items-center gap-1.5 truncate">
                            {isOpen ? <ChevronDown size={12} className="text-gray-500 shrink-0" /> : <ChevronRight size={12} className="text-gray-500 shrink-0" />}
                            <Folder size={13} className="text-green-600 shrink-0" />
                            <span className="truncate">{dirName}</span>
                          </div>
                          <span className="text-[10px] bg-green-200 text-green-800 px-1.5 py-0.2 rounded shrink-0 ml-1">
                            {files.length}
                          </span>
                        </button>

                        {/* Files under folder */}
                        {isOpen && (
                          <ul className="p-1 space-y-0.5">
                            {files.map((file, idx) => (
                              <li key={idx}>
                                <button
                                  onClick={() => onSelectFile(file, "xml")}
                                  className={"w-full flex items-center justify-between px-2.5 py-1 rounded text-xs text-left transition-colors " + (
                                    selectedFile?.relativePath === file.relativePath 
                                      ? 'bg-green-100 text-green-800 font-medium' 
                                      : 'hover:bg-gray-100 text-gray-700'
                                  )}
                                  title={file.relativePath}
                                >
                                  <div className="flex items-center gap-1.5 truncate">
                                    <FileText size={13} className={selectedFile?.relativePath === file.relativePath ? 'text-green-600 shrink-0' : 'text-gray-400 shrink-0'} />
                                    <span className="truncate">{file.name}</span>
                                  </div>
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                  {xmlFiles.length === 0 && (
                    <div className="px-3 py-1 text-xs text-gray-400">Bulunamadı</div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
