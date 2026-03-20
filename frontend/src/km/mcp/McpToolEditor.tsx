/**
 * McpToolEditor.tsx — MCP 工具编辑弹窗（新架构）
 *
 * 4 个 Tab：基本信息 / 执行配置 / Mock 规则 / 测试
 */
import React, { useState, useEffect } from 'react';
import { Save, X, Plus, Trash2, Settings2, Info, Database, FlaskConical } from 'lucide-react';
import { mcpApi, type McpToolRecord, type McpServer, type McpResource, type MockRule } from './api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface Props {
  toolId: string;
  onClose: () => void;
  onUpdated?: () => void;
}

export function McpToolEditor({ toolId, onClose, onUpdated }: Props) {
  const [tool, setTool] = useState<McpToolRecord | null>(null);
  const [servers, setServers] = useState<McpServer[]>([]);
  const [resources, setResources] = useState<McpResource[]>([]);

  useEffect(() => {
    Promise.all([
      mcpApi.getTool(toolId),
      mcpApi.listServers(),
      mcpApi.listResources(),
    ]).then(([t, s, r]) => {
      setTool(t);
      setServers(s.items);
      setResources(r.items);
    }).catch(console.error);
  }, [toolId]);

  if (!tool) return null;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-[860px] max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 py-4 border-b flex-shrink-0">
          <DialogTitle className="text-sm font-semibold font-mono">{tool.name}</DialogTitle>
          <div className="text-[11px] text-muted-foreground">
            Server: {servers.find(s => s.id === tool.server_id)?.name ?? '未分配'}
            {tool.skills && tool.skills.length > 0 && (
              <span className="ml-2">· Skill: {tool.skills.join(', ')}</span>
            )}
          </div>
        </DialogHeader>

        <Tabs defaultValue="info" className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="w-full justify-start rounded-none border-b bg-transparent h-auto p-0">
            <TabsTrigger value="info" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none gap-1.5 text-xs">
              <Info size={12} /> 基本信息
            </TabsTrigger>
            <TabsTrigger value="execution" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none gap-1.5 text-xs">
              <Settings2 size={12} /> 执行配置
            </TabsTrigger>
            <TabsTrigger value="mock" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none gap-1.5 text-xs">
              <Database size={12} /> Mock 规则
            </TabsTrigger>
            <TabsTrigger value="test" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none gap-1.5 text-xs">
              <FlaskConical size={12} /> 测试
            </TabsTrigger>
          </TabsList>

          <TabsContent value="info" className="flex-1 overflow-auto mt-0 p-6">
            <InfoTab tool={tool} servers={servers} onUpdated={() => { mcpApi.getTool(toolId).then(setTool); onUpdated?.(); }} />
          </TabsContent>
          <TabsContent value="execution" className="flex-1 overflow-auto mt-0 p-6">
            <ExecutionTab tool={tool} resources={resources.filter(r => r.server_id === tool.server_id)} onUpdated={() => { mcpApi.getTool(toolId).then(setTool); onUpdated?.(); }} />
          </TabsContent>
          <TabsContent value="mock" className="flex-1 overflow-auto mt-0 p-6">
            <MockTab tool={tool} onUpdated={() => { mcpApi.getTool(toolId).then(setTool); onUpdated?.(); }} />
          </TabsContent>
          <TabsContent value="test" className="flex-1 overflow-auto mt-0 p-6">
            <TestTab tool={tool} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// ── Info Tab ─────────────────────────────────────────────────────────────────

function InfoTab({ tool, servers, onUpdated }: { tool: McpToolRecord; servers: McpServer[]; onUpdated: () => void }) {
  const [name, setName] = useState(tool.name);
  const [description, setDescription] = useState(tool.description);
  const [serverId, setServerId] = useState(tool.server_id ?? '' as string);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await mcpApi.updateTool(tool.id, { name, description, server_id: serverId || undefined } as any);
      onUpdated();
    } catch (e) { alert(`保存失败: ${e}`); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">工具名</label>
          <Input value={name} onChange={e => setName(e.target.value)} className="text-xs font-mono" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">所属 Server</label>
          <Select value={serverId} onValueChange={v => { if (v) setServerId(v); }}>
            <SelectTrigger className="text-xs h-8">
              <SelectValue placeholder="选择 Server">{servers.find(s => s.id === serverId)?.name ?? serverId}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {servers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">描述</label>
        <Input value={description} onChange={e => setDescription(e.target.value)} className="text-xs" />
      </div>

      {tool.skills && tool.skills.length > 0 && (
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">关联 Skill</label>
          <div className="flex gap-1.5">{tool.skills.map(s => <Badge key={s} variant="secondary">{s}</Badge>)}</div>
        </div>
      )}

      <div className="pt-2 border-t">
        <Button size="sm" onClick={handleSave} disabled={saving}><Save size={12} /> {saving ? '保存中...' : '保存'}</Button>
      </div>
    </div>
  );
}

// ── Execution Config Tab ─────────────────────────────────────────────────────

function ExecutionTab({ tool, resources, onUpdated }: { tool: McpToolRecord; resources: McpResource[]; onUpdated: () => void }) {
  const existingConfig = tool.execution_config ? JSON.parse(tool.execution_config) as Record<string, any> : null;

  const [implType, setImplType] = useState<string>(existingConfig?.impl_type ?? '');
  const [resourceId, setResourceId] = useState<string>(existingConfig?.resource_id ?? '');
  // DB config
  const [dbTable, setDbTable] = useState(existingConfig?.db?.table ?? '');
  const [dbOperation, setDbOperation] = useState(existingConfig?.db?.operation ?? 'select_one');
  const [dbWhere, setDbWhere] = useState<Array<{ param: string; column: string; op: string }>>(existingConfig?.db?.where ?? []);
  const [dbColumns, setDbColumns] = useState<string[]>(existingConfig?.db?.columns ?? []);
  // Remote MCP config
  const [remoteToolName, setRemoteToolName] = useState(existingConfig?.remote_mcp?.tool_name ?? tool.name);
  // DB schema
  const [tables, setTables] = useState<string[]>([]);
  const [columns, setColumns] = useState<Array<{ name: string; type: string }>>([]);

  const [saving, setSaving] = useState(false);

  // Load tables
  useEffect(() => {
    fetch('/api/mcp/resources/db-schema/tables').then(r => r.json()).then(d => setTables(d.tables ?? [])).catch(() => {});
  }, []);

  // Load columns when table changes
  useEffect(() => {
    if (!dbTable) { setColumns([]); return; }
    fetch(`/api/mcp/resources/db-schema/columns?table=${dbTable}`).then(r => r.json()).then(d => setColumns(d.columns ?? [])).catch(() => {});
  }, [dbTable]);

  const handleSave = async () => {
    setSaving(true);
    try {
      let config: Record<string, unknown> | null = null;
      if (implType === 'db') {
        config = {
          impl_type: 'db',
          resource_id: resourceId,
          db: { table: dbTable, operation: dbOperation, where: dbWhere, columns: dbColumns },
        };
      } else if (implType === 'remote_mcp') {
        config = {
          impl_type: 'remote_mcp',
          resource_id: resourceId,
          remote_mcp: { tool_name: remoteToolName },
        };
      }
      await mcpApi.updateExecutionConfig(tool.id, config ?? {});
      onUpdated();
    } catch (e) { alert(`保存失败: ${e}`); }
    finally { setSaving(false); }
  };

  const filteredResources = (type: string) => resources.filter(r => r.type === type);

  return (
    <div className="space-y-5">
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">数据来源</label>
        <div className="flex gap-2">
          {[
            { value: 'db', label: 'DB 查询' },
            { value: 'remote_mcp', label: 'Remote MCP' },
            { value: 'api', label: 'API（即将支持）', disabled: true },
          ].map(opt => (
            <button
              key={opt.value}
              onClick={() => !opt.disabled && setImplType(opt.value)}
              disabled={opt.disabled}
              className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
                implType === opt.value
                  ? 'bg-primary text-primary-foreground border-primary'
                  : opt.disabled
                    ? 'text-muted-foreground border-border opacity-50 cursor-not-allowed'
                    : 'text-foreground border-border hover:bg-accent cursor-pointer'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {implType === 'db' && (
        <div className="space-y-3 border rounded-lg p-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">资源</label>
              <Select value={resourceId} onValueChange={v => { if (v) setResourceId(v); }}>
                <SelectTrigger className="text-xs h-8">
                  <SelectValue placeholder="选择 DB 资源">{filteredResources('db').find(r => r.id === resourceId)?.name ?? resourceId}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {filteredResources('db').map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">表</label>
              <Select value={dbTable} onValueChange={v => { if (!v) return; setDbTable(v); setDbColumns([]); }}>
                <SelectTrigger className="text-xs h-8 font-mono"><SelectValue placeholder="选择表" /></SelectTrigger>
                <SelectContent>
                  {tables.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">操作类型</label>
            <RadioGroup value={dbOperation} onValueChange={v => setDbOperation(v)} className="flex gap-4">
              <Label className="flex items-center gap-1.5 text-xs font-normal cursor-pointer">
                <RadioGroupItem value="select_one" className="size-3" /> 查询单条
              </Label>
              <Label className="flex items-center gap-1.5 text-xs font-normal cursor-pointer">
                <RadioGroupItem value="select_many" className="size-3" /> 查询多条
              </Label>
              <Label className="flex items-center gap-1.5 text-xs font-normal cursor-pointer">
                <RadioGroupItem value="update_one" className="size-3" /> 更新单条
              </Label>
            </RadioGroup>
          </div>

          {/* 条件映射 */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">条件映射（工具参数 → 表字段）</label>
            {dbWhere.map((w, i) => (
              <div key={i} className="flex gap-1.5 items-center mb-1">
                <Input value={w.param} onChange={e => { const n = [...dbWhere]; n[i] = { ...n[i], param: e.target.value }; setDbWhere(n); }} placeholder="参数名" className="w-24 text-[11px] font-mono" />
                <span className="text-xs text-muted-foreground">=</span>
                <Select value={w.column || ''} onValueChange={v => { if (!v) return; const n = [...dbWhere]; n[i] = { ...n[i], column: v }; setDbWhere(n); }}>
                  <SelectTrigger className="w-32 text-[11px] font-mono h-7"><SelectValue placeholder="列名" /></SelectTrigger>
                  <SelectContent>
                    {columns.map(c => <SelectItem key={c.name} value={c.name}>{c.name} ({c.type})</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button variant="ghost" size="icon-xs" className="text-destructive" onClick={() => setDbWhere(dbWhere.filter((_, j) => j !== i))}><Trash2 size={11} /></Button>
              </div>
            ))}
            <Button variant="ghost" size="xs" onClick={() => setDbWhere([...dbWhere, { param: '', column: '', op: '=' }])}><Plus size={11} /> 添加条件</Button>
          </div>

          {/* 返回字段 */}
          {(dbOperation === 'select_one' || dbOperation === 'select_many') && columns.length > 0 && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">返回字段</label>
              <div className="flex flex-wrap gap-2">
                {columns.map(c => (
                  <Label key={c.name} className="flex items-center gap-1 text-[11px] font-normal cursor-pointer font-mono">
                    <Checkbox
                      checked={dbColumns.includes(c.name)}
                      onCheckedChange={(checked: boolean) => {
                        setDbColumns(checked ? [...dbColumns, c.name] : dbColumns.filter(n => n !== c.name));
                      }}
                      className="size-3"
                    />
                    {c.name}
                  </Label>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {implType === 'remote_mcp' && (
        <div className="space-y-3 border rounded-lg p-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">资源</label>
              <Select value={resourceId} onValueChange={v => { if (v) setResourceId(v); }}>
                <SelectTrigger className="text-xs h-8">
                  <SelectValue placeholder="选择 Remote MCP 资源">{filteredResources('remote_mcp').find(r => r.id === resourceId)?.name ?? resourceId}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {filteredResources('remote_mcp').map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">远程工具名</label>
              <Input value={remoteToolName} onChange={e => setRemoteToolName(e.target.value)} className="text-xs font-mono" />
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground">参数直接透传到远程 MCP Server</p>
        </div>
      )}

      <div className="pt-2 border-t">
        <Button size="sm" onClick={handleSave} disabled={saving}><Save size={12} /> {saving ? '保存中...' : '保存执行配置'}</Button>
      </div>
    </div>
  );
}

// ── Mock Tab ─────────────────────────────────────────────────────────────────

function MockTab({ tool, onUpdated }: { tool: McpToolRecord; onUpdated: () => void }) {
  const [rules, setRules] = useState<MockRule[]>(tool.mock_rules ? JSON.parse(tool.mock_rules) : []);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await mcpApi.updateToolMockRules(tool.id, rules);
      onUpdated();
    } catch (e) { alert(`保存失败: ${e}`); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-muted-foreground">为 <span className="font-mono">{tool.name}</span> 定义 Mock 返回规则。</p>
        <Button size="xs" onClick={handleSave} disabled={saving}><Save size={11} /> {saving ? '保存中...' : '保存'}</Button>
      </div>

      {rules.map((rule, i) => (
        <div key={i} className="border rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-muted-foreground">规则 {i + 1}{!rule.match ? ' (默认兜底)' : ''}</span>
            <Button variant="ghost" size="icon-xs" className="text-destructive" onClick={() => setRules(rules.filter((_, j) => j !== i))}><Trash2 size={12} /></Button>
          </div>
          <div>
            <div className="text-[11px] text-muted-foreground mb-0.5">匹配条件 <span className="opacity-50">(留空=默认)</span></div>
            <Input value={rule.match} onChange={e => { const n = [...rules]; n[i] = { ...n[i], match: e.target.value }; setRules(n); }} placeholder='phone == "13800000001"' className="text-[11px] font-mono" />
          </div>
          <div>
            <div className="text-[11px] text-muted-foreground mb-0.5">返回数据 (JSON)</div>
            <Textarea value={rule.response} onChange={e => { const n = [...rules]; n[i] = { ...n[i], response: e.target.value }; setRules(n); }} className="h-20 text-[11px] font-mono resize-none" />
          </div>
        </div>
      ))}

      <Button variant="ghost" size="sm" onClick={() => setRules([...rules, { tool_name: tool.name, match: '', response: '{}' }])}>
        <Plus size={12} /> 添加规则
      </Button>
    </div>
  );
}

// ── Test Tab ─────────────────────────────────────────────────────────────────

function TestTab({ tool }: { tool: McpToolRecord }) {
  const cfg = tool.execution_config ? JSON.parse(tool.execution_config) as { impl_type?: string } : null;

  return (
    <div className="space-y-3">
      <div className="text-[11px] text-muted-foreground space-y-1">
        <div>模式: <span className="font-medium text-foreground">{tool.mocked ? 'Mock' : 'Real'}</span></div>
        <div>Real 实现: <span className="font-medium text-foreground">{cfg?.impl_type ?? '未配置'}</span></div>
      </div>
      <p className="text-xs text-muted-foreground italic">测试功能开发中，请使用技能管理的测试面板进行集成测试。</p>
    </div>
  );
}
