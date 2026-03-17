/**
 * OutboundTaskContent.tsx — outbound task detail card (colSpan: 2)
 *
 * data shape: OutboundTaskCardData | null
 */

import { memo } from 'react';
import { T, type Lang } from '../../../i18n';
import type { OutboundTaskData as OutboundTaskCardData } from '../../../outboundData';

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between text-xs py-0.5">
      <span className="text-gray-400">{label}</span>
      <span className={highlight ? 'font-semibold text-gray-800' : 'text-gray-600'}>{value}</span>
    </div>
  );
}

const LABELS: Record<Lang, {
  name: string; product: string; amount: string; days: string;
  current_plan: string; target_plan: string; campaign: string;
}> = {
  zh: {
    name: '客户姓名', product: '逾期产品', amount: '逾期金额', days: '逾期天数',
    current_plan: '当前套餐', target_plan: '推介套餐', campaign: '活动名称',
  },
  en: {
    name: 'Customer', product: 'Product', amount: 'Amount due', days: 'Days overdue',
    current_plan: 'Current plan', target_plan: 'Recommended plan', campaign: 'Campaign',
  },
};

export const OutboundTaskContent = memo(function OutboundTaskContent({ data, lang }: { data: unknown; lang: Lang }) {
  const d = data as OutboundTaskCardData | null;
  const lb = LABELS[lang];

  if (!d) {
    return (
      <div className="flex flex-col items-center justify-center py-6 space-y-1.5 text-center select-none px-3">
        <span className="text-2xl opacity-30">📋</span>
        <p className="text-[11px] text-gray-400 leading-relaxed">{T[lang].card_outbound_empty}</p>
      </div>
    );
  }

  if (d.taskType === 'collection') {
    return (
      <div className="p-3 space-y-1">
        <Row label={lb.name}    value={d.name} highlight />
        <Row label={lb.product} value={d.product[lang]} />
        <Row label={lb.amount}  value={`¥${d.amount.toLocaleString()}`} highlight />
        <Row label={lb.days}    value={lang === 'zh' ? `${d.days} 天` : `${d.days} days`} />
      </div>
    );
  }

  // marketing
  return (
    <div className="p-3 space-y-1">
      <Row label={lb.name}         value={d.name} highlight />
      <Row label={lb.current_plan} value={d.currentPlan[lang]} />
      <Row label={lb.target_plan}  value={`${d.targetPlan[lang]}  ¥${d.targetFee}/${lang === 'zh' ? '月' : 'mo'}`} highlight />
      <Row label={lb.campaign}     value={d.campaignName[lang]} />
    </div>
  );
});
