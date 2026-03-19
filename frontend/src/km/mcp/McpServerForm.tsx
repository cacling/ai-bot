/**
 * McpServerForm.tsx — MCP Server 新建/编辑表单
 *
 * 包含：基本信息、连接配置、环境变量、工具管理（统一的工具卡片视图）
 */
import React, { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, Save, Plus, Trash2, ChevronDown, ChevronRight, ToggleLeft, ToggleRight, Plug, RefreshCw } from 'lucide-react';
import { mcpApi, type McpServer, type ToolParam, type MockRule, type McpToolInfo } from './api';
import { McpToolTestPanel } from './McpToolTestPanel';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';

interface Props {
  serverId?: string;
  onBack: () => void;
  onSaved: () => void;
}

// ── Env Editor ───────────────────────────────────────────────────────────────
interface EnvEntry { key: string; value: string }

function parseEnvJson(json: string | null): EnvEntry[] {
  if (!json) return [];
  try { return Object.entries(JSON.parse(json)).map(([key, value]) => ({ key, value: String(value) })); }
  catch { return []; }
}

function envToJson(entries: EnvEntry[]): string | null {
  const filtered = entries.filter(e => e.key.trim());
  if (filtered.length === 0) return null;
  return JSON.stringify(Object.fromEntries(filtered.map(e => [e.key, e.value])));
}

function EnvEditor({ label, entries, onChange }: { label: string; entries: EnvEntry[]; onChange: (v: EnvEntry[]) => void }) {
  return (
    <div>
      <div className="text-xs font-medium text-muted-foreground mb-1">{label}</div>
      {entries.map((e, i) => (
        <div key={i} className="flex gap-2 mb-1">
          <Input value={e.key} onChange={ev => { const n = [...entries]; n[i] = { ...n[i], key: ev.target.value }; onChange(n); }} placeholder="KEY" className="flex-1 text-xs bg-background" />
          <Input value={e.value} onChange={ev => { const n = [...entries]; n[i] = { ...n[i], value: ev.target.value }; onChange(n); }} placeholder="VALUE" className="flex-1 text-xs bg-background" />
          <Button variant="ghost" size="icon-xs" onClick={() => onChange(entries.filter((_, j) => j !== i))} className="text-destructive">×</Button>
        </div>
      ))}
      <Button variant="ghost" size="xs" onClick={() => onChange([...entries, { key: '', value: '' }])}>+ 添加</Button>
    </div>
  );
}

// ── Tool Param Editor ────────────────────────────────────────────────────────
function ParamEditor({ params, onChange }: { params: ToolParam[]; onChange: (v: ToolParam[]) => void }) {
  const update = (i: number, field: string, value: unknown) => {
    const n = [...params];
    n[i] = { ...n[i], [field]: value };
    onChange(n);
  };
  return (
    <div className="space-y-1.5">
      {params.map((p, i) => (
        <div key={i} className="flex gap-1.5 items-start">
          <Input value={p.name} onChange={e => update(i, 'name', e.target.value)} placeholder="参数名" className="w-24 text-[11px] font-mono" />
          <Select value={p.type} onValueChange={(v) => v && update(i, 'type', v)}>
            <SelectTrigger className="w-16 text-[11px] h-7">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="string">string</SelectItem>
              <SelectItem value="number">number</SelectItem>
              <SelectItem value="boolean">boolean</SelectItem>
            </SelectContent>
          </Select>
          <Label className="flex items-center gap-1 text-[11px] text-muted-foreground whitespace-nowrap font-normal">
            <Checkbox checked={p.required} onCheckedChange={(v: boolean) => update(i, 'required', v)} className="size-3" />
            必填
          </Label>
          <Input value={p.description} onChange={e => update(i, 'description', e.target.value)} placeholder="说明" className="flex-1 text-[11px]" />
          <Input value={p.enum?.join(',') ?? ''} onChange={e => update(i, 'enum', e.target.value ? e.target.value.split(',').map(s => s.trim()) : undefined)} placeholder="枚举值(逗号分隔)" className="w-36 text-[11px]" />
          <Button variant="ghost" size="icon-xs" onClick={() => onChange(params.filter((_, j) => j !== i))} className="text-destructive mt-0.5"><Trash2 size={11} /></Button>
        </div>
      ))}
      <Button variant="ghost" size="xs" onClick={() => onChange([...params, { name: '', type: 'string', required: true, description: '' }])}>+ 添加参数</Button>
    </div>
  );
}

