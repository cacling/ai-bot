/**
 * InboxFilters.tsx — Compact filter row for the inbox panel.
 *
 * Provides client-side filtering by queue and channel.
 */
import { memo } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { type Lang } from '../../i18n';
import { useQueues } from '../hooks/useQueues';

interface InboxFiltersProps {
  lang: Lang;
  queueFilter: string;
  channelFilter: string;
  onQueueChange: (value: string) => void;
  onChannelChange: (value: string) => void;
}

const CHANNELS = [
  { value: '__all__', zh: '全部渠道', en: 'All Channels' },
  { value: 'chat', zh: '文字', en: 'Chat' },
  { value: 'voice', zh: '语音', en: 'Voice' },
];

export const InboxFilters = memo(function InboxFilters({
  lang,
  queueFilter,
  channelFilter,
  onQueueChange,
  onChannelChange,
}: InboxFiltersProps) {
  const queues = useQueues();

  return (
    <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-border">
      <Select value={queueFilter} onValueChange={onQueueChange}>
        <SelectTrigger className="h-6 text-[10px] border-none shadow-none bg-muted/50 px-1.5 w-auto min-w-[60px] focus:ring-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">{lang === 'zh' ? '全部队列' : 'All Queues'}</SelectItem>
          {queues.map((q) => (
            <SelectItem key={q.queue_code} value={q.queue_code}>
              {lang === 'zh' ? q.display_name_zh : q.display_name_en}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={channelFilter} onValueChange={onChannelChange}>
        <SelectTrigger className="h-6 text-[10px] border-none shadow-none bg-muted/50 px-1.5 w-auto min-w-[60px] focus:ring-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {CHANNELS.map((c) => (
            <SelectItem key={c.value} value={c.value}>
              {c[lang]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
});
