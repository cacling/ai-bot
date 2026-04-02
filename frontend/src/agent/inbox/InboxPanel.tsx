/**
 * InboxPanel.tsx — Left-side Inbox list panel.
 *
 * Groups interactions by state:
 *   - Offers (pending offers for this agent)
 *   - Active (assigned + active)
 *   - Wrapping Up
 *
 * Displays connection status and presence controls.
 */
import { memo, useMemo, useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { InboxItem } from './InboxItem';
import { useInboxContext, type InboxOffer, type InboxInteraction } from './InboxContext';
import { type Lang } from '../../i18n';

interface InboxPanelProps {
  lang: Lang;
}

interface OfferItemProps {
  offer: InboxOffer;
  lang: Lang;
  onAccept: () => void;
  onDecline: () => void;
}

const OfferItem = memo(function OfferItem({ offer, lang, onAccept, onDecline }: OfferItemProps) {
  return (
    <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-purple-50 dark:bg-purple-950/20">
      <div className="text-sm">
        <span className="font-medium">{lang === 'zh' ? '新会话' : 'New'}</span>
        <span className="text-xs text-muted-foreground ml-1">{offer.interaction_id.slice(0, 8)}</span>
      </div>
      <div className="flex gap-1">
        <Button size="sm" variant="default" className="h-6 text-xs px-2" onClick={onAccept}>
          {lang === 'zh' ? '接受' : 'Accept'}
        </Button>
        <Button size="sm" variant="outline" className="h-6 text-xs px-2" onClick={onDecline}>
          {lang === 'zh' ? '拒绝' : 'Decline'}
        </Button>
      </div>
    </div>
  );
});

export const InboxPanel = memo(function InboxPanel({ lang }: InboxPanelProps) {
  const {
    inbox,
    isConnected,
    focusInteraction,
    acceptOffer,
    declineOffer,
  } = useInboxContext();

  // Group interactions by display section
  const { active, wrappingUp } = useMemo(() => {
    const active: InboxInteraction[] = [];
    const wrappingUp: InboxInteraction[] = [];

    for (const i of inbox.interactions) {
      if (i.state === 'wrapping_up') {
        wrappingUp.push(i);
      } else {
        active.push(i);
      }
    }

    // Sort: highest priority first, then most recent
    const sortFn = (a: InboxInteraction, b: InboxInteraction) =>
      a.priority - b.priority || new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    active.sort(sortFn);
    wrappingUp.sort(sortFn);

    return { active, wrappingUp };
  }, [inbox.interactions]);

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
        <span className={`h-2 w-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
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
          <span className={`h-2 w-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setCollapsed(true)}>
            <ChevronLeft size={14} />
          </Button>
        </div>
      </div>

      {/* Scrollable list */}
      <div className="flex-1 overflow-y-auto">
        {/* Offers section */}
        {inbox.offers.length > 0 && (
          <>
            <div className="px-3 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              {lang === 'zh' ? '待接受' : 'Offers'} ({inbox.offers.length})
            </div>
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

        {/* Active section */}
        {active.length > 0 && (
          <>
            <div className="px-3 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              {lang === 'zh' ? '进行中' : 'Active'} ({active.length})
            </div>
            {active.map((interaction) => (
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

        {/* Wrapping Up section */}
        {wrappingUp.length > 0 && (
          <>
            <div className="px-3 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              {lang === 'zh' ? '收尾中' : 'Wrapping Up'} ({wrappingUp.length})
            </div>
            {wrappingUp.map((interaction) => (
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
