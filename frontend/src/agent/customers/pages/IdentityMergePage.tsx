/**
 * IdentityMergePage.tsx — 身份合并管理
 *
 * 复用 CDP resolution-cases API，展示疑似重复列表 + 审核操作
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
import { GitMerge, Check, X, SkipForward } from 'lucide-react';
import { useAgentContext } from '../../AgentContext';
import { fetchResolutionCases, updateResolutionCase, type ResolutionCase } from '../api';

const STATUS_OPTIONS = [
  { value: 'open', zh: '待审核', en: 'Open' },
  { value: 'approved', zh: '已批准', en: 'Approved' },
  { value: 'rejected', zh: '已拒绝', en: 'Rejected' },
  { value: 'executed', zh: '已执行', en: 'Executed' },
];

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  open: 'default',
  approved: 'secondary',
  rejected: 'destructive',
  executed: 'outline',
  cancelled: 'outline',
};

const ACTION_LABELS: Record<string, Record<string, string>> = {
  merge: { zh: '合并', en: 'Merge' },
  split: { zh: '拆分', en: 'Split' },
  relink: { zh: '重链接', en: 'Relink' },
  reject: { zh: '拒绝', en: 'Reject' },
};

export const IdentityMergePage = memo(function IdentityMergePage() {
  const { lang } = useAgentContext();
  const [items, setItems] = useState<ResolutionCase[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('open');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchResolutionCases({ status: statusFilter });
      setItems(res.items);
    } catch (err) {
      console.error('Failed to load resolution cases:', err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  const handleAction = async (caseId: string, status: string) => {
    try {
      await updateResolutionCase(caseId, { status });
      load();
    } catch (err) {
      console.error('Update case error:', err);
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-shrink-0 px-4 py-3 border-b border-border flex items-center gap-3">
        <GitMerge size={16} className="text-muted-foreground" />
        <span className="text-sm font-medium">{lang === 'zh' ? '身份合并审核' : 'Identity Resolution'}</span>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[120px] h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt[lang]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="ml-auto text-xs text-muted-foreground">
          {lang === 'zh' ? `${items.length} 条记录` : `${items.length} cases`}
        </span>
      </div>

      <div className="flex-1 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{lang === 'zh' ? '左实体' : 'Left Entity'}</TableHead>
              <TableHead>{lang === 'zh' ? '右实体' : 'Right Entity'}</TableHead>
              <TableHead className="w-[80px]">{lang === 'zh' ? '建议操作' : 'Suggested'}</TableHead>
              <TableHead className="w-[80px]">{lang === 'zh' ? '匹配分' : 'Score'}</TableHead>
              <TableHead className="w-[80px]">{lang === 'zh' ? '状态' : 'Status'}</TableHead>
              <TableHead>{lang === 'zh' ? '原因' : 'Reason'}</TableHead>
              <TableHead className="w-[120px]">{lang === 'zh' ? '操作' : 'Actions'}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  {lang === 'zh' ? '加载中...' : 'Loading...'}
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  {lang === 'zh' ? '暂无记录' : 'No cases'}
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => (
                <TableRow key={item.resolution_case_id}>
                  <TableCell className="text-xs">
                    <Badge variant="outline" className="text-[10px] mr-1">{item.left_entity_type}</Badge>
                    <span className="font-mono">{item.left_entity_id.slice(0, 8)}...</span>
                  </TableCell>
                  <TableCell className="text-xs">
                    <Badge variant="outline" className="text-[10px] mr-1">{item.right_entity_type}</Badge>
                    <span className="font-mono">{item.right_entity_id.slice(0, 8)}...</span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-[10px]">
                      {ACTION_LABELS[item.suggested_action]?.[lang] ?? item.suggested_action}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm tabular-nums">
                    {item.match_score != null ? item.match_score.toFixed(2) : '-'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[item.status] ?? 'secondary'} className="text-[10px]">
                      {item.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground truncate max-w-[200px]">
                    {item.review_reason ?? '-'}
                  </TableCell>
                  <TableCell>
                    {item.status === 'open' && (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleAction(item.resolution_case_id, 'approved')}
                          title={lang === 'zh' ? '批准' : 'Approve'}
                        >
                          <Check size={13} className="text-green-600" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleAction(item.resolution_case_id, 'rejected')}
                          title={lang === 'zh' ? '拒绝' : 'Reject'}
                        >
                          <X size={13} className="text-red-500" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleAction(item.resolution_case_id, 'cancelled')}
                          title={lang === 'zh' ? '忽略' : 'Skip'}
                        >
                          <SkipForward size={13} />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
});
