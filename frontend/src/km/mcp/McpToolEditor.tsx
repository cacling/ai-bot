/**
 * McpToolEditor.tsx — MCP 工具编辑页（独立页面，非弹窗）
 *
 * 4 个 Tab：基本信息 / 执行配置 / Mock 规则 / 测试
 */
import React, { useState, useEffect } from 'react';
import { Save, ArrowLeft, Plus, Trash2, Info, Settings2, Database, FlaskConical, FileCode2 } from 'lucide-react';
import { mcpApi, type McpToolRecord, type McpServer, type McpHandler, type MockRule } from './api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Props {
  toolId: string;
  onBack: () => void;
  onUpdated?: () => void;
}

export function McpToolEditor({ toolId, onBack, onUpdated }: Props) {
  const [tool, setTool] = useState<McpToolRecord | null>(null);
  const [servers, setServers] = useState<McpServer[]>([]);

  const reload = () => {
    Promise.all([
      mcpApi.getTool(toolId),
      mcpApi.listServers(),
    ]).then(([t, s]) => {
      setTool(t);
      setServers(s.items);
    }).catch(console.error);
  };

  useEffect(reload, [toolId]);

  if (!tool) return <div className="p-4 text-sm text-muted-foreground">加载中...</div>;

  const handleUpdated = () => { reload(); onUpdated?.(); };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b bg-background">
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft size={14} /> 返回</Button>
        <div className="flex-1">
          <h2 className="text-sm font-semibold font-mono">{tool.name}</h2>
          <div className="text-[11px] text-muted-foreground">
            Server: {servers.find(s => s.id === tool.server_id)?.name ?? '未分配'}
            {tool.skills && tool.skills.length > 0 && (
              <span className="ml-2">· Skill: {tool.skills.join(', ')}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={tool.mocked ? 'secondary' : 'default'} className="text-[10px]">
            {tool.mocked ? 'Mock 模式' : 'Real 模式'}
          </Badge>
          <Badge variant={tool.impl_type ? 'outline' : 'destructive'} className="text-[10px]">
            {tool.impl_type === 'script' ? '脚本' : tool.impl_type === 'db' ? 'DB' : tool.impl_type === 'api' ? 'API' : '未配置'}
          </Badge>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="info" className="flex-1 flex flex-col overflow-hidden">
        <TabsList className="w-full justify-start rounded-none border-b bg-transparent h-auto p-0 px-4">
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
          <InfoTab tool={tool} servers={servers} onUpdated={handleUpdated} />
        </TabsContent>
        <TabsContent value="execution" className="flex-1 overflow-auto mt-0 p-6">
          <ExecutionTab tool={tool} onUpdated={handleUpdated} />
        </TabsContent>
        <TabsContent value="mock" className="flex-1 overflow-auto mt-0 p-6">
          <MockTab tool={tool} onUpdated={handleUpdated} />
        </TabsContent>
        <TabsContent value="test" className="flex-1 overflow-auto mt-0 p-6">
          <TestTab tool={tool} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Info Tab ─────────────────────────────────────────────────────────────────

function InfoTab({ tool, servers, onUpdated }: { tool: McpToolRecord; servers: McpServer[]; onUpdated: () => void }) {
  const [name, setName] = useState(tool.name);
  const [description, setDescription] = useState(tool.description);
  const [serverId, setServerId] = useState(tool.server_id ?? '');
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
    <div className="space-y-5 max-w-2xl">
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

      {tool.input_schema && (
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">参数 Schema</label>
          <pre className="text-[11px] font-mono bg-muted p-3 rounded-lg overflow-auto max-h-40">
            {JSON.stringify(JSON.parse(tool.input_schema), null, 2)}
          </pre>
        </div>
      )}

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

function ExecutionTab({ tool, onUpdated }: { tool: McpToolRecord; onUpdated: () => void }) {
  const [implType, setImplType] = useState(tool.impl_type ?? '');
  const [handlerKey, setHandlerKey] = useState(tool.handler_key ?? '');
  const [handlers, setHandlers] = useState<McpHandler[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    mcpApi.listHandlers().then(r => setHandlers(r.handlers)).catch(() => {});
  }, []);

  const selectedHandler = handlers.find(h => h.key === handlerKey);

  const handleSave = async () => {
    setSaving(true);
    try {
      await mcpApi.updateTool(tool.id, {
        impl_type: implType || null,
        handler_key: implType === 'script' ? handlerKey || null : null,
        execution_config: implType === 'script' && handlerKey
          ? JSON.stringify({ impl_type: 'script', handler_key: handlerKey })
          : tool.execution_config,
      } as any);
      onUpdated();
    } catch (e) { alert(`保存失败: ${e}`); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-5 max-w-2xl">
      {/* 模式指示 */}
      <div className="flex items-center gap-4 p-3 bg-muted rounded-lg">
        <div className="text-xs">
          <span className="text-muted-foreground">当前模式：</span>
          <span className="font-medium">{tool.mocked ? 'Mock（Mock 规则生效）' : 'Real（执行配置生效）'}</span>
        </div>
      </div>

      {/* Real 实现选择 */}
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-2 block">Real 实现方式</label>
        <div className="flex gap-2">
          {[
            { value: 'script', label: '脚本', icon: <FileCode2 size={13} />, desc: '代码实现（TypeScript handler）' },
            { value: 'db', label: 'DB Binding', icon: <Database size={13} />, desc: '声明式数据库查询' },
            { value: 'api', label: 'API', icon: <Settings2 size={13} />, desc: '外部 API 调用（即将支持）', disabled: true },
          ].map(opt => (
            <button
              key={opt.value}
              onClick={() => !opt.disabled && setImplType(opt.value)}
              disabled={opt.disabled}
              className={`flex-1 p-3 rounded-lg border text-left transition-colors ${
                implType === opt.value
                  ? 'border-primary bg-primary/5'
                  : opt.disabled
                    ? 'border-border opacity-40 cursor-not-allowed'
                    : 'border-border hover:bg-accent cursor-pointer'
              }`}
            >
              <div className="flex items-center gap-1.5 text-xs font-medium">{opt.icon} {opt.label}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">{opt.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* 脚本模式配置 */}
      {implType === 'script' && (
        <div className="space-y-3 border rounded-lg p-4">
          <h3 className="text-xs font-semibold">脚本处理器</h3>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Handler</label>
            <Select value={handlerKey} onValueChange={v => { if (v) setHandlerKey(v); }}>
              <SelectTrigger className="text-xs h-8 font-mono">
                <SelectValue placeholder="选择 handler">{handlerKey || '选择...'}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {handlers.map(h => (
                  <SelectItem key={h.key} value={h.key}>
                    <span className="font-mono">{h.key}</span>
                    <span className="text-muted-foreground ml-2">({h.server_name})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {selectedHandler && (
            <div className="space-y-1 text-[11px]">
              <div className="flex justify-between">
                <span className="text-muted-foreground">文件</span>
                <span className="font-mono text-foreground">{selectedHandler.file}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Server</span>
                <span className="text-foreground">{selectedHandler.server_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">工具名</span>
                <span className="font-mono text-foreground">{selectedHandler.tool_name}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* DB Binding 模式配置 */}
      {implType === 'db' && (
        <DbBindingPanel toolId={tool.id} config={tool.execution_config} onUpdated={onUpdated} />
      )}

      <div className="pt-2 border-t">
        <Button size="sm" onClick={handleSave} disabled={saving}>
          <Save size={12} /> {saving ? '保存中...' : '保存执行配置'}
        </Button>
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
    <div className="space-y-3 max-w-2xl">
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
  return (
    <div className="space-y-3 max-w-2xl">
      <div className="text-[11px] text-muted-foreground space-y-1.5 p-3 bg-muted rounded-lg">
        <div className="flex justify-between"><span>模式</span><span className="font-medium text-foreground">{tool.mocked ? 'Mock' : 'Real'}</span></div>
        <div className="flex justify-between"><span>实现</span><span className="font-medium text-foreground">{tool.impl_type === 'script' ? '脚本' : tool.impl_type ?? '未配置'}</span></div>
        {tool.handler_key && <div className="flex justify-between"><span>Handler</span><span className="font-mono text-foreground">{tool.handler_key}</span></div>}
      </div>
      <p className="text-xs text-muted-foreground italic">测试功能开发中，请使用技能管理的测试面板进行集成测试。</p>
    </div>
  );
}

// ── DB Binding Panel ─────────────────────────────────────────────────────────

function DbBindingPanel({ toolId, config, onUpdated }: { toolId: string; config: string | null; onUpdated: () => void }) {
  const existing = config ? JSON.parse(config) as Record<string, any> : {};
  const dbCfg = existing.db ?? {};

  const [table, setTable] = useState<string>(dbCfg.table ?? '');
  const [operation, setOperation] = useState<string>(dbCfg.operation ?? 'select_one');
  const [conditions, setConditions] = useState<Array<{ param: string; column: string; op: string }>>(dbCfg.where ?? []);
  const [selectedColumns, setSelectedColumns] = useState<string[]>(dbCfg.columns ?? []);
  const [tables, setTables] = useState<string[]>([]);
  const [columns, setColumns] = useState<Array<{ name: string; type: string }>>([]);
  const [sqlPreview, setSqlPreview] = useState('');
  const [saving, setSaving] = useState(false);

  // Load tables
  useEffect(() => {
    fetch('/api/mcp/resources/db-schema/tables').then(r => r.json()).then(d => setTables(d.tables ?? [])).catch(() => {});
  }, []);

  // Load columns when table changes
  useEffect(() => {
    if (!table) { setColumns([]); return; }
    fetch(`/api/mcp/resources/db-schema/columns?table=${table}`).then(r => r.json()).then(d => setColumns(d.columns ?? [])).catch(() => {});
  }, [table]);

  // Update SQL preview
  useEffect(() => {
    if (!table) { setSqlPreview(''); return; }
    mcpApi.sqlPreview(toolId, { table, operation, where: conditions, columns: selectedColumns })
      .then(r => setSqlPreview(r.sql))
      .catch(() => setSqlPreview(''));
  }, [table, operation, conditions, selectedColumns, toolId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await mcpApi.updateExecutionConfig(toolId, {
        impl_type: 'db',
        db: { table, operation, where: conditions, columns: selectedColumns },
      });
      onUpdated();
    } catch (e) { alert(`保存失败: ${e}`); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-4 border rounded-lg p-4">
      <h3 className="text-xs font-semibold">DB Binding 配置</h3>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">表</label>
          <Select value={table} onValueChange={v => { if (v) { setTable(v); setSelectedColumns([]); } }}>
            <SelectTrigger className="text-xs h-8 font-mono"><SelectValue placeholder="选择表" /></SelectTrigger>
            <SelectContent>
              {tables.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">操作类型</label>
          <Select value={operation} onValueChange={v => { if (v) setOperation(v); }}>
            <SelectTrigger className="text-xs h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="select_one">查询单条</SelectItem>
              <SelectItem value="select_many">查询多条</SelectItem>
              <SelectItem value="update_one">更新单条</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* 条件映射 */}
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">条件映射（工具参数 → 表字段）</label>
        {conditions.map((w, i) => (
          <div key={i} className="flex gap-1.5 items-center mb-1">
            <Input value={w.param} onChange={e => { const n = [...conditions]; n[i] = { ...n[i], param: e.target.value }; setConditions(n); }} placeholder="参数名" className="w-28 text-[11px] font-mono" />
            <Select value={w.op || '='} onValueChange={v => { if (!v) return; const n = [...conditions]; n[i] = { ...n[i], op: v }; setConditions(n); }}>
              <SelectTrigger className="w-16 text-[11px] h-7"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="=">=</SelectItem>
                <SelectItem value="!=">!=</SelectItem>
                <SelectItem value="LIKE">LIKE</SelectItem>
              </SelectContent>
            </Select>
            <Select value={w.column || ''} onValueChange={v => { if (!v) return; const n = [...conditions]; n[i] = { ...n[i], column: v }; setConditions(n); }}>
              <SelectTrigger className="w-36 text-[11px] font-mono h-7"><SelectValue placeholder="列名" /></SelectTrigger>
              <SelectContent>
                {columns.map(c => <SelectItem key={c.name} value={c.name}>{c.name} <span className="text-muted-foreground">({c.type})</span></SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="ghost" size="icon-xs" className="text-destructive" onClick={() => setConditions(conditions.filter((_, j) => j !== i))}><Trash2 size={11} /></Button>
          </div>
        ))}
        <Button variant="ghost" size="xs" onClick={() => setConditions([...conditions, { param: '', column: '', op: '=' }])}>
          <Plus size={11} /> 添加条件
        </Button>
      </div>

      {/* 返回字段 */}
      {(operation === 'select_one' || operation === 'select_many') && columns.length > 0 && (
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">返回字段 <span className="text-[10px] opacity-50">(不选 = 全部)</span></label>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {columns.map(c => (
              <label key={c.name} className="flex items-center gap-1 text-[11px] font-mono cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedColumns.includes(c.name)}
                  onChange={e => setSelectedColumns(e.target.checked ? [...selectedColumns, c.name] : selectedColumns.filter(n => n !== c.name))}
                  className="size-3 rounded"
                />
                {c.name}
              </label>
            ))}
          </div>
        </div>
      )}

      {/* SQL 预览 */}
      {sqlPreview && (
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">SQL 预览（只读）</label>
          <pre className="text-[11px] font-mono bg-muted p-3 rounded-lg text-foreground">{sqlPreview}</pre>
        </div>
      )}

      <div className="pt-2 border-t">
        <Button size="sm" onClick={handleSave} disabled={saving}>
          <Save size={12} /> {saving ? '保存中...' : '保存 DB 配置'}
        </Button>
      </div>
    </div>
  );
}
