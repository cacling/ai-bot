/**
 * McpToolEditor.tsx — Tool Studio 工具编辑器
 *
 * 6 步骤流程：概览 / 输入契约 / 输出契约 / 实现方式 / Mock 场景 / 测试与发布
 * 三栏布局：左导航 + 中编辑区 + 右摘要栏
 */
import React, { useState, useEffect } from 'react';
import { Save, ArrowLeft, Plus, Trash2, FileCode2, Database, Settings2, ChevronRight, Check, AlertTriangle, Circle, Play } from 'lucide-react';
import { mcpApi, type McpToolRecord, type McpServer, type McpHandler, type MockRule } from './api';
import { SchemaTableEditor } from './SchemaTableEditor';
import { ContractAlignmentCard, alignSchemaWithMockResponse, alignSchemaWithData, extractSchemaFields, compareAlignment, type AlignmentResult } from './ContractAlignmentCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

/**
 * 从 MCP 工具调用结果中提取业务数据。
 * MCP 返回格式：{ content: [{ type: "text", text: "JSON_STRING" }] }
 * 需要解包成实际的业务对象。
 */
function extractBusinessData(mcpResult: unknown): unknown {
  if (!mcpResult || typeof mcpResult !== 'object') return mcpResult;
  const r = mcpResult as Record<string, unknown>;
  if (Array.isArray(r.content)) {
    const textItem = (r.content as Array<Record<string, unknown>>).find(c => c.type === 'text');
    if (textItem && typeof textItem.text === 'string') {
      try { return JSON.parse(textItem.text); } catch { return textItem.text; }
    }
  }
  return mcpResult;
}

interface Props {
  toolId: string;
  onBack: () => void;
  onUpdated?: () => void;
  initialStep?: Step;
  fromServer?: string;
}

type Step = 'overview' | 'input' | 'output' | 'impl' | 'mock' | 'test';

const STEPS: Array<{ id: Step; label: string }> = [
  { id: 'overview', label: '概览' },
  { id: 'input', label: '输入契约' },
  { id: 'output', label: '输出契约' },
  { id: 'impl', label: '实现方式' },
  { id: 'mock', label: 'Mock 场景' },
  { id: 'test', label: '测试与发布' },
];

