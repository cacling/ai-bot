/**
 * McpToolListPage.tsx — MCP 工具独立管理页
 */
import { useState, useEffect, useCallback } from 'react';
import { Plus } from 'lucide-react';
import { mcpApi, type McpToolRecord, type McpServer } from './api';
import { McpToolEditor } from './McpToolEditor';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

export function McpToolListPage() {
  const [tools, setTools] = useState<McpToolRecord[]>([]);
  const [servers, setServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingToolId, setEditingToolId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      mcpApi.listTools(),
      mcpApi.listServers(),
    ]).then(([toolsRes, serversRes]) => {
      setTools(toolsRes.items);
      setServers(serversRes.items);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const serverName = (id: string | null) => {
    if (!id) return '—';
    return servers.find(s => s.id === id)?.name ?? id;
  };

  const implLabel = (tool: McpToolRecord) => {
    const impl = tool.impl_type;
    if (!impl) return '未配置';
    if (impl === 'remote_mcp') return 'Remote MCP';
    if (impl === 'db') return 'DB';
    if (impl === 'api') return 'API';
    return impl;
  };

  const configStatus = (tool: McpToolRecord) => {
    if (tool.mocked && !tool.execution_config) return { label: 'Mock', color: 'bg-amber-100 text-amber-700' };
    if (!tool.execution_config) return { label: '待配置', color: 'bg-muted text-muted-foreground' };
    return { label: '已完成', color: 'bg-emerald-100 text-emerald-700' };
  };

  const handleDelete = async (tool: McpToolRecord) => {
    if (!confirm(`确定删除工具「${tool.name}」？`)) return;
    await mcpApi.deleteTool(tool.id);
    load();
  };

  const handleToggleMock = async (tool: McpToolRecord) => {
    if (!tool.mocked && !tool.mock_rules) {
      alert('请先配置 Mock 规则');
      return;
    }
    await mcpApi.toggleToolMock(tool.id);
    load();
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">MCP 工具 ({tools.length})</h2>
        <Button size="sm" onClick={() => {/* TODO: 新建工具弹窗 */}}><Plus size={13} /> 新建</Button>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">加载中...</div>
      ) : tools.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-8">暂无工具</div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <Table className="text-xs">
            <TableHeader>
              <TableRow>
                <TableHead className="w-44">工具名</TableHead>
                <TableHead className="w-28">Server</TableHead>
                <TableHead>描述</TableHead>
                <TableHead className="w-24 text-center">数据来源</TableHead>
                <TableHead className="w-28 text-center">关联 Skill</TableHead>
                <TableHead className="w-32 text-center">模式</TableHead>
                <TableHead className="w-20 text-center">状态</TableHead>
                <TableHead className="w-20 text-center">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tools.map(tool => {
                const status = configStatus(tool);
                const mockRuleCount = tool.mock_rules ? (JSON.parse(tool.mock_rules) as unknown[]).length : 0;
                return (
                  <TableRow key={tool.id} className="cursor-pointer" onClick={() => setEditingToolId(tool.id)}>
                    <TableCell className="font-mono font-semibold">{tool.name}</TableCell>
                    <TableCell className="text-muted-foreground text-[11px]">{serverName(tool.server_id)}</TableCell>
                    <TableCell className="text-muted-foreground truncate max-w-[200px]" title={tool.description}>{tool.description || '—'}</TableCell>
                    <TableCell className="text-center">
                      <span className="text-[11px]">{implLabel(tool)}</span>
                    </TableCell>
                    <TableCell className="text-center">
                      {(tool.skills ?? []).length > 0
                        ? (tool.skills ?? []).map(s => <Badge key={s} variant="secondary" className="text-[10px] mr-0.5">{s}</Badge>)
                        : <span className="text-muted-foreground">—</span>
                      }
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <span className={`text-[11px] ${!tool.mocked ? 'font-medium text-emerald-600' : 'text-muted-foreground'}`}>Real</span>
                        <button
                          onClick={() => handleToggleMock(tool)}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${tool.mocked ? 'bg-amber-500' : 'bg-emerald-500'}`}
                        >
                          <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${tool.mocked ? 'translate-x-[18px]' : 'translate-x-[3px]'}`} />
                        </button>
                        <span className={`text-[11px] ${tool.mocked ? 'font-medium text-amber-600' : 'text-muted-foreground'}`}>Mock</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${status.color}`}>{status.label}</span>
                    </TableCell>
                    <TableCell className="text-center" onClick={e => e.stopPropagation()}>
                      <Button variant="ghost" size="xs" className="text-destructive hover:text-destructive" onClick={() => handleDelete(tool)}>删除</Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Tool Editor Dialog */}
      {editingToolId && (
        <McpToolEditor
          toolId={editingToolId}
          onClose={() => setEditingToolId(null)}
          onUpdated={load}
        />
      )}
    </div>
  );
}
