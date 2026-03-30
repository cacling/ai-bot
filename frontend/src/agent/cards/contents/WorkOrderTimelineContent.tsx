/**
 * WorkOrderTimelineContent.tsx — 工单时间线卡片 (colSpan: 2)
 *
 * data shape: WorkOrderTimelineData | null
 */

import { memo } from 'react';
import { type Lang, T } from '../../../i18n';

interface TimelineEvent {
  event_type: string;
  actor_type?: string;
  actor_id?: string;
  note?: string;
  payload_json?: string;
  created_at: string;
}

type WorkOrderTimelineData = TimelineEvent[];

const EVENT_LABELS: Record<string, { zh: string; en: string; dot: string }> = {
  created:                   { zh: '创建',     en: 'Created',        dot: 'bg-green-400' },
  assigned:                  { zh: '分配',     en: 'Assigned',       dot: 'bg-blue-400' },
  queued:                    { zh: '入队列',   en: 'Queued',         dot: 'bg-blue-300' },
  status_changed:            { zh: '状态变更', en: 'Status Changed', dot: 'bg-amber-400' },
  child_created:             { zh: '创建子单', en: 'Child Created',  dot: 'bg-purple-400' },
  appointment_created:       { zh: '创建预约', en: 'Appointment',    dot: 'bg-indigo-400' },
  appointment_rescheduled:   { zh: '改约',     en: 'Rescheduled',    dot: 'bg-orange-400' },
  customer_confirmed:        { zh: '客户确认', en: 'Confirmed',      dot: 'bg-green-400' },
  customer_no_show:          { zh: '客户爽约', en: 'No Show',        dot: 'bg-red-400' },
  execution_succeeded:       { zh: '执行成功', en: 'Succeeded',      dot: 'bg-green-500' },
  execution_failed:          { zh: '执行失败', en: 'Failed',         dot: 'bg-red-500' },
  reopened:                  { zh: '重新打开', en: 'Reopened',       dot: 'bg-amber-500' },
  closed:                    { zh: '关闭',     en: 'Closed',         dot: 'bg-gray-400' },
  note_added:                { zh: '备注',     en: 'Note',           dot: 'bg-gray-300' },
};

function parsePayload(json?: string): Record<string, unknown> | null {
  if (!json) return null;
  try { return JSON.parse(json); }
  catch { return null; }
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch { return iso; }
}

export const WorkOrderTimelineContent = memo(function WorkOrderTimelineContent({ data, lang }: { data: unknown; lang: Lang }) {
  const events = data as WorkOrderTimelineData | null;

  if (!events || events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-6 space-y-1.5 text-center select-none px-3">
        <span className="text-2xl opacity-30">🕐</span>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          {T[lang].wo_timeline_empty}
        </p>
      </div>
    );
  }

  return (
    <div className="p-3 max-h-[300px] overflow-y-auto">
      <div className="relative pl-4 space-y-3">
        {/* 竖线 */}
        <div className="absolute left-[5px] top-1 bottom-1 w-px bg-border" />

        {events.map((ev, i) => {
          const info = EVENT_LABELS[ev.event_type] ?? { zh: ev.event_type, en: ev.event_type, dot: 'bg-gray-400' };
          const payload = parsePayload(ev.payload_json);
          const statusChange = payload?.from && payload?.to ? `${payload.from} → ${payload.to}` : null;

          return (
            <div key={i} className="relative text-xs">
              {/* 圆点 */}
              <div className={`absolute -left-4 top-[5px] w-2.5 h-2.5 rounded-full ${info.dot} ring-2 ring-background`} />

              <div className="flex items-baseline justify-between gap-2">
                <span className="text-foreground font-medium">
                  {info[lang]}
                </span>
                <span className="text-muted-foreground/60 text-[10px] flex-shrink-0">
                  {formatTime(ev.created_at)}
                </span>
              </div>

              {statusChange && (
                <p className="text-muted-foreground mt-0.5">{statusChange}</p>
              )}

              {ev.note && (
                <p className="text-muted-foreground mt-0.5">{ev.note}</p>
              )}

              {ev.actor_id && (
                <p className="text-muted-foreground/50 text-[10px] mt-0.5">
                  {ev.actor_type === 'user' ? '👤' : ev.actor_type === 'system' ? '⚙️' : '🤖'} {ev.actor_id}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});
