/**
 * InboxPanel.tsx — Left-side work queue panel.
 *
 * Groups interactions into 5 task-oriented sections:
 *   1. 待接受 (Offers)
 *   2. 即将超时 (SLA at risk)
 *   3. 高优先级 (High priority)
 *   4. 处理中 (In progress)
 *   5. 收尾中 (Wrapping up)
 *
 * Within each section, items are sorted by SLA remaining time (most urgent first).
 */
import { memo, useMemo, useState, useEffect, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ChevronLeft, ChevronRight, MessageSquare, Phone } from 'lucide-react';
import { InboxItem } from './InboxItem';
import { useInboxContext, type InboxOffer, type InboxInteraction } from './InboxContext';
import { InboxFilters } from './InboxFilters';
import { InboxViewPresets, type ViewPreset } from './InboxViewPresets';
import { type Lang } from '../../i18n';
import { getSlaRemainingMs } from '../hooks/useSlaCountdown';

interface InboxPanelProps {
  lang: Lang;
}

interface OfferItemProps {
  offer: InboxOffer;
  lang: Lang;
  onAccept: () => void;
  onDecline: () => void;
}

const OFFER_PRIORITY_COLORS: Record<string, string> = {
  P1: 'bg-destructive',
  P2: 'bg-warning',
  P3: 'bg-muted-foreground',
};

function getOfferPriorityInfo(p: number | null): { label: string; color: string } {
  if (p == null) return { label: 'P3', color: OFFER_PRIORITY_COLORS.P3 };
  if (p <= 10) return { label: 'P1', color: OFFER_PRIORITY_COLORS.P1 };
  if (p <= 30) return { label: 'P2', color: OFFER_PRIORITY_COLORS.P2 };
  return { label: 'P3', color: OFFER_PRIORITY_COLORS.P3 };
}

