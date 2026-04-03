/**
 * RouteRuleConfigPage.tsx — 路由规则配置
 *
 * Rule table with CRUD, priority reorder, grayscale toggle, condition editor dialog.
 */
import { useState, useEffect, useCallback } from 'react';
import { Plus, ArrowUp, ArrowDown, Pencil, Trash2, RefreshCw } from 'lucide-react';
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

interface Plugin { plugin_id: string; name: string; display_name_zh: string; plugin_type: string; handler_module: string; timeout_ms: number; fallback_behavior: string; status: string; version: string; }
interface Binding { binding_id: string; queue_code: string; plugin_id: string; slot: string; priority_order: number; enabled: boolean; config_override_json: string | null; shadow_mode: boolean; }
interface LogEntry { log_id: number; interaction_id: string; plugin_id: string; slot: string; shadow: boolean; duration_ms: number | null; status: string; output_snapshot_json: string | null; created_at: string; }

interface RouteRule {
  rule_id: string;
  rule_name: string;
  rule_type: string;
  queue_code: string;
  condition_json: string | null;
  action_json: string | null;
  priority_order: number;
  enabled: boolean;
  grayscale_pct: number;
  version: number;
  effective_from: string | null;
  effective_to: string | null;
  created_by: string | null;
  created_at: string;
}

interface Queue {
  queue_code: string;
  display_name_zh: string;
}

interface RuleForm {
  rule_name: string;
  rule_type: string;
  queue_code: string;
  work_model: string;
  channel: string;
  priority_min: string;
  priority_max: string;
  provider: string;
  grayscale_pct: number;
  set_priority: string;
  set_routing_mode: string;
}

const EMPTY_FORM: RuleForm = {
  rule_name: '',
  rule_type: 'condition_match',
  queue_code: '',
  work_model: '',
  channel: '',
  priority_min: '',
  priority_max: '',
  provider: '',
  grayscale_pct: 100,
  set_priority: '',
  set_routing_mode: '',
};

