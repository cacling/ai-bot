/**
 * PresenceToggle.tsx — Agent presence status dropdown.
 */
import { memo } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { type Lang } from '../../i18n';

type PresenceStatus = 'online' | 'away' | 'dnd' | 'offline';

interface PresenceToggleProps {
  lang: Lang;
  status: PresenceStatus;
  onStatusChange: (status: PresenceStatus) => void;
}

const STATUS_CONFIG: Array<{
  value: PresenceStatus;
  zh: string;
  en: string;
  color: string;
}> = [
  { value: 'online', zh: '在线', en: 'Online', color: 'bg-primary' },
  { value: 'away', zh: '离开', en: 'Away', color: 'bg-warning' },
  { value: 'dnd', zh: '忙碌', en: 'Busy', color: 'bg-destructive' },
  { value: 'offline', zh: '离线', en: 'Offline', color: 'bg-muted-foreground' },
];

export const PresenceToggle = memo(function PresenceToggle({
  lang,
  status,
  onStatusChange,
}: PresenceToggleProps) {
  const current = STATUS_CONFIG.find((s) => s.value === status) ?? STATUS_CONFIG[0];

  return (
    <Select value={status} onValueChange={(v) => onStatusChange(v as PresenceStatus)}>
      <SelectTrigger className="h-7 w-auto gap-1.5 border-none shadow-none bg-transparent px-2 text-xs focus:ring-0">
        <span className={`w-2 h-2 rounded-full ${current.color} flex-shrink-0`} />
        <SelectValue>{current[lang]}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {STATUS_CONFIG.map((s) => (
          <SelectItem key={s.value} value={s.value}>
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${s.color}`} />
              <span>{s[lang]}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
});
