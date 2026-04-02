/**
 * OverflowStrategyPage.tsx — 溢出与降级策略
 *
 * Per-queue overflow config (max_wait, overflow_queue chain) + overflow_policy plugin bindings.
 */
import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, ArrowRight, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

interface Queue {
  queue_code: string;
  display_name_zh: string;
  display_name_en: string;
  work_model: string;
  priority: number;
  max_wait_seconds: number | null;
  overflow_queue: string | null;
  status: string;
}

interface Binding {
  binding_id: string;
  queue_code: string;
  plugin_id: string;
  slot: string;
  priority_order: number;
  enabled: boolean;
  shadow_mode: boolean;
}

interface Plugin {
  plugin_id: string;
  name: string;
  display_name_zh: string;
  plugin_type: string;
}

export function OverflowStrategyPage() {
  const { lang } = useAgentContext();
  const zh = lang === 'zh';
  const [queues, setQueues] = useState<Queue[]>([]);
  const [selectedQueue, setSelectedQueue] = useState<string>('');
  const [editMaxWait, setEditMaxWait] = useState('');
  const [editOverflowQueue, setEditOverflowQueue] = useState('');
  const [bindings, setBindings] = useState<Binding[]>([]);
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchQueues = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${IX_API}/api/queues`).then((r) => r.json());
      setQueues(res.items ?? []);
      if (!selectedQueue && res.items?.length) {
        setSelectedQueue(res.items[0].queue_code);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchPlugins = useCallback(async () => {
    const res = await fetch(`${IX_API}/api/plugins/catalog?type=overflow_policy`).then((r) => r.json());
    setPlugins(res.items ?? []);
  }, []);

  const fetchBindings = useCallback(async () => {
    if (!selectedQueue) return;
    const res = await fetch(`${IX_API}/api/plugins/bindings?queue_code=${selectedQueue}&slot=overflow_policy`).then((r) => r.json());
    setBindings(res.items ?? []);
  }, [selectedQueue]);

  useEffect(() => { fetchQueues(); fetchPlugins(); }, [fetchQueues, fetchPlugins]);

  useEffect(() => {
    if (selectedQueue) {
      const q = queues.find((q) => q.queue_code === selectedQueue);
      if (q) {
        setEditMaxWait(q.max_wait_seconds?.toString() ?? '300');
        setEditOverflowQueue(q.overflow_queue ?? '');
      }
      fetchBindings();
    }
  }, [selectedQueue, queues, fetchBindings]);

  async function saveOverflowConfig() {
    setSaving(true);
    try {
      await fetch(`${IX_API}/api/queues/${selectedQueue}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          max_wait_seconds: Number(editMaxWait) || 300,
          overflow_queue: editOverflowQueue || null,
        }),
      });
      fetchQueues();
    } finally {
      setSaving(false);
    }
  }

  // Build overflow chain for visualization
  function buildChain(startCode: string): string[] {
    const chain: string[] = [startCode];
    const visited = new Set<string>([startCode]);
    let current = startCode;
    while (true) {
      const q = queues.find((q) => q.queue_code === current);
      if (!q?.overflow_queue || visited.has(q.overflow_queue)) break;
      chain.push(q.overflow_queue);
      visited.add(q.overflow_queue);
      current = q.overflow_queue;
    }
    return chain;
  }

  function pluginName(pluginId: string): string {
    return plugins.find((p) => p.plugin_id === pluginId)?.display_name_zh ?? pluginId.slice(0, 8);
  }

  async function toggleBindingEnabled(b: Binding) {
    await fetch(`${IX_API}/api/plugins/bindings/${b.binding_id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !b.enabled }),
    });
    fetchBindings();
  }

  const chain = selectedQueue ? buildChain(selectedQueue) : [];
  const currentQueue = queues.find((q) => q.queue_code === selectedQueue);

  return (
    <div className="h-full overflow-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{zh ? '溢出与降级策略' : 'Overflow & Degradation'}</h2>
        <Button variant="outline" size="sm" onClick={fetchQueues} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Queue list */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{zh ? '队列列表' : 'Queues'}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">{zh ? '队列' : 'Queue'}</TableHead>
                  <TableHead className="text-xs text-right">{zh ? '等待(秒)' : 'Wait(s)'}</TableHead>
                  <TableHead className="text-xs">{zh ? '溢出' : 'Overflow'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {queues.map((q) => (
                  <TableRow
                    key={q.queue_code}
                    className={`cursor-pointer ${selectedQueue === q.queue_code ? 'bg-muted' : ''}`}
                    onClick={() => setSelectedQueue(q.queue_code)}
                  >
                    <TableCell className="text-xs font-medium">{q.display_name_zh}</TableCell>
                    <TableCell className="text-xs text-right">{q.max_wait_seconds ?? '-'}</TableCell>
                    <TableCell className="text-xs font-mono">{q.overflow_queue ?? '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Overflow config editor */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              {currentQueue ? `${currentQueue.display_name_zh} — ${zh ? '溢出配置' : 'Overflow Config'}` : (zh ? '选择队列' : 'Select a queue')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {currentQueue && (
              <>
                {/* Overflow chain visualization */}
                {chain.length > 1 && (
                  <div className="flex items-center gap-2 flex-wrap p-3 bg-muted/50 rounded-md">
                    {chain.map((code, i) => {
                      const q = queues.find((q) => q.queue_code === code);
                      return (
                        <span key={code} className="flex items-center gap-2">
                          {i > 0 && <ArrowRight size={14} className="text-muted-foreground" />}
                          <Badge variant={code === selectedQueue ? 'default' : 'outline'} className="text-[11px]">
                            {q?.display_name_zh ?? code}
                          </Badge>
                        </span>
                      );
                    })}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">{zh ? '最大等待时长(秒)' : 'Max Wait (seconds)'}</Label>
                    <Input type="number" value={editMaxWait} onChange={(e) => setEditMaxWait(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{zh ? '溢出目标队列' : 'Overflow Queue'}</Label>
                    <Select value={editOverflowQueue} onValueChange={setEditOverflowQueue}>
                      <SelectTrigger><SelectValue placeholder={zh ? '无溢出' : 'None'} /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">{zh ? '(无)' : '(None)'}</SelectItem>
                        {queues.filter((q) => q.queue_code !== selectedQueue).map((q) => (
                          <SelectItem key={q.queue_code} value={q.queue_code}>{q.display_name_zh}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Button size="sm" onClick={saveOverflowConfig} disabled={saving}>
                  <Save size={14} />
                  <span className="ml-1.5">{zh ? '保存配置' : 'Save'}</span>
                </Button>

                {/* Overflow policy plugin bindings */}
                <div className="pt-2">
                  <h4 className="text-xs font-medium text-muted-foreground mb-2">{zh ? '溢出策略插件' : 'Overflow Policy Plugins'}</h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">{zh ? '插件' : 'Plugin'}</TableHead>
                        <TableHead className="text-xs text-center">{zh ? '顺序' : 'Order'}</TableHead>
                        <TableHead className="text-xs text-center">{zh ? '启用' : 'Enabled'}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bindings.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center text-muted-foreground text-xs py-4">
                            {zh ? '使用默认溢出策略(等待)' : 'Using default overflow policy (wait)'}
                          </TableCell>
                        </TableRow>
                      )}
                      {bindings.map((b) => (
                        <TableRow key={b.binding_id}>
                          <TableCell className="text-xs">{pluginName(b.plugin_id)}</TableCell>
                          <TableCell className="text-xs text-center">{b.priority_order}</TableCell>
                          <TableCell className="text-center">
                            <Checkbox checked={b.enabled} onCheckedChange={() => toggleBindingEnabled(b)} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