function formatOfferExpiry(expiresAt: string | null): string | null {
  if (!expiresAt) return null;
  const remaining = new Date(expiresAt).getTime() - Date.now();
  if (remaining <= 0) return '0s';
  const seconds = Math.floor(remaining / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m`;
}

const OFFER_CHANNEL_LABELS: Record<string, Record<Lang, string>> = {
  webchat: { zh: '文字', en: 'Chat' },
  phone: { zh: '语音', en: 'Voice' },
  sms: { zh: '短信', en: 'SMS' },
};

const OfferItem = memo(function OfferItem({ offer, lang, onAccept, onDecline }: OfferItemProps) {
  // Tick for expiry countdown
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!offer.expires_at) return;
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, [offer.expires_at]);

  const { label: pLabel, color: pColor } = getOfferPriorityInfo(offer.priority);
  const channelLabel = offer.channel ? (OFFER_CHANNEL_LABELS[offer.channel]?.[lang] ?? offer.channel) : null;
  const customerId = offer.customer_party_id?.slice(0, 8) ?? offer.interaction_id.slice(0, 8);
  const summary = offer.handoff_summary?.slice(0, 60) ?? null;
  const expiry = formatOfferExpiry(offer.expires_at);
  const channelIcon = offer.channel === 'phone'
    ? <Phone size={10} />
    : <MessageSquare size={10} />;

  return (
    <div className="px-3 py-2 border-b border-border bg-accent/50">
      <div className="flex items-start gap-2">
        {/* Priority dot */}
        <span className={`h-2 w-2 rounded-full ${pColor} mt-1.5 shrink-0`} title={pLabel} />

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1">
            <span className="text-sm font-medium truncate">{customerId}</span>
            {expiry && (
              <span className="text-[10px] text-muted-foreground shrink-0">
                {lang === 'zh' ? '过期' : 'Exp'} {expiry}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 mt-0.5">
            {channelLabel && (
              <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 flex items-center gap-0.5">
                {channelIcon} {channelLabel}
              </Badge>
            )}
            {offer.queue_code && (
              <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4">
                {offer.queue_code}
              </Badge>
            )}
            {(offer.priority ?? 99) <= 10 && (
              <Badge variant="destructive" className="text-[10px] px-1 py-0 h-4">
                {pLabel}
              </Badge>
            )}
          </div>

          {summary && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{summary}</p>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-1 mt-1.5 ml-4">
        <Button size="sm" variant="default" className="h-6 text-xs px-3" onClick={onAccept}>
          {lang === 'zh' ? '接受' : 'Accept'}
        </Button>
        <Button size="sm" variant="outline" className="h-6 text-xs px-3" onClick={onDecline}>
          {lang === 'zh' ? '拒绝' : 'Decline'}
        </Button>
      </div>
    </div>
  );
});

const SECTION_VARIANT_STYLES: Record<string, string> = {
  destructive: 'text-destructive',
  warning: 'text-warning',
  accent: 'text-primary',
};

function SectionHeader({ label, count, variant }: { label: string; count: number; variant?: string }) {
  const colorClass = variant ? SECTION_VARIANT_STYLES[variant] ?? 'text-muted-foreground' : 'text-muted-foreground';
  return (
    <div className={`px-3 py-1 text-[10px] font-semibold uppercase tracking-wider flex items-center justify-between ${colorClass}`}>
      <span>{label}</span>
      <Badge variant="secondary" className="text-[10px] px-1 py-0 h-3.5 font-normal">
        {count}
      </Badge>
    </div>
  );
}

/** SLA threshold for "at risk" section: 5 minutes */
const SLA_RISK_THRESHOLD_MS = 5 * 60 * 1000;

/** Sort by SLA remaining (most urgent first), then by priority */
function sortBySla(a: InboxInteraction, b: InboxInteraction): number {
  const slaA = getSlaRemainingMs(a.first_response_due_at, a.next_response_due_at);
  const slaB = getSlaRemainingMs(b.first_response_due_at, b.next_response_due_at);
  if (slaA !== slaB) return slaA - slaB;
  return a.priority - b.priority;
}

interface WorkQueueSections {
  slaRisk: InboxInteraction[];
  highPriority: InboxInteraction[];
  inProgress: InboxInteraction[];
  wrappingUp: InboxInteraction[];
}

export const InboxPanel = memo(function InboxPanel({ lang }: InboxPanelProps) {
  const {
    inbox,
    isConnected,
    focusInteraction,
    acceptOffer,
    declineOffer,
  } = useInboxContext();

  const [queueFilter, setQueueFilter] = useState('__all__');
  const [channelFilter, setChannelFilter] = useState('__all__');
  const [presetHighPriOnly, setPresetHighPriOnly] = useState(false);
  const [presetSlaRiskOnly, setPresetSlaRiskOnly] = useState(false);

  const handleApplyPreset = useCallback((preset: ViewPreset) => {
    setQueueFilter(preset.queueFilter);
    setChannelFilter(preset.channelFilter);
    setPresetHighPriOnly(preset.highPriorityOnly);
    setPresetSlaRiskOnly(preset.slaRiskOnly);
  }, []);

  // Group interactions into 4 sections (offers handled separately)
  const sections = useMemo<WorkQueueSections>(() => {
    const slaRisk: InboxInteraction[] = [];
    const highPriority: InboxInteraction[] = [];
    const inProgress: InboxInteraction[] = [];
    const wrappingUp: InboxInteraction[] = [];

    for (const i of inbox.interactions) {
      // Apply filters
      if (queueFilter !== '__all__' && i.queue_code !== queueFilter) continue;
      if (channelFilter !== '__all__' && i.channel !== channelFilter) continue;
      // Apply preset-level filters
      if (presetHighPriOnly && i.priority >= 30) continue;
      if (presetSlaRiskOnly) {
        const remaining = getSlaRemainingMs(i.first_response_due_at, i.next_response_due_at);
        if (remaining >= SLA_RISK_THRESHOLD_MS) continue;
      }

      if (i.state === 'wrapping_up') {
        wrappingUp.push(i);
        continue;
      }

      // Check SLA risk: remaining < threshold (including breached/negative)
      const remaining = getSlaRemainingMs(i.first_response_due_at, i.next_response_due_at);
      if (remaining < SLA_RISK_THRESHOLD_MS) {
        slaRisk.push(i);
        continue;
      }

      // High priority: P1 or P2 (priority < 30)
      if (i.priority < 30) {
        highPriority.push(i);
        continue;
      }

      // Everything else → in progress
      inProgress.push(i);
    }

    slaRisk.sort(sortBySla);
    highPriority.sort(sortBySla);
    inProgress.sort(sortBySla);
    wrappingUp.sort(sortBySla);

    return { slaRisk, highPriority, inProgress, wrappingUp };
  }, [inbox.interactions, queueFilter, channelFilter, presetHighPriOnly, presetSlaRiskOnly]);

  const totalCount = inbox.interactions.length + inbox.offers.length;

  // Default to collapsed when there are no conversations; auto-expand when items arrive
  const [collapsed, setCollapsed] = useState(totalCount <= 1);

  useEffect(() => {
    if (totalCount > 1) setCollapsed(false);
  }, [totalCount]);

  // Collapsed: narrow strip with toggle button + badge
  if (collapsed) {
    return (
      <div className="flex flex-col items-center h-full border-r border-border w-10 shrink-0 py-2 gap-2">
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setCollapsed(false)}>
          <ChevronRight size={14} />
        </Button>
        <span className={`h-2 w-2 rounded-full ${isConnected ? 'bg-primary' : 'bg-destructive'}`} />
        {totalCount > 0 && (
          <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4">
            {totalCount}
          </Badge>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full border-r border-border w-64 shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{lang === 'zh' ? '工作台' : 'Inbox'}</span>
          {totalCount > 0 && (
            <Badge variant="secondary" className="text-xs px-1.5 py-0 h-4">
              {totalCount}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${isConnected ? 'bg-primary' : 'bg-destructive'}`} />
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setCollapsed(true)}>
            <ChevronLeft size={14} />
          </Button>
        </div>
      </div>

      {/* View presets + Filters */}
      <div className="flex items-center gap-1 px-2 py-1 border-b border-border">
        <InboxViewPresets lang={lang} onApplyPreset={handleApplyPreset} />
      </div>
      <InboxFilters
        lang={lang}
        queueFilter={queueFilter}
        channelFilter={channelFilter}
        onQueueChange={setQueueFilter}
        onChannelChange={setChannelFilter}
      />

      {/* Scrollable work queue */}
      <div className="flex-1 overflow-y-auto">
        {/* Section 1: Offers (待接受) */}
        {inbox.offers.length > 0 && (
          <>
            <SectionHeader label={lang === 'zh' ? '待接受' : 'Offers'} count={inbox.offers.length} variant="accent" />
            {inbox.offers.map((offer) => (
              <OfferItem
                key={offer.offer_id}
                offer={offer}
                lang={lang}
                onAccept={() => acceptOffer(offer.offer_id)}
                onDecline={() => declineOffer(offer.offer_id)}
              />
            ))}
            <Separator />
          </>
        )}

        {/* Section 2: SLA at risk (即将超时) */}
        {sections.slaRisk.length > 0 && (
          <>
            <SectionHeader label={lang === 'zh' ? '即将超时' : 'SLA At Risk'} count={sections.slaRisk.length} variant="destructive" />
            {sections.slaRisk.map((interaction) => (
              <InboxItem
                key={interaction.interaction_id}
                interaction={interaction}
                isFocused={inbox.focusedInteractionId === interaction.interaction_id}
                lang={lang}
                onClick={() => focusInteraction(interaction.interaction_id)}
              />
            ))}
            <Separator />
          </>
        )}

        {/* Section 3: High priority (高优先级) */}
        {sections.highPriority.length > 0 && (
          <>
            <SectionHeader label={lang === 'zh' ? '高优先级' : 'High Priority'} count={sections.highPriority.length} variant="warning" />
            {sections.highPriority.map((interaction) => (
              <InboxItem
                key={interaction.interaction_id}
                interaction={interaction}
                isFocused={inbox.focusedInteractionId === interaction.interaction_id}
                lang={lang}
                onClick={() => focusInteraction(interaction.interaction_id)}
              />
            ))}
            <Separator />
          </>
        )}

        {/* Section 4: In progress (处理中) */}
        {sections.inProgress.length > 0 && (
          <>
            <SectionHeader label={lang === 'zh' ? '处理中' : 'In Progress'} count={sections.inProgress.length} />
            {sections.inProgress.map((interaction) => (
              <InboxItem
                key={interaction.interaction_id}
                interaction={interaction}
                isFocused={inbox.focusedInteractionId === interaction.interaction_id}
                lang={lang}
                onClick={() => focusInteraction(interaction.interaction_id)}
              />
            ))}
            <Separator />
          </>
        )}

        {/* Section 5: Wrapping up (收尾中) */}
        {sections.wrappingUp.length > 0 && (
          <>
            <SectionHeader label={lang === 'zh' ? '收尾中' : 'Wrapping Up'} count={sections.wrappingUp.length} />
            {sections.wrappingUp.map((interaction) => (
              <InboxItem
                key={interaction.interaction_id}
                interaction={interaction}
                isFocused={inbox.focusedInteractionId === interaction.interaction_id}
                lang={lang}
                onClick={() => focusInteraction(interaction.interaction_id)}
              />
            ))}
          </>
        )}

        {/* Empty state */}
        {totalCount === 0 && (
          <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
            {lang === 'zh' ? '暂无会话' : 'No interactions'}
          </div>
        )}
      </div>
    </div>
  );
});
