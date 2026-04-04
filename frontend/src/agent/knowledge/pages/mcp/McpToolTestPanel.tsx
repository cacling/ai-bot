/**
 * McpToolTestPanel.tsx — 工具详情 & 测试弹窗
 *
 * 三个 Tab：详情 / Mock 规则 / 测试
 */
import React, { useState, useEffect, useCallback } from 'react';
import { X, Play, Info, FlaskConical, Database, Plus, Trash2, Save, Check } from 'lucide-react';
import { mcpApi, type McpServer, type McpToolInfo, type MockRule } from './api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';

interface Props {
  server: McpServer;
  tool: McpToolInfo;
  onClose: () => void;
  onServerUpdated?: () => void;
}

export function McpToolTestPanel({ server, tool, onClose, onServerUpdated }: Props) {
  const isPlanned = server.kind === 'planned';

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-[620px] max-h-[88vh] flex flex-col p-0">
        <DialogHeader className="px-4 py-3 border-b flex-shrink-0">
          <DialogTitle className="text-sm font-semibold font-mono">{tool.name}</DialogTitle>
          <div className="text-[11px] text-muted-foreground">Server: {server.name}{isPlanned ? ' (规划中)' : ''}</div>
        </DialogHeader>

        <Tabs defaultValue="detail" className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="w-full justify-start rounded-none border-b bg-transparent h-auto p-0">
            <TabsTrigger value="detail" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none gap-1.5 text-xs">
              <Info size={12} /> 详情
            </TabsTrigger>
            <TabsTrigger value="mock" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none gap-1.5 text-xs">
              <Database size={12} /> Mock 规则
            </TabsTrigger>
            <TabsTrigger value="test" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none gap-1.5 text-xs">
              <FlaskConical size={12} /> 测试
            </TabsTrigger>
          </TabsList>

          <TabsContent value="detail" className="flex-1 overflow-auto mt-0">
            <DetailTab server={server} tool={tool} />
          </TabsContent>
          <TabsContent value="mock" className="flex-1 overflow-auto mt-0">
            <MockTab server={server} tool={tool} onServerUpdated={onServerUpdated} />
          </TabsContent>
          <TabsContent value="test" className="flex-1 overflow-auto mt-0">
            <TestTab server={server} tool={tool} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// ── Detail Tab ───────────────────────────────────────────────────────────────

function DetailTab({ server, tool }: { server: McpServer; tool: McpToolInfo }) {
  const [skills, setSkills] = useState<string[]>([]);
  const isDisabled = (() => {
    try { return (JSON.parse(server.disabled_tools ?? '[]') as string[]).includes(tool.name); }
    catch { return false; }
  })();

  useEffect(() => {
    mcpApi.getToolsOverview().then(r => {
      const item = r.items.find(t => t.name === tool.name);
      if (item) setSkills(item.skills);
    }).catch(() => {});
  }, [tool.name]);

  const schemaProps = extractSchema(server, tool);

  const responseExample = (() => {
    try {
      if (tool.responseExample) return tool.responseExample;
      const allTools = server.tools_json ? JSON.parse(server.tools_json) : [];
      return allTools.find((t: { name: string }) => t.name === tool.name)?.responseExample ?? null;
    } catch { return null; }
  })();

  const mockCount = (() => {
    try {
      const rules = server.mock_rules ? JSON.parse(server.mock_rules) as MockRule[] : [];
      return rules.filter(r => r.tool_name === tool.name).length;
    } catch { return 0; }
  })();

  return (
    <div className="p-4 space-y-4">
      <div>
        <div className="text-[11px] font-medium text-muted-foreground mb-1">描述</div>
        <div className="text-xs">{tool.description || '(无描述)'}</div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant={isDisabled ? 'secondary' : 'default'}>{isDisabled ? '已禁用' : '已启用'}</Badge>
        {mockCount > 0 && <Badge variant="outline">{mockCount} 条 Mock 规则</Badge>}
      </div>

      <div>
        <div className="text-[11px] font-medium text-muted-foreground mb-1">参数 Schema</div>
        {schemaProps.length > 0 ? (
          <div className="rounded-lg border overflow-hidden">
            <Table className="text-[11px]">
              <TableHeader>
                <TableRow>
                  <TableHead>参数名</TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead>必填</TableHead>
                  <TableHead>说明</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schemaProps.map(([key, val]) => (
                  <TableRow key={key}>
                    <TableCell className="font-mono">{key}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {val.enum ? <span className="text-muted-foreground">{val.enum.join(' | ')}</span> : val.type ?? 'string'}
                    </TableCell>
                    <TableCell>{val.required ? <Check size={11} className="text-primary" /> : ''}</TableCell>
                    <TableCell className="text-muted-foreground">{val.description ?? ''}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="text-[11px] text-muted-foreground italic">无参数或 Schema 未定义</div>
        )}
      </div>

      {responseExample && (
        <div>
          <div className="text-[11px] font-medium text-muted-foreground mb-1">返回示例</div>
          <pre className="text-[11px] font-mono text-muted-foreground bg-muted border rounded-lg p-2 max-h-32 overflow-auto whitespace-pre-wrap">{responseExample}</pre>
        </div>
      )}

      <div>
        <div className="text-[11px] font-medium text-muted-foreground mb-1">关联的 Skill</div>
        {skills.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {skills.map(s => <Badge key={s} variant="secondary">{s}</Badge>)}
          </div>
        ) : (
          <div className="text-[11px] text-muted-foreground italic">无 Skill 引用此工具</div>
        )}
      </div>
    </div>
  );
}

// ── Mock Tab ─────────────────────────────────────────────────────────────────

function MockTab({ server, tool, onServerUpdated }: { server: McpServer; tool: McpToolInfo; onServerUpdated?: () => void }) {
  const [rules, setRules] = useState<MockRule[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      const all = server.mock_rules ? JSON.parse(server.mock_rules) as MockRule[] : [];
      setRules(all.filter(r => r.tool_name === tool.name));
    } catch { setRules([]); }
  }, [server.mock_rules, tool.name]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const allRules: MockRule[] = server.mock_rules ? JSON.parse(server.mock_rules) : [];
      const otherRules = allRules.filter(r => r.tool_name !== tool.name);
      const newRules = [...otherRules, ...rules.map(r => ({ ...r, tool_name: tool.name }))];
      await mcpApi.updateServer(server.id, { mock_rules: JSON.stringify(newRules) } as any);
      server.mock_rules = JSON.stringify(newRules);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onServerUpdated?.();
    } catch (e) {
      alert(`保存失败: ${e}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-muted-foreground">
          为 <span className="font-mono">{tool.name}</span> 定义 Mock 返回规则。
        </p>
        <Button size="xs" onClick={handleSave} disabled={saving}>
          {saved ? <Check size={11} /> : <Save size={11} />}
          {saving ? '保存中...' : saved ? '已保存' : '保存'}
        </Button>
      </div>

      {rules.map((rule, i) => (
        <div key={i} className="border rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-muted-foreground">规则 {i + 1}{!rule.match ? ' (默认兜底)' : ''}</span>
            <Button variant="ghost" size="icon-xs" className="text-destructive" onClick={() => setRules(rules.filter((_, j) => j !== i))}><Trash2 size={12} /></Button>
          </div>
          <div>
            <div className="text-[11px] text-muted-foreground mb-0.5">匹配条件 <span className="opacity-50">(留空=默认)</span></div>
            <Input
              value={rule.match}
              onChange={e => { const n = [...rules]; n[i] = { ...n[i], match: e.target.value }; setRules(n); }}
              placeholder='phone == "value"'
              className="text-[11px] font-mono"
            />
          </div>
          <div>
            <div className="text-[11px] text-muted-foreground mb-0.5">返回数据 (JSON)</div>
            <Textarea
              value={rule.response}
              onChange={e => { const n = [...rules]; n[i] = { ...n[i], response: e.target.value }; setRules(n); }}
              className="h-20 text-[11px] font-mono resize-none"
            />
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

function TestTab({ server, tool }: { server: McpServer; tool: McpToolInfo }) {
  const isPlanned = server.kind === 'planned';

  const toolMockRules: MockRule[] = (() => {
    try {
      const rules = server.mock_rules ? JSON.parse(server.mock_rules) as MockRule[] : [];
      return rules.filter(r => r.tool_name === tool.name);
    } catch { return []; }
  })();
  const hasMockRules = toolMockRules.length > 0;

  const mockExampleArgs = (() => {
    if (!hasMockRules) return null;
    const firstRule = toolMockRules[0];
    if (!firstRule.match) return null;
    try {
      const example: Record<string, unknown> = {};
      const re = /(?:args\.)?(\w+)\s*={2,3}\s*(?:"([^"]*)"|([\d.]+)|(true|false))/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(firstRule.match)) !== null) {
        const key = m[1];
        if (m[2] !== undefined) example[key] = m[2];
        else if (m[3] !== undefined) example[key] = Number(m[3]);
        else if (m[4] !== undefined) example[key] = m[4] === 'true';
      }
      return Object.keys(example).length > 0 ? example : null;
    } catch { return null; }
  })();

  const initialArgs = mockExampleArgs ? JSON.stringify(mockExampleArgs, null, 2) : '{}';
  const [argsText, setArgsText] = useState(initialArgs);
  const [mode, setMode] = useState<'real' | 'mock'>((isPlanned || hasMockRules) ? 'mock' : 'real');
  const [result, setResult] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const [personas, setPersonas] = useState<Array<{ id: string; label: string; context: Record<string, unknown> }>>([]);
  useEffect(() => {
    fetch('/api/test-personas?lang=zh')
      .then(r => r.json())
      .then((data: Array<{ id: string; label: string; context: Record<string, unknown> }>) => setPersonas(data))
      .catch(console.error);
  }, []);

  const schemaProps = extractSchema(server, tool);

  const handleInvoke = async () => {
    setRunning(true); setResult(null); setError(null); setElapsed(null);
    try {
      const args = JSON.parse(argsText);
      if (mode === 'mock') {
        const res = await mcpApi.mockInvokeTool(server.id, tool.name, args);
        setResult(prettyJson(res.result));
        setElapsed(res.elapsed_ms);
      } else {
        const res = await mcpApi.invokeTool(server.id, tool.name, args);
        setResult(prettyJson(res.result));
        setElapsed(res.elapsed_ms);
      }
    } catch (e) { setError(String(e)); }
    finally { setRunning(false); }
  };

  const generateExample = useCallback((personaCtx?: Record<string, unknown>) => {
    const example: Record<string, unknown> = {};
    for (const [key, val] of schemaProps) {
      if (personaCtx && key in personaCtx) {
        example[key] = personaCtx[key];
      } else if (val.enum) {
        example[key] = val.enum[0];
      } else if (val.type === 'number') {
        example[key] = 0;
      } else if (val.type === 'boolean') {
        example[key] = true;
      } else {
        example[key] = '';
      }
    }
    setArgsText(JSON.stringify(example, null, 2));
  }, [schemaProps]);

  return (
    <div className="p-4 space-y-3">
      {/* Mode toggle */}
      <RadioGroup value={mode} onValueChange={(v) => v && setMode(v as 'real' | 'mock')} className="flex items-center gap-3">
        <Label className={`flex items-center gap-1.5 text-xs font-normal ${isPlanned ? 'text-muted-foreground/50' : ''}`}>
          <RadioGroupItem value="real" disabled={isPlanned} className="size-3" />
          Real
          {isPlanned && <span className="text-[10px] text-muted-foreground/50">(规划中)</span>}
        </Label>
        <Label className={`flex items-center gap-1.5 text-xs font-normal ${hasMockRules ? '' : 'text-muted-foreground/50'}`}>
          <RadioGroupItem value="mock" disabled={!hasMockRules && !isPlanned} className="size-3" />
          Mock
          {!hasMockRules && <span className="text-[10px] text-muted-foreground/50">(无规则)</span>}
        </Label>
      </RadioGroup>

      {hasMockRules && mode === 'mock' && mockExampleArgs && (
        <div className="px-2 py-1.5 bg-accent border border-border rounded text-[11px] text-accent-foreground">
          已从第 1 条 Mock 规则预填参数（匹配条件：<code className="font-mono text-accent-foreground">{toolMockRules[0].match}</code>）
        </div>
      )}

      {schemaProps.length > 0 && (
        <div className="p-2 bg-background rounded border text-[11px] text-muted-foreground space-y-0.5">
          <div className="flex items-center justify-between mb-1 gap-2">
            <span className="font-medium">参数</span>
            <div className="flex items-center gap-1.5">
              {personas.length > 0 && (
                <select
                  onChange={e => {
                    const p = personas.find(p => p.id === e.target.value);
                    if (p) generateExample(p.context);
                  }}
                  className="text-[10px] border rounded px-1 py-0.5 bg-background"
                  defaultValue=""
                >
                  <option value="" disabled>从角色填充</option>
                  {personas.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
              )}
              <Button variant="ghost" size="xs" onClick={() => generateExample()}>生成示例</Button>
            </div>
          </div>
          {schemaProps.map(([key, val]) => (
            <div key={key}>
              <span className="font-mono">{key}</span>
              {val.type && <span className="opacity-60"> ({val.type})</span>}
              {val.enum && <span className="opacity-60"> [{val.enum.join('|')}]</span>}
            </div>
          ))}
        </div>
      )}

      <Textarea
        value={argsText}
        onChange={e => setArgsText(e.target.value)}
        className="h-28 text-xs font-mono bg-background resize-none"
        placeholder='{ ... }'
      />

      <Button size="sm" onClick={handleInvoke} disabled={running}>
        <Play size={12} />
        {running ? '调用中...' : mode === 'mock' ? 'Mock 调用' : '调用'}
      </Button>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>
            <pre className="text-[11px] whitespace-pre-wrap">{error}</pre>
          </AlertDescription>
        </Alert>
      )}

      {result !== null && (
        <div className={`p-3 rounded-lg border bg-accent border-border`}>
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs font-medium text-accent-foreground`}>
              {mode === 'mock' ? 'Mock 返回' : '成功'}
            </span>
            {elapsed !== null && elapsed > 0 && <span className="text-[11px] text-muted-foreground">{elapsed}ms</span>}
          </div>
          <pre className="text-[11px] whitespace-pre-wrap max-h-48 overflow-auto">{result}</pre>
        </div>
      )}
    </div>
  );
}

