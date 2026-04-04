/**
 * CallRecordsPage.tsx — 通话记录 + 回呼任务
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { type Lang } from '../../../i18n';
import {
  type CallResult, type MarketingResult, type CallbackTask,
  fetchCallResults, fetchMarketingResults, fetchCallbacks, fetchTasks,
} from '../api';

const L = {
  zh: {
    title: '通话记录',
    allResults: '全部结果', allTypes: '全部类型',
    collection: '催收', marketing: '营销',
    phone: '手机号', type: '类型', result: '结果', remark: '备注',
    callbackTime: '回呼时间', ptpDate: 'PTP日期', time: '记录时间',
    noRecords: '暂无通话记录',
    callbackSection: '回呼任务',
    customerName: '客户', callbackPhone: '回呼号码', preferredTime: '预约时间',
    product: '产品', status: '状态',
    noCallbacks: '暂无回呼任务',
    dateFrom: '开始日期', dateTo: '截止日期',
    // Result labels
    ptp: '承诺还款', refusal: '拒绝', dispute: '争议',
    no_answer: '未接听', busy: '忙线', converted: '已转化',
    callback: '回呼', not_interested: '无兴趣',
    non_owner: '非机主', verify_failed: '验证失败', dnd: '免打扰',
    wrong_number: '空号', human_transfer: '转人工', interested: '有兴趣',
    pending: '待处理', completed: '已完成', cancelled: '已取消',
  },
  en: {
    title: 'Call Records',
    allResults: 'All Results', allTypes: 'All Types',
    collection: 'Collection', marketing: 'Marketing',
    phone: 'Phone', type: 'Type', result: 'Result', remark: 'Remark',
    callbackTime: 'Callback', ptpDate: 'PTP Date', time: 'Time',
    noRecords: 'No call records',
    callbackSection: 'Callback Tasks',
    customerName: 'Customer', callbackPhone: 'Callback Phone', preferredTime: 'Preferred Time',
    product: 'Product', status: 'Status',
    noCallbacks: 'No callback tasks',
    dateFrom: 'From', dateTo: 'To',
    ptp: 'PTP', refusal: 'Refusal', dispute: 'Dispute',
    no_answer: 'No Answer', busy: 'Busy', converted: 'Converted',
    callback: 'Callback', not_interested: 'Not Interested',
    non_owner: 'Non-owner', verify_failed: 'Verify Failed', dnd: 'DND',
    wrong_number: 'Wrong Number', human_transfer: 'Human Transfer', interested: 'Interested',
    pending: 'Pending', completed: 'Completed', cancelled: 'Cancelled',
  },
};

const RESULT_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  converted: 'default', ptp: 'default',
  no_answer: 'secondary', busy: 'secondary',
  refusal: 'destructive', dispute: 'destructive', dnd: 'destructive',
};

const ALL_RESULTS = ['ptp', 'refusal', 'dispute', 'no_answer', 'busy', 'converted', 'callback', 'not_interested', 'non_owner', 'verify_failed', 'dnd', 'wrong_number', 'human_transfer', 'interested'];

interface UnifiedRecord {
  id: string;
  phone: string;
  type: 'collection' | 'marketing';
  result: string;
  remark: string | null;
  callback_time: string | null;
  ptp_date: string | null;
  time: string;
}

export function CallRecordsPage({ lang }: { lang: Lang }) {
  const t = L[lang];
  const [callResults, setCallResults] = useState<CallResult[]>([]);
  const [mktResults, setMktResults] = useState<MarketingResult[]>([]);
  const [callbacks, setCallbacks] = useState<CallbackTask[]>([]);
  const [resultFilter, setResultFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [callbacksExpanded, setCallbacksExpanded] = useState(true);
  const [taskTypeMap, setTaskTypeMap] = useState<Record<string, 'collection' | 'marketing'>>({});

  const load = useCallback(async () => {
    const [cr, mr, cb, tasks] = await Promise.all([
      fetchCallResults(), fetchMarketingResults(), fetchCallbacks(), fetchTasks(),
    ]);
    setCallResults(cr);
    setMktResults(mr);
    setCallbacks(cb);
    // Build task_id → task_type lookup for deriving call result type
    const map: Record<string, 'collection' | 'marketing'> = {};
    for (const t of tasks) map[t.id] = t.task_type;
    setTaskTypeMap(map);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Merge call + marketing results into unified list
  const records: UnifiedRecord[] = useMemo(() => {
    const merged: UnifiedRecord[] = [];
    for (const r of callResults) {
      // Derive type from task lookup; fallback to 'collection' for legacy data
      const derivedType = r.task_id ? (taskTypeMap[r.task_id] ?? 'collection') : 'collection';
      merged.push({
        id: r.result_id, phone: r.phone, type: derivedType,
        result: r.result, remark: r.remark,
        callback_time: r.callback_time, ptp_date: r.ptp_date,
        time: r.created_at,
      });
    }
    for (const r of mktResults) {
      merged.push({
        id: r.record_id, phone: r.phone, type: 'marketing',
        result: r.result, remark: null,
        callback_time: r.callback_time, ptp_date: null,
        time: r.recorded_at,
      });
    }
    // Sort by parsed timestamp descending (handles mixed timezone formats)
    merged.sort((a, b) => new Date(b.time ?? 0).getTime() - new Date(a.time ?? 0).getTime());
    return merged;
  }, [callResults, mktResults, taskTypeMap]);

  // Apply filters
  const filtered = useMemo(() => {
    const fromMs = dateFrom ? new Date(dateFrom + 'T00:00:00').getTime() : 0;
    const toMs = dateTo ? new Date(dateTo + 'T23:59:59').getTime() : Infinity;
    return records.filter(r => {
      if (resultFilter && r.result !== resultFilter) return false;
      if (typeFilter && r.type !== typeFilter) return false;
      if (dateFrom || dateTo) {
        const ms = new Date(r.time ?? 0).getTime();
        if (ms < fromMs || ms > toMs) return false;
      }
      return true;
    });
  }, [records, resultFilter, typeFilter, dateFrom, dateTo]);

  return (
    <div className="h-full overflow-auto p-4 space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={resultFilter} onValueChange={v => setResultFilter(v ?? '')}>
          <SelectTrigger className="w-32 h-8 text-xs">
            <SelectValue placeholder={t.allResults} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">{t.allResults}</SelectItem>
            {ALL_RESULTS.map(r => (
              <SelectItem key={r} value={r}>{t[r as keyof typeof t] ?? r}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={v => setTypeFilter(v ?? '')}>
          <SelectTrigger className="w-28 h-8 text-xs">
            <SelectValue placeholder={t.allTypes} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">{t.allTypes}</SelectItem>
            <SelectItem value="collection">{t.collection}</SelectItem>
            <SelectItem value="marketing">{t.marketing}</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1.5">
          <Input type="date" className="h-8 text-xs w-36" placeholder={t.dateFrom}
            value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          <span className="text-xs text-muted-foreground">~</span>
          <Input type="date" className="h-8 text-xs w-36" placeholder={t.dateTo}
            value={dateTo} onChange={e => setDateTo(e.target.value)} />
        </div>
        <Badge variant="outline" className="text-[10px]">{filtered.length}</Badge>
      </div>

      {/* Records Table */}
      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4">{t.noRecords}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">{t.phone}</TableHead>
                  <TableHead className="text-xs">{t.type}</TableHead>
                  <TableHead className="text-xs">{t.result}</TableHead>
                  <TableHead className="text-xs">{t.remark}</TableHead>
                  <TableHead className="text-xs">{t.callbackTime}</TableHead>
                  <TableHead className="text-xs">{t.ptpDate}</TableHead>
                  <TableHead className="text-xs">{t.time}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs font-mono">{r.phone}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">
                        {t[r.type as keyof typeof t] ?? r.type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={RESULT_VARIANT[r.result] ?? 'outline'} className="text-[10px]">
                        {t[r.result as keyof typeof t] ?? r.result}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                      {r.remark ?? '—'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.callback_time?.slice(0, 16).replace('T', ' ') ?? '—'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.ptp_date?.slice(0, 10) ?? '—'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.time?.slice(0, 16).replace('T', ' ')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Callback Tasks */}
      <Card>
        <CardHeader className="py-3 px-4 cursor-pointer" onClick={() => setCallbacksExpanded(!callbacksExpanded)}>
          <div className="flex items-center gap-2">
            {callbacksExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <CardTitle className="text-sm">{t.callbackSection}</CardTitle>
            <Badge variant="outline" className="text-[10px]">{callbacks.length}</Badge>
          </div>
        </CardHeader>
        {callbacksExpanded && (
          <CardContent className="p-0">
            {callbacks.length === 0 ? (
              <p className="text-sm text-muted-foreground p-4">{t.noCallbacks}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">{t.customerName}</TableHead>
                    <TableHead className="text-xs">{t.callbackPhone}</TableHead>
                    <TableHead className="text-xs">{t.preferredTime}</TableHead>
                    <TableHead className="text-xs">{t.product}</TableHead>
                    <TableHead className="text-xs">{t.status}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {callbacks.map(cb => (
                    <TableRow key={cb.task_id}>
                      <TableCell className="text-xs">{cb.customer_name}</TableCell>
                      <TableCell className="text-xs font-mono">{cb.callback_phone}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {cb.preferred_time?.slice(0, 16).replace('T', ' ')}
                      </TableCell>
                      <TableCell className="text-xs">{cb.product_name}</TableCell>
                      <TableCell>
                        <Badge variant={cb.status === 'completed' ? 'default' : cb.status === 'cancelled' ? 'destructive' : 'outline'} className="text-[10px]">
                          {t[cb.status as keyof typeof t] ?? cb.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
}
