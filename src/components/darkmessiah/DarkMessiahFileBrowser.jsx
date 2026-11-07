import { useState } from 'react';
import { FolderOpen, FileText, ChevronDown, ChevronRight, Download, CheckCircle2 } from 'lucide-react';
import { GROUPS } from '../../utils/darkmessiah/workspace';

export default function DarkMessiahFileBrowser({
  files = [],
  stats = {},
  selectedId,
  onSelectFile,
  onSelectDirectory,
  onOpenPatch,
  patchActive,
  workspaceLabel,
}) {
  const [closed, setClosed] = useState({});

  return (
    <div className="w-72 bg-gray-50 border-r border-gray-200 flex flex-col h-full shrink-0">
      <div className="p-3 border-b border-gray-200 bg-white space-y-2">
        <button
          onClick={onSelectDirectory}
          className="w-full flex items-center justify-center gap-2 bg-gray-900 hover:bg-gray-800 text-white px-4 py-2 rounded-md text-sm font-semibold transition-colors"
        >
          <FolderOpen size={17} />
          {workspaceLabel ? 'Klasör Değiştir' : 'Çalışma Klasörünü Seç'}
        </button>
        {workspaceLabel && <div className="text-[11px] font-mono text-gray-500 truncate" title={workspaceLabel}>{workspaceLabel}</div>}
        <button
          onClick={onOpenPatch}
          className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-semibold transition-colors border ${patchActive ? 'bg-red-700 text-white border-red-700' : 'bg-red-50 text-red-800 border-red-200 hover:bg-red-100'}`}
        >
          <Download size={16} />
          Yama Kur / Kaldır
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-3">
        {!workspaceLabel ? (
          <p className="text-center text-sm text-gray-500 mt-4 px-3">
            Çıkarılmış VPK klasörünü seçin (ör. <span className="font-mono">Desktop\vpk unpacked</span>).
          </p>
        ) : (
          Object.entries(GROUPS).map(([groupId, group]) => {
            const groupFiles = files.filter((f) => f.group === groupId);
            if (groupFiles.length === 0) return null;
            const total = groupFiles.reduce((s, f) => s + (stats[f.id]?.total || 0), 0);
            const done = groupFiles.reduce((s, f) => s + (stats[f.id]?.translated || 0), 0);
            const isOpen = !closed[groupId];
            return (
              <div key={groupId}>
                <button
                  onClick={() => setClosed((c) => ({ ...c, [groupId]: isOpen }))}
                  className="w-full flex items-center justify-between px-2 py-1.5 bg-gray-200/70 hover:bg-gray-200 rounded text-left"
                  title={group.hint}
                >
                  <span className="flex items-center gap-1 text-xs font-bold text-gray-700 uppercase tracking-wide">
                    {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    {group.title}
                  </span>
                  <span className="text-[10px] font-semibold text-gray-600">{total ? Math.round((done / total) * 100) : 0}%</span>
                </button>
                {isOpen && (
                  <ul className="mt-1 space-y-0.5">
                    {groupFiles.map((f) => {
                      const s = stats[f.id];
                      const pct = s?.total ? Math.round((s.translated / s.total) * 100) : 0;
                      const active = selectedId === f.id;
                      return (
                        <li key={f.id}>
                          <button
                            onClick={() => onSelectFile(f)}
                            className={`w-full px-2.5 py-1.5 rounded text-left transition-colors ${active ? 'bg-red-100 text-red-900' : 'hover:bg-gray-200/70 text-gray-700'}`}
                            title={f.turkishSegs.join('/')}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="flex items-center gap-1.5 text-xs font-medium truncate">
                                {pct === 100 ? <CheckCircle2 size={13} className="text-green-600 shrink-0" /> : <FileText size={13} className="text-gray-400 shrink-0" />}
                                {f.label}
                              </span>
                              <span className="text-[10px] text-gray-500 shrink-0">{s ? `${s.translated}/${s.total}` : '…'}</span>
                            </div>
                            <div className="h-1 bg-gray-200 rounded-full mt-1 overflow-hidden">
                              <div className={`h-full ${pct === 100 ? 'bg-green-500' : 'bg-red-500'}`} style={{ width: `${pct}%` }} />
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
