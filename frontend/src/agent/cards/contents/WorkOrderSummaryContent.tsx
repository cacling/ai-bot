/**
 * WorkOrderSummaryContent.tsx — 工单概要卡片 (colSpan: 1)
 *
 * data shape: WorkOrderSummaryData | null
 */

import { memo } from 'react';
import { Badge } from '@/components/ui/badge';
import { type Lang, T } from '../../../i18n';

interface WorkOrderSummaryData {
  id?: string;
  title?: string;
  status?: string;
  priority?: string;
  subtype?: string;
  queue_code?: string;
  owner_id?: string;
  customer_phone?: string;
  customer_name?: string;
  next_action_at?: string;
  created_at?: string;
  available_actions?: string[];
}

const STATUS_LABELS: Record<string, { zh: string; en: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  new:                    { zh: '新建',     en: 'New',              variant: 'secondary' },
  open:                   { zh: '待处理',   en: 'Open',             variant: 'default' },
  scheduled:              { zh: '已排期',   en: 'Scheduled',        variant: 'outline' },
  in_progress:            { zh: '处理中',   en: 'In Progress',      variant: 'default' },
  waiting_customer:       { zh: '等客户',   en: 'Waiting Customer', variant: 'destructive' },
  waiting_internal:       { zh: '等内部',   en: 'Waiting Internal', variant: 'outline' },
  waiting_external:       { zh: '等外部',   en: 'Waiting External', variant: 'outline' },
  waiting_verification:   { zh: '待验证',   en: 'Verifying',        variant: 'outline' },
  resolved:               { zh: '已解决',   en: 'Resolved',         variant: 'secondary' },
  closed:                 { zh: '已关闭',   en: 'Closed',           variant: 'secondary' },
  cancelled:              { zh: '已取消',   en: 'Cancelled',        variant: 'secondary' },
};

const PRIORITY_LABELS: Record<string, { zh: string; en: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  low:    { zh: '低', en: 'Low',    variant: 'secondary' },
  medium: { zh: '中', en: 'Medium', variant: 'outline' },
  high:   { zh: '高', en: 'High',   variant: 'default' },
  urgent: { zh: '紧急', en: 'Urgent', variant: 'destructive' },
};

export const WorkOrderSummaryContent = memo(function WorkOrderSummaryContent({ data, lang }: { data: unknown; lang: Lang }) {
  const t = T[lang];
  const d = data as WorkOrderSummaryData | null;

  if (!d) {
    return (
      <div className="flex flex-col items-center justify-center py-6 space-y-1.5 text-center select-none px-3">
        <span className="text-2xl opacity-30">📋</span>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          {t.wo_summary_empty}
        </p>
      </div>
    );
  }

  const statusInfo = STATUS_LABELS[d.status ?? ''] ?? { zh: d.status, en: d.status, variant: 'secondary' as const };
  const priorityInfo = PRIORITY_LABELS[d.priority ?? ''] ?? { zh: d.priority, en: d.priority, variant: 'secondary' as const };

  const rows: { label: string; value: string | undefined }[] = [
    { label: t.wo_summary_customer, value: d.customer_name ? `${d.customer_name} (${d.customer_phone})` : d.customer_phone },
    { label: t.wo_summary_queue, value: d.queue_code },
    { label: t.wo_summary_owner, value: d.owner_id },
    { label: t.wo_summary_next_action, value: d.next_action_at ? new Date(d.next_action_at).toLocaleString() : undefined },
  ];

  return (
    <div className="p-3 space-y-2.5 text-xs">
      <div className="flex items-start justify-between gap-2">
        <p className="text-foreground font-medium text-sm leading-snug flex-1">{d.title}</p>
        <div className="flex gap-1 flex-shrink-0">
          <Badge variant={priorityInfo.variant}>{priorityInfo[lang]}</Badge>
          <Badge variant={statusInfo.variant}>{statusInfo[lang]}</Badge>
        </div>
      </div>

      {rows.filter(r => r.value).map(r => (
        <div key={r.label}>
          <span className="text-muted-foreground mr-1">{r.label}：</span>
          <span className="text-foreground">{r.value}</span>
        </div>
      ))}

      {d.id && (
        <p className="text-muted-foreground/60 text-[10px] mt-1">{d.id}</p>
      )}
    </div>
  );
});
