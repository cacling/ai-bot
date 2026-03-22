/**
 * McpResourcesModule — MCP Resources 发现（严格 MCP 对齐）
 *
 * 展示通过 resources/list 从 MCP Server 发现的 URI 标识上下文资源。
 * 这些是真正的 MCP Resource，不是 DB/API 连接（那些是 Connector）。
 */
import { useState, useEffect } from 'react';
import { RefreshCw, FileText } from 'lucide-react';
import { mcpApi, type McpServer } from '../api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface McpResourceItem {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

interface Props {
  server: McpServer;
}

export function McpResourcesModule({ server }: Props) {
  const [resources, setResources] = useState<McpResourceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const discover = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/mcp/servers/${server.id}/mcp-resources`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setResources(data.items ?? []);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (server.url) discover(); }, [server.id]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">MCP Resources</h3>
        <Button variant="outline" size="sm" onClick={discover} disabled={loading || !server.url}>
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          {loading ? '发现中...' : '重新发现'}
        </Button>
      </div>

      <p className="text-[11px] text-muted-foreground">
        通过 <code className="font-mono text-[10px] bg-muted px-1 rounded">resources/list</code> 从 MCP Server 发现的 URI 标识上下文资源。
      </p>

      {error && (
        <div className="text-xs text-destructive border border-destructive/20 rounded-lg p-3 bg-destructive/5">
          {error}
        </div>
      )}

      {!server.url && (
        <div className="text-xs text-muted-foreground text-center py-6 border rounded-lg">
          Server 未配置 endpoint，无法发现 Resources。
        </div>
      )}

      {server.url && !loading && resources.length === 0 && !error && (
        <div className="text-xs text-muted-foreground text-center py-6 border rounded-lg">
          该 Server 未暴露任何 MCP Resource，或不支持 resources/list。
        </div>
      )}

      {resources.length > 0 && (
        <div className="rounded-lg border overflow-hidden">
          <Table className="text-xs">
            <TableHeader>
              <TableRow>
                <TableHead className="w-48">URI</TableHead>
                <TableHead className="w-32">名称</TableHead>
                <TableHead>描述</TableHead>
                <TableHead className="w-28 text-center">MIME</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {resources.map(r => (
                <TableRow key={r.uri}>
                  <TableCell className="font-mono text-[10px]">{r.uri}</TableCell>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-muted-foreground">{r.description ?? '—'}</TableCell>
                  <TableCell className="text-center">
                    {r.mimeType ? <Badge variant="outline" className="text-[9px]">{r.mimeType}</Badge> : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
