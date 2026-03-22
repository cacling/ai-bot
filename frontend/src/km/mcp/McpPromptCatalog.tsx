/**
 * McpPromptCatalog — MCP Prompts 全局目录（严格 MCP 对齐）
 *
 * 聚合所有 MCP Server 通过 prompts/list 发现的 Prompt 模板。
 */
import { useState, useEffect } from 'react';
import { RefreshCw, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface CatalogPrompt {
  server_id: string;
  server_name: string;
  name: string;
  description?: string;
  arguments?: Array<{ name: string; description?: string; required?: boolean }>;
}

export function McpPromptCatalog() {
  const [prompts, setPrompts] = useState<CatalogPrompt[]>([]);
  const [loading, setLoading] = useState(false);
  const [serversScanned, setServersScanned] = useState(0);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/mcp/mcp-prompts');
      const data = await res.json();
      setPrompts(data.items ?? []);
      setServersScanned(data.servers_scanned ?? 0);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">MCP Prompts</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            通过 <code className="font-mono text-[10px] bg-muted px-1 rounded">prompts/list</code> 从所有 MCP Server 聚合发现的可参数化提示词模板。
            {serversScanned > 0 && ` 已扫描 ${serversScanned} 个 Server。`}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          {loading ? '扫描中...' : '重新扫描'}
        </Button>
      </div>

      {!loading && prompts.length === 0 && (
        <div className="text-xs text-muted-foreground text-center py-8 border rounded-lg">
          未发现任何 MCP Prompt。可能原因：所有 Server 均不支持 prompts/list，或未配置 endpoint。
        </div>
      )}

      {prompts.length > 0 && (
        <div className="rounded-lg border overflow-hidden">
          <Table className="text-xs">
            <TableHeader>
              <TableRow>
                <TableHead className="w-40">Server</TableHead>
                <TableHead className="w-40">名称</TableHead>
                <TableHead>描述</TableHead>
                <TableHead className="w-20 text-center">参数数</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {prompts.map((p, i) => (
                <TableRow key={`${p.server_id}-${p.name}-${i}`}>
                  <TableCell className="font-mono text-muted-foreground">{p.server_name}</TableCell>
                  <TableCell className="font-mono font-medium">{p.name}</TableCell>
                  <TableCell className="text-muted-foreground">{p.description ?? '—'}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant="outline" className="text-[9px]">{p.arguments?.length ?? 0}</Badge>
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
