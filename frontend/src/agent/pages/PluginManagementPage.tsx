/**
 * PluginManagementPage.tsx — Plugin catalog management + execution logs.
 *
 * Allows operators to view/register/edit plugins, manage bindings,
 * and inspect plugin execution logs for debugging.
 */
import { memo, useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { type Lang } from '../../i18n';
import { useAgentContext } from '../AgentContext';

const INTERACTION_PLATFORM_URL = '/ix-api';

interface Plugin {
  plugin_id: string;
  name: string;
  display_name_zh: string;
  display_name_en: string;
  description: string | null;
  plugin_type: string;
  handler_module: string;
  timeout_ms: number;
  fallback_behavior: string;
  status: string;
  version: string;
  created_at: string;
}

interface ExecutionLog {
  log_id: number;
  interaction_id: string;
  plugin_id: string;
  slot: string;
  shadow: boolean;
  duration_ms: number | null;
  status: string;
  error_message: string | null;
  created_at: string;
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${INTERACTION_PLATFORM_URL}${path}`, init);
  return res.json() as Promise<T>;
}

const TYPE_LABELS: Record<string, Record<Lang, string>> = {
  queue_selector: { zh: '队列选择器', en: 'Queue Selector' },
  candidate_scorer: { zh: '候选评分器', en: 'Candidate Scorer' },
  offer_strategy: { zh: '分配策略', en: 'Offer Strategy' },
  overflow_policy: { zh: '溢出策略', en: 'Overflow Policy' },
};

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  success: 'default',
  timeout: 'destructive',
  error: 'destructive',
  fallback: 'secondary',
};

export const PluginManagementPage = memo(function PluginManagementPage() {
  const { lang } = useAgentContext();
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [selectedPlugin, setSelectedPlugin] = useState<Plugin | null>(null);
  const [logs, setLogs] = useState<ExecutionLog[]>([]);
  const [logFilter, setLogFilter] = useState({ plugin_id: '', status: '' });
  const [activeTab, setActiveTab] = useState<'catalog' | 'logs'>('catalog');

  // Load plugins
  const loadPlugins = useCallback(() => {
    fetchJson<{ items: Plugin[] }>('/api/plugins/catalog').then(r => {
      setPlugins(r.items);
    }).catch(console.error);
  }, []);

  useEffect(() => { loadPlugins(); }, [loadPlugins]);

  // Load execution logs
  const loadLogs = useCallback(() => {
    const params = new URLSearchParams();
    if (logFilter.plugin_id) params.set('plugin_id', logFilter.plugin_id);
    if (logFilter.status) params.set('status', logFilter.status);
    params.set('limit', '100');

    fetchJson<{ items: ExecutionLog[] }>(`/api/plugins/logs?${params.toString()}`)
      .then(r => setLogs(r.items))
      .catch(console.error);
  }, [logFilter]);

  useEffect(() => {
    if (activeTab === 'logs') loadLogs();
  }, [activeTab, loadLogs]);

  const handleDisablePlugin = useCallback(async (pluginId: string) => {
    await fetch(`${INTERACTION_PLATFORM_URL}/api/plugins/catalog/${pluginId}`, { method: 'DELETE' });
    loadPlugins();
    if (selectedPlugin?.plugin_id === pluginId) setSelectedPlugin(null);
  }, [loadPlugins, selectedPlugin]);

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">
            {lang === 'zh' ? '插件管理' : 'Plugin Management'}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {lang === 'zh' ? '管理路由插件和查看执行日志' : 'Manage routing plugins and view execution logs'}
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex gap-1 bg-muted rounded-lg p-0.5">
          <Button
            variant={activeTab === 'catalog' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('catalog')}
          >
            {lang === 'zh' ? '插件目录' : 'Catalog'}
          </Button>
          <Button
            variant={activeTab === 'logs' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('logs')}
          >
            {lang === 'zh' ? '执行日志' : 'Exec Logs'}
          </Button>
        </div>
      </div>

      {/* Plugin Catalog Tab */}
      {activeTab === 'catalog' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Plugin list */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center justify-between">
                <span>{lang === 'zh' ? '已注册插件' : 'Registered Plugins'}</span>
                <Badge variant="secondary" className="text-[10px]">{plugins.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">{lang === 'zh' ? '名称' : 'Name'}</TableHead>
                    <TableHead className="text-xs">{lang === 'zh' ? '类型' : 'Type'}</TableHead>
                    <TableHead className="text-xs">{lang === 'zh' ? '超时' : 'Timeout'}</TableHead>
                    <TableHead className="text-xs">{lang === 'zh' ? '回退' : 'Fallback'}</TableHead>
                    <TableHead className="text-xs">{lang === 'zh' ? '状态' : 'Status'}</TableHead>
                    <TableHead className="text-xs w-20"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {plugins.map(p => (
                    <TableRow
                      key={p.plugin_id}
                      className={`cursor-pointer ${selectedPlugin?.plugin_id === p.plugin_id ? 'bg-muted' : ''}`}
                      onClick={() => setSelectedPlugin(p)}
                    >
                      <TableCell className="text-xs">
                        <div className="font-medium">{lang === 'zh' ? p.display_name_zh : p.display_name_en}</div>
                        <div className="text-[10px] text-muted-foreground">{p.name}</div>
                      </TableCell>
                      <TableCell className="text-xs">
                        <Badge variant="outline" className="text-[10px]">
                          {TYPE_LABELS[p.plugin_type]?.[lang] ?? p.plugin_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{p.timeout_ms}ms</TableCell>
                      <TableCell className="text-xs">{p.fallback_behavior}</TableCell>
                      <TableCell>
                        <Badge variant={p.status === 'active' ? 'default' : 'secondary'} className="text-[10px]">
                          {p.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {p.status === 'active' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-[10px] text-destructive"
                            onClick={(e) => { e.stopPropagation(); handleDisablePlugin(p.plugin_id); }}
                          >
                            {lang === 'zh' ? '禁用' : 'Disable'}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {plugins.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
                        {lang === 'zh' ? '暂无已注册插件' : 'No registered plugins'}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Plugin detail */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">
                {selectedPlugin
                  ? (lang === 'zh' ? selectedPlugin.display_name_zh : selectedPlugin.display_name_en)
                  : (lang === 'zh' ? '插件详情' : 'Plugin Detail')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              {selectedPlugin ? (
                <>
                  <div className="space-y-2">
                    <div>
                      <span className="text-muted-foreground">{lang === 'zh' ? '标识' : 'ID'}:</span>
                      <span className="ml-1 font-mono text-[10px]">{selectedPlugin.plugin_id}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">{lang === 'zh' ? '内部名称' : 'Name'}:</span>
                      <span className="ml-1">{selectedPlugin.name}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">{lang === 'zh' ? '处理模块' : 'Handler'}:</span>
                      <span className="ml-1 font-mono">{selectedPlugin.handler_module}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">{lang === 'zh' ? '版本' : 'Version'}:</span>
                      <span className="ml-1">{selectedPlugin.version}</span>
                    </div>
                    {selectedPlugin.description && (
                      <div>
                        <span className="text-muted-foreground">{lang === 'zh' ? '描述' : 'Description'}:</span>
                        <p className="mt-1 text-muted-foreground leading-relaxed">{selectedPlugin.description}</p>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-muted-foreground text-center py-8">
                  {lang === 'zh' ? '点击列表中的插件查看详情' : 'Click a plugin to view details'}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Execution Logs Tab */}
      {activeTab === 'logs' && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center justify-between">
              <span>{lang === 'zh' ? '执行日志' : 'Execution Logs'}</span>
              <div className="flex gap-2">
                <Input
                  value={logFilter.status}
                  onChange={e => setLogFilter(prev => ({ ...prev, status: e.target.value }))}
                  placeholder={lang === 'zh' ? '状态筛选...' : 'Status filter...'}
                  className="h-7 text-xs w-28"
                />
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={loadLogs}>
                  {lang === 'zh' ? '刷新' : 'Refresh'}
                </Button>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">#</TableHead>
                  <TableHead className="text-xs">Interaction</TableHead>
                  <TableHead className="text-xs">Plugin</TableHead>
                  <TableHead className="text-xs">Slot</TableHead>
                  <TableHead className="text-xs">{lang === 'zh' ? '耗时' : 'Duration'}</TableHead>
                  <TableHead className="text-xs">{lang === 'zh' ? '状态' : 'Status'}</TableHead>
                  <TableHead className="text-xs">{lang === 'zh' ? '错误' : 'Error'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map(log => (
                  <TableRow key={log.log_id}>
                    <TableCell className="text-xs font-mono">{log.log_id}</TableCell>
                    <TableCell className="text-xs font-mono">{log.interaction_id.slice(0, 8)}</TableCell>
                    <TableCell className="text-xs font-mono">{log.plugin_id.slice(0, 8)}</TableCell>
                    <TableCell className="text-xs">
                      <Badge variant="outline" className="text-[9px]">
                        {log.slot}
                        {log.shadow && ' (shadow)'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{log.duration_ms ?? '-'}ms</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[log.status] ?? 'outline'} className="text-[10px]">
                        {log.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-destructive max-w-[200px] truncate">
                      {log.error_message ?? '-'}
                    </TableCell>
                  </TableRow>
                ))}
                {logs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">
                      {lang === 'zh' ? '暂无执行日志' : 'No execution logs'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
});
