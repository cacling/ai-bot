/**
 * ExecutionRecordsPage.tsx — Tool Runtime 执行记录查询
 *
 * 分页列表 + 筛选（工具名、通道、成功/失败）
 */
import { memo, useEffect, useState, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { fetchExecutionRecords, type ExecutionRecord } from './api';
import { t, type Lang } from './i18n';

const PAGE_SIZE = 30;

export const ExecutionRecordsPage = memo(function ExecutionRecordsPage({ lang = 'zh' as Lang }: { lang?: Lang }) {
  const T = t(lang);
  const [records, setRecords] = useState<ExecutionRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);

  // Filters
  const [toolName, setToolName] = useState('');
  const [channel, setChannel] = useState('');
  const [success, setSuccess] = useState('');

  const load = useCallback(async (p = page) => {
    setLoading(true);
    try {
      const result = await fetchExecutionRecords({
        limit: PAGE_SIZE, offset: p * PAGE_SIZE,
        tool_name: toolName || undefined,
        channel: channel || undefined,
        success: success || undefined,
      });
      setRecords(result.items);
      setTotal(result.total);
    } catch { /* ignore */ }
    setLoading(false);
  }, [page, toolName, channel, success]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="p-6 space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-3">
        <Input placeholder={T.tool_name_placeholder} value={toolName} onChange={e => { setToolName(e.target.value); setPage(0); }}
          className="w-48 h-8 text-xs" />
        <Select value={channel} onValueChange={v => {
          const nextChannel = v ?? '__all__';
          setChannel(nextChannel === '__all__' ? '' : nextChannel);
          setPage(0);
        }}>
          <SelectTrigger className="w-32 h-8 text-xs"><SelectValue placeholder={T.channel} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">{T.all_channels}</SelectItem>
            <SelectItem value="online">online</SelectItem>
            <SelectItem value="voice">voice</SelectItem>
            <SelectItem value="outbound">outbound</SelectItem>
            <SelectItem value="workflow">workflow</SelectItem>
          </SelectContent>
        </Select>
        <Select value={success} onValueChange={v => {
          const nextSuccess = v ?? '__all__';
          setSuccess(nextSuccess === '__all__' ? '' : nextSuccess);
          setPage(0);
        }}>
          <SelectTrigger className="w-28 h-8 text-xs"><SelectValue placeholder={T.status} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">{T.all}</SelectItem>
            <SelectItem value="true">{T.success}</SelectItem>
            <SelectItem value="false">{T.failed}</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="ghost" size="sm" className="h-8" onClick={() => load()}>
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </Button>
        <span className="text-xs text-muted-foreground ml-auto">{total} {T.records_suffix}</span>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="text-left p-2 font-medium">{T.col_time}</th>
                  <th className="text-left p-2 font-medium">{T.col_tool}</th>
                  <th className="text-left p-2 font-medium">{T.col_channel}</th>
                  <th className="text-left p-2 font-medium">{T.col_adapter}</th>
                  <th className="text-left p-2 font-medium">{T.col_status}</th>
                  <th className="text-right p-2 font-medium">{T.col_latency}</th>
                  <th className="text-left p-2 font-medium">{T.col_trace}</th>
                </tr>
              </thead>
              <tbody>
                {records.length === 0 && (
                  <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">
                    {loading ? T.loading : T.no_records}
                  </td></tr>
                )}
                {records.map(r => (
                  <tr key={r.id} className="border-b hover:bg-muted/20 transition-colors">
                    <td className="p-2 text-muted-foreground whitespace-nowrap">{formatTime(r.created_at)}</td>
                    <td className="p-2 font-mono">{r.tool_name}</td>
                    <td className="p-2"><Badge variant="outline" className="text-[10px]">{r.channel}</Badge></td>
                    <td className="p-2"><Badge variant="secondary" className="text-[10px]">{r.adapter_type}</Badge></td>
                    <td className="p-2">
                      {r.success
                        ? <Badge className="bg-green-100 text-green-700 text-[10px]">{T.ok}</Badge>
                        : <Badge variant="destructive" className="text-[10px]">{r.error_code ?? T.fail}</Badge>}
                    </td>
                    <td className="p-2 text-right text-muted-foreground">{r.latency_ms}ms</td>
                    <td className="p-2 font-mono text-muted-foreground truncate max-w-[120px]" title={r.trace_id}>{r.trace_id.slice(0, 12)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="ghost" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
            <ChevronLeft size={14} />
          </Button>
          <span className="text-xs text-muted-foreground">{page + 1} / {totalPages}</span>
          <Button variant="ghost" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
            <ChevronRight size={14} />
          </Button>
        </div>
      )}
    </div>
  );
});

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch { return iso; }
}
