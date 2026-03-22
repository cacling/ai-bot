/**
 * McpServerList.tsx — MCP Server 列表（统计卡片 + 搜索筛选 + 丰富列信息）
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Search, ChevronRight } from 'lucide-react';
import { mcpApi, type McpServer, type McpResource, type McpToolRecord } from './api';
import { McpServerConsole } from './McpServerConsole';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

type View = 'list' | 'create' | 'edit';
type QuickFilter = 'all' | 'running' | 'planned' | 'disabled' | 'no_resource';

interface Props {
  onOpenTool?: (toolId: string, step?: string, fromServer?: string) => void;
  onOpenConnectors?: () => void;
}

export function McpServerList({ onOpenTool, onOpenConnectors }: Props = {}) {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [tools, setTools] = useState<McpToolRecord[]>([]);
  const [resources, setResources] = useState<McpResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('list');
  const [editId, setEditId] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');
  const [filterTransport, setFilterTransport] = useState<string>('all');

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      mcpApi.listServers(),
      mcpApi.listTools(),
      mcpApi.listResources().catch(() => ({ items: [] as McpResource[] })),
    ]).then(([serversRes, toolsRes, resourcesRes]) => {
      setServers(serversRes.items);
      setTools(toolsRes.items);
      setResources(resourcesRes.items);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const handleDelete = async (server: McpServer) => {
    if (!confirm(`确定删除 ${server.name}？`)) return;
    await mcpApi.deleteServer(server.id);
    load();
  };

  const handleSaved = () => { load(); };

  const handleCreated = (newId: string) => {
    setEditId(newId);
    setView('edit');
    load();
  };

  // ── Helpers (must be before early returns to keep hooks stable) ─────────────

  const getStatus = (server: McpServer): { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' } => {
    if (server.status === 'planned') return { label: '规划中', variant: 'outline' };
    if (!server.enabled) return { label: '已禁用', variant: 'secondary' };
    return { label: '运行中', variant: 'default' };
  };

  const getToolCount = (serverId: string) => tools.filter(t => t.server_id === serverId).length;
  const getResourceCount = (serverId: string) => resources.filter(r => r.server_id === serverId).length;

  const getToolsReady = (serverId: string) => {
    const serverTools = tools.filter(t => t.server_id === serverId);
    return serverTools.filter(t => t.impl_type && !t.disabled).length;
  };

  const getResourceTypes = (serverId: string) => {
    const srvResources = resources.filter(r => r.server_id === serverId);
    const types = new Set(srvResources.map(r => r.type));
    return Array.from(types).map(t => t === 'remote_mcp' ? 'MCP' : t === 'db' ? 'DB' : 'API');
  };

  const lastSyncLabel = (server: McpServer): string => {
    if (!server.last_connected_at) return '从未';
    const diff = Date.now() - new Date(server.last_connected_at).getTime();
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
    return `${Math.floor(diff / 86400000)}天前`;
  };

  // ── Stats ───────────────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const running = servers.filter(s => s.status !== 'planned' && s.enabled).length;
    const planned = servers.filter(s => s.status === 'planned').length;
    const disabled = servers.filter(s => !s.enabled).length;
    const noResource = servers.filter(s => getResourceCount(s.id) === 0).length;
    return { total: servers.length, running, planned, disabled, noResource };
  }, [servers, resources]);

  // ── Filtered list ─────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let list = servers;

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q)
      );
    }

    if (quickFilter === 'running') list = list.filter(s => s.status !== 'planned' && s.enabled);
    else if (quickFilter === 'planned') list = list.filter(s => s.status === 'planned');
    else if (quickFilter === 'disabled') list = list.filter(s => !s.enabled);
    else if (quickFilter === 'no_resource') list = list.filter(s => getResourceCount(s.id) === 0);

    if (filterTransport !== 'all') list = list.filter(s => s.transport === filterTransport);

    return list;
  }, [servers, search, quickFilter, filterTransport, resources]);

  // ── Early returns (after all hooks) ─────────────────────────────────────────

  if (view === 'create') return <McpServerConsole onBack={() => setView('list')} onSaved={handleSaved} onCreated={handleCreated} onOpenTool={onOpenTool} onOpenConnectors={onOpenConnectors} />;
  if (view === 'edit' && editId) return <McpServerConsole serverId={editId} onBack={() => { setView('list'); setEditId(null); }} onSaved={handleSaved} onOpenTool={onOpenTool} onOpenConnectors={onOpenConnectors} />;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div /> {/* Tab 标题已在上层显示 */}
        <Button size="sm" onClick={() => setView('create')}><Plus size={13} /> 新建</Button>
      </div>

      {/* Stats cards */}
      {!loading && servers.length > 0 && (
        <div className="grid grid-cols-5 gap-2">
          {([
            { key: 'all' as QuickFilter, label: '全部', value: stats.total, color: 'text-foreground' },
            { key: 'running' as QuickFilter, label: '运行中', value: stats.running, color: 'text-emerald-600' },
            { key: 'planned' as QuickFilter, label: '规划中', value: stats.planned, color: 'text-amber-600' },
            { key: 'disabled' as QuickFilter, label: '已禁用', value: stats.disabled, color: 'text-muted-foreground' },
            { key: 'no_resource' as QuickFilter, label: '无连接器', value: stats.noResource, color: 'text-destructive' },
          ]).map(card => (
            <button
              key={card.key}
              onClick={() => setQuickFilter(quickFilter === card.key ? 'all' : card.key)}
              className={`rounded-lg border p-3 text-left transition-colors ${
                quickFilter === card.key ? 'border-primary bg-primary/5' : 'hover:bg-accent'
              }`}
            >
              <div className={`text-lg font-bold ${card.color}`}>{card.value}</div>
              <div className="text-[11px] text-muted-foreground">{card.label}</div>
            </button>
          ))}
        </div>
      )}

      {/* Search + filters */}
      {!loading && servers.length > 0 && (
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-xs">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="搜索 Server 名称 / 描述"
              className="pl-8 text-xs h-8"
            />
          </div>
          <Select value={filterTransport} onValueChange={v => v && setFilterTransport(v)}>
            <SelectTrigger className="w-32 text-xs h-8"><SelectValue placeholder="传输方式" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部传输</SelectItem>
              <SelectItem value="http">HTTP</SelectItem>
              <SelectItem value="stdio">stdio</SelectItem>
              <SelectItem value="sse">SSE</SelectItem>
            </SelectContent>
          </Select>
          {(search || quickFilter !== 'all' || filterTransport !== 'all') && (
            <Button variant="ghost" size="xs" onClick={() => { setSearch(''); setQuickFilter('all'); setFilterTransport('all'); }}>
              清除筛选
            </Button>
          )}
        </div>
      )}

      {/* Table */}
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
                <TableHead className="w-24 text-center">连接器</TableHead>
                <TableHead className="w-28 text-center">工具</TableHead>
                <TableHead className="w-20 text-center">最近同步</TableHead>
                <TableHead className="w-20 text-center">状态</TableHead>
                <TableHead className="w-24 text-center">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(server => {
                const status = getStatus(server);
                const toolCount = getToolCount(server.id);
                const resourceCount = getResourceCount(server.id);
                const toolsReady = getToolsReady(server.id);
                const resTypes = getResourceTypes(server.id);

                return (
                  <TableRow
                    key={server.id}
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => { setEditId(server.id); setView('edit'); }}
                  >
                    <TableCell>
                      <div className="font-mono font-semibold">{server.name}</div>
                    </TableCell>
                    <TableCell className="text-muted-foreground truncate max-w-[200px]" title={server.description}>{server.description || '—'}</TableCell>
                    <TableCell className="text-center">
                      {resourceCount > 0 ? (
                        <div className="flex items-center justify-center gap-1">
                          <span className="font-medium">{resourceCount}</span>
                          <span className="text-[10px] text-muted-foreground">{resTypes.join('/')}</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {toolCount > 0 ? (
                        <div className="flex items-center justify-center gap-1">
                          <span className="font-medium">{toolCount}</span>
                          <span className={`text-[10px] ${toolsReady === toolCount ? 'text-emerald-600' : 'text-amber-600'}`}>
                            ({toolsReady} 就绪)
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center text-[11px] text-muted-foreground">
                      {lastSyncLabel(server)}
                    </TableCell>
                    <TableCell className="text-center"><Badge variant={status.variant}>{status.label}</Badge></TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1" onClick={e => e.stopPropagation()}>
                        <Button variant="ghost" size="xs" className="text-destructive hover:text-destructive" onClick={() => handleDelete(server)}>删除</Button>
                      </div>
                      <ChevronRight size={14} className="inline-block text-muted-foreground ml-1" />
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-6">无匹配 Server</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
