import { useState } from 'react';
import { Search, Loader2, FileText, X } from 'lucide-react';
import { searchAllFiles } from '../utils/fileSystem';
import { extractTranslations } from '../utils/xmlUtils';

export default function SearchBar({ directoryHandle, files, onSelectResult }) {
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState(null);
  const [showResults, setShowResults] = useState(false);

  const handleSearch = async (e) => {
    e?.preventDefault();
    if (!query.trim() || !directoryHandle) return;

    setIsSearching(true);
    setShowResults(true);
    try {
      const found = await searchAllFiles(directoryHandle, files, query, extractTranslations);
      setResults(found);
    } catch (err) {
      console.error(err);
      alert("Search failed: " + err.message);
    } finally {
      setIsSearching(false);
    }
  };

  const handleClear = () => {
    setQuery('');
    setResults(null);
    setShowResults(false);
  };

  return (
    <div className="relative">
      <form onSubmit={handleSearch} className="relative flex items-center">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search in all XML files (Original & Translation)..."
          disabled={!directoryHandle}
          className="w-80 border border-gray-300 rounded-md pl-8 pr-16 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 focus:bg-white transition-all disabled:opacity-50"
        />
        <Search size={14} className="absolute left-2.5 text-gray-400" />
        
        <div className="absolute right-1.5 flex items-center gap-1">
          {query && (
            <button
              type="button"
              onClick={handleClear}
              className="text-gray-400 hover:text-gray-600 p-0.5"
            >
              <X size={12} />
            </button>
          )}
          <button
            type="submit"
            disabled={isSearching || !query.trim() || !directoryHandle}
            className="bg-gray-800 hover:bg-gray-900 text-white px-2 py-0.5 rounded text-[11px] font-medium disabled:opacity-40 transition-colors"
          >
            {isSearching ? <Loader2 size={12} className="animate-spin" /> : "Find"}
          </button>
        </div>
      </form>

      {/* Results Dropdown */}
      {showResults && (
        <div className="absolute right-0 mt-2 w-96 max-h-96 bg-white border border-gray-200 rounded-lg shadow-xl z-50 overflow-hidden flex flex-col">
          <div className="p-2.5 bg-gray-50 border-b border-gray-200 flex justify-between items-center text-xs">
            <span className="font-semibold text-gray-700">
              {isSearching ? "Searching..." : `${results?.length || 0} matches found for "${query}"`}
            </span>
            <button 
              onClick={() => setShowResults(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              <X size={14} />
            </button>
          </div>

          <div className="overflow-y-auto flex-1 divide-y divide-gray-100">
            {isSearching ? (
              <div className="p-6 text-center text-xs text-gray-500 flex flex-col items-center gap-2">
                <Loader2 size={20} className="animate-spin text-blue-600" />
                <span>Scanning all XML files in folder...</span>
              </div>
            ) : results && results.length > 0 ? (
              results.map((res, index) => (
                <div
                  key={index}
                  className="p-2.5 hover:bg-blue-50 transition-colors text-xs flex flex-col gap-1"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 font-semibold text-blue-700 truncate">
                      <FileText size={13} className="shrink-0" />
                      <span className="truncate">{res.fileName}</span>
                    </div>
                    <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-mono">
                      ID: {res.id}
                    </span>
                  </div>

                  <div className="text-gray-600 truncate">
                    <span className="font-medium text-gray-700">Original: </span>
                    {res.originalText}
                  </div>

                  {res.translationText && (
                    <div className="text-green-700 truncate">
                      <span className="font-medium">Translation: </span>
                      {res.translationText}
                    </div>
                  )}

                  <div className="flex items-center justify-between mt-1">
                    <div className="text-[10px] text-gray-400">
                      Found in: <span className="capitalize font-medium text-gray-500">{res.matchedIn}</span>
                    </div>
                    
                    <div className="flex gap-2">
                      <button 
                        onClick={() => {
                          onSelectResult(res.fileHandle, res.id);
                          setShowResults(false);
                        }}
                        className="bg-blue-100 hover:bg-blue-200 text-blue-700 px-2 py-1 rounded text-[10px] font-medium transition-colors cursor-pointer"
                      >
                        Open Original
                      </button>
                      
                      {res.translatedFileHandle && (
                        <button 
                          onClick={() => {
                            onSelectResult(res.translatedFileHandle, res.id);
                            setShowResults(false);
                          }}
                          className="bg-green-100 hover:bg-green-200 text-green-700 px-2 py-1 rounded text-[10px] font-medium transition-colors cursor-pointer"
                        >
                          Open Translation
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-6 text-center text-xs text-gray-500">
                No matching text found across files.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
