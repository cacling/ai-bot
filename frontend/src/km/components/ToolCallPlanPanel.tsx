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
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wrench size={14} className="text-muted-foreground" />
          <h4 className="text-xs font-semibold">Tool Call Plan</h4>
          <Badge variant="outline" className="text-[9px]">{bindings.length} tools</Badge>
        </div>
        <Button variant="outline" size="xs" onClick={syncFromSkillMd} disabled={syncing}>
          <RefreshCw size={10} className={syncing ? 'animate-spin' : ''} />
          {syncing ? '同步中...' : '从 SKILL.md 同步'}
        </Button>
      </div>

      {loading && <p className="text-[11px] text-muted-foreground">加载中...</p>}

      {!loading && bindings.length === 0 && (
        <div className="text-[11px] text-muted-foreground text-center py-4 border rounded-lg border-dashed">
          暂无 Tool 绑定。点击"从 SKILL.md 同步"自动提取。
        </div>
      )}

      {bindings.length > 0 && (
        <div className="space-y-1.5">
          {bindings.map((b, i) => {
            const purposeCfg = PURPOSE_CONFIG[b.purpose ?? 'query'] ?? PURPOSE_CONFIG.query;
            return (
              <div
                key={b.id}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-background hover:border-primary/30 transition-colors cursor-pointer"
                onClick={() => onOpenTool?.(b.tool_name)}
              >
                <span className="text-[10px] font-bold text-muted-foreground w-5 text-center">{i + 1}</span>
                <span className="font-mono text-xs font-medium flex-1">{b.tool_name}</span>
                <Badge variant={purposeCfg.variant} className="text-[9px] px-1.5">{purposeCfg.label}</Badge>
                {b.trigger_condition && (
                  <span className="text-[10px] text-muted-foreground max-w-[200px] truncate" title={b.trigger_condition}>
                    {b.trigger_condition}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
