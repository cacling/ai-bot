/**
 * McpServerForm.tsx — MCP Server 新建/编辑表单
 *
 * 包含：基本信息、连接配置、环境变量、工具管理（统一的工具卡片视图）
 */
import React, { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, Save, Plus, Trash2, ChevronDown, ChevronRight, ToggleLeft, ToggleRight, Plug, RefreshCw } from 'lucide-react';
import { mcpApi, type McpServer, type ToolParam, type MockRule, type McpToolInfo } from './api';
import { McpToolTestPanel } from './McpToolTestPanel';

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
      <div className="text-xs font-medium text-gray-600 mb-1">{label}</div>
      {entries.map((e, i) => (
        <div key={i} className="flex gap-2 mb-1">
          <input value={e.key} onChange={ev => { const n = [...entries]; n[i] = { ...n[i], key: ev.target.value }; onChange(n); }} placeholder="KEY" className="flex-1 px-2 py-1 text-xs border rounded bg-gray-50" />
          <input value={e.value} onChange={ev => { const n = [...entries]; n[i] = { ...n[i], value: ev.target.value }; onChange(n); }} placeholder="VALUE" className="flex-1 px-2 py-1 text-xs border rounded bg-gray-50" />
          <button onClick={() => onChange(entries.filter((_, j) => j !== i))} className="text-xs text-red-400 hover:text-red-600">×</button>
        </div>
      ))}
      <button onClick={() => onChange([...entries, { key: '', value: '' }])} className="text-[11px] text-blue-500 hover:text-blue-700">+ 添加</button>
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
          <input value={p.name} onChange={e => update(i, 'name', e.target.value)} placeholder="参数名" className="w-24 px-1.5 py-1 text-[11px] border rounded bg-white font-mono" />
          <select value={p.type} onChange={e => update(i, 'type', e.target.value)} className="w-16 px-1 py-1 text-[11px] border rounded bg-white">
            <option value="string">string</option>
            <option value="number">number</option>
            <option value="boolean">boolean</option>
          </select>
          <label className="flex items-center gap-1 text-[11px] text-gray-500 whitespace-nowrap">
            <input type="checkbox" checked={p.required} onChange={e => update(i, 'required', e.target.checked)} className="w-3 h-3" />
            必填
          </label>
          <input value={p.description} onChange={e => update(i, 'description', e.target.value)} placeholder="说明" className="flex-1 px-1.5 py-1 text-[11px] border rounded bg-white" />
          <input value={p.enum?.join(',') ?? ''} onChange={e => update(i, 'enum', e.target.value ? e.target.value.split(',').map(s => s.trim()) : undefined)} placeholder="枚举值(逗号分隔)" className="w-36 px-1.5 py-1 text-[11px] border rounded bg-white" />
          <button onClick={() => onChange(params.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600 mt-0.5"><Trash2 size={11} /></button>
        </div>
      ))}
      <button onClick={() => onChange([...params, { name: '', type: 'string', required: true, description: '' }])} className="text-[11px] text-blue-500 hover:text-blue-700">+ 添加参数</button>
    </div>
  );
}

