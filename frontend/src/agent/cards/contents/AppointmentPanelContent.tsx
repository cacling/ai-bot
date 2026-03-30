/**
 * AppointmentPanelContent.tsx — 预约详情卡片 (colSpan: 1)
 *
 * data shape: AppointmentData | null
 */

import { memo } from 'react';
import { Badge } from '@/components/ui/badge';
import { type Lang, T } from '../../../i18n';

interface AppointmentData {
  id?: string;
  appointment_type?: string;
  booking_status?: string;
  scheduled_start_at?: string;
  scheduled_end_at?: string;
  actual_start_at?: string;
  actual_end_at?: string;
  location_text?: string;
  resource_id?: string;
  reschedule_count?: number;
  no_show_reason?: string;
}

const TYPE_LABELS: Record<string, { zh: string; en: string }> = {
  callback:     { zh: '电话回访', en: 'Callback' },
  store_visit:  { zh: '营业厅到店', en: 'Store Visit' },
  onsite:       { zh: '上门服务', en: 'Onsite' },
  video_verify: { zh: '视频核验', en: 'Video Verify' },
};

const STATUS_LABELS: Record<string, { zh: string; en: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  proposed:    { zh: '待确认', en: 'Proposed',    variant: 'outline' },
  confirmed:   { zh: '已确认', en: 'Confirmed',   variant: 'default' },
  checked_in:  { zh: '已签到', en: 'Checked In',  variant: 'default' },
  in_service:  { zh: '服务中', en: 'In Service',  variant: 'default' },
  completed:   { zh: '已完成', en: 'Completed',   variant: 'secondary' },
  rescheduled: { zh: '已改约', en: 'Rescheduled', variant: 'outline' },
  no_show:     { zh: '已爽约', en: 'No Show',     variant: 'destructive' },
  cancelled:   { zh: '已取消', en: 'Cancelled',   variant: 'secondary' },
};

function formatDateTime(iso?: string): string {
  if (!iso) return '-';
  try {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch { return iso; }
}

export const AppointmentPanelContent = memo(function AppointmentPanelContent({ data, lang }: { data: unknown; lang: Lang }) {
  const t = T[lang];
  const d = data as AppointmentData | null;

  if (!d) {
    return (
      <div className="flex flex-col items-center justify-center py-6 space-y-1.5 text-center select-none px-3">
        <span className="text-2xl opacity-30">📅</span>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          {t.appt_empty}
        </p>
      </div>
    );
  }

  const typeInfo = TYPE_LABELS[d.appointment_type ?? ''] ?? { zh: d.appointment_type, en: d.appointment_type };
  const statusInfo = STATUS_LABELS[d.booking_status ?? ''] ?? { zh: d.booking_status, en: d.booking_status, variant: 'secondary' as const };

  const rows: { label: string; value: string | undefined }[] = [
    { label: t.appt_type, value: typeInfo[lang] },
    { label: t.appt_scheduled, value: `${formatDateTime(d.scheduled_start_at)} ~ ${formatDateTime(d.scheduled_end_at)}` },
    { label: t.appt_location, value: d.location_text },
    { label: t.appt_resource, value: d.resource_id },
  ];

  if (d.actual_start_at) {
    rows.push({ label: t.appt_actual_start, value: formatDateTime(d.actual_start_at) });
  }
  if (d.actual_end_at) {
    rows.push({ label: t.appt_actual_end, value: formatDateTime(d.actual_end_at) });
  }
  if (d.reschedule_count && d.reschedule_count > 0) {
    rows.push({ label: t.appt_reschedules, value: String(d.reschedule_count) });
  }
  if (d.no_show_reason) {
    rows.push({ label: t.appt_no_show_reason, value: d.no_show_reason });
  }

  return (
    <div className="p-3 space-y-2.5 text-xs">
      <div className="flex items-center justify-between">
        <Badge variant={statusInfo.variant}>{statusInfo[lang]}</Badge>
      </div>

      {rows.filter(r => r.value).map(r => (
        <div key={r.label}>
          <span className="text-muted-foreground mr-1">{r.label}：</span>
          <span className="text-foreground">{r.value}</span>
        </div>
      ))}
    </div>
  );
});
