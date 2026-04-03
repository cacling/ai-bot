/**
 * RouteContextContent.tsx — Route context card.
 *
 * Answers: "Why did this interaction come to me?"
 * Shows: queue, priority source, rule hit, overflow chain,
 * total queue time, recent route actions (up to 10 events).
 */
import { memo, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { ArrowRight } from 'lucide-react';
import { type Lang } from '../../../i18n';

interface RouteEvent {
  event_type: string;
  actor_type?: string;
  actor_id?: string;
  payload?: Record<string, unknown>;
  created_at: string;
}

interface RouteContextData {
  interaction_id: string;
  queue_code: string | null;
  priority: number;
  work_model: string;
  channel: string;
  created_at: string;
  routing_mode?: string | null;
}

const INTERACTION_PLATFORM_URL = '/ix-api';

const TXT = {
  zh: {
    queue: '当前队列',
    priority: '优先级',
    priority_source: '优先级来源',
    channel: '渠道',
    routing_mode: '路由模式',
    wait_time: '总排队时长',
    rule_hit: '命中规则',
    overflow: '溢出链路',
    route_history: '路由事件',
    latest_action: '最近动作',
    no_events: '暂无路由事件',
    waiting: '等待数据…',
  },
  en: {
    queue: 'Queue',
    priority: 'Priority',
    priority_source: 'Priority Source',
    channel: 'Channel',
    routing_mode: 'Routing Mode',
    wait_time: 'Total Queue Time',
    rule_hit: 'Matched Rule',
    overflow: 'Overflow Path',
    route_history: 'Route Events',
    latest_action: 'Latest Action',
    no_events: 'No route events',
    waiting: 'Waiting for data…',
  },
};

function formatDuration(createdAt: string, endAt?: string): string {
  const start = new Date(createdAt).getTime();
  const end = endAt ? new Date(endAt).getTime() : Date.now();
  const diff = Math.max(0, end - start);
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function getPriorityLabel(p: number): string {
  if (p <= 10) return 'P1';
  if (p <= 30) return 'P2';
  return 'P3';
}

const ROUTING_MODE_LABELS: Record<string, Record<Lang, string>> = {
  direct_assign: { zh: '直接分配', en: 'Direct Assign' },
  push_offer: { zh: '推送报价', en: 'Push Offer' },
  pull_claim: { zh: '坐席拉取', en: 'Pull Claim' },
};

const EVENT_LABELS: Record<string, Record<Lang, string>> = {
  created: { zh: '会话创建', en: 'Created' },
  queued: { zh: '进入队列', en: 'Queued' },
  assigned: { zh: '分配给坐席', en: 'Assigned' },
  activated: { zh: '会话激活', en: 'Activated' },
  transferred: { zh: '转接', en: 'Transferred' },
  overflow: { zh: '溢出路由', en: 'Overflow' },
  wrapping_up: { zh: '进入收尾', en: 'Wrapping Up' },
  closed: { zh: '已关闭', en: 'Closed' },
  agent_message: { zh: '坐席消息', en: 'Agent Message' },
};

/** Highlight colors for important event types */
const EVENT_HIGHLIGHT: Record<string, string> = {
  assigned: 'bg-primary/10 text-primary',
  transferred: 'bg-warning/10 text-warning',
  overflow: 'bg-destructive/10 text-destructive',
};

/** Extract routing metadata from events */
function extractRoutingInfo(events: RouteEvent[]) {
  const assignedEvent = [...events].reverse().find((e) => e.event_type === 'assigned');
  const overflowEvents = events.filter((e) => e.event_type === 'overflow');
  const transferEvents = events.filter((e) => e.event_type === 'transferred');
  const latestAction = [...events].reverse().find(
    (e) => ['assigned', 'transferred', 'overflow'].includes(e.event_type),
  );

  // Compute queue time: from created → assigned
  const createdEvent = events.find((e) => e.event_type === 'created');
  const queueTime = createdEvent && assignedEvent
    ? formatDuration(createdEvent.created_at, assignedEvent.created_at)
    : null;

  // Extract matched rule and priority override from assigned event
  const matchedRule = (assignedEvent?.payload?.score_reason as string) ?? null;
  const priorityOverride = (assignedEvent?.payload?.action_overrides as Record<string, unknown>)?.priority as number | undefined;

  // Build overflow chain
  const overflowChain = overflowEvents.map((e) => ({
    from: (e.payload?.from_queue as string) ?? '?',
    to: (e.payload?.to_queue as string) ?? '?',
    reason: (e.payload?.reason as string) ?? null,
  }));

  return { matchedRule, priorityOverride, overflowChain, queueTime, latestAction, assignedEvent, transferEvents };
}

export const RouteContextContent = memo(function RouteContextContent({
  data,
  lang,
}: {
  data: unknown;
  lang: Lang;
}) {
  const d = data as RouteContextData | null;
  const t = TXT[lang];
  const [events, setEvents] = useState<RouteEvent[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!d?.interaction_id) return;
    setLoaded(false);
    fetch(`${INTERACTION_PLATFORM_URL}/api/interactions/${d.interaction_id}/events`)
      .then((r) => r.json())
      .then((data) => {
        setEvents(data.items ?? data ?? []);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [d?.interaction_id]);

  if (!d) {
    return <p className="text-muted-foreground text-sm p-3">{t.waiting}</p>;
  }

  const routingInfo = loaded ? extractRoutingInfo(events) : null;
  const routingModeLabel = d.routing_mode
    ? (ROUTING_MODE_LABELS[d.routing_mode]?.[lang] ?? d.routing_mode)
    : null;

  return (
    <div className="p-3 text-sm space-y-3">
      {/* Summary grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        <div>
          <span className="text-muted-foreground">{t.queue}</span>
          <p className="font-medium">{d.queue_code ?? '—'}</p>
        </div>
        <div>
          <span className="text-muted-foreground">{t.priority}</span>
          <p className="font-medium">
            {getPriorityLabel(d.priority)} ({d.priority})
            {routingInfo?.priorityOverride != null && (
              <span className="text-muted-foreground ml-1 text-[10px]">
                ({lang === 'zh' ? '规则调整' : 'rule override'})
              </span>
            )}
          </p>
        </div>
        <div>
          <span className="text-muted-foreground">{t.channel}</span>
          <p className="font-medium">{d.channel}</p>
        </div>
        {routingModeLabel && (
          <div>
            <span className="text-muted-foreground">{t.routing_mode}</span>
            <p className="font-medium">{routingModeLabel}</p>
          </div>
        )}
        {routingInfo?.queueTime && (
          <div>
            <span className="text-muted-foreground">{t.wait_time}</span>
            <p className="font-medium">{routingInfo.queueTime}</p>
          </div>
        )}
        {routingInfo?.matchedRule && (
          <div>
            <span className="text-muted-foreground">{t.rule_hit}</span>
            <p className="font-medium truncate" title={routingInfo.matchedRule}>
              {routingInfo.matchedRule}
            </p>
          </div>
        )}
      </div>

      {/* Overflow chain */}
      {routingInfo && routingInfo.overflowChain.length > 0 && (
        <div>
          <p className="text-[10px] text-destructive font-semibold uppercase tracking-wider mb-1">{t.overflow}</p>
          <div className="space-y-1">
            {routingInfo.overflowChain.map((o, i) => (
              <div key={i} className="flex items-center gap-1 text-xs bg-destructive/5 rounded-md px-2 py-1">
                <Badge variant="outline" className="text-[10px] px-1 py-0 h-3.5">{o.from}</Badge>
                <ArrowRight size={10} className="text-muted-foreground" />
                <Badge variant="outline" className="text-[10px] px-1 py-0 h-3.5">{o.to}</Badge>
                {o.reason && <span className="text-muted-foreground ml-1">({o.reason})</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Route event history (expanded to 10) */}
      {loaded && events.length > 0 && (
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">{t.route_history}</p>
          <div className="space-y-1">
            {events.slice(0, 10).map((e, i) => {
              const isHighlight = EVENT_HIGHLIGHT[e.event_type];
              const isLatest = routingInfo?.latestAction === e;
              return (
                <div
                  key={i}
                  className={`flex items-center gap-2 text-xs rounded-sm px-1 py-0.5 ${isHighlight ?? ''} ${isLatest ? 'ring-1 ring-primary/30' : ''}`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${isHighlight ? 'bg-current' : 'bg-primary/40'}`} />
                  <span className="text-foreground">
                    {EVENT_LABELS[e.event_type]?.[lang] ?? e.event_type}
                  </span>
                  {e.event_type === 'transferred' && e.payload?.target_queue && (
                    <span className="text-muted-foreground">→ {e.payload.target_queue as string}</span>
                  )}
                  <span className="text-muted-foreground ml-auto shrink-0">
                    {new Date(e.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
});
