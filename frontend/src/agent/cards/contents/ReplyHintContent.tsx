/**
 * ReplyHintContent.tsx — Reply Copilot hint card (colSpan: 2)
 *
 * data shape: ReplyHintData | null
 */

import { memo } from 'react';
import { type Lang } from '../../../i18n';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Copy, ArrowRightToLine, XCircle } from 'lucide-react';

interface ReplyHintData {
  scene: { code: string; label: string; risk: string };
  required_slots: string[];
  recommended_terms: string[];
  forbidden_terms: string[];
  reply_options: Array<{ label: string; text: string }>;
  next_actions: string[];
  sources: string[];
  confidence: number;
  asset_version_id: string;
}

const RISK_COLORS: Record<string, string> = {
  low: 'bg-primary/10 text-primary',
  medium: 'bg-yellow-500/10 text-yellow-700',
  high: 'bg-destructive/10 text-destructive',
};

const RISK_LABELS: Record<string, Record<Lang, string>> = {
  low: { zh: '低风险', en: 'Low Risk' },
  medium: { zh: '中风险', en: 'Medium Risk' },
  high: { zh: '高风险', en: 'High Risk' },
};

/** Dispatch actions to AgentWorkstationPage via CustomEvent */
const dispatchAction = (type: string, payload: Record<string, unknown>) => {
  window.dispatchEvent(new CustomEvent('reply-copilot-action', { detail: { type, ...payload } }));
};

export const ReplyHintContent = memo(function ReplyHintContent({
  data,
  lang,
}: {
  data: unknown;
  lang: Lang;
}) {
  const d = data as ReplyHintData | null;

  if (!d) {
    return (
      <div className="flex flex-col items-center justify-center py-6 space-y-1.5 text-center select-none px-3">
        <span className="text-2xl opacity-30">💡</span>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          {lang === 'zh' ? '等待用户消息，自动生成回复提示...' : 'Waiting for user message to generate reply hints...'}
        </p>
      </div>
    );
  }

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    dispatchAction('reply_feedback', { event: 'copy', assetVersionId: d.asset_version_id });
  };

  const handleInsert = (text: string) => {
    dispatchAction('insert_text', { text, assetVersionId: d.asset_version_id });
  };

  const handleDismiss = () => {
    dispatchAction('reply_feedback', { event: 'dismiss', assetVersionId: d.asset_version_id });
  };

  const confidenceLabel = lang === 'zh'
    ? (d.confidence >= 0.7 ? '高置信' : d.confidence >= 0.4 ? '中置信' : '低置信')
    : (d.confidence >= 0.7 ? 'High' : d.confidence >= 0.4 ? 'Medium' : 'Low');

  return (
    <div className="p-3 space-y-3 text-xs">
      {/* Scene + Confidence + Risk */}
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className="text-[10px] font-medium">{d.scene.label}</Badge>
        <Badge variant="secondary" className="text-[10px]">{confidenceLabel}</Badge>
        <Badge className={`text-[10px] ${RISK_COLORS[d.scene.risk] ?? RISK_COLORS.low}`}>
          {RISK_LABELS[d.scene.risk]?.[lang] ?? d.scene.risk}
        </Badge>
        {d.sources.length > 0 && (
          <span className="text-[10px] text-muted-foreground ml-auto truncate max-w-[200px]" title={d.sources.join(', ')}>
            {lang === 'zh' ? '来源' : 'Source'}: {d.sources[0]}
          </span>
        )}
      </div>

      {/* Required Slots */}
      {d.required_slots.length > 0 && (
        <div>
          <div className="text-[10px] text-muted-foreground mb-1">{lang === 'zh' ? '需先追问' : 'Ask first'}</div>
          <div className="flex flex-wrap gap-1">
            {d.required_slots.map(s => (
              <Badge key={s} variant="outline" className="text-[10px] bg-blue-50 dark:bg-blue-950">{s}</Badge>
            ))}
          </div>
        </div>
      )}

      {/* Recommended Terms */}
      {d.recommended_terms.length > 0 && (
        <div>
          <div className="text-[10px] text-muted-foreground mb-1">{lang === 'zh' ? '推荐术语' : 'Recommended Terms'}</div>
          <div className="flex flex-wrap gap-1">
            {d.recommended_terms.map(t => (
              <Badge key={t} variant="secondary" className="text-[10px] bg-primary/5">{t}</Badge>
            ))}
          </div>
        </div>
      )}

      {/* Forbidden Terms */}
      {d.forbidden_terms.length > 0 && (
        <div>
          <div className="text-[10px] text-muted-foreground mb-1">{lang === 'zh' ? '禁用术语' : 'Forbidden Terms'}</div>
          <div className="flex flex-wrap gap-1">
            {d.forbidden_terms.map(t => (
              <Badge key={t} variant="destructive" className="text-[10px]">{t}</Badge>
            ))}
          </div>
        </div>
      )}

      {/* Reply Options */}
      {d.reply_options.length > 0 && (
        <div>
          <div className="text-[10px] text-muted-foreground mb-1">{lang === 'zh' ? '推荐回复' : 'Recommended Replies'}</div>
          <div className="space-y-1.5">
            {d.reply_options.map(opt => (
              <div key={opt.label} className="bg-muted rounded-lg px-2.5 py-2 group">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[10px] font-medium text-muted-foreground">{opt.label}</span>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="xs" onClick={() => handleInsert(opt.text)} title={lang === 'zh' ? '带入输入框' : 'Insert'}>
                      <ArrowRightToLine size={10} />
                    </Button>
                    <Button variant="ghost" size="xs" onClick={() => handleCopy(opt.text)} title={lang === 'zh' ? '复制' : 'Copy'}>
                      <Copy size={10} />
                    </Button>
                  </div>
                </div>
                <p className="text-foreground leading-relaxed">{opt.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Next Actions */}
      {d.next_actions.length > 0 && (
        <div>
          <div className="text-[10px] text-muted-foreground mb-1">{lang === 'zh' ? '下一步动作' : 'Next Actions'}</div>
          <div className="flex flex-wrap gap-1">
            {d.next_actions.map(a => (
              <Badge key={a} variant="outline" className="text-[10px]">{a}</Badge>
            ))}
          </div>
        </div>
      )}

      {/* Dismiss */}
      <div className="flex justify-end pt-1">
        <Button variant="ghost" size="xs" className="text-muted-foreground" onClick={handleDismiss}>
          <XCircle size={10} /> {lang === 'zh' ? '不准/无帮助' : 'Not helpful'}
        </Button>
      </div>
    </div>
  );
});
