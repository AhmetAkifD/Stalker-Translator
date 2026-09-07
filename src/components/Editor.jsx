import { useState, useEffect, useMemo, useRef } from 'react';
import { translateText, translateBulk, checkTokenLimit } from '../utils/geminiApi';
import { replaceTurkishCharacters } from '../utils/turkishReplacer';
import { extractTranslations, applyTranslations, hasStringTable, hasXmlDeclaration, removeXmlDeclaration, removeStringTableTags } from '../utils/xmlUtils';
import { readXmlFile, saveFileToFolder } from '../utils/fileSystem';
import { Save, Loader2, ArrowRight, ArrowDown, Zap, Calculator, Copy, Check, AlertTriangle, Eye, Wrench, BookOpen, XCircle, Trash2 } from 'lucide-react';

export default function Editor({ 
  fileHandle, 
  fileCategory = "original",
  directoryHandle, 
  apiKey, 
  prompt, 
  selectedModel, 
  fallbackModels = [],
  targetItemId, 
  onClearTargetItem, 
  onSwitchToViewer, 
  onFixCurrentFile, 
  isFixing = false,
  glossary = [],
  onOpenGlossary = () => {}
}) {
  const [items, setItems] = useState([]);
  const [originalXml, setOriginalXml] = useState("");
  const [loading, setLoading] = useState(false);
  const abortRef = useRef(false);
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
      const tokens = await checkTokenLimit(originalTexts, apiKey, prompt, selectedModel, glossary);
      setTokenInfo({ checked: true, tokens, loading: false });
      return tokens;
    } catch (error) {
      alert("Failed to count tokens");
      setTokenInfo({ checked: false, tokens: 0, loading: false });
      return 0;
    }
  };

  const handleStopBulkTranslate = () => {
    abortRef.current = true;
  };

  const handleBulkTranslate = async () => {
    if (!apiKey) {
      alert("Please enter your Gemini API Key first.");
      return;
    }

    const tokens = await checkTokens();
    if (tokens > 230000) {
      alert("Warning: Token count (" + tokens + ") is very close to the 250,000 limit. Please translate manually or split the file.");
      return;
    }
    
    if (!confirm("Are you sure you want to translate all " + items.length + " items at once? This will consume about " + tokens + " input tokens.")) {
      return;
    }

    setBulkTranslating(true);
    abortRef.current = false;
    
    const originalTexts = items.map(i => i.originalText);
    
    // Start fallback from the selected model and move down the priority list
    const startIndex = fallbackModels ? fallbackModels.indexOf(selectedModel) : -1;
    const modelsToTry = fallbackModels && fallbackModels.length > 0
      ? fallbackModels.slice(startIndex >= 0 ? startIndex : 0)
      : [selectedModel];
    
    let success = false;

    for (const modelToTry of modelsToTry) {
      if (abortRef.current) {
        console.log("Translation stopped by user.");
        break;
      }
      
      // Try each model up to 2 times
      for (let attempt = 1; attempt <= 2; attempt++) {
        if (abortRef.current) break;
        
        console.log(`Trying model: ${modelToTry}, Attempt: ${attempt}`);
        
        try {
          const translationsArray = await translateBulk(originalTexts, apiKey, prompt, modelToTry, glossary);
          
          if (!Array.isArray(translationsArray)) {
            throw new Error("API did not return a valid JSON array.");
          }
          
          if (translationsArray.length === 0) {
            throw new Error("API returned an empty array.");
          }

          const newItems = [...items];
          const minLength = Math.min(items.length, translationsArray.length);
          
          for (let i = 0; i < minLength; i++) {
            newItems[i].translatedText = translationsArray[i] || "";
          }
          setItems(newItems);

          if (translationsArray.length !== items.length) {
            alert(`Note: The AI returned ${translationsArray.length} translations for ${items.length} items. Most items were translated successfully, but there is a slight mismatch (usually an extra empty string at the end). Please quickly double-check the last few items.`);
          }
          
          success = true;
          break; // Break attempt loop
        } catch (error) {
          console.error(`Error with ${modelToTry} (Attempt ${attempt}):`, error);
          if (attempt === 2) {
             console.log(`${modelToTry} failed twice. Moving to next model if available.`);
          } else {
             // Wait briefly before retry
             await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
      }
      if (success) break; // Break model loop if successful
    }
    
    setBulkTranslating(false);
    
    if (!success && !abortRef.current) {
       alert("Bulk translation failed after trying all available models. Please check your API key, quotas, or try again later.");
    }
  };

  const handleTranslate = async (index, item) => {
    if (!apiKey) {
      alert("Please enter your Gemini API Key first.");
      return;
    }
    
    setTranslatingId(item.id);
    try {
      const rawTranslation = await translateText(item.originalText, apiKey, prompt, selectedModel, glossary);
      
      const newItems = [...items];
      newItems[index].translatedText = rawTranslation;
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

  const handleShiftDown = (index) => {
    const newItems = [...items];
    // Start from the end, move each translation down by one
    for (let i = newItems.length - 1; i > index; i--) {
      newItems[i].translatedText = newItems[i - 1].translatedText;
    }
    // Empty the target index
    newItems[index].translatedText = "";
    setItems(newItems);
  };

  const handleSave = async () => {
    try {
      setSaveStatus("Saving...");
      // 1. Generate the Turkish XML
      let xml_TR = applyTranslations(originalXml, items);
      
      // 2. Generate the English XML
      const currentTexts = extractTranslations(xml_TR);
      const cleanedCurrentItems = currentTexts.map(item => ({
        ...item,
        translatedText: replaceTurkishCharacters(item.originalText)
      }));
      let xml_EN = applyTranslations(xml_TR, cleanedCurrentItems);

      // 3. Save to translated_files (English characters)
      await saveFileToFolder(directoryHandle, fileHandle, "translated_files", xml_EN);
      
      // 4. Save to backups (Turkish characters) - ONLY if not editing the translated file
      if (fileCategory !== "translated_files") {
        await saveFileToFolder(directoryHandle, fileHandle, "backups", xml_TR);
      }
      
      setSaveStatus("Saved successfully!");
      setTimeout(() => setSaveStatus(""), 3000);
    } catch (error) {
      setSaveStatus("Error saving file");
    }
  };

  const handleRemoveXmlHeader = async () => {
    if (!confirm("XML başlığı (<?xml ... ?>) bu dosyadan tamamen silinecek ve şu an açık olan dosyaya anında kaydedilecektir (yedek klasörlerindeki aynı isimli dosyalara dokunulmaz). Onaylıyor musunuz?")) return;
    const newXml = removeXmlDeclaration(originalXml);
    setOriginalXml(newXml);
    try {
      const writable = await fileHandle.createWritable();
      await writable.write(newXml);
      await writable.close();
      alert("XML başlığı başarıyla silindi ve açık olan dosyaya kaydedildi!");
    } catch (err) {
      console.error(err);
      alert("Dosya kaydedilirken bir hata oluştu.");
    }
  };

  const handleRemoveStringTable = async () => {
    if (!confirm("<string_table> ve </string_table> etiketleri bu dosyadan tamamen silinecek ve şu an açık olan dosyaya anında kaydedilecektir (yedek klasörlerindeki aynı isimli dosyalara dokunulmaz). Onaylıyor musunuz?")) return;
    const newXml = removeStringTableTags(originalXml);
    setOriginalXml(newXml);
    try {
      const writable = await fileHandle.createWritable();
      await writable.write(newXml);
      await writable.close();
      alert("<string_table> etiketleri başarıyla silindi ve açık olan dosyaya kaydedildi!");
    } catch (err) {
      console.error(err);
      alert("Dosya kaydedilirken bir hata oluştu.");
    }
  };

  const matchedGlossaryTerms = useMemo(() => {
    if (!glossary || glossary.length === 0 || !items || items.length === 0) return [];
    const combinedText = items.map(i => i.originalText || "").join("\n").toLowerCase();
    const validTerms = glossary.filter(
      item => item && typeof item.original === 'string' && typeof item.translation === 'string' &&
              item.original.trim() !== '' && item.translation.trim() !== ''
    );
    return validTerms.filter(item => combinedText.includes(item.original.trim().toLowerCase()));
  }, [glossary, items]);

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
        <div className="flex items-center gap-3 flex-wrap">
          {glossary.length > 0 ? (
            <div className="relative group">
              <button 
                type="button"
                onClick={onOpenGlossary}
                className="flex items-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 px-3 py-1.5 rounded text-sm font-medium transition-colors"
                title="Aktif özel sözlük kurallarını görüntüleyin veya düzenleyin"
              >
                <BookOpen size={16} />
                <span>{glossary.length} Terim (Eşleşen: {matchedGlossaryTerms.length})</span>
              </button>
              
              {/* Dropdown Popover */}
              {matchedGlossaryTerms.length > 0 && (
                <div className="absolute top-full mt-1 left-1/2 -translate-x-1/2 w-64 bg-white border border-gray-200 shadow-xl rounded-md z-50 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 overflow-hidden">
                  <div className="px-3 py-2 bg-indigo-50 border-b border-indigo-100 text-xs font-bold text-indigo-800">
                    Sistemin Yakaladığı Terimler ({matchedGlossaryTerms.length})
                  </div>
                  <div className="max-h-60 overflow-y-auto p-1.5 space-y-1">
                    {matchedGlossaryTerms.map(term => (
                      <div key={term.id} className="text-[11px] leading-tight flex flex-col px-2 py-1.5 hover:bg-gray-50 rounded border border-transparent hover:border-gray-100">
                        <span className="font-bold text-gray-800">{term.original}</span>
                        <span className="text-gray-500 font-medium">➜ {term.translation}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <button 
              type="button"
              onClick={onOpenGlossary}
              className="flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 border border-gray-300 text-gray-600 px-3 py-1.5 rounded text-sm font-medium transition-colors"
              title="Özel kelime ve terim kuralları tanımlayın"
            >
              <BookOpen size={16} />
              <span>Sözlük Ekle</span>
            </button>
          )}

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
          
          {bulkTranslating ? (
            <button 
              onClick={handleStopBulkTranslate}
              className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md font-medium transition-colors"
            >
              <XCircle size={18} />
              Stop
            </button>
          ) : (
            <button 
              onClick={handleBulkTranslate}
              disabled={items.length === 0}
              className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-md font-medium transition-colors disabled:opacity-50"
            >
              <Zap size={18} />
              Translate All
            </button>
          )}
          
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
        {originalXml && (hasXmlDeclaration(originalXml) || hasStringTable(originalXml)) && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center justify-between shadow-sm flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <BookOpen className="text-blue-600 shrink-0" size={18} />
              <p className="text-xs text-blue-800 font-medium">
                Bu dosyada XML başlığı veya string_table etiketi var. İstenmiyorsa buradan silebilirsiniz:
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {hasXmlDeclaration(originalXml) && (
                <button
                  type="button"
                  onClick={handleRemoveXmlHeader}
                  className="flex items-center gap-1.5 bg-red-100 hover:bg-red-200 text-red-700 px-3 py-1.5 rounded-md text-xs font-semibold shrink-0 transition-colors shadow-sm"
                  title="XML başlığını (<?xml ... ?>) bu dosyadan tamamen sil"
                >
                  <Trash2 size={13} />
                  XML Başlığını Sil
                </button>
              )}
              {hasStringTable(originalXml) && (
                <button
                  type="button"
                  onClick={handleRemoveStringTable}
                  className="flex items-center gap-1.5 bg-red-100 hover:bg-red-200 text-red-700 px-3 py-1.5 rounded-md text-xs font-semibold shrink-0 transition-colors shadow-sm"
                  title="<string_table> ve </string_table> etiketlerini bu dosyadan tamamen sil"
                >
                  <Trash2 size={13} />
                  &lt;string_table&gt; Sil
                </button>
              )}
              {onSwitchToViewer && (
                <button
                  type="button"
                  onClick={onSwitchToViewer}
                  className="flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 rounded-md text-xs font-semibold shrink-0 transition-colors shadow-sm"
                >
                  <Eye size={13} />
                  Görüntüleyici
                </button>
              )}
            </div>
          </div>
        )}

        {items.length === 0 && (
          <div className="text-center py-12 text-gray-500 bg-white rounded-lg border border-dashed border-gray-300">
            <p className="font-semibold text-sm text-gray-700">Bu dosyada çevrilebilir &lt;string&gt; kaydı bulunamadı.</p>
            <p className="text-xs text-gray-400 mt-1">Dosyanın ham içeriğini incelemek için Görüntüleyici modunu açabilirsiniz.</p>
          </div>
        )}

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
                  <div className="flex flex-col gap-2 w-20 shrink-0">
                    <button
                      onClick={() => handleTranslate(index, item)}
                      disabled={translatingId === item.id || bulkTranslating}
                      className="flex-1 flex flex-col items-center justify-center gap-1 bg-green-100 hover:bg-green-200 text-green-700 p-2 rounded border border-green-300 transition-colors disabled:opacity-50"
                      title="Sadece bu satırı çevir"
                    >
                      {translatingId === item.id ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <ArrowRight size={16} />
                      )}
                      <span className="text-[10px] font-bold">Çevir</span>
                    </button>
                    <button
                      onClick={() => handleShiftDown(index)}
                      className="flex flex-col items-center justify-center gap-1 bg-amber-100 hover:bg-amber-200 text-amber-700 p-2 rounded border border-amber-300 transition-colors"
                      title="Bu satırı boşalt ve metinleri aşağı kaydır"
                    >
                      <ArrowDown size={16} />
                      <span className="text-[10px] font-bold">Kaydır</span>
                    </button>
                  </div>
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
