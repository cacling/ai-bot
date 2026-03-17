/**
 * VersionPanel.tsx — 版本历史侧栏
 *
 * 显示指定文件的版本列表 + 简易 Diff 视图 + 回滚按钮
 * 嵌入 SkillManagerPage 的右侧区域
 */

import { useEffect, useState } from 'react';
import { Clock, RotateCcw, ChevronRight, ChevronDown, X } from 'lucide-react';

// Uses relative URLs — Vite dev proxy forwards to backend

interface VersionItem {
  id: number;
  change_description: string | null;
  created_by: string | null;
  created_at: string;
}

interface DiffLine {
  type: 'equal' | 'add' | 'remove';
  content: string;
  lineFrom?: number;
  lineTo?: number;
}

interface DiffResult {
  fromContent: string;
  toContent: string;
  diff: DiffLine[];
  from: { id: number; label: string };
  to: { id: number | null; label: string };
}

interface Props {
  filePath: string | null;
  onClose: () => void;
  onRollback?: () => void; // 回滚成功后的回调（刷新编辑器内容）
}

export function VersionPanel({ filePath, onClose, onRollback }: Props) {
  const [versions, setVersions] = useState<VersionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [diff, setDiff] = useState<DiffResult | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [rolling, setRolling] = useState(false);

  // 加载版本列表
  useEffect(() => {
    if (!filePath) { setVersions([]); return; }
    setLoading(true);
    setSelectedId(null);
    setDiff(null);
    fetch(`/api/skill-versions?path=${encodeURIComponent(filePath)}`)
      .then(r => r.json())
      .then(d => setVersions(d.versions ?? []))
      .catch(() => setVersions([]))
      .finally(() => setLoading(false));
  }, [filePath]);

  // 加载 Diff
  const loadDiff = async (versionId: number) => {
    setSelectedId(versionId);
    setDiffLoading(true);
    try {
      const res = await fetch(`/api/skill-versions/diff?from=${versionId}`);
      const data = await res.json();
      setDiff(data);
    } catch {
      setDiff(null);
    }
    setDiffLoading(false);
  };

  // 回滚
  const handleRollback = async (versionId: number) => {
    if (!confirm(`确定回滚到版本 #${versionId}？当前内容将被覆盖。`)) return;
    setRolling(true);
    try {
      const res = await fetch(`/api/skill-versions/rollback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version_id: versionId }),
      });
      if (res.ok) {
        onRollback?.();
        // 重新加载版本列表
        if (filePath) {
          const r = await fetch(`/api/skill-versions?path=${encodeURIComponent(filePath)}`);
          const d = await r.json();
          setVersions(d.versions ?? []);
        }
        setSelectedId(null);
        setDiff(null);
      }
    } catch { /* ignore */ }
    setRolling(false);
  };

  if (!filePath) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-gray-400">
        选择文件后查看版本历史
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white border-l border-gray-200">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50">
        <div className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
          <Clock size={14} />
          <span>版本历史</span>
          <span className="text-xs text-gray-400">({versions.length})</span>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-gray-200 text-gray-400">
          <X size={14} />
        </button>
      </div>

      {/* Version list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 text-center text-sm text-gray-400">加载中...</div>
        ) : versions.length === 0 ? (
          <div className="p-4 text-center text-sm text-gray-400">暂无版本记录</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {versions.map((v) => (
              <div key={v.id} className="group">
                <button
                  onClick={() => selectedId === v.id ? setSelectedId(null) : loadDiff(v.id)}
                  className={`w-full px-3 py-2 text-left hover:bg-gray-50 transition ${
                    selectedId === v.id ? 'bg-blue-50' : ''
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    {selectedId === v.id ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    <span className="text-xs font-mono text-gray-500">#{v.id}</span>
                    <span className="text-xs text-gray-400 ml-auto">
                      {new Date(v.created_at).toLocaleString('zh-CN', {
                        month: '2-digit', day: '2-digit',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <div className="text-xs text-gray-600 mt-0.5 truncate pl-5">
                    {v.change_description ?? '(无说明)'}
                  </div>
                  <div className="text-[10px] text-gray-400 pl-5">
                    {v.created_by ?? 'system'}
                  </div>
                </button>

                {/* Expanded: Diff + Rollback */}
                {selectedId === v.id && (
                  <div className="px-3 pb-3">
                    {diffLoading ? (
                      <div className="text-xs text-gray-400 py-2">加载 Diff...</div>
                    ) : diff ? (
                      <>
                        {/* Diff view */}
                        <div className="mt-1 rounded border border-gray-200 bg-gray-50 max-h-64 overflow-auto text-[11px] font-mono leading-5">
                          {diff.diff.filter(l => l.type !== 'equal').length === 0 ? (
                            <div className="p-2 text-gray-400 text-center">内容相同，无差异</div>
                          ) : (
                            diff.diff.map((line, i) => {
                              if (line.type === 'equal') return null;
                              return (
                                <div
                                  key={i}
                                  className={`px-2 ${
                                    line.type === 'add'
                                      ? 'bg-green-50 text-green-800'
                                      : 'bg-red-50 text-red-800'
                                  }`}
                                >
                                  <span className="select-none mr-2 text-gray-400">
                                    {line.type === 'add' ? '+' : '-'}
                                  </span>
                                  {line.content || ' '}
                                </div>
                              );
                            })
                          )}
                        </div>

                        {/* Rollback button */}
                        <button
                          onClick={() => handleRollback(v.id)}
                          disabled={rolling}
                          className="mt-2 flex items-center gap-1 px-3 py-1.5 rounded bg-amber-500 text-white text-xs font-medium hover:bg-amber-600 disabled:opacity-50 transition"
                        >
                          <RotateCcw size={12} />
                          {rolling ? '回滚中...' : '回滚到此版本'}
                        </button>
                      </>
                    ) : null}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
