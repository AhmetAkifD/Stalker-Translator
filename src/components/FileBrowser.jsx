import { useState } from 'react';
import { FolderOpen, FileText, ChevronRight, ChevronDown, CheckCircle, DatabaseBackup } from 'lucide-react';

export default function FileBrowser({ originalFiles, translatedFiles, backupFiles = [], onSelectFile, selectedFile, onSelectDirectory, sidebarWidth }) {
  const [originalsOpen, setOriginalsOpen] = useState(true);
  const [translatedOpen, setTranslatedOpen] = useState(true);
  const [backupsOpen, setBackupsOpen] = useState(true);

  return (
    <div 
      className="bg-gray-50 border-r border-gray-200 flex flex-col h-full shrink-0 select-none"
      style={{ width: sidebarWidth }}
    >
      <div className="p-4 border-b border-gray-200 shrink-0">
        <button 
          onClick={onSelectDirectory}
          className="w-full flex items-center justify-center gap-2 bg-gray-800 hover:bg-gray-900 text-white px-4 py-2 rounded-md font-medium transition-colors"
        >
          <FolderOpen size={18} />
          Select Folder
        </button>
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
                          {isTranslated && (
                            <CheckCircle size={14} className="text-green-500 shrink-0" title="Translated" />
                          )}
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
                  {backupFiles.map((file, idx) => (
                    <li key={idx}>
                      <button
                        onClick={() => onSelectFile(file)}
                        className={"w-full flex items-center gap-2 px-3 py-1.5 rounded text-sm text-left transition-colors " + (
                          selectedFile?.name === file.name 
                            ? 'bg-orange-100 text-orange-800 font-medium' 
                            : 'hover:bg-gray-200 text-gray-700'
                        )}
                        title={file.name}
                      >
                        <DatabaseBackup size={15} className={selectedFile?.name === file.name ? 'text-orange-600 shrink-0' : 'text-gray-400 shrink-0'} />
                        <span className="truncate">{file.name}</span>
                      </button>
                    </li>
                  ))}
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
                  {translatedFiles.map((file, idx) => (
                    <li key={idx}>
                      <button
                        onClick={() => onSelectFile(file)}
                        className={"w-full flex items-center gap-2 px-3 py-1.5 rounded text-sm text-left transition-colors " + (
                          selectedFile?.name === file.name 
                            ? 'bg-green-100 text-green-800 font-medium' 
                            : 'hover:bg-gray-200 text-gray-700'
                        )}
                        title={file.name}
                      >
                        <FileText size={15} className={selectedFile?.name === file.name ? 'text-green-600 shrink-0' : 'text-gray-400 shrink-0'} />
                        <span className="truncate">{file.name}</span>
                      </button>
                    </li>
                  ))}
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
