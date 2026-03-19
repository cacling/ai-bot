/**
 * VersionPanel.tsx — 版本历史侧栏
 */

import { useEffect, useState } from 'react';
import { Clock, RotateCcw, ChevronRight, ChevronDown, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

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

  const skillId = filePath ? (() => {
    const parts = filePath.split('/');
    const idx = parts.indexOf('biz-skills');
    return idx >= 0 && parts[idx + 1] ? parts[idx + 1] : null;
  })() : null;

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

  const toggleVersion = (versionId: number) => {
    setSelectedId(selectedId === versionId ? null : versionId);
  };

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
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        选择文件后查看版本历史
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background border-l">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-background">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <Clock size={14} />
          <span>版本历史</span>
          <span className="text-xs text-muted-foreground">({versions.length})</span>
        </div>
        <Button variant="ghost" size="icon-xs" onClick={onClose}><X size={14} /></Button>
      </div>

      {/* Version list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 text-center text-sm text-muted-foreground">加载中...</div>
        ) : versions.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">暂无版本记录</div>
        ) : (
          <div className="divide-y">
            {versions.map((v) => (
              <div key={v.id} className="group">
                <button
                  onClick={() => toggleVersion(v.id)}
                  className={`w-full px-3 py-2 text-left hover:bg-muted transition ${
                    selectedId === v.id ? 'bg-accent' : ''
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    {selectedId === v.id ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    <span className="text-xs font-mono text-muted-foreground">v{v.version_no}</span>
                    {v.status === 'published' && <Badge variant="secondary" className="text-[9px]">已发布</Badge>}
                    {v.status === 'draft' && <Badge variant="outline" className="text-[9px]">草稿</Badge>}
                    <span className="text-xs text-muted-foreground ml-auto">
                      {new Date(v.created_at).toLocaleString('zh-CN', {
                        month: '2-digit', day: '2-digit',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 truncate pl-5">
                    {v.change_description ?? '(无说明)'}
                  </div>
                  <div className="text-[10px] text-muted-foreground pl-5">
                    {v.created_by ?? 'system'}
                  </div>
                </button>

                {selectedId === v.id && (
                  <div className="px-3 pb-3">
                    <div className="text-[11px] text-muted-foreground mb-2">
                      快照: {v.status === 'published' ? '当前发布版本' : '历史版本'}
                    </div>
                    {v.status !== 'published' && (
                      <Button variant="outline" size="sm" onClick={() => handleRollback(v)} disabled={rolling}>
                        <RotateCcw size={12} />
                        {rolling ? '回滚中...' : '回滚到此版本'}
                      </Button>
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
