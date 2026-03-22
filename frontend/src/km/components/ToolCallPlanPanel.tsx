/**
 * ToolCallPlanPanel — Skill 的 Tool Call Plan 展示（严格 MCP 对齐）
 *
 * 展示 Skill 会调用哪些 MCP Tool、调用顺序、目的、触发条件。
 * Skill 只认识 Tool Contract，不认识底层实现。
 */
import { useState, useEffect } from 'react';
import { RefreshCw, Wrench, Search, Zap, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface ToolBinding {
  id: number;
  skill_id: string;
  tool_name: string;
  call_order: number | null;
  purpose: string | null;
  trigger_condition: string | null;
  arg_mapping: string | null;
  result_mapping: string | null;
}

interface Props {
  skillId: string;
  onOpenTool?: (toolName: string) => void;
}

const PURPOSE_CONFIG: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
  query: { label: 'Query', variant: 'outline' },
  action: { label: 'Action', variant: 'default' },
  check: { label: 'Check', variant: 'secondary' },
};

export function ToolCallPlanPanel({ skillId, onOpenTool }: Props) {
  const [bindings, setBindings] = useState<ToolBinding[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/skills/${skillId}/tool-bindings`);
      const data = await res.json();
      setBindings(data.items ?? []);
    } catch { /* ignore */ }
    setLoading(false);
  };

  const syncFromSkillMd = async () => {
    setSyncing(true);
    try {
      const res = await fetch(`/api/skills/${skillId}/sync-bindings`, { method: 'POST' });
      const data = await res.json();
      if (data.ok) load();
    } catch { /* ignore */ }
    setSyncing(false);
  };

  useEffect(() => { load(); }, [skillId]);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Badge variant="outline" className="text-[9px]">{bindings.length} tools</Badge>
        <Button variant="ghost" size="icon-xs" onClick={syncFromSkillMd} disabled={syncing} title="从 SKILL.md 同步">
          <RefreshCw size={10} className={syncing ? 'animate-spin' : ''} />
        </Button>
      </div>

      {loading && <p className="text-[10px] text-muted-foreground">加载中...</p>}

      {!loading && bindings.length === 0 && (
        <div className="text-[10px] text-muted-foreground text-center py-3">
          暂无绑定
        </div>
      )}

      {bindings.length > 0 && (
        <div className="space-y-0.5">
          {bindings.map((b, i) => {
            const purposeCfg = PURPOSE_CONFIG[b.purpose ?? 'query'] ?? PURPOSE_CONFIG.query;
            return (
              <div
                key={b.id}
                className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-muted transition-colors cursor-pointer"
                onClick={() => onOpenTool?.(b.tool_name)}
                title={b.trigger_condition ?? b.tool_name}
              >
                <span className="text-[9px] font-bold text-muted-foreground w-3 text-center shrink-0">{i + 1}</span>
                <span className="font-mono text-[10px] font-medium truncate flex-1">{b.tool_name}</span>
                <Badge variant={purposeCfg.variant} className="text-[8px] px-1 shrink-0">{purposeCfg.label}</Badge>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
