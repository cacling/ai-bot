/**
 * ImportExportPage.tsx — 导入导出中心
 *
 * 任务列表 + 状态筛选 + 失败明细查看 + 重试
 */
import { memo, useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ChevronLeft, ChevronRight, RefreshCw, Eye } from 'lucide-react';
import { useAgentContext } from '../../AgentContext';
import { fetchTasks, retryTask, type ImportExportTask } from '../api';

const TYPE_OPTIONS: { value: string; zh: string; en: string }[] = [
  { value: '', zh: '全部类型', en: 'All Types' },
  { value: 'import', zh: '导入', en: 'Import' },
  { value: 'export', zh: '导出', en: 'Export' },
];

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'outline',
  running: 'default',
  success: 'secondary',
  partial_fail: 'destructive',
  failed: 'destructive',
};

export const ImportExportPage = memo(function ImportExportPage() {
  const { lang } = useAgentContext();
  const [items, setItems] = useState<ImportExportTask[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [typeFilter, setTypeFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [detailItem, setDetailItem] = useState<ImportExportTask | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchTasks({ page, page_size: pageSize, task_type: typeFilter || undefined });
      setItems(res.items);
      setTotal(res.total);
    } catch (err) {
      console.error('Failed to load tasks:', err);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, typeFilter]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.ceil(total / pageSize) || 1;

  const handleRetry = async (taskId: string) => {
    await retryTask(taskId);
    load();
  };

  function parseFailDetail(raw: string | null): Array<{ row?: number; reason?: string }> {
    if (!raw) return [];
    try { return JSON.parse(raw); } catch { return []; }
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-shrink-0 px-4 py-3 border-b border-border flex items-center gap-3">
        <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[120px] h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TYPE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt[lang]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto text-xs text-muted-foreground">
          {lang === 'zh' ? `共 ${total} 条` : `${total} total`}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{lang === 'zh' ? '任务名称' : 'Task Name'}</TableHead>
              <TableHead className="w-[70px]">{lang === 'zh' ? '类型' : 'Type'}</TableHead>
              <TableHead className="w-[80px]">{lang === 'zh' ? '状态' : 'Status'}</TableHead>
              <TableHead className="w-[80px]">{lang === 'zh' ? '总数' : 'Total'}</TableHead>
              <TableHead className="w-[80px]">{lang === 'zh' ? '成功' : 'Success'}</TableHead>
              <TableHead className="w-[80px]">{lang === 'zh' ? '失败' : 'Failed'}</TableHead>
              <TableHead className="w-[100px]">{lang === 'zh' ? '操作人' : 'Operator'}</TableHead>
              <TableHead className="w-[140px]">{lang === 'zh' ? '时间' : 'Time'}</TableHead>
              <TableHead className="w-[80px]">{lang === 'zh' ? '操作' : 'Actions'}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                  {lang === 'zh' ? '加载中...' : 'Loading...'}
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                  {lang === 'zh' ? '暂无任务' : 'No tasks'}
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => (
                <TableRow key={item.task_id}>
                  <TableCell className="text-sm font-medium">{item.task_name ?? item.file_name ?? '-'}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px]">{item.task_type}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[item.status] ?? 'secondary'} className="text-[10px]">
                      {item.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm tabular-nums">{item.total_count}</TableCell>
                  <TableCell className="text-sm tabular-nums">{item.success_count}</TableCell>
                  <TableCell className="text-sm tabular-nums">{item.fail_count}</TableCell>
                  <TableCell className="text-sm">{item.operator_name ?? '-'}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(item.created_at).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US')}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {item.fail_count > 0 && (
                        <Button variant="ghost" size="icon-sm" onClick={() => setDetailItem(item)} title={lang === 'zh' ? '查看失败' : 'View failures'}>
                          <Eye size={13} />
                        </Button>
                      )}
                      {(item.status === 'failed' || item.status === 'partial_fail') && (
                        <Button variant="ghost" size="icon-sm" onClick={() => handleRetry(item.task_id)} title={lang === 'zh' ? '重试' : 'Retry'}>
                          <RefreshCw size={13} />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex-shrink-0 px-4 py-2 border-t border-border flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          {lang === 'zh' ? `第 ${page} / ${totalPages} 页` : `Page ${page} of ${totalPages}`}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon-sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            <ChevronLeft size={14} />
          </Button>
          <Button variant="outline" size="icon-sm" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
            <ChevronRight size={14} />
          </Button>
        </div>
      </div>

      {/* Fail detail dialog */}
      <Dialog open={!!detailItem} onOpenChange={(open) => { if (!open) setDetailItem(null); }}>
        <DialogContent className="max-w-md max-h-[60vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="text-sm">{lang === 'zh' ? '失败明细' : 'Failure Detail'}</DialogTitle>
          </DialogHeader>
          {detailItem && (
            <div className="space-y-2">
              {parseFailDetail(detailItem.fail_detail).map((f, i) => (
                <div key={i} className="flex items-start gap-2 text-xs border-b border-border pb-1">
                  {f.row !== undefined && <Badge variant="outline" className="text-[10px]">Row {f.row}</Badge>}
                  <span className="text-muted-foreground">{f.reason ?? '-'}</span>
                </div>
              ))}
              {parseFailDetail(detailItem.fail_detail).length === 0 && (
                <p className="text-sm text-muted-foreground">{lang === 'zh' ? '无详细信息' : 'No details'}</p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
});
