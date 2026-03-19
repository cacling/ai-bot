/**
 * CardMessage.tsx — 聊天卡片组件
 *
 * 账单卡片、退订卡片、套餐卡片、诊断卡片、转人工卡片。
 */

import React from 'react';
import {
  CheckCircle,
  AlertTriangle,
  XCircle,
  Receipt,
  Wifi,
  Package,
  Trash2,
  Headset,
} from 'lucide-react';
import { T, type Lang } from '../i18n';

// ── 卡片数据类型 ──────────────────────────────────────────────────────────────

export interface BillCardData {
  month: string;
  total: number;
  plan_fee: number;
  data_fee: number;
  voice_fee: number;
  value_added_fee: number;
  tax: number;
  status: string;
}

export interface CancelCardData {
  service_name: string;
  monthly_fee: number;
  effective_end: string;
  phone: string;
}

export interface PlanCardData {
  name: string;
  monthly_fee: number;
  data_gb: number;
  voice_min: number;
  features: string[];
  description: string;
}

export interface DiagnosticStep {
  step: string;
  status: 'ok' | 'warning' | 'error';
  detail: string;
}

export interface DiagnosticCardData {
  issue_type: string;
  diagnostic_steps: DiagnosticStep[];
  conclusion: string;
}

export interface HandoffCardData {
  customer_intent: string;
  main_issue: string;
  business_object: string[];
  confirmed_information: string[];
  actions_taken: string[];
  current_status: string;
  handoff_reason: string;
  next_action: string;
  priority: string;
  risk_flags: string[];
  session_summary: string;
}

export type CardData =
  | { type: 'bill_card'; data: BillCardData }
  | { type: 'cancel_card'; data: CancelCardData }
  | { type: 'plan_card'; data: PlanCardData }
  | { type: 'diagnostic_card'; data: DiagnosticCardData }
  | { type: 'handoff_card'; data: HandoffCardData };

// ── 卡片组件 ──────────────────────────────────────────────────────────────────

