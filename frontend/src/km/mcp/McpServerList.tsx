/**
 * McpServerList.tsx — MCP 管理主视图
 *
 * 简洁的 Server 表格列表，支持 CRUD。
 * 点击"编辑"进入 Server 详情页管理工具。
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Plus } from 'lucide-react';
import { mcpApi, type McpServer } from './api';
import { McpServerForm } from './McpServerForm';

type View = 'list' | 'create' | 'edit';

export function McpServerList() {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('list');
  const [editId, setEditId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    mcpApi.listServers().then(r => setServers(r.items)).catch(console.error).finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const handleDelete = async (server: McpServer) => {
    if (!confirm(`确定删除 ${server.name}？`)) return;
    await mcpApi.deleteServer(server.id);
    load();
  };

  const handleSaved = () => { setView('list'); setEditId(null); load(); };

  if (view === 'create') return <McpServerForm onBack={() => setView('list')} onSaved={handleSaved} />;
  if (view === 'edit' && editId) return <McpServerForm serverId={editId} onBack={() => { setView('list'); setEditId(null); }} onSaved={handleSaved} />;

  const getToolCount = (server: McpServer): number => {
    try {
      const tools = server.tools_json ? JSON.parse(server.tools_json) as unknown[] : [];
      return tools.length;
    } catch { return 0; }
  };

  const getStatus = (server: McpServer): { label: string; className: string } => {
    if (server.status === 'planned') return { label: '规划中', className: 'bg-amber-100 text-amber-700' };
    if (!server.enabled) return { label: '已禁用', className: 'bg-gray-100 text-gray-500' };
    if (server.last_connected_at) return { label: '已连接', className: 'bg-green-100 text-green-700' };
    return { label: '待连接', className: 'bg-blue-100 text-blue-600' };
  };

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">MCP 服务 ({servers.length})</h2>
        <button
          onClick={() => setView('create')}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          <Plus size={13} /> 新建
        </button>
      </div>

      {/* Server table */}
      {loading ? (
        <div className="text-sm text-gray-400">加载中...</div>
      ) : servers.length === 0 ? (
        <div className="text-sm text-gray-400 text-center py-8">暂无 MCP 服务，点击"新建"添加</div>
      ) : (
        <div className="border rounded-lg bg-white overflow-hidden">
          {/* Table header */}
          <div className="flex items-center gap-3 px-4 py-2.5 bg-gray-50 border-b text-[11px] font-medium text-gray-500">
            <span className="w-44 flex-shrink-0">名称</span>
            <span className="flex-1">描述</span>
            <span className="w-16 flex-shrink-0 text-center">状态</span>
            <span className="w-12 flex-shrink-0 text-center">工具</span>
            <span className="w-24 flex-shrink-0 text-center">操作</span>
          </div>

          {/* Rows */}
          {servers.map(server => {
            const status = getStatus(server);
            const toolCount = getToolCount(server);
            return (
              <div
                key={server.id}
                onClick={() => { setEditId(server.id); setView('edit'); }}
                className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-50 hover:bg-gray-50 transition cursor-pointer"
              >
                {/* Name */}
                <span className="w-44 flex-shrink-0 font-mono text-xs font-semibold text-gray-800">
                  {server.name}
                </span>
                {/* Description */}
                <span className="flex-1 text-xs text-gray-500 truncate" title={server.description}>
                  {server.description || '-'}
                </span>
                {/* Status */}
                <span className="w-16 flex-shrink-0 text-center">
                  <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${status.className}`}>
                    {status.label}
                  </span>
                </span>
                {/* Tool count */}
                <span className="w-12 flex-shrink-0 text-center text-xs text-gray-500">
                  {toolCount > 0 ? toolCount : <span className="text-gray-300">-</span>}
                </span>
                {/* Actions */}
                <span className="w-24 flex-shrink-0 flex items-center justify-center gap-3 text-xs">
                  <button
                    onClick={() => { setEditId(server.id); setView('edit'); }}
                    className="text-blue-500 hover:text-blue-700"
                  >
                    编辑
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(server); }}
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
  );
}