export function McpToolEditor({ toolId, onBack, onUpdated, initialStep, fromServer }: Props) {
  const [tool, setTool] = useState<McpToolRecord | null>(null);
  const [servers, setServers] = useState<McpServer[]>([]);
  const [step, setStep] = useState<Step>(initialStep ?? 'overview');
  const [lastTestPassed, setLastTestPassed] = useState<boolean | null>(null);

  const reload = () => {
    Promise.all([
      mcpApi.getTool(toolId),
      mcpApi.listServers(),
    ]).then(([t, s]) => { setTool(t); setServers(s.items); }).catch(console.error);
  };

  useEffect(reload, [toolId]);

  if (!tool) return <div className="flex items-center justify-center h-full text-sm text-muted-foreground">加载中...</div>;

  const handleUpdated = () => { reload(); onUpdated?.(); };

  // 步骤状态
  const stepStatus = (s: Step): 'done' | 'warning' | 'empty' | 'current' => {
    if (s === step) return 'current';
    switch (s) {
      case 'overview': return 'done';
      case 'input': return tool.input_schema ? 'done' : 'empty';
      case 'output': return tool.output_schema ? 'done' : 'warning';
      case 'impl': return tool.impl_type ? 'done' : 'warning';
      case 'mock': return tool.mock_rules ? 'done' : 'empty';
      case 'test': return lastTestPassed === true ? 'done' : lastTestPassed === false ? 'warning' : 'empty';
      default: return 'empty';
    }
  };

  const nextStep = () => {
    const idx = STEPS.findIndex(s => s.id === step);
    if (idx < STEPS.length - 1) setStep(STEPS[idx + 1].id);
  };
  const prevStep = () => {
    const idx = STEPS.findIndex(s => s.id === step);
    if (idx > 0) setStep(STEPS[idx - 1].id);
  };
  const stepIdx = STEPS.findIndex(s => s.id === step);

  return (
    <div className="flex flex-col h-full bg-[#F7F8FA]">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 px-6 py-4 bg-background border-b shadow-sm">
        <Button variant="ghost" size="sm" onClick={onBack} className="flex-shrink-0">
          <ArrowLeft size={14} /> {fromServer ? `返回 ${fromServer}` : '返回'}
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">
            <span className="font-mono">{tool.name}</span>
          </h1>
          <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
            <span>{servers.find(s => s.id === tool.server_id)?.name ?? '未分配 Server'}</span>
            {tool.skills && tool.skills.length > 0 && (
              <>
                <span className="text-muted-foreground/40">·</span>
                <span>{tool.skills.join(' / ')}</span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Badge variant={tool.mocked ? 'secondary' : 'default'} className="text-[10px] px-2">
            {tool.mocked ? 'Mock' : 'Real'}
          </Badge>
          <Badge variant={tool.impl_type ? 'outline' : 'destructive'} className="text-[10px] px-2">
            {tool.impl_type === 'script' ? '脚本' : tool.impl_type === 'db' ? 'DB' : tool.impl_type === 'api' ? 'API' : '未配置'}
          </Badge>
          <Badge variant={tool.output_schema ? 'outline' : 'destructive'} className="text-[10px] px-2">
            {tool.output_schema ? '契约已定义' : '契约未定义'}
          </Badge>
        </div>
      </div>

      {/* ── Three-column layout ────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Step Navigation */}
        <div className="w-[220px] border-r bg-background flex-shrink-0 flex flex-col">
          <div className="p-4 space-y-1 flex-1">
            {STEPS.map((s, i) => {
              const status = stepStatus(s.id);
              const isCurrent = status === 'current';
              return (
                <button
                  key={s.id}
                  onClick={() => setStep(s.id)}
                  className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg text-left transition-all ${
                    isCurrent
                      ? 'bg-primary/10 text-primary font-semibold shadow-sm'
                      : 'hover:bg-accent text-foreground'
                  }`}
                >
                  {/* Status icon with ring for current */}
                  <span className={`flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold ${
                    status === 'done' ? 'bg-emerald-100 text-emerald-600' :
                    status === 'warning' ? 'bg-amber-100 text-amber-600' :
                    isCurrent ? 'bg-primary text-primary-foreground ring-2 ring-primary/20' :
                    'bg-muted text-muted-foreground'
                  }`}>
                    {status === 'done' ? <Check size={12} /> :
                     status === 'warning' ? <AlertTriangle size={10} /> :
                     <span>{i + 1}</span>}
                  </span>
                  <span className="text-xs">{s.label}</span>
                </button>
              );
            })}
          </div>
          {/* Step progress bar */}
          <div className="px-4 pb-4">
            <div className="flex gap-1">
              {STEPS.map((s) => {
                const status = stepStatus(s.id);
                return (
                  <div
                    key={s.id}
                    className={`h-1 flex-1 rounded-full transition-colors ${
                      status === 'done' ? 'bg-emerald-400' :
                      status === 'warning' ? 'bg-amber-400' :
                      status === 'current' ? 'bg-primary' :
                      'bg-muted'
                    }`}
                  />
                );
              })}
            </div>
          </div>
        </div>

        {/* Center: Main editing area */}
        <div className="flex-1 overflow-auto p-6 pb-20">
          <div className="max-w-[760px] mx-auto">
            {step === 'overview' && <OverviewStep tool={tool} servers={servers} onUpdated={handleUpdated} />}
            {step === 'input' && <InputContractStep tool={tool} onUpdated={handleUpdated} />}
            {step === 'output' && <OutputContractStep tool={tool} onUpdated={handleUpdated} />}
            {step === 'impl' && <ImplStep tool={tool} onUpdated={handleUpdated} />}
            {step === 'mock' && <MockStep tool={tool} onUpdated={handleUpdated} />}
            {step === 'test' && <TestStep tool={tool} onTestResult={setLastTestPassed} />}
          </div>
        </div>

        {/* Right: Summary sidebar */}
        <div className="w-[280px] border-l bg-background p-4 flex-shrink-0 overflow-auto">
          <SummarySidebar tool={tool} servers={servers} />
        </div>
      </div>

      {/* ── Bottom sticky action bar ───────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 py-3 bg-background border-t shadow-[0_-2px_8px_rgba(0,0,0,0.04)]">
        <Button
          variant="ghost"
          size="sm"
          onClick={prevStep}
          disabled={stepIdx === 0}
        >
          <ArrowLeft size={12} /> 上一步
        </Button>
        <div className="text-xs text-muted-foreground">
          {stepIdx + 1} / {STEPS.length} · {STEPS[stepIdx].label}
        </div>
        {stepIdx < STEPS.length - 1 ? (
          <Button size="sm" onClick={nextStep}>
            下一步 <ChevronRight size={12} />
          </Button>
        ) : (
          <Button size="sm" variant={tool.output_schema && tool.impl_type ? 'default' : 'outline'} disabled={!tool.output_schema || !tool.impl_type}>
            <Check size={12} /> 发布工具
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Step 1: Overview ─────────────────────────────────────────────────────────

function OverviewStep({ tool, servers, onUpdated }: { tool: McpToolRecord; servers: McpServer[]; onUpdated: () => void }) {
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

  // Real status checks — not just "exists" but "aligned"
  const outputSchema = (tool.output_schema_content ?? null) as Record<string, unknown> | null;
  const mockRules: MockRule[] = tool.mock_rules ? JSON.parse(tool.mock_rules) : [];

  // Check mock alignment
  const mockAlignments = outputSchema && mockRules.length > 0
    ? mockRules.map(r => alignSchemaWithMockResponse(outputSchema, r.response))
    : [];
  const allMocksAligned = mockAlignments.length > 0 && mockAlignments.every(a => a.missing.length === 0);
  const someMocksDrifted = mockAlignments.some(a => a.missing.length > 0 || a.extra.length > 0);

  type StatusLevel = 'done' | 'warn' | 'empty';
  const statusItems: Array<{ label: string; level: StatusLevel; detail?: string }> = [
    { label: '输入契约', level: tool.input_schema ? 'done' : 'empty' },
    { label: '输出契约', level: tool.output_schema ? 'done' : 'empty' },
    {
      label: 'Real 实现',
      level: tool.impl_type ? 'done' : 'empty',
      detail: tool.impl_type ? undefined : '未配置',
    },
    {
      label: 'Mock 对齐',
      level: mockRules.length === 0 ? 'empty' : allMocksAligned ? 'done' : 'warn',
      detail: mockRules.length === 0 ? '无场景' : someMocksDrifted ? '有漂移' : undefined,
    },
  ];
  const doneCount = statusItems.filter(s => s.level === 'done').length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-1">概览</h2>
        <p className="text-xs text-muted-foreground">定义工具的基本元数据，了解当前配置完整度。</p>
      </div>

      {/* Quick completion status */}
      <div className="bg-background rounded-xl border p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-medium">配置完成度</span>
          <span className="text-xs text-muted-foreground">{doneCount} / {statusItems.length}</span>
        </div>
        <div className="flex gap-1.5 mb-3">
          {statusItems.map((s, i) => (
            <div key={i} className={`h-1.5 flex-1 rounded-full ${
              s.level === 'done' ? 'bg-emerald-400' : s.level === 'warn' ? 'bg-amber-400' : 'bg-muted'
            }`} />
          ))}
        </div>
        <div className="grid grid-cols-4 gap-2">
          {statusItems.map((s, i) => (
            <div key={i} className="flex items-center gap-1.5 text-[11px]">
              {s.level === 'done' ? <Check size={10} className="text-emerald-500" /> :
               s.level === 'warn' ? <AlertTriangle size={10} className="text-amber-500" /> :
               <Circle size={10} className="text-muted-foreground/30" />}
              <span className={s.level === 'done' ? '' : s.level === 'warn' ? 'text-amber-600' : 'text-muted-foreground'}>
                {s.label}{s.detail ? ` (${s.detail})` : ''}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Basic info */}
      <div className="bg-background rounded-xl border p-5 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">工具名</label>
            <Input value={name} onChange={e => setName(e.target.value)} className="text-sm font-mono" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">所属 Server</label>
            <Select value={serverId} onValueChange={v => { if (v) setServerId(v); }}>
              <SelectTrigger className="text-sm h-9"><SelectValue placeholder="选择 Server">{servers.find(s => s.id === serverId)?.name ?? '—'}</SelectValue></SelectTrigger>
              <SelectContent>{servers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">描述</label>
          <Textarea value={description} onChange={e => setDescription(e.target.value)} className="text-sm resize-none h-16" />
        </div>

        {/* Current config summary */}
        <div className="grid grid-cols-3 gap-3 pt-2 border-t">
          <div className="text-[11px]">
            <span className="text-muted-foreground block mb-0.5">当前模式</span>
            <Badge variant={tool.mocked ? 'secondary' : 'default'} className="text-[9px]">{tool.mocked ? 'Mock' : 'Real'}</Badge>
          </div>
          <div className="text-[11px]">
            <span className="text-muted-foreground block mb-0.5">实现方式</span>
            <span className="font-medium">{tool.impl_type === 'script' ? '脚本' : tool.impl_type === 'db' ? 'DB' : tool.impl_type === 'api' ? 'API' : '未配置'}</span>
          </div>
          <div className="text-[11px]">
            <span className="text-muted-foreground block mb-0.5">Mock 场景</span>
            <span className="font-medium">{tool.mock_rules ? `${JSON.parse(tool.mock_rules).length} 个` : '无'}</span>
          </div>
        </div>
      </div>

      {/* Skills & usage */}
      {tool.skills && tool.skills.length > 0 && (
        <div className="bg-background rounded-xl border p-5 space-y-3">
          <label className="text-xs font-medium text-muted-foreground block">关联 Skill（此工具被以下业务场景使用）</label>
          <div className="flex gap-1.5 flex-wrap">
            {tool.skills.map(s => <Badge key={s} variant="secondary" className="text-[11px]">{s}</Badge>)}
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <Button size="sm" onClick={handleSave} disabled={saving}><Save size={12} /> {saving ? '保存中...' : '保存'}</Button>
      </div>

      <p className="text-[11px] text-muted-foreground">下一步：定义输入契约</p>
    </div>
  );
}

// ── Step 2: Input Contract ───────────────────────────────────────────────────

function InputContractStep({ tool, onUpdated }: { tool: McpToolRecord; onUpdated: () => void }) {
  const schema = tool.input_schema ? JSON.parse(tool.input_schema) as Record<string, unknown> : null;
  const [dirty, setDirty] = useState(false);
  const [pendingSchema, setPendingSchema] = useState<Record<string, unknown> | null>(null);
  const [saving, setSaving] = useState(false);

  const handleChange = (s: Record<string, unknown>) => {
    setPendingSchema(s);
    setDirty(true);
  };

  const handleSave = async () => {
    if (!pendingSchema) return;
    setSaving(true);
    try {
      await mcpApi.updateTool(tool.id, { input_schema: JSON.stringify(pendingSchema) } as any);
      setDirty(false);
      onUpdated();
    } catch (e) { alert(`保存失败: ${e}`); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold mb-1">输入契约</h2>
          <p className="text-xs text-muted-foreground">定义调用此工具时需要的参数。</p>
        </div>
        {dirty && (
          <Button size="sm" onClick={handleSave} disabled={saving}>
            <Save size={12} /> {saving ? '保存中...' : '保存'}
          </Button>
        )}
      </div>

      <div className="bg-background rounded-xl border p-5">
        <SchemaTableEditor
          schema={schema}
          onChange={handleChange}
          emptyText="无参数定义"
        />
      </div>

      <p className="text-[11px] text-muted-foreground">下一步：定义输出契约</p>
    </div>
  );
}

// ── Step 3: Output Contract ──────────────────────────────────────────────────

function OutputContractStep({ tool, onUpdated }: { tool: McpToolRecord; onUpdated: () => void }) {
  const schemaContent = (tool.output_schema_content ?? null) as Record<string, unknown> | null;
  const [dirty, setDirty] = useState(false);
  const [pendingSchema, setPendingSchema] = useState<Record<string, unknown> | null>(null);
  const [saving, setSaving] = useState(false);
  const [inferring, setInferring] = useState(false);
  // 自动从已有数据预填返回示例：response_example > 第一条 Mock response > 空
  const [exampleText, setExampleText] = useState(() => {
    if (tool.response_example) return tool.response_example;
    if (tool.mock_rules) {
      try {
        const rules = JSON.parse(tool.mock_rules) as Array<{ response: string }>;
        if (rules.length > 0 && rules[0].response) {
          // 尝试格式化
          try { return JSON.stringify(JSON.parse(rules[0].response), null, 2); } catch { return rules[0].response; }
        }
      } catch { /* ignore */ }
    }
    return '';
  });

  const handleChange = (s: Record<string, unknown>) => {
    setPendingSchema(s);
    setDirty(true);
  };

  const handleSave = async () => {
    const toSave = pendingSchema ?? schemaContent;
    if (!toSave) return;
    setSaving(true);
    try {
      await mcpApi.updateTool(tool.id, { output_schema: JSON.stringify(toSave) } as any);
      setDirty(false);
      onUpdated();
    } catch (e) { alert(`保存失败: ${e}`); }
    finally { setSaving(false); }
  };

  const handleInferFromExample = async () => {
    if (!exampleText.trim()) { alert('请先填写返回示例'); return; }
    setInferring(true);
    try {
      const example = JSON.parse(exampleText);
      const { schema } = await mcpApi.inferSchema(example);
      setPendingSchema(schema);
      setDirty(true);
    } catch (e) { alert(`推断失败: ${e}`); }
    finally { setInferring(false); }
  };

  // Use pending schema if available (from infer or edit), otherwise use saved
  const displaySchema = pendingSchema ?? schemaContent;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold mb-1">输出契约</h2>
          <p className="text-xs text-muted-foreground">
            定义 Tool 返回结果中的 <code className="bg-muted px-1 rounded">data</code> 结构，不包含 success/message/error_code 外层包裹。
          </p>
        </div>
        {dirty && (
          <Button size="sm" onClick={handleSave} disabled={saving}>
            <Save size={12} /> {saving ? '保存中...' : '保存 Schema'}
          </Button>
        )}
      </div>

      <div className="bg-background rounded-xl border p-5">
        <SchemaTableEditor
          schema={displaySchema}
          onChange={handleChange}
          emptyText="尚未定义输出契约"
        />
      </div>

      {/* 返回示例 + 推断 */}
      <div className="bg-background rounded-xl border p-5 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">返回示例</span>
          <div className="flex gap-2">
            {tool.mock_rules && (
              <Button variant="ghost" size="xs" onClick={() => {
                try {
                  const rules = JSON.parse(tool.mock_rules!) as Array<{ response: string }>;
                  if (rules.length > 0) setExampleText(JSON.stringify(JSON.parse(rules[0].response), null, 2));
                } catch { /* ignore */ }
              }}>从 Mock 填充</Button>
            )}
            {tool.server_id && (
              <Button variant="ghost" size="xs" onClick={async () => {
                try {
                  const args: Record<string, unknown> = {};
                  if (tool.input_schema) {
                    const schema = JSON.parse(tool.input_schema) as Record<string, any>;
                    for (const [k, v] of Object.entries(schema.properties ?? {})) {
                      if ((v as any).type === 'string') args[k] = 'test';
                      else if ((v as any).type === 'number') args[k] = 0;
                    }
                  }
                  const res = tool.mocked
                    ? await mcpApi.mockInvokeTool(tool.server_id!, tool.name, args)
                    : await mcpApi.invokeTool(tool.server_id!, tool.name, args);
                  const businessData = extractBusinessData(res.result);
                  setExampleText(JSON.stringify(businessData, null, 2));
                } catch (e) { alert(`调用失败: ${e}`); }
              }}>从真实调用获取</Button>
            )}
            <Button variant="outline" size="xs" onClick={handleInferFromExample} disabled={inferring}>
              {inferring ? '推断中...' : '从示例生成 Schema'}
            </Button>
          </div>
        </div>
        {exampleText ? (
          <Textarea
            value={exampleText}
            onChange={e => setExampleText(e.target.value)}
            className="font-mono text-[11px] h-[28rem] resize-none"
          />
        ) : (
          <div className="text-xs text-muted-foreground text-center py-6 border border-dashed rounded-lg">
            <p>暂无返回示例</p>
            <p className="mt-1 text-[11px]">可以从 Mock 场景填充、从真实调用获取，或直接粘贴 JSON</p>
          </div>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground">下一步：选择实现方式</p>
    </div>
  );
}

// ── Step 4: Implementation ───────────────────────────────────────────────────

const IMPL_OPTIONS = [
  {
    value: 'script',
    label: '脚本',
    icon: <FileCode2 size={18} />,
    desc: '适合复杂规则、多表聚合、诊断逻辑',
    detail: 'TypeScript handler，完全自定义实现',
  },
  {
    value: 'db',
    label: 'DB Binding',
    icon: <Database size={18} />,
    desc: '适合简单查询、单表 CRUD',
    detail: '声明式配置，自动生成 SQL',
  },
  {
    value: 'api',
    label: 'API',
    icon: <Settings2 size={18} />,
    desc: '适合调用外部系统能力',
    detail: 'REST API 代理，支持超时和 Header',
  },
];

function ImplStep({ tool, onUpdated }: { tool: McpToolRecord; onUpdated: () => void }) {
  const [implType, setImplType] = useState(tool.impl_type ?? '');
  const [handlerKey, setHandlerKey] = useState(tool.handler_key ?? '');
  const [handlers, setHandlers] = useState<McpHandler[]>([]);
  const [saving, setSaving] = useState(false);
  const [contractMatch, setContractMatch] = useState<{ checked: boolean; valid?: boolean; errors?: string[] }>({ checked: false });

  useEffect(() => { mcpApi.listHandlers().then(r => setHandlers(r.handlers)).catch(() => {}); }, []);

  const selectedHandler = handlers.find(h => h.key === handlerKey);
  const execConfig = tool.execution_config ? JSON.parse(tool.execution_config) as Record<string, any> : {};

  // Get current config summary for each impl type
  const getImplSummary = (type: string): string | null => {
    if (type === 'script') return tool.handler_key ? `handler: ${tool.handler_key}` : null;
    if (type === 'db') return execConfig.db?.table ? `表: ${execConfig.db.table}` : null;
    if (type === 'api') return execConfig.api?.url ? execConfig.api.url : null;
    return null;
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await mcpApi.updateTool(tool.id, {
        impl_type: implType || null,
        handler_key: implType === 'script' ? handlerKey || null : null,
      } as any);
      onUpdated();
    } catch (e) { alert(`保存失败: ${e}`); }
    finally { setSaving(false); }
  };

  // Check contract match after save
  const handleCheckContract = async () => {
    if (!tool.server_id || !tool.output_schema) {
      setContractMatch({ checked: true, valid: undefined, errors: [!tool.output_schema ? '请先定义输出契约' : '请先分配 Server'] });
      return;
    }
    try {
      // Quick test with empty args to see if the tool runs and matches schema
      const testArgs: Record<string, unknown> = {};
      const inputSchema = tool.input_schema ? JSON.parse(tool.input_schema) : null;
      if (inputSchema?.properties) {
        for (const [k, v] of Object.entries(inputSchema.properties as Record<string, any>)) {
          if (v.type === 'string') testArgs[k] = 'test';
          else if (v.type === 'number' || v.type === 'integer') testArgs[k] = 0;
          else if (v.type === 'boolean') testArgs[k] = false;
        }
      }
      const res = tool.mocked
        ? await mcpApi.mockInvokeTool(tool.server_id, tool.name, testArgs)
        : await mcpApi.invokeTool(tool.server_id, tool.name, testArgs);
      const businessData = extractBusinessData(res.result);
      const vr = await mcpApi.validateOutput(tool.id, businessData);
      setContractMatch({ checked: true, valid: vr.valid, errors: vr.errors });
    } catch (e) {
      setContractMatch({ checked: true, valid: undefined, errors: [`执行失败: ${e}`] });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-1">实现方式</h2>
        <p className="text-xs text-muted-foreground">选择此工具的 Real 实现方式。</p>
      </div>

      {/* 模式指示 */}
      <div className="flex items-center gap-3 bg-muted rounded-lg p-3 text-xs">
        <span>当前模式：<span className="font-medium">{tool.mocked ? 'Mock' : 'Real'}</span></span>
        {tool.output_schema && (
          <>
            <span className="text-muted-foreground/40">·</span>
            <button onClick={handleCheckContract} className="text-primary hover:underline">检查契约匹配</button>
            {contractMatch.checked && (
              <Badge variant={contractMatch.valid ? 'default' : contractMatch.valid === false ? 'destructive' : 'outline'} className="text-[9px]">
                {contractMatch.valid ? '契约匹配' : contractMatch.valid === false ? '契约不匹配' : '未知'}
              </Badge>
            )}
          </>
        )}
      </div>

      {contractMatch.checked && contractMatch.errors && contractMatch.errors.length > 0 && (
        <div className="text-[11px] text-destructive bg-destructive/5 p-3 rounded-lg space-y-0.5">
          {contractMatch.errors.map((e, i) => <div key={i}>{e}</div>)}
        </div>
      )}

      {/* 三选一卡片 */}
      <div className="grid grid-cols-3 gap-3">
        {IMPL_OPTIONS.map(opt => {
          const isSelected = implType === opt.value;
          const isCurrentImpl = tool.impl_type === opt.value;
          const summary = getImplSummary(opt.value);
          return (
            <button
              key={opt.value}
              onClick={() => setImplType(opt.value)}
              className={`p-4 rounded-xl border text-left transition-all ${
                isSelected
                  ? 'border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20'
                  : 'border-border hover:bg-accent hover:border-border/80'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className={isSelected ? 'text-primary' : 'text-muted-foreground'}>{opt.icon}</span>
                <span className="text-sm font-semibold">{opt.label}</span>
                {isCurrentImpl && <Badge variant="secondary" className="text-[9px] ml-auto">当前</Badge>}
              </div>
              <div className="text-[11px] text-muted-foreground mb-2">{opt.desc}</div>
              <div className="text-[10px] text-muted-foreground/70">{opt.detail}</div>
              {summary && isCurrentImpl && (
                <div className="mt-2 pt-2 border-t text-[10px] font-mono text-muted-foreground truncate" title={summary}>
                  {summary}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* 脚本配置 */}
      {implType === 'script' && (
        <div className="space-y-4">
          <div className="bg-background rounded-xl border p-5 space-y-3">
            <h3 className="text-sm font-semibold">脚本处理器</h3>
            <Select value={handlerKey} onValueChange={v => { if (v) setHandlerKey(v); }}>
              <SelectTrigger className="text-sm h-9 font-mono"><SelectValue placeholder="选择 handler">{handlerKey || '选择...'}</SelectValue></SelectTrigger>
              <SelectContent>{handlers.map(h => <SelectItem key={h.key} value={h.key}><span className="font-mono">{h.key}</span></SelectItem>)}</SelectContent>
            </Select>
            {selectedHandler && (
              <div className="text-[11px] space-y-1.5 bg-muted p-3 rounded-lg">
                <div className="flex justify-between"><span className="text-muted-foreground">文件</span><span className="font-mono">{selectedHandler.file}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Server</span><span>{selectedHandler.server_name}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">工具名</span><span className="font-mono">{selectedHandler.tool_name}</span></div>
              </div>
            )}
          </div>

          {/* 脚本字段覆盖卡 — 从第一条 Mock 推断 */}
          {(() => {
            const outputSchema = (tool.output_schema_content ?? null) as Record<string, unknown> | null;
            if (!outputSchema) return null;
            const mockRules: MockRule[] = tool.mock_rules ? JSON.parse(tool.mock_rules) : [];
            if (mockRules.length === 0) return (
              <div className="text-[11px] text-muted-foreground bg-muted rounded-lg p-3">
                脚本模式的字段对齐需要通过"运行测试"或 Mock 场景来验证。请先添加 Mock 场景或在"测试与发布"步骤中运行一次测试。
              </div>
            );
            const alignment = alignSchemaWithMockResponse(outputSchema, mockRules[0].response);
            return <ContractAlignmentCard alignment={alignment} title="字段覆盖（基于 Mock 数据推断）" />;
          })()}
        </div>
      )}

      {/* DB Binding */}
      {implType === 'db' && <DbBindingPanel toolId={tool.id} config={tool.execution_config} outputSchema={(tool.output_schema_content ?? null) as Record<string, unknown> | null} onUpdated={onUpdated} />}

      {/* API */}
      {implType === 'api' && <ApiPanel toolId={tool.id} config={tool.execution_config} outputSchema={(tool.output_schema_content ?? null) as Record<string, unknown> | null} onUpdated={onUpdated} />}

      <div className="flex justify-end">
        <Button size="sm" onClick={handleSave} disabled={saving}><Save size={12} /> {saving ? '保存中...' : '保存实现配置'}</Button>
      </div>

      <p className="text-[11px] text-muted-foreground">下一步：补 Mock 场景</p>
    </div>
  );
}

// ── Step 5: Mock Scenarios ───────────────────────────────────────────────────

function MockStep({ tool, onUpdated }: { tool: McpToolRecord; onUpdated: () => void }) {
  const [rules, setRules] = useState<MockRule[]>(tool.mock_rules ? JSON.parse(tool.mock_rules) : []);
  const [saving, setSaving] = useState(false);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [validating, setValidating] = useState(false);
  const [validationResults, setValidationResults] = useState<Record<number, { valid: boolean; errors?: string[] }>>({});

  const handleSave = async () => {
    setSaving(true);
    try { await mcpApi.updateToolMockRules(tool.id, rules); onUpdated(); }
    catch (e) { alert(`保存失败: ${e}`); }
    finally { setSaving(false); }
  };

  const updateRule = (i: number, patch: Partial<MockRule>) => {
    const n = [...rules];
    n[i] = { ...n[i], ...patch };
    setRules(n);
  };

  const handleValidateAll = async () => {
    if (!tool.output_schema) { alert('请先定义输出契约'); return; }
    setValidating(true);
    const results: Record<number, { valid: boolean; errors?: string[] }> = {};
    for (let i = 0; i < rules.length; i++) {
      try {
        const data = JSON.parse(rules[i].response);
        const r = await mcpApi.validateOutput(tool.id, data);
        results[i] = r;
      } catch {
        results[i] = { valid: false, errors: ['JSON 格式不合法'] };
      }
    }
    setValidationResults(results);
    setValidating(false);
  };

  const getResponseSummary = (response: string): string => {
    try {
      const obj = JSON.parse(response);
      if (typeof obj !== 'object' || obj === null) return String(obj);
      const keys = Object.keys(obj);
      if (keys.length <= 3) return keys.map(k => `${k}: ${JSON.stringify(obj[k])}`).join(', ');
      return keys.slice(0, 3).join(', ') + `... (${keys.length} fields)`;
    } catch { return response.slice(0, 60); }
  };

  const guessSceneName = (rule: MockRule, index: number): string => {
    if (rule.scene_name) return rule.scene_name;
    if (!rule.match) return '默认兜底';
    return `场景 ${index + 1}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold mb-1">Mock 场景</h2>
          <p className="text-xs text-muted-foreground">定义调试、演示、回归测试用的模拟返回。</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="xs" onClick={handleValidateAll} disabled={validating || rules.length === 0}>
            {validating ? '校验中...' : '校验全部 Mock'}
          </Button>
          <Button size="xs" onClick={handleSave} disabled={saving}>
            <Save size={11} /> {saving ? '保存中...' : '保存'}
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {rules.map((rule, i) => {
          const isExpanded = expandedIndex === i;
          const vr = validationResults[i];
          const outputSchema = (tool.output_schema_content ?? null) as Record<string, unknown> | null;
          const alignment = outputSchema ? alignSchemaWithMockResponse(outputSchema, rule.response) : null;
          const hasDrift = alignment && (alignment.missing.length > 0 || alignment.extra.length > 0);
          return (
            <div key={i} className={`bg-background rounded-xl border transition-colors ${
              vr ? (vr.valid ? 'border-emerald-200' : 'border-destructive/30') :
              hasDrift ? 'border-amber-200' : ''
            }`}>
              {/* Card header — always visible */}
              <div
                className="flex items-center gap-3 p-4 cursor-pointer"
                onClick={() => setExpandedIndex(isExpanded ? null : i)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium truncate">{guessSceneName(rule, i)}</span>
                    {!rule.match && <Badge variant="secondary" className="text-[9px]">默认</Badge>}
                    {alignment && (
                      <ContractAlignmentCard alignment={alignment} compact />
                    )}
                    {vr && (
                      <Badge variant={vr.valid ? 'default' : 'destructive'} className="text-[9px]">
                        {vr.valid ? '值校验通过' : '值校验失败'}
                      </Badge>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {rule.match ? <span className="font-mono">{rule.match}</span> : <span className="italic">匹配所有</span>}
                    <span className="mx-1.5">→</span>
                    <span className="font-mono">{getResponseSummary(rule.response)}</span>
                  </div>
                </div>
                <ChevronRight size={14} className={`text-muted-foreground transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
              </div>

              {/* Expanded editing area */}
              {isExpanded && (
                <div className="border-t px-4 pb-4 pt-3 space-y-3">
                  <div>
                    <label className="text-[11px] text-muted-foreground mb-0.5 block">场景名称</label>
                    <Input
                      value={rule.scene_name ?? ''}
                      onChange={e => updateRule(i, { scene_name: e.target.value })}
                      placeholder="如: 正常用户、欠费用户、号码不存在"
                      className="text-[11px]"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-muted-foreground mb-0.5 block">匹配条件 <span className="opacity-50">(留空=默认兜底)</span></label>
                    <Input
                      value={rule.match}
                      onChange={e => updateRule(i, { match: e.target.value })}
                      placeholder='phone == "13800000001"'
                      className="text-[11px] font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-muted-foreground mb-0.5 block">返回数据 (JSON)</label>
                    <Textarea
                      value={rule.response}
                      onChange={e => updateRule(i, { response: e.target.value })}
                      className="h-28 text-[11px] font-mono resize-none"
                    />
                  </div>
                  {vr && !vr.valid && vr.errors && (
                    <div className="text-[11px] text-destructive bg-destructive/5 p-2 rounded">
                      {vr.errors.map((e, j) => <div key={j}>{e}</div>)}
                    </div>
                  )}
                  {alignment && (alignment.missing.length > 0 || alignment.extra.length > 0) && (
                    <ContractAlignmentCard alignment={alignment} title="字段对齐" />
                  )}
                  <div className="flex justify-between">
                    <Button variant="ghost" size="xs" onClick={() => setRules([...rules.slice(0, i + 1), { ...rule, scene_name: (rule.scene_name ?? '') + ' (副本)', tool_name: rule.tool_name }, ...rules.slice(i + 1)])}>
                      复制
                    </Button>
                    <Button variant="ghost" size="xs" className="text-destructive" onClick={() => { setRules(rules.filter((_, j) => j !== i)); setExpandedIndex(null); }}>
                      <Trash2 size={11} /> 删除
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => { setRules([...rules, { tool_name: tool.name, scene_name: '', match: '', response: '{}' }]); setExpandedIndex(rules.length); }}>
          <Plus size={12} /> 新增场景
        </Button>
        <GenerateMockFromReal tool={tool} onGenerated={(scene_name, response) => {
          const newRule: MockRule = { tool_name: tool.name, scene_name, match: '', response };
          setRules([...rules, newRule]);
          setExpandedIndex(rules.length);
        }} />
      </div>

      <p className="text-[11px] text-muted-foreground">下一步：运行测试</p>
    </div>
  );
}

/** 从真实调用结果生成 Mock 场景 */
function GenerateMockFromReal({ tool, onGenerated }: {
  tool: McpToolRecord;
  onGenerated: (sceneName: string, response: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [argsText, setArgsText] = useState('{}');

  const handleRun = async () => {
    if (!tool.server_id) { alert('此工具未分配 Server'); return; }
    setRunning(true);
    try {
      const args = JSON.parse(argsText);
      const res = await mcpApi.invokeTool(tool.server_id, tool.name, args);
      const businessData = extractBusinessData(res.result);
      const responseStr = typeof businessData === 'string' ? businessData : JSON.stringify(businessData, null, 2);
      // Build a scene name from args
      const argSummary = Object.entries(args).map(([k, v]) => `${k}=${v}`).join(', ');
      onGenerated(argSummary ? `真实结果: ${argSummary}` : '真实结果', responseStr);
      setOpen(false);
      setArgsText('{}');
    } catch (e) { alert(`调用失败: ${e}`); }
    finally { setRunning(false); }
  };

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} disabled={!tool.server_id}>
        <Play size={12} /> 从真实结果生成
      </Button>
    );
  }

  return (
    <div className="bg-background rounded-xl border p-4 space-y-3 w-full">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">从真实调用结果生成 Mock</span>
        <button onClick={() => setOpen(false)} className="text-[11px] text-muted-foreground hover:text-foreground">取消</button>
      </div>
      <div>
        <label className="text-[11px] text-muted-foreground mb-0.5 block">调用参数 (JSON)</label>
        <Textarea
          value={argsText}
          onChange={e => setArgsText(e.target.value)}
          className="h-20 text-[11px] font-mono resize-none"
          placeholder='{"phone": "13800000001"}'
        />
      </div>
      <Button size="xs" onClick={handleRun} disabled={running}>
        <Play size={11} /> {running ? '调用中...' : '执行并生成'}
      </Button>
    </div>
  );
}

// ── Step 6: Test & Publish ───────────────────────────────────────────────────

function TestStep({ tool, onTestResult }: { tool: McpToolRecord; onTestResult?: (passed: boolean) => void }) {
  const inputSchema = tool.input_schema ? JSON.parse(tool.input_schema) as Record<string, any> : null;
  const inputProperties = inputSchema?.properties ?? {};
  const [testMode, setTestMode] = useState<'real' | 'mock'>(tool.mocked ? 'mock' : 'real');

  // Prefill args from first mock rule's match expression
  const [args, setArgs] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const key of Object.keys(inputProperties)) init[key] = '';
    // Try to extract values from first mock rule match: e.g. phone == "13800000001"
    if (tool.mock_rules) {
      try {
        const rules = JSON.parse(tool.mock_rules) as MockRule[];
        if (rules.length > 0 && rules[0].match) {
          const matchExpr = rules[0].match;
          // Parse simple expressions like: phone == "13800000001"
          for (const key of Object.keys(inputProperties)) {
            const regex = new RegExp(`${key}\\s*==\\s*["']([^"']+)["']`);
            const m = matchExpr.match(regex);
            if (m) init[key] = m[1];
          }
        }
      } catch { /* ignore */ }
    }
    return init;
  });
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ success: boolean; data: unknown; elapsed_ms: number; path: string; contractValid?: boolean; contractErrors?: string[] } | null>(null);

  const handleRun = async () => {
    if (!tool.server_id) { alert('此工具未分配 Server，无法执行'); return; }
    setRunning(true);
    setResult(null);
    try {
      // Parse numeric args
      const parsedArgs: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(args)) {
        const propType = inputProperties[k]?.type;
        if (propType === 'number' || propType === 'integer') parsedArgs[k] = Number(v) || 0;
        else if (propType === 'boolean') parsedArgs[k] = v === 'true';
        else parsedArgs[k] = v;
      }

      let response: { result: unknown; elapsed_ms: number; mock?: boolean; matched_rule?: string };
      let path: string;

      if (testMode === 'mock') {
        response = await mcpApi.mockInvokeTool(tool.server_id, tool.name, parsedArgs);
        path = `Mock → ${(response as any).matched_rule || '匹配规则'}`;
      } else {
        response = await mcpApi.invokeTool(tool.server_id, tool.name, parsedArgs);
        path = `Real → ${tool.impl_type === 'script' ? tool.handler_key : tool.impl_type ?? 'unknown'}`;
      }

      // Extract business data from MCP content wrapper
      const businessData = extractBusinessData(response.result);

      // Validate output if schema exists
      let contractValid: boolean | undefined;
      let contractErrors: string[] | undefined;
      if (tool.output_schema) {
        try {
          const vr = await mcpApi.validateOutput(tool.id, businessData);
          contractValid = vr.valid;
          contractErrors = vr.errors;
        } catch { /* skip validation */ }
      }

      const passed = contractValid !== false;
      onTestResult?.(passed);

      setResult({
        success: true,
        data: businessData,
        elapsed_ms: response.elapsed_ms,
        path,
        contractValid,
        contractErrors,
      });
    } catch (e) {
      onTestResult?.(false);
      setResult({ success: false, data: String(e), elapsed_ms: 0, path: 'error' });
    } finally { setRunning(false); }
  };

  const checks = [
    { label: '输入契约已定义', ok: !!tool.input_schema },
    { label: '输出契约已定义', ok: !!tool.output_schema },
    { label: 'Real 实现已配置', ok: !!tool.impl_type },
    { label: '至少一条 Mock 场景', ok: !!tool.mock_rules },
    { label: '最近测试通过', ok: result?.success === true && result?.contractValid !== false },
  ];
  const allGreen = checks.every(c => c.ok);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-1">测试与发布</h2>
        <p className="text-xs text-muted-foreground">运行测试并验证契约。</p>
      </div>

      {/* Test runner */}
      <div className="bg-background rounded-xl border p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">测试运行</h3>
          <div className="flex rounded-lg border overflow-hidden">
            <button
              type="button"
              onClick={() => setTestMode('real')}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${testMode === 'real' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-accent'}`}
            >Real</button>
            <button
              type="button"
              onClick={() => setTestMode('mock')}
              className={`px-3 py-1.5 text-xs font-medium transition-colors border-l ${testMode === 'mock' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-accent'}`}
            >Mock</button>
          </div>
        </div>

        {/* Input form */}
        {Object.keys(inputProperties).length > 0 ? (
          <div className="space-y-2">
            {Object.entries(inputProperties).map(([key, prop]: [string, any]) => (
              <div key={key} className="flex items-center gap-2">
                <label className="text-[11px] font-mono w-28 text-right text-muted-foreground flex-shrink-0">{key}</label>
                <Input
                  value={args[key] ?? ''}
                  onChange={e => setArgs({ ...args, [key]: e.target.value })}
                  placeholder={prop.description ?? prop.type}
                  className="text-[11px] font-mono flex-1"
                />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground">此工具无输入参数</p>
        )}

        <Button size="sm" onClick={handleRun} disabled={running || !tool.server_id}>
          <Play size={12} /> {running ? '执行中...' : '运行测试'}
        </Button>
      </div>

      {/* Result */}
      {result && (
        <div className={`bg-background rounded-xl border p-5 space-y-3 ${result.success ? 'border-emerald-200' : 'border-destructive/30'}`}>
          <h3 className="text-sm font-semibold">执行结果</h3>
          <div className="text-xs space-y-1.5">
            <div className="flex justify-between">
              <span className="text-muted-foreground">状态</span>
              <Badge variant={result.success ? 'default' : 'destructive'} className="text-[9px]">
                {result.success ? '成功' : '失败'}
              </Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">执行路径</span>
              <span className="font-mono">{result.path}</span>
            </div>
            {result.elapsed_ms > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">耗时</span>
                <span>{result.elapsed_ms}ms</span>
              </div>
            )}
            {result.contractValid !== undefined && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">契约校验</span>
                <Badge variant={result.contractValid ? 'default' : 'destructive'} className="text-[9px]">
                  {result.contractValid ? '通过' : '不匹配'}
                </Badge>
              </div>
            )}
          </div>
          {result.contractErrors && result.contractErrors.length > 0 && (
            <div className="text-[11px] text-destructive bg-destructive/5 p-2 rounded">
              {result.contractErrors.map((e, i) => <div key={i}>{e}</div>)}
            </div>
          )}
          {/* Field alignment card */}
          {result.success && tool.output_schema_content && typeof result.data === 'object' && result.data !== null && (
            <ContractAlignmentCard
              alignment={alignSchemaWithData(tool.output_schema_content as Record<string, unknown>, result.data)}
              title="字段对齐"
            />
          )}
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block">返回 JSON</label>
            <pre className="text-[11px] font-mono bg-muted p-3 rounded-lg overflow-auto max-h-60">
              {typeof result.data === 'string' ? result.data : JSON.stringify(result.data, null, 2)}
            </pre>
          </div>
        </div>
      )}

      {/* Publish checklist */}
      <div className="bg-background rounded-xl border p-5">
        <h3 className="text-sm font-semibold mb-3">发布检查</h3>
        <div className="space-y-2 text-xs">
          {checks.map((c, i) => (
            <div key={i} className="flex items-center gap-2">
              {c.ok ? <Check size={12} className="text-emerald-500" /> : <AlertTriangle size={12} className="text-amber-500" />}
              <span className={c.ok ? '' : 'text-muted-foreground'}>{c.label}</span>
            </div>
          ))}
        </div>
        {allGreen && (
          <div className="mt-4 p-3 bg-emerald-50 rounded-lg text-xs text-emerald-700 font-medium">
            所有检查通过，工具已就绪。
          </div>
        )}
      </div>
    </div>
  );
}

// ── Right Sidebar ────────────────────────────────────────────────────────────

function SummarySidebar({ tool, servers }: { tool: McpToolRecord; servers: McpServer[] }) {
  const mockRules: MockRule[] = tool.mock_rules ? JSON.parse(tool.mock_rules) : [];
  const inputSchema = tool.input_schema ? JSON.parse(tool.input_schema) : null;
  const inputFieldCount = inputSchema?.properties ? Object.keys(inputSchema.properties).length : 0;
  const outputSchema = tool.output_schema_content as Record<string, any> | null;
  const outputFieldCount = outputSchema?.properties ? Object.keys(outputSchema.properties).length : 0;

  // Risk checks
  const risks: string[] = [];
  if (!tool.output_schema) risks.push('输出契约未定义');
  if (!tool.impl_type) risks.push('Real 实现未配置');
  if (tool.impl_type && mockRules.length === 0) risks.push('无 Mock 场景');

  return (
    <div className="space-y-5 text-xs">
      <div>
        <h3 className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wider mb-2">工具摘要</h3>
        <div className="space-y-1.5">
          <div className="flex justify-between"><span className="text-muted-foreground">Server</span><span className="font-medium">{servers.find(s => s.id === tool.server_id)?.name ?? '—'}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">模式</span><Badge variant={tool.mocked ? 'secondary' : 'default'} className="text-[9px]">{tool.mocked ? 'Mock' : 'Real'}</Badge></div>
          <div className="flex justify-between"><span className="text-muted-foreground">实现</span><span className="font-medium">{tool.impl_type === 'script' ? '脚本' : tool.impl_type === 'db' ? 'DB' : tool.impl_type === 'api' ? 'API' : '—'}</span></div>
        </div>
      </div>

      <div className="border-t pt-4">
        <h3 className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wider mb-2">契约状态</h3>
        <div className="space-y-1.5">
          <div className="flex justify-between"><span className="text-muted-foreground">输入契约</span><Badge variant={tool.input_schema ? 'default' : 'outline'} className="text-[9px]">{tool.input_schema ? `${inputFieldCount} 个参数` : '未定义'}</Badge></div>
          <div className="flex justify-between"><span className="text-muted-foreground">输出契约</span><Badge variant={tool.output_schema ? 'default' : 'destructive'} className="text-[9px]">{tool.output_schema ? `${outputFieldCount} 个字段` : '未定义'}</Badge></div>
        </div>
      </div>

      {tool.handler_key && (
        <div className="border-t pt-4">
          <h3 className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wider mb-2">实现</h3>
          <div className="font-mono text-[11px] bg-muted p-2 rounded break-all">{tool.handler_key}</div>
        </div>
      )}

      <div className="border-t pt-4">
        <h3 className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wider mb-2">Mock</h3>
        <div className="space-y-1.5">
          <div className="flex justify-between"><span className="text-muted-foreground">场景数</span><span>{mockRules.length}</span></div>
          {mockRules.length > 0 && (
            <div className="space-y-0.5 mt-1">
              {mockRules.slice(0, 4).map((r, i) => (
                <div key={i} className="text-[10px] text-muted-foreground truncate">
                  {r.scene_name || (r.match ? r.match.slice(0, 30) : '默认兜底')}
                </div>
              ))}
              {mockRules.length > 4 && <div className="text-[10px] text-muted-foreground">...还有 {mockRules.length - 4} 个</div>}
            </div>
          )}
        </div>
      </div>

      {tool.skills && tool.skills.length > 0 && (
        <div className="border-t pt-4">
          <h3 className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wider mb-2">关联 Skill</h3>
          <div className="flex gap-1 flex-wrap">{tool.skills.map(s => <Badge key={s} variant="secondary" className="text-[9px]">{s}</Badge>)}</div>
        </div>
      )}

      {risks.length > 0 && (
        <div className="border-t pt-4">
          <h3 className="font-semibold text-[11px] text-amber-600 uppercase tracking-wider mb-2">风险提示</h3>
          <div className="space-y-1">
            {risks.map((r, i) => (
              <div key={i} className="flex items-center gap-1.5 text-[11px] text-amber-600">
                <AlertTriangle size={10} /> {r}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── DB Binding Panel ─────────────────────────────────────────────────────────

function DbBindingPanel({ toolId, config, outputSchema, onUpdated }: { toolId: string; config: string | null; outputSchema: Record<string, unknown> | null; onUpdated: () => void }) {
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
  const [notFoundStrategy, setNotFoundStrategy] = useState<string>(dbCfg.not_found_strategy ?? 'error');

  useEffect(() => { fetch('/api/mcp/resources/db-schema/tables').then(r => r.json()).then(d => setTables(d.tables ?? [])).catch(() => {}); }, []);
  useEffect(() => { if (!table) { setColumns([]); return; } fetch(`/api/mcp/resources/db-schema/columns?table=${table}`).then(r => r.json()).then(d => setColumns(d.columns ?? [])).catch(() => {}); }, [table]);
  useEffect(() => { if (!table) { setSqlPreview(''); return; } mcpApi.sqlPreview(toolId, { table, operation, where: conditions, columns: selectedColumns }).then(r => setSqlPreview(r.sql)).catch(() => setSqlPreview('')); }, [table, operation, conditions, selectedColumns, toolId]);

  const handleSave = async () => {
    setSaving(true);
    try { await mcpApi.updateExecutionConfig(toolId, { impl_type: 'db', db: { table, operation, where: conditions, columns: selectedColumns, not_found_strategy: notFoundStrategy } }); onUpdated(); }
    catch (e) { alert(`保存失败: ${e}`); } finally { setSaving(false); }
  };

  // Contract alignment: compare selected DB columns vs output_schema fields
  const schemaFields = extractSchemaFields(outputSchema);
  const dbColumnNames = selectedColumns.length > 0 ? selectedColumns : [];
  const alignment = schemaFields.length > 0 && dbColumnNames.length > 0
    ? compareAlignment(schemaFields, dbColumnNames)
    : null;

  return (
    <div className="space-y-4">
      {/* 1. 资源 */}
      <div className="bg-background rounded-xl border p-5 space-y-3">
        <h3 className="text-sm font-semibold">数据库资源</h3>
        <div className="text-[11px] bg-muted p-3 rounded-lg space-y-1">
          <div className="flex justify-between"><span className="text-muted-foreground">类型</span><span className="font-medium">本地 SQLite (business_db)</span></div>
          {existing.resource_id && <div className="flex justify-between"><span className="text-muted-foreground">资源 ID</span><span className="font-mono">{existing.resource_id}</span></div>}
        </div>
      </div>

      {/* 2. 查询定义 */}
      <div className="bg-background rounded-xl border p-5 space-y-4">
        <h3 className="text-sm font-semibold">查询定义</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">表</label>
            <Select value={table} onValueChange={v => { if (v) { setTable(v); setSelectedColumns([]); } }}>
              <SelectTrigger className="text-xs h-8 font-mono"><SelectValue placeholder="选择表" /></SelectTrigger>
              <SelectContent>{tables.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">操作</label>
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

        {/* 条件 */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">条件映射</label>
          {conditions.map((w, i) => (
            <div key={i} className="flex gap-1.5 items-center mb-1">
              <Input value={w.param} onChange={e => { const n = [...conditions]; n[i] = { ...n[i], param: e.target.value }; setConditions(n); }} placeholder="工具参数" className="w-28 text-[11px] font-mono" />
              <span className="text-xs">=</span>
              <Select value={w.column || ''} onValueChange={v => { if (!v) return; const n = [...conditions]; n[i] = { ...n[i], column: v }; setConditions(n); }}>
                <SelectTrigger className="w-36 text-[11px] font-mono h-7"><SelectValue placeholder="表字段" /></SelectTrigger>
                <SelectContent>{columns.map(c => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
              <Button variant="ghost" size="icon-xs" className="text-destructive" onClick={() => setConditions(conditions.filter((_, j) => j !== i))}><Trash2 size={11} /></Button>
            </div>
          ))}
          <Button variant="ghost" size="xs" onClick={() => setConditions([...conditions, { param: '', column: '', op: '=' }])}><Plus size={11} /> 添加</Button>
        </div>

        {/* 返回字段 */}
        {columns.length > 0 && (
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">返回字段</label>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {columns.map(c => {
                const isSchemaField = schemaFields.includes(c.name);
                return (
                  <label key={c.name} className={`flex items-center gap-1 text-[11px] font-mono cursor-pointer ${isSchemaField ? 'font-medium' : ''}`}>
                    <input type="checkbox" checked={selectedColumns.includes(c.name)} onChange={e => setSelectedColumns(e.target.checked ? [...selectedColumns, c.name] : selectedColumns.filter(n => n !== c.name))} className="size-3 rounded" />
                    {c.name}
                    {isSchemaField && <span className="text-[9px] text-emerald-500 ml-0.5">契约</span>}
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {sqlPreview && <div><label className="text-xs font-medium text-muted-foreground mb-1 block">SQL 预览</label><pre className="text-[11px] font-mono bg-muted p-3 rounded-lg">{sqlPreview}</pre></div>}
      </div>

      {/* 3. 输出映射 */}
      {schemaFields.length > 0 && selectedColumns.length > 0 && (
        <div className="bg-background rounded-xl border p-5 space-y-3">
          <h3 className="text-sm font-semibold">输出映射</h3>
          <p className="text-[11px] text-muted-foreground">DB 返回字段与输出契约的对应关系</p>
          <div className="space-y-1">
            {schemaFields.map(field => {
              const isDirectMatch = selectedColumns.includes(field);
              return (
                <div key={field} className="flex items-center gap-2 text-[11px] py-1 border-b last:border-0">
                  <span className="font-mono w-32 text-right text-muted-foreground">{isDirectMatch ? field : '—'}</span>
                  <span className="text-muted-foreground/40">→</span>
                  <span className={`font-mono font-medium ${isDirectMatch ? '' : 'text-amber-600'}`}>{field}</span>
                  {isDirectMatch
                    ? <Badge variant="default" className="text-[8px] ml-auto">直接</Badge>
                    : <Badge variant="secondary" className="text-[8px] ml-auto">派生</Badge>
                  }
                </div>
              );
            })}
          </div>
          {alignment && <ContractAlignmentCard alignment={alignment} title="DB 字段覆盖" />}
        </div>
      )}

      {/* 4. 失败策略 */}
      <div className="bg-background rounded-xl border p-5 space-y-3">
        <h3 className="text-sm font-semibold">失败策略</h3>
        <p className="text-[11px] text-muted-foreground">查不到记录时如何返回</p>
        <div className="space-y-1.5">
          {([
            { value: 'error', label: 'success: false + 错误消息' },
            { value: 'empty', label: 'success: true, data: null' },
            { value: 'default', label: 'success: true, data: {} 空对象' },
          ] as const).map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setNotFoundStrategy(opt.value)}
              className={`w-full text-left px-3 py-2 rounded-lg border text-xs transition-colors ${
                notFoundStrategy === opt.value
                  ? 'border-primary bg-primary/5 font-medium'
                  : 'border-border hover:bg-accent'
              }`}
            >
              <code className="bg-muted px-1 rounded">{opt.label}</code>
            </button>
          ))}
        </div>
      </div>

      <div className="flex justify-end"><Button size="sm" onClick={handleSave} disabled={saving}><Save size={12} /> 保存</Button></div>
    </div>
  );
}

// ── API Panel ────────────────────────────────────────────────────────────────

function ApiPanel({ toolId, config, outputSchema, onUpdated }: { toolId: string; config: string | null; outputSchema: Record<string, unknown> | null; onUpdated: () => void }) {
  const existing = config ? JSON.parse(config) as Record<string, any> : {};
  const apiCfg = existing.api ?? {};
  const [url, setUrl] = useState(apiCfg.url ?? '');
  const [method, setMethod] = useState(apiCfg.method ?? 'POST');
  const [timeout, setTimeout_] = useState(apiCfg.timeout ?? 10000);
  const [headers, setHeaders] = useState<string>(apiCfg.headers ? JSON.stringify(apiCfg.headers, null, 2) : '{}');
  const [bodyTemplate, setBodyTemplate] = useState<string>(apiCfg.body_template ?? '');
  const [responsePath, setResponsePath] = useState<string>(apiCfg.response_path ?? '$.data');
  const [errorMappings, setErrorMappings] = useState<Array<{ status: string; error_code: string; message: string }>>(apiCfg.error_mappings ?? []);
  const [saving, setSaving] = useState(false);
  const [resources, setResources] = useState<Array<{ id: string; name: string; type: string; api_base_url: string | null }>>([]);

  useEffect(() => {
    mcpApi.listResources().then(r => setResources((r.items ?? []).filter((res: any) => res.type === 'api'))).catch(() => {});
  }, []);

  const handleSave = async () => {
    if (!url.trim()) { alert('URL 不能为空'); return; }
    let parsedHeaders = {};
    try { parsedHeaders = JSON.parse(headers); } catch { /* ignore */ }
    setSaving(true);
    try {
      await mcpApi.updateExecutionConfig(toolId, {
        impl_type: 'api',
        resource_id: existing.resource_id,
        api: {
          url: url.trim(), method, timeout,
          headers: parsedHeaders,
          body_template: bodyTemplate || undefined,
          response_path: responsePath || undefined,
          error_mappings: errorMappings.length > 0 ? errorMappings : undefined,
        },
      });
      onUpdated();
    } catch (e) { alert(`保存失败: ${e}`); } finally { setSaving(false); }
  };

  // Request preview
  const requestPreview = `${method} ${url}\nContent-Type: application/json${
    bodyTemplate ? `\n\n${bodyTemplate}` : '\n\n{ ...工具参数 }'
  }`;

  return (
    <div className="space-y-4">
      {/* 1. API 资源 */}
      {resources.length > 0 && (
        <div className="bg-background rounded-xl border p-5 space-y-3">
          <h3 className="text-sm font-semibold">API 资源</h3>
          <div className="text-[11px] text-muted-foreground mb-2">选择已注册的 API 资源，或直接填写完整 URL</div>
          <div className="flex flex-wrap gap-2">
            {resources.map(r => (
              <button
                key={r.id}
                onClick={() => { if (r.api_base_url) setUrl(r.api_base_url); }}
                className="text-[11px] px-3 py-1.5 rounded-lg border hover:bg-accent"
              >
                <span className="font-medium">{r.name}</span>
                {r.api_base_url && <span className="ml-1.5 text-muted-foreground font-mono">{r.api_base_url}</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 2. 请求定义 */}
      <div className="bg-background rounded-xl border p-5 space-y-4">
        <h3 className="text-sm font-semibold">请求定义</h3>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label className="text-xs font-medium text-muted-foreground mb-1 block">URL</label>
            <Input value={url} onChange={e => setUrl(e.target.value)} className="text-xs font-mono" placeholder="http://127.0.0.1:18008/api/..." />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Method</label>
            <Select value={method} onValueChange={v => { if (v) setMethod(v); }}>
              <SelectTrigger className="text-xs h-8"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="POST">POST</SelectItem><SelectItem value="GET">GET</SelectItem><SelectItem value="PUT">PUT</SelectItem><SelectItem value="DELETE">DELETE</SelectItem></SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">超时 (ms)</label>
            <Input type="number" value={timeout} onChange={e => setTimeout_(Number(e.target.value))} className="text-xs" />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Headers (JSON)</label>
          <Textarea value={headers} onChange={e => setHeaders(e.target.value)} className="text-[11px] font-mono h-16 resize-none" placeholder='{"Authorization": "Bearer ..."}' />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Body 模板 <span className="opacity-50">(留空=直接转发工具参数)</span></label>
          <Textarea value={bodyTemplate} onChange={e => setBodyTemplate(e.target.value)} className="text-[11px] font-mono h-16 resize-none" placeholder='{"phone": "{phone}", "otp": "{otp}"}' />
        </div>

        {/* 请求预览 */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">请求预览</label>
          <pre className="text-[11px] font-mono bg-muted p-3 rounded-lg overflow-auto max-h-24">{requestPreview}</pre>
        </div>
      </div>

      {/* 3. 响应映射 */}
      <div className="bg-background rounded-xl border p-5 space-y-3">
        <h3 className="text-sm font-semibold">响应映射</h3>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">提取路径 <span className="opacity-50">(从上游响应中取哪一层)</span></label>
          <Input value={responsePath} onChange={e => setResponsePath(e.target.value)} className="text-xs font-mono" placeholder="$.data" />
          <p className="text-[10px] text-muted-foreground mt-1">例如上游返回 {`{"code":0,"data":{...}}`}，填 <code className="bg-muted px-1 rounded">$.data</code> 提取 data 层</p>
        </div>
        {outputSchema && (
          <div className="text-[11px] space-y-1 mt-2">
            <span className="text-muted-foreground">输出契约要求以下字段：</span>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {extractSchemaFields(outputSchema).map(f => (
                <span key={f} className="font-mono px-1.5 py-0.5 bg-muted rounded text-[10px]">{f}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 4. 错误映射 */}
      <div className="bg-background rounded-xl border p-5 space-y-3">
        <h3 className="text-sm font-semibold">错误映射</h3>
        <p className="text-[11px] text-muted-foreground">HTTP 错误码如何映射为工具返回</p>
        {errorMappings.map((em, i) => (
          <div key={i} className="flex gap-2 items-center">
            <Input value={em.status} onChange={e => { const n = [...errorMappings]; n[i] = { ...n[i], status: e.target.value }; setErrorMappings(n); }} placeholder="401" className="w-16 text-[11px] font-mono" />
            <span className="text-[11px] text-muted-foreground">→</span>
            <Input value={em.error_code} onChange={e => { const n = [...errorMappings]; n[i] = { ...n[i], error_code: e.target.value }; setErrorMappings(n); }} placeholder="error_code" className="w-32 text-[11px] font-mono" />
            <Input value={em.message} onChange={e => { const n = [...errorMappings]; n[i] = { ...n[i], message: e.target.value }; setErrorMappings(n); }} placeholder="错误消息" className="flex-1 text-[11px]" />
            <Button variant="ghost" size="icon-xs" className="text-destructive" onClick={() => setErrorMappings(errorMappings.filter((_, j) => j !== i))}><Trash2 size={11} /></Button>
          </div>
        ))}
        <Button variant="ghost" size="xs" onClick={() => setErrorMappings([...errorMappings, { status: '', error_code: '', message: '' }])}><Plus size={11} /> 添加错误映射</Button>
      </div>

      <div className="flex justify-end"><Button size="sm" onClick={handleSave} disabled={saving}><Save size={12} /> 保存</Button></div>
    </div>
  );
}
