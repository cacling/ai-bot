/**
 * McpResourceCatalog — MCP Resources 全局目录（严格 MCP 对齐）
 *
 * 聚合所有 MCP Server 通过 resources/list 发现的 URI 标识上下文资源。
 */
import { useState, useEffect } from 'react';
import { RefreshCw, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface CatalogResource {
  server_id: string;
  server_name: string;
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export function McpResourceCatalog() {
  const [resources, setResources] = useState<CatalogResource[]>([]);
  const [loading, setLoading] = useState(false);
  const [serversScanned, setServersScanned] = useState(0);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/mcp/mcp-resources');
      const data = await res.json();
      setResources(data.items ?? []);
      setServersScanned(data.servers_scanned ?? 0);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">MCP Resources</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            通过 <code className="font-mono text-[10px] bg-muted px-1 rounded">resources/list</code> 从所有 MCP Server 聚合发现的 URI 标识上下文资源。
            {serversScanned > 0 && ` 已扫描 ${serversScanned} 个 Server。`}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          {loading ? '扫描中...' : '重新扫描'}
        </Button>
      </div>

      {!loading && resources.length === 0 && (
        <div className="text-xs text-muted-foreground text-center py-8 border rounded-lg">
          未发现任何 MCP Resource。可能原因：所有 Server 均不支持 resources/list，或未配置 endpoint。
        </div>
      )}

      {resources.length > 0 && (
        <div className="rounded-lg border overflow-hidden">
          <Table className="text-xs">
            <TableHeader>
              <TableRow>
                <TableHead className="w-40">Server</TableHead>
                <TableHead className="w-48">URI</TableHead>
                <TableHead className="w-32">名称</TableHead>
                <TableHead>描述</TableHead>
                <TableHead className="w-28 text-center">MIME</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {resources.map((r, i) => (
                <TableRow key={`${r.server_id}-${r.uri}-${i}`}>
                  <TableCell className="font-mono text-muted-foreground">{r.server_name}</TableCell>
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
