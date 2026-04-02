/**
 * InboxItem.tsx — Single interaction row in the Inbox panel.
 *
 * Shows: status indicator, customer info, last message preview,
 * unread badge, timestamp.
 */
import { memo } from 'react';
import { Badge } from '@/components/ui/badge';
import { type InboxInteraction } from './InboxContext';
import { type Lang } from '../../i18n';

interface InboxItemProps {
  interaction: InboxInteraction;
  isFocused: boolean;
  lang: Lang;
  onClick: () => void;
}

const STATE_COLORS: Record<string, string> = {
  assigned: 'bg-blue-500',
  active: 'bg-green-500',
  wrapping_up: 'bg-yellow-500',
  queued: 'bg-gray-400',
  offered: 'bg-purple-500',
  transferred: 'bg-orange-500',
};

const STATE_LABELS: Record<string, Record<Lang, string>> = {
  assigned: { zh: '已分配', en: 'Assigned' },
  active: { zh: '进行中', en: 'Active' },
  wrapping_up: { zh: '收尾中', en: 'Wrapping Up' },
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

export const InboxItem = memo(function InboxItem({ interaction, isFocused, lang, onClick }: InboxItemProps) {
  const stateColor = STATE_COLORS[interaction.state] ?? 'bg-gray-400';
  const stateLabel = STATE_LABELS[interaction.state]?.[lang] ?? interaction.state;
  const channelLabel = CHANNEL_LABELS[interaction.channel]?.[lang] ?? interaction.channel;
  const customerId = interaction.customer_party_id?.slice(0, 8) ?? '---';
  const preview = interaction.lastMessagePreview ?? interaction.handoff_summary ?? '';

  return (
    <div
      onClick={onClick}
      className={`flex items-start gap-2 px-3 py-2 cursor-pointer border-b border-border transition-colors
        ${isFocused ? 'bg-accent' : 'hover:bg-muted'}`}
    >
      {/* Status dot */}
      <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${stateColor}`} />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <span className="text-sm font-medium truncate">{customerId}</span>
          <span className="text-xs text-muted-foreground shrink-0">
            {formatTime(interaction.lastMessageAt ?? interaction.created_at)}
          </span>
        </div>

        <div className="flex items-center gap-1 mt-0.5">
          <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
            {channelLabel}
          </Badge>
          <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4">
            {stateLabel}
          </Badge>
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
