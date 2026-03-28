/**
 * AgentCopilotContent.tsx — Agent Copilot main card (colSpan: 2)
 *
 * Replaces ReplyHintContent with a full copilot experience:
 *   - Top: conversation summary + tags
 *   - Left column: auto-recommended replies
 *   - Right column: manual knowledge base Q&A
 *   - Bottom: feedback bar
 */

import { memo, useState, useCallback } from 'react';
import { type Lang } from '../../../i18n';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import {
  Copy, ArrowRightToLine, Send, Loader2,
  AlertTriangle, ThumbsUp, ThumbsDown, PenLine, CheckCircle,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

interface CopilotSummary {
  current_summary: string;
  intent: string;
  scene: { code: string; label: string; risk: string };
  emotion: string;
  missing_slots: string[];
  recommended_actions: string[];
  confidence: number;
  matched_sources_count: number;
}

interface CopilotRecommendations {
  reply_options: Array<{ label: string; text: string; source: string }>;
  recommended_terms: string[];
  forbidden_terms: string[];
  next_actions: string[];
  sources: string[];
  asset_version_id: string;
}

interface AgentCopilotData {
  summary: CopilotSummary;
  recommendations: CopilotRecommendations;
  suggested_questions: string[];
}

interface KbAnswer {
  direct_answer: string;
  customer_facing_answer: string;
  cautions: string[];
  citations: Array<{ title: string; version: string }>;
  confidence: number;
  followup_suggestions: string[];
}

// ── Constants ────────────────────────────────────────────────────────────────

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

const EMOTION_MAP: Record<string, string> = {
  '平静': '😌', '礼貌': '🙏', '焦虑': '😟', '不满': '😒', '愤怒': '😡',
};

const T = {
  zh: {
    title: '坐席助手',
    subtitle: '基于当前对话实时推荐回复，并支持向知识库主动提问',
    highConfidence: '高置信',
    medConfidence: '中置信',
    lowConfidence: '低置信',
    matchedSources: '条知识',
    currentSession: '当前会话',
    suggestedAction: '建议动作',
    missingInfo: '待补充信息',
    autoRecommend: '自动推荐',
    autoRecommendSub: '基于当前对话生成',
    recommendedReply: '推荐回复',
    insert: '带入输入框',
    copy: '复制',
    source: '来源',
    recommendedTerms: '推荐术语',
    forbiddenTerms: '禁用术语',
    askKb: '主动问知识库',
    askKbSub: '结合当前会话上下文获取答案',
    questionPlaceholder: '例如：充值到账后一般多久恢复通话？',
    ask: '提问',
    quickQuestions: '快捷问题',
    directAnswer: '直接答案',
    customerReply: '建议给客户的话',
    cautions: '注意事项',
    citations: '来源',
    insertReply: '插入客户回复',
    copyAnswer: '复制答案',
    continueAsk: '继续追问',
    searching: '正在检索知识库...',
    feedback: '这次建议是否有帮助？',
    adoptDirect: '直接采纳',
    adoptWithEdit: '编辑后采纳',
    helpful: '基本有用',
    notHelpful: '没帮助',
    emptyTitle: '等待客户消息...',
    emptySub: '系统会根据当前客户对话自动推荐回复，并支持你随时咨询知识库',
    emptyAskHint: '你也可以直接向知识库提问：',
    commonQuestions: '常用问题',
    lowConfidenceHint: '当前暂无高置信推荐回复',
    lowConfidenceSuggest: '建���先追问以下信息：',
    highRiskWarning: '当前场景涉及高风险，请��慎处理',
    noHighConfAnswer: '当前暂无高置信答案',
    suggestSupplement: '建议补充后再提问：',
    relatedKnowledge: '相关知识',
  },
  en: {
    title: 'Agent Copilot',
    subtitle: 'Real-time reply suggestions with knowledge base Q&A',
    highConfidence: 'High',
    medConfidence: 'Medium',
    lowConfidence: 'Low',
    matchedSources: ' sources',
    currentSession: 'Current Session',
    suggestedAction: 'Suggested Action',
    missingInfo: 'Missing Info',
    autoRecommend: 'Auto Recommendations',
    autoRecommendSub: 'Based on current conversation',
    recommendedReply: 'Recommended Replies',
    insert: 'Insert',
    copy: 'Copy',
    source: 'Source',
    recommendedTerms: 'Recommended Terms',
    forbiddenTerms: 'Forbidden Terms',
    askKb: 'Ask Knowledge Base',
    askKbSub: 'Get answers with conversation context',
    questionPlaceholder: 'e.g. How long does it take to restore service?',
    ask: 'Ask',
    quickQuestions: 'Quick Questions',
    directAnswer: 'Direct Answer',
    customerReply: 'Suggested Reply to Customer',
    cautions: 'Cautions',
    citations: 'Sources',
    insertReply: 'Insert Reply',
    copyAnswer: 'Copy Answer',
    continueAsk: 'Follow Up',
    searching: 'Searching knowledge base...',
    feedback: 'Was this helpful?',
    adoptDirect: 'Adopted',
    adoptWithEdit: 'Edited & Adopted',
    helpful: 'Helpful',
    notHelpful: 'Not Helpful',
    emptyTitle: 'Waiting for customer message...',
    emptySub: 'Suggestions will appear after a customer message. You can also ask the knowledge base directly.',
    emptyAskHint: 'Ask the knowledge base:',
    commonQuestions: 'Common Questions',
    lowConfidenceHint: 'No high-confidence reply available',
    lowConfidenceSuggest: 'Suggest asking for:',
    highRiskWarning: 'High-risk scenario — handle with caution',
    noHighConfAnswer: 'No high-confidence answer available',
    suggestSupplement: 'Suggest supplementing:',
    relatedKnowledge: 'Related Knowledge',
  },
};

// ── Dispatch actions to AgentWorkstationPage via CustomEvent ─────────────────

const dispatchAction = (type: string, payload: Record<string, unknown>) => {
  window.dispatchEvent(new CustomEvent('reply-copilot-action', { detail: { type, ...payload } }));
};

// ── Main Component ───────────────────────────────────────────────────────────

export const AgentCopilotContent = memo(function AgentCopilotContent({
  data,
  lang,
}: {
  data: unknown;
  lang: Lang;
}) {
  const d = data as AgentCopilotData | null;
  const t = T[lang];

  const [kbQuestion, setKbQuestion] = useState('');
  const [kbAnswer, setKbAnswer] = useState<KbAnswer | null>(null);
  const [kbLoading, setKbLoading] = useState(false);
  const [feedbackGiven, setFeedbackGiven] = useState<string | null>(null);

  const handleAsk = useCallback(async (question?: string) => {
    const q = question ?? kbQuestion;
    if (!q.trim()) return;
    setKbLoading(true);
    setKbAnswer(null);
    try {
      const res = await fetch('/api/km/agent-copilot/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: q,
          conversation_summary: d?.summary.current_summary,
        }),
      });
      const json = await res.json();
      setKbAnswer(json.answer);
    } catch { /* silent */ }
    setKbLoading(false);
  }, [kbQuestion, d?.summary.current_summary]);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    if (d?.recommendations.asset_version_id) {
      dispatchAction('reply_feedback', { event: 'copy', assetVersionId: d.recommendations.asset_version_id });
    }
  };

  const handleInsert = (text: string) => {
    dispatchAction('insert_text', { text, assetVersionId: d?.recommendations.asset_version_id ?? '' });
  };

  const handleFeedback = (type: string) => {
    setFeedbackGiven(type);
    dispatchAction('reply_feedback', {
      event: type,
      assetVersionId: d?.recommendations.asset_version_id ?? '',
    });
  };

  // ── Empty state ──
  if (!d) {
    return (
      <div className="p-3 space-y-3 text-xs">
        <div className="flex flex-col items-center justify-center py-6 space-y-2 text-center">
          <span className="text-2xl opacity-30">🤖</span>
          <p className="text-[11px] font-medium text-muted-foreground">{t.emptyTitle}</p>
          <p className="text-[10px] text-muted-foreground max-w-sm">{t.emptySub}</p>
        </div>
        <div className="px-1">
          <div className="text-[10px] text-muted-foreground mb-2">{t.emptyAskHint}</div>
          <div className="flex gap-1.5">
            <Input
              value={kbQuestion}
              onChange={e => setKbQuestion(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAsk()}
              placeholder={t.questionPlaceholder}
              className="text-xs h-7 flex-1"
            />
            <Button size="xs" onClick={() => handleAsk()} disabled={kbLoading}>
              <Send size={10} /> {t.ask}
            </Button>
          </div>
          {kbAnswer && <AnswerResult answer={kbAnswer} lang={lang} onInsert={handleInsert} onCopy={handleCopy} onAsk={handleAsk} />}
        </div>
      </div>
    );
  }

  const isHighRisk = d.summary.scene.risk === 'high';
  const isLowConfidence = d.summary.confidence < 0.3;
  const confidenceLabel = d.summary.confidence >= 0.7 ? t.highConfidence
    : d.summary.confidence >= 0.4 ? t.medConfidence : t.lowConfidence;

  return (
    <div className="p-3 space-y-3 text-xs">
      {/* ── High risk warning ── */}
      {isHighRisk && (
        <div className="flex items-center gap-2 p-2 rounded-lg bg-destructive/10 text-destructive text-[10px]">
          <AlertTriangle size={12} />
          <span className="font-medium">{t.highRiskWarning}</span>
        </div>
      )}

      {/* ── Summary section ── */}
      <div>
        <div className="flex items-center gap-2 flex-wrap mb-1.5">
          <Badge variant="outline" className="text-[10px] font-medium">{d.summary.scene.label}</Badge>
          <Badge variant="secondary" className="text-[10px]">{confidenceLabel}</Badge>
          <Badge className={`text-[10px] ${RISK_COLORS[d.summary.scene.risk] ?? RISK_COLORS.low}`}>
            {RISK_LABELS[d.summary.scene.risk]?.[lang] ?? d.summary.scene.risk}
          </Badge>
          {d.summary.emotion && EMOTION_MAP[d.summary.emotion] && (
            <Badge variant="outline" className="text-[10px]">
              {EMOTION_MAP[d.summary.emotion]} {d.summary.emotion}
            </Badge>
          )}
          {d.summary.matched_sources_count > 0 && (
            <span className="text-[10px] text-muted-foreground ml-auto">
              {d.summary.matched_sources_count}{t.matchedSources}
            </span>
          )}
        </div>
        <p className="text-foreground leading-relaxed mb-1.5">{d.summary.current_summary}</p>

        {d.summary.recommended_actions.length > 0 && (
          <div className="mb-1">
            <span className="text-[10px] text-muted-foreground">{t.suggestedAction}：</span>
            <span className="text-[10px] text-foreground">{d.summary.recommended_actions.join('；')}</span>
          </div>
        )}

        {d.summary.missing_slots.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            <span className="text-[10px] text-muted-foreground">{t.missingInfo}：</span>
            {d.summary.missing_slots.map(s => (
              <Badge key={s} variant="outline" className="text-[10px] bg-blue-50 dark:bg-blue-950">{s}</Badge>
            ))}
          </div>
        )}
      </div>

      <Separator />

      {/* ── Two-column layout ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Left: Auto recommendations */}
        <div className="space-y-2">
          <div>
            <div className="text-[10px] font-medium text-muted-foreground mb-0.5">{t.autoRecommend}</div>
            <div className="text-[9px] text-muted-foreground">{t.autoRecommendSub}</div>
          </div>

          {isLowConfidence && d.recommendations.reply_options.length === 0 ? (
            <LowConfidencePanel summary={d.summary} lang={lang} />
          ) : (
            <>
              {d.recommendations.reply_options.length > 0 && (
                <div className="space-y-1.5">
                  {d.recommendations.reply_options.map(opt => (
                    <div key={opt.label} className="bg-muted rounded-lg px-2.5 py-2 group">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-[10px] font-medium text-muted-foreground">{opt.label}</span>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button variant="ghost" size="xs" onClick={() => handleInsert(opt.text)} title={t.insert}>
                            <ArrowRightToLine size={10} />
                          </Button>
                          <Button variant="ghost" size="xs" onClick={() => handleCopy(opt.text)} title={t.copy}>
                            <Copy size={10} />
                          </Button>
                        </div>
                      </div>
                      <p className="text-foreground leading-relaxed">{opt.text}</p>
                      {opt.source && (
                        <div className="text-[9px] text-muted-foreground mt-1">{t.source}：{opt.source}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {d.recommendations.recommended_terms.length > 0 && (
                <div>
                  <div className="text-[10px] text-muted-foreground mb-1">{t.recommendedTerms}</div>
                  <div className="flex flex-wrap gap-1">
                    {d.recommendations.recommended_terms.map(term => (
                      <Badge key={term} variant="secondary" className="text-[10px] bg-primary/5">{term}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {d.recommendations.forbidden_terms.length > 0 && (
                <div>
                  <div className="text-[10px] text-muted-foreground mb-1">{t.forbiddenTerms}</div>
                  <div className="flex flex-wrap gap-1">
                    {d.recommendations.forbidden_terms.map(term => (
                      <Badge key={term} variant="destructive" className="text-[10px]">{term}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Right: Knowledge base Q&A */}
        <div className="space-y-2">
          <div>
            <div className="text-[10px] font-medium text-muted-foreground mb-0.5">{t.askKb}</div>
            <div className="text-[9px] text-muted-foreground">{t.askKbSub}</div>
          </div>

          <div className="flex gap-1.5">
            <Input
              value={kbQuestion}
              onChange={e => setKbQuestion(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAsk()}
              placeholder={t.questionPlaceholder}
              className="text-xs h-7 flex-1"
            />
            <Button size="xs" onClick={() => handleAsk()} disabled={kbLoading}>
              {kbLoading ? <Loader2 size={10} className="animate-spin" /> : <Send size={10} />}
              {t.ask}
            </Button>
          </div>

          {d.suggested_questions.length > 0 && !kbAnswer && (
            <div>
              <div className="text-[10px] text-muted-foreground mb-1">{t.quickQuestions}</div>
              <div className="flex flex-wrap gap-1">
                {d.suggested_questions.map(q => (
                  <Button
                    key={q}
                    variant="outline"
                    size="xs"
                    className="text-[10px] h-5"
                    onClick={() => { setKbQuestion(q); handleAsk(q); }}
                  >
                    {q}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {kbLoading && (
            <div className="flex items-center gap-2 py-4 justify-center text-muted-foreground">
              <Loader2 size={12} className="animate-spin" />
              <span className="text-[10px]">{t.searching}</span>
            </div>
          )}

          {kbAnswer && !kbLoading && (
            <AnswerResult answer={kbAnswer} lang={lang} onInsert={handleInsert} onCopy={handleCopy} onAsk={handleAsk} />
          )}
        </div>
      </div>

      <Separator />

      {/* ── Feedback bar ── */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-muted-foreground">{t.feedback}</span>
        <div className="flex gap-1 ml-auto">
          {([
            ['adopt_direct', t.adoptDirect, CheckCircle],
            ['adopt_with_edit', t.adoptWithEdit, PenLine],
            ['helpful', t.helpful, ThumbsUp],
            ['not_helpful', t.notHelpful, ThumbsDown],
          ] as const).map(([key, label, Icon]) => (
            <Button
              key={key}
              variant={feedbackGiven === key ? 'default' : 'ghost'}
              size="xs"
              className="text-[10px]"
              disabled={!!feedbackGiven}
              onClick={() => handleFeedback(key)}
            >
              <Icon size={10} /> {label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
});

// ── Sub-components ───────────────────────────────────────────────────────────

function AnswerResult({
  answer,
  lang,
  onInsert,
  onCopy,
  onAsk,
}: {
  answer: KbAnswer;
  lang: Lang;
  onInsert: (text: string) => void;
  onCopy: (text: string) => void;
  onAsk: (q: string) => void;
}) {
  const t = T[lang];

  return (
    <div className="space-y-2 mt-2">
      <div className="bg-muted rounded-lg p-2.5 space-y-2">
        {answer.direct_answer && (
          <div>
            <div className="text-[10px] font-medium text-muted-foreground mb-0.5">{t.directAnswer}</div>
            <p className="text-foreground leading-relaxed">{answer.direct_answer}</p>
          </div>
        )}
        {answer.customer_facing_answer && (
          <div>
            <div className="text-[10px] font-medium text-muted-foreground mb-0.5">{t.customerReply}</div>
            <p className="text-foreground leading-relaxed">{answer.customer_facing_answer}</p>
          </div>
        )}
        {answer.cautions.length > 0 && (
          <div>
            <div className="text-[10px] font-medium text-muted-foreground mb-0.5">{t.cautions}</div>
            <ul className="space-y-0.5">
              {answer.cautions.map((c, i) => (
                <li key={i} className="text-foreground leading-relaxed flex items-start gap-1">
                  <span className="text-muted-foreground mt-0.5">-</span> {c}
                </li>
              ))}
            </ul>
          </div>
        )}
        {answer.citations.length > 0 && (
          <div>
            <div className="text-[10px] font-medium text-muted-foreground mb-0.5">{t.citations}</div>
            <div className="flex flex-wrap gap-1">
              {answer.citations.map((c, i) => (
                <Badge key={i} variant="outline" className="text-[9px]">{c.title}</Badge>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-1">
        {answer.customer_facing_answer && (
          <Button variant="outline" size="xs" className="text-[10px]" onClick={() => onInsert(answer.customer_facing_answer)}>
            <ArrowRightToLine size={10} /> {t.insertReply}
          </Button>
        )}
        {answer.direct_answer && (
          <Button variant="outline" size="xs" className="text-[10px]" onClick={() => onCopy(answer.direct_answer)}>
            <Copy size={10} /> {t.copyAnswer}
          </Button>
        )}
      </div>

      {answer.followup_suggestions.length > 0 && (
        <div>
          <div className="text-[10px] text-muted-foreground mb-1">{t.continueAsk}</div>
          <div className="flex flex-wrap gap-1">
            {answer.followup_suggestions.map(q => (
              <Button
                key={q}
                variant="outline"
                size="xs"
                className="text-[10px] h-5"
                onClick={() => onAsk(q)}
              >
                {q}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function LowConfidencePanel({ summary, lang }: { summary: CopilotSummary; lang: Lang }) {
  const t = T[lang];
  return (
    <div className="bg-muted/50 rounded-lg p-2.5 space-y-2">
      <p className="text-[10px] text-muted-foreground">{t.lowConfidenceHint}</p>
      {summary.missing_slots.length > 0 && (
        <div>
          <div className="text-[10px] text-muted-foreground mb-1">{t.lowConfidenceSuggest}</div>
          <div className="flex flex-wrap gap-1">
            {summary.missing_slots.map(s => (
              <Badge key={s} variant="outline" className="text-[10px]">{s}</Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
