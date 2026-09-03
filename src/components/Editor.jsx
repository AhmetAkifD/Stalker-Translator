import { useState, useEffect } from 'react';
import { translateText, translateBulk, checkTokenLimit } from '../utils/geminiApi';
import { replaceTurkishCharacters } from '../utils/turkishReplacer';
import { extractTranslations, applyTranslations } from '../utils/xmlUtils';
import { readXmlFile, saveTranslatedFile } from '../utils/fileSystem';
import { Save, Loader2, ArrowRight, Zap, Calculator, Copy, Check } from 'lucide-react';

export default function Editor({ fileHandle, directoryHandle, apiKey, prompt, selectedModel, targetItemId, onClearTargetItem }) {
  const [items, setItems] = useState([]);
  const [originalXml, setOriginalXml] = useState("");
  const [loading, setLoading] = useState(false);
  const [translatingId, setTranslatingId] = useState(null);
  const [saveStatus, setSaveStatus] = useState("");
  const [bulkTranslating, setBulkTranslating] = useState(false);
  const [tokenInfo, setTokenInfo] = useState({ checked: false, tokens: 0, loading: false });
  const [highlightedId, setHighlightedId] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  useEffect(() => {
    if (fileHandle) {
      loadFile();
    }
  }, [fileHandle]);

  // Scroll to target item once when requested from search
  useEffect(() => {
    if (targetItemId) {
      setHighlightedId(targetItemId);
      setTimeout(() => {
        const el = document.getElementById('item-' + targetItemId);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        if (onClearTargetItem) {
          onClearTargetItem();
        }
      }, 150);
    }
  }, [targetItemId]);

  // Dismiss highlight when user clicks anywhere on the page
  useEffect(() => {
    if (!highlightedId) return;

    const handleDismiss = () => {
      setHighlightedId(null);
    };

    const timer = setTimeout(() => {
      window.addEventListener('click', handleDismiss, { once: true });
    }, 200);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('click', handleDismiss);
    };
  }, [highlightedId]);

  // Reset token info when file or model changes
  useEffect(() => {
    setTokenInfo({ checked: false, tokens: 0, loading: false });
  }, [fileHandle, prompt, selectedModel]);

  const loadFile = async () => {
    setLoading(true);
    setSaveStatus("");
    try {
      const xmlString = await readXmlFile(fileHandle);
      setOriginalXml(xmlString);
      const extracted = extractTranslations(xmlString);
      setItems(extracted);
    } catch (error) {
      console.error(error);
      alert("Failed to load file");
    } finally {
      setLoading(false);
    }
  };

  const checkTokens = async () => {
    if (!apiKey) {
      alert("Please enter your Gemini API Key first.");
      return;
    }
    setTokenInfo({ ...tokenInfo, loading: true });
    try {
      const originalTexts = items.map(i => i.originalText);
      const tokens = await checkTokenLimit(originalTexts, apiKey, prompt, selectedModel);
      setTokenInfo({ checked: true, tokens, loading: false });
      return tokens;
    } catch (error) {
      alert("Failed to count tokens");
      setTokenInfo({ checked: false, tokens: 0, loading: false });
      return 0;
    }
  };

  const handleBulkTranslate = async () => {
    if (!apiKey) {
      alert("Please enter your Gemini API Key first.");
      return;
    }

    // Check tokens first
    const tokens = await checkTokens();
    if (tokens > 230000) {
      alert("Warning: Token count (" + tokens + ") is very close to the 250,000 limit. Please translate manually or split the file.");
      return;
    }
    
    if (!confirm("Are you sure you want to translate all " + items.length + " items at once? This will consume about " + tokens + " input tokens.")) {
      return;
    }

    setBulkTranslating(true);
    try {
      const originalTexts = items.map(i => i.originalText);
      const translationsArray = await translateBulk(originalTexts, apiKey, prompt, selectedModel);
      
      if (!Array.isArray(translationsArray)) {
        throw new Error("API did not return a valid JSON array.");
      }
      
      if (translationsArray.length === 0) {
        throw new Error("API returned an empty array.");
      }

      const newItems = [...items];
      // Match up to the minimum of both arrays so we don't crash
      const minLength = Math.min(items.length, translationsArray.length);
      
      for (let i = 0; i < minLength; i++) {
        newItems[i].translatedText = replaceTurkishCharacters(translationsArray[i] || "");
      }
      setItems(newItems);

      if (translationsArray.length !== items.length) {
        alert(`Note: The AI returned ${translationsArray.length} translations for ${items.length} items. Most items were translated successfully, but there is a slight mismatch (usually an extra empty string at the end). Please quickly double-check the last few items.`);
      }
    } catch (error) {
      alert("Bulk translation failed: " + error.message);
    } finally {
      setBulkTranslating(false);
    }
  };

  const handleTranslate = async (index, item) => {
    if (!apiKey) {
      alert("Please enter your Gemini API Key first.");
      return;
    }
    
    setTranslatingId(item.id);
    try {
      const rawTranslation = await translateText(item.originalText, apiKey, prompt, selectedModel);
      const cleanTranslation = replaceTurkishCharacters(rawTranslation);
      
      const newItems = [...items];
      newItems[index].translatedText = cleanTranslation;
      setItems(newItems);
    } catch (error) {
      alert("Translation failed: " + error.message);
    } finally {
      setTranslatingId(null);
    }
  };

  const handleManualEdit = (index, value) => {
    const newItems = [...items];
    newItems[index].translatedText = value;
    setItems(newItems);
  };

  const handleSave = async () => {
    try {
      setSaveStatus("Saving...");
      
      // Automatically apply Turkish character replacement to all fields before saving
      const cleanedItems = items.map(item => ({
        ...item,
        translatedText: item.translatedText ? replaceTurkishCharacters(item.translatedText) : ""
      }));
      setItems(cleanedItems);

      const updatedXml = applyTranslations(originalXml, cleanedItems);
      await saveTranslatedFile(directoryHandle, fileHandle, updatedXml);
      
      setSaveStatus("Saved successfully!");
      setTimeout(() => setSaveStatus(""), 3000);
    } catch (error) {
      setSaveStatus("Error saving file");
    }
  };

  if (loading) {
    return <div className="flex-1 flex items-center justify-center">Loading XML...</div>;
  }

  if (!fileHandle) {
    return <div className="flex-1 flex items-center justify-center text-gray-500">Select an XML file to start editing</div>;
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-white overflow-hidden shadow-sm border-l border-gray-200">
      <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50 flex-wrap gap-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">{fileHandle.name}</h2>
          <p className="text-sm text-gray-500">{items.length} text entries found</p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 px-3 py-1.5 rounded text-sm text-yellow-800">
            {tokenInfo.loading ? (
               <Loader2 size={16} className="animate-spin" />
            ) : (
               <Calculator size={16} />
            )}
            <span className="font-medium">
              {tokenInfo.checked ? tokenInfo.tokens.toLocaleString() + " Tokens" : "Tokens Unknown"}
            </span>
            <button 
              onClick={checkTokens}
              disabled={tokenInfo.loading}
              className="ml-2 text-xs bg-yellow-200 hover:bg-yellow-300 px-2 py-0.5 rounded text-yellow-900 transition-colors"
            >
              Check Limit
            </button>
          </div>
          
          <button 
            onClick={handleBulkTranslate}
            disabled={bulkTranslating || items.length === 0}
            className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-md font-medium transition-colors disabled:opacity-50"
          >
            {bulkTranslating ? <Loader2 size={18} className="animate-spin" /> : <Zap size={18} />}
            Translate All
          </button>
          
          <span className="text-sm font-medium text-green-600 ml-2">{saveStatus}</span>
          <button 
            onClick={handleSave}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md font-medium transition-colors"
          >
            <Save size={18} />
            Save File
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {items.map((item, index) => (
          <div 
            key={item.id} 
            id={'item-' + item.id}
            className={`border rounded-lg p-4 bg-gray-50 shadow-sm flex flex-col gap-3 transition-all duration-300 ${
              highlightedId === item.id 
                ? 'border-yellow-400 ring-2 ring-yellow-400 bg-yellow-50/40 shadow-md' 
                : 'border-gray-200'
            }`}
          >
            <div className="flex items-center gap-2 text-xs font-mono text-gray-500 bg-gray-100 px-2 py-1 rounded w-fit">
              ID: {item.id}
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Original */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-semibold text-gray-600 uppercase">Original Text</label>
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(item.originalText);
                      setCopiedId(item.id);
                      setTimeout(() => setCopiedId(null), 2000);
                    }}
                    className="flex items-center gap-1 text-[10px] bg-gray-100 hover:bg-gray-200 text-gray-700 px-2 py-0.5 rounded transition-colors"
                  >
                    {copiedId === item.id ? <Check size={12} className="text-green-600" /> : <Copy size={12} />}
                    {copiedId === item.id ? "Copied" : "Copy"}
                  </button>
                </div>
                <div className="p-3 bg-white border border-gray-300 rounded text-sm text-gray-800 min-h-[60px] whitespace-pre-wrap">
                  {item.originalText}
                </div>
              </div>
              
              {/* Translation */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-600 uppercase flex justify-between">
                  <span>Translation</span>
                  {item.translatedText && (
                     <span className="text-green-600">Edited</span>
                  )}
                </label>
                <div className="flex gap-2">
                  <textarea 
                    value={item.translatedText}
                    onChange={(e) => handleManualEdit(index, e.target.value)}
                    className="flex-1 p-3 bg-white border border-gray-300 rounded text-sm text-gray-800 min-h-[60px] focus:ring-2 focus:ring-blue-500 outline-none resize-y"
                    placeholder="Translation will appear here..."
                  />
                  <button
                    onClick={() => handleTranslate(index, item)}
                    disabled={translatingId === item.id || bulkTranslating}
                    className="flex flex-col items-center justify-center gap-1 bg-green-100 hover:bg-green-200 text-green-700 px-4 rounded border border-green-300 transition-colors disabled:opacity-50"
                  >
                    {translatingId === item.id ? (
                      <Loader2 size={18} className="animate-spin" />
                    ) : (
                      <ArrowRight size={18} />
                    )}
                    <span className="text-xs font-semibold">Translate</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
        
        {items.length === 0 && (
          <div className="text-center py-10 text-gray-500">
            No &lt;text&gt; tags found in this file.
          </div>
        )}
      </div>
    </div>
  );
}
