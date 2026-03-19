/**
 * HandoffContent.tsx — human-handoff summary card (colSpan: 1)
 *
 * data shape: HandoffData | null
 */

import { memo } from 'react';
import { AlertTriangle } from 'lucide-react';
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

  const rows: { label: string; value: string | undefined }[] = [
    { label: '意图',     value: d.customer_intent },
    { label: '问题',     value: d.main_issue },
    { label: '转接原因', value: d.handoff_reason },
    { label: '建议动作', value: d.next_action },
  ];

  return (
    <div className="p-3 space-y-2.5 text-xs">
      {d.session_summary && (
        <p className="text-muted-foreground leading-relaxed bg-muted rounded-lg px-2.5 py-2">{d.session_summary}</p>
      )}

      {rows.filter(r => r.value).map(r => (
        <div key={r.label}>
          <span className="text-muted-foreground mr-1">{r.label}：</span>
          <span className="text-foreground">{r.value}</span>
        </div>
      ))}

      {d.actions_taken && d.actions_taken.length > 0 && (
        <div>
          <p className="text-muted-foreground mb-1">已执行：</p>
          <ul className="space-y-0.5 pl-2">
            {d.actions_taken.map((a, i) => (
              <li key={i} className="text-muted-foreground before:content-['·'] before:mr-1 before:text-muted-foreground/50">{a}</li>
            ))}
          </ul>
        </div>
      )}

      {d.risk_flags && d.risk_flags.length > 0 && (
        <div className="flex items-start gap-1.5 bg-destructive/10 rounded-lg px-2 py-1.5 text-destructive">
          <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" />
          <span>{d.risk_flags.join('、')}</span>
        </div>
      )}
    </div>
  );
});
