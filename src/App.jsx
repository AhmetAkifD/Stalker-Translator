import { useState } from 'react'
import FileBrowser from './components/FileBrowser'
import Editor from './components/Editor'
import ModelSelector from './components/ModelSelector'
import SearchBar from './components/SearchBar'
import { Settings, Key } from 'lucide-react'

function App() {
  const [directoryHandle, setDirectoryHandle] = useState(null)
  const [originalFiles, setOriginalFiles] = useState([])
  const [translatedFiles, setTranslatedFiles] = useState([])
  const [selectedFile, setSelectedFile] = useState(null)
  const [targetItemId, setTargetItemId] = useState(null)
  const [apiKey, setApiKey] = useState(localStorage.getItem('geminiApiKey') || '')
  const [prompt, setPrompt] = useState(localStorage.getItem('geminiPrompt') || 'Translate this game dialogue to Turkish. Just return the translation without any markdown or quotes.')
  const [model, setModel] = useState(localStorage.getItem('geminiModel') || 'gemini-3.7-flash')
  
  const [sidebarWidth, setSidebarWidth] = useState(256)
  const [isResizing, setIsResizing] = useState(false)

  const handleSelectDirectory = async () => {
    try {
      const dirHandle = await window.showDirectoryPicker()
      setDirectoryHandle(dirHandle)
      
      const origFiles = []
      const transFiles = []
      
      for await (const entry of dirHandle.values()) {
        if (entry.kind === 'file' && entry.name.endsWith('.xml')) {
          origFiles.push(entry)
        } else if (entry.kind === 'directory' && entry.name === 'translated_files') {
          const transDirHandle = entry
          for await (const subEntry of transDirHandle.values()) {
            if (subEntry.kind === 'file' && subEntry.name.endsWith('.xml')) {
              transFiles.push(subEntry)
            }
          }
        }
      }
      
      setOriginalFiles(origFiles.sort((a, b) => a.name.localeCompare(b.name)))
      setTranslatedFiles(transFiles.sort((a, b) => a.name.localeCompare(b.name)))
      setSelectedFile(null)
    } catch (error) {
      console.error(error)
    }
  }

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
        <div className="flex items-center gap-2 font-bold text-lg text-gray-800">
          <Settings className="text-blue-600" />
          <span>Game XML Translator</span>
        </div>
        
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
          sidebarWidth={sidebarWidth}
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

        <Editor 
          fileHandle={selectedFile} 
          directoryHandle={directoryHandle}
          apiKey={apiKey}
          prompt={prompt}
          selectedModel={model}
          targetItemId={targetItemId}
          onClearTargetItem={() => setTargetItemId(null)}
        />
      </main>
    </div>
  )
}

export default App
