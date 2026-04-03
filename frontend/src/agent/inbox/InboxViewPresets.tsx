/**
 * InboxViewPresets.tsx — Saved inbox filter presets (dropdown).
 *
 * Presets are stored in localStorage. Each preset is a combination of
 * queue, channel, priority range, and SLA filters.
 */
import { memo, useState, useCallback, useEffect } from 'react';
import { ChevronDown, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { type Lang } from '../../i18n';

export interface ViewPreset {
  id: string;
  name: Record<Lang, string>;
  queueFilter: string;
  channelFilter: string;
  /** If true, only show priority < 30 (P1/P2) */
  highPriorityOnly: boolean;
  /** If true, only show SLA at risk (< 5min) */
  slaRiskOnly: boolean;
}

const STORAGE_KEY = 'agent-inbox-view-preset';

/** Built-in presets (cannot be deleted) */
const BUILTIN_PRESETS: ViewPreset[] = [
  {
    id: '__all__',
    name: { zh: '全部会话', en: 'All' },
    queueFilter: '__all__',
    channelFilter: '__all__',
    highPriorityOnly: false,
    slaRiskOnly: false,
  },
  {
    id: '__high_pri__',
    name: { zh: '我的高优先级', en: 'My High Priority' },
    queueFilter: '__all__',
    channelFilter: '__all__',
    highPriorityOnly: true,
    slaRiskOnly: false,
  },
  {
    id: '__sla_risk__',
    name: { zh: '即将超时', en: 'SLA At Risk' },
    queueFilter: '__all__',
    channelFilter: '__all__',
    highPriorityOnly: false,
    slaRiskOnly: true,
  },
  {
    id: '__voice__',
    name: { zh: '我的语音', en: 'My Voice' },
    queueFilter: '__all__',
    channelFilter: 'phone',
    highPriorityOnly: false,
    slaRiskOnly: false,
  },
  {
    id: '__fault__',
    name: { zh: '故障队列', en: 'Fault Queue' },
    queueFilter: 'fault_chat',
    channelFilter: '__all__',
    highPriorityOnly: false,
    slaRiskOnly: false,
  },
];

interface InboxViewPresetsProps {
  lang: Lang;
  onApplyPreset: (preset: ViewPreset) => void;
}

export const InboxViewPresets = memo(function InboxViewPresets({
  lang,
  onApplyPreset,
}: InboxViewPresetsProps) {
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) ?? '__all__';
    } catch {
      return '__all__';
    }
  });

  const presets = BUILTIN_PRESETS;
  const activePreset = presets.find((p) => p.id === activeId) ?? presets[0];

  const handleSelect = useCallback((preset: ViewPreset) => {
    setActiveId(preset.id);
    onApplyPreset(preset);
    setOpen(false);
    try { localStorage.setItem(STORAGE_KEY, preset.id); } catch { /* ignore */ }
  }, [onApplyPreset]);

  // Apply saved preset on mount
  useEffect(() => {
    const preset = presets.find((p) => p.id === activeId);
    if (preset && activeId !== '__all__') {
      onApplyPreset(preset);
    }
  }, []); // intentionally run only on mount

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="sm"
        className="h-6 text-[10px] px-2 flex items-center gap-1"
        onClick={() => setOpen(!open)}
      >
        <Star size={10} />
        {activePreset.name[lang]}
        <ChevronDown size={10} />
      </Button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1 bg-popover border border-border rounded-md shadow-md py-1 z-50 min-w-[160px]">
            {presets.map((preset) => (
              <button
                key={preset.id}
                onClick={() => handleSelect(preset)}
                className={`flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left hover:bg-muted transition-colors ${
                  activeId === preset.id ? 'bg-accent text-accent-foreground' : ''
                }`}
              >
                <span className="flex-1">{preset.name[lang]}</span>
                {preset.highPriorityOnly && (
                  <Badge variant="outline" className="text-[9px] px-1 py-0 h-3">P1-2</Badge>
                )}
                {preset.slaRiskOnly && (
                  <Badge variant="outline" className="text-[9px] px-1 py-0 h-3 text-destructive">SLA</Badge>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
});