// ── Collapsible Section ──────────────────────────────────────────────────────
function Section({ title, badge, children, defaultOpen = false }: { title: string; badge?: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border rounded-lg">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50">
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {title}
        {badge && <span className="ml-auto px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-500">{badge}</span>}
      </button>
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
  index: number;          // index into tools array
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
        <button onClick={onBack} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700">
          <ArrowLeft size={14} /> 返回
        </button>
        <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50">
          <Save size={13} /> {saving ? '保存中...' : '保存'}
        </button>
      </div>

      <h2 className="text-sm font-semibold text-gray-700 mb-4">{isEdit ? '编辑 MCP Server' : '新建 MCP Server'}</h2>

      {/* ── Server Properties (two-column grid, full width) ────────────── */}
      <div className="border rounded-lg p-4 mb-6 bg-white">
        <div className="grid grid-cols-2 gap-x-6 gap-y-3">
          {/* Row 1 */}
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">名称</label>
            <input value={name} onChange={e => setName(e.target.value)} className="w-full px-2.5 py-1.5 text-xs border rounded-lg" placeholder="telecom-service" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">状态</label>
            <select value={status} onChange={e => setStatus(e.target.value as 'active' | 'planned')} className="w-full px-2.5 py-1.5 text-xs border rounded-lg bg-white">
              <option value="active">Active（可连接）</option>
              <option value="planned">Planned（规划中）</option>
            </select>
          </div>

          {/* Row 2 */}
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">描述</label>
            <input value={description} onChange={e => setDescription(e.target.value)} className="w-full px-2.5 py-1.5 text-xs border rounded-lg" placeholder="电信业务系统 MCP 服务" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">传输方式</label>
            <div className="flex gap-3 py-1.5">
              {(['http', 'stdio', 'sse'] as const).map(t => (
                <label key={t} className="flex items-center gap-1.5 text-xs text-gray-600">
                  <input type="radio" name="transport" value={t} checked={transport === t} onChange={() => setTransport(t)} className="w-3 h-3" />
                  {t === 'http' ? 'Streamable HTTP' : t === 'stdio' ? 'stdio' : 'SSE'}
                </label>
              ))}
            </div>
          </div>

          {/* Row 3: connection fields (conditional) */}
          {transport === 'stdio' ? (
            <>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Command</label>
                <input value={command} onChange={e => setCommand(e.target.value)} className="w-full px-2.5 py-1.5 text-xs border rounded bg-white" placeholder="python" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Args (JSON array)</label>
                <input value={argsJson} onChange={e => setArgsJson(e.target.value)} className="w-full px-2.5 py-1.5 text-xs border rounded bg-white font-mono" placeholder='["-m", "my_server"]' />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">工作目录 (可选)</label>
                <input value={cwd} onChange={e => setCwd(e.target.value)} className="w-full px-2.5 py-1.5 text-xs border rounded bg-white" />
              </div>
              <div /> {/* empty cell for grid alignment */}
            </>
          ) : (
            <>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">URL</label>
                <input value={url} onChange={e => setUrl(e.target.value)} className="w-full px-2.5 py-1.5 text-xs border rounded bg-white font-mono" placeholder="http://localhost:8003/mcp" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Headers (JSON, 可选)</label>
                <input value={headersJson} onChange={e => setHeadersJson(e.target.value)} className="w-full px-2.5 py-1.5 text-xs border rounded bg-white font-mono" placeholder='{"Authorization": "Bearer xxx"}' />
              </div>
            </>
          )}
        </div>

        {/* Env vars — collapsible inline */}
        <div className="mt-4 pt-3 border-t">
          <Section title="环境变量" badge={envCount > 0 ? `${envCount}` : undefined}>
            <div className="space-y-3 pt-2">
              <EnvEditor label="公共" entries={envEntries} onChange={setEnvEntries} />
              <EnvEditor label="Prod 覆盖" entries={envProdEntries} onChange={setEnvProdEntries} />
              <EnvEditor label="Test 覆盖" entries={envTestEntries} onChange={setEnvTestEntries} />
            </div>
          </Section>
        </div>
      </div>

      {/* ── Tool Management (table-style list, full width) ─────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-700">工具管理</h3>
            <span className="text-[11px] text-gray-400">
              {tools.length > 0 && <span>{tools.length} 个工具</span>}
              {mockRules.length > 0 && <span> · {mockRules.length} Mock</span>}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {isEdit && status !== 'planned' && (
              <button
                onClick={handleDiscover}
                disabled={discovering}
                className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition disabled:opacity-50"
              >
                {discovering ? <RefreshCw size={12} className="animate-spin" /> : <Plug size={12} />}
                {discovering ? '同步中...' : '同步工具'}
              </button>
            )}
            <button
              onClick={() => setTools([...tools, { name: '', description: '' }])}
              className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition"
            >
              <Plus size={12} /> 添加工具
            </button>
          </div>
        </div>

        {toolsWithMeta.length === 0 ? (
          <div className="text-xs text-gray-400 text-center py-8 border rounded-lg bg-white">
            暂无工具。运行后在列表页点"发现工具"自动获取，或点击上方按钮手动添加。
          </div>
        ) : (
          <div className="border rounded-lg bg-white overflow-hidden">
            {/* Table header */}
            <div className="flex items-center gap-3 px-4 py-2 bg-gray-50 border-b text-[11px] font-medium text-gray-500">
              <span className="w-40 flex-shrink-0">工具名</span>
              <span className="w-36 flex-shrink-0">关联 Skill</span>
              <span className="flex-1">描述</span>
              <span className="w-14 flex-shrink-0 text-center">参数</span>
              <span className="w-14 flex-shrink-0 text-center">Mock</span>
              <span className="w-36 flex-shrink-0 text-center">操作</span>
            </div>

            {/* Tool rows */}
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
                <div
                  key={toolKey}
                  onClick={openDetail}
                  className={`flex items-center gap-3 px-4 py-2 border-b border-gray-50 hover:bg-gray-50 transition cursor-pointer ${tool.disabled ? 'opacity-50' : ''}`}
                >
                  {/* Name */}
                  <span className={`w-40 flex-shrink-0 font-mono text-xs ${tool.disabled ? 'text-gray-400 line-through' : 'text-gray-800 font-semibold'}`}>
                    {tool.name || <span className="text-gray-300 italic font-sans font-normal">未命名</span>}
                  </span>
                  {/* Skills */}
                  <span className="w-36 flex-shrink-0 truncate">
                    {(toolSkillMap.get(tool.name) ?? []).length > 0
                      ? (toolSkillMap.get(tool.name) ?? []).map(s => (
                          <span key={s} className="inline-block px-1.5 py-0.5 mr-1 rounded bg-blue-50 text-blue-500 text-[10px]">{s}</span>
                        ))
                      : <span className="text-[11px] text-gray-300">-</span>}
                  </span>
                  {/* Description */}
                  <span className="flex-1 text-[11px] text-gray-500 truncate" title={tool.description}>
                    {tool.description || '-'}
                  </span>
                  {/* Params */}
                  <span className="w-14 flex-shrink-0 text-center text-[11px] text-gray-400">
                    {params
                      ? <span>{params.required}<span className="text-gray-300">/{params.total}</span></span>
                      : paramCount > 0 ? paramCount : <span className="text-gray-300">-</span>}
                  </span>
                  {/* Mock count */}
                  <span className="w-14 flex-shrink-0 text-center">
                    {tool.mockRules.length > 0
                      ? <span className="inline-block px-1.5 py-0.5 rounded bg-purple-50 text-purple-500 text-[10px] font-medium">{tool.mockRules.length}</span>
                      : <span className="text-[11px] text-gray-300">-</span>}
                  </span>
                  {/* Actions: toggle + edit + delete */}
                  <span className="w-36 flex-shrink-0 flex items-center justify-center gap-3 text-xs">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (tool.disabled) setDisabledTools(disabledTools.filter(n => n !== tool.name));
                        else setDisabledTools([...disabledTools, tool.name]);
                      }}
                      className="text-gray-400 hover:text-blue-600 transition"
                      title={tool.disabled ? '启用' : '禁用'}
                    >
                      {tool.disabled ? <ToggleLeft size={16} /> : <ToggleRight size={16} className="text-green-500" />}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); openDetail(); }}
                      className="text-blue-500 hover:text-blue-700"
                    >
                      编辑
                    </button>
                    <button
                      onClick={handleDeleteTool}
                      className="text-red-400 hover:text-red-600"
                    >
                      删除
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Tool detail/test modal — reuses McpToolTestPanel from list page */}
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
