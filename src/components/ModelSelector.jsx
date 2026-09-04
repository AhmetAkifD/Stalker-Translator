import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Trash2, Plus, Check, ArrowUp, ArrowDown } from 'lucide-react';

export default function ModelSelector({ selectedModel, onSelectModel, models = [], setModels }) {
  const [isOpen, setIsOpen] = useState(false);
  const [newModelName, setNewModelName] = useState('');

  const dropdownRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleAddModel = (e) => {
    e.preventDefault();
    const trimmed = newModelName.trim();
    if (!trimmed) return;

    if (!models.includes(trimmed)) {
      const updated = [...models, trimmed];
      setModels(updated);
      onSelectModel(trimmed);
    } else {
      onSelectModel(trimmed);
    }
    setNewModelName('');
  };

  const handleDeleteModel = (e, modelToDelete) => {
    e.stopPropagation();
    const updated = models.filter(m => m !== modelToDelete);
    setModels(updated);
    
    // If the currently selected model is deleted, select the first available
    if (selectedModel === modelToDelete && updated.length > 0) {
      onSelectModel(updated[0]);
    }
  };

  const handleMoveUp = (e, index) => {
    e.stopPropagation();
    if (index === 0) return;
    const updated = [...models];
    [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
    setModels(updated);
  };

  const handleMoveDown = (e, index) => {
    e.stopPropagation();
    if (index === models.length - 1) return;
    const updated = [...models];
    [updated[index + 1], updated[index]] = [updated[index], updated[index + 1]];
    setModels(updated);
  };

  return (
    <div className="relative w-64" ref={dropdownRef}>
      <label className="block text-xs font-semibold text-gray-500 mb-1">Model</label>
      
      {/* Combobox Trigger */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between border border-gray-300 rounded px-3 py-1.5 text-sm bg-white hover:bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none text-left"
      >
        <span className="truncate font-mono text-xs">{selectedModel || "Select a model"}</span>
        <ChevronDown size={14} className="text-gray-400 ml-1" />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute left-0 mt-1 w-72 bg-white border border-gray-200 rounded-md shadow-lg z-50 overflow-hidden">
          {/* Models List */}
          <div className="max-h-60 overflow-y-auto py-1 divide-y divide-gray-100">
            {models.map((m, index) => (
              <div
                key={m}
                onClick={() => {
                  onSelectModel(m);
                  setIsOpen(false);
                }}
                className={`flex items-center justify-between px-3 py-2 text-sm cursor-pointer hover:bg-blue-50 transition-colors ${
                  selectedModel === m ? 'bg-blue-50/60 font-semibold text-blue-600' : 'text-gray-700'
                }`}
              >
                <div className="flex items-center gap-2 truncate font-mono text-xs">
                  {selectedModel === m ? <Check size={14} className="text-blue-600 shrink-0" /> : <div className="w-3.5 shrink-0" />}
                  <span className="truncate">{m}</span>
                </div>

                <div className="flex items-center gap-1 shrink-0 ml-2 opacity-60 hover:opacity-100">
                  <div className="flex flex-col">
                    <button
                      type="button"
                      onClick={(e) => handleMoveUp(e, index)}
                      disabled={index === 0}
                      className="text-gray-400 hover:text-blue-600 disabled:opacity-30 disabled:hover:text-gray-400 p-0.5"
                      title="Move Up"
                    >
                      <ArrowUp size={12} />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleMoveDown(e, index)}
                      disabled={index === models.length - 1}
                      className="text-gray-400 hover:text-blue-600 disabled:opacity-30 disabled:hover:text-gray-400 p-0.5"
                      title="Move Down"
                    >
                      <ArrowDown size={12} />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => handleDeleteModel(e, m)}
                    className="text-gray-400 hover:text-red-500 p-1 ml-1 rounded transition-colors"
                    title="Delete Model"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}

            {models.length === 0 && (
              <div className="p-3 text-xs text-gray-400 text-center">No models available</div>
            )}
          </div>

          {/* Add New Model Field */}
          <form onSubmit={handleAddModel} className="p-2 border-t border-gray-200 bg-gray-50 flex gap-1">
            <input
              type="text"
              value={newModelName}
              onChange={(e) => setNewModelName(e.target.value)}
              placeholder="e.g. gemini-2.5-pro"
              className="flex-1 border border-gray-300 rounded px-2 py-1 text-xs font-mono outline-none focus:border-blue-500 bg-white"
            />
            <button
              type="submit"
              className="bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1 rounded text-xs flex items-center gap-1 font-medium transition-colors"
            >
              <Plus size={12} />
              Add
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
