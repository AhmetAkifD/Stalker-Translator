import { useState, useEffect, useRef } from 'react';
import { translateText, translateBulk, checkTokenLimit } from '../../utils/geminiApi';
import { Save, Loader2, Zap, Calculator, Copy, Check, BookOpen } from 'lucide-react';

export default function WitcherEditor({ 
  fileHandle, 
  apiKey, 
  prompt, 
  selectedModel, 
  fallbackModels = [],
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
  const [copiedId, setCopiedId] = useState(null);

  useEffect(() => {
    if (fileHandle) {
      loadFile();
    }
  }, [fileHandle]);

  const loadFile = async () => {
    setLoading(true);
    try {
      const file = await fileHandle.getFile();
      const text = await file.text();
      setOriginalXml(text);
      
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(text, "text/xml");
      const entries = xmlDoc.getElementsByTagName("entry");
      
      const parsedItems = [];
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const id = entry.getAttribute("field_idx");
        const originalNode = entry.getElementsByTagName("original")[0];
        const translationNode = entry.getElementsByTagName("translation")[0];
        
        if (originalNode) {
          parsedItems.push({
            id: id,
            originalText: originalNode.textContent || "",
            translation: translationNode ? (translationNode.textContent || "") : ""
          });
        }
      }
      
      setItems(parsedItems);
      setSaveStatus("");
      setTokenInfo({ checked: false, tokens: 0, loading: false });
    } catch (err) {
      console.error(err);
      alert("Dosya okunamadı: " + err.message);
    }
    setLoading(false);
  };

  const handleTranslationChange = (id, newText) => {
    setItems(items.map(item => item.id === id ? { ...item, translation: newText } : item));
    setSaveStatus("Kaydedilmemiş değişiklikler var");
  };

  const handleSave = async () => {
    if (!fileHandle) return;
    
    setSaveStatus("Kaydediliyor...");
    
    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(originalXml, "text/xml");
      const entries = xmlDoc.getElementsByTagName("entry");
      
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const id = entry.getAttribute("field_idx");
        
        const item = items.find(it => it.id === id);
        if (item) {
          let transNode = entry.getElementsByTagName("translation")[0];
          if (!transNode) {
            transNode = xmlDoc.createElement("translation");
            entry.appendChild(transNode);
          }
          transNode.textContent = item.translation;
        }
      }
      
      const serializer = new XMLSerializer();
      let newXmlString = serializer.serializeToString(xmlDoc);
      
      const writable = await fileHandle.createWritable();
      await writable.write(newXmlString);
      await writable.close();
      
      setOriginalXml(newXmlString);
      setSaveStatus("Değişiklikler Kaydedildi");
      
      setTimeout(() => setSaveStatus(""), 3000);
    } catch (err) {
      console.error(err);
      setSaveStatus("Kayıt Hatası: " + err.message);
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
    
    const startIndex = fallbackModels ? fallbackModels.indexOf(selectedModel) : -1;
    const modelsToTry = fallbackModels && fallbackModels.length > 0
      ? fallbackModels.slice(startIndex >= 0 ? startIndex : 0)
      : [selectedModel];
    
    let success = false;

    for (const modelToTry of modelsToTry) {
      if (abortRef.current) break;
      
      for (let attempt = 1; attempt <= 2; attempt++) {
        if (abortRef.current) break;
        
        try {
          const batchSize = 10;
          let translationsArray = [];
          
          for (let i = 0; i < originalTexts.length; i += batchSize) {
            if (abortRef.current) break;
            const batch = originalTexts.slice(i, i + batchSize);
            const batchTranslations = await translateBulk(batch, apiKey, prompt, modelToTry, glossary);
            translationsArray = [...translationsArray, ...batchTranslations];
          }

          if (abortRef.current) break;

          if (translationsArray && translationsArray.length === items.length) {
            setItems(prevItems => 
              prevItems.map((item, idx) => ({
                ...item,
                translation: translationsArray[idx] || item.translation
              }))
            );
            setSaveStatus("Toplu Çeviri Tamamlandı (Kaydedilmedi)");
            success = true;
            break;
          }
        } catch (error) {
          console.error(error);
        }
      }
      
      if (success) break;
    }
    
    if (!success && !abortRef.current) {
      alert("Tüm modeller denendi ancak toplu çeviri başarısız oldu.");
    }
    
    setBulkTranslating(false);
  };

  const handleTranslateSingle = async (id, originalText) => {
    if (!apiKey) {
      alert("Please enter your Gemini API Key first.");
      return;
    }
    
    setTranslatingId(id);
    
    const startIndex = fallbackModels ? fallbackModels.indexOf(selectedModel) : -1;
    const modelsToTry = fallbackModels && fallbackModels.length > 0
      ? fallbackModels.slice(startIndex >= 0 ? startIndex : 0)
      : [selectedModel];
      
    let success = false;
    
    for (const modelToTry of modelsToTry) {
      try {
        const translatedText = await translateText(originalText, apiKey, prompt, modelToTry, glossary);
        if (translatedText) {
          handleTranslationChange(id, translatedText);
          success = true;
          break;
        }
      } catch (error) {
        console.error(error);
      }
    }
    
    if (!success) {
       alert("Çeviri tüm modellerde başarısız oldu.");
    }

    setTranslatingId(null);
  };

  const handleCopyOriginal = (id, originalText) => {
    handleTranslationChange(id, originalText);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-gray-500">
        <Loader2 className="w-10 h-10 animate-spin mb-4 text-amber-500" />
        <p className="text-lg font-medium">Dosya yükleniyor...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white relative w-full">
      <div className="sticky top-0 z-10 flex items-center justify-between p-3 border-b border-gray-200 bg-white/95 backdrop-blur shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex flex-col">
            <h2 className="text-lg font-bold text-gray-800 truncate" title={fileHandle?.name}>{fileHandle?.name}</h2>
            <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full w-fit">
              The Witcher 1 - XML Editor
            </span>
          </div>
          
          <button
            onClick={onOpenGlossary}
            className="ml-2 flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-md text-sm font-medium transition-colors border border-indigo-200"
          >
            <BookOpen size={16} />
            Sözlük
            {glossary.length > 0 && (
              <span className="bg-indigo-200 text-indigo-800 text-[10px] px-1.5 py-0.5 rounded-full ml-1">
                {glossary.length}
              </span>
            )}
          </button>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-gray-50 p-1.5 rounded-lg border border-gray-200">
            {tokenInfo.checked ? (
              <div className="text-sm px-2 text-gray-600 font-medium">
                ~{tokenInfo.tokens.toLocaleString()} tokens
              </div>
            ) : (
              <button
                onClick={checkTokens}
                disabled={tokenInfo.loading || items.length === 0}
                className="text-xs px-3 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded transition-colors flex items-center gap-1 font-medium disabled:opacity-50"
              >
                {tokenInfo.loading ? <Loader2 size={12} className="animate-spin" /> : <Calculator size={12} />}
                {tokenInfo.loading ? 'Hesaplanıyor' : 'Token Hesapla'}
              </button>
            )}
            
            {bulkTranslating ? (
              <button
                onClick={handleStopBulkTranslate}
                className="flex items-center gap-1.5 bg-red-100 hover:bg-red-200 text-red-700 px-3 py-1.5 rounded-md text-sm font-bold transition-all shadow-sm border border-red-200"
              >
                <Loader2 size={16} className="animate-spin" />
                Durdur
              </button>
            ) : (
              <button
                onClick={handleBulkTranslate}
                disabled={items.length === 0 || !apiKey}
                className="flex items-center gap-1.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white px-3 py-1.5 rounded-md text-sm font-bold transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Zap size={16} className={items.length > 0 && apiKey ? "text-yellow-200 fill-yellow-200" : ""} />
                Toplu Çevir
              </button>
            )}
          </div>

          <div className="h-6 w-px bg-gray-300"></div>
          
          <span className="text-sm font-medium text-gray-500 min-w-[200px] text-right">
            {saveStatus}
          </span>
          <button
            onClick={handleSave}
            disabled={!saveStatus}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold transition-all shadow-sm ${
              saveStatus ? 'bg-green-600 hover:bg-green-700 text-white shadow-green-600/20' : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            <Save size={18} />
            Kaydet
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
        <div className="max-w-5xl mx-auto space-y-3 pb-20">
          {items.map((item) => (
            <div 
              key={item.id} 
              id={`item-${item.id}`}
              className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col transition-all hover:shadow-md"
            >
              <div className="flex border-b border-gray-100 relative">
                <div className="w-1/2 p-4 bg-gray-50/50 border-r border-gray-100">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Orijinal (Field {item.id})</span>
                    <button
                      onClick={() => handleCopyOriginal(item.id, item.originalText)}
                      className="text-gray-400 hover:text-amber-600 transition-colors flex items-center gap-1 text-xs"
                      title="Orijinali Çeviriye Kopyala"
                    >
                      {copiedId === item.id ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                    </button>
                  </div>
                  <p className="text-gray-800 whitespace-pre-wrap font-medium leading-relaxed">{item.originalText}</p>
                </div>
                
                <div className="w-1/2 p-4 relative group">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-amber-600 uppercase tracking-wider">Çeviri</span>
                    <button
                      onClick={() => handleTranslateSingle(item.id, item.originalText)}
                      disabled={translatingId === item.id || bulkTranslating || !apiKey}
                      className="text-xs bg-amber-50 hover:bg-amber-100 text-amber-700 px-3 py-1 rounded-full font-semibold flex items-center gap-1 transition-colors disabled:opacity-50"
                    >
                      {translatingId === item.id ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <Zap size={12} className="fill-amber-600" />
                      )}
                      Yapay Zeka
                    </button>
                  </div>
                  <textarea
                    value={item.translation}
                    onChange={(e) => handleTranslationChange(item.id, e.target.value)}
                    className="w-full h-full min-h-[80px] p-2 bg-transparent border-none resize-y focus:ring-0 focus:outline-none text-gray-800 font-medium leading-relaxed placeholder-gray-300"
                    placeholder="Çeviriyi buraya yazın..."
                  />
                </div>
              </div>
            </div>
          ))}
          
          {items.length === 0 && (
            <div className="text-center p-12 bg-white rounded-xl border border-gray-200 border-dashed">
              <p className="text-gray-500 font-medium">Bu dosyada çevrilecek metin bulunamadı.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
