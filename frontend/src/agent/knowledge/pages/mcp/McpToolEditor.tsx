/**
 * McpToolEditor.tsx — Tool Contract Studio
 *
 * 5 步骤流程（严格 MCP 对齐）：
 * Contract 组: Contract Basics / Input Schema / Output Schema
 * Testing 组: Mock Scenarios / Validation
 * 三栏布局：左导航 + 中编辑区 + 右摘要栏
 *
 * Implementation 编辑已迁移到 Runtime Bindings tab（BindingDetailDrawer）。
 * 此页面仅保留只读 Runtime Summary 卡片 + 跳转按钮。
 */
import React, { useState, useEffect } from 'react';
import { Save, ArrowLeft, Plus, Trash2, ChevronRight, Check, AlertTriangle, Circle, Play, Link2 } from 'lucide-react';
import { mcpApi, type McpToolRecord, type McpServer, type McpHandler, type MockRule, type ToolImplementation } from './api';
import { SchemaTableEditor } from './SchemaTableEditor';
import { ContractAlignmentCard, alignSchemaWithMockResponse, alignSchemaWithData, compareAlignment, type AlignmentResult } from './ContractAlignmentCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { t, tpl, type Lang } from './i18n';

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
  onOpenBinding?: (toolId: string) => void;
  initialStep?: Step;
  fromServer?: string;
  lang?: Lang;
}

type Step = 'overview' | 'input' | 'output' | 'mock' | 'test';

type StepGroup = 'contract' | 'implementation';

const STEP_DEFS: Array<{ id: Step; labelKey: 'step_contract' | 'step_input_schema' | 'step_output_schema' | 'step_mock_scenarios' | 'step_validation'; group: StepGroup }> = [
  { id: 'overview', labelKey: 'step_contract', group: 'contract' },
  { id: 'input', labelKey: 'step_input_schema', group: 'contract' },
  { id: 'output', labelKey: 'step_output_schema', group: 'contract' },
  { id: 'mock', labelKey: 'step_mock_scenarios', group: 'implementation' },
  { id: 'test', labelKey: 'step_validation', group: 'implementation' },
];

