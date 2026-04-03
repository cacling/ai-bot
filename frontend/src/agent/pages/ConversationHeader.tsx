/**
 * ConversationHeader.tsx — Compact info bar showing interaction context.
 *
 * Displayed between dialog header and messages area. Shows customer name,
 * queue, priority, wait time, channel, and state at a glance.
 */
import { memo, useState, useEffect, useMemo } from 'react';
import { MessageSquare, Phone, Clock, AlertTriangle, ArrowRight, PhoneCall } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { type Lang } from '../../i18n';
import { type InboxInteraction } from '../inbox/InboxContext';
import { type CardState } from '../cards/registry';
import { useQueues, getQueueName } from '../hooks/useQueues';
import { useSlaCountdown, type SlaUrgency } from '../hooks/useSlaCountdown';
import { useRouteExplanation } from '../hooks/useRouteExplanation';

interface ConversationHeaderProps {
  lang: Lang;
  interaction: InboxInteraction | undefined;
  cardStates: CardState[];
}

const PRIORITY_STYLES: Record<string, string> = {
  P1: 'bg-destructive/10 text-destructive border-destructive/20',
  P2: 'bg-warning/10 text-warning border-warning/20',
  P3: 'bg-muted text-muted-foreground border-border',
};

function getPriorityLabel(priority: number): string {
  if (priority <= 10) return 'P1';
  if (priority <= 30) return 'P2';
  return 'P3';
}

function formatCallDuration(createdAt: string): string {
  const diff = Math.max(0, Date.now() - new Date(createdAt).getTime());
  const totalSeconds = Math.floor(diff / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return hours > 0
    ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`;
}

function formatWaitTime(createdAt: string, lang: Lang): string {
  const diff = Math.max(0, Date.now() - new Date(createdAt).getTime());
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h+`;
}

const SLA_BADGE_STYLES: Record<SlaUrgency, string> = {
  ok: 'bg-muted text-muted-foreground border-border',
  warning: 'bg-warning/10 text-warning border-warning/20',
  critical: 'bg-destructive/10 text-destructive border-destructive/20 animate-pulse',
  breached: 'bg-destructive/20 text-destructive border-destructive/30 font-bold',
};

const ROUTING_MODE_LABELS: Record<string, Record<Lang, string>> = {
  direct_assign: { zh: '直接分配', en: 'Direct' },
  push_offer: { zh: '推送', en: 'Push' },
  pull_claim: { zh: '拉取', en: 'Pull' },
};

const STATE_LABELS: Record<string, Record<Lang, string>> = {
  assigned: { zh: '已分配', en: 'Assigned' },
  active: { zh: '处理中', en: 'Active' },
  wrapping_up: { zh: '收尾中', en: 'Wrapping Up' },
  queued: { zh: '排队中', en: 'Queued' },
};

export const ConversationHeader = memo(function ConversationHeader({
  lang,
  interaction,
  cardStates,
}: ConversationHeaderProps) {
  const isVoice = interaction?.channel === 'phone' || interaction?.channel === 'voice';

  // Tick: every 1s for voice calls (duration timer), 30s for text
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!interaction) return;
    const interval = isVoice ? 1000 : 30_000;
    const timer = setInterval(() => setTick((t) => t + 1), interval);
    return () => clearInterval(timer);
  }, [interaction?.interaction_id, isVoice]);

  const queues = useQueues();

  const sla = useSlaCountdown(
    interaction?.first_response_due_at ?? null,
    interaction?.next_response_due_at ?? null,
    lang,
  );

  const route = useRouteExplanation(
    interaction?.interaction_id ?? null,
    interaction?.handoff_summary ?? null,
  );

  if (!interaction) return null;

  const queueName = getQueueName(queues, interaction.queue_code, lang);
  const pLabel = getPriorityLabel(interaction.priority);
  const pStyle = PRIORITY_STYLES[pLabel] ?? PRIORITY_STYLES.P3;
  const stateLabel = STATE_LABELS[interaction.state]?.[lang] ?? interaction.state;

  // Try to get customer name from user_detail card
  const userCard = cardStates.find((c) => c.id === 'user_detail');
  const userData = userCard?.data as { name?: string; phone?: string } | null | undefined;
  const customerName = userData?.name ?? interaction.customer_party_id?.slice(0, 8) ?? '—';

  const channelIcon = interaction.channel === 'voice'
    ? <Phone size={11} />
    : <MessageSquare size={11} />;

  const routingLabel = route?.routingMode
    ? ROUTING_MODE_LABELS[route.routingMode]?.[lang] ?? route.routingMode
    : null;

  return (
    <div className="flex flex-col border-b border-border bg-muted/50 flex-shrink-0">
      {/* Primary row: customer, queue, priority, SLA, channel, state */}
      <div className="flex items-center gap-2 px-4 py-1.5 overflow-x-auto text-xs">
        <span className="font-medium text-foreground truncate max-w-[120px]">{customerName}</span>

        {queueName && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 font-normal">
            {queueName}
          </Badge>
        )}

        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-4 font-normal ${pStyle}`}>
          {pLabel}
        </Badge>

        {sla ? (
          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-4 font-normal flex items-center gap-0.5 ${SLA_BADGE_STYLES[sla.urgency]}`}>
            {(sla.urgency === 'critical' || sla.urgency === 'breached') && <AlertTriangle size={9} />}
            {sla.label}
          </Badge>
        ) : (
          <span className="flex items-center gap-0.5 text-muted-foreground">
            <Clock size={10} />
            {formatWaitTime(interaction.created_at, lang)}
          </span>
        )}

        <span className="flex items-center gap-0.5 text-muted-foreground">
          {channelIcon}
        </span>

        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 font-normal">
          {stateLabel}
        </Badge>

        {/* Voice call duration timer */}
        {isVoice && interaction.state !== 'closed' && (
          <span className="flex items-center gap-0.5 text-primary font-medium tabular-nums">
            <PhoneCall size={10} className="animate-pulse" />
            {formatCallDuration(interaction.created_at)}
          </span>
        )}
      </div>

      {/* Secondary row: routing explanation (only if route data available) */}
      {route && (routingLabel || route.fromQueue || route.isOverflow || route.intentCode) && (
        <div className="flex items-center gap-1.5 px-4 pb-1.5 text-[10px] text-muted-foreground overflow-x-auto">
          {routingLabel && (
            <Badge variant="outline" className="text-[10px] px-1 py-0 h-3.5 font-normal">
              {routingLabel}
            </Badge>
          )}
          {route.fromQueue && (
            <span className="flex items-center gap-0.5">
              {route.fromQueue} <ArrowRight size={8} /> {interaction.queue_code ?? '—'}
            </span>
          )}
          {route.isOverflow && (
            <Badge variant="outline" className="text-[10px] px-1 py-0 h-3.5 font-normal bg-warning/10 text-warning border-warning/20">
              {lang === 'zh' ? '溢出' : 'Overflow'}
              {route.overflowReason ? `: ${route.overflowReason}` : ''}
            </Badge>
          )}
          {route.intentCode && (
            <Badge variant="secondary" className="text-[10px] px-1 py-0 h-3.5 font-normal">
              {route.intentCode}
            </Badge>
          )}
        </div>
      )}
    </div>
  );
});
