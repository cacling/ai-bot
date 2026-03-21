/**
 * McpServerList.tsx — MCP Server 列表（分组 + 资源管理）
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
  const [tools, setTools] = useState<Array<{ server_id: string | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('list');
  const [editId, setEditId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      mcpApi.listServers(),
      mcpApi.listTools(),
    ]).then(([serversRes, toolsRes]) => {
      setServers(serversRes.items);
      setTools(toolsRes.items);
    }).catch(console.error).finally(() => setLoading(false));
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

  const getStatus = (server: McpServer): { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' } => {
    if (server.status === 'planned') return { label: '规划中', variant: 'outline' };
    if (!server.enabled) return { label: '已禁用', variant: 'secondary' };
    return { label: '运行中', variant: 'default' };
  };

  const getToolCount = (serverId: string) => tools.filter(t => t.server_id === serverId).length;

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">MCP Server ({servers.length})</h2>
        <Button size="sm" onClick={() => setView('create')}><Plus size={13} /> 新建</Button>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">加载中...</div>
      ) : servers.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-8">暂无 Server，点击"新建"添加</div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <Table className="text-xs">
            <TableHeader>
              <TableRow>
                <TableHead className="w-40">名称</TableHead>
                <TableHead>描述</TableHead>
                <TableHead className="w-24 text-center">工具数</TableHead>
                <TableHead className="w-20 text-center">状态</TableHead>
                <TableHead className="w-24 text-center">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {servers.map(server => {
                const status = getStatus(server);
                const toolCount = getToolCount(server.id);
                return (
                  <TableRow
                    key={server.id}
                    className="cursor-pointer"
                    onClick={() => { setEditId(server.id); setView('edit'); }}
                  >
                    <TableCell className="font-mono font-semibold">{server.name}</TableCell>
                    <TableCell className="text-muted-foreground truncate max-w-[200px]" title={server.description}>{server.description || '—'}</TableCell>
                    <TableCell className="text-center">{toolCount}</TableCell>
                    <TableCell className="text-center"><Badge variant={status.variant}>{status.label}</Badge></TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-3">
                        <Button variant="ghost" size="xs" onClick={(e) => { e.stopPropagation(); setEditId(server.id); setView('edit'); }}>编辑</Button>
                        <Button variant="ghost" size="xs" className="text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); handleDelete(server); }}>删除</Button>
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
