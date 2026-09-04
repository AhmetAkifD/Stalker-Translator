import { useState } from 'react';
import { FolderOpen, FileText, ChevronRight, ChevronDown, CheckCircle, DatabaseBackup, AlertTriangle, Edit3, Eye, Wrench, Loader2, BookOpen } from 'lucide-react';

export default function FileBrowser({ 
  originalFiles, 
  translatedFiles, 
  backupFiles = [], 
  onSelectFile, 
  selectedFile, 
  onSelectDirectory, 
  sidebarWidth,
  invalidFiles = new Set(),
  viewMode = 'editor',
  onViewModeChange = () => {},
  onFixBrokenFiles = () => {},
  isFixing = false,
  hasDirectory = false,
  glossaryCount = 0
}) {
  const [originalsOpen, setOriginalsOpen] = useState(true);
  const [translatedOpen, setTranslatedOpen] = useState(true);
  const [backupsOpen, setBackupsOpen] = useState(true);

  return (
    <div 
      className="bg-gray-50 border-r border-gray-200 flex flex-col h-full shrink-0 select-none"
      style={{ width: sidebarWidth }}
    >
      <div className="p-3 border-b border-gray-200 shrink-0">
        <button 
          onClick={onSelectDirectory}
          className="w-full flex items-center justify-center gap-2 bg-gray-800 hover:bg-gray-900 text-white px-4 py-2 rounded-md font-medium text-sm transition-colors shadow-sm"
        >
          <FolderOpen size={17} />
          Select Folder
        </button>

        {/* Mode Switch (Düzenleyici / Görüntüleyici / Sözlük) */}
        <div className="mt-2.5 bg-gray-200/90 p-1 rounded-lg flex items-center gap-1 text-xs">
          <button
            type="button"
            onClick={() => onViewModeChange('editor')}
            className={`flex-1 py-1.5 px-1.5 rounded-md font-medium flex items-center justify-center gap-1 transition-all ${
              viewMode === 'editor'
                ? 'bg-white text-blue-700 shadow-sm font-semibold'
                : 'text-gray-600 hover:text-gray-900'
            }`}
            title="XML Çeviri ve Düzenleme Modu"
          >
            <Edit3 size={13} />
            <span className="truncate">Düzenleyici</span>
          </button>
          <button
            type="button"
            onClick={() => onViewModeChange('viewer')}
            className={`flex-1 py-1.5 px-1.5 rounded-md font-medium flex items-center justify-center gap-1 transition-all ${
              viewMode === 'viewer'
                ? 'bg-white text-blue-700 shadow-sm font-semibold'
                : 'text-gray-600 hover:text-gray-900'
            }`}
            title="Ham XML İnceleme ve Kod Görüntüleme Modu"
          >
            <Eye size={13} />
            <span className="truncate">Görüntüle</span>
          </button>
          <button
            type="button"
            onClick={() => {
              if (!hasDirectory) {
                alert("Lütfen önce bir klasör seçin!");
                return;
              }
              onViewModeChange('glossary');
            }}
            className={`flex-1 py-1.5 px-1.5 rounded-md font-medium flex items-center justify-center gap-1 transition-all ${
              viewMode === 'glossary'
                ? 'bg-white text-blue-700 shadow-sm font-semibold'
                : 'text-gray-600 hover:text-gray-900'
            } ${!hasDirectory ? 'opacity-50 cursor-not-allowed' : ''}`}
            title="Özel Çeviri Terimleri ve Sözlük Kuralları"
          >
            <BookOpen size={13} />
            <span className="truncate">Sözlük</span>
            {glossaryCount > 0 && (
              <span className={`text-[10px] px-1 rounded-full font-bold ${viewMode === 'glossary' ? 'bg-blue-100 text-blue-800' : 'bg-gray-300 text-gray-700'}`}>
                {glossaryCount}
              </span>
            )}
          </button>
        </div>

        {/* Broken files repair banner */}
        {invalidFiles.size > 0 && (
          <div className="mt-2.5 p-2.5 bg-amber-50 border border-amber-300 rounded-lg text-xs">
            <div className="flex items-center justify-between font-bold text-amber-900">
              <span className="flex items-center gap-1.5">
                <AlertTriangle size={14} className="text-amber-600 shrink-0" />
                {invalidFiles.size} Bozuk Dosya
              </span>
            </div>
            <p className="text-[11px] text-amber-800 mt-1 leading-tight">
              &lt;string_table&gt; etiketi bulunmayan dosyalar tespit edildi.
            </p>
            <button
              type="button"
              onClick={() => onFixBrokenFiles()}
              disabled={isFixing}
              className="mt-2 w-full bg-amber-600 hover:bg-amber-700 active:bg-amber-800 disabled:opacity-50 text-white py-1.5 px-2 rounded-md font-semibold text-[11px] flex items-center justify-center gap-1.5 transition-colors shadow-xs"
              title="Bozuk dosyaları 'broken_files' klasörüne yedekleyip yerlerine <string_table> eklenmiş hallerini koyar"
            >
              {isFixing ? <Loader2 size={13} className="animate-spin" /> : <Wrench size={13} />}
              <span>{isFixing ? "Onarılıyor..." : "Hepsini Otomatik Onar"}</span>
            </button>
          </div>
        )}
      </div>
      
      <div className="flex-1 overflow-y-auto p-2 space-y-4">
        {originalFiles.length === 0 && translatedFiles.length === 0 && backupFiles.length === 0 ? (
          <div className="text-center text-sm text-gray-500 mt-4 px-2">
            No XML files found or folder not selected.
          </div>
        ) : (
          <>
            {/* Original Files Section */}
            <div>
              <button 
                onClick={() => setOriginalsOpen(!originalsOpen)}
                className="flex items-center gap-1 w-full text-left px-2 py-1 text-xs font-bold text-gray-600 uppercase tracking-wider hover:bg-gray-200 rounded"
              >
                {originalsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                Original Files ({originalFiles.length})
              </button>
              
              {originalsOpen && (
                <ul className="space-y-0.5 mt-1">
                  {originalFiles.map((file, idx) => {
                    const isTranslated = translatedFiles.some(tf => tf.name === file.name);
                    const isInvalid = invalidFiles.has(file.name);
                    return (
                      <li key={idx}>
                        <button
                          onClick={() => onSelectFile(file)}
                          className={"w-full flex items-center justify-between px-3 py-1.5 rounded text-sm text-left transition-colors " + (
                            selectedFile?.name === file.name 
                              ? 'bg-blue-100 text-blue-700 font-medium' 
                              : 'hover:bg-gray-200 text-gray-700'
                          )}
                          title={file.name}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <FileText size={15} className={selectedFile?.name === file.name ? 'text-blue-600 shrink-0' : 'text-gray-400 shrink-0'} />
                            <span className="truncate">{file.name}</span>
                          </div>
                          
                          <div className="flex items-center gap-1.5 shrink-0 ml-1">
                            {isInvalid && (
                              <span title="Dikkat: Bu dosyada <string_table> etiketi bulunamadı!">
                                <AlertTriangle size={14} className="text-amber-500 hover:text-amber-600 shrink-0" />
                              </span>
                            )}
                            {isTranslated && (
                              <CheckCircle size={14} className="text-green-500 shrink-0" title="Translated" />
                            )}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                  {originalFiles.length === 0 && (
                    <div className="px-6 py-1 text-xs text-gray-400">Empty</div>
                  )}
                </ul>
              )}
            </div>

            {/* Backups Section */}
            <div>
              <button 
                onClick={() => setBackupsOpen(!backupsOpen)}
                className="flex items-center gap-1 w-full text-left px-2 py-1 text-xs font-bold text-orange-700 uppercase tracking-wider hover:bg-orange-100 rounded"
              >
                {backupsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                Backups [TR] ({backupFiles.length})
              </button>
              
              {backupsOpen && (
                <ul className="space-y-0.5 mt-1">
                  {backupFiles.map((file, idx) => {
                    const isInvalid = invalidFiles.has(file.name);
                    return (
                      <li key={idx}>
                        <button
                          onClick={() => onSelectFile(file)}
                          className={"w-full flex items-center justify-between gap-2 px-3 py-1.5 rounded text-sm text-left transition-colors " + (
                            selectedFile?.name === file.name 
                              ? 'bg-orange-100 text-orange-800 font-medium' 
                              : 'hover:bg-gray-200 text-gray-700'
                          )}
                          title={file.name}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <DatabaseBackup size={15} className={selectedFile?.name === file.name ? 'text-orange-600 shrink-0' : 'text-gray-400 shrink-0'} />
                            <span className="truncate">{file.name}</span>
                          </div>
                          {isInvalid && (
                            <span title="Dikkat: Bu dosyada <string_table> etiketi bulunamadı!">
                              <AlertTriangle size={14} className="text-amber-500 hover:text-amber-600 shrink-0" />
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                  {backupFiles.length === 0 && (
                    <div className="px-6 py-1 text-xs text-gray-400">Empty</div>
                  )}
                </ul>
              )}
            </div>

            {/* Translated Files Section */}
            <div>
              <button 
                onClick={() => setTranslatedOpen(!translatedOpen)}
                className="flex items-center gap-1 w-full text-left px-2 py-1 text-xs font-bold text-green-700 uppercase tracking-wider hover:bg-green-100 rounded"
              >
                {translatedOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                Translated [EN] ({translatedFiles.length})
              </button>
              
              {translatedOpen && (
                <ul className="space-y-0.5 mt-1">
                  {translatedFiles.map((file, idx) => {
                    const isInvalid = invalidFiles.has(file.name);
                    return (
                      <li key={idx}>
                        <button
                          onClick={() => onSelectFile(file)}
                          className={"w-full flex items-center justify-between gap-2 px-3 py-1.5 rounded text-sm text-left transition-colors " + (
                            selectedFile?.name === file.name 
                              ? 'bg-green-100 text-green-800 font-medium' 
                              : 'hover:bg-gray-200 text-gray-700'
                          )}
                          title={file.name}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <FileText size={15} className={selectedFile?.name === file.name ? 'text-green-600 shrink-0' : 'text-gray-400 shrink-0'} />
                            <span className="truncate">{file.name}</span>
                          </div>
                          {isInvalid && (
                            <span title="Dikkat: Bu dosyada <string_table> etiketi bulunamadı!">
                              <AlertTriangle size={14} className="text-amber-500 hover:text-amber-600 shrink-0" />
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                  {translatedFiles.length === 0 && (
                    <div className="px-6 py-1 text-xs text-gray-400">Empty</div>
                  )}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
