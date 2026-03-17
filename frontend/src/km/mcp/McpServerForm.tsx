/**
 * McpServerForm.tsx — MCP Server 新建/编辑表单
 *
 * 包含：基本信息、连接配置、环境变量、工具定义（手动）、Mock 规则
 */
import React, { useState, useEffect } from 'react';
import { ArrowLeft, Save, Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { mcpApi, type McpServer, type ManualTool, type ToolParam, type MockRule } from './api';

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
  // Tools (manual definition)
  const [manualTools, setManualTools] = useState<ManualTool[]>([]);
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
      try { setManualTools(s.tools_manual ? JSON.parse(s.tools_manual) : []); } catch { setManualTools([]); }
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
        tools_manual: manualTools.length > 0 ? JSON.stringify(manualTools) : null,
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

  // Tool names for mock rule dropdown
  const allToolNames = manualTools.map(t => t.name).filter(Boolean);

  return (
    <div className="p-4 max-w-3xl">
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

      <div className="space-y-3">
        {/* Basic info */}
        <Section title="基本信息" defaultOpen>
          <div className="space-y-3 pt-2">
            <div className="grid grid-cols-2 gap-3">
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
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">描述</label>
              <input value={description} onChange={e => setDescription(e.target.value)} className="w-full px-2.5 py-1.5 text-xs border rounded-lg" placeholder="电信业务系统 MCP 服务" />
            </div>
          </div>
        </Section>

        {/* Transport + Connection */}
        <Section title="连接配置" defaultOpen>
          <div className="space-y-3 pt-2">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">传输方式</label>
              <div className="flex gap-3">
                {(['http', 'stdio', 'sse'] as const).map(t => (
                  <label key={t} className="flex items-center gap-1.5 text-xs text-gray-600">
                    <input type="radio" name="transport" value={t} checked={transport === t} onChange={() => setTransport(t)} className="w-3 h-3" />
                    {t === 'http' ? 'Streamable HTTP' : t === 'stdio' ? 'stdio' : 'SSE'}
                  </label>
                ))}
              </div>
            </div>
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
        </Section>

        {/* Env vars */}
        <Section title="环境变量" badge={`${envEntries.length + envProdEntries.length + envTestEntries.length}`}>
          <div className="space-y-3 pt-2">
            <EnvEditor label="公共" entries={envEntries} onChange={setEnvEntries} />
            <EnvEditor label="Prod 覆盖" entries={envProdEntries} onChange={setEnvProdEntries} />
            <EnvEditor label="Test 覆盖" entries={envTestEntries} onChange={setEnvTestEntries} />
          </div>
        </Section>

        {/* Tool Definitions (manual) */}
        <Section title="工具定义" badge={`${manualTools.length}`} defaultOpen={manualTools.length > 0}>
          <div className="space-y-3 pt-2">
            <p className="text-[11px] text-gray-400">手动定义工具的参数 Schema 和返回格式。Server 运行后可通过"发现工具"自动获取。</p>
            {manualTools.map((tool, ti) => (
              <div key={ti} className="border rounded-lg p-3 bg-white space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    value={tool.name}
                    onChange={e => { const n = [...manualTools]; n[ti] = { ...n[ti], name: e.target.value }; setManualTools(n); }}
                    placeholder="工具名 (如 diagnose_network)"
                    className="flex-1 px-2 py-1 text-xs font-mono border rounded"
                  />
                  <button onClick={() => setManualTools(manualTools.filter((_, j) => j !== ti))} className="text-red-400 hover:text-red-600"><Trash2 size={13} /></button>
                </div>
                <input
                  value={tool.description}
                  onChange={e => { const n = [...manualTools]; n[ti] = { ...n[ti], description: e.target.value }; setManualTools(n); }}
                  placeholder="工具描述"
                  className="w-full px-2 py-1 text-xs border rounded"
                />
                <div>
                  <div className="text-[11px] font-medium text-gray-500 mb-1">参数</div>
                  <ParamEditor
                    params={tool.parameters}
                    onChange={params => { const n = [...manualTools]; n[ti] = { ...n[ti], parameters: params }; setManualTools(n); }}
                  />
                </div>
                <div>
                  <div className="text-[11px] font-medium text-gray-500 mb-1">返回示例 (JSON)</div>
                  <textarea
                    value={tool.responseExample}
                    onChange={e => { const n = [...manualTools]; n[ti] = { ...n[ti], responseExample: e.target.value }; setManualTools(n); }}
                    placeholder='{"success": true, "data": {...}}'
                    className="w-full h-16 px-2 py-1 text-[11px] font-mono border rounded resize-none"
                  />
                </div>
              </div>
            ))}
            <button
              onClick={() => setManualTools([...manualTools, { name: '', description: '', parameters: [], responseExample: '' }])}
              className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700"
            >
              <Plus size={12} /> 添加工具
            </button>
          </div>
        </Section>

        {/* Mock Rules */}
        <Section title="Mock 规则" badge={`${mockRules.length}`} defaultOpen={mockRules.length > 0}>
          <div className="space-y-3 pt-2">
            <p className="text-[11px] text-gray-400">定义 test 模式下的 mock 返回数据。匹配条件为 JS 表达式（如 <code className="bg-gray-100 px-1 rounded">phone == "138..."</code>），留空为默认兜底。</p>
            {mockRules.map((rule, ri) => (
              <div key={ri} className="border rounded-lg p-3 bg-white space-y-2">
                <div className="flex items-center gap-2">
                  <select
                    value={rule.tool_name}
                    onChange={e => { const n = [...mockRules]; n[ri] = { ...n[ri], tool_name: e.target.value }; setMockRules(n); }}
                    className="w-40 px-2 py-1 text-xs border rounded bg-white"
                  >
                    <option value="">选择工具...</option>
                    {allToolNames.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                  <button onClick={() => setMockRules(mockRules.filter((_, j) => j !== ri))} className="ml-auto text-red-400 hover:text-red-600"><Trash2 size={13} /></button>
                </div>
                <div>
                  <div className="text-[11px] font-medium text-gray-500 mb-1">匹配条件 (留空=默认)</div>
                  <input
                    value={rule.match}
                    onChange={e => { const n = [...mockRules]; n[ri] = { ...n[ri], match: e.target.value }; setMockRules(n); }}
                    placeholder='phone == "13800000001" && issue_type == "slow_data"'
                    className="w-full px-2 py-1 text-xs font-mono border rounded"
                  />
                </div>
                <div>
                  <div className="text-[11px] font-medium text-gray-500 mb-1">返回数据 (JSON)</div>
                  <textarea
                    value={rule.response}
                    onChange={e => { const n = [...mockRules]; n[ri] = { ...n[ri], response: e.target.value }; setMockRules(n); }}
                    placeholder='{"success": true, "message": "..."}'
                    className="w-full h-20 px-2 py-1 text-[11px] font-mono border rounded resize-none"
                  />
                </div>
              </div>
            ))}
            <button
              onClick={() => setMockRules([...mockRules, { tool_name: '', match: '', response: '{}' }])}
              className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700"
            >
              <Plus size={12} /> 添加规则
            </button>
          </div>
        </Section>
      </div>
    </div>
  );
}
