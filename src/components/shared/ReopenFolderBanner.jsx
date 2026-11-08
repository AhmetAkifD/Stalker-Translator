import { FolderOpen, X } from 'lucide-react';

// Shown when the last working folder is remembered but the browser needs one click to allow access again.
export default function ReopenFolderBanner({ folder }) {
  if (!folder.pending) return null;
  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-sm text-amber-900 flex items-center gap-3 shrink-0">
      <FolderOpen size={16} className="shrink-0" />
      <span className="truncate">Son çalışma klasörü: <b>{folder.pending.name}</b></span>
      <button onClick={folder.reopen} className="ml-auto px-3 py-1 rounded-md bg-amber-600 hover:bg-amber-700 text-white font-semibold shrink-0">
        Aç
      </button>
      <button onClick={folder.dismiss} className="p-1 rounded text-amber-700 hover:bg-amber-100 shrink-0" title="Gizle">
        <X size={15} />
      </button>
    </div>
  );
}
