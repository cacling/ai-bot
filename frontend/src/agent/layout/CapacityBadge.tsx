/**
 * CapacityBadge.tsx — Shows agent chat/voice capacity and queue count.
 *
 * Displays: "文字 2/3  语音 0/1  队列 4"
 * Full capacity → red indicator. Tooltip shows queue list.
 */
import { memo, useState } from 'react';
import { MessageSquare, Phone, Layers } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { type Lang } from '../../i18n';

export interface AgentCapacity {
  active_chat_count: number;
  max_chat_slots: number;
  active_voice_count: number;
  max_voice_slots: number;
  queue_codes?: string[];
}

interface CapacityBadgeProps {
  lang: Lang;
  capacity: AgentCapacity | null;
}

export const CapacityBadge = memo(function CapacityBadge({ lang, capacity }: CapacityBadgeProps) {
  const [showQueues, setShowQueues] = useState(false);

  if (!capacity) return null;

  const chatLabel = lang === 'zh' ? '文字' : 'Chat';
  const voiceLabel = lang === 'zh' ? '语音' : 'Voice';

  const chatFull = capacity.active_chat_count >= capacity.max_chat_slots;
  const voiceFull = capacity.active_voice_count >= capacity.max_voice_slots;
  const allFull = chatFull && voiceFull;

  const queues = capacity.queue_codes ?? [];

  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground relative">
      {/* Full capacity indicator */}
      {allFull && (
        <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4">
          {lang === 'zh' ? '满载' : 'Full'}
        </Badge>
      )}

      <span className={`flex items-center gap-1 ${chatFull ? 'text-destructive' : ''}`}>
        <MessageSquare size={11} />
        {chatLabel} {capacity.active_chat_count}/{capacity.max_chat_slots}
      </span>
      <span className={`flex items-center gap-1 ${voiceFull ? 'text-destructive' : ''}`}>
        <Phone size={11} />
        {voiceLabel} {capacity.active_voice_count}/{capacity.max_voice_slots}
      </span>

      {/* Queue count with tooltip */}
      {queues.length > 0 && (
        <span
          className="flex items-center gap-1 cursor-pointer hover:text-foreground transition-colors"
          onMouseEnter={() => setShowQueues(true)}
          onMouseLeave={() => setShowQueues(false)}
        >
          <Layers size={11} />
          {lang === 'zh' ? '队列' : 'Queues'} {queues.length}

          {/* Tooltip */}
          {showQueues && (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-popover text-popover-foreground border border-border rounded-md shadow-md px-2 py-1.5 z-50 min-w-[120px]">
              <p className="text-[10px] font-semibold mb-1">
                {lang === 'zh' ? '可服务队列' : 'Serving Queues'}
              </p>
              <ul className="space-y-0.5">
                {queues.map((q) => (
                  <li key={q} className="text-[10px]">{q}</li>
                ))}
              </ul>
            </div>
          )}
        </span>
      )}
    </div>
  );
});
