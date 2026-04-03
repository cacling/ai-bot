/**
 * HandoffContent.tsx — Operational guide card (colSpan: 1)
 *
 * Reorganized into 4 blocks:
 *   1. Risk alerts (red, pinned to top)
 *   2. Completed actions (green checkmarks)
 *   3. Pending actions (yellow circles, from next_action)
 *   4. Suggested actions (from next_action keywords)
 *
 * Intent tag parsed from handoff_summary [intent:XXX].
 *
 * data shape: HandoffData | null
 */

import { memo } from 'react';
import { AlertTriangle, CheckCircle2, Circle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { T, type Lang } from '../../../i18n';

interface HandoffData {
  session_summary?:   string;
  customer_intent?:   string;
  main_issue?:        string;
  next_action?:       string;
  handoff_reason?:    string;
  actions_taken?:     string[];
  risk_flags?:        string[];
}

/** Parse [intent:XXX] from handoff_summary or customer_intent */
function parseIntent(d: HandoffData): string | null {
  for (const field of [d.customer_intent, d.session_summary]) {
    if (!field) continue;
    const m = field.match(/\[intent:([^\]]+)\]/);
    if (m) return m[1];
  }
  return null;
}

/** Split next_action into individual action items */
function parseNextActions(nextAction: string | undefined): string[] {
  if (!nextAction) return [];
  // Split by Chinese/English punctuation or numbered list patterns
  return nextAction
    .split(/[;；\n]|(?:\d+[.、)])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const SECTION_LABELS: Record<string, Record<Lang, string>> = {
  risk: { zh: '风险提示', en: 'Risk Alerts' },
  completed: { zh: '已完成', en: 'Completed' },
  pending: { zh: '待处理', en: 'Pending' },
  context: { zh: '会话摘要', en: 'Summary' },
};

export const HandoffContent = memo(function HandoffContent({ data, lang }: { data: unknown; lang: Lang }) {
  const d = data as HandoffData | null;
  const tc = T[lang];

  if (!d) {
    return (
      <div className="flex flex-col items-center justify-center py-6 space-y-1.5 text-center select-none px-3">
        <span className="text-2xl opacity-30">🤝</span>
        <p className="text-[11px] text-muted-foreground leading-relaxed">{tc.card_handoff_empty}</p>
      </div>
    );
  }

  const intentCode = parseIntent(d);
  const pendingActions = parseNextActions(d.next_action);
  const hasRisks = d.risk_flags && d.risk_flags.length > 0;
  const hasCompleted = d.actions_taken && d.actions_taken.length > 0;
  const hasPending = pendingActions.length > 0;

  return (
    <div className="p-3 space-y-2.5 text-xs">
      {/* Intent + context badges */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {intentCode && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
            {intentCode}
          </Badge>
        )}
        {d.main_issue && (
          <span className="text-muted-foreground truncate">{d.main_issue}</span>
        )}
        {d.handoff_reason && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 font-normal">
            {d.handoff_reason}
          </Badge>
        )}
      </div>

      {/* Block 1: Risk alerts (pinned to top) */}
      {hasRisks && (
        <div className="space-y-1">
          <p className="text-[10px] text-destructive font-semibold uppercase tracking-wider">
            {SECTION_LABELS.risk[lang]}
          </p>
          {d.risk_flags!.map((flag, i) => (
            <div key={i} className="flex items-start gap-1.5 bg-destructive/10 rounded-md px-2 py-1.5 text-destructive">
              <AlertTriangle size={11} className="flex-shrink-0 mt-0.5" />
              <span>{flag}</span>
            </div>
          ))}
        </div>
      )}

      {/* Block 2: Completed actions */}
      {hasCompleted && (
        <div className="space-y-1">
          <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
            {SECTION_LABELS.completed[lang]}
          </p>
          <ul className="space-y-0.5">
            {d.actions_taken!.map((a, i) => (
              <li key={i} className="flex items-start gap-1.5 text-muted-foreground">
                <CheckCircle2 size={11} className="flex-shrink-0 mt-0.5 text-primary" />
                <span>{a}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Block 3: Pending actions */}
      {hasPending && (
        <div className="space-y-1">
          <p className="text-[10px] text-warning font-semibold uppercase tracking-wider">
            {SECTION_LABELS.pending[lang]}
          </p>
          <ul className="space-y-0.5">
            {pendingActions.map((a, i) => (
              <li key={i} className="flex items-start gap-1.5 text-foreground">
                <Circle size={11} className="flex-shrink-0 mt-0.5 text-warning" />
                <span>{a}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Block 4: Session summary (collapsed context) */}
      {d.session_summary && (
        <div>
          <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-1">
            {SECTION_LABELS.context[lang]}
          </p>
          <p className="text-muted-foreground leading-relaxed bg-muted rounded-md px-2.5 py-2">
            {d.session_summary.replace(/\[intent:[^\]]+\]/g, '').trim()}
          </p>
        </div>
      )}
    </div>
  );
});
