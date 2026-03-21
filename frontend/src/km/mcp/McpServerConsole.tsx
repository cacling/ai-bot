/**
 * McpServerConsole.tsx — MCP Server 控制台（替代 McpServerForm）
 *
 * 5 模块：概览 / 基本信息 / 资源 / 工具摘要 / 健康与同步
 * 三栏布局：顶部页头 + 左侧导航 + 中间主内容
 */
import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Save, LayoutDashboard, Tag, Database, Wrench, Activity, Zap, Plug, RefreshCw } from 'lucide-react';
import { mcpApi, type McpServer, type McpResource, type McpToolRecord } from './api';
import { OverviewModule } from './server-console/OverviewModule';
import { IdentityModule } from './server-console/IdentityModule';
import { ResourceModule } from './server-console/ResourceModule';
import { ToolSummaryModule } from './server-console/ToolSummaryModule';
import { HealthModule } from './server-console/HealthModule';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

type Module = 'overview' | 'identity' | 'resources' | 'tools' | 'health';

const MODULES: Array<{ id: Module; label: string; icon: React.ReactNode }> = [
  { id: 'overview', label: '概览', icon: <LayoutDashboard size={14} /> },
  { id: 'identity', label: '基本信息', icon: <Tag size={14} /> },
  { id: 'resources', label: '资源', icon: <Database size={14} /> },
  { id: 'tools', label: '工具摘要', icon: <Wrench size={14} /> },
  { id: 'health', label: '健康与同步', icon: <Activity size={14} /> },
];

interface Props {
  serverId?: string;
  onBack: () => void;
  onSaved: () => void;
  onCreated?: (newId: string) => void;
  onOpenTool?: (toolId: string, step?: string, fromServer?: string) => void;
}

