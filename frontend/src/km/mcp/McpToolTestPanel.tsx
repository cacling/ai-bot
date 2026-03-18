/**
 * McpToolTestPanel.tsx — 工具详情 & 测试弹窗
 *
 * 三个 Tab：详情 / Mock 规则 / 测试
 * - 详情：参数 Schema、返回示例、关联 Skill、启用状态
 * - Mock 规则：查看/编辑该工具的 mock 规则
 * - 测试：Real / Mock 调用
 */
import React, { useState, useEffect, useCallback } from 'react';
import { X, Play, Info, FlaskConical, Database, Plus, Trash2, Save, Check } from 'lucide-react';
import { mcpApi, type McpServer, type McpToolInfo, type MockRule, type ToolOverviewItem } from './api';

interface Props {
  server: McpServer;
  tool: McpToolInfo;
  onClose: () => void;
  onServerUpdated?: () => void; // notify parent to reload
}

type Tab = 'detail' | 'mock' | 'test';

export function McpToolTestPanel({ server, tool, onClose, onServerUpdated }: Props) {
  const [tab, setTab] = useState<Tab>('detail');
  const isPlanned = server.status === 'planned';

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-[620px] max-h-[88vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0">
          <div>
            <div className="text-sm font-semibold text-gray-800 font-mono">{tool.name}</div>
            <div className="text-[11px] text-gray-400">Server: {server.name}{isPlanned ? ' (规划中)' : ''}</div>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X size={16} /></button>
        </div>

        {/* Tabs */}
        <div className="flex border-b flex-shrink-0">
          {([
            { key: 'detail', label: '详情', icon: Info },
            { key: 'mock', label: 'Mock 规则', icon: Database },
            { key: 'test', label: '测试', icon: FlaskConical },
          ] as { key: Tab; label: string; icon: React.ElementType }[]).map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
                tab === t.key
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
            >
              <t.icon size={12} />
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          {tab === 'detail' && <DetailTab server={server} tool={tool} />}
          {tab === 'mock' && <MockTab server={server} tool={tool} onServerUpdated={onServerUpdated} />}
          {tab === 'test' && <TestTab server={server} tool={tool} />}
        </div>
      </div>
    </div>
  );
}

// ── Detail Tab ───────────────────────────────────────────────────────────────

function DetailTab({ server, tool }: { server: McpServer; tool: McpToolInfo }) {
  const [skills, setSkills] = useState<string[]>([]);
  const isDisabled = (() => {
    try { return (JSON.parse(server.disabled_tools ?? '[]') as string[]).includes(tool.name); }
    catch { return false; }
  })();

  // Load skill references
  useEffect(() => {
    mcpApi.getToolsOverview().then(r => {
      const item = r.items.find(t => t.name === tool.name);
      if (item) setSkills(item.skills);
    }).catch(() => {});
  }, [tool.name]);

  // Extract schema
  const schemaProps = extractSchema(server, tool);

  // Get tool response example
  const responseExample = (() => {
    try {
      if (tool.responseExample) return tool.responseExample;
      const allTools = server.tools_json ? JSON.parse(server.tools_json) : [];
      return allTools.find((t: { name: string }) => t.name === tool.name)?.responseExample ?? null;
    } catch { return null; }
  })();

  // Count mock rules
  const mockCount = (() => {
    try {
      const rules = server.mock_rules ? JSON.parse(server.mock_rules) as MockRule[] : [];
      return rules.filter(r => r.tool_name === tool.name).length;
    } catch { return 0; }
  })();

  return (
    <div className="p-4 space-y-4">
      {/* Description */}
      <div>
        <div className="text-[11px] font-medium text-gray-400 mb-1">描述</div>
        <div className="text-xs text-gray-700">{tool.description || '(无描述)'}</div>
      </div>

      {/* Status badges */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
          isDisabled ? 'bg-gray-100 text-gray-500' : 'bg-green-100 text-green-700'
        }`}>
          {isDisabled ? '已禁用' : '已启用'}
        </span>
        {mockCount > 0 && (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-100 text-purple-700">
            {mockCount} 条 Mock 规则
          </span>
        )}
      </div>

      {/* Parameter Schema */}
      <div>
        <div className="text-[11px] font-medium text-gray-400 mb-1">参数 Schema</div>
        {schemaProps.length > 0 ? (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="bg-gray-50 text-gray-500">
                  <th className="text-left px-3 py-1.5 font-medium">参数名</th>
                  <th className="text-left px-3 py-1.5 font-medium">类型</th>
                  <th className="text-left px-3 py-1.5 font-medium">必填</th>
                  <th className="text-left px-3 py-1.5 font-medium">说明</th>
                </tr>
              </thead>
              <tbody>
                {schemaProps.map(([key, val]) => (
                  <tr key={key} className="border-t">
                    <td className="px-3 py-1.5 font-mono text-gray-800">{key}</td>
                    <td className="px-3 py-1.5 text-gray-500">
                      {val.enum ? <span className="text-purple-600">{val.enum.join(' | ')}</span> : val.type ?? 'string'}
                    </td>
                    <td className="px-3 py-1.5">{val.required ? <Check size={11} className="text-green-500" /> : ''}</td>
                    <td className="px-3 py-1.5 text-gray-500">{val.description ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-[11px] text-gray-400 italic">无参数或 Schema 未定义</div>
        )}
      </div>

      {/* Response Example */}
      {responseExample && (
        <div>
          <div className="text-[11px] font-medium text-gray-400 mb-1">返回示例</div>
          <pre className="text-[11px] font-mono text-gray-600 bg-gray-50 border rounded-lg p-2 max-h-32 overflow-auto whitespace-pre-wrap">{responseExample}</pre>
        </div>
      )}

      {/* Skill references */}
      <div>
        <div className="text-[11px] font-medium text-gray-400 mb-1">关联的 Skill</div>
        {skills.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {skills.map(s => (
              <span key={s} className="px-2 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-600">{s}</span>
            ))}
          </div>
        ) : (
          <div className="text-[11px] text-gray-400 italic">无 Skill 引用此工具</div>
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
      // Merge: replace this tool's rules, keep others
      const allRules: MockRule[] = server.mock_rules ? JSON.parse(server.mock_rules) : [];
      const otherRules = allRules.filter(r => r.tool_name !== tool.name);
      const newRules = [...otherRules, ...rules.map(r => ({ ...r, tool_name: tool.name }))];
      await mcpApi.updateServer(server.id, { mock_rules: JSON.stringify(newRules) } as any);
      server.mock_rules = JSON.stringify(newRules); // update local ref
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
        <p className="text-[11px] text-gray-400">
          为 <span className="font-mono text-gray-600">{tool.name}</span> 定义 Mock 返回规则。沙箱环境默认使用这些规则。
        </p>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 transition disabled:opacity-50"
        >
          {saved ? <Check size={11} /> : <Save size={11} />}
          {saving ? '保存中...' : saved ? '已保存' : '保存'}
        </button>
      </div>

      {rules.map((rule, i) => (
        <div key={i} className="border rounded-lg p-3 bg-white space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-gray-500">规则 {i + 1}{!rule.match ? ' (默认兜底)' : ''}</span>
            <button onClick={() => setRules(rules.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600"><Trash2 size={12} /></button>
          </div>
          <div>
            <div className="text-[11px] text-gray-500 mb-0.5">匹配条件 <span className="text-gray-300">(留空=默认)</span></div>
            <input
              value={rule.match}
              onChange={e => { const n = [...rules]; n[i] = { ...n[i], match: e.target.value }; setRules(n); }}
              placeholder='phone == "13800000001"'
              className="w-full px-2 py-1 text-[11px] font-mono border rounded"
            />
          </div>
          <div>
            <div className="text-[11px] text-gray-500 mb-0.5">返回数据 (JSON)</div>
            <textarea
              value={rule.response}
              onChange={e => { const n = [...rules]; n[i] = { ...n[i], response: e.target.value }; setRules(n); }}
              className="w-full h-20 px-2 py-1 text-[11px] font-mono border rounded resize-none"
            />
          </div>
        </div>
      ))}

      <button
        onClick={() => setRules([...rules, { tool_name: tool.name, match: '', response: '{}' }])}
        className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700"
      >
        <Plus size={12} /> 添加规则
      </button>
    </div>
  );
}

// ── Test Tab ─────────────────────────────────────────────────────────────────

function TestTab({ server, tool }: { server: McpServer; tool: McpToolInfo }) {
  const isPlanned = server.status === 'planned';

  // Parse mock rules for this tool
  const toolMockRules: MockRule[] = (() => {
    try {
      const rules = server.mock_rules ? JSON.parse(server.mock_rules) as MockRule[] : [];
      return rules.filter(r => r.tool_name === tool.name);
    } catch { return []; }
  })();
  const hasMockRules = toolMockRules.length > 0;

  // Try to extract example args from the first mock rule's match expression
  const mockExampleArgs = (() => {
    if (!hasMockRules) return null;
    const firstRule = toolMockRules[0];
    if (!firstRule.match) return null; // default/fallback rule, no match expr
    try {
      // Parse patterns like: phone == "value", args.phone === "value", phone == 123
      const example: Record<string, unknown> = {};
      // Match: key ===/== "string" or key ===/== number
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

  // Auto-generate example args from schema
  const generateExample = useCallback(() => {
    const example: Record<string, unknown> = {};
    for (const [key, val] of schemaProps) {
      if (val.enum) example[key] = val.enum[0];
      else if (val.type === 'number') example[key] = 0;
      else if (val.type === 'boolean') example[key] = true;
      else example[key] = '';
    }
    setArgsText(JSON.stringify(example, null, 2));
  }, [schemaProps]);

  return (
    <div className="p-4 space-y-3">
      {/* Mode toggle */}
      <div className="flex items-center gap-3">
        <label className={`flex items-center gap-1.5 text-xs ${isPlanned ? 'text-gray-300' : 'text-gray-600'}`}>
          <input type="radio" name="testMode" checked={mode === 'real'} onChange={() => setMode('real')} disabled={isPlanned} className="w-3 h-3" />
          Real
          {isPlanned && <span className="text-[10px] text-gray-300">(规划中)</span>}
        </label>
        <label className={`flex items-center gap-1.5 text-xs ${hasMockRules ? 'text-gray-600' : 'text-gray-300'}`}>
          <input type="radio" name="testMode" checked={mode === 'mock'} onChange={() => setMode('mock')} disabled={!hasMockRules && !isPlanned} className="w-3 h-3" />
          Mock
          {!hasMockRules && <span className="text-[10px] text-gray-300">(无规则)</span>}
        </label>
      </div>

      {/* Mock pre-fill hint */}
      {hasMockRules && mode === 'mock' && mockExampleArgs && (
        <div className="px-2 py-1.5 bg-purple-50 border border-purple-100 rounded text-[11px] text-purple-600">
          已从第 1 条 Mock 规则预填参数（匹配条件：<code className="font-mono text-purple-700">{toolMockRules[0].match}</code>），点击调用即可查看模拟返回。
        </div>
      )}

      {/* Schema hint */}
      {schemaProps.length > 0 && (
        <div className="p-2 bg-gray-50 rounded border text-[11px] text-gray-500 space-y-0.5">
          <div className="flex items-center justify-between mb-1">
            <span className="font-medium text-gray-600">参数</span>
            <button onClick={generateExample} className="text-[10px] text-blue-500 hover:text-blue-700">生成示例</button>
          </div>
          {schemaProps.map(([key, val]) => (
            <div key={key}>
              <span className="font-mono text-gray-700">{key}</span>
              {val.type && <span className="text-gray-400"> ({val.type})</span>}
              {val.enum && <span className="text-gray-400"> [{val.enum.join('|')}]</span>}
            </div>
          ))}
        </div>
      )}

      {/* Input */}
      <textarea
        value={argsText}
        onChange={e => setArgsText(e.target.value)}
        className="w-full h-28 px-3 py-2 text-xs font-mono border rounded-lg bg-gray-50 resize-none"
        placeholder='{ "phone": "13800000001" }'
      />

      <button
        onClick={handleInvoke}
        disabled={running}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
      >
        <Play size={12} />
        {running ? '调用中...' : mode === 'mock' ? 'Mock 调用' : '调用'}
      </button>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
          <pre className="text-[11px] text-red-600 whitespace-pre-wrap">{error}</pre>
        </div>
      )}

      {result !== null && (
        <div className={`p-3 rounded-lg border ${mode === 'mock' ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'}`}>
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs font-medium ${mode === 'mock' ? 'text-amber-700' : 'text-green-700'}`}>
              {mode === 'mock' ? 'Mock 返回' : '成功'}
            </span>
            {elapsed !== null && elapsed > 0 && <span className="text-[11px] text-gray-400">{elapsed}ms</span>}
          </div>
          <pre className="text-[11px] text-gray-700 whitespace-pre-wrap max-h-48 overflow-auto">{result}</pre>
        </div>
      )}
    </div>
  );
}

// ── Shared helpers ───────────────────────────────────────────────────────────

/** Recursively parse JSON strings within an object so they pretty-print properly */
function deepParseJson(value: unknown): unknown {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try { return deepParseJson(JSON.parse(trimmed)); } catch { /* not JSON, return as-is */ }
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
  // 1. From discovered inputSchema
  if (tool.inputSchema && typeof tool.inputSchema === 'object' && 'properties' in tool.inputSchema) {
    const schema = tool.inputSchema as { properties: Record<string, SchemaEntry>; required?: string[] };
    const required = new Set(schema.required ?? []);
    return Object.entries(schema.properties).map(([k, v]) => [k, { ...v, required: required.has(k) }]);
  }
  // 2. From tool's parameters array
  if (tool.parameters && tool.parameters.length > 0) {
    return tool.parameters.map((p: { name: string; type: string; description: string; enum?: string[]; required?: boolean }) => [
      p.name,
      { type: p.type, description: p.description, enum: p.enum, required: p.required },
    ]);
  }
  // 3. From tools_json in server
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
