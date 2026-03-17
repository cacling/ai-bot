/**
 * McpServerList.tsx — MCP Server 卡片列表 + 新建/编辑/测试
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Plus, RefreshCw, Settings, Trash2, Plug, ToggleLeft, ToggleRight } from 'lucide-react';
import { mcpApi, type McpServer, type McpToolInfo } from './api';
import { McpServerForm } from './McpServerForm';
import { McpToolTestPanel } from './McpToolTestPanel';

type View = 'list' | 'create' | 'edit';

export function McpServerList() {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('list');
  const [editId, setEditId] = useState<string | null>(null);
  const [discoveringId, setDiscoveringId] = useState<string | null>(null);
  // Tool test panel state
  const [testServer, setTestServer] = useState<McpServer | null>(null);
  const [testTool, setTestTool] = useState<McpToolInfo | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    mcpApi.listServers()
      .then(r => setServers(r.items))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const handleDiscover = async (server: McpServer) => {
    setDiscoveringId(server.id);
    try {
      await mcpApi.discoverTools(server.id);
      load();
    } catch (e) {
      alert(`连接失败: ${e}`);
    } finally {
      setDiscoveringId(null);
    }
  };

  const handleToggle = async (server: McpServer) => {
    await mcpApi.updateServer(server.id, { enabled: !server.enabled } as Partial<McpServer>);
    load();
  };

  const handleDelete = async (server: McpServer) => {
    if (!confirm(`确定删除 ${server.name}？`)) return;
    await mcpApi.deleteServer(server.id);
    load();
  };

  const handleSaved = () => {
    setView('list');
    setEditId(null);
    load();
  };

  if (view === 'create') {
    return <McpServerForm onBack={() => setView('list')} onSaved={handleSaved} />;
  }
  if (view === 'edit' && editId) {
    return <McpServerForm serverId={editId} onBack={() => { setView('list'); setEditId(null); }} onSaved={handleSaved} />;
  }

  const getTools = (server: McpServer): McpToolInfo[] => {
    try {
      const cached: McpToolInfo[] = server.tools_cache ? JSON.parse(server.tools_cache) : [];
      const manual: McpToolInfo[] = server.tools_manual
        ? (JSON.parse(server.tools_manual) as Array<{ name: string; description: string }>).map(t => ({ ...t, source: 'manual' as const }))
        : [];
      // Merge: manual tools that aren't already in cached
      const cachedNames = new Set(cached.map(t => t.name));
      return [...cached, ...manual.filter(t => !cachedNames.has(t.name))];
    } catch { return []; }
  };

  const getDisabledTools = (server: McpServer): string[] => {
    try { return server.disabled_tools ? JSON.parse(server.disabled_tools) : []; }
    catch { return []; }
  };

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-700">MCP 服务 ({servers.length})</h2>
        <button
          onClick={() => setView('create')}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          <Plus size={13} />
          新建
        </button>
      </div>

      {loading ? (
        <div className="text-sm text-gray-400">加载中...</div>
      ) : servers.length === 0 ? (
        <div className="text-sm text-gray-400 text-center py-12">暂无 MCP 服务，点击"新建"添加</div>
      ) : (
        <div className="space-y-3">
          {servers.map(server => {
            const tools = getTools(server);
            const disabledTools = getDisabledTools(server);
            const isDiscovering = discoveringId === server.id;
            const isPlanned = server.status === 'planned';
            return (
              <div key={server.id} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                {/* Header */}
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-800">{server.name}</span>
                    {isPlanned ? (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700">规划中</span>
                    ) : server.enabled ? (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-700">
                        {server.last_connected_at ? '已连接' : '待连接'}
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-500">已禁用</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {!isPlanned && (
                      <button
                        onClick={() => handleDiscover(server)}
                        disabled={isDiscovering}
                        className="p-1.5 text-gray-400 hover:text-blue-600 transition"
                        title="发现工具"
                      >
                        {isDiscovering ? <RefreshCw size={14} className="animate-spin" /> : <Plug size={14} />}
                      </button>
                    )}
                    <button
                      onClick={() => handleToggle(server)}
                      className="p-1.5 text-gray-400 hover:text-blue-600 transition"
                      title={server.enabled ? '禁用' : '启用'}
                    >
                      {server.enabled ? <ToggleRight size={14} className="text-green-500" /> : <ToggleLeft size={14} />}
                    </button>
                    <button
                      onClick={() => { setEditId(server.id); setView('edit'); }}
                      className="p-1.5 text-gray-400 hover:text-blue-600 transition"
                      title="编辑"
                    >
                      <Settings size={14} />
                    </button>
                    <button
                      onClick={() => handleDelete(server)}
                      className="p-1.5 text-gray-400 hover:text-red-500 transition"
                      title="删除"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Description */}
                <p className="text-xs text-gray-500 mb-2">{server.description || '无描述'}</p>

                {/* Connection info */}
                <div className="text-[11px] text-gray-400 mb-3">
                  <span className="font-medium text-gray-500">{server.transport.toUpperCase()}</span>
                  {' · '}
                  {server.transport === 'stdio'
                    ? `${server.command} ${server.args_json ? JSON.parse(server.args_json).join(' ') : ''}`
                    : server.url ?? '(未配置)'}
                </div>

                {/* Tools */}
                {tools.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {tools.map(tool => {
                      const disabled = disabledTools.includes(tool.name);
                      return (
                        <button
                          key={tool.name}
                          onClick={() => { if (!isPlanned) { setTestServer(server); setTestTool(tool); } }}
                          className={`px-2 py-1 rounded text-[11px] transition ${
                            disabled
                              ? 'bg-gray-50 text-gray-400 line-through'
                              : 'bg-blue-50 text-blue-600 hover:bg-blue-100 cursor-pointer'
                          }`}
                          title={`${tool.description}${isPlanned ? '' : ' (点击测试)'}`}
                        >
                          {tool.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Tool test panel modal */}
      {testServer && testTool && (
        <McpToolTestPanel
          server={testServer}
          tool={testTool}
          onClose={() => { setTestServer(null); setTestTool(null); }}
        />
      )}
    </div>
  );
}
