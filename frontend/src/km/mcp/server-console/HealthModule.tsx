/**
 * HealthModule — 健康与同步模块
 */
import { useState, useEffect } from 'react';
import { RefreshCw, Zap, Plug } from 'lucide-react';
import { mcpApi, type McpServer, type McpResource, type ServerHealthInfo } from '../api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

interface Props {
  server: McpServer;
  resources: McpResource[];
  onUpdated: () => void;
}

export function HealthModule({ server, resources, onUpdated }: Props) {
  const [health, setHealth] = useState<ServerHealthInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [testingAll, setTestingAll] = useState(false);
  const [testResults, setTestResults] = useState<Map<string, { ok: boolean; error?: string; elapsed_ms?: number }>>(new Map());
  const [discovering, setDiscovering] = useState(false);

  useEffect(() => {
    mcpApi.getServerHealth(server.id)
      .then(setHealth)
      .catch(() => setHealth(null))
      .finally(() => setLoading(false));
  }, [server.id]);

  const handleTestAll = async () => {
    setTestingAll(true);
    const results = new Map<string, { ok: boolean; error?: string; elapsed_ms?: number }>();
    for (const r of resources) {
      try {
        const res = await mcpApi.testResource(r.id);
        results.set(r.id, res);
      } catch (e) {
        results.set(r.id, { ok: false, error: String(e) });
      }
    }
    setTestResults(results);
    setTestingAll(false);
  };

  const handleRediscover = async () => {
    const mcpResources = resources.filter(r => r.type === 'remote_mcp');
    if (mcpResources.length === 0) { alert('没有 Remote MCP 资源可发现'); return; }
    setDiscovering(true);
    try {
      for (const r of mcpResources) {
        await mcpApi.discoverFromResource(r.id);
      }
      onUpdated();
    } catch (e) {
      alert(`发现失败: ${e}`);
    } finally {
      setDiscovering(false);
    }
  };

  const lastSync = server.last_connected_at
    ? new Date(server.last_connected_at).toLocaleString('zh-CN')
    : null;

  const connectionStatus = server.status === 'planned'
    ? 'planned'
    : server.enabled
      ? 'active'
      : 'disabled';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold">健康与同步</h3>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleTestAll} disabled={testingAll || resources.length === 0}>
            <Zap size={12} /> {testingAll ? '测试中...' : '测试全部资源'}
          </Button>
          <Button variant="outline" size="sm" onClick={handleRediscover} disabled={discovering}>
            <Plug size={12} /> {discovering ? '发现中...' : '重新发现工具'}
          </Button>
        </div>
      </div>

      {/* Connection Status Card */}
      <Card>
        <CardContent className="pt-3 pb-3 px-4">
          <div className="grid grid-cols-3 gap-4 text-xs">
            <div>
              <div className="text-muted-foreground mb-1">连接状态</div>
              <Badge variant={connectionStatus === 'active' ? 'default' : connectionStatus === 'disabled' ? 'secondary' : 'outline'}>
                {connectionStatus === 'active' ? '正常' : connectionStatus === 'disabled' ? '已禁用' : '规划中'}
              </Badge>
            </div>
            <div>
              <div className="text-muted-foreground mb-1">最近同步</div>
              <span className="font-medium">{lastSync ?? '从未同步'}</span>
            </div>
            <div>
              <div className="text-muted-foreground mb-1">工具统计</div>
              {health ? (
                <div className="flex gap-2">
                  <span>就绪 {health.tools.ready}</span>
                  {health.tools.mocked > 0 && <span className="text-amber-600">Mock {health.tools.mocked}</span>}
                  {health.tools.unconfigured > 0 && <span className="text-destructive">待配置 {health.tools.unconfigured}</span>}
                </div>
              ) : loading ? (
                <span className="text-muted-foreground">加载中...</span>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Resource Health Table */}
      <div>
        <h4 className="text-xs font-medium text-muted-foreground mb-2">资源健康检查</h4>
        {resources.length === 0 ? (
          <div className="text-xs text-muted-foreground text-center py-4 border rounded-lg">暂无资源</div>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <Table className="text-xs">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-36">资源名</TableHead>
                  <TableHead className="w-24 text-center">类型</TableHead>
                  <TableHead className="w-24 text-center">状态</TableHead>
                  <TableHead className="w-24 text-center">测试结果</TableHead>
                  <TableHead className="w-20 text-center">耗时</TableHead>
                  <TableHead>备注</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resources.map(r => {
                  const result = testResults.get(r.id);
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono font-medium">{r.name}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="text-[10px]">
                          {r.type === 'remote_mcp' ? 'Remote MCP' : r.type === 'db' ? 'DB' : 'API'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={r.status === 'active' ? 'default' : 'outline'} className="text-[10px]">
                          {r.status === 'active' ? '正常' : r.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {result ? (
                          <Badge variant={result.ok ? 'default' : 'destructive'} className="text-[10px]">
                            {result.ok ? '通过' : '失败'}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center text-muted-foreground">
                        {result?.elapsed_ms != null ? `${result.elapsed_ms}ms` : '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground truncate max-w-[150px]">
                        {result?.error ?? '—'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
