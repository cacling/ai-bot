/**
 * SupervisorDashboard.tsx — Real-time supervisor overview.
 *
 * Shows: queue load, agent status distribution, SLA risk interactions,
 * and provides quick intervention entry points.
 *
 * Data fetched from /ix-api/api/interactions and /ix-api/api/agents/presence.
 */
import { memo, useState, useEffect, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { RefreshCw, AlertTriangle, Users, Layers, Clock } from 'lucide-react';
import { type Lang } from '../../i18n';

const IX_API_BASE = '/ix-api';

// ── Types ────────────────────────────────────────────────────────────────────

interface QueueLoad {
  queue_code: string;
  total: number;
  assigned: number;
  queued: number;
  wrapping_up: number;
}

interface AgentStatus {
  agent_id: string;
  display_name?: string;
  presence_status: string;
  active_chat_count: number;
  max_chat_slots: number;
  active_voice_count: number;
  max_voice_slots: number;
}

interface RiskInteraction {
  interaction_id: string;
  customer_party_id: string | null;
  queue_code: string | null;
  state: string;
  priority: number;
  first_response_due_at: string | null;
  next_response_due_at: string | null;
  assigned_agent_id: string | null;
}

// ── i18n ─────────────────────────────────────────────────────────────────────

const T = {
  zh: {
    title: '运营监控面板',
    refresh: '刷新',
    queueLoad: '队列实时负载',
    agentStatus: '坐席状态分布',
    slaRisk: '超时风险',
    noData: '暂无数据',
    queue: '队列',
    total: '总计',
    assigned: '已分配',
    queued: '排队',
    wrapping: '收尾',
    online: '在线',
    away: '离开',
    dnd: '忙碌',
    offline: '离线',
    agent: '坐席',
    status: '状态',
    load: '负载',
    interaction: '会话',
    customer: '客户',
    slaRemaining: 'SLA 剩余',
    overdue: '已超时',
  },
  en: {
    title: 'Live Operations Dashboard',
    refresh: 'Refresh',
    queueLoad: 'Queue Load',
    agentStatus: 'Agent Status',
    slaRisk: 'SLA At Risk',
    noData: 'No data',
    queue: 'Queue',
    total: 'Total',
    assigned: 'Assigned',
    queued: 'Queued',
    wrapping: 'Wrapping',
    online: 'Online',
    away: 'Away',
    dnd: 'DND',
    offline: 'Offline',
    agent: 'Agent',
    status: 'Status',
    load: 'Load',
    interaction: 'Interaction',
    customer: 'Customer',
    slaRemaining: 'SLA Remaining',
    overdue: 'Overdue',
  },
};

const STATUS_COLORS: Record<string, string> = {
  online: 'bg-primary',
  away: 'bg-warning',
  dnd: 'bg-destructive',
  offline: 'bg-muted-foreground',
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function computeSlaRemaining(ix: RiskInteraction): { text: string; isOverdue: boolean } {
  const due = ix.next_response_due_at ?? ix.first_response_due_at;
  if (!due) return { text: '—', isOverdue: false };
  const remaining = new Date(due).getTime() - Date.now();
  if (remaining < 0) {
    const abs = Math.abs(remaining);
    const min = Math.floor(abs / 60000);
    return { text: `-${min}m`, isOverdue: true };
  }
  const min = Math.floor(remaining / 60000);
  return { text: `${min}m`, isOverdue: false };
}

// ── Component ────────────────────────────────────────────────────────────────

interface SupervisorDashboardProps {
  lang: Lang;
}

export const SupervisorDashboard = memo(function SupervisorDashboard({ lang }: SupervisorDashboardProps) {
  const t = T[lang];

  const [queueLoads, setQueueLoads] = useState<QueueLoad[]>([]);
  const [agents, setAgents] = useState<AgentStatus[]>([]);
  const [riskInteractions, setRiskInteractions] = useState<RiskInteraction[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch all active interactions
      const ixRes = await fetch(`${IX_API_BASE}/api/interactions?limit=200`);
      const ixData = await ixRes.json();
      const interactions: RiskInteraction[] = ixData.items ?? [];

      // Build queue load map
      const queueMap = new Map<string, QueueLoad>();
      const riskList: RiskInteraction[] = [];

      for (const ix of interactions) {
        if (['closed', 'abandoned'].includes(ix.state)) continue;

        const qc = ix.queue_code ?? 'unassigned';
        if (!queueMap.has(qc)) {
          queueMap.set(qc, { queue_code: qc, total: 0, assigned: 0, queued: 0, wrapping_up: 0 });
        }
        const q = queueMap.get(qc)!;
        q.total++;
        if (ix.state === 'assigned' || ix.state === 'active') q.assigned++;
        if (ix.state === 'queued') q.queued++;
        if (ix.state === 'wrapping_up') q.wrapping_up++;

        // Check SLA risk
        const due = ix.next_response_due_at ?? ix.first_response_due_at;
        if (due) {
          const remaining = new Date(due).getTime() - Date.now();
          if (remaining < 5 * 60 * 1000) { // < 5 minutes
            riskList.push(ix);
          }
        }
      }

      setQueueLoads(Array.from(queueMap.values()).sort((a, b) => b.total - a.total));
      setRiskInteractions(riskList.sort((a, b) => {
        const dueA = a.next_response_due_at ?? a.first_response_due_at ?? '';
        const dueB = b.next_response_due_at ?? b.first_response_due_at ?? '';
        return new Date(dueA).getTime() - new Date(dueB).getTime();
      }));

      // Fetch agent presence
      const agentRes = await fetch(`${IX_API_BASE}/api/agents/presence`);
      if (agentRes.ok) {
        const agentData = await agentRes.json();
        setAgents(agentData.items ?? agentData ?? []);
      }

      setLastRefresh(new Date());
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-refresh every 30s
  useEffect(() => {
    fetchData();
    const timer = setInterval(fetchData, 30_000);
    return () => clearInterval(timer);
  }, [fetchData]);

  // Status distribution counts
  const statusCounts = agents.reduce<Record<string, number>>((acc, a) => {
    acc[a.presence_status] = (acc[a.presence_status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">{t.title}</h1>
        <div className="flex items-center gap-2">
          {lastRefresh && (
            <span className="text-xs text-muted-foreground">
              {lastRefresh.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw size={12} className={`mr-1 ${loading ? 'animate-spin' : ''}`} />
            {t.refresh}
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
        <SummaryCard
          icon={<Layers size={16} />}
          label={t.queueLoad}
          value={String(queueLoads.length)}
          sublabel={`${queueLoads.reduce((s, q) => s + q.total, 0)} ${lang === 'zh' ? '会话' : 'interactions'}`}
        />
        <SummaryCard
          icon={<Users size={16} />}
          label={`${t.online} ${t.agentStatus}`}
          value={String(statusCounts['online'] ?? 0)}
          sublabel={`/ ${agents.length} ${lang === 'zh' ? '总坐席' : 'total'}`}
        />
        <SummaryCard
          icon={<AlertTriangle size={16} className="text-destructive" />}
          label={t.slaRisk}
          value={String(riskInteractions.length)}
          sublabel={`${riskInteractions.filter(ix => {
            const due = ix.next_response_due_at ?? ix.first_response_due_at;
            return due && new Date(due).getTime() < Date.now();
          }).length} ${t.overdue}`}
          variant="destructive"
        />
        <SummaryCard
          icon={<Clock size={16} />}
          label={lang === 'zh' ? '排队中' : 'Queued'}
          value={String(queueLoads.reduce((s, q) => s + q.queued, 0))}
          sublabel={lang === 'zh' ? '等待分配' : 'awaiting assignment'}
        />
      </div>

      {/* Queue load table */}
      <div>
        <h2 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
          <Layers size={14} /> {t.queueLoad}
        </h2>
        {queueLoads.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t.noData}</p>
        ) : (
          <div className="border border-border rounded-md overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">{t.queue}</th>
                  <th className="text-right px-3 py-2 font-medium">{t.total}</th>
                  <th className="text-right px-3 py-2 font-medium">{t.assigned}</th>
                  <th className="text-right px-3 py-2 font-medium">{t.queued}</th>
                  <th className="text-right px-3 py-2 font-medium">{t.wrapping}</th>
                </tr>
              </thead>
              <tbody>
                {queueLoads.map((q) => (
                  <tr key={q.queue_code} className="border-t border-border hover:bg-muted/50">
                    <td className="px-3 py-1.5 font-medium">{q.queue_code}</td>
                    <td className="px-3 py-1.5 text-right">{q.total}</td>
                    <td className="px-3 py-1.5 text-right">{q.assigned}</td>
                    <td className="px-3 py-1.5 text-right">
                      {q.queued > 0 ? <span className="text-warning font-medium">{q.queued}</span> : q.queued}
                    </td>
                    <td className="px-3 py-1.5 text-right">{q.wrapping_up}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Agent status */}
        <div>
          <h2 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
            <Users size={14} /> {t.agentStatus}
          </h2>

          {/* Status summary */}
          <div className="flex gap-3 mb-3">
            {(['online', 'away', 'dnd', 'offline'] as const).map((s) => (
              <div key={s} className="flex items-center gap-1 text-xs">
                <span className={`h-2 w-2 rounded-full ${STATUS_COLORS[s]}`} />
                {t[s]} <span className="font-medium">{statusCounts[s] ?? 0}</span>
              </div>
            ))}
          </div>

          {agents.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t.noData}</p>
          ) : (
            <div className="border border-border rounded-md overflow-hidden max-h-[300px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">{t.agent}</th>
                    <th className="text-center px-3 py-2 font-medium">{t.status}</th>
                    <th className="text-right px-3 py-2 font-medium">{t.load}</th>
                  </tr>
                </thead>
                <tbody>
                  {agents.map((a) => (
                    <tr key={a.agent_id} className="border-t border-border hover:bg-muted/50">
                      <td className="px-3 py-1.5">{a.display_name ?? a.agent_id.slice(0, 8)}</td>
                      <td className="px-3 py-1.5 text-center">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                          <span className={`h-1.5 w-1.5 rounded-full mr-1 ${STATUS_COLORS[a.presence_status] ?? STATUS_COLORS.offline}`} />
                          {a.presence_status}
                        </Badge>
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <span className={a.active_chat_count >= a.max_chat_slots ? 'text-destructive font-medium' : ''}>
                          {a.active_chat_count}/{a.max_chat_slots}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* SLA risk interactions */}
        <div>
          <h2 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
            <AlertTriangle size={14} className="text-destructive" /> {t.slaRisk}
          </h2>
          {riskInteractions.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t.noData}</p>
          ) : (
            <div className="border border-border rounded-md overflow-hidden max-h-[300px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">{t.interaction}</th>
                    <th className="text-left px-3 py-2 font-medium">{t.queue}</th>
                    <th className="text-right px-3 py-2 font-medium">{t.slaRemaining}</th>
                  </tr>
                </thead>
                <tbody>
                  {riskInteractions.map((ix) => {
                    const sla = computeSlaRemaining(ix);
                    return (
                      <tr key={ix.interaction_id} className="border-t border-border hover:bg-muted/50">
                        <td className="px-3 py-1.5">
                          <div>{ix.customer_party_id?.slice(0, 11) ?? ix.interaction_id.slice(0, 8)}</div>
                        </td>
                        <td className="px-3 py-1.5">{ix.queue_code ?? '—'}</td>
                        <td className="px-3 py-1.5 text-right">
                          <Badge
                            variant={sla.isOverdue ? 'destructive' : 'outline'}
                            className="text-[10px] px-1.5 py-0 h-4 tabular-nums"
                          >
                            {sla.text}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

// ── Sub-components ───────────────────────────────────────────────────────────

function SummaryCard({
  icon,
  label,
  value,
  sublabel,
  variant,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sublabel: string;
  variant?: 'destructive';
}) {
  return (
    <div className="border border-border rounded-lg p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
        {icon}
        {label}
      </div>
      <div className={`text-2xl font-bold ${variant === 'destructive' ? 'text-destructive' : ''}`}>
        {value}
      </div>
      <div className="text-[10px] text-muted-foreground mt-0.5">{sublabel}</div>
    </div>
  );
}
