/**
 * VersionPanel.tsx — 版本历史侧栏
 *
 * 显示指定文件的版本列表 + 简易 Diff 视图 + 回滚按钮
 * 嵌入 SkillManagerPage 的右侧区域
 */

import { useEffect, useState } from 'react';
import { Clock, RotateCcw, ChevronRight, ChevronDown, X } from 'lucide-react';

interface VersionItem {
  id: number;
  version_no: number;
  status: string;
  change_description: string | null;
  created_by: string | null;
  created_at: string;
}

interface Props {
  filePath: string | null;
  onClose: () => void;
  onRollback?: () => void;
}

export function VersionPanel({ filePath, onClose, onRollback }: Props) {
  const [versions, setVersions] = useState<VersionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [rolling, setRolling] = useState(false);

  // Extract skill ID from file path (e.g. "skills/biz-skills/bill-inquiry/SKILL.md" → "bill-inquiry")
  const skillId = filePath ? (() => {
    const parts = filePath.split('/');
    const idx = parts.indexOf('biz-skills');
    return idx >= 0 && parts[idx + 1] ? parts[idx + 1] : null;
  })() : null;

  // 加载版本列表
  useEffect(() => {
    if (!skillId) { setVersions([]); return; }
    setLoading(true);
    setSelectedId(null);

    fetch(`/api/skill-versions?skill=${encodeURIComponent(skillId)}`)
      .then(r => r.json())
      .then(d => setVersions(d.versions ?? []))
      .catch(() => setVersions([]))
      .finally(() => setLoading(false));
  }, [skillId]);

  // 展开/折叠版本
  const toggleVersion = (versionId: number) => {
    setSelectedId(selectedId === versionId ? null : versionId);
  };

  // 回滚
  const handleRollback = async (v: VersionItem) => {
    if (!skillId) return;
    if (!confirm(`确定回滚到版本 v${v.version_no}？当前内容将被覆盖。`)) return;
    setRolling(true);
    try {
      const res = await fetch(`/api/skill-versions/rollback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skill: skillId, version_no: v.version_no }),
      });
      if (res.ok) {
        onRollback?.();
        if (skillId) {
          const r = await fetch(`/api/skill-versions?skill=${encodeURIComponent(skillId)}`);
          const d = await r.json();
          setVersions(d.versions ?? []);
        }
        setSelectedId(null);
    
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
                  onClick={() => toggleVersion(v.id)}
                  className={`w-full px-3 py-2 text-left hover:bg-gray-50 transition ${
                    selectedId === v.id ? 'bg-blue-50' : ''
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    {selectedId === v.id ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    <span className="text-xs font-mono text-gray-600">v{v.version_no}</span>
                    {v.status === 'published' && <span className="text-[10px] px-1 py-0.5 rounded bg-green-100 text-green-600">已发布</span>}
                    {v.status === 'draft' && <span className="text-[10px] px-1 py-0.5 rounded bg-amber-100 text-amber-600">草稿</span>}
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

                {/* Expanded: Rollback */}
                {selectedId === v.id && (
                  <div className="px-3 pb-3">
                    <div className="text-[11px] text-gray-400 mb-2">
                      快照: {v.status === 'published' ? '当前发布版本' : '历史版本'}
                    </div>
                    {v.status !== 'published' && (
                      <button
                        onClick={() => handleRollback(v)}
                        disabled={rolling}
                        className="flex items-center gap-1 px-3 py-1.5 rounded bg-amber-500 text-white text-xs font-medium hover:bg-amber-600 disabled:opacity-50 transition"
                      >
                        <RotateCcw size={12} />
                        {rolling ? '回滚中...' : '回滚到此版本'}
                      </button>
                    )}
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
