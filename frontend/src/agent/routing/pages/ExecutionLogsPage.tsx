/**
 * ExecutionLogsPage.tsx — 执行日志与回放
 *
 * Plugin execution log search, I/O snapshot viewer, single/batch replay.
 */
import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Search, Play, ListChecks } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { useAgentContext } from '../../AgentContext';

const IX_API = '/ix-api';

interface LogEntry {
  log_id: number;
  interaction_id: string;
  plugin_id: string;
  binding_id: string | null;
  slot: string;
  shadow: boolean;
  duration_ms: number | null;
  status: string;
  error_message: string | null;
  created_at: string;
}

interface ReplayResult {
  interaction_id: string;
  original: {
    assigned_agent_id: string | null;
    queue_code: string | null;
    state: string;
  };
  replayed: {
    queue_selector_result?: { queue_code: string; reason?: string };
    would_assign?: string;
    scored_candidates: Array<{ agent_id: string; score: number; reason?: string }>;
  };
  divergence: boolean;
  divergence_summary?: string;
}

interface ReplayTask {
  task_id: string;
  task_name: string | null;
  status: string;
  total_count: number;
  completed_count: number;
  divergence_count: number;
  results_json: string | null;
  created_at: string;
}

type ActiveTab = 'logs' | 'replay';

