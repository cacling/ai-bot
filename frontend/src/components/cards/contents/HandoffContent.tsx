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
        <p className="text-[11px] text-gray-400 leading-relaxed">{tc.card_handoff_empty}</p>
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
        <p className="text-gray-600 leading-relaxed bg-gray-50 rounded-lg px-2.5 py-2">{d.session_summary}</p>
      )}

      {rows.filter(r => r.value).map(r => (
        <div key={r.label}>
          <span className="text-gray-400 mr-1">{r.label}：</span>
          <span className="text-gray-700">{r.value}</span>
        </div>
      ))}

      {d.actions_taken && d.actions_taken.length > 0 && (
        <div>
          <p className="text-gray-400 mb-1">已执行：</p>
          <ul className="space-y-0.5 pl-2">
            {d.actions_taken.map((a, i) => (
              <li key={i} className="text-gray-600 before:content-['·'] before:mr-1 before:text-gray-400">{a}</li>
            ))}
          </ul>
        </div>
      )}

      {d.risk_flags && d.risk_flags.length > 0 && (
        <div className="flex items-start gap-1.5 bg-red-50 rounded-lg px-2 py-1.5 text-red-600">
          <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" />
          <span>{d.risk_flags.join('、')}</span>
        </div>
      )}
    </div>
  );
});
