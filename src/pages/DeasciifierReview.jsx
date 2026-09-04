import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderOpen, FileText, ArrowLeft, Check, X, Undo, Save, ChevronDown, ChevronRight, DatabaseBackup } from 'lucide-react';
import { readXmlFile, saveFileToFolder } from '../utils/fileSystem';
import { extractTranslations, applyTranslations } from '../utils/xmlUtils';
import { analyzeForDeasciification } from '../utils/deasciifier';

export default function DeasciifierReview() {
  const [directoryHandle, setDirectoryHandle] = useState(null);
  const [backupFiles, setBackupFiles] = useState([]);
  const [translatedFiles, setTranslatedFiles] = useState([]);
  const [backupsOpen, setBackupsOpen] = useState(true);
  const [translatedOpen, setTranslatedOpen] = useState(true);
  const [selectedFile, setSelectedFile] = useState(null);
  
  // Debug console logs
  const [logs, setLogs] = useState([]);
  const [showLogs, setShowLogs] = useState(true);

  const addLog = (msg) => {
    const time = new Date().toLocaleTimeString();
    setLogs(prev => [...prev.slice(-50), `[${time}] ${msg}`]);
  };
  
  // Data for the current file
  const [originalXml, setOriginalXml] = useState("");
  const [items, setItems] = useState([]); // All XML items
  
  // Review Queues
  const [successQueue, setSuccessQueue] = useState([]);
  const [failedQueue, setFailedQueue] = useState([]);
  const [activeQueueType, setActiveQueueType] = useState(null); // 'success' or 'failed'
  
  const [currentIndex, setCurrentIndex] = useState(0);
  const [historyStack, setHistoryStack] = useState([]); // Last 5 edits
  const [unsavedEdits, setUnsavedEdits] = useState(0);
  
  const [editMode, setEditMode] = useState(false);
  const [editValue, setEditValue] = useState("");
  
  const navigate = useNavigate();
  const inputRef = useRef(null);

  const handleSelectDirectory = async () => {
    try {
      addLog("Opening directory picker...");
      const dirHandle = await window.showDirectoryPicker();
      setDirectoryHandle(dirHandle);
      addLog(`Selected directory: ${dirHandle.name}`);
      
      const bckFiles = [];
      const transFiles = [];
      
      for await (const entry of dirHandle.values()) {
        if (entry.kind === 'directory' && entry.name === 'backups') {
          for await (const subEntry of entry.values()) {
            if (subEntry.kind === 'file' && subEntry.name.endsWith('.xml')) {
              bckFiles.push(subEntry);
            }
          }
        } else if (entry.kind === 'directory' && entry.name === 'translated_files') {
          for await (const subEntry of entry.values()) {
            if (subEntry.kind === 'file' && subEntry.name.endsWith('.xml')) {
              transFiles.push(subEntry);
            }
          }
        }
      }
      
      setBackupFiles(bckFiles.sort((a, b) => a.name.localeCompare(b.name)));
      setTranslatedFiles(transFiles.sort((a, b) => a.name.localeCompare(b.name)));
      addLog(`Found ${bckFiles.length} backup files, ${transFiles.length} translated files.`);
    } catch (error) {
      addLog(`Directory picker error: ${error.message}`);
      console.error(error);
    }
  };

  const loadFile = async (fileHandle) => {
    if (unsavedEdits > 0) {
      if (!confirm("You have unsaved changes. Discard them?")) return;
    }
    
    addLog(`Loading file: ${fileHandle.name}`);
    setSelectedFile(fileHandle);
    setUnsavedEdits(0);
    setHistoryStack([]);
    setActiveQueueType(null);
    setCurrentIndex(0);
    setEditMode(false);
    
    try {
      const xmlString = await readXmlFile(fileHandle);
      addLog(`File read successfully (${xmlString.length} chars). Parsing XML...`);
      setOriginalXml(xmlString);
      
      const extracted = extractTranslations(xmlString);
      addLog(`Extracted ${extracted.length} <text> items from XML.`);
      setItems(extracted);
      
      // Build queues
      const sq = [];
      const fq = [];
      
      extracted.forEach(item => {
        const analysis = analyzeForDeasciification(item.originalText);
        if (analysis.changes && analysis.changes.length > 0) {
          analysis.changes.forEach(change => {
            const queueItem = {
              itemId: item.id,
              originalText: item.originalText,
              wordsArray: [...analysis.wordsArray],
              originalWord: change.originalWord,
              proposedWord: change.proposedWord,
              wordIndex: change.indexInArray
            };
            if (change.isSuccessful) sq.push(queueItem);
            else fq.push(queueItem);
          });
        }
      });
      
      setSuccessQueue(sq);
      setFailedQueue(fq);
      addLog(`Analysis complete. Successful candidates: ${sq.length}, Suspicious candidates: ${fq.length}`);
      
      if (sq.length === 0 && fq.length === 0) {
        addLog("Note: No convertible English-to-Turkish characters detected in this file!");
      }
    } catch (e) {
      addLog(`Error loading file: ${e.message}`);
      console.error("Error loading XML file:", e);
      alert("Failed to load file: " + e.message);
    }
  };

  const currentQueue = activeQueueType === 'success' ? successQueue : activeQueueType === 'failed' ? failedQueue : [];
  const currentItem = currentQueue[currentIndex];

  const handleSaveToDisk = async () => {
    if (!selectedFile) return;
    try {
      const xml_TR = applyTranslations(originalXml, items);
      await saveFileToFolder(directoryHandle, selectedFile, "backups", xml_TR);
      setUnsavedEdits(0);
      alert("Saved successfully to backups!");
    } catch (e) {
      alert("Failed to save.");
    }
  };

  const approveWord = (wordToApply) => {
    if (!currentItem) return;
    
    // Save history (max 5)
    setHistoryStack(prev => {
      const newStack = [...prev, {
        queueType: activeQueueType,
        index: currentIndex,
        previousItems: JSON.parse(JSON.stringify(items)),
        previousQueue: JSON.parse(JSON.stringify(currentQueue))
      }];
      if (newStack.length > 5) newStack.shift();
      return newStack;
    });

    // Update items
    const newItems = [...items];
    const targetItem = newItems.find(i => i.id === currentItem.itemId);
    if (targetItem) {
      const words = [...currentItem.wordsArray];
      words[currentItem.wordIndex] = wordToApply;
      targetItem.originalText = words.join(''); // Update the text
      // We must also update the queue item's wordsArray so subsequent edits on the same text don't overwrite each other
      currentQueue.forEach(q => {
        if (q.itemId === currentItem.itemId) {
          q.wordsArray[currentItem.wordIndex] = wordToApply;
        }
      });
    }
    setItems(newItems);
    
    const newEdits = unsavedEdits + 1;
    setUnsavedEdits(newEdits);
    
    if (newEdits >= 50) {
      handleSaveToDisk();
    }
    
    // Move to next
    setCurrentIndex(prev => prev + 1);
    setEditMode(false);
  };

  const handleUndo = () => {
    if (historyStack.length === 0) return;
    const lastState = historyStack[historyStack.length - 1];
    
    setItems(lastState.previousItems);
    if (lastState.queueType === 'success') {
      setSuccessQueue(lastState.previousQueue);
    } else {
      setFailedQueue(lastState.previousQueue);
    }
    setActiveQueueType(lastState.queueType);
    setCurrentIndex(lastState.index);
    
    setHistoryStack(prev => prev.slice(0, -1));
    setUnsavedEdits(prev => Math.max(0, prev - 1));
    setEditMode(false);
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      // If we are in edit mode, standard typing navigation applies.
      // But if Enter is pressed, we approve.
      if (editMode) {
        if (e.key === 'Enter') {
          approveWord(editValue);
        }
        return;
      }
      
      // Not in edit mode
      if (!currentItem) return;
      
      if (e.key === 'ArrowRight') {
        approveWord(currentItem.proposedWord);
      } else if (e.key === 'ArrowLeft') {
        setEditValue(currentItem.originalWord);
        setEditMode(true);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editMode, currentItem, editValue, items, activeQueueType, currentQueue, historyStack, unsavedEdits]);

  useEffect(() => {
    if (editMode && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editMode]);

  return (
    <div className="flex flex-col h-screen bg-gray-100 font-sans">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm p-4 flex gap-4 items-center shrink-0">
        <button 
          onClick={() => {
            if (unsavedEdits > 0) {
              if (confirm("Save changes before leaving?")) handleSaveToDisk();
            }
            navigate('/');
          }} 
          className="p-2 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="font-bold text-lg text-gray-800">
          De-asciifier Review
        </div>
        <div className="flex-1 flex justify-end gap-3">
          <button 
            onClick={handleUndo}
            disabled={historyStack.length === 0}
            className="flex items-center gap-1 px-3 py-1.5 bg-gray-200 hover:bg-gray-300 rounded text-gray-700 disabled:opacity-50 text-sm font-medium"
          >
            <Undo size={16} /> Undo ({historyStack.length})
          </button>
          <button 
            onClick={handleSaveToDisk}
            disabled={unsavedEdits === 0}
            className="flex items-center gap-1 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 rounded text-white disabled:opacity-50 text-sm font-medium"
          >
            <Save size={16} /> Save Changes ({unsavedEdits})
          </button>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <div className="w-64 bg-gray-50 border-r border-gray-200 flex flex-col h-full shrink-0 select-none">
          <div className="p-4 border-b border-gray-200 shrink-0">
            <button 
              onClick={handleSelectDirectory}
              className="w-full flex items-center justify-center gap-2 bg-gray-800 hover:bg-gray-900 text-white px-4 py-2 rounded-md font-medium"
            >
              <FolderOpen size={18} /> Select Folder
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-2 space-y-4">
            {backupFiles.length === 0 && translatedFiles.length === 0 ? (
              <div className="text-sm text-gray-500 text-center mt-4">
                No backup or translated files found.
              </div>
            ) : (
              <>
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
                            onClick={() => loadFile(file)}
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
                            onClick={() => loadFile(file)}
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

        {/* Content Area */}
        <div className="flex-1 bg-gray-100 flex flex-col items-center p-8 relative">
          {!selectedFile ? (
            <div className="m-auto text-gray-400">Select a file from the backups folder to begin.</div>
          ) : !activeQueueType ? (
            <div className="m-auto flex gap-6">
              <button 
                onClick={() => setActiveQueueType('success')}
                className="flex flex-col items-center justify-center p-8 bg-white border border-green-200 hover:border-green-400 rounded-xl shadow-sm hover:shadow-md transition-all gap-3 w-64"
              >
                <Check size={40} className="text-green-500" />
                <span className="font-bold text-xl text-gray-800">Başarılı</span>
                <span className="text-gray-500">{successQueue.length} kelime</span>
              </button>
              <button 
                onClick={() => setActiveQueueType('failed')}
                className="flex flex-col items-center justify-center p-8 bg-white border border-red-200 hover:border-red-400 rounded-xl shadow-sm hover:shadow-md transition-all gap-3 w-64"
              >
                <X size={40} className="text-red-500" />
                <span className="font-bold text-xl text-gray-800">Şüpheli (Başarısız)</span>
                <span className="text-gray-500">{failedQueue.length} kelime</span>
              </button>
            </div>
          ) : !currentItem ? (
            <div className="m-auto text-center flex flex-col items-center gap-4">
              <div className="text-xl font-bold text-green-600">Bu gruptaki tüm kelimeleri bitirdiniz!</div>
              <button onClick={() => setActiveQueueType(null)} className="px-4 py-2 bg-gray-800 text-white rounded">Geri Dön</button>
            </div>
          ) : (
            // REVIEW UI
            // Vertical centering adjusted to slightly above center using flex alignment and margins
            <div className="w-full max-w-3xl flex flex-col mt-32">
              
              <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
                <div className="bg-gray-50 p-4 border-b border-gray-200 flex justify-between items-center text-sm font-medium text-gray-500">
                  <span>Kalan Kelime: {currentQueue.length - currentIndex}</span>
                  <span>ID: {currentItem.itemId}</span>
                </div>
                
                <div className="p-10 flex flex-col items-center gap-8">
                  <div className="flex items-center gap-6 text-3xl font-bold">
                    <span className="text-gray-400 line-through">{currentItem.originalWord}</span>
                    <span className="text-gray-300">→</span>
                    
                    {editMode ? (
                      <input 
                        ref={inputRef}
                        type="text"
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        className="border-b-2 border-blue-500 text-blue-600 outline-none text-center bg-transparent w-48"
                      />
                    ) : (
                      <span className="text-blue-600">{currentItem.proposedWord}</span>
                    )}
                  </div>
                  
                  <div className="text-lg text-gray-700 bg-gray-50 p-6 rounded-lg w-full text-center leading-relaxed">
                    {currentItem.wordsArray.map((w, i) => (
                      <span key={i} className={i === currentItem.wordIndex ? "bg-yellow-200 font-bold px-1 rounded" : ""}>
                        {w}
                      </span>
                    ))}
                  </div>
                </div>
                
                <div className="bg-gray-50 p-4 border-t border-gray-200 flex justify-between text-sm">
                  <div className="flex items-center gap-2 text-gray-500">
                    <kbd className="bg-white border border-gray-300 rounded px-2 py-1 font-mono">Sol Ok</kbd> 
                    <span>Düzenle (Reddet)</span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-500">
                    <span>Onayla</span>
                    <kbd className="bg-white border border-gray-300 rounded px-2 py-1 font-mono">Sağ Ok</kbd> 
                  </div>
                </div>
              </div>
              
              {editMode && (
                <div className="text-center mt-4 text-blue-600 font-medium animate-pulse">
                  Enter'a basarak onaylayın
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Debug Console Panel */}
      <div className="bg-gray-900 text-green-400 font-mono text-xs border-t border-gray-700 shrink-0">
        <div className="bg-gray-800 px-4 py-1.5 flex justify-between items-center text-gray-300 select-none">
          <span className="font-semibold text-gray-200">Debug Console</span>
          <button 
            onClick={() => setShowLogs(!showLogs)} 
            className="text-xs hover:text-white"
          >
            {showLogs ? "Hide Console" : "Show Console"} ({logs.length} logs)
          </button>
        </div>
        
        {showLogs && (
          <div className="h-32 overflow-y-auto p-3 space-y-1">
            {logs.length === 0 ? (
              <div className="text-gray-500 italic">No logs yet. Select a folder and click a file to start...</div>
            ) : (
              logs.map((log, index) => (
                <div key={index} className="leading-relaxed">{log}</div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
