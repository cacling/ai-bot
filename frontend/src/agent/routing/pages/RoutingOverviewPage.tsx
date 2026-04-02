/**
 * RoutingOverviewPage.tsx — 路由总览 dashboard
 *
 * Metric cards, queue load table, agent capacity, slow routing top list.
 * Auto-refreshes every 30s.
 */
import { useState, useEffect, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAgentContext } from '../../AgentContext';

const IX_API = '/ix-api';

interface Summary {
  total_today: number;
  assigned_count: number;
  success_rate: number;
  avg_wait_seconds: number;
  overflow_count: number;
  current_queued: number;
}

interface QueueLoad {
  queue_code: string;
  display_name_zh: string;
  work_model: string;
  status: string;
  pending: number;
  offered: number;
  assigned: number;
  max_wait_seconds: number | null;
  overflow_queue: string | null;
}

interface AgentCapacity {
  online_count: number;
  total_count: number;
  chat: { total_slots: number; used_slots: number; utilization: number };
  voice: { total_slots: number; used_slots: number; utilization: number };
  agents: { agent_id: string; active_chat: number; max_chat: number; active_voice: number; max_voice: number }[];
}

interface SlowRouting {
  interaction_id: string;
  queue_code: string | null;
  work_model: string;
  wait_seconds: number;
  assigned_agent_id: string | null;
}

