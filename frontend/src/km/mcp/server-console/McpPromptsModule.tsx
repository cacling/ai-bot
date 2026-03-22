/**
 * McpPromptsModule — MCP Prompts 发现（严格 MCP 对齐）
 *
 * 展示通过 prompts/list 从 MCP Server 发现的 Prompt 模板。
 */
import { useState, useEffect } from 'react';
import { RefreshCw, MessageSquare } from 'lucide-react';
import { type McpServer } from '../api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface McpPromptItem {
  name: string;
  description?: string;
  arguments?: Array<{ name: string; description?: string; required?: boolean }>;
}

interface Props {
  server: McpServer;
}

export function McpPromptsModule({ server }: Props) {
  const [prompts, setPrompts] = useState<McpPromptItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const discover = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/mcp/servers/${server.id}/mcp-prompts`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setPrompts(data.items ?? []);
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
        <h3 className="text-sm font-semibold">MCP Prompts</h3>
        <Button variant="outline" size="sm" onClick={discover} disabled={loading || !server.url}>
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          {loading ? '发现中...' : '重新发现'}
        </Button>
      </div>

      <p className="text-[11px] text-muted-foreground">
        通过 <code className="font-mono text-[10px] bg-muted px-1 rounded">prompts/list</code> 从 MCP Server 发现的可参数化提示词模板。
      </p>

      {error && (
        <div className="text-xs text-destructive border border-destructive/20 rounded-lg p-3 bg-destructive/5">
          {error}
        </div>
      )}

      {!server.url && (
        <div className="text-xs text-muted-foreground text-center py-6 border rounded-lg">
          Server 未配置 endpoint，无法发现 Prompts。
        </div>
      )}

      {server.url && !loading && prompts.length === 0 && !error && (
        <div className="text-xs text-muted-foreground text-center py-6 border rounded-lg">
          该 Server 未暴露任何 MCP Prompt，或不支持 prompts/list。
        </div>
      )}

      {prompts.length > 0 && (
        <div className="rounded-lg border overflow-hidden">
          <Table className="text-xs">
            <TableHeader>
              <TableRow>
                <TableHead className="w-40">名称</TableHead>
                <TableHead>描述</TableHead>
                <TableHead className="w-28 text-center">参数数</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {prompts.map(p => (
                <TableRow key={p.name}>
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