export function McpServerConsole({ serverId, onBack, onSaved, onCreated, onOpenTool }: Props) {
  const isEdit = !!serverId;
  const [module, setModule] = useState<Module>('overview');

  // Data
  const [server, setServer] = useState<McpServer | null>(null);
  const [resources, setResources] = useState<McpResource[]>([]);
  const [tools, setTools] = useState<McpToolRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    if (!serverId) { setLoading(false); return; }
    setLoading(true);
    Promise.all([
      mcpApi.getServer(serverId),
      mcpApi.listResources(serverId),
      mcpApi.listTools(serverId),
    ]).then(([s, r, t]) => {
      setServer(s);
      setResources(r.items);
      setTools(t.items);
    }).catch(console.error).finally(() => setLoading(false));
  }, [serverId]);

  useEffect(load, [load]);

  // For new server mode (no serverId)
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [saving, setSaving] = useState(false);

  // Header actions (must be before any early returns)
  const [testingAll, setTestingAll] = useState(false);
  const [discoveringAll, setDiscoveringAll] = useState(false);

  const handleCreateServer = async () => {
    if (!newName.trim()) return alert('名称不能为空');
    setSaving(true);
    try {
      const { id } = await mcpApi.createServer({ name: newName.trim(), description: newDesc, transport: 'http', status: 'active' });
      if (onCreated) {
        onCreated(id);
      } else {
        onSaved();
      }
    } catch (e) {
      alert(`创建失败: ${e}`);
    } finally {
      setSaving(false);
    }
  };

  // New server: simplified create form
  if (!isEdit) {
    return (
      <div className="p-4">
        <div className="flex items-center justify-between mb-4">
          <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft size={14} /> 返回</Button>
          <Button size="sm" onClick={handleCreateServer} disabled={saving}><Save size={13} /> {saving ? '创建中...' : '创建'}</Button>
        </div>
        <h2 className="text-sm font-semibold mb-4">新建 MCP Server</h2>
        <div className="max-w-md space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">名称</label>
            <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="my-service" className="text-xs font-mono" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">描述</label>
            <Input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="服务描述" className="text-xs" />
          </div>
          <p className="text-[11px] text-muted-foreground">创建后可在控制台中添加资源和管理工具。</p>
        </div>
      </div>
    );
  }

  const handleTestAll = async () => {
    setTestingAll(true);
    try {
      for (const r of resources) {
        await mcpApi.testResource(r.id);
      }
    } catch { /* ignore */ }
    setTestingAll(false);
    load();
  };

  const handleDiscoverAll = async () => {
    setDiscoveringAll(true);
    try {
      for (const r of resources.filter(r => r.type === 'remote_mcp')) {
        await mcpApi.discoverFromResource(r.id);
      }
    } catch { /* ignore */ }
    setDiscoveringAll(false);
    load();
  };

  if (loading || !server) {
    return <div className="flex items-center justify-center h-full text-sm text-muted-foreground">加载中...</div>;
  }

  const statusInfo = server.status === 'planned'
    ? { label: '规划中', variant: 'outline' as const }
    : !server.enabled
      ? { label: '已禁用', variant: 'secondary' as const }
      : { label: '运行中', variant: 'default' as const };

  const lastSync = server.last_connected_at
    ? new Date(server.last_connected_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div className="flex flex-col h-full bg-[#F7F8FA]">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="bg-background border-b px-4 py-3 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft size={14} /> 返回</Button>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleTestAll} disabled={testingAll || resources.length === 0}>
              <Zap size={12} /> {testingAll ? '测试中...' : '测试全部资源'}
            </Button>
            <Button variant="outline" size="sm" onClick={handleDiscoverAll} disabled={discoveringAll || resources.filter(r => r.type === 'remote_mcp').length === 0}>
              <Plug size={12} /> {discoveringAll ? '发现中...' : '重新发现工具'}
            </Button>
            <Button variant="ghost" size="sm" onClick={load}>
              <RefreshCw size={12} />
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold font-mono">{server.name}</h2>
          {server.description && <span className="text-xs text-muted-foreground">{server.description}</span>}
        </div>
        <div className="flex items-center gap-3 mt-1.5">
          <Badge variant={statusInfo.variant} className="text-[10px]">{statusInfo.label}</Badge>
          <span className="text-[11px] text-muted-foreground">资源 {resources.length}</span>
          <span className="text-[11px] text-muted-foreground">工具 {tools.length}</span>
          {lastSync && <span className="text-[11px] text-muted-foreground">最近同步 {lastSync}</span>}
        </div>
      </div>

      {/* ── Body: Left Nav + Main Content ───────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Nav */}
        <div className="w-40 bg-background border-r shrink-0 py-2">
          {MODULES.map(m => (
            <button
              key={m.id}
              onClick={() => setModule(m.id)}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors ${
                module === m.id
                  ? 'text-primary bg-primary/5 font-medium border-r-2 border-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              {m.icon}
              {m.label}
              {m.id === 'resources' && resources.length > 0 && (
                <span className="ml-auto text-[10px] text-muted-foreground">{resources.length}</span>
              )}
              {m.id === 'tools' && tools.length > 0 && (
                <span className="ml-auto text-[10px] text-muted-foreground">{tools.length}</span>
              )}
            </button>
          ))}
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-auto p-4">
          {module === 'overview' && (
            <OverviewModule
              server={server}
              resources={resources}
              tools={tools}
              onNavigate={setModule}
              onOpenTool={onOpenTool}
            />
          )}
          {module === 'identity' && (
            <IdentityModule
              server={server}
              onSaved={() => { load(); onSaved(); }}
            />
          )}
          {module === 'resources' && (
            <ResourceModule
              serverId={server.id}
              resources={resources}
              tools={tools}
              onUpdated={load}
            />
          )}
          {module === 'tools' && (
            <ToolSummaryModule
              tools={tools}
              serverName={server.name}
              onOpenTool={onOpenTool}
            />
          )}
          {module === 'health' && (
            <HealthModule
              server={server}
              resources={resources}
              onUpdated={load}
            />
          )}
        </div>
      </div>
    </div>
  );
}
