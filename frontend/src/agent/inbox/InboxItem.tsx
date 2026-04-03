/**
 * InboxItem.tsx — Single interaction row in the Inbox panel.
 *
 * Shows: priority dot, state dot, customer info, SLA countdown,
 * channel/state badges, message preview, unread count.
 */
import { memo } from 'react';
import { Badge } from '@/components/ui/badge';
import { type InboxInteraction } from './InboxContext';
import { type Lang } from '../../i18n';
import { useSlaCountdown, type SlaUrgency } from '../hooks/useSlaCountdown';

interface InboxItemProps {
  interaction: InboxInteraction;
  isFocused: boolean;
  lang: Lang;
  onClick: () => void;
}

const STATE_COLORS: Record<string, string> = {
  assigned: 'bg-primary',
  active: 'bg-chart-4',
  wrapping_up: 'bg-warning',
  queued: 'bg-muted-foreground',
  offered: 'bg-chart-2',
  transferred: 'bg-chart-5',
};

const STATE_LABELS: Record<string, Record<Lang, string>> = {
  assigned: { zh: '已分配', en: 'Assigned' },
  active: { zh: '进行中', en: 'Active' },
  wrapping_up: { zh: '收尾���', en: 'Wrapping Up' },
  queued: { zh: '排队中', en: 'Queued' },
  offered: { zh: '待接受', en: 'Offered' },
  transferred: { zh: '已转接', en: 'Transferred' },
};

const CHANNEL_LABELS: Record<string, Record<Lang, string>> = {
  webchat: { zh: '文字', en: 'Chat' },
  phone: { zh: '语音', en: 'Voice' },
  sms: { zh: '短信', en: 'SMS' },
};

function formatTime(isoString: string | null): string {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function formatWaitTime(createdAt: string): string {
  const diff = Math.max(0, Date.now() - new Date(createdAt).getTime());
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h+`;
}

const PRIORITY_COLORS: Record<string, string> = {
  P1: 'bg-destructive',
  P2: 'bg-warning',
  P3: 'bg-muted-foreground',
};

function getPriorityInfo(priority: number): { label: string; color: string } {
  if (priority <= 10) return { label: 'P1', color: PRIORITY_COLORS.P1 };
  if (priority <= 30) return { label: 'P2', color: PRIORITY_COLORS.P2 };
  return { label: 'P3', color: PRIORITY_COLORS.P3 };
}

const SLA_URGENCY_STYLES: Record<SlaUrgency, string> = {
  ok: 'text-muted-foreground',
  warning: 'text-warning font-medium',
  critical: 'text-destructive font-medium animate-pulse',
  breached: 'text-destructive font-bold',
};

export const InboxItem = memo(function InboxItem({ interaction, isFocused, lang, onClick }: InboxItemProps) {
  const stateColor = STATE_COLORS[interaction.state] ?? 'bg-muted-foreground';
  const stateLabel = STATE_LABELS[interaction.state]?.[lang] ?? interaction.state;
  const channelLabel = CHANNEL_LABELS[interaction.channel]?.[lang] ?? interaction.channel;
  const customerId = interaction.customer_party_id?.slice(0, 8) ?? '---';
  const preview = interaction.lastMessagePreview ?? interaction.handoff_summary ?? '';
  const { label: pLabel, color: pColor } = getPriorityInfo(interaction.priority);

  const sla = useSlaCountdown(
    interaction.first_response_due_at,
    interaction.next_response_due_at,
    lang,
  );

  // Show SLA countdown if available, otherwise fallback to wait time
  const timeDisplay = sla
    ? { text: sla.label, className: SLA_URGENCY_STYLES[sla.urgency] }
    : { text: formatWaitTime(interaction.created_at), className: 'text-muted-foreground' };

  return (
    <div
      onClick={onClick}
      className={`flex items-start gap-2 px-3 py-2 cursor-pointer border-b border-border transition-colors
        ${isFocused ? 'bg-accent' : 'hover:bg-muted'}`}
    >
      {/* Priority + status dot */}
      <div className="flex flex-col items-center gap-1 mt-1 shrink-0">
        <span className={`h-2 w-2 rounded-full ${pColor}`} title={pLabel} />
        <span className={`h-1.5 w-1.5 rounded-full ${stateColor}`} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <span className="text-sm font-medium truncate">{customerId}</span>
          <span className={`text-[10px] shrink-0 ${timeDisplay.className}`}>
            {timeDisplay.text}
            <span className="text-muted-foreground"> · {formatTime(interaction.lastMessageAt ?? interaction.created_at)}</span>
          </span>
        </div>

        <div className="flex items-center gap-1 mt-0.5">
          <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
            {channelLabel}
          </Badge>
          <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4">
            {stateLabel}
          </Badge>
          {interaction.priority <= 10 && (
            <Badge variant="destructive" className="text-[10px] px-1 py-0 h-4">
              {pLabel}
            </Badge>
          )}
        </div>

        {preview && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{preview}</p>
        )}
      </div>

      {/* Unread badge */}
      {interaction.unreadCount > 0 && (
        <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4 shrink-0">
          {interaction.unreadCount}
        </Badge>
      )}
    </div>
  );
});
