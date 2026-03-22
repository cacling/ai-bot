/**
 * ToolSummaryModule — 工具只读摘要（方案 A：点击跳转 Tool Studio）
 */
import { ExternalLink } from 'lucide-react';
import { type McpToolRecord } from '../api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

interface Props {
  tools: McpToolRecord[];
  serverName: string;
  onOpenTool?: (toolId: string, step?: string, fromServer?: string) => void;
}

function getImplLabel(t: McpToolRecord): string {
  if (!t.impl_type) return '未配置';
  if (t.impl_type === 'script') return 'Script';
  if (t.impl_type === 'db') return 'DB (legacy)';
  if (t.impl_type === 'api') return 'API Proxy';
  return t.impl_type;
}

function getContractStatus(t: McpToolRecord): { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' } {
  if (t.input_schema || t.output_schema) return { label: '已定义', variant: 'default' };
  return { label: '未定义', variant: 'outline' };
}

function getConfigStatus(t: McpToolRecord): { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' } {
  if (t.disabled) return { label: '已禁用', variant: 'secondary' };
  if (t.mocked) return { label: 'Mock', variant: 'outline' };
  if (!t.impl_type) return { label: '待配置', variant: 'destructive' };
  if (!t.input_schema && !t.output_schema) return { label: '不完整', variant: 'outline' };
  return { label: '已就绪', variant: 'default' };
}

export function ToolSummaryModule({ tools, serverName, onOpenTool }: Props) {
  const handleOpen = (toolId: string, step?: string) => {
    onOpenTool?.(toolId, step, serverName);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold">工具摘要</h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onOpenTool?.('', undefined, serverName)}
          className="text-xs"
        >
          <ExternalLink size={12} /> 前往 MCP 工具页
        </Button>
      </div>

      {tools.length === 0 ? (
        <div className="text-xs text-muted-foreground text-center py-8 border rounded-lg">
          暂无工具。在资源中发现工具，或前往 MCP 工具页创建。
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <Table className="text-xs">
            <TableHeader>
              <TableRow>
                <TableHead className="w-40">工具名</TableHead>
                <TableHead className="w-20 text-center">实现方式</TableHead>
                <TableHead className="w-28 text-center">资源</TableHead>
                <TableHead className="w-20 text-center">契约</TableHead>
                <TableHead className="w-20 text-center">状态</TableHead>
                <TableHead className="w-16 text-center">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tools.map(tool => {
                const contract = getContractStatus(tool);
                const config = getConfigStatus(tool);
                return (
                  <TableRow key={tool.id} className={tool.disabled ? 'opacity-50' : ''}>
                    <TableCell>
                      <button
                        onClick={() => handleOpen(tool.id, 'overview')}
                        className="font-mono font-semibold text-primary hover:underline text-left"
                      >
                        {tool.name}
                      </button>
                    </TableCell>
                    <TableCell className="text-center">
                      <button
                        onClick={() => handleOpen(tool.id, 'impl')}
                        className="hover:underline text-muted-foreground"
                      >
                        {getImplLabel(tool)}
                      </button>
                    </TableCell>
                    <TableCell className="text-center">
                      {tool.resource ? (
                        <span className="text-[10px] font-mono text-muted-foreground" title={tool.resource.name}>
                          {tool.resource.name}
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <button onClick={() => handleOpen(tool.id, 'output')}>
                        <Badge variant={contract.variant} className="text-[10px] cursor-pointer">
                          {contract.label}
                        </Badge>
                      </button>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={config.variant} className="text-[10px]">
                        {config.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => handleOpen(tool.id, 'overview')}
                      >
                        编辑
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground mt-3">
        工具详细配置（输入输出契约、实现方式、Mock 场景、测试）请在 MCP 工具页的 Tool Studio 中完成。
      </p>
    </div>
  );
}
