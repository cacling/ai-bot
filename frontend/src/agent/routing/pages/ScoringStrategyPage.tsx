/**
 * ScoringStrategyPage.tsx — 打分策略管理
 *
 * Per-queue candidate_scorer plugin binding management.
 * Reuses existing plugin catalog + binding + execution log APIs.
 */
import { useState, useEffect, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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

interface Queue { queue_code: string; display_name_zh: string; }
interface Plugin { plugin_id: string; name: string; display_name_zh: string; plugin_type: string; handler_module: string; timeout_ms: number; fallback_behavior: string; status: string; version: string; }
interface Binding { binding_id: string; queue_code: string; plugin_id: string; slot: string; priority_order: number; enabled: boolean; config_override_json: string | null; shadow_mode: boolean; }
interface LogEntry { log_id: number; interaction_id: string; plugin_id: string; slot: string; shadow: boolean; duration_ms: number | null; status: string; output_snapshot_json: string | null; created_at: string; }

export function ScoringStrategyPage() {
  const { lang } = useAgentContext();
  const zh = lang === 'zh';
  const [queues, setQueues] = useState<Queue[]>([]);
  const [selectedQueue, setSelectedQueue] = useState<string>('');
  const [scorerPlugins, setScorerPlugins] = useState<Plugin[]>([]);
  const [bindings, setBindings] = useState<Binding[]>([]);
  const [selectedPlugin, setSelectedPlugin] = useState<Plugin | null>(null);
  const [recentLogs, setRecentLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchQueues = useCallback(async () => {
    const res = await fetch(`${IX_API}/api/queues`).then((r) => r.json());
    setQueues(res.items ?? []);
    if (!selectedQueue && res.items?.length) setSelectedQueue(res.items[0].queue_code);
  }, []);

  const fetchScorers = useCallback(async () => {
    const res = await fetch(`${IX_API}/api/plugins/catalog?type=candidate_scorer`).then((r) => r.json());
    setScorerPlugins(res.items ?? []);
  }, []);

  const fetchBindings = useCallback(async () => {
    if (!selectedQueue) return;
    setLoading(true);
    try {
      const res = await fetch(`${IX_API}/api/plugins/bindings?queue_code=${selectedQueue}&slot=candidate_scorer`).then((r) => r.json());
      setBindings(res.items ?? []);
    } finally {
      setLoading(false);
    }
  }, [selectedQueue]);

  const fetchLogs = useCallback(async (pluginId: string) => {
    const res = await fetch(`${IX_API}/api/plugins/logs?plugin_id=${pluginId}&slot=candidate_scorer&limit=20`).then((r) => r.json());
    setRecentLogs(res.items ?? []);
  }, []);

  useEffect(() => { fetchQueues(); fetchScorers(); }, [fetchQueues, fetchScorers]);
  useEffect(() => { fetchBindings(); }, [fetchBindings]);

  function selectPlugin(p: Plugin) {
    setSelectedPlugin(p);
    fetchLogs(p.plugin_id);
  }

  async function selectPluginById(pluginId: string) {
    const cached = scorerPlugins.find((p) => p.plugin_id === pluginId);
    if (cached) { selectPlugin(cached); return; }
    try {
      const res = await fetch(`${IX_API}/api/plugins/catalog/${pluginId}`).then((r) => r.json());
      if (res.plugin_id) selectPlugin(res as Plugin);
    } catch { /* ignore */ }
  }

  async function toggleShadow(b: Binding) {
    await fetch(`${IX_API}/api/plugins/bindings/${b.binding_id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shadow_mode: !b.shadow_mode }),
    });
    fetchBindings();
  }

  async function toggleEnabled(b: Binding) {
    await fetch(`${IX_API}/api/plugins/bindings/${b.binding_id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !b.enabled }),
    });
    fetchBindings();
  }

  function pluginName(pluginId: string): string {
    return scorerPlugins.find((p) => p.plugin_id === pluginId)?.display_name_zh ?? pluginId.slice(0, 8);
  }

  return (
    <div className="h-full overflow-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{zh ? '打分策略管理' : 'Scoring Strategy'}</h2>
        <div className="flex items-center gap-3">
          <Select value={selectedQueue} onValueChange={(v) => v && setSelectedQueue(v)}>
            <SelectTrigger className="w-48 h-8 text-xs">
              <SelectValue placeholder={zh ? '选择队列' : 'Select queue'} />
            </SelectTrigger>
            <SelectContent>
              {queues.map((q) => (
                <SelectItem key={q.queue_code} value={q.queue_code}>{q.display_name_zh}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={fetchBindings} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </Button>
        </div>
      </div>

      {/* ── Row 1: Scorer Plugin Catalog (overview) ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{zh ? '评分插件目录' : 'Scorer Plugin Catalog'}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">{zh ? '名称' : 'Name'}</TableHead>
                <TableHead className="text-xs">Handler</TableHead>
                <TableHead className="text-xs">Timeout</TableHead>
                <TableHead className="text-xs">Fallback</TableHead>
                <TableHead className="text-xs">{zh ? '状态' : 'Status'}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {scorerPlugins.map((p) => (
                <TableRow key={p.plugin_id} className={`${selectedPlugin?.plugin_id === p.plugin_id ? 'bg-muted' : ''}`}>
                  <TableCell className="text-xs">
                    <Button variant="link" size="sm" className="h-auto p-0 text-xs font-medium" onClick={() => selectPlugin(p)}>
                      {p.display_name_zh}
                    </Button>
                  </TableCell>
                  <TableCell className="text-xs font-mono">{p.handler_module}</TableCell>
                  <TableCell className="text-xs">{p.timeout_ms}ms</TableCell>
                  <TableCell className="text-xs">{p.fallback_behavior}</TableCell>
                  <TableCell><Badge variant={p.status === 'active' ? 'default' : 'secondary'} className="text-[10px]">{p.status}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ── Row 2: Bindings (1/3) + Detail & Logs (2/3) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Bindings list */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{zh ? '队列绑定' : 'Queue Bindings'}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">{zh ? '插件' : 'Plugin'}</TableHead>
                  <TableHead className="text-xs text-center">{zh ? '顺序' : 'Order'}</TableHead>
                  <TableHead className="text-xs text-center">Shadow</TableHead>
                  <TableHead className="text-xs text-center">{zh ? '启用' : 'On'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bindings.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground text-xs py-6">
                      {zh ? '该队列暂无评分插件' : 'No scorer bindings'}
                    </TableCell>
                  </TableRow>
                )}
                {bindings.map((b) => {
                  const plugin = scorerPlugins.find((p) => p.plugin_id === b.plugin_id);
                  return (
                    <TableRow
                      key={b.binding_id}
                      className={`${selectedPlugin?.plugin_id === b.plugin_id ? 'bg-muted' : ''} ${!b.enabled ? 'opacity-50' : ''}`}
                    >
                      <TableCell className="text-xs">
                        <Button variant="link" size="sm" className="h-auto p-0 text-xs font-normal" onClick={() => selectPluginById(b.plugin_id)}>
                          {plugin?.display_name_zh ?? b.plugin_id.slice(0, 8)}
                        </Button>
                      </TableCell>
                      <TableCell className="text-xs text-center">{b.priority_order}</TableCell>
                      <TableCell className="text-center">
                        <Checkbox checked={b.shadow_mode} onCheckedChange={() => toggleShadow(b)} />
                      </TableCell>
                      <TableCell className="text-center">
                        <Checkbox checked={b.enabled} onCheckedChange={() => toggleEnabled(b)} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Plugin detail + Recent logs */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{zh ? '插件详情' : 'Plugin Detail'}</CardTitle>
            </CardHeader>
            <CardContent>
              {selectedPlugin ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3 text-xs">
                  <div><span className="text-muted-foreground">Name:</span> <span className="font-mono">{selectedPlugin.name}</span></div>
                  <div><span className="text-muted-foreground">Handler:</span> <span className="font-mono">{selectedPlugin.handler_module}</span></div>
                  <div><span className="text-muted-foreground">Timeout:</span> {selectedPlugin.timeout_ms}ms</div>
                  <div><span className="text-muted-foreground">Fallback:</span> <Badge variant="outline" className="text-[10px]">{selectedPlugin.fallback_behavior}</Badge></div>
                  <div><span className="text-muted-foreground">Version:</span> {selectedPlugin.version}</div>
                  <div><span className="text-muted-foreground">Status:</span> <Badge variant={selectedPlugin.status === 'active' ? 'default' : 'secondary'} className="text-[10px]">{selectedPlugin.status}</Badge></div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">{zh ? '点击插件名称查看详情' : 'Click a plugin name to view details'}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{zh ? '最近执行日志' : 'Recent Logs'}{selectedPlugin ? ` — ${selectedPlugin.display_name_zh}` : ''}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Interaction</TableHead>
                    <TableHead className="text-xs text-right">ms</TableHead>
                    <TableHead className="text-xs">{zh ? '状态' : 'Status'}</TableHead>
                    <TableHead className="text-xs">{zh ? '时间' : 'Time'}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentLogs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground text-xs py-6">
                        {selectedPlugin ? (zh ? '暂无执行日志' : 'No execution logs') : (zh ? '选择插件后查看日志' : 'Select a plugin to view logs')}
                      </TableCell>
                    </TableRow>
                  )}
                  {recentLogs.map((l) => (
                    <TableRow key={l.log_id}>
                      <TableCell className="text-xs font-mono">{l.interaction_id.slice(0, 12)}...</TableCell>
                      <TableCell className="text-xs text-right">{l.duration_ms ?? '-'}</TableCell>
                      <TableCell>
                        <Badge variant={l.status === 'success' ? 'default' : 'destructive'} className="text-[10px]">
                          {l.shadow ? 'shadow/' : ''}{l.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(l.created_at).toLocaleTimeString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
