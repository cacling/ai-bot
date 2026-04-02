/**
 * RoutingMonitorPage.tsx — 实时路由监控
 *
 * Live interaction table with manual intervention actions.
 * Auto-refreshes every 10s.
 */
import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, RotateCcw, ArrowRightLeft, UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
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

interface LiveInteraction {
  interaction_id: string;
  conversation_id: string;
  work_model: string;
  queue_code: string | null;
  priority: number;
  state: string;
  assigned_agent_id: string | null;
  routing_mode: string;
  wait_seconds: number;
}

interface Queue { queue_code: string; display_name_zh: string; }
interface Agent { agent_id: string; active_chat: number; max_chat: number; active_voice: number; max_voice: number; }

const STATE_COLORS: Record<string, string> = {
  created: 'bg-yellow-100 text-yellow-800',
  queued: 'bg-orange-100 text-orange-800',
  offered: 'bg-blue-100 text-blue-800',
  assigned: 'bg-green-100 text-green-800',
  active: 'bg-emerald-100 text-emerald-800',
};

export function RoutingMonitorPage() {
  const { lang } = useAgentContext();
  const zh = lang === 'zh';
  const [interactions, setInteractions] = useState<LiveInteraction[]>([]);
  const [queues, setQueues] = useState<Queue[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [filterQueue, setFilterQueue] = useState<string>('');
  const [loading, setLoading] = useState(false);

  // Dialogs
  const [reassignDialog, setReassignDialog] = useState<{ open: boolean; interactionId: string; queueCode: string }>({ open: false, interactionId: '', queueCode: '' });
  const [forceAssignDialog, setForceAssignDialog] = useState<{ open: boolean; interactionId: string; agentId: string }>({ open: false, interactionId: '', agentId: '' });

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const queueParam = filterQueue ? `?queue_code=${filterQueue}` : '';
      const [liveRes, qRes, aRes] = await Promise.all([
        fetch(`${IX_API}/api/routing/monitor/live${queueParam}`).then((r) => r.json()),
        fetch(`${IX_API}/api/queues`).then((r) => r.json()),
        fetch(`${IX_API}/api/routing/stats/agent-capacity`).then((r) => r.json()),
      ]);
      setInteractions(liveRes.items ?? []);
      setQueues(qRes.items ?? []);
      setAgents(aRes.agents ?? []);
    } finally {
      setLoading(false);
    }
  }, [filterQueue]);

  useEffect(() => {
    fetchAll();
    const timer = setInterval(fetchAll, 10_000);
    return () => clearInterval(timer);
  }, [fetchAll]);

  async function retryRouting(interactionId: string) {
    await fetch(`${IX_API}/api/routing/monitor/retry/${interactionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    fetchAll();
  }

  async function confirmReassign() {
    await fetch(`${IX_API}/api/routing/monitor/reassign/${reassignDialog.interactionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ queue_code: reassignDialog.queueCode }),
    });
    setReassignDialog({ open: false, interactionId: '', queueCode: '' });
    fetchAll();
  }

  async function confirmForceAssign() {
    await fetch(`${IX_API}/api/routing/monitor/force-assign/${forceAssignDialog.interactionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent_id: forceAssignDialog.agentId }),
    });
    setForceAssignDialog({ open: false, interactionId: '', agentId: '' });
    fetchAll();
  }

  function formatWait(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  }

  const canRetry = (state: string) => state === 'queued' || state === 'created';
  const canReassign = (state: string) => ['created', 'queued', 'offered'].includes(state);
  const canForceAssign = (state: string) => ['created', 'queued', 'offered'].includes(state);

  return (
    <div className="h-full overflow-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{zh ? '实时路由监控' : 'Real-time Routing Monitor'}</h2>
        <div className="flex items-center gap-3">
          <Select value={filterQueue} onValueChange={setFilterQueue}>
            <SelectTrigger className="w-48 h-8 text-xs">
              <SelectValue placeholder={zh ? '全部队列' : 'All queues'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">{zh ? '全部队列' : 'All queues'}</SelectItem>
              {queues.map((q) => (
                <SelectItem key={q.queue_code} value={q.queue_code}>{q.display_name_zh}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={fetchAll} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Live interactions table */}
        <Card className="lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              {zh ? `活跃 Interactions (${interactions.length})` : `Active Interactions (${interactions.length})`}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-[600px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">ID</TableHead>
                    <TableHead className="text-xs">{zh ? '状态' : 'State'}</TableHead>
                    <TableHead className="text-xs">{zh ? '队列' : 'Queue'}</TableHead>
                    <TableHead className="text-xs">{zh ? '模式' : 'Model'}</TableHead>
                    <TableHead className="text-xs text-right">{zh ? '等待' : 'Wait'}</TableHead>
                    <TableHead className="text-xs">{zh ? '坐席' : 'Agent'}</TableHead>
                    <TableHead className="text-xs text-right">{zh ? '操作' : 'Actions'}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {interactions.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground text-xs py-8">
                        {zh ? '当前无活跃路由任务' : 'No active routing tasks'}
                      </TableCell>
                    </TableRow>
                  )}
                  {interactions.map((ix) => (
                    <TableRow key={ix.interaction_id}>
                      <TableCell className="text-xs font-mono">{ix.interaction_id.slice(0, 8)}...</TableCell>
                      <TableCell>
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${STATE_COLORS[ix.state] ?? 'bg-gray-100 text-gray-800'}`}>
                          {ix.state}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs">{ix.queue_code ?? '-'}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px]">{ix.work_model}</Badge></TableCell>
                      <TableCell className="text-xs text-right font-mono">{formatWait(ix.wait_seconds)}</TableCell>
                      <TableCell className="text-xs font-mono">{ix.assigned_agent_id ?? '-'}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {canRetry(ix.state) && (
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => retryRouting(ix.interaction_id)}>
                              <RotateCcw size={12} />
                            </Button>
                          )}
                          {canReassign(ix.state) && (
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setReassignDialog({ open: true, interactionId: ix.interaction_id, queueCode: ix.queue_code ?? '' })}>
                              <ArrowRightLeft size={12} />
                            </Button>
                          )}
                          {canForceAssign(ix.state) && (
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setForceAssignDialog({ open: true, interactionId: ix.interaction_id, agentId: '' })}>
                              <UserCheck size={12} />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Agent capacity sidebar */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{zh ? '在线坐席' : 'Online Agents'}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">{zh ? '坐席' : 'Agent'}</TableHead>
                  <TableHead className="text-xs text-right">{zh ? '文字' : 'Chat'}</TableHead>
                  <TableHead className="text-xs text-right">{zh ? '语音' : 'Voice'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {agents.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground text-xs py-4">
                      {zh ? '暂无在线坐席' : 'No agents online'}
                    </TableCell>
                  </TableRow>
                )}
                {agents.map((a) => (
                  <TableRow key={a.agent_id}>
                    <TableCell className="text-xs font-mono">{a.agent_id.replace('agent-demo-', '')}</TableCell>
                    <TableCell className="text-xs text-right">{a.active_chat}/{a.max_chat}</TableCell>
                    <TableCell className="text-xs text-right">{a.active_voice}/{a.max_voice}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Reassign Dialog */}
      <Dialog open={reassignDialog.open} onOpenChange={(o) => setReassignDialog((p) => ({ ...p, open: o }))}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{zh ? '改队列' : 'Reassign Queue'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">{zh ? '目标队列' : 'Target Queue'}</Label>
              <Select value={reassignDialog.queueCode} onValueChange={(v) => setReassignDialog((p) => ({ ...p, queueCode: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {queues.map((q) => (
                    <SelectItem key={q.queue_code} value={q.queue_code}>{q.display_name_zh}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReassignDialog((p) => ({ ...p, open: false }))}>{zh ? '取消' : 'Cancel'}</Button>
            <Button onClick={confirmReassign} disabled={!reassignDialog.queueCode}>{zh ? '确认' : 'Confirm'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Force Assign Dialog */}
      <Dialog open={forceAssignDialog.open} onOpenChange={(o) => setForceAssignDialog((p) => ({ ...p, open: o }))}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{zh ? '强制指派' : 'Force Assign'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">{zh ? '目标坐席' : 'Target Agent'}</Label>
              <Select value={forceAssignDialog.agentId} onValueChange={(v) => setForceAssignDialog((p) => ({ ...p, agentId: v }))}>
                <SelectTrigger><SelectValue placeholder={zh ? '选择坐席' : 'Select agent'} /></SelectTrigger>
                <SelectContent>
                  {agents.map((a) => (
                    <SelectItem key={a.agent_id} value={a.agent_id}>
                      {a.agent_id} ({a.active_chat}/{a.max_chat})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setForceAssignDialog((p) => ({ ...p, open: false }))}>{zh ? '取消' : 'Cancel'}</Button>
            <Button onClick={confirmForceAssign} disabled={!forceAssignDialog.agentId}>{zh ? '确认指派' : 'Confirm'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
