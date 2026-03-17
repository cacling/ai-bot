/**
 * McpToolTestPanel.tsx — 工具调用测试弹窗（支持 Real / Mock 模式）
 */
import React, { useState } from 'react';
import { X, Play } from 'lucide-react';
import { mcpApi, type McpServer, type McpToolInfo } from './api';

interface Props {
  server: McpServer;
  tool: McpToolInfo;
  onClose: () => void;
}

export function McpToolTestPanel({ server, tool, onClose }: Props) {
  const [argsText, setArgsText] = useState('{}');
  const [mode, setMode] = useState<'real' | 'mock'>('real');
  const [result, setResult] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [matchedRule, setMatchedRule] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const hasMockRules = (() => {
    try {
      const rules = server.mock_rules ? JSON.parse(server.mock_rules) : [];
      return rules.some((r: { tool_name: string }) => r.tool_name === tool.name);
    } catch { return false; }
  })();

  const handleInvoke = async () => {
    setRunning(true);
    setResult(null);
    setError(null);
    setElapsed(null);
    setMatchedRule(null);
    try {
      const args = JSON.parse(argsText);
      if (mode === 'mock') {
        const res = await mcpApi.mockInvokeTool(server.id, tool.name, args);
        setResult(JSON.stringify(res.result, null, 2));
        setElapsed(res.elapsed_ms);
        setMatchedRule(res.matched_rule);
      } else {
        const res = await mcpApi.invokeTool(server.id, tool.name, args);
        setResult(JSON.stringify(res.result, null, 2));
        setElapsed(res.elapsed_ms);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setRunning(false);
    }
  };

  // Extract schema info from inputSchema or manual tools
  let schemaProps: Array<[string, { type?: string; description?: string; enum?: string[] }]> = [];
  if (tool.inputSchema && typeof tool.inputSchema === 'object' && 'properties' in tool.inputSchema) {
    schemaProps = Object.entries(
      (tool.inputSchema as { properties: Record<string, { type?: string; description?: string; enum?: string[] }> }).properties
    );
  }
  // Also try manual tool definitions
  if (schemaProps.length === 0) {
    try {
      const manual = server.tools_manual ? JSON.parse(server.tools_manual) : [];
      const manualTool = manual.find((t: { name: string }) => t.name === tool.name);
      if (manualTool?.parameters) {
        schemaProps = manualTool.parameters.map((p: { name: string; type: string; description: string; enum?: string[]; required?: boolean }) => [
          p.name,
          { type: p.type, description: `${p.description}${p.required ? '' : ' (可选)'}`, enum: p.enum },
        ]);
      }
    } catch { /* ignore */ }
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-[560px] max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div>
            <div className="text-sm font-semibold text-gray-800">{tool.name}</div>
            <div className="text-[11px] text-gray-400">Server: {server.name}</div>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-3">
          {/* Tool description */}
          <div className="text-xs text-gray-500">{tool.description}</div>

          {/* Mode toggle */}
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-gray-600">
              <input type="radio" name="mode" checked={mode === 'real'} onChange={() => setMode('real')} className="w-3 h-3" />
              Real（调用 MCP）
            </label>
            <label className={`flex items-center gap-1.5 text-xs ${hasMockRules ? 'text-gray-600' : 'text-gray-300'}`}>
              <input type="radio" name="mode" checked={mode === 'mock'} onChange={() => setMode('mock')} disabled={!hasMockRules} className="w-3 h-3" />
              Mock（匹配规则）
              {!hasMockRules && <span className="text-[10px] text-gray-300 ml-1">无规则</span>}
            </label>
          </div>

          {/* Schema hint */}
          {schemaProps.length > 0 && (
            <div className="p-2 bg-gray-50 rounded border text-[11px] text-gray-500 space-y-0.5">
              <div className="font-medium text-gray-600 mb-1">参数 Schema:</div>
              {schemaProps.map(([key, val]) => (
                <div key={key}>
                  <span className="font-mono text-gray-700">{key}</span>
                  {val.type && <span className="text-gray-400"> ({val.type})</span>}
                  {val.enum && <span className="text-gray-400"> [{val.enum.join('|')}]</span>}
                  {val.description && <span className="text-gray-400"> — {val.description}</span>}
                </div>
              ))}
            </div>
          )}

          {/* Input */}
          <div>
            <div className="text-xs font-medium text-gray-600 mb-1">输入参数</div>
            <textarea
              value={argsText}
              onChange={e => setArgsText(e.target.value)}
              className="w-full h-24 px-3 py-2 text-xs font-mono border rounded-lg bg-gray-50 resize-none"
              placeholder='{ "phone": "13800000001" }'
            />
          </div>

          {/* Invoke button */}
          <button
            onClick={handleInvoke}
            disabled={running}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
          >
            <Play size={12} />
            {running ? '调用中...' : mode === 'mock' ? 'Mock 调用' : '调用'}
          </button>

          {/* Result */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <div className="text-xs font-medium text-red-700 mb-1">错误</div>
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
                {matchedRule && <span className="text-[11px] text-amber-500">匹配: {matchedRule}</span>}
              </div>
              <pre className="text-[11px] text-gray-700 whitespace-pre-wrap max-h-48 overflow-auto">{result}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