export function McpToolEditor({ toolId, onBack, onUpdated, onOpenBinding, initialStep, fromServer, lang = 'zh' as Lang }: Props) {
  const T = t(lang);
  const STEPS = STEP_DEFS.map(s => ({ ...s, label: T[s.labelKey] }));
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

  if (!tool) return <div className="flex items-center justify-center h-full text-sm text-muted-foreground">{T.loading}</div>;

  const handleUpdated = () => { reload(); onUpdated?.(); };

  // 步骤状态
  const stepStatus = (s: Step): 'done' | 'warning' | 'empty' | 'current' => {
    if (s === step) return 'current';
    switch (s) {
      case 'overview': return 'done';
      case 'input': return tool.input_schema ? 'done' : 'empty';
      case 'output': return tool.output_schema ? 'done' : 'warning';
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
          <ArrowLeft size={14} /> {fromServer ? tpl(T.back_to, { name: fromServer }) : T.back}
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">
            <span className="font-mono">{tool.name}</span>
          </h1>
          <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
            <span>{servers.find(s => s.id === tool.server_id)?.name ?? T.no_server_assigned}</span>
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
            {tool.mocked ? T.mode_mock : T.mode_real}
          </Badge>
          <Badge variant={tool.adapter_type ? 'outline' : 'destructive'} className="text-[10px] px-2">
            {tool.adapter_type === 'script' ? T.adapter_script : tool.adapter_type === 'remote_mcp' ? T.adapter_mcp : tool.adapter_type === 'api_proxy' ? T.adapter_api : tool.adapter_type ?? T.not_configured}
          </Badge>
          <Badge variant={tool.output_schema ? 'outline' : 'destructive'} className="text-[10px] px-2">
            {tool.output_schema ? T.contract_defined : T.contract_undefined}
          </Badge>
        </div>
      </div>

      {/* ── Three-column layout ────────────────────────────────────────────── */}
      <ResizablePanelGroup orientation="horizontal" className="flex-1" id="tool-editor">
        {/* Left: Step Navigation */}
        <ResizablePanel id="tool-left" defaultSize="15%" minSize="10%" maxSize="25%">
        <div className="h-full border-r bg-background flex flex-col">
          <div className="p-4 space-y-1 flex-1">
            {/* Contract 组 */}
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-3 pt-1 pb-1">{T.group_contract}</div>
            {STEPS.filter(s => s.group === 'contract').map((s, i) => {
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
            {/* Implementation 组 */}
            <div className="border-t my-2" />
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-3 pt-1 pb-1">{T.group_implementation}</div>
            {STEPS.filter(s => s.group === 'implementation').map((s, i) => {
              const globalIdx = STEPS.findIndex(st => st.id === s.id);
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
                  <span className={`flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold ${
                    status === 'done' ? 'bg-emerald-100 text-emerald-600' :
                    status === 'warning' ? 'bg-amber-100 text-amber-600' :
                    isCurrent ? 'bg-primary text-primary-foreground ring-2 ring-primary/20' :
                    'bg-muted text-muted-foreground'
                  }`}>
                    {status === 'done' ? <Check size={12} /> :
                     status === 'warning' ? <AlertTriangle size={10} /> :
                     <span>{globalIdx + 1}</span>}
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
        </ResizablePanel>

        <ResizableHandle />

        {/* Center: Main editing area */}
        <ResizablePanel id="tool-center" defaultSize="60%" minSize="30%">
        <div className="h-full overflow-auto p-6 pb-20">
          <div className="max-w-[760px] mx-auto">
            {step === 'overview' && <OverviewStep tool={tool} servers={servers} onUpdated={handleUpdated} onOpenBinding={onOpenBinding} lang={lang} />}
            {step === 'input' && <InputContractStep tool={tool} onUpdated={handleUpdated} lang={lang} />}
            {step === 'output' && <OutputContractStep tool={tool} onUpdated={handleUpdated} lang={lang} />}
            {step === 'mock' && <MockStep tool={tool} onUpdated={handleUpdated} lang={lang} />}
            {step === 'test' && <TestStep tool={tool} onTestResult={setLastTestPassed} lang={lang} />}
          </div>
        </div>
        </ResizablePanel>

        <ResizableHandle />

        {/* Right: Summary sidebar */}
        <ResizablePanel id="tool-right" defaultSize="25%" minSize="15%" maxSize="35%">
        <div className="h-full border-l bg-background p-4 overflow-auto">
          <SummarySidebar tool={tool} servers={servers} onOpenBinding={onOpenBinding} lang={lang} />
        </div>
        </ResizablePanel>
      </ResizablePanelGroup>

      {/* ── Bottom sticky action bar ───────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 py-3 bg-background border-t shadow-[0_-2px_8px_rgba(0,0,0,0.04)]">
        <Button
          variant="ghost"
          size="sm"
          onClick={prevStep}
          disabled={stepIdx === 0}
        >
          <ArrowLeft size={12} /> {T.prev_step}
        </Button>
        <div className="text-xs text-muted-foreground">
          {stepIdx + 1} / {STEPS.length} · {STEPS[stepIdx].label}
        </div>
        {stepIdx < STEPS.length - 1 ? (
          <Button size="sm" onClick={nextStep}>
            {T.next_step} <ChevronRight size={12} />
          </Button>
        ) : (
          <Button size="sm" variant={tool.output_schema && tool.adapter_type ? 'default' : 'outline'} disabled={!tool.output_schema}>
            <Check size={12} /> {T.publish_tool}
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Step 1: Overview ─────────────────────────────────────────────────────────

function OverviewStep({ tool, servers, onUpdated, onOpenBinding, lang = 'zh' as Lang }: { tool: McpToolRecord; servers: McpServer[]; onUpdated: () => void; onOpenBinding?: (toolId: string) => void; lang?: Lang }) {
  const T = t(lang);
  const [name, setName] = useState(tool.name);
  const [description, setDescription] = useState(tool.description);
  const [serverId, setServerId] = useState(tool.server_id ?? '');
  const [saving, setSaving] = useState(false);
  const [impl, setImpl] = useState<ToolImplementation | null>(null);

  useEffect(() => {
    mcpApi.getToolImplementation(tool.id).then(setImpl).catch(() => {});
  }, [tool.id]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await mcpApi.updateTool(tool.id, { name, description, server_id: serverId || undefined } as any);
      onUpdated();
    } catch (e) { alert(`${T.save_failed} ${e}`); }
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
    { label: T.checklist_input, level: tool.input_schema ? 'done' : 'empty' },
    { label: T.checklist_output, level: tool.output_schema ? 'done' : 'empty' },
    {
      label: T.checklist_binding,
      level: tool.adapter_type ? 'done' : 'empty',
      detail: tool.adapter_type ? undefined : T.unbound,
    },
    {
      label: T.checklist_mock_align,
      level: mockRules.length === 0 ? 'empty' : allMocksAligned ? 'done' : 'warn',
      detail: mockRules.length === 0 ? T.no_scenes : someMocksDrifted ? T.has_drift : undefined,
    },
  ];
  const doneCount = statusItems.filter(s => s.level === 'done').length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-1">{T.overview_title}</h2>
        <p className="text-xs text-muted-foreground">{T.overview_desc}</p>
      </div>

      {/* Quick completion status */}
      <div className="bg-background rounded-xl border p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-medium">{T.config_completeness}</span>
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
            <label className="text-xs font-medium text-muted-foreground mb-1 block">{T.tool_name_label}</label>
            <Input value={name} onChange={e => setName(e.target.value)} className="text-sm font-mono" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">{T.server_label}</label>
            <Select value={serverId} onValueChange={v => { if (v) setServerId(v); }}>
              <SelectTrigger className="text-sm h-9"><SelectValue placeholder={T.select_server}>{servers.find(s => s.id === serverId)?.name ?? '—'}</SelectValue></SelectTrigger>
              <SelectContent>{servers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">{T.description}</label>
          <Textarea value={description} onChange={e => setDescription(e.target.value)} className="text-sm resize-none h-16" />
        </div>

        {/* Current config summary */}
        <div className="grid grid-cols-3 gap-3 pt-2 border-t">
          <div className="text-[11px]">
            <span className="text-muted-foreground block mb-0.5">{T.current_mode}</span>
            <Badge variant={tool.mocked ? 'secondary' : 'default'} className="text-[9px]">{tool.mocked ? T.mode_mock : T.mode_real}</Badge>
          </div>
          <div className="text-[11px]">
            <span className="text-muted-foreground block mb-0.5">{T.impl_method}</span>
            <span className="font-medium">{tool.adapter_type === 'script' ? T.adapter_script : tool.adapter_type === 'remote_mcp' ? T.adapter_mcp : tool.adapter_type === 'api_proxy' ? T.adapter_api : tool.adapter_type ?? T.not_configured}</span>
          </div>
          <div className="text-[11px]">
            <span className="text-muted-foreground block mb-0.5">{T.mock_scenes_label}</span>
            <span className="font-medium">{tool.mock_rules ? tpl(T.n_count, { n: JSON.parse(tool.mock_rules).length }) : T.none}</span>
          </div>
        </div>
      </div>

      {/* Runtime Summary (read-only) */}
      <div className="bg-background rounded-xl border p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link2 size={14} className="text-muted-foreground" />
            <h3 className="text-xs font-semibold">{T.runtime_binding}</h3>
          </div>
          {onOpenBinding && (
            <Button variant="ghost" size="sm" className="text-xs h-7 gap-1 text-primary" onClick={() => onOpenBinding(tool.id)}>
              {T.open_in_bindings} <ChevronRight size={10} />
            </Button>
          )}
        </div>
        {impl && impl._source !== 'none' ? (
          <div className="grid grid-cols-2 gap-3 text-[11px]">
            <div>
              <span className="text-muted-foreground block mb-0.5">Adapter</span>
              <Badge variant="outline" className="text-[9px]">
                {impl.adapter_type === 'script' ? 'Script' : impl.adapter_type === 'remote_mcp' ? 'MCP' : impl.adapter_type === 'api_proxy' ? 'API Proxy' : impl.adapter_type ?? '—'}
              </Badge>
            </div>
            <div>
              <span className="text-muted-foreground block mb-0.5">Connector</span>
              <span className="font-medium font-mono">{impl.connector?.name ?? '—'}</span>
            </div>
            <div>
              <span className="text-muted-foreground block mb-0.5">Handler</span>
              <span className="font-medium font-mono">{impl.handler_key ?? '—'}</span>
            </div>
            <div>
              <span className="text-muted-foreground block mb-0.5">Status</span>
              <Badge variant={impl.status === 'active' ? 'default' : 'secondary'} className="text-[9px]">{impl.status}</Badge>
            </div>
          </div>
        ) : (
          <div className="text-[11px] text-muted-foreground py-2">
            {T.no_binding_hint}
            {onOpenBinding && (
              <Button variant="link" size="sm" className="text-xs h-auto p-0 ml-1" onClick={() => onOpenBinding(tool.id)}>
                {T.configure_binding}
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Skills & usage */}
      {tool.skills && tool.skills.length > 0 && (
        <div className="bg-background rounded-xl border p-5 space-y-3">
          <label className="text-xs font-medium text-muted-foreground block">{T.related_skills}</label>
          <div className="flex gap-1.5 flex-wrap">
            {tool.skills.map(s => <Badge key={s} variant="secondary" className="text-[11px]">{s}</Badge>)}
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <Button size="sm" onClick={handleSave} disabled={saving}><Save size={12} /> {saving ? T.saving : T.save}</Button>
      </div>

      <p className="text-[11px] text-muted-foreground">{T.next_define_input}</p>
    </div>
  );
}

// ── Step 2: Input Contract ───────────────────────────────────────────────────

function InputContractStep({ tool, onUpdated, lang = 'zh' as Lang }: { tool: McpToolRecord; onUpdated: () => void; lang?: Lang }) {
  const T = t(lang);
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
    } catch (e) { alert(`${T.save_failed} ${e}`); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold mb-1">{T.input_contract}</h2>
          <p className="text-xs text-muted-foreground">{T.input_contract_desc}</p>
        </div>
        {dirty && (
          <Button size="sm" onClick={handleSave} disabled={saving}>
            <Save size={12} /> {saving ? T.saving : T.save}
          </Button>
        )}
      </div>

      <div className="bg-background rounded-xl border p-5">
        <SchemaTableEditor
          schema={schema}
          onChange={handleChange}
          emptyText={T.no_params}
        />
      </div>

      <p className="text-[11px] text-muted-foreground">{T.next_define_output}</p>
    </div>
  );
}

// ── Step 3: Output Contract ──────────────────────────────────────────────────

function OutputContractStep({ tool, onUpdated, lang = 'zh' as Lang }: { tool: McpToolRecord; onUpdated: () => void; lang?: Lang }) {
  const T = t(lang);
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
    } catch (e) { alert(`${T.save_failed} ${e}`); }
    finally { setSaving(false); }
  };

  const handleInferFromExample = async () => {
    if (!exampleText.trim()) { alert(T.fill_example_first); return; }
    setInferring(true);
    try {
      const example = JSON.parse(exampleText);
      const { schema } = await mcpApi.inferSchema(example);
      setPendingSchema(schema);
      setDirty(true);
    } catch (e) { alert(`${T.infer_failed} ${e}`); }
    finally { setInferring(false); }
  };

  // Use pending schema if available (from infer or edit), otherwise use saved
  const displaySchema = pendingSchema ?? schemaContent;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold mb-1">{T.output_contract}</h2>
          <p className="text-xs text-muted-foreground">
            {T.output_contract_desc}
          </p>
        </div>
        {dirty && (
          <Button size="sm" onClick={handleSave} disabled={saving}>
            <Save size={12} /> {saving ? T.saving : T.save_schema}
          </Button>
        )}
      </div>

      <div className="bg-background rounded-xl border p-5">
        <SchemaTableEditor
          schema={displaySchema}
          onChange={handleChange}
          emptyText={T.no_output_schema}
        />
      </div>

      {/* 返回示例 + 推断 */}
      <div className="bg-background rounded-xl border p-5 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">{T.return_example}</span>
          <div className="flex gap-2">
            {tool.mock_rules && (
              <Button variant="ghost" size="xs" onClick={() => {
                try {
                  const rules = JSON.parse(tool.mock_rules!) as Array<{ response: string }>;
                  if (rules.length > 0) setExampleText(JSON.stringify(JSON.parse(rules[0].response), null, 2));
                } catch { /* ignore */ }
              }}>{T.fill_from_mock}</Button>
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
                } catch (e) { alert(`${T.call_failed} ${e}`); }
              }}>{T.fetch_from_real}</Button>
            )}
            <Button variant="outline" size="xs" onClick={handleInferFromExample} disabled={inferring}>
              {inferring ? T.inferring : T.infer_schema}
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
            <p>{T.no_example}</p>
            <p className="mt-1 text-[11px]">{T.no_example_hint}</p>
          </div>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground">{T.next_choose_impl}</p>
    </div>
  );
}

// ── Step 5: Mock Scenarios ───────────────────────────────────────────────────

function MockStep({ tool, onUpdated, lang = 'zh' as Lang }: { tool: McpToolRecord; onUpdated: () => void; lang?: Lang }) {
  const T = t(lang);
  const [rules, setRules] = useState<MockRule[]>(tool.mock_rules ? JSON.parse(tool.mock_rules) : []);
  const [saving, setSaving] = useState(false);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [validating, setValidating] = useState(false);
  const [validationResults, setValidationResults] = useState<Record<number, { valid: boolean; errors?: string[] }>>({});

  const handleSave = async () => {
    setSaving(true);
    try { await mcpApi.updateToolMockRules(tool.id, rules); onUpdated(); }
    catch (e) { alert(`${T.save_failed} ${e}`); }
    finally { setSaving(false); }
  };

  const updateRule = (i: number, patch: Partial<MockRule>) => {
    const n = [...rules];
    n[i] = { ...n[i], ...patch };
    setRules(n);
  };

  const handleValidateAll = async () => {
    if (!tool.output_schema) { alert(T.define_output_first); return; }
    setValidating(true);
    const results: Record<number, { valid: boolean; errors?: string[] }> = {};
    for (let i = 0; i < rules.length; i++) {
      try {
        const data = JSON.parse(rules[i].response);
        const r = await mcpApi.validateOutput(tool.id, data);
        results[i] = r;
      } catch {
        results[i] = { valid: false, errors: [T.json_invalid] };
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
    if (!rule.match) return T.default_fallback;
    return tpl(T.scene_n, { n: index + 1 });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold mb-1">{T.mock_scenes_title}</h2>
          <p className="text-xs text-muted-foreground">{T.mock_scenes_desc}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="xs" onClick={handleValidateAll} disabled={validating || rules.length === 0}>
            {validating ? T.validating_mock : T.validate_all_mock}
          </Button>
          <Button size="xs" onClick={handleSave} disabled={saving}>
            <Save size={11} /> {saving ? T.saving : T.save}
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
                    {!rule.match && <Badge variant="secondary" className="text-[9px]">{T.default_badge}</Badge>}
                    {alignment && (
                      <ContractAlignmentCard alignment={alignment} compact />
                    )}
                    {vr && (
                      <Badge variant={vr.valid ? 'default' : 'destructive'} className="text-[9px]">
                        {vr.valid ? T.value_valid : T.value_invalid}
                      </Badge>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {rule.match ? <span className="font-mono">{rule.match}</span> : <span className="italic">{T.match_all}</span>}
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
                    <label className="text-[11px] text-muted-foreground mb-0.5 block">{T.scene_name_label}</label>
                    <Input
                      value={rule.scene_name ?? ''}
                      onChange={e => updateRule(i, { scene_name: e.target.value })}
                      placeholder={T.scene_name_hint}
                      className="text-[11px]"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-muted-foreground mb-0.5 block">{T.match_condition} <span className="opacity-50">({T.match_empty_hint})</span></label>
                    <Input
                      value={rule.match}
                      onChange={e => updateRule(i, { match: e.target.value })}
                      placeholder='phone == "13800000001"'
                      className="text-[11px] font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-muted-foreground mb-0.5 block">{T.response_json}</label>
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
                    <ContractAlignmentCard alignment={alignment} title={T.field_alignment} />
                  )}
                  <div className="flex justify-between">
                    <Button variant="ghost" size="xs" onClick={() => setRules([...rules.slice(0, i + 1), { ...rule, scene_name: (rule.scene_name ?? '') + ` ${T.copy_suffix}`, tool_name: rule.tool_name }, ...rules.slice(i + 1)])}>
                      {T.copy_scene}
                    </Button>
                    <Button variant="ghost" size="xs" className="text-destructive" onClick={() => { setRules(rules.filter((_, j) => j !== i)); setExpandedIndex(null); }}>
                      <Trash2 size={11} /> {T.delete}
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
          <Plus size={12} /> {T.add_scene}
        </Button>
        <GenerateMockFromReal tool={tool} lang={lang} onGenerated={(scene_name, response) => {
          const newRule: MockRule = { tool_name: tool.name, scene_name, match: '', response };
          setRules([...rules, newRule]);
          setExpandedIndex(rules.length);
        }} />
      </div>

      <p className="text-[11px] text-muted-foreground">{T.next_run_test}</p>
    </div>
  );
}

/** 从真实调用结果生成 Mock 场景 */
function GenerateMockFromReal({ tool, onGenerated, lang = 'zh' as Lang }: {
  tool: McpToolRecord;
  onGenerated: (sceneName: string, response: string) => void;
  lang?: Lang;
}) {
  const T = t(lang);
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [argsText, setArgsText] = useState('{}');

  const handleRun = async () => {
    if (!tool.server_id) { alert(T.no_server_hint); return; }
    setRunning(true);
    try {
      const args = JSON.parse(argsText);
      const res = await mcpApi.invokeTool(tool.server_id, tool.name, args);
      const businessData = extractBusinessData(res.result);
      const responseStr = typeof businessData === 'string' ? businessData : JSON.stringify(businessData, null, 2);
      // Build a scene name from args
      const argSummary = Object.entries(args).map(([k, v]) => `${k}=${v}`).join(', ');
      onGenerated(argSummary ? tpl(T.real_result_args, { args: argSummary }) : T.real_result, responseStr);
      setOpen(false);
      setArgsText('{}');
    } catch (e) { alert(`${T.call_failed} ${e}`); }
    finally { setRunning(false); }
  };

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} disabled={!tool.server_id}>
        <Play size={12} /> {T.gen_from_real}
      </Button>
    );
  }

  return (
    <div className="bg-background rounded-xl border p-4 space-y-3 w-full">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">{T.gen_mock_title}</span>
        <button onClick={() => setOpen(false)} className="text-[11px] text-muted-foreground hover:text-foreground">{T.cancel}</button>
      </div>
      <div>
        <label className="text-[11px] text-muted-foreground mb-0.5 block">{T.call_args}</label>
        <Textarea
          value={argsText}
          onChange={e => setArgsText(e.target.value)}
          className="h-20 text-[11px] font-mono resize-none"
          placeholder='{"phone": "13800000001"}'
        />
      </div>
      <Button size="xs" onClick={handleRun} disabled={running}>
        <Play size={11} /> {running ? T.calling : T.execute_and_gen}
      </Button>
    </div>
  );
}

// ── Step 6: Test & Publish ───────────────────────────────────────────────────

function TestStep({ tool, onTestResult, lang = 'zh' as Lang }: { tool: McpToolRecord; onTestResult?: (passed: boolean) => void; lang?: Lang }) {
  const T = t(lang);
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
    if (!tool.server_id) { alert(T.no_server_run); return; }
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
        path = `Mock → ${(response as any).matched_rule || T.match_rule}`;
      } else {
        response = await mcpApi.invokeTool(tool.server_id, tool.name, parsedArgs);
        path = `Real → ${tool.adapter_type ?? 'unknown'}`;
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
    { label: T.check_input, ok: !!tool.input_schema },
    { label: T.check_output, ok: !!tool.output_schema },
    { label: T.check_binding, ok: !!tool.adapter_type },
    { label: T.check_mock, ok: !!tool.mock_rules },
    { label: T.check_test_pass, ok: result?.success === true && result?.contractValid !== false },
  ];
  const allGreen = checks.every(c => c.ok);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-1">{T.test_publish}</h2>
        <p className="text-xs text-muted-foreground">{T.test_desc}</p>
      </div>

      {/* Test runner */}
      <div className="bg-background rounded-xl border p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">{T.test_runner}</h3>
          <div className="flex rounded-lg border overflow-hidden">
            <button
              type="button"
              onClick={() => setTestMode('real')}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${testMode === 'real' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-accent'}`}
            >{T.mode_real}</button>
            <button
              type="button"
              onClick={() => setTestMode('mock')}
              className={`px-3 py-1.5 text-xs font-medium transition-colors border-l ${testMode === 'mock' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-accent'}`}
            >{T.mode_mock}</button>
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
          <p className="text-[11px] text-muted-foreground">{T.no_input_params}</p>
        )}

        <Button size="sm" onClick={handleRun} disabled={running || !tool.server_id}>
          <Play size={12} /> {running ? T.executing : T.run_test}
        </Button>
      </div>

      {/* Result */}
      {result && (
        <div className={`bg-background rounded-xl border p-5 space-y-3 ${result.success ? 'border-emerald-200' : 'border-destructive/30'}`}>
          <h3 className="text-sm font-semibold">{T.exec_result}</h3>
          <div className="text-xs space-y-1.5">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{T.col_status}</span>
              <Badge variant={result.success ? 'default' : 'destructive'} className="text-[9px]">
                {result.success ? T.success : T.failed}
              </Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{T.exec_path}</span>
              <span className="font-mono">{result.path}</span>
            </div>
            {result.elapsed_ms > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{T.duration}</span>
                <span>{result.elapsed_ms}ms</span>
              </div>
            )}
            {result.contractValid !== undefined && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{T.contract_check}</span>
                <Badge variant={result.contractValid ? 'default' : 'destructive'} className="text-[9px]">
                  {result.contractValid ? T.check_passed : T.check_not_matched}
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
              title={T.field_alignment}
            />
          )}
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block">{T.return_json}</label>
            <pre className="text-[11px] font-mono bg-muted p-3 rounded-lg overflow-auto max-h-60">
              {typeof result.data === 'string' ? result.data : JSON.stringify(result.data, null, 2)}
            </pre>
          </div>
        </div>
      )}

      {/* Publish checklist */}
      <div className="bg-background rounded-xl border p-5">
        <h3 className="text-sm font-semibold mb-3">{T.publish_checklist}</h3>
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
            {T.all_checks_ok}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Right Sidebar ────────────────────────────────────────────────────────────

function SummarySidebar({ tool, servers, onOpenBinding, lang = 'zh' as Lang }: { tool: McpToolRecord; servers: McpServer[]; onOpenBinding?: (toolId: string) => void; lang?: Lang }) {
  const T = t(lang);
  const mockRules: MockRule[] = tool.mock_rules ? JSON.parse(tool.mock_rules) : [];
  const inputSchema = tool.input_schema ? JSON.parse(tool.input_schema) : null;
  const inputFieldCount = inputSchema?.properties ? Object.keys(inputSchema.properties).length : 0;
  const outputSchema = tool.output_schema_content as Record<string, any> | null;
  const outputFieldCount = outputSchema?.properties ? Object.keys(outputSchema.properties).length : 0;

  // Risk checks
  const risks: string[] = [];
  if (!tool.output_schema) risks.push(T.contract_undefined);
  if (!tool.adapter_type) risks.push(T.risk_no_binding);
  if (tool.adapter_type && mockRules.length === 0) risks.push(T.step_mock_scenarios);

  return (
    <div className="space-y-5 text-xs">
      <div>
        <h3 className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wider mb-2">{T.tool_summary}</h3>
        <div className="space-y-1.5">
          <div className="flex justify-between"><span className="text-muted-foreground">Server</span><span className="font-medium">{servers.find(s => s.id === tool.server_id)?.name ?? '—'}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">{T.mode}</span><Badge variant={tool.mocked ? 'secondary' : 'default'} className="text-[9px]">{tool.mocked ? T.mode_mock : T.mode_real}</Badge></div>
          <div className="flex justify-between"><span className="text-muted-foreground">{T.col_adapter}</span><span className="font-medium">{tool.adapter_type === 'script' ? T.adapter_script : tool.adapter_type === 'remote_mcp' ? T.adapter_mcp : tool.adapter_type === 'api_proxy' ? T.adapter_api_proxy : tool.adapter_type ?? '—'}</span></div>
          {onOpenBinding && (
            <button onClick={() => onOpenBinding(tool.id)} className="flex items-center gap-1 text-[10px] text-primary hover:underline mt-1">
              <Link2 size={9} /> {T.open_in_bindings}
            </button>
          )}
        </div>
      </div>

      <div className="border-t pt-4">
        <h3 className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wider mb-2">{T.contract_status_title}</h3>
        <div className="space-y-1.5">
          <div className="flex justify-between"><span className="text-muted-foreground">{T.input_contract}</span><Badge variant={tool.input_schema ? 'default' : 'outline'} className="text-[9px]">{tool.input_schema ? tpl(T.params_count, { n: inputFieldCount }) : T.contract_undefined}</Badge></div>
          <div className="flex justify-between"><span className="text-muted-foreground">{T.output_contract}</span><Badge variant={tool.output_schema ? 'default' : 'destructive'} className="text-[9px]">{tool.output_schema ? tpl(T.fields_count, { n: outputFieldCount }) : T.contract_undefined}</Badge></div>
        </div>
      </div>

      <div className="border-t pt-4">
        <h3 className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wider mb-2">Mock</h3>
        <div className="space-y-1.5">
          <div className="flex justify-between"><span className="text-muted-foreground">{T.scene_count}</span><span>{mockRules.length}</span></div>
          {mockRules.length > 0 && (
            <div className="space-y-0.5 mt-1">
              {mockRules.slice(0, 4).map((r, i) => (
                <div key={i} className="text-[10px] text-muted-foreground truncate">
                  {r.scene_name || (r.match ? r.match.slice(0, 30) : T.default_fallback)}
                </div>
              ))}
              {mockRules.length > 4 && <div className="text-[10px] text-muted-foreground">{tpl(T.more_scenes, { n: mockRules.length - 4 })}</div>}
            </div>
          )}
        </div>
      </div>

      {tool.skills && tool.skills.length > 0 && (
        <div className="border-t pt-4">
          <h3 className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wider mb-2">{T.related_skill_title}</h3>
          <div className="flex gap-1 flex-wrap">{tool.skills.map(s => <Badge key={s} variant="secondary" className="text-[9px]">{s}</Badge>)}</div>
        </div>
      )}

      {risks.length > 0 && (
        <div className="border-t pt-4">
          <h3 className="font-semibold text-[11px] text-amber-600 uppercase tracking-wider mb-2">{T.risk_alert}</h3>
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
