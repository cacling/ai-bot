/**
 * NLEditPanel.tsx — 自然语言配置编辑面板
 */

import React, { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Check, X, Sparkles, User, Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface NLEditPanelProps {
  onApplyDone?: () => void;
  onStatusChange?: (snapshot: NLEditStatusSnapshot | null) => void;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'system';
  text: string;
  clarify?: ClarifyPayload;
}

interface DiffResult {
  old_fragment: string;
  new_fragment: string;
  file_path: string;
  session_id: string;
}

interface ClarifyOption {
  id: string;
  label: string;
  description?: string;
}

interface ClarifySummary {
  target_skill?: string | null;
  change_type?: 'wording' | 'param' | 'flow' | 'branch' | 'new_step' | 'capability_boundary';
  change_summary?: string;
  affected_area?: string[];
  unchanged_area?: string[];
  related_docs?: string[];
  acceptance_signal?: string;
  risk_level?: 'low' | 'medium' | 'high';
}

interface ClarifyEvidence {
  explicit?: string[];
  inferred?: string[];
  repo_observations?: string[];
}

interface ClarifyImpact {
  needs_reference_update?: boolean;
  needs_workflow_change?: boolean;
  needs_channel_review?: boolean;
  needs_human_escalation_review?: boolean;
  out_of_scope_reason?: string;
}

interface ClarifyPayload {
  status?: 'need_clarify' | 'ready' | 'blocked';
  phase?: 'scope_check' | 'target_confirm' | 'change_confirm' | 'impact_confirm' | 'ready' | 'blocked';
  question?: string;
  message?: string;
  missing?: string[];
  missing_items?: string[];
  options?: ClarifyOption[];
  summary?: ClarifySummary;
  evidence?: ClarifyEvidence;
  impact?: ClarifyImpact;
  session_id?: string;
}

export interface NLEditStatusSnapshot {
  status?: ClarifyPayload['status'];
  phase?: ClarifyPayload['phase'];
  targetSkill?: string | null;
  riskLevel?: ClarifySummary['risk_level'];
  message?: string;
}

const PHASE_LABELS: Record<NonNullable<ClarifyPayload['phase']>, string> = {
  scope_check: '范围确认',
  target_confirm: '目标技能',
  change_confirm: '改动确认',
  impact_confirm: '影响确认',
  ready: '已就绪',
  blocked: '已阻断',
};

const STATUS_LABELS: Record<NonNullable<ClarifyPayload['status']>, string> = {
  need_clarify: '待澄清',
  ready: '可编辑',
  blocked: '需升级',
};

const CHANGE_TYPE_LABELS: Record<NonNullable<ClarifySummary['change_type']>, string> = {
  wording: '话术调整',
  param: '参数调整',
  flow: '流程调整',
  branch: '分支调整',
  new_step: '新增步骤',
  capability_boundary: '能力边界',
};

function getStatusBadgeVariant(status?: ClarifyPayload['status']): 'secondary' | 'destructive' | 'default' {
  if (status === 'blocked') return 'destructive';
  if (status === 'ready') return 'default';
  return 'secondary';
}

function getRiskBadgeVariant(risk?: ClarifySummary['risk_level']): 'outline' | 'secondary' | 'destructive' {
  if (risk === 'high') return 'destructive';
  if (risk === 'medium') return 'secondary';
  return 'outline';
}

function formatClarifyText(data: ClarifyPayload): string {
  if (data.status === 'blocked') return data.message || data.question || '当前需求需要先升级处理。';
  if (data.status === 'ready') return '需求已明确，正在生成修改方案…';
  return data.question || '还需要补充一些信息。';
}

function buildImpactTags(impact?: ClarifyImpact): string[] {
  if (!impact) return [];
  const tags: string[] = [];
  if (impact.needs_reference_update) tags.push('需要同步 reference');
  if (impact.needs_workflow_change) tags.push('涉及流程调整');
  if (impact.needs_channel_review) tags.push('涉及渠道影响');
  if (impact.needs_human_escalation_review) tags.push('涉及转人工/升级策略');
  return tags;
}

export function NLEditPanel({ onApplyDone, onStatusChange }: NLEditPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [diff, setDiff] = useState<DiffResult | null>(null);
  const [applying, setApplying] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, diff]);

  const addMessage = (role: 'user' | 'system', text: string, clarify?: ClarifyPayload) => {
    setMessages((prev) => [...prev, { id: Date.now().toString() + Math.random(), role, text, clarify }]);
  };

  const emitStatusChange = (payload: ClarifyPayload | null) => {
    onStatusChange?.(payload ? {
      status: payload.status,
      phase: payload.phase,
      targetSkill: payload.summary?.target_skill ?? null,
      riskLevel: payload.summary?.risk_level,
      message: payload.message ?? payload.question,
    } : null);
  };

  const submitText = async (text: string) => {
    if (!text || loading) return;

    addMessage('user', text);
    setDiff(null);
    setLoading(true);

    try {
      const res = await fetch('/api/skill-edit/clarify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, session_id: sessionId }),
      });
      const data = await res.json() as ClarifyPayload & { error?: string };
      if (!res.ok) throw new Error(data.error ?? '澄清失败');

      if (data.session_id) setSessionId(data.session_id);
      const nextSessionId = data.session_id ?? sessionId;
      emitStatusChange(data);

      if (data.status === 'need_clarify') {
        addMessage('system', formatClarifyText(data), data);
      } else if (data.status === 'ready') {
        addMessage('system', formatClarifyText(data), data);
        await generateDiff(nextSessionId);
      } else {
        addMessage('system', formatClarifyText(data), data);
      }
    } catch (err: any) {
      addMessage('system', `请求失败: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;

    setInput('');
    await submitText(text);
  };

  const handleQuickReply = async (option: ClarifyOption) => {
    if (loading) return;
    await submitText(option.label);
  };

  const generateDiff = async (sid: string | null) => {
    setLoading(true);
    try {
      const res = await fetch('/api/skill-edit/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sid }),
      });
      const data = await res.json() as DiffResult & { error?: string; message?: string };
      if (!res.ok) throw new Error(data.error ?? data.message ?? '未知错误');
      setDiff({
        old_fragment: data.old_fragment ?? '',
        new_fragment: data.new_fragment ?? '',
        file_path: data.file_path ?? '',
        session_id: sid ?? '',
      });
      addMessage('system', '已生成修改预览，请确认后应用。');
    } catch (err: any) {
      addMessage('system', `生成 Diff 失败: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    if (!diff) return;
    setApplying(true);
    try {
      const res = await fetch('/api/skill-edit/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: diff.session_id,
          old_fragment: diff.old_fragment,
          new_fragment: diff.new_fragment,
          file_path: diff.file_path,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        addMessage('system', '修改已成功应用！');
        setDiff(null);
        emitStatusChange(null);
        onApplyDone?.();
      } else {
        addMessage('system', `应用失败: ${data.detail ?? data.message ?? '未知错误'}`);
      }
    } catch (err: any) {
      addMessage('system', `应用失败: ${err.message}`);
    } finally {
      setApplying(false);
    }
  };

  const handleReset = () => {
    setMessages([]);
    setDiff(null);
    setSessionId(null);
    setInput('');
    setLoading(false);
    setApplying(false);
    emitStatusChange(null);
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="h-10 border-b flex items-center justify-between px-3 shrink-0">
        <span className="text-xs font-semibold flex items-center gap-1.5">
          <Sparkles size={12} className="text-primary" />
          AI 编辑
        </span>
        <Button variant="ghost" size="xs" onClick={handleReset}>重置</Button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-8">
            输入自然语言描述，AI 将帮你修改文件
          </p>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                msg.role === 'user'
                  ? 'bg-primary/10 text-primary'
                  : 'bg-accent text-accent-foreground'
              }`}
            >
              {msg.role === 'user' ? <User className="w-3 h-3" /> : <Bot className="w-3 h-3" />}
            </div>
            <div
              className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-primary text-primary-foreground rounded-tr-none'
                  : 'bg-muted rounded-tl-none'
              }`}
            >
              {msg.clarify?.status && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  <Badge variant={getStatusBadgeVariant(msg.clarify.status)}>
                    {STATUS_LABELS[msg.clarify.status]}
                  </Badge>
                  {msg.clarify.phase && (
                    <Badge variant="outline">
                      {PHASE_LABELS[msg.clarify.phase]}
                    </Badge>
                  )}
                  {msg.clarify.summary?.risk_level && (
                    <Badge variant={getRiskBadgeVariant(msg.clarify.summary.risk_level)}>
                      风险 {msg.clarify.summary.risk_level}
                    </Badge>
                  )}
                </div>
              )}

              {msg.text.split('\n').map((line, i) => (
                <p key={i} className="mb-0.5 last:mb-0">{line}</p>
              ))}

              {msg.clarify?.status === 'blocked' && (
                <Alert variant="destructive" className="mt-2 px-2 py-2 text-xs">
                  <AlertTitle>已阻断</AlertTitle>
                  <AlertDescription>
                    {msg.clarify.impact?.out_of_scope_reason || '这次修改超出了普通技能编辑范围，建议先拆包或升级处理。'}
                  </AlertDescription>
                </Alert>
              )}

              {(msg.clarify?.summary?.target_skill || msg.clarify?.summary?.change_summary) && (
                <div className="mt-2 rounded-md border bg-background/60 p-2 text-[11px] text-foreground">
                  <div className="font-medium">当前理解</div>
                  {msg.clarify.summary?.target_skill && (
                    <div className="mt-1">目标技能：{msg.clarify.summary.target_skill}</div>
                  )}
                  {msg.clarify.summary?.change_type && (
                    <div className="mt-1">
                      修改类型：{CHANGE_TYPE_LABELS[msg.clarify.summary.change_type]}
                    </div>
                  )}
                  {msg.clarify.summary?.change_summary && (
                    <div className="mt-1">改动摘要：{msg.clarify.summary.change_summary}</div>
                  )}
                  {msg.clarify.summary?.affected_area?.length ? (
                    <div className="mt-1">影响区域：{msg.clarify.summary.affected_area.join('、')}</div>
                  ) : null}
                  {msg.clarify.summary?.unchanged_area?.length ? (
                    <div className="mt-1">保持不变：{msg.clarify.summary.unchanged_area.join('、')}</div>
                  ) : null}
                </div>
              )}

              {msg.clarify?.missing?.length ? (
                <div className="mt-2 text-[11px] text-muted-foreground">
                  <div className="font-medium text-foreground">还缺信息</div>
                  <ul className="mt-1 list-disc pl-4">
                    {msg.clarify.missing.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {msg.clarify?.evidence?.repo_observations?.length ? (
                <div className="mt-2 text-[11px] text-muted-foreground">
                  <div className="font-medium text-foreground">仓库观察</div>
                  <ul className="mt-1 list-disc pl-4">
                    {msg.clarify.evidence.repo_observations.slice(0, 4).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {buildImpactTags(msg.clarify?.impact).length ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {buildImpactTags(msg.clarify?.impact).map((tag) => (
                    <Badge key={tag} variant="outline">{tag}</Badge>
                  ))}
                </div>
              ) : null}

              {msg.clarify?.options?.length ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {msg.clarify.options.map((option) => (
                    <Button
                      key={option.id}
                      variant="outline"
                      size="xs"
                      className="h-auto max-w-full items-start whitespace-normal py-1.5 text-left"
                      onClick={() => void handleQuickReply(option)}
                      disabled={loading}
                    >
                      <span>
                        <span className="block font-medium">{option.label}</span>
                        {option.description ? (
                          <span className="mt-0.5 block text-[10px] text-muted-foreground">{option.description}</span>
                        ) : null}
                      </span>
                    </Button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 size={12} className="animate-spin" />
            处理中…
          </div>
        )}

        {/* Diff Preview */}
        {diff && (
          <div className="border rounded-lg overflow-hidden">
            <div className="text-xs font-medium bg-background px-3 py-1.5 border-b">
              修改预览
            </div>
            <div className="border-b bg-muted/40 px-3 py-1.5 text-[11px] text-muted-foreground">
              {diff.file_path || '未定位文件'}
            </div>
            <div className="grid grid-cols-2 text-xs font-mono leading-relaxed max-h-60 overflow-auto">
              <div className="bg-destructive/10 p-2 border-r">
                <div className="text-[10px] font-sans text-destructive mb-1">删除</div>
                <pre className="whitespace-pre-wrap text-destructive">{diff.old_fragment || '(空)'}</pre>
              </div>
              <div className="bg-primary/10 p-2">
                <div className="text-[10px] font-sans text-primary mb-1">新增</div>
                <pre className="whitespace-pre-wrap text-primary">{diff.new_fragment || '(空)'}</pre>
              </div>
            </div>
            <div className="flex items-center gap-2 p-2 bg-background border-t">
              <Button size="sm" onClick={handleApply} disabled={applying}>
                {applying ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                应用
              </Button>
              <Button variant="outline" size="sm" onClick={() => setDiff(null)}>
                <X size={12} /> 取消
              </Button>
            </div>
          </div>
        )}

        <div ref={endRef} />
      </div>

      {/* Input */}
      <div className="p-2 border-t">
        <div className="flex items-end gap-1.5">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="描述你想做的修改…"
            rows={2}
            className="flex-1 min-h-0 resize-none px-2.5 py-1.5 text-xs bg-background"
            spellCheck={false}
          />
          <Button size="icon-sm" onClick={handleSend} disabled={!input.trim() || loading}>
            <Send className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