// ── Shared helpers ───────────────────────────────────────────────────────────

function deepParseJson(value: unknown): unknown {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try { return deepParseJson(JSON.parse(trimmed)); } catch { /* not JSON */ }
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(deepParseJson);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = deepParseJson(v);
    return out;
  }
  return value;
}

function prettyJson(value: unknown): string {
  return JSON.stringify(deepParseJson(value), null, 2);
}

interface SchemaEntry {
  type?: string;
  description?: string;
  enum?: string[];
  required?: boolean;
}

function extractSchema(server: McpServer, tool: McpToolInfo): Array<[string, SchemaEntry]> {
  if (tool.inputSchema && typeof tool.inputSchema === 'object' && 'properties' in tool.inputSchema) {
    const schema = tool.inputSchema as { properties: Record<string, SchemaEntry>; required?: string[] };
    const required = new Set(schema.required ?? []);
    return Object.entries(schema.properties).map(([k, v]) => [k, { ...v, required: required.has(k) }]);
  }
  if (tool.parameters && tool.parameters.length > 0) {
    return tool.parameters.map((p: { name: string; type: string; description: string; enum?: string[]; required?: boolean }) => [
      p.name,
      { type: p.type, description: p.description, enum: p.enum, required: p.required },
    ]);
  }
  try {
    const allTools = server.tools_json ? JSON.parse(server.tools_json) : [];
    const t = allTools.find((t: { name: string }) => t.name === tool.name);
    if (t?.parameters) {
      return t.parameters.map((p: { name: string; type: string; description: string; enum?: string[]; required?: boolean }) => [
        p.name,
        { type: p.type, description: p.description, enum: p.enum, required: p.required },
      ]);
    }
  } catch { /* ignore */ }
  return [];
}
