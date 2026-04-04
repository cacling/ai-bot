/**
 * DashboardPage.tsx — 效果看板（KPI + 活动效果 + 结果分布）
 */
import { useState, useEffect, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { type Lang } from '../../../i18n';
import { type DashboardStats, fetchDashboardStats } from '../api';

const L = {
  zh: {
    title: '效果看板',
    refresh: '刷新',
    totalTasks: '总任务数', connectRate: '接通率',
    conversionRate: '转化率', ptpRate: 'PTP率',
    completed: '已完成', inProgress: '进行中', pending: '待处理',
    campaignPerf: '活动效果',
    campaign: '活动名称', status: '状态',
    total: '总任务', results: '结果数', connected: '接通', converted: '转化',
    connectPct: '接通率', conversionPct: '转化率',
    resultDist: '结果分布',
    resultType: '结果类型', count: '次数',
    noData: '暂无数据',
    active: '进行中', paused: '已暂停', ended: '已结束',
    // Result labels
    ptp: '承诺还款', refusal: '拒绝', dispute: '争议',
    no_answer: '未接听', busy: '忙线', converted_label: '已转化',
    callback: '回呼', not_interested: '无兴趣',
    non_owner: '非机主', verify_failed: '验证失败', dnd: '免打扰',
    wrong_number: '空号',
  },
  en: {
    title: 'Performance',
    refresh: 'Refresh',
    totalTasks: 'Total Tasks', connectRate: 'Connect Rate',
    conversionRate: 'Conversion Rate', ptpRate: 'PTP Rate',
    completed: 'Completed', inProgress: 'In Progress', pending: 'Pending',
    campaignPerf: 'Campaign Performance',
    campaign: 'Campaign', status: 'Status',
    total: 'Total', results: 'Results', connected: 'Connected', converted: 'Converted',
    connectPct: 'Connect %', conversionPct: 'Conversion %',
    resultDist: 'Result Distribution',
    resultType: 'Result Type', count: 'Count',
    noData: 'No data available',
    active: 'Active', paused: 'Paused', ended: 'Ended',
    ptp: 'PTP', refusal: 'Refusal', dispute: 'Dispute',
    no_answer: 'No Answer', busy: 'Busy', converted_label: 'Converted',
    callback: 'Callback', not_interested: 'Not Interested',
    non_owner: 'Non-owner', verify_failed: 'Verify Failed', dnd: 'DND',
    wrong_number: 'Wrong Number',
  },
};

const RESULT_LABELS: Record<string, string> = {
  ptp: 'ptp', refusal: 'refusal', dispute: 'dispute',
  no_answer: 'no_answer', busy: 'busy', converted: 'converted_label',
  callback: 'callback', not_interested: 'not_interested',
  non_owner: 'non_owner', verify_failed: 'verify_failed', dnd: 'dnd',
  wrong_number: 'wrong_number',
};

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline'> = {
  active: 'default', paused: 'secondary', ended: 'outline',
};

export function DashboardPage({ lang }: { lang: Lang }) {
  const t = L[lang];
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchDashboardStats();
      setStats(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading && !stats) {
    return <div className="flex items-center justify-center h-full text-sm text-muted-foreground">{t.noData}</div>;
  }

  const o = stats?.overall;
  const resultEntries = Object.entries(stats?.result_distribution ?? {})
    .sort((a, b) => b[1] - a[1]);

  return (
    <div className="h-full overflow-auto p-4 space-y-4">
      {/* Refresh button */}
      <div className="flex justify-end">
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={load} disabled={loading}>
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          {t.refresh}
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-3">
        <KpiCard label={t.totalTasks} value={o?.total_tasks ?? 0}
          sub={`${t.completed} ${o?.completed ?? 0} / ${t.inProgress} ${o?.in_progress ?? 0} / ${t.pending} ${o?.pending ?? 0}`} />
        <KpiCard label={t.connectRate} value={`${o?.connect_rate ?? 0}%`} />
        <KpiCard label={t.conversionRate} value={`${o?.conversion_rate ?? 0}%`} />
        <KpiCard label={t.ptpRate} value={`${o?.ptp_rate ?? 0}%`} />
      </div>

      {/* Campaign Performance */}
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm">{t.campaignPerf}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {(stats?.by_campaign ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground p-4">{t.noData}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">{t.campaign}</TableHead>
                  <TableHead className="text-xs">{t.status}</TableHead>
                  <TableHead className="text-xs text-right">{t.total}</TableHead>
                  <TableHead className="text-xs text-right">{t.results}</TableHead>
                  <TableHead className="text-xs text-right">{t.connected}</TableHead>
                  <TableHead className="text-xs text-right">{t.converted}</TableHead>
                  <TableHead className="text-xs text-right">{t.connectPct}</TableHead>
                  <TableHead className="text-xs text-right">{t.conversionPct}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats!.by_campaign.map(c => (
                  <TableRow key={c.campaign_id}>
                    <TableCell className="text-xs font-medium">{c.campaign_name}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[c.status] ?? 'outline'} className="text-[10px]">
                        {t[c.status as keyof typeof t] ?? c.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-right">{c.total_tasks}</TableCell>
                    <TableCell className="text-xs text-right">{c.total_results}</TableCell>
                    <TableCell className="text-xs text-right">{c.connected}</TableCell>
                    <TableCell className="text-xs text-right font-medium">{c.converted}</TableCell>
                    <TableCell className="text-xs text-right">{c.connect_rate}%</TableCell>
                    <TableCell className="text-xs text-right font-medium">{c.conversion_rate}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Result Distribution */}
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm">{t.resultDist}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {resultEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4">{t.noData}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">{t.resultType}</TableHead>
                  <TableHead className="text-xs text-right">{t.count}</TableHead>
                  <TableHead className="text-xs w-1/2" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {resultEntries.map(([result, count]) => {
                  const maxCount = resultEntries[0]?.[1] ?? 1;
                  const pct = Math.round((count / maxCount) * 100);
                  const labelKey = RESULT_LABELS[result] ?? result;
                  return (
                    <TableRow key={result}>
                      <TableCell className="text-xs">
                        {t[labelKey as keyof typeof t] ?? result}
                      </TableCell>
                      <TableCell className="text-xs text-right font-mono">{count}</TableCell>
                      <TableCell>
                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground mb-1">{label}</p>
        <p className="text-2xl font-bold tracking-tight">{value}</p>
        {sub && <p className="text-[10px] text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}