export function RoutingOverviewPage() {
  const { lang } = useAgentContext();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [queueLoad, setQueueLoad] = useState<QueueLoad[]>([]);
  const [agentCap, setAgentCap] = useState<AgentCapacity | null>(null);
  const [slowList, setSlowList] = useState<SlowRouting[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [s, q, a, sl] = await Promise.all([
        fetch(`${IX_API}/api/routing/stats/summary`).then((r) => r.json()),
        fetch(`${IX_API}/api/routing/stats/queue-load`).then((r) => r.json()),
        fetch(`${IX_API}/api/routing/stats/agent-capacity`).then((r) => r.json()),
        fetch(`${IX_API}/api/routing/stats/slow-routing`).then((r) => r.json()),
      ]);
      setSummary(s);
      setQueueLoad(q.items ?? []);
      setAgentCap(a);
      setSlowList(sl.items ?? []);
    } catch {
      // silently ignore fetch errors for dashboard
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const timer = setInterval(fetchAll, 30_000);
    return () => clearInterval(timer);
  }, [fetchAll]);

  const zh = lang === 'zh';

  return (
    <div className="h-full overflow-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{zh ? '路由总览' : 'Routing Overview'}</h2>
        <Button variant="outline" size="sm" onClick={fetchAll} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          <span className="ml-1.5">{zh ? '刷新' : 'Refresh'}</span>
        </Button>
      </div>

      {/* Metric Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <MetricCard title={zh ? '今日路由量' : 'Routed Today'} value={summary.total_today} />
          <MetricCard title={zh ? '分配成功率' : 'Success Rate'} value={`${summary.success_rate}%`} />
          <MetricCard title={zh ? '平均等待(秒)' : 'Avg Wait (s)'} value={Math.round(summary.avg_wait_seconds)} />
          <MetricCard title={zh ? '溢出次数' : 'Overflows'} value={summary.overflow_count} highlight={summary.overflow_count > 0} />
          <MetricCard title={zh ? '当前排队' : 'Queued Now'} value={summary.current_queued} highlight={summary.current_queued > 5} />
          <MetricCard title={zh ? '在线坐席' : 'Online Agents'} value={agentCap?.online_count ?? 0} />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Queue Load */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">{zh ? '队列负载' : 'Queue Load'}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">{zh ? '队列' : 'Queue'}</TableHead>
                  <TableHead className="text-xs">{zh ? '模式' : 'Model'}</TableHead>
                  <TableHead className="text-xs text-right">{zh ? '排队' : 'Pending'}</TableHead>
                  <TableHead className="text-xs text-right">{zh ? '已分配' : 'Assigned'}</TableHead>
                  <TableHead className="text-xs">{zh ? '状态' : 'Status'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {queueLoad.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground text-xs py-8">
                      {zh ? '暂无队列数据' : 'No queue data'}
                    </TableCell>
                  </TableRow>
                )}
                {queueLoad.map((q) => (
                  <TableRow key={q.queue_code}>
                    <TableCell className="text-xs font-medium">{q.display_name_zh}</TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px]">{q.work_model}</Badge></TableCell>
                    <TableCell className="text-xs text-right">{q.pending}</TableCell>
                    <TableCell className="text-xs text-right">{q.assigned}</TableCell>
                    <TableCell>
                      <Badge variant={q.status === 'active' ? 'default' : 'secondary'} className="text-[10px]">
                        {q.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Agent Capacity */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">{zh ? '坐席容量' : 'Agent Capacity'}</CardTitle>
          </CardHeader>
          <CardContent>
            {agentCap && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">{zh ? '文字坐席利用率' : 'Chat Utilization'}</p>
                    <p className="text-xl font-semibold">{agentCap.chat.utilization}%</p>
                    <p className="text-[11px] text-muted-foreground">{agentCap.chat.used_slots}/{agentCap.chat.total_slots} {zh ? '槽位' : 'slots'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{zh ? '语音坐席利用率' : 'Voice Utilization'}</p>
                    <p className="text-xl font-semibold">{agentCap.voice.utilization}%</p>
                    <p className="text-[11px] text-muted-foreground">{agentCap.voice.used_slots}/{agentCap.voice.total_slots} {zh ? '槽位' : 'slots'}</p>
                  </div>
                </div>
                {agentCap.agents.length > 0 && (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">{zh ? '坐席' : 'Agent'}</TableHead>
                        <TableHead className="text-xs text-right">{zh ? '文字' : 'Chat'}</TableHead>
                        <TableHead className="text-xs text-right">{zh ? '语音' : 'Voice'}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {agentCap.agents.map((a) => (
                        <TableRow key={a.agent_id}>
                          <TableCell className="text-xs font-mono">{a.agent_id}</TableCell>
                          <TableCell className="text-xs text-right">{a.active_chat}/{a.max_chat}</TableCell>
                          <TableCell className="text-xs text-right">{a.active_voice}/{a.max_voice}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Slow Routing */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">{zh ? '慢路由 Top 10' : 'Slow Routing Top 10'}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Interaction ID</TableHead>
                <TableHead className="text-xs">{zh ? '队列' : 'Queue'}</TableHead>
                <TableHead className="text-xs">{zh ? '模式' : 'Model'}</TableHead>
                <TableHead className="text-xs text-right">{zh ? '等待(秒)' : 'Wait (s)'}</TableHead>
                <TableHead className="text-xs">{zh ? '分配坐席' : 'Agent'}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {slowList.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground text-xs py-8">
                    {zh ? '今日暂无路由记录' : 'No routing records today'}
                  </TableCell>
                </TableRow>
              )}
              {slowList.map((r) => (
                <TableRow key={r.interaction_id}>
                  <TableCell className="text-xs font-mono">{r.interaction_id.slice(0, 8)}...</TableCell>
                  <TableCell className="text-xs">{r.queue_code ?? '-'}</TableCell>
                  <TableCell><Badge variant="outline" className="text-[10px]">{r.work_model}</Badge></TableCell>
                  <TableCell className="text-xs text-right">{Math.round(r.wait_seconds)}</TableCell>
                  <TableCell className="text-xs font-mono">{r.assigned_agent_id ?? '-'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({ title, value, highlight }: { title: string; value: string | number; highlight?: boolean }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3 px-4">
        <p className="text-xs text-muted-foreground mb-1">{title}</p>
        <p className={`text-2xl font-semibold ${highlight ? 'text-destructive' : ''}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