export function RouteRuleConfigPage() {
  const { lang } = useAgentContext();
  const zh = lang === 'zh';
  const [rules, setRules] = useState<RouteRule[]>([]);
  const [queues, setQueues] = useState<Queue[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<RuleForm>(EMPTY_FORM);
  const [loading, setLoading] = useState(false);

  // ── Queue selector plugin state ──
  const [selectorPlugins, setSelectorPlugins] = useState<Plugin[]>([]);
  const [selectorBindings, setSelectorBindings] = useState<Binding[]>([]);
  const [selectedSelectorPlugin, setSelectedSelectorPlugin] = useState<Plugin | null>(null);
  const [selectorLogs, setSelectorLogs] = useState<LogEntry[]>([]);

  const fetchRules = useCallback(async () => {
    setLoading(true);
    try {
      const [rRes, qRes] = await Promise.all([
        fetch(`${IX_API}/api/routing/rules`).then((r) => r.json()),
        fetch(`${IX_API}/api/queues`).then((r) => r.json()),
      ]);
      setRules(rRes.items ?? []);
      setQueues(qRes.items ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRules(); }, [fetchRules]);

  // ── Queue selector plugin fetchers ──
  const fetchSelectorPlugins = useCallback(async () => {
    const res = await fetch(`${IX_API}/api/plugins/catalog?type=queue_selector`).then((r) => r.json());
    setSelectorPlugins(res.items ?? []);
  }, []);

  const fetchSelectorBindings = useCallback(async () => {
    const res = await fetch(`${IX_API}/api/plugins/bindings?slot=queue_selector`).then((r) => r.json());
    setSelectorBindings(res.items ?? []);
  }, []);

  const fetchSelectorLogs = useCallback(async (pluginId: string) => {
    const res = await fetch(`${IX_API}/api/plugins/logs?plugin_id=${pluginId}&slot=queue_selector&limit=20`).then((r) => r.json());
    setSelectorLogs(res.items ?? []);
  }, []);

  useEffect(() => { fetchSelectorPlugins(); fetchSelectorBindings(); }, [fetchSelectorPlugins, fetchSelectorBindings]);

  function selectSelectorPlugin(p: Plugin) {
    setSelectedSelectorPlugin(p);
    fetchSelectorLogs(p.plugin_id);
  }

  async function selectSelectorPluginById(pluginId: string) {
    const cached = selectorPlugins.find((p) => p.plugin_id === pluginId);
    if (cached) { selectSelectorPlugin(cached); return; }
    try {
      const res = await fetch(`${IX_API}/api/plugins/catalog/${pluginId}`).then((r) => r.json());
      if (res.plugin_id) selectSelectorPlugin(res as Plugin);
    } catch { /* ignore */ }
  }

  async function toggleSelectorShadow(b: Binding) {
    await fetch(`${IX_API}/api/plugins/bindings/${b.binding_id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shadow_mode: !b.shadow_mode }),
    });
    fetchSelectorBindings();
  }

  async function toggleSelectorEnabled(b: Binding) {
    await fetch(`${IX_API}/api/plugins/bindings/${b.binding_id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !b.enabled }),
    });
    fetchSelectorBindings();
  }

  function selectorPluginName(pluginId: string): string {
    return selectorPlugins.find((p) => p.plugin_id === pluginId)?.display_name_zh ?? pluginId.slice(0, 8);
  }

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(rule: RouteRule) {
    setEditingId(rule.rule_id);
    const cond = rule.condition_json ? JSON.parse(rule.condition_json) : {};
    const action = rule.action_json ? JSON.parse(rule.action_json) : {};
    setForm({
      rule_name: rule.rule_name,
      rule_type: rule.rule_type,
      queue_code: rule.queue_code,
      work_model: Array.isArray(cond.work_model) ? cond.work_model.join(',') : (cond.work_model ?? ''),
      channel: Array.isArray(cond.channel) ? cond.channel.join(',') : (cond.channel ?? ''),
      priority_min: cond.priority_range?.[0]?.toString() ?? '',
      priority_max: cond.priority_range?.[1]?.toString() ?? '',
      provider: Array.isArray(cond.provider) ? cond.provider.join(',') : (cond.provider ?? ''),
      grayscale_pct: rule.grayscale_pct,
      set_priority: action.set_priority?.toString() ?? '',
      set_routing_mode: action.set_routing_mode ?? '',
    });
    setDialogOpen(true);
  }

  async function saveRule() {
    const condObj: Record<string, unknown> = {};
    if (form.work_model) condObj.work_model = form.work_model.includes(',') ? form.work_model.split(',').map(s => s.trim()) : form.work_model;
    if (form.channel) condObj.channel = form.channel.includes(',') ? form.channel.split(',').map(s => s.trim()) : form.channel;
    if (form.priority_min || form.priority_max) condObj.priority_range = [Number(form.priority_min) || 0, Number(form.priority_max) || 100];
    if (form.provider) condObj.provider = form.provider.includes(',') ? form.provider.split(',').map(s => s.trim()) : form.provider;

    const actionObj: Record<string, unknown> = {};
    if (form.set_priority) actionObj.set_priority = Number(form.set_priority);
    if (form.set_routing_mode) actionObj.set_routing_mode = form.set_routing_mode;

    const payload = {
      rule_name: form.rule_name,
      rule_type: form.rule_type,
      queue_code: form.queue_code,
      condition_json: Object.keys(condObj).length > 0 ? JSON.stringify(condObj) : null,
      action_json: Object.keys(actionObj).length > 0 ? JSON.stringify(actionObj) : null,
      grayscale_pct: form.grayscale_pct,
    };

    if (editingId) {
      await fetch(`${IX_API}/api/routing/rules/${editingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } else {
      await fetch(`${IX_API}/api/routing/rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    }

    setDialogOpen(false);
    fetchRules();
  }

  async function toggleEnabled(rule: RouteRule) {
    await fetch(`${IX_API}/api/routing/rules/${rule.rule_id}/toggle`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !rule.enabled }),
    });
    fetchRules();
  }

  async function deleteRule(ruleId: string) {
    await fetch(`${IX_API}/api/routing/rules/${ruleId}`, { method: 'DELETE' });
    fetchRules();
  }

  async function moveRule(ruleId: string, direction: 'up' | 'down') {
    const idx = rules.findIndex((r) => r.rule_id === ruleId);
    if (idx < 0) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= rules.length) return;

    const order = rules.map((r, i) => ({
      rule_id: r.rule_id,
      priority_order: i === idx ? rules[swapIdx].priority_order : i === swapIdx ? rules[idx].priority_order : r.priority_order,
    }));

    await fetch(`${IX_API}/api/routing/rules/reorder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order }),
    });
    fetchRules();
  }

  function conditionSummary(condJson: string | null): string {
    if (!condJson) return zh ? '(无条件)' : '(no condition)';
    const c = JSON.parse(condJson);
    const parts: string[] = [];
    if (c.work_model) parts.push(`model=${Array.isArray(c.work_model) ? c.work_model.join('/') : c.work_model}`);
    if (c.channel) parts.push(`ch=${Array.isArray(c.channel) ? c.channel.join('/') : c.channel}`);
    if (c.priority_range) parts.push(`pri=${c.priority_range[0]}-${c.priority_range[1]}`);
    if (c.provider) parts.push(`prov=${Array.isArray(c.provider) ? c.provider.join('/') : c.provider}`);
    return parts.length > 0 ? parts.join(', ') : (zh ? '(无条件)' : '(no condition)');
  }

  return (
    <div className="h-full overflow-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{zh ? '路由规则配置' : 'Route Rule Configuration'}</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchRules} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus size={14} />
            <span className="ml-1.5">{zh ? '新建规则' : 'Add Rule'}</span>
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs w-12">#</TableHead>
                <TableHead className="text-xs">{zh ? '规则名称' : 'Name'}</TableHead>
                <TableHead className="text-xs">{zh ? '类型' : 'Type'}</TableHead>
                <TableHead className="text-xs">{zh ? '条件' : 'Condition'}</TableHead>
                <TableHead className="text-xs">{zh ? '目标队列' : 'Queue'}</TableHead>
                <TableHead className="text-xs text-center">{zh ? '灰度' : 'Gray%'}</TableHead>
                <TableHead className="text-xs text-center">{zh ? '状态' : 'Status'}</TableHead>
                <TableHead className="text-xs text-right">{zh ? '操作' : 'Actions'}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground text-xs py-8">
                    {zh ? '暂无规则，点击"新建规则"开始配置' : 'No rules yet. Click "Add Rule" to start.'}
                  </TableCell>
                </TableRow>
              )}
              {rules.map((rule, idx) => (
                <TableRow key={rule.rule_id} className={!rule.enabled ? 'opacity-50' : ''}>
                  <TableCell className="text-xs text-muted-foreground">{rule.priority_order}</TableCell>
                  <TableCell className="text-xs font-medium">{rule.rule_name}</TableCell>
                  <TableCell><Badge variant="outline" className="text-[10px]">{rule.rule_type}</Badge></TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-48 truncate">{conditionSummary(rule.condition_json)}</TableCell>
                  <TableCell className="text-xs font-mono">{rule.queue_code}</TableCell>
                  <TableCell className="text-xs text-center">{rule.grayscale_pct}%</TableCell>
                  <TableCell className="text-center">
                    <Checkbox
                      checked={rule.enabled}
                      onCheckedChange={() => toggleEnabled(rule)}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => moveRule(rule.rule_id, 'up')} disabled={idx === 0}>
                        <ArrowUp size={12} />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => moveRule(rule.rule_id, 'down')} disabled={idx === rules.length - 1}>
                        <ArrowDown size={12} />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(rule)}>
                        <Pencil size={12} />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => deleteRule(rule.rule_id)}>
                        <Trash2 size={12} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? (zh ? '编辑规则' : 'Edit Rule') : (zh ? '新建规则' : 'New Rule')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">{zh ? '规则名称' : 'Rule Name'}</Label>
                <Input value={form.rule_name} onChange={(e) => setForm({ ...form, rule_name: e.target.value })} placeholder="e.g. vip_to_vip_queue" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{zh ? '规则类型' : 'Rule Type'}</Label>
                <Select value={form.rule_type} onValueChange={(v) => v && setForm({ ...form, rule_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="condition_match">{zh ? '条件匹配' : 'Condition Match'}</SelectItem>
                    <SelectItem value="default_fallback">{zh ? '默认兜底' : 'Default Fallback'}</SelectItem>
                    <SelectItem value="time_based">{zh ? '时间段规则' : 'Time-based'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">{zh ? '目标队列' : 'Target Queue'}</Label>
              <Select value={form.queue_code} onValueChange={(v) => v && setForm({ ...form, queue_code: v })}>
                <SelectTrigger><SelectValue placeholder={zh ? '选择队列' : 'Select queue'} /></SelectTrigger>
                <SelectContent>
                  {queues.map((q) => (
                    <SelectItem key={q.queue_code} value={q.queue_code}>{q.display_name_zh} ({q.queue_code})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Card>
              <CardHeader className="py-2 px-3">
                <CardTitle className="text-xs">{zh ? '匹配条件' : 'Match Conditions'}</CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-[11px]">Work Model</Label>
                    <Input className="h-8 text-xs" value={form.work_model} onChange={(e) => setForm({ ...form, work_model: e.target.value })} placeholder="live_chat, live_voice" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">Channel</Label>
                    <Input className="h-8 text-xs" value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })} placeholder="web_chat, voice" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">{zh ? '优先级范围' : 'Priority Range'}</Label>
                    <div className="flex gap-1 items-center">
                      <Input className="h-8 text-xs w-16" value={form.priority_min} onChange={(e) => setForm({ ...form, priority_min: e.target.value })} placeholder="0" />
                      <span className="text-xs">-</span>
                      <Input className="h-8 text-xs w-16" value={form.priority_max} onChange={(e) => setForm({ ...form, priority_max: e.target.value })} placeholder="100" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">Provider</Label>
                    <Input className="h-8 text-xs" value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} placeholder="internal_web" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">{zh ? '灰度比例(%)' : 'Grayscale %'}</Label>
                <Input type="number" min={0} max={100} value={form.grayscale_pct} onChange={(e) => setForm({ ...form, grayscale_pct: Number(e.target.value) })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{zh ? '覆盖优先级' : 'Override Priority'}</Label>
                <Input className="h-8 text-xs" value={form.set_priority} onChange={(e) => setForm({ ...form, set_priority: e.target.value })} placeholder={zh ? '留空不覆盖' : 'Leave empty'} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{zh ? '取消' : 'Cancel'}</Button>
            <Button onClick={saveRule} disabled={!form.rule_name || !form.queue_code}>{zh ? '保存' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Queue Selector Plugins ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{zh ? '队列选择插件' : 'Queue Selector Plugins'}</CardTitle>
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
              {selectorPlugins.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground text-xs py-6">
                    {zh ? '暂无队列选择插件' : 'No queue selector plugins'}
                  </TableCell>
                </TableRow>
              )}
              {selectorPlugins.map((p) => (
                <TableRow key={p.plugin_id} className={`${selectedSelectorPlugin?.plugin_id === p.plugin_id ? 'bg-muted' : ''}`}>
                  <TableCell className="text-xs">
                    <Button variant="link" size="sm" className="h-auto p-0 text-xs font-medium" onClick={() => selectSelectorPlugin(p)}>
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

      {/* ── Selector Bindings + Detail & Logs ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Bindings list */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{zh ? '选择插件绑定' : 'Selector Bindings'}</CardTitle>
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
                {selectorBindings.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground text-xs py-6">
                      {zh ? '暂无队列选择插件绑定' : 'No selector bindings'}
                    </TableCell>
                  </TableRow>
                )}
                {selectorBindings.map((b) => {
                  const plugin = selectorPlugins.find((p) => p.plugin_id === b.plugin_id);
                  return (
                    <TableRow
                      key={b.binding_id}
                      className={`${selectedSelectorPlugin?.plugin_id === b.plugin_id ? 'bg-muted' : ''} ${!b.enabled ? 'opacity-50' : ''}`}
                    >
                      <TableCell className="text-xs">
                        <Button variant="link" size="sm" className="h-auto p-0 text-xs font-normal" onClick={() => selectSelectorPluginById(b.plugin_id)}>
                          {plugin?.display_name_zh ?? b.plugin_id.slice(0, 8)}
                        </Button>
                      </TableCell>
                      <TableCell className="text-xs text-center">{b.priority_order}</TableCell>
                      <TableCell className="text-center">
                        <Checkbox checked={b.shadow_mode} onCheckedChange={() => toggleSelectorShadow(b)} />
                      </TableCell>
                      <TableCell className="text-center">
                        <Checkbox checked={b.enabled} onCheckedChange={() => toggleSelectorEnabled(b)} />
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
              {selectedSelectorPlugin ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3 text-xs">
                  <div><span className="text-muted-foreground">Name:</span> <span className="font-mono">{selectedSelectorPlugin.name}</span></div>
                  <div><span className="text-muted-foreground">Handler:</span> <span className="font-mono">{selectedSelectorPlugin.handler_module}</span></div>
                  <div><span className="text-muted-foreground">Timeout:</span> {selectedSelectorPlugin.timeout_ms}ms</div>
                  <div><span className="text-muted-foreground">Fallback:</span> <Badge variant="outline" className="text-[10px]">{selectedSelectorPlugin.fallback_behavior}</Badge></div>
                  <div><span className="text-muted-foreground">Version:</span> {selectedSelectorPlugin.version}</div>
                  <div><span className="text-muted-foreground">Status:</span> <Badge variant={selectedSelectorPlugin.status === 'active' ? 'default' : 'secondary'} className="text-[10px]">{selectedSelectorPlugin.status}</Badge></div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">{zh ? '点击插件名称查看详情' : 'Click a plugin name to view details'}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{zh ? '最近执行日志' : 'Recent Logs'}{selectedSelectorPlugin ? ` — ${selectedSelectorPlugin.display_name_zh}` : ''}</CardTitle>
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
                  {selectorLogs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground text-xs py-6">
                        {selectedSelectorPlugin ? (zh ? '暂无执行日志' : 'No execution logs') : (zh ? '选择插件后查看日志' : 'Select a plugin to view logs')}
                      </TableCell>
                    </TableRow>
                  )}
                  {selectorLogs.map((l) => (
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
