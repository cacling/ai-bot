/**
 * ResourceModule — 资源列表（升级版）
 */
import { useState } from 'react';
import { Plus, Plug, Trash2, Zap } from 'lucide-react';
import { mcpApi, type McpResource, type McpToolRecord } from '../api';
import { ResourceEditDrawer } from './ResourceEditDrawer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

interface Props {
  serverId: string;
  resources: McpResource[];
  tools: McpToolRecord[];
  onUpdated: () => void;
}

function getTypeLabel(type: string) {
  if (type === 'remote_mcp') return 'Remote MCP';
  if (type === 'db') return 'DB';
  if (type === 'api') return 'API';
  return type;
}

function getConnectionTarget(r: McpResource): string {
  if (r.type === 'remote_mcp') return r.mcp_url ?? '—';
  if (r.type === 'api') return r.api_base_url ?? '—';
  if (r.type === 'db') return r.db_mode ?? '—';
  return '—';
}

export function ResourceModule({ serverId, resources, tools, onUpdated }: Props) {
  const [editingResource, setEditingResource] = useState<McpResource | null>(null);
  const [creating, setCreating] = useState(false);
  const [discovering, setDiscovering] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Map<string, { ok: boolean; error?: string; elapsed_ms?: number }>>(new Map());

  const getToolsForResource = (resourceId: string) =>
    tools.filter(t => t.resource?.id === resourceId);
  const getToolCount = (resourceId: string) =>
    getToolsForResource(resourceId).length;

  const handleDelete = async (r: McpResource) => {
    if (!confirm(`确定删除资源 ${r.name}？`)) return;
    try {
      await mcpApi.deleteResource(r.id);
      onUpdated();
    } catch (e) {
      alert(`删除失败: ${e}`);
    }
  };

  const handleTest = async (r: McpResource) => {
    setTesting(r.id);
    try {
      const res = await mcpApi.testResource(r.id);
      setTestResults(new Map(testResults).set(r.id, res));
    } catch (e) {
      setTestResults(new Map(testResults).set(r.id, { ok: false, error: String(e) }));
    } finally {
      setTesting(null);
    }
  };

  const handleDiscover = async (r: McpResource) => {
    if (r.type !== 'remote_mcp') return;
    setDiscovering(r.id);
    try {
      const res = await mcpApi.discoverFromResource(r.id);
      alert(`发现完成：${res.tools} 个工具（新增 ${res.created}，更新 ${res.updated}）`);
      onUpdated();
    } catch (e) {
      alert(`发现失败: ${e}`);
    } finally {
      setDiscovering(null);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold">资源 ({resources.length})</h3>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus size={12} /> 新增资源
        </Button>
      </div>

      {resources.length === 0 ? (
        <div className="text-xs text-muted-foreground text-center py-8 border rounded-lg">
          暂无资源。资源是连接对象（Remote MCP / DB / API），多个工具可以共享同一个资源。
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <Table className="text-xs">
            <TableHeader>
              <TableRow>
                <TableHead className="w-36">资源名</TableHead>
                <TableHead className="w-24 text-center">类型</TableHead>
                <TableHead>连接目标</TableHead>
                <TableHead className="w-20 text-center">工具数</TableHead>
                <TableHead className="w-20 text-center">状态</TableHead>
                <TableHead className="w-20 text-center">测试</TableHead>
                <TableHead className="w-36 text-center">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {resources.map(r => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono font-medium">{r.name}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant="outline" className="text-[10px]">{getTypeLabel(r.type)}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-[11px] font-mono truncate max-w-[200px]" title={getConnectionTarget(r)}>
                    {getConnectionTarget(r)}
                  </TableCell>
                  <TableCell className="text-center">
                    {(() => {
                      const refTools = getToolsForResource(r.id);
                      if (refTools.length === 0) return <span className="text-muted-foreground">0</span>;
                      return (
                        <span className="font-medium cursor-help" title={refTools.map(t => t.name).join(', ')}>
                          {refTools.length}
                        </span>
                      );
                    })()}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant={r.status === 'active' ? 'default' : 'outline'} className="text-[10px]">
                      {r.status === 'active' ? '正常' : r.status === 'disabled' ? '已禁用' : '规划中'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    {testResults.has(r.id) ? (
                      <Badge variant={testResults.get(r.id)!.ok ? 'default' : 'destructive'} className="text-[10px]">
                        {testResults.get(r.id)!.ok ? '通过' : '失败'}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-[10px]">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Button variant="ghost" size="xs" onClick={() => setEditingResource(r)}>编辑</Button>
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => handleTest(r)}
                        disabled={testing === r.id}
                        className={testResults.get(r.id)?.ok === true ? 'text-emerald-600' : testResults.get(r.id)?.ok === false ? 'text-destructive' : ''}
                      >
                        <Zap size={11} /> {testing === r.id ? '...' : testResults.has(r.id) ? (testResults.get(r.id)!.ok ? '通过' : '失败') : '测试'}
                      </Button>
                      {r.type === 'remote_mcp' && (
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => handleDiscover(r)}
                          disabled={discovering === r.id}
                        >
                          <Plug size={11} /> {discovering === r.id ? '...' : '发现'}
                        </Button>
                      )}
                      <Button variant="ghost" size="xs" className="text-destructive hover:text-destructive" onClick={() => handleDelete(r)}>
                        <Trash2 size={11} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground mt-3">
        资源是连接对象，不是工具映射。多个工具可以共享同一个资源。
      </p>

      {/* Edit Drawer */}
      {editingResource && (
        <ResourceEditDrawer
          serverId={serverId}
          resource={editingResource}
          tools={tools}
          onClose={() => setEditingResource(null)}
          onSaved={() => { setEditingResource(null); onUpdated(); }}
        />
      )}

      {/* Create Drawer */}
      {creating && (
        <ResourceEditDrawer
          serverId={serverId}
          resource={null}
          tools={tools}
          onClose={() => setCreating(false)}
          onSaved={() => { setCreating(false); onUpdated(); }}
        />
      )}
    </div>
  );
}