// ── Collapsible Section ──────────────────────────────────────────────────────
function Section({ title, badge, children, defaultOpen = false }: { title: string; badge?: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border rounded-lg">
      <Button variant="ghost" size="sm" onClick={() => setOpen(!open)} className="w-full justify-start gap-2 rounded-none">
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {title}
        {badge && <Badge variant="secondary" className="ml-auto">{badge}</Badge>}
      </Button>
      {open && <div className="px-3 pb-3 border-t">{children}</div>}
    </div>
  );
}

// ── Types ────────────────────────────────────────────────────────────────────

interface ToolItem {
  name: string;
  description: string;
  inputSchema?: unknown;
  parameters?: Array<{ name: string; type: string; required: boolean; description: string; enum?: string[] }>;
  responseExample?: string;
}

interface ToolWithMeta extends ToolItem {
  index: number;
  disabled: boolean;
  mockRules: MockRule[];
  mockIndices: number[];
}

// ── Main Form ────────────────────────────────────────────────────────────────
export function McpServerForm({ serverId, onBack, onSaved }: Props) {
  const isEdit = !!serverId;

  // Basic
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [transport, setTransport] = useState<'http' | 'stdio' | 'sse'>('http');
  const [status, setStatus] = useState<'active' | 'planned'>('active');
  // Connection
  const [url, setUrl] = useState('');
  const [headersJson, setHeadersJson] = useState('');
  const [command, setCommand] = useState('');
  const [argsJson, setArgsJson] = useState('');
  const [cwd, setCwd] = useState('');
  // Env
  const [envEntries, setEnvEntries] = useState<EnvEntry[]>([]);
  const [envProdEntries, setEnvProdEntries] = useState<EnvEntry[]>([]);
  const [envTestEntries, setEnvTestEntries] = useState<EnvEntry[]>([]);
  // Tools (unified)
  const [tools, setTools] = useState<ToolItem[]>([]);
  // Disabled tools
  const [disabledTools, setDisabledTools] = useState<string[]>([]);
  // Mock rules
  const [mockRules, setMockRules] = useState<MockRule[]>([]);

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!serverId) return;
    mcpApi.getServer(serverId).then(s => {
      setName(s.name);
      setDescription(s.description);
      setTransport(s.transport);
      setStatus(s.status as 'active' | 'planned');
      setUrl(s.url ?? '');
      setHeadersJson(s.headers_json ?? '');
      setCommand(s.command ?? '');
      setArgsJson(s.args_json ?? '');
      setCwd(s.cwd ?? '');
      setEnvEntries(parseEnvJson(s.env_json));
      setEnvProdEntries(parseEnvJson(s.env_prod_json));
      setEnvTestEntries(parseEnvJson(s.env_test_json));
      try { setTools(s.tools_json ? JSON.parse(s.tools_json) : []); } catch { setTools([]); }
      try { setDisabledTools(s.disabled_tools ? JSON.parse(s.disabled_tools) : []); } catch { setDisabledTools([]); }
      try { setMockRules(s.mock_rules ? JSON.parse(s.mock_rules) : []); } catch { setMockRules([]); }
    }).catch(console.error);
  }, [serverId]);

  const handleSave = async () => {
    if (!name.trim()) return alert('名称不能为空');
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        description,
        transport,
        status,
        url: transport !== 'stdio' ? url || null : null,
        headers_json: transport !== 'stdio' && headersJson ? headersJson : null,
        command: transport === 'stdio' ? command || null : null,
        args_json: transport === 'stdio' && argsJson ? argsJson : null,
        cwd: transport === 'stdio' && cwd ? cwd : null,
        env_json: envToJson(envEntries),
        env_prod_json: envToJson(envProdEntries),
        env_test_json: envToJson(envTestEntries),
        tools_json: tools.length > 0 ? JSON.stringify(tools) : null,
        disabled_tools: disabledTools.length > 0 ? JSON.stringify(disabledTools) : null,
        mock_rules: mockRules.length > 0 ? JSON.stringify(mockRules) : null,
      };
      if (isEdit) {
        await mcpApi.updateServer(serverId!, body);
      } else {
        await mcpApi.createServer(body);
      }
      onSaved();
    } catch (e) {
      alert(`保存失败: ${e}`);
    } finally {
      setSaving(false);
    }
  };

  // Build tool list with metadata
  const toolsWithMeta = useMemo((): ToolWithMeta[] => {
    return tools.map((t, i) => {
      const indices: number[] = [];
      const rules: MockRule[] = [];
      mockRules.forEach((r, ri) => { if (r.tool_name === t.name) { indices.push(ri); rules.push(r); } });
      return {
        ...t,
        index: i,
        disabled: disabledTools.includes(t.name),
        mockRules: rules,
        mockIndices: indices,
      };
    });
  }, [tools, disabledTools, mockRules]);

  // Skill references per tool
  const [toolSkillMap, setToolSkillMap] = useState<Map<string, string[]>>(new Map());
  useEffect(() => {
    mcpApi.getToolsOverview().then(r => {
      const map = new Map<string, string[]>();
      for (const item of r.items) {
        if (item.skills.length > 0) map.set(item.name, item.skills);
      }
      setToolSkillMap(map);
    }).catch(() => {});
  }, []);

  // Tool detail panel state
  const [testTool, setTestTool] = useState<McpToolInfo | null>(null);

  // Discover tools
  const [discovering, setDiscovering] = useState(false);
  const handleDiscover = async () => {
    if (!serverId) return;
    setDiscovering(true);
    try {
      const res = await mcpApi.discoverTools(serverId);
      setTools(res.tools as ToolItem[]);
    } catch (e) {
      alert(`连接失败: ${e}`);
    } finally {
      setDiscovering(false);
    }
  };

  // Build a McpServer-like object from current form state (for McpToolTestPanel)
  const currentServerSnapshot = useMemo((): McpServer => ({
    id: serverId ?? '',
    name,
    description,
    transport,
    status,
    enabled: true,
    url: url || null,
    headers_json: headersJson || null,
    command: command || null,
    args_json: argsJson || null,
    cwd: cwd || null,
    env_json: envToJson(envEntries),
    env_prod_json: envToJson(envProdEntries),
    env_test_json: envToJson(envTestEntries),
    tools_json: tools.length > 0 ? JSON.stringify(tools) : null,
    disabled_tools: disabledTools.length > 0 ? JSON.stringify(disabledTools) : null,
    mock_rules: mockRules.length > 0 ? JSON.stringify(mockRules) : null,
    last_connected_at: null,
    created_at: '',
    updated_at: '',
  }), [serverId, name, description, transport, status, url, headersJson, command, argsJson, cwd, envEntries, envProdEntries, envTestEntries, tools, disabledTools, mockRules]);

  // Helper: get param count from inputSchema
  const getParamCount = (schema?: unknown): { total: number; required: number } | null => {
    if (!schema || typeof schema !== 'object') return null;
    const s = schema as { properties?: Record<string, unknown>; required?: string[] };
    if (!s.properties) return null;
    return { total: Object.keys(s.properties).length, required: s.required?.length ?? 0 };
  };

  const envCount = envEntries.length + envProdEntries.length + envTestEntries.length;

  return (
    <div className="p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft size={14} /> 返回</Button>
        <Button size="sm" onClick={handleSave} disabled={saving}><Save size={13} /> {saving ? '保存中...' : '保存'}</Button>
      </div>

      <h2 className="text-sm font-semibold mb-4">{isEdit ? '编辑 MCP Server' : '新建 MCP Server'}</h2>

      {/* ── Server Properties ────────────── */}
      <Card className="mb-6">
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">名称</label>
              <Input value={name} onChange={e => setName(e.target.value)} className="text-xs" placeholder="telecom-service" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">状态</label>
              <Select value={status} onValueChange={(v) => v && setStatus(v as 'active' | 'planned')}>
                <SelectTrigger className="w-full text-xs h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active（可连接）</SelectItem>
                  <SelectItem value="planned">Planned（规划中）</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">描述</label>
              <Input value={description} onChange={e => setDescription(e.target.value)} className="text-xs" placeholder="电信业务系统 MCP 服务" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">传输方式</label>
              <RadioGroup value={transport} onValueChange={(v) => v && setTransport(v as typeof transport)} className="flex gap-3 py-1.5">
                {(['http', 'stdio', 'sse'] as const).map(t => (
                  <Label key={t} className="flex items-center gap-1.5 text-xs text-muted-foreground font-normal cursor-pointer">
                    <RadioGroupItem value={t} className="size-3" />
                    {t === 'http' ? 'Streamable HTTP' : t === 'stdio' ? 'stdio' : 'SSE'}
                  </Label>
                ))}
              </RadioGroup>
            </div>

            {transport === 'stdio' ? (
              <>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Command</label>
                  <Input value={command} onChange={e => setCommand(e.target.value)} className="text-xs" placeholder="python" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Args (JSON array)</label>
                  <Input value={argsJson} onChange={e => setArgsJson(e.target.value)} className="text-xs font-mono" placeholder='["-m", "my_server"]' />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">工作目录 (可选)</label>
                  <Input value={cwd} onChange={e => setCwd(e.target.value)} className="text-xs" />
                </div>
                <div />
              </>
            ) : (
              <>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">URL</label>
                  <Input value={url} onChange={e => setUrl(e.target.value)} className="text-xs font-mono" placeholder="http://localhost:8003/mcp" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Headers (JSON, 可选)</label>
                  <Input value={headersJson} onChange={e => setHeadersJson(e.target.value)} className="text-xs font-mono" placeholder='{"Authorization": "Bearer xxx"}' />
                </div>
              </>
            )}
          </div>

          {/* Env vars */}
          <div className="mt-4 pt-3 border-t">
            <Section title="环境变量" badge={envCount > 0 ? `${envCount}` : undefined}>
              <div className="space-y-3 pt-2">
                <EnvEditor label="公共" entries={envEntries} onChange={setEnvEntries} />
                <EnvEditor label="Prod 覆盖" entries={envProdEntries} onChange={setEnvProdEntries} />
                <EnvEditor label="Test 覆盖" entries={envTestEntries} onChange={setEnvTestEntries} />
              </div>
            </Section>
          </div>
        </CardContent>
      </Card>

      {/* ── Tool Management ─────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">工具管理</h3>
            <span className="text-[11px] text-muted-foreground">
              {tools.length > 0 && <span>{tools.length} 个工具</span>}
              {mockRules.length > 0 && <span> · {mockRules.length} Mock</span>}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {isEdit && status !== 'planned' && (
              <Button variant="outline" size="sm" onClick={handleDiscover} disabled={discovering}>
                {discovering ? <RefreshCw size={12} className="animate-spin" /> : <Plug size={12} />}
                {discovering ? '同步中...' : '同步工具'}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setTools([...tools, { name: '', description: '' }])}>
              <Plus size={12} /> 添加工具
            </Button>
          </div>
        </div>

        {toolsWithMeta.length === 0 ? (
          <div className="text-xs text-muted-foreground text-center py-8 border rounded-lg">
            暂无工具。运行后在列表页点"发现工具"自动获取，或点击上方按钮手动添加。
          </div>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <Table className="text-xs">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-40">工具名</TableHead>
                  <TableHead className="w-36">关联 Skill</TableHead>
                  <TableHead>描述</TableHead>
                  <TableHead className="w-14 text-center">参数</TableHead>
                  <TableHead className="w-14 text-center">Mock</TableHead>
                  <TableHead className="w-36 text-center">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {toolsWithMeta.map(tool => {
                  const toolKey = `tool-${tool.index}-${tool.name || 'new'}`;
                  const params = getParamCount(tool.inputSchema);
                  const paramCount = tool.parameters?.length ?? 0;

                  const openDetail = () => {
                    if (!tool.name) return;
                    const toolInfo: McpToolInfo = {
                      name: tool.name,
                      description: tool.description,
                      inputSchema: tool.inputSchema,
                      parameters: tool.parameters,
                      responseExample: tool.responseExample,
                    };
                    setTestTool(toolInfo);
                  };

                  const handleDeleteTool = (e: React.MouseEvent) => {
                    e.stopPropagation();
                    if (!confirm(`确定删除工具 ${tool.name}？`)) return;
                    setTools(tools.filter((_, j) => j !== tool.index));
                    setMockRules(mockRules.filter(r => r.tool_name !== tool.name));
                    setDisabledTools(disabledTools.filter(n => n !== tool.name));
                  };

                  return (
                    <TableRow
                      key={toolKey}
                      onClick={openDetail}
                      className={`cursor-pointer ${tool.disabled ? 'opacity-50' : ''}`}
                    >
                      <TableCell className={`font-mono ${tool.disabled ? 'text-muted-foreground line-through' : 'font-semibold'}`}>
                        {tool.name || <span className="text-muted-foreground italic font-sans font-normal">未命名</span>}
                      </TableCell>
                      <TableCell className="truncate">
                        {(toolSkillMap.get(tool.name) ?? []).length > 0
                          ? (toolSkillMap.get(tool.name) ?? []).map(s => (
                              <Badge key={s} variant="secondary" className="mr-1 text-[10px]">{s}</Badge>
                            ))
                          : <span className="text-muted-foreground">-</span>}
                      </TableCell>
                      <TableCell className="text-muted-foreground truncate" title={tool.description}>{tool.description || '-'}</TableCell>
                      <TableCell className="text-center text-muted-foreground">
                        {params
                          ? <span>{params.required}<span className="text-muted-foreground/50">/{params.total}</span></span>
                          : paramCount > 0 ? paramCount : '-'}
                      </TableCell>
                      <TableCell className="text-center">
                        {tool.mockRules.length > 0
                          ? <Badge variant="outline" className="text-[10px]">{tool.mockRules.length}</Badge>
                          : <span className="text-muted-foreground">-</span>}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (tool.disabled) setDisabledTools(disabledTools.filter(n => n !== tool.name));
                              else setDisabledTools([...disabledTools, tool.name]);
                            }}
                            className="text-muted-foreground hover:text-foreground transition"
                            title={tool.disabled ? '启用' : '禁用'}
                          >
                            {tool.disabled ? <ToggleLeft size={16} /> : <ToggleRight size={16} className="text-primary" />}
                          </button>
                          <Button variant="ghost" size="xs" onClick={(e) => { e.stopPropagation(); openDetail(); }}>编辑</Button>
                          <Button variant="ghost" size="xs" className="text-destructive hover:text-destructive" onClick={handleDeleteTool}>删除</Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Tool detail/test modal */}
      {testTool && serverId && (
        <McpToolTestPanel
          server={currentServerSnapshot}
          tool={testTool}
          onClose={() => setTestTool(null)}
        />
      )}
    </div>
  );
}
