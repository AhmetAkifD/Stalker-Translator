import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, BookOpen, Languages, Sparkles } from 'lucide-react';

export default function Home() {
  const [selectedGame, setSelectedGame] = useState(null);
  const navigate = useNavigate();

  const handleGameSelect = (game) => {
    setSelectedGame(game);
  };

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-6 overflow-y-auto font-sans text-white">
      <div className="w-full max-w-4xl relative min-h-[580px] flex items-center justify-center py-4">
        
        {/* Step 1: Game Selection */}
        <div 
          className={`absolute w-full max-w-md transition-all duration-500 ease-in-out flex flex-col gap-4 ${
            selectedGame ? '-translate-x-[150%] opacity-0 pointer-events-none' : 'translate-x-0 opacity-100'
          }`}
        >
          <div className="text-center mb-6">
            <h1 className="text-3xl font-bold text-gray-100 mb-2">Game Translator</h1>
            <p className="text-gray-400">Select a game to begin translation workflow</p>
          </div>
          
          <div className="bg-gray-800 rounded-lg p-2 shadow-2xl border border-gray-700">
            <button
              onClick={() => handleGameSelect('stalker')}
              className="w-full flex items-center justify-between p-4 rounded bg-gray-700/50 hover:bg-blue-600/30 border border-transparent hover:border-blue-500 transition-all text-left group"
            >
              <div className="flex flex-col">
                <span className="font-semibold text-lg group-hover:text-blue-100 transition-colors">S.T.A.L.K.E.R.: Shadow of Chernobyl</span>
                <span className="text-xs text-gray-400 mt-1">XML Localization Files</span>
              </div>
              <ChevronRight className="text-gray-500 group-hover:text-blue-400 transition-colors" />
            </button>
            
            <button disabled className="w-full flex items-center justify-between p-4 rounded text-left opacity-50 cursor-not-allowed mt-2">
              <div className="flex flex-col">
                <span className="font-medium text-gray-400">More games coming soon...</span>
              </div>
            </button>
          </div>
        </div>

        {/* Step 2: Tools Selection */}
        <div 
          className={`absolute w-full max-w-md transition-all duration-500 ease-in-out flex flex-col gap-4 ${
            selectedGame ? 'translate-x-0 opacity-100' : 'translate-x-[150%] opacity-0 pointer-events-none'
          }`}
        >
          <div className="text-center mb-4 relative">
            <button 
              onClick={() => setSelectedGame(null)}
              className="absolute left-0 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white flex items-center gap-1 text-sm font-medium transition-colors"
            >
              <ChevronRight className="rotate-180" size={16} /> Back
            </button>
            <h1 className="text-3xl font-bold text-gray-100 mb-2">Select Tool</h1>
            <p className="text-blue-300">S.T.A.L.K.E.R.: Shadow of Chernobyl</p>
          </div>
          
          <div className="flex flex-col gap-3">
            <button
              onClick={() => navigate('/translator')}
              className="w-full flex items-center p-5 rounded-lg bg-gray-800/80 hover:bg-gray-700/80 border border-gray-600 hover:border-blue-500 backdrop-blur-sm transition-all text-left group shadow-lg"
            >
              <div className="flex flex-col">
                <div className="flex items-center gap-2 mb-1">
                  <Languages className="text-blue-400 group-hover:text-blue-300" size={20} />
                  <span className="font-bold text-lg text-white">İngilizceden Türkçeye Çeviri</span>
                </div>
                <span className="text-xs text-gray-400 leading-relaxed">Ana çeviri arayüzü. Gemini Yapay Zeka kullanarak XML dosyalarını toplu olarak çevirin ve düzenleyin.</span>
              </div>
            </button>

            <button
              onClick={() => navigate('/glossary')}
              className="w-full flex items-center p-5 rounded-lg bg-gray-800/80 hover:bg-gray-700/80 border border-gray-600 hover:border-blue-500 backdrop-blur-sm transition-all text-left group shadow-lg"
            >
              <div className="flex flex-col">
                <div className="flex items-center gap-2 mb-1">
                  <BookOpen className="text-blue-400 group-hover:text-blue-300" size={20} />
                  <span className="font-bold text-lg text-white">Özel Çeviri Sözlüğü (Glossary)</span>
                </div>
                <span className="text-xs text-gray-400 leading-relaxed">Oyun içi özel terimleri, fraksiyon adlarını ve çeviri kurallarını belirleyin. Model bu kurallara harfiyen uyar.</span>
              </div>
            </button>

            <button
              onClick={() => navigate('/deasciifier')}
              className="w-full flex items-center p-5 rounded-lg bg-gray-800/80 hover:bg-gray-700/80 border border-gray-600 hover:border-blue-500 backdrop-blur-sm transition-all text-left group shadow-lg"
            >
              <div className="flex flex-col">
                <div className="flex items-center gap-2 mb-1">
                  <Sparkles className="text-blue-400 group-hover:text-blue-300" size={20} />
                  <span className="font-bold text-lg text-white">Türkçe Karakter Restorasyonu</span>
                </div>
                <span className="text-xs text-gray-400 leading-relaxed">De-asciifier Algoritması. Çevrilmiş İngilizce karakterli metinlerinizi otomatik Türkçe karakterlere dönüştürün.</span>
              </div>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