function BillCard({ data, lang = 'zh' }: { data: BillCardData; lang?: Lang }) {
  const tc = T[lang];
  const statusLabel = data.status === 'paid' ? tc.card_bill_paid : data.status === 'overdue' ? tc.card_bill_overdue : tc.card_bill_pending;
  return (
    <div className="bg-background rounded-2xl rounded-tl-none shadow-sm border border-border overflow-hidden w-full mb-1">
      <div className="bg-primary px-4 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-2 text-primary-foreground">
          <Receipt size={16} />
          <span className="text-sm font-semibold">{data.month} {tc.card_bill_title}</span>
        </div>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full bg-white/20 text-primary-foreground`}>{statusLabel}</span>
      </div>
      <div className="px-4 py-3">
        <div className="flex items-end justify-between mb-3">
          <span className="text-xs text-muted-foreground">{tc.card_bill_total}</span>
          <span className="text-2xl font-bold text-foreground">¥{data.total.toFixed(2)}</span>
        </div>
        <div className="space-y-1.5 border-t border-border pt-3">
          {[
            { label: tc.card_bill_plan_fee,  value: data.plan_fee },
            { label: tc.card_bill_data_fee,  value: data.data_fee },
            { label: tc.card_bill_voice_fee, value: data.voice_fee },
            { label: tc.card_bill_vas_fee,   value: data.value_added_fee },
            { label: tc.card_bill_tax,       value: data.tax },
          ].map(({ label, value }) => (
            <div key={label} className="flex justify-between text-sm">
              <span className="text-muted-foreground">{label}</span>
              <span className={value > 0 ? 'text-foreground' : 'text-muted-foreground/50'}>¥{value.toFixed(2)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CancelCard({ data, lang = 'zh' }: { data: CancelCardData; lang?: Lang }) {
  const tc = T[lang];
  return (
    <div className="bg-background rounded-2xl rounded-tl-none shadow-sm border border-border overflow-hidden w-full mb-1">
      <div className="bg-accent px-4 py-3 flex items-center space-x-2 text-accent-foreground">
        <Trash2 size={16} />
        <span className="text-sm font-semibold">{tc.card_cancel_title}</span>
      </div>
      <div className="px-4 py-3 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">{tc.card_cancel_service}</span>
          <span className="text-foreground font-medium">{data.service_name}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">{tc.card_cancel_savings}</span>
          <span className="text-primary font-medium">-¥{data.monthly_fee.toFixed(2)}{tc.card_plan_per_month}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">{tc.card_cancel_effective}</span>
          <span className="text-foreground">{data.effective_end}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">{tc.card_cancel_phone}</span>
          <span className="text-foreground">{data.phone}</span>
        </div>
        <div className="mt-2 p-2 bg-accent rounded-lg text-xs text-muted-foreground flex items-start space-x-1.5">
          <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" />
          <span>{tc.card_cancel_notice.replace('{date}', data.effective_end)}</span>
        </div>
      </div>
    </div>
  );
}

function PlanCard({ data, lang = 'zh' }: { data: PlanCardData; lang?: Lang }) {
  const tc = T[lang];
  const dataLabel = data.data_gb === -1 ? tc.card_plan_unlimited : `${data.data_gb}GB`;
  const voiceLabel = data.voice_min === -1 ? tc.card_plan_unlimited : `${data.voice_min}${tc.card_plan_voice_unit}`;
  return (
    <div className="bg-background rounded-2xl rounded-tl-none shadow-sm border border-border overflow-hidden w-full mb-1">
      <div className="bg-primary px-4 py-3 flex items-center space-x-2 text-primary-foreground">
        <Package size={16} />
        <span className="text-sm font-semibold">{tc.card_plan_title}</span>
      </div>
      <div className="px-4 py-3">
        <div className="flex items-end justify-between mb-3">
          <span className="text-base font-semibold text-foreground">{data.name}</span>
          <div className="text-right">
            <span className="text-2xl font-bold text-primary">¥{data.monthly_fee}</span>
            <span className="text-xs text-muted-foreground">{tc.card_plan_per_month}</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="bg-muted rounded-xl p-2 text-center">
            <div className="text-lg font-bold text-primary">{dataLabel}</div>
            <div className="text-xs text-muted-foreground">{tc.card_plan_data_label}</div>
          </div>
          <div className="bg-muted rounded-xl p-2 text-center">
            <div className="text-lg font-bold text-primary">{voiceLabel}</div>
            <div className="text-xs text-muted-foreground">{tc.card_plan_voice_label}</div>
          </div>
        </div>
        <div className="space-y-1">
          {data.features.map((f) => (
            <div key={f} className="flex items-center space-x-1.5 text-xs text-muted-foreground">
              <CheckCircle size={12} className="text-primary flex-shrink-0" />
              <span>{f}</span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{data.description}</p>
      </div>
    </div>
  );
}

function DiagnosticCard({ data, lang = 'zh' }: { data: DiagnosticCardData; lang?: Lang }) {
  const tc = T[lang];
  const issueLabels = tc.card_diag_labels;
  const hasError = data.diagnostic_steps.some((s) => s.status === 'error');
  const conclusionColor = hasError ? 'text-destructive bg-destructive/10' : 'text-muted-foreground bg-accent';

  const statusIcon = (status: DiagnosticStep['status']) => {
    if (status === 'ok') return <CheckCircle size={14} className="text-primary flex-shrink-0" />;
    if (status === 'warning') return <AlertTriangle size={14} className="text-muted-foreground flex-shrink-0" />;
    return <XCircle size={14} className="text-destructive flex-shrink-0" />;
  };

  return (
    <div className="bg-background rounded-2xl rounded-tl-none shadow-sm border border-border overflow-hidden w-full mb-1">
      <div className="bg-primary px-4 py-3 flex items-center space-x-2 text-primary-foreground">
        <Wifi size={16} />
        <span className="text-sm font-semibold">{issueLabels[data.issue_type] ?? tc.card_diag_default}</span>
      </div>
      <div className="px-4 py-3 space-y-2.5">
        {data.diagnostic_steps.map((step, idx) => (
          <div key={idx} className="flex items-start space-x-2">
            {statusIcon(step.status)}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-foreground">{step.step}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{step.detail}</div>
            </div>
          </div>
        ))}
        <div className={`rounded-lg p-2 text-xs font-medium flex items-start space-x-1.5 ${conclusionColor}`}>
          <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" />
          <span>{data.conclusion}</span>
        </div>
      </div>
    </div>
  );
}

function HandoffCard({ data, lang = 'zh' }: { data: HandoffCardData; lang?: Lang }) {
  const tc = T[lang];
  const priorityStyle =
    data.priority === '高' ? 'bg-destructive/10 text-destructive' :
    data.priority === '低' ? 'bg-muted text-muted-foreground' :
    'bg-accent text-muted-foreground';
  const statusStyle =
    data.current_status === '已解决' ? 'bg-primary/10 text-primary' :
    data.current_status === '未解决' ? 'bg-destructive/10 text-destructive' :
    'bg-primary/10 text-primary';

  return (
    <div className="bg-background rounded-2xl rounded-tl-none shadow-sm border border-border overflow-hidden w-full mb-1">
      <div className="bg-accent px-4 py-3 flex items-center justify-between text-accent-foreground">
        <div className="flex items-center space-x-2">
          <Headset size={16} />
          <span className="text-sm font-semibold">{tc.card_handoff_title}</span>
        </div>
        <div className="flex items-center space-x-1.5">
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${priorityStyle}`}>{data.priority} {tc.card_handoff_priority}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${statusStyle}`}>{data.current_status}</span>
        </div>
      </div>
      <div className="px-4 py-3 space-y-2.5">
        {data.session_summary && (
          <p className="text-xs text-muted-foreground leading-relaxed border-l-2 border-border pl-2">{data.session_summary}</p>
        )}
        <div className="space-y-1.5 border-t border-border pt-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{tc.card_handoff_intent}</span>
            <span className="text-foreground font-medium text-right max-w-[60%]">{data.customer_intent}</span>
          </div>
          {data.next_action && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{tc.card_handoff_action}</span>
              <span className="text-primary text-right max-w-[60%]">{data.next_action}</span>
            </div>
          )}
          {data.handoff_reason && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{tc.card_handoff_reason}</span>
              <span className="text-muted-foreground text-right max-w-[60%]">{data.handoff_reason}</span>
            </div>
          )}
        </div>
        {data.actions_taken.length > 0 && (
          <details className="text-xs">
            <summary className="text-muted-foreground cursor-pointer">{tc.card_handoff_actions_taken}（{data.actions_taken.length}）</summary>
            <ul className="mt-1 space-y-0.5 pl-2">
              {data.actions_taken.map((a, i) => <li key={i} className="text-muted-foreground">· {a}</li>)}
            </ul>
          </details>
        )}
        {data.risk_flags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {data.risk_flags.map((f, i) => (
              <span key={i} className="text-[10px] bg-destructive/10 text-destructive px-1.5 py-0.5 rounded-full">{f}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function CardMessage({ card, lang = 'zh' }: { card: CardData; lang?: Lang }) {
  if (card.type === 'bill_card') return <BillCard data={card.data} lang={lang} />;
  if (card.type === 'cancel_card') return <CancelCard data={card.data} lang={lang} />;
  if (card.type === 'plan_card') return <PlanCard data={card.data} lang={lang} />;
  if (card.type === 'diagnostic_card') return <DiagnosticCard data={card.data} lang={lang} />;
  if (card.type === 'handoff_card') return <HandoffCard data={card.data} lang={lang} />;
  return null;
}
