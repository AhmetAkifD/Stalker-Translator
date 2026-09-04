import { useState, useMemo, useRef, useEffect } from 'react';
import { Plus, Trash2, Save, Search, BookOpen, ArrowDown, ArrowUp, Folder, FileText, Copy } from 'lucide-react';

export default function GlossaryEditor({ 
  directoryHandle,
  glossariesMap = {},
  activeGlossaryName,
  onSelectGlossary,
  onCreateGlossary,
  onRenameGlossary,
  onDeleteGlossary,
  onSaveGlossary,
  onMoveTerm
}) {
  const containerRef = useRef(null);

  // Local state for the actively edited terms
  const [terms, setTerms] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [saveStatus, setSaveStatus] = useState("");

  // When active glossary changes, load its terms
  useEffect(() => {
    if (activeGlossaryName && glossariesMap[activeGlossaryName]) {
      setTerms(glossariesMap[activeGlossaryName]);
    } else {
      setTerms([]);
    }
  }, [activeGlossaryName, glossariesMap]);

  const filteredTerms = useMemo(() => {
    if (!searchQuery || !searchQuery.trim()) return terms;
    const q = searchQuery.toLowerCase().trim();
    return terms.filter(t => 
      ((t.original || "").toLowerCase().includes(q)) || 
      ((t.translation || "").toLowerCase().includes(q)) ||
      ((t.pronunciation || "").toLowerCase().includes(q))
    );
  }, [terms, searchQuery]);

  const scrollToBottom = () => {
    if (containerRef.current) {
      containerRef.current.scrollTo({
        top: containerRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  };

  const handleAddTerm = () => {
    const newId = 'term_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    const newTerm = { id: newId, original: "", translation: "", pronunciation: "" };
    setTerms(prev => [...prev, newTerm]);
    setTimeout(() => scrollToBottom(), 60);
  };

  const handleUpdate = (id, field, value) => {
    setTerms(prev => prev.map(t => t.id === id ? { ...t, [field]: value } : t));
  };

  const handleDeleteTerm = (id) => {
    setTerms(prev => prev.filter(t => t.id !== id));
  };

  const handleMoveUp = (index) => {
    if (index === 0) return;
    setTerms(prev => {
      const copy = [...prev];
      const temp = copy[index - 1];
      copy[index - 1] = copy[index];
      copy[index] = temp;
      return copy;
    });
  };

  const handleMoveDown = (index) => {
    if (index === terms.length - 1) return;
    setTerms(prev => {
      const copy = [...prev];
      const temp = copy[index + 1];
      copy[index + 1] = copy[index];
      copy[index] = temp;
      return copy;
    });
  };

  const handleSave = () => {
    if (!activeGlossaryName) return;
    setSaveStatus("Kaydediliyor...");
    try {
      const valid = terms.filter(t => (
        (t.original?.trim() || '') !== '' ||
        (t.translation?.trim() || '') !== '' ||
        (t.pronunciation?.trim() || '') !== ''
      ));
      setTerms(valid);
      onSaveGlossary(activeGlossaryName, valid);
      setSaveStatus("Başarıyla kaydedildi!");
      setTimeout(() => setSaveStatus(""), 3000);
    } catch (err) {
      console.error("Save glossary error:", err);
      setSaveStatus("Kayıt hatası!");
      setTimeout(() => setSaveStatus(""), 3000);
    }
  };

  if (!directoryHandle) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-gray-50 text-gray-500">
        <Folder size={48} className="mb-4 text-gray-400" />
        <h2 className="text-xl font-bold mb-2 text-gray-700">Klasör Seçilmedi</h2>
        <p>Sözlüğü kullanabilmek için lütfen sol üstten bir klasör seçin.</p>
      </div>
    );
  }

  const glossaryNames = Object.keys(glossariesMap).sort((a, b) => {
    if (a === 'Ana_Sozluk') return -1;
    if (b === 'Ana_Sozluk') return 1;
    return a.localeCompare(b);
  });

  return (
    <div className="flex-1 flex h-full bg-white overflow-hidden shadow-sm border-l border-gray-200">
      {/* Sidebar for Glossaries */}
      <div className="w-64 bg-gray-50 border-r border-gray-200 flex flex-col">
        <div className="p-3 border-b border-gray-200 bg-gray-100 flex items-center justify-between">
          <h3 className="font-bold text-gray-700 text-sm flex items-center gap-2">
            <BookOpen size={16} /> Sözlükler
          </h3>
          <button 
            onClick={() => {
              const name = prompt("Yeni sözlük adı:");
              if (name && name.trim()) onCreateGlossary(name.trim());
            }}
            className="p-1 text-blue-600 hover:bg-blue-100 rounded"
            title="Yeni Sözlük Oluştur"
          >
            <Plus size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {glossaryNames.map(gName => (
            <div 
              key={gName}
              className={`group flex items-center justify-between p-2 rounded cursor-pointer text-sm ${
                activeGlossaryName === gName 
                  ? 'bg-blue-100 text-blue-800 font-semibold' 
                  : 'hover:bg-gray-200 text-gray-700'
              }`}
              onClick={() => {
                if (activeGlossaryName !== gName) {
                  onSelectGlossary(gName);
                }
              }}
            >
              <div className="flex items-center gap-2 truncate">
                <FileText size={14} className={activeGlossaryName === gName ? 'text-blue-600' : 'text-gray-500'} />
                <span className="truncate">{gName}</span>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    const newName = prompt("Yeni isim (Ayrı dosya olarak kaydedilecek):", gName);
                    if (newName && newName.trim() && newName.trim() !== gName) {
                      onRenameGlossary(gName, newName.trim());
                    }
                  }}
                  className="p-1 text-gray-500 hover:text-blue-600 hover:bg-white rounded"
                  title="İsmi Değiştir / Ayrı Dosya Olarak Kaydet"
                >
                  <Copy size={12} />
                </button>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm(`"${gName}" silinecek ve yedeğe alınacak. Emin misiniz?`)) {
                      onDeleteGlossary(gName);
                    }
                  }}
                  className="p-1 text-gray-500 hover:text-red-600 hover:bg-white rounded"
                  title="Sil (Yedeğe Taşınır)"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Main Editor Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="shrink-0 p-4 border-b border-gray-200 bg-white flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
          <div>
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              {activeGlossaryName}
            </h2>
            <p className="text-xs text-gray-500 mt-1">
              Bu sözlükteki terimler, oyundaki ilgili kelimelerin nasıl çevrilmesi gerektiğini AI'a öğretir.
            </p>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search size={14} className="text-gray-400" />
              </div>
              <input
                type="text"
                className="block w-full pl-9 pr-3 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
                placeholder="Terimlerde ara..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <button
              onClick={handleSave}
              className="flex items-center gap-2 px-4 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors shadow-sm text-sm font-medium whitespace-nowrap"
            >
              <Save size={16} />
              Kaydet
            </button>
          </div>
        </div>

        {saveStatus && (
          <div className="bg-green-50 text-green-700 px-4 py-2 text-sm flex items-center justify-center font-medium border-b border-green-100">
            {saveStatus}
          </div>
        )}

        {/* Column Headers */}
        <div className="shrink-0 flex gap-4 px-6 py-2 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 select-none">
          <div className="flex-1">İngilizce Orijinal (Büyük/Küçük Harf Duyarlı)</div>
          <div className="flex-1">Türkçe Çeviri</div>
          <div className="flex-1">Okunuş & Ek Kuralı (Örn: Stolkır)</div>
          <div className="w-48 text-center shrink-0">İşlemler</div>
        </div>

        {/* Scrollable Terms List */}
        <div 
          className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50"
          ref={containerRef}
        >
          {filteredTerms.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              {searchQuery ? "Arama sonucu bulunamadı." : "Sözlük henüz boş. 'Yeni Terim Ekle' butonuyla başlayabilirsiniz."}
            </div>
          ) : (
            filteredTerms.map((term, index) => (
              <div 
                key={term.id} 
                className="flex gap-4 items-start bg-white p-3 rounded-lg shadow-sm border border-gray-200 hover:border-blue-300 transition-colors group"
              >
                <div className="flex-1">
                  <input
                    type="text"
                    value={term.original}
                    onChange={(e) => handleUpdate(term.id, 'original', e.target.value)}
                    placeholder="Örn: Stalker"
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:bg-white transition-colors"
                  />
                </div>
                
                <div className="flex-1">
                  <input
                    type="text"
                    value={term.translation}
                    onChange={(e) => handleUpdate(term.id, 'translation', e.target.value)}
                    placeholder="Örn: Stalker"
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:bg-white transition-colors font-medium text-gray-800"
                  />
                </div>

                <div className="flex-1">
                  <input
                    type="text"
                    value={term.pronunciation}
                    onChange={(e) => handleUpdate(term.id, 'pronunciation', e.target.value)}
                    placeholder="Örn: Stolkır (Stalker'a)"
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded text-sm focus:ring-2 focus:ring-green-500 focus:bg-white transition-colors text-gray-700"
                    title="Yapay zeka bu kelimeye ek getirirken bu okunuşu baz alacaktır. Örn: Stolkır okunuşu -> Stalker'ın"
                  />
                </div>

                <div className="w-48 shrink-0 flex items-center justify-end gap-1">
                  <button
                    onClick={() => handleMoveUp(index)}
                    disabled={index === 0}
                    className={`p-1.5 rounded ${index === 0 ? 'text-gray-300' : 'text-gray-500 hover:bg-gray-100 hover:text-blue-600'}`}
                    title="Yukarı Taşı"
                  >
                    <ArrowUp size={16} />
                  </button>
                  <button
                    onClick={() => handleMoveDown(index)}
                    disabled={index === filteredTerms.length - 1}
                    className={`p-1.5 rounded ${index === filteredTerms.length - 1 ? 'text-gray-300' : 'text-gray-500 hover:bg-gray-100 hover:text-blue-600'}`}
                    title="Aşağı Taşı"
                  >
                    <ArrowDown size={16} />
                  </button>
                  <select
                    className="w-24 text-xs border border-gray-300 rounded p-1 mx-1 outline-none focus:ring-1 focus:ring-blue-500"
                    value=""
                    onChange={(e) => {
                      if (e.target.value) {
                        onMoveTerm(term.id, activeGlossaryName, e.target.value);
                      }
                    }}
                    title="Başka sözlüğe taşı"
                  >
                    <option value="" disabled>Taşı...</option>
                    {glossaryNames.filter(n => n !== activeGlossaryName).map(n => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => handleDeleteTerm(term.id)}
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                    title="Terimi Sil"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Add Button pinned at bottom */}
        <div className="shrink-0 p-4 bg-white border-t border-gray-200">
          <button
            onClick={handleAddTerm}
            className="w-full flex items-center justify-center gap-2 py-3 bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:text-blue-600 hover:border-blue-400 hover:bg-blue-50 transition-all font-medium"
          >
            <Plus size={18} />
            Yeni Terim Ekle
          </button>
        </div>
      </div>
    </div>
  );
}
