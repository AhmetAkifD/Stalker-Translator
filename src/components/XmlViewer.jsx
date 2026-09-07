import { useState, useEffect, useMemo, useRef } from 'react';
import { readXmlFile } from '../utils/fileSystem';

import { Copy, Check, Search, AlertTriangle, CheckCircle, FileCode, WrapText, Loader2, Edit3, Wrench } from 'lucide-react';

export default function XmlViewer({ fileHandle, onSwitchToEditor, onFixCurrentFile, isFixing = false }) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [wrapLines, setWrapLines] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const codeContainerRef = useRef(null);

  useEffect(() => {
    if (!fileHandle) {
      setContent("");
      setError("");
      return;
    }

    const loadContent = async () => {
      setLoading(true);
      setError("");
      try {
        const text = await readXmlFile(fileHandle);
        setContent(text);
      } catch (err) {
        console.error("Error loading XML for viewer:", err);
        setError("Dosya okunamadı: " + err.message);
      } finally {
        setLoading(false);
      }
    };

    loadContent();
  }, [fileHandle]);



  const lines = useMemo(() => {
    if (!content) return [];
    return content.split('\n');
  }, [content]);

  const handleCopy = () => {
    if (!content) return;
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Simple syntax colorizer for XML lines
  const renderLine = (line, index) => {
    if (!line) return <span>&nbsp;</span>;

    // Highlight search query if active
    if (searchQuery && searchQuery.trim() !== '') {
      const parts = line.split(new RegExp(`(${escapeRegex(searchQuery)})`, 'gi'));
      return (
        <span>
          {parts.map((part, i) =>
            part.toLowerCase() === searchQuery.toLowerCase() ? (
              <mark key={i} className="bg-yellow-300 text-black px-0.5 rounded">
                {part}
              </mark>
            ) : (
              colorizeXml(part)
            )
          )}
        </span>
      );
    }

    return colorizeXml(line);
  };

  const colorizeXml = (text) => {
    // Basic syntax coloration: comments, tags, attributes, strings
    if (/^\s*<!--[\s\S]*?-->\s*$/.test(text)) {
      return <span className="text-gray-500 italic">{text}</span>;
    }

    // Split into tokens of XML tags and raw text
    const tokens = text.split(/(<[^>]+>)/g);
    return tokens.map((token, idx) => {
      if (token.startsWith('<!--')) {
        return <span key={idx} className="text-gray-500 italic">{token}</span>;
      }
      if (token.startsWith('<?') || token.endsWith('?>')) {
        return <span key={idx} className="text-purple-600 font-semibold">{token}</span>;
      }
      if (token.startsWith('<') && token.endsWith('>')) {
        // Tag name and attributes
        const isClosing = token.startsWith('</');
        const tagMatch = token.match(/<\/?([a-zA-Z0-9_:-]+)/);
        const tagName = tagMatch ? tagMatch[1] : '';

        return (
          <span key={idx}>
            <span className="text-blue-700 font-semibold">{isClosing ? '</' : '<'}</span>
            <span className="text-blue-800 font-bold">{tagName}</span>
            {renderAttributes(token.slice((isClosing ? 2 : 1) + tagName.length, -1))}
            <span className="text-blue-700 font-semibold">{token.endsWith('/>') ? '/>' : '>'}</span>
          </span>
        );
      }
      return <span key={idx} className="text-gray-800">{token}</span>;
    });
  };

  const renderAttributes = (attrString) => {
    if (!attrString) return null;
    const attrRegex = /([a-zA-Z0-9_:-]+)(=)(["'][^"']*["'])/g;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = attrRegex.exec(attrString)) !== null) {
      if (match.index > lastIndex) {
        parts.push(attrString.substring(lastIndex, match.index));
      }
      parts.push(
        <span key={match.index}>
          <span className="text-amber-700 font-medium">{match[1]}</span>
          <span className="text-gray-600">=</span>
          <span className="text-green-700">{match[3]}</span>
        </span>
      );
      lastIndex = attrRegex.lastIndex;
    }

    if (lastIndex < attrString.length) {
      parts.push(attrString.substring(lastIndex));
    }

    return <span>{parts}</span>;
  };

  const escapeRegex = (string) => {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  };

  if (!fileHandle) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-gray-400 bg-white">
        <FileCode size={48} className="text-gray-300 mb-3" />
        <p className="text-base font-medium text-gray-500">Görüntülemek için sol menüden bir XML dosyası seçin</p>
        <p className="text-xs text-gray-400 mt-1">Bu alanda dosyanın ham XML yapısını satır numaralarıyla inceleyebilirsiniz.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-gray-500 bg-white">
        <Loader2 size={32} className="animate-spin text-blue-600 mb-2" />
        <p className="text-sm">XML dosyası yükleniyor...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-red-500 bg-white p-8">
        <AlertTriangle size={36} className="text-red-500 mb-2" />
        <p className="text-base font-semibold">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-white overflow-hidden shadow-sm border-l border-gray-200">
      {/* Top Controls Header */}
      <div className="p-3 border-b border-gray-200 bg-gray-50 flex justify-between items-center flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <FileCode size={20} className="text-blue-600" />
            <h2 className="text-base font-bold text-gray-800 truncate max-w-xs md:max-w-md">
              {fileHandle.name}
            </h2>
          </div>
          


          <span className="text-xs text-gray-500">
            {lines.length.toLocaleString()} satır • {(content.length / 1024).toFixed(1)} KB
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Search inside XML */}
          <div className="relative flex items-center">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="XML içinde ara..."
              className="border border-gray-300 rounded-md pl-7 pr-2 py-1 text-xs w-44 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
            />
            <Search size={12} className="absolute left-2 text-gray-400" />
          </div>

          {/* Line wrap toggle */}
          <button
            onClick={() => setWrapLines(!wrapLines)}
            className={`p-1.5 rounded text-xs font-medium border flex items-center gap-1 transition-colors ${
              wrapLines 
                ? 'bg-blue-50 border-blue-200 text-blue-700' 
                : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-100'
            }`}
            title="Satır Kaydırma (Wrap Lines)"
          >
            <WrapText size={14} />
          </button>

          {/* Copy Button */}
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 bg-white hover:bg-gray-100 border border-gray-300 text-gray-700 px-2.5 py-1 rounded text-xs font-medium transition-colors"
          >
            {copied ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
            {copied ? "Kopyalandı" : "Kopyala"}
          </button>

          {/* Quick jump to editor */}
          {onSwitchToEditor && (
            <button
              onClick={onSwitchToEditor}
              className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-xs font-medium transition-colors"
            >
              <Edit3 size={13} />
              Düzenleyiciye Geç
            </button>
          )}
        </div>
      </div>



      {/* Code Container with Line Numbers */}
      <div 
        ref={codeContainerRef}
        className="flex-1 overflow-auto bg-[#fafafa] font-mono text-[12px] leading-5 flex select-text"
      >
        {/* Line Numbers column */}
        <div className="bg-gray-100 border-r border-gray-200 py-3 px-2 text-right text-gray-400 select-none shrink-0 min-w-[48px]">
          {lines.map((_, i) => (
            <div key={i} className="leading-5">
              {i + 1}
            </div>
          ))}
        </div>

        {/* Code Content */}
        <div className={`p-3 flex-1 ${wrapLines ? 'whitespace-pre-wrap break-all' : 'whitespace-pre overflow-x-auto'}`}>
          {lines.map((line, i) => (
            <div key={i} className="leading-5 hover:bg-blue-50/60 transition-colors">
              {renderLine(line, i)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