export function ExecutionLogsPage() {
  const { lang } = useAgentContext();
  const zh = lang === 'zh';
  const [activeTab, setActiveTab] = useState<ActiveTab>('logs');

  // Logs state
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logFilters, setLogFilters] = useState({ interaction_id: '', slot: '', status: '' });
  const [loading, setLoading] = useState(false);
  const [snapshotDialog, setSnapshotDialog] = useState<{ open: boolean; input: unknown; output: unknown }>({ open: false, input: null, output: null });

  // Replay state
  const [replayInput, setReplayInput] = useState('');
  const [replayResult, setReplayResult] = useState<ReplayResult | null>(null);
  const [batchIds, setBatchIds] = useState('');
  const [batchTaskName, setBatchTaskName] = useState('');
  const [replayTasks, setReplayTasks] = useState<ReplayTask[]>([]);
  const [replaying, setReplaying] = useState(false);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (logFilters.interaction_id) params.set('interaction_id', logFilters.interaction_id);
      if (logFilters.slot) params.set('slot', logFilters.slot);
      if (logFilters.status) params.set('status', logFilters.status);
      params.set('limit', '100');

      const res = await fetch(`${IX_API}/api/routing/logs?${params}`).then((r) => r.json());
      setLogs(res.items ?? []);
    } finally {
      setLoading(false);
    }
  }, [logFilters]);

  const fetchTasks = useCallback(async () => {
    const res = await fetch(`${IX_API}/api/routing/replay/tasks`).then((r) => r.json());
    setReplayTasks(res.items ?? []);
  }, []);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);
  useEffect(() => { if (activeTab === 'replay') fetchTasks(); }, [activeTab, fetchTasks]);

  async function viewSnapshot(logId: number) {
    const res = await fetch(`${IX_API}/api/routing/logs/${logId}/snapshots`).then((r) => r.json());
    setSnapshotDialog({ open: true, input: res.input, output: res.output });
  }

  async function singleReplay() {
    if (!replayInput.trim()) return;
    setReplaying(true);
    try {
      const res = await fetch(`${IX_API}/api/routing/replay/single`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interaction_id: replayInput.trim() }),
      }).then((r) => r.json());
      setReplayResult(res);
    } finally {
      setReplaying(false);
    }
  }

  async function createBatchReplay() {
    const ids = batchIds.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
    if (ids.length === 0) return;
    setReplaying(true);
    try {
      await fetch(`${IX_API}/api/routing/replay/task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_name: batchTaskName || undefined, interaction_ids: ids }),
      });
      setBatchIds('');
      setBatchTaskName('');
      fetchTasks();
    } finally {
      setReplaying(false);
    }
  }

  return (
    <div className="h-full overflow-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{zh ? '执行日志与回放' : 'Execution Logs & Replay'}</h2>
        <div className="flex gap-2">
          <Button variant={activeTab === 'logs' ? 'default' : 'outline'} size="sm" onClick={() => setActiveTab('logs')}>
            <Search size={14} />
            <span className="ml-1.5">{zh ? '日志' : 'Logs'}</span>
          </Button>
          <Button variant={activeTab === 'replay' ? 'default' : 'outline'} size="sm" onClick={() => setActiveTab('replay')}>
            <Play size={14} />
            <span className="ml-1.5">{zh ? '回放' : 'Replay'}</span>
          </Button>
        </div>
      </div>

      {activeTab === 'logs' && (
        <>
          {/* Filters */}
          <Card>
            <CardContent className="py-3 px-4">
              <div className="flex items-end gap-3">
                <div className="space-y-1 flex-1">
                  <Label className="text-xs">Interaction ID</Label>
                  <Input className="h-8 text-xs" value={logFilters.interaction_id} onChange={(e) => setLogFilters((f) => ({ ...f, interaction_id: e.target.value }))} placeholder="uuid..." />
                </div>
                <div className="space-y-1 w-36">
                  <Label className="text-xs">Slot</Label>
                  <Select value={logFilters.slot} onValueChange={(v) => setLogFilters((f) => ({ ...f, slot: v }))}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={zh ? '全部' : 'All'} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">{zh ? '全部' : 'All'}</SelectItem>
                      <SelectItem value="queue_selector">queue_selector</SelectItem>
                      <SelectItem value="candidate_scorer">candidate_scorer</SelectItem>
                      <SelectItem value="offer_strategy">offer_strategy</SelectItem>
                      <SelectItem value="overflow_policy">overflow_policy</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 w-32">
                  <Label className="text-xs">Status</Label>
                  <Select value={logFilters.status} onValueChange={(v) => setLogFilters((f) => ({ ...f, status: v }))}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={zh ? '全部' : 'All'} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">{zh ? '全部' : 'All'}</SelectItem>
                      <SelectItem value="success">success</SelectItem>
                      <SelectItem value="timeout">timeout</SelectItem>
                      <SelectItem value="error">error</SelectItem>
                      <SelectItem value="fallback">fallback</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button size="sm" className="h-8" onClick={fetchLogs} disabled={loading}>
                  <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Log table */}
          <Card>
            <CardContent className="p-0">
              <div className="max-h-[500px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">#</TableHead>
                      <TableHead className="text-xs">Interaction</TableHead>
                      <TableHead className="text-xs">Plugin</TableHead>
                      <TableHead className="text-xs">Slot</TableHead>
                      <TableHead className="text-xs text-right">ms</TableHead>
                      <TableHead className="text-xs">{zh ? '状态' : 'Status'}</TableHead>
                      <TableHead className="text-xs">{zh ? '错误' : 'Error'}</TableHead>
                      <TableHead className="text-xs text-right">{zh ? '快照' : 'Snap'}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-muted-foreground text-xs py-8">
                          {zh ? '暂无日志' : 'No logs found'}
                        </TableCell>
                      </TableRow>
                    )}
                    {logs.map((l) => (
                      <TableRow key={l.log_id}>
                        <TableCell className="text-xs text-muted-foreground">{l.log_id}</TableCell>
                        <TableCell className="text-xs font-mono">{l.interaction_id.slice(0, 8)}...</TableCell>
                        <TableCell className="text-xs font-mono">{l.plugin_id.slice(0, 8)}...</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">
                            {l.shadow ? 'S/' : ''}{l.slot}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-right">{l.duration_ms ?? '-'}</TableCell>
                        <TableCell>
                          <Badge variant={l.status === 'success' ? 'default' : 'destructive'} className="text-[10px]">
                            {l.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-32 truncate">{l.error_message ?? '-'}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={() => viewSnapshot(l.log_id)}>
                            {zh ? '查看' : 'View'}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {activeTab === 'replay' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Single replay */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{zh ? '单条回放' : 'Single Replay'}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input className="h-8 text-xs" value={replayInput} onChange={(e) => setReplayInput(e.target.value)} placeholder="interaction_id" />
                <Button size="sm" className="h-8" onClick={singleReplay} disabled={replaying || !replayInput}>
                  <Play size={14} />
                </Button>
              </div>

              {replayResult && (
                <div className="space-y-2 text-xs">
                  <Separator />
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">{zh ? '差异:' : 'Divergence:'}</span>
                    <Badge variant={replayResult.divergence ? 'destructive' : 'default'} className="text-[10px]">
                      {replayResult.divergence ? (zh ? '有差异' : 'Diverged') : (zh ? '一致' : 'Match')}
                    </Badge>
                  </div>
                  {replayResult.divergence_summary && (
                    <p className="text-muted-foreground">{replayResult.divergence_summary}</p>
                  )}
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div>
                      <p className="font-medium mb-1">{zh ? '原始结果' : 'Original'}</p>
                      <p>Agent: <span className="font-mono">{replayResult.original.assigned_agent_id ?? 'none'}</span></p>
                      <p>Queue: <span className="font-mono">{replayResult.original.queue_code ?? '-'}</span></p>
                      <p>State: {replayResult.original.state}</p>
                    </div>
                    <div>
                      <p className="font-medium mb-1">{zh ? '回放结果' : 'Replayed'}</p>
                      <p>Agent: <span className="font-mono">{replayResult.replayed.would_assign ?? 'none'}</span></p>
                      <p>Queue: <span className="font-mono">{replayResult.replayed.queue_selector_result?.queue_code ?? '-'}</span></p>
                      {replayResult.replayed.scored_candidates.length > 0 && (
                        <div className="mt-1">
                          <p className="text-muted-foreground">{zh ? '评分:' : 'Scores:'}</p>
                          {replayResult.replayed.scored_candidates.slice(0, 3).map((sc) => (
                            <p key={sc.agent_id} className="font-mono">{sc.agent_id.slice(-3)}: {sc.score} {sc.reason ? `(${sc.reason})` : ''}</p>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Batch replay */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{zh ? '批量回放' : 'Batch Replay'}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">{zh ? '任务名称' : 'Task Name'}</Label>
                <Input className="h-8 text-xs" value={batchTaskName} onChange={(e) => setBatchTaskName(e.target.value)} placeholder={zh ? '可选' : 'Optional'} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{zh ? 'Interaction IDs (每行一个或逗号分隔)' : 'Interaction IDs (one per line or comma separated)'}</Label>
                <Textarea className="text-xs h-20 font-mono" value={batchIds} onChange={(e) => setBatchIds(e.target.value)} placeholder="uuid1&#10;uuid2&#10;uuid3" />
              </div>
              <Button size="sm" onClick={createBatchReplay} disabled={replaying || !batchIds.trim()}>
                <ListChecks size={14} />
                <span className="ml-1.5">{zh ? '创建回放任务' : 'Create Task'}</span>
              </Button>
            </CardContent>
          </Card>

          {/* Replay task list */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm">{zh ? '回放任务列表' : 'Replay Tasks'}</CardTitle>
              <Button variant="ghost" size="sm" className="h-7" onClick={fetchTasks}>
                <RefreshCw size={12} />
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">{zh ? '任务' : 'Task'}</TableHead>
                    <TableHead className="text-xs">{zh ? '状态' : 'Status'}</TableHead>
                    <TableHead className="text-xs text-right">{zh ? '总数' : 'Total'}</TableHead>
                    <TableHead className="text-xs text-right">{zh ? '完成' : 'Done'}</TableHead>
                    <TableHead className="text-xs text-right">{zh ? '差异' : 'Diverged'}</TableHead>
                    <TableHead className="text-xs">{zh ? '创建时间' : 'Created'}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {replayTasks.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground text-xs py-6">
                        {zh ? '暂无回放任务' : 'No replay tasks'}
                      </TableCell>
                    </TableRow>
                  )}
                  {replayTasks.map((t) => (
                    <TableRow key={t.task_id}>
                      <TableCell className="text-xs">{t.task_name ?? t.task_id.slice(0, 8)}</TableCell>
                      <TableCell>
                        <Badge variant={t.status === 'completed' ? 'default' : t.status === 'failed' ? 'destructive' : 'secondary'} className="text-[10px]">
                          {t.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-right">{t.total_count}</TableCell>
                      <TableCell className="text-xs text-right">{t.completed_count}</TableCell>
                      <TableCell className="text-xs text-right font-medium">
                        {t.divergence_count > 0 ? <span className="text-destructive">{t.divergence_count}</span> : '0'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(t.created_at).toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Snapshot Dialog */}
      <Dialog open={snapshotDialog.open} onOpenChange={(o) => setSnapshotDialog((p) => ({ ...p, open: o }))}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>{zh ? '执行快照' : 'Execution Snapshot'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-medium mb-1">Input</h4>
              <pre className="text-xs bg-muted p-3 rounded-md overflow-auto max-h-48">{JSON.stringify(snapshotDialog.input, null, 2) ?? 'null'}</pre>
            </div>
            <div>
              <h4 className="text-sm font-medium mb-1">Output</h4>
              <pre className="text-xs bg-muted p-3 rounded-md overflow-auto max-h-48">{JSON.stringify(snapshotDialog.output, null, 2) ?? 'null'}</pre>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
