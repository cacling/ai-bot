/**
 * AuditLogPage.tsx — 操作日志页
 *
 * 操作人、动作、对象、前后值、时间
 */
import { memo, useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
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
import { Search, ChevronLeft, ChevronRight, Eye } from 'lucide-react';
import { useAgentContext } from '../../AgentContext';
import { fetchAuditLogs, type AuditLogItem } from '../api';

const OBJECT_TYPE_OPTIONS: { value: string; zh: string; en: string }[] = [
  { value: '', zh: '全部类型', en: 'All Types' },
  { value: 'party', zh: '客户', en: 'Party' },
  { value: 'tag', zh: '标签', en: 'Tag' },
  { value: 'segment', zh: '分群', en: 'Segment' },
  { value: 'consent', zh: '授权', en: 'Consent' },
  { value: 'lifecycle', zh: '生命周期', en: 'Lifecycle' },
  { value: 'import_task', zh: '导入任务', en: 'Import Task' },
];

const ACTION_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  create: 'default',
  update: 'secondary',
  delete: 'destructive',
  merge: 'outline',
  split: 'outline',
  blacklist: 'destructive',
  import: 'secondary',
  export: 'secondary',
};

function formatJson(raw: string | null): string {
  if (!raw) return '-';
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

export const AuditLogPage = memo(function AuditLogPage() {
  const { lang } = useAgentContext();
  const [objectType, setObjectType] = useState('');
  const [operatorKeyword, setOperatorKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [items, setItems] = useState<AuditLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [detailItem, setDetailItem] = useState<AuditLogItem | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchAuditLogs({
        page,
        page_size: pageSize,
        object_type: objectType || undefined,
        operator_id: operatorKeyword || undefined,
      });
      setItems(res.items);
      setTotal(res.total);
    } catch (err) {
      console.error('Failed to load audit logs:', err);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, objectType, operatorKeyword]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.ceil(total / pageSize) || 1;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Filter bar */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-border flex items-center gap-3 flex-wrap">
        <Select value={objectType} onValueChange={(v) => { setObjectType(v); setPage(1); }}>
          <SelectTrigger className="w-[130px] h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {OBJECT_TYPE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt[lang]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative min-w-[180px] max-w-[280px]">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={operatorKeyword}
            onChange={(e) => setOperatorKeyword(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { setPage(1); load(); } }}
            placeholder={lang === 'zh' ? '操作人ID...' : 'Operator ID...'}
            className="pl-8 h-8 text-sm"
          />
        </div>
        <Button size="sm" variant="outline" onClick={() => { setPage(1); load(); }} className="h-8">
          {lang === 'zh' ? '查询' : 'Search'}
        </Button>
        <div className="ml-auto text-xs text-muted-foreground">
          {lang === 'zh' ? `共 ${total} 条` : `${total} total`}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[140px]">{lang === 'zh' ? '时间' : 'Time'}</TableHead>
              <TableHead className="w-[100px]">{lang === 'zh' ? '操作人' : 'Operator'}</TableHead>
              <TableHead className="w-[80px]">{lang === 'zh' ? '动作' : 'Action'}</TableHead>
              <TableHead className="w-[80px]">{lang === 'zh' ? '对象类型' : 'Object'}</TableHead>
              <TableHead className="w-[180px]">{lang === 'zh' ? '对象ID' : 'Object ID'}</TableHead>
              <TableHead className="w-[60px]">{lang === 'zh' ? '详情' : 'Detail'}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  {lang === 'zh' ? '加载中...' : 'Loading...'}
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  {lang === 'zh' ? '暂无日志' : 'No logs'}
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => (
                <TableRow key={item.audit_log_id}>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(item.created_at).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US')}
                  </TableCell>
                  <TableCell className="text-sm">{item.operator_name ?? item.operator_id ?? '-'}</TableCell>
                  <TableCell>
                    <Badge variant={ACTION_VARIANT[item.action] ?? 'secondary'} className="text-[10px]">
                      {item.action}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px]">{item.object_type}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-[11px] text-muted-foreground truncate max-w-[180px]">
                    {item.object_id}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setDetailItem(item)}
                    >
                      <Eye size={14} />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex-shrink-0 px-4 py-2 border-t border-border flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          {lang === 'zh'
            ? `第 ${page} / ${totalPages} 页`
            : `Page ${page} of ${totalPages}`}
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

      {/* Detail dialog */}
      <Dialog open={!!detailItem} onOpenChange={(open) => { if (!open) setDetailItem(null); }}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="text-sm">
              {lang === 'zh' ? '变更详情' : 'Change Detail'}
            </DialogTitle>
          </DialogHeader>
          {detailItem && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-muted-foreground">{lang === 'zh' ? '动作' : 'Action'}:</span> {detailItem.action}</div>
                <div><span className="text-muted-foreground">{lang === 'zh' ? '对象' : 'Object'}:</span> {detailItem.object_type}</div>
                <div><span className="text-muted-foreground">{lang === 'zh' ? '操作人' : 'Operator'}:</span> {detailItem.operator_name ?? '-'}</div>
                <div><span className="text-muted-foreground">{lang === 'zh' ? '时间' : 'Time'}:</span> {new Date(detailItem.created_at).toLocaleString()}</div>
              </div>
              <Separator />
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">{lang === 'zh' ? '变更前' : 'Before'}</p>
                <pre className="text-xs bg-muted p-2 rounded max-h-40 overflow-auto whitespace-pre-wrap">
                  {formatJson(detailItem.before_value)}
                </pre>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">{lang === 'zh' ? '变更后' : 'After'}</p>
                <pre className="text-xs bg-muted p-2 rounded max-h-40 overflow-auto whitespace-pre-wrap">
                  {formatJson(detailItem.after_value)}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
});
