/**
 * OverviewModule — Server 概览
 *
 * 拆分"连接资源依赖"和"工具实现分布"两套摘要，避免概念混淆
 */
import { Tag, Database, Wrench, ExternalLink, Activity, Globe, Server } from 'lucide-react';
import { type McpServer, type McpResource, type McpToolRecord } from '../api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

type Module = 'overview' | 'identity' | 'resources' | 'tools' | 'health';

interface Props {
  server: McpServer;
  resources: McpResource[];
  tools: McpToolRecord[];
  onNavigate: (module: Module) => void;
  onOpenTool?: (toolId: string, step?: string, fromServer?: string) => void;
}

export function OverviewModule({ server, resources, tools, onNavigate, onOpenTool }: Props) {
  // ── 连接器依赖 ──────────────────────────────────────────────────────────
  const resourceDist = {
    remote_mcp: resources.filter(r => r.type === 'remote_mcp').length,
    db: resources.filter(r => r.type === 'db').length,
    api: resources.filter(r => r.type === 'api').length,
  };

  // ── 工具实现分布 ──────────────────────────────────────────────────────────
  const toolImpl = {
    script: tools.filter(t => t.impl_type === 'script').length,
    api: tools.filter(t => t.impl_type === 'api').length,
    unconfigured: tools.filter(t => !t.impl_type || t.impl_type === 'db').length,
  };

  // ── 工具就绪状态 ──────────────────────────────────────────────────────────
  const toolStatus = {
    ready: tools.filter(t => !t.disabled && !t.mocked && t.impl_type).length,
    mock: tools.filter(t => t.mocked).length,
    disabled: tools.filter(t => t.disabled).length,
    pending: tools.filter(t => !t.disabled && !t.impl_type).length,
  };

  // 计算每个资源被多少工具引用
  const getToolsUsingResource = (resId: string) =>
    tools.filter(t => {
      if (!t.execution_config) return false;
      try {
        const cfg = JSON.parse(t.execution_config);
        return cfg.resource_id === resId;
      } catch { return false; }
    }).length;

  return (
    <div className="space-y-5">
      <h3 className="text-sm font-semibold">概览</h3>

      {server.description && (
        <p className="text-xs text-muted-foreground">{server.description}</p>
      )}

      {/* ── 连接器 vs 工具实现 并排 ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        {/* 连接器依赖 */}
        <Card className="cursor-pointer hover:border-primary/30 transition-colors" onClick={() => onNavigate('resources')}>
          <CardContent className="pt-3 pb-3 px-4">
            <div className="flex items-center gap-2 mb-2">
              <Globe size={14} className="text-muted-foreground" />
              <span className="text-xs font-medium">连接器</span>
              <span className="ml-auto text-lg font-semibold">{resources.length}</span>
            </div>
            <div className="space-y-1">
              {resourceDist.remote_mcp > 0 && (
                <div className="flex items-center gap-2 text-[11px]">
                  <Badge variant="outline" className="text-[9px] px-1.5">MCP</Badge>
                  <span className="text-muted-foreground">{resourceDist.remote_mcp} 个远端 MCP 端点</span>
                </div>
              )}
              {resourceDist.db > 0 && (
                <div className="flex items-center gap-2 text-[11px]">
                  <Badge variant="outline" className="text-[9px] px-1.5">DB</Badge>
                  <span className="text-muted-foreground">{resourceDist.db} 个数据库</span>
                </div>
              )}
              {resourceDist.api > 0 && (
                <div className="flex items-center gap-2 text-[11px]">
                  <Badge variant="outline" className="text-[9px] px-1.5">API</Badge>
                  <span className="text-muted-foreground">{resourceDist.api} 个 API 端点</span>
                </div>
              )}
              {resources.length === 0 && <span className="text-[11px] text-muted-foreground">暂无连接器</span>}
            </div>
          </CardContent>
        </Card>

        {/* 工具实现分布 */}
        <Card className="cursor-pointer hover:border-primary/30 transition-colors" onClick={() => onNavigate('tools')}>
          <CardContent className="pt-3 pb-3 px-4">
            <div className="flex items-center gap-2 mb-2">
              <Wrench size={14} className="text-muted-foreground" />
              <span className="text-xs font-medium">工具实现</span>
              <span className="ml-auto text-lg font-semibold">{tools.length}</span>
            </div>
            <div className="space-y-1">
              {toolImpl.script > 0 && (
                <div className="flex items-center gap-2 text-[11px]">
                  <Badge variant="outline" className="text-[9px] px-1.5">脚本</Badge>
                  <span className="text-muted-foreground">{toolImpl.script} 个通过 Remote MCP 执行</span>
                </div>
              )}
              {toolImpl.api > 0 && (
                <div className="flex items-center gap-2 text-[11px]">
                  <Badge variant="outline" className="text-[9px] px-1.5">API</Badge>
                  <span className="text-muted-foreground">{toolImpl.api} 个调用外部 API</span>
                </div>
              )}
              {toolImpl.unconfigured > 0 && (
                <div className="flex items-center gap-2 text-[11px]">
                  <Badge variant="destructive" className="text-[9px] px-1.5">!</Badge>
                  <span className="text-destructive">{toolImpl.unconfigured} 个待配置</span>
                </div>
              )}
              {tools.length === 0 && <span className="text-[11px] text-muted-foreground">暂无工具</span>}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── 工具就绪状态 ──────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="pt-3 pb-3 px-4">
          <div className="flex items-center gap-2 mb-2">
            <Tag size={14} className="text-muted-foreground" />
            <span className="text-xs font-medium">工具就绪状态</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {toolStatus.ready > 0 && <Badge variant="default" className="text-[10px]">已就绪 {toolStatus.ready}</Badge>}
            {toolStatus.mock > 0 && <Badge variant="outline" className="text-[10px]">Mock {toolStatus.mock}</Badge>}
            {toolStatus.disabled > 0 && <Badge variant="secondary" className="text-[10px]">已禁用 {toolStatus.disabled}</Badge>}
            {toolStatus.pending > 0 && <Badge variant="destructive" className="text-[10px]">待配置 {toolStatus.pending}</Badge>}
            {tools.length === 0 && <span className="text-[10px] text-muted-foreground">-</span>}
          </div>
        </CardContent>
      </Card>

      {/* ── 连接器影响面（blast radius）───────────────────────────────────── */}
      {resources.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-muted-foreground mb-2">连接器影响面</h4>
          <div className="space-y-1.5">
            {resources.map(r => {
              const toolCount = getToolsUsingResource(r.id);
              return (
                <div key={r.id} className="flex items-center gap-2 text-[11px]">
                  <Badge variant="outline" className="text-[9px] px-1.5 shrink-0">
                    {r.type === 'remote_mcp' ? 'MCP' : r.type === 'db' ? 'DB' : 'API'}
                  </Badge>
                  <span className="font-mono font-medium">{r.name}</span>
                  <span className="text-muted-foreground">→</span>
                  <span className={toolCount > 0 ? 'text-foreground' : 'text-muted-foreground'}>
                    {toolCount > 0 ? `影响 ${toolCount} 个工具` : '未被引用'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── 快速操作 ──────────────────────────────────────────────────────── */}
      <div>
        <h4 className="text-xs font-medium text-muted-foreground mb-2">快速操作</h4>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => onNavigate('identity')}>
            <Tag size={12} /> 编辑基本信息
          </Button>
          <Button variant="outline" size="sm" onClick={() => onNavigate('resources')}>
            <Database size={12} /> 管理连接器
          </Button>
          <Button variant="outline" size="sm" onClick={() => onNavigate('health')}>
            <Activity size={12} /> 健康与同步
          </Button>
          <Button variant="outline" size="sm" onClick={() => onOpenTool?.('', undefined, server.name)}>
            <ExternalLink size={12} /> 前往工具页
          </Button>
        </div>
      </div>
    </div>
  );
}
