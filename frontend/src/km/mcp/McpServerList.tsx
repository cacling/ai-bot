/**
 * McpServerList.tsx — MCP 管理主视图
 */
import { useState, useEffect, useCallback } from 'react';
import { Plus } from 'lucide-react';
import { mcpApi, type McpServer } from './api';
import { McpServerForm } from './McpServerForm';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

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

  const getToolNames = (server: McpServer): string[] => {
    try {
      const tools = server.tools_json ? JSON.parse(server.tools_json) as Array<{ name: string }> : [];
      return tools.map(t => t.name).filter(Boolean);
    } catch { return []; }
  };

  const getStatus = (server: McpServer): { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' } => {
    if (server.status === 'planned') return { label: '规划中', variant: 'outline' };
    if (!server.enabled) return { label: '已禁用', variant: 'secondary' };
    return { label: '运行中', variant: 'default' };
  };

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">MCP 服务 ({servers.length})</h2>
        <Button size="sm" onClick={() => setView('create')}><Plus size={13} /> 新建</Button>
      </div>

      {/* Server table */}
      {loading ? (
        <div className="text-sm text-muted-foreground">加载中...</div>
      ) : servers.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-8">暂无 MCP 服务，点击"新建"添加</div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <Table className="text-xs">
            <TableHeader>
              <TableRow>
                <TableHead className="w-40">名称</TableHead>
                <TableHead className="w-52">描述</TableHead>
                <TableHead>工具</TableHead>
                <TableHead className="w-20 text-center">状态</TableHead>
                <TableHead className="w-24 text-center">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {servers.map(server => {
                const status = getStatus(server);
                const toolNames = getToolNames(server);
                const toolDisplay = toolNames.length > 0 ? toolNames.join(', ') : '-';
                return (
                  <TableRow
                    key={server.id}
                    className="cursor-pointer"
                    onClick={() => { setEditId(server.id); setView('edit'); }}
                  >
                    <TableCell className="font-mono font-semibold">{server.name}</TableCell>
                    <TableCell className="text-muted-foreground truncate max-w-[200px]" title={server.description}>{server.description || '-'}</TableCell>
                    <TableCell className="max-w-[260px]">
                      <div className="truncate text-muted-foreground font-mono text-[11px] relative group" title={toolDisplay}>
                        {toolDisplay}
                        {toolNames.length > 0 && (
                          <div className="absolute left-0 top-full mt-1 z-50 hidden group-hover:block bg-popover text-popover-foreground border rounded-lg shadow-lg p-2 text-[11px] font-mono whitespace-nowrap">
                            {toolNames.map(name => <div key={name}>{name}</div>)}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center"><Badge variant={status.variant}>{status.label}</Badge></TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-3">
                        <Button variant="ghost" size="xs" onClick={(e) => { e.stopPropagation(); setEditId(server.id); setView('edit'); }}>
                          编辑
                        </Button>
                        <Button variant="ghost" size="xs" className="text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); handleDelete(server); }}>
                          删除
                        </Button>
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
  );
}
