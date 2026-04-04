import { useState, useEffect } from 'react';
import { ArrowLeft, CheckCircle, XCircle, Clock, Plus, ShieldCheck, Save, BotMessageSquare, Info } from 'lucide-react';
import { kmApi, type KMCandidateDetail } from './api';
import type { KMPage } from './KnowledgeManagementPage';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { AlertTriangle } from 'lucide-react';

const GATE_ICON: Record<string, React.ReactNode> = {
  pass: <CheckCircle size={14} className="text-primary" />,
  fail: <XCircle size={14} className="text-destructive" />,
  pending: <Clock size={14} className="text-muted-foreground" />,
};
const GATE_LABELS: Record<string, string> = {
  evidence: '证据', conflict: '冲突', ownership: '归属',
};

export function CandidateDetailPage({ id, navigate }: { id: string; navigate: (p: KMPage) => void }) {
  const [data, setData] = useState<KMCandidateDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddEvidence, setShowAddEvidence] = useState(false);
  const [evidenceForm, setEvidenceForm] = useState({ doc_version_id: '', locator: '' });

  const load = () => {
    setLoading(true);
    kmApi.getCandidate(id).then(setData).finally(() => setLoading(false));
  };
  useEffect(load, [id]);

  const handleGateCheck = async () => {
    await kmApi.gateCheck(id);
    load();
  };

  const handleAddEvidence = async () => {
    if (!evidenceForm.doc_version_id.trim()) return;
    await kmApi.createEvidence({ candidate_id: id, ...evidenceForm, status: 'pass' });
    setShowAddEvidence(false);
    setEvidenceForm({ doc_version_id: '', locator: '' });
    await kmApi.gateCheck(id);
    load();
  };

  if (loading) return <div className="p-4 text-xs text-muted-foreground">加载中...</div>;
  if (!data) return <div className="p-4 text-xs text-destructive">候选不存在</div>;

  const allPass = data.gate_evidence === 'pass' && data.gate_conflict === 'pass' && data.gate_ownership === 'pass';
  const expandedQuestionCount = (() => {
    try { return data.variants_json ? JSON.parse(data.variants_json).length : 0; } catch { return 0; }
  })();

  return (
    <div className="flex flex-col h-full">
      {/* 顶栏 */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border shrink-0">
        <Button variant="ghost" size="sm" onClick={() => navigate({ view: 'candidates' })}>
          <ArrowLeft size={12} /> 返回列表
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold truncate">{data.normalized_q}</h2>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="outline" className="text-[10px]">{data.source_type}</Badge>
          <Badge variant={data.risk_level === 'high' ? 'destructive' : data.risk_level === 'medium' ? 'default' : 'secondary'} className="text-[10px]">
            {data.risk_level === 'high' ? '高风险' : data.risk_level === 'medium' ? '中风险' : '低风险'}
          </Badge>
          <Badge variant={data.status === 'published' ? 'default' : 'secondary'} className="text-[10px]">{data.status}</Badge>
        </div>
      </div>

      {/* 左右分栏 */}
      <ResizablePanelGroup orientation="horizontal" className="flex-1" id="candidate-detail">
        {/* ── 左侧：编辑区 ── */}
        <ResizablePanel defaultSize="62%" minSize="35%" id="editor">
          <div className="h-full overflow-hidden">
            <div className="h-full overflow-y-auto p-4 space-y-3">
              <StructuredHintEditor candidateId={id} initialData={data} onSaved={load} />
            </div>
          </div>
        </ResizablePanel>

        <ResizableHandle />

        {/* ── 右侧：上下文 & 预览 ── */}
        <ResizablePanel defaultSize="38%" minSize="25%" id="context">
          <div className="h-full overflow-hidden">
          <div className="h-full overflow-y-auto p-4 space-y-3">

            {/* 基础信息摘要 */}
            <Card>
              <CardContent className="pt-3 pb-3 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-medium">
                  <Info size={12} className="text-muted-foreground" /> 基础信息
                </div>
                {data.draft_answer && (
                  <div className="p-2 bg-muted rounded text-xs text-muted-foreground">
                    {data.draft_answer}
                  </div>
                )}
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                  <span>扩展问: <b className="text-foreground">{expandedQuestionCount}</b> 条</span>
                </div>
              </CardContent>
            </Card>

            {/* 门槛体检 */}
            <Card>
              <CardContent className="pt-3 pb-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium flex items-center gap-1.5">
                    <ShieldCheck size={12} className="text-muted-foreground" /> 门槛体检
                  </span>
                  <Button variant="outline" size="xs" onClick={handleGateCheck}>
                    校验
                  </Button>
                </div>
                <div className="space-y-1.5">
                  {(['evidence', 'conflict', 'ownership'] as const).map(key => {
                    const gateStatus = key === 'evidence' ? data.gate_evidence :
                      key === 'conflict' ? data.gate_conflict : data.gate_ownership;
                    const detail = key === 'evidence'
                      ? (gateStatus === 'pass' ? `${data.evidences.filter(e => e.status === 'pass').length} 条已通过` : gateStatus === 'fail' ? '缺少证据' : '待校验')
                      : key === 'conflict'
                        ? (gateStatus === 'pass' ? '无阻断级冲突' : gateStatus === 'fail' ? `${data.gate_card.conflict.details.length} 个待仲裁` : '待校验')
                        : (gateStatus === 'pass' ? (data.target_asset_id ? '已绑定资产' : '新增类') : '需绑定资产');
                    return (
                      <div key={key} className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs ${
                        gateStatus === 'fail' ? 'bg-destructive/10' : gateStatus === 'pass' ? 'bg-primary/5' : 'bg-muted'
                      }`}>
                        {GATE_ICON[gateStatus]}
                        <span className="font-medium">{GATE_LABELS[key]}</span>
                        <span className="text-muted-foreground ml-auto">{detail}</span>
                      </div>
                    );
                  })}
                </div>
                {!allPass && data.status !== 'published' && (
                  <div className="mt-2 text-[10px] text-destructive flex items-center gap-1">
                    <AlertTriangle size={10} /> 门槛未全部通过，无法加入评审包
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 坐席助手预览 */}
            <PreviewPanel candidateId={id} />

            {/* 证据引用 */}
            <Card>
              <CardContent className="pt-3 pb-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium">证据引用</span>
                  <Button variant="ghost" size="xs" onClick={() => setShowAddEvidence(!showAddEvidence)}>
                    <Plus size={11} /> 添加
                  </Button>
                </div>
                {showAddEvidence && (
                  <div className="mb-2 p-2 bg-muted rounded space-y-1.5">
                    <Input value={evidenceForm.doc_version_id} onChange={e => setEvidenceForm(f => ({ ...f, doc_version_id: e.target.value }))}
                      placeholder="文档版本 ID" className="text-xs h-7" />
                    <Input value={evidenceForm.locator} onChange={e => setEvidenceForm(f => ({ ...f, locator: e.target.value }))}
                      placeholder="定位（页码/条款）" className="text-xs h-7" />
                    <div className="flex gap-1.5">
                      <Button size="xs" onClick={handleAddEvidence}>确认</Button>
                      <Button variant="outline" size="xs" onClick={() => setShowAddEvidence(false)}>取消</Button>
                    </div>
                  </div>
                )}
                {data.evidences.length === 0 ? (
                  <div className="py-3 text-center text-[11px] text-muted-foreground">暂无证据</div>
                ) : (
                  <div className="space-y-1">
                    {data.evidences.map(ev => (
                      <div key={ev.id} className="flex items-center gap-2 px-2 py-1 rounded bg-muted text-xs">
                        {GATE_ICON[ev.status]}
                        <span className="text-muted-foreground font-mono truncate flex-1">{ev.doc_version_id}</span>
                        <Badge variant={ev.status === 'pass' ? 'default' : ev.status === 'fail' ? 'destructive' : 'secondary'} className="text-[10px] shrink-0">
                          {ev.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

          </div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

// ── 预览面板 ──────────────────────────────────────────────────────────────────

function PreviewPanel({ candidateId }: { candidateId: string }) {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const handlePreview = async () => {
    if (!query.trim()) return;
    setPreviewing(true);
    try {
      const res = await fetch('/api/km/agent-copilot/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: query }),
      });
      const data = await res.json();
      setResult(data.answer ?? data);
    } catch { setResult({ error: '预览失败' }); }
    setPreviewing(false);
  };

  return (
    <Card>
      <CardContent className="pt-3 pb-3 space-y-2">
        <div className="text-xs font-medium flex items-center gap-1.5">
          <BotMessageSquare size={12} className="text-muted-foreground" /> 坐席助手预览
        </div>
        <div className="flex gap-1.5">
          <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="输入客户问题预览…" className="text-xs h-7 flex-1"
            onKeyDown={e => e.key === 'Enter' && handlePreview()} />
          <Button size="xs" onClick={handlePreview} disabled={previewing || !query.trim()}>
            {previewing ? '...' : '预览'}
          </Button>
        </div>
        {result && (
          <div className="p-2 bg-muted rounded text-xs space-y-1.5">
            {(result as { direct_answer?: string }).direct_answer && (
              <div><span className="text-[10px] text-muted-foreground">坐席答案：</span><p>{(result as { direct_answer: string }).direct_answer}</p></div>
            )}
            {(result as { customer_facing_answer?: string }).customer_facing_answer && (
              <div><span className="text-[10px] text-muted-foreground">建议回复：</span><p>{(result as { customer_facing_answer: string }).customer_facing_answer}</p></div>
            )}
            {Array.isArray((result as { cautions?: string[] }).cautions) && (result as { cautions: string[] }).cautions.length > 0 && (
              <div>
                <span className="text-[10px] text-muted-foreground">注意事项：</span>
                <ul className="list-disc list-inside">
                  {(result as { cautions: string[] }).cautions.map((c, i) => <li key={i}>{c}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── 编辑器 ────────────────────────────────────────────────────────────────────

function StructuredHintEditor({ candidateId, initialData, onSaved }: {
  candidateId: string;
  initialData: KMCandidateDetail;
  onSaved: () => void;
}) {
  const existing = initialData.structured_json ? JSON.parse(initialData.structured_json) : null;
  const existingExpandedQuestions = (() => {
    try { return initialData.variants_json ? JSON.parse(initialData.variants_json) : []; } catch { return []; }
  })();

  // Tab 1: 检索定义
  const [expandedQuestions, setExpandedQuestions] = useState(
    existingExpandedQuestions.length > 0 ? existingExpandedQuestions.join('\n')
      : Array.isArray(existing?.expanded_questions) ? existing.expanded_questions.join('\n') : '',
  );
  const [tags, setTags] = useState(initialData.retrieval_tags_json ? JSON.parse(initialData.retrieval_tags_json).join(', ') : '');
  const [applicableScope, setApplicableScope] = useState(JSON.stringify(existing?.applicable_scope ?? {}, null, 2));

  // Tab 2: 会话理解
  const [sceneCode, setSceneCode] = useState(initialData.scene_code ?? '');
  const [sceneLabel, setSceneLabel] = useState(existing?.scene?.label ?? initialData.category ?? '');
  const [riskLevel, setRiskLevel] = useState(existing?.scene?.risk ?? 'low');
  const [knowledgeType, setKnowledgeType] = useState(existing?.knowledge_type ?? 'reply');
  const [requiredSlots, setRequiredSlots] = useState(existing?.required_slots?.join(', ') ?? '');
  const [emotionHints, setEmotionHints] = useState(existing?.emotion_hints?.join(', ') ?? '');

  // Tab 3: 客户话术
  const [replyStandard, setReplyStandard] = useState(existing?.reply_options?.find((o: { label: string }) => o.label === '标准版')?.text ?? '');
  const [replySoothe, setReplySoothe] = useState(existing?.reply_options?.find((o: { label: string }) => o.label === '安抚版')?.text ?? '');
  const [replyFollowup, setReplyFollowup] = useState(existing?.customer_reply_followup ?? '');
  const [replyRiskSafe, setReplyRiskSafe] = useState(existing?.customer_reply_risk_safe ?? '');
  const [recommendedTerms, setRecommendedTerms] = useState(existing?.recommended_terms?.join(', ') ?? '');
  const [forbiddenTerms, setForbiddenTerms] = useState(existing?.forbidden_terms?.join(', ') ?? '');

  // Tab 4: 坐席答案
  const [agentAnswer, setAgentAnswer] = useState(existing?.agent_answer ?? '');
  const [cautionNotes, setCautionNotes] = useState(existing?.caution_notes?.join('\n') ?? '');

  // Tab 5: 动作建议
  const [nextActions, setNextActions] = useState(existing?.next_actions?.join(', ') ?? '');
  const [escalationConditions, setEscalationConditions] = useState(existing?.escalation_conditions?.join('\n') ?? '');

  // Tab 6: 依据与降级
  const [sources, setSources] = useState(existing?.sources?.join(', ') ?? '');
  const [fallbackPolicy, setFallbackPolicy] = useState(existing?.fallback_policy ?? 'suggest_supplement');

  const [saving, setSaving] = useState(false);

  const splitComma = (s: string) => s.split(/[,，]/).map(t => t.trim()).filter(Boolean);
  const splitLines = (s: string) => s.split(/\n+/).map(t => t.trim()).filter(Boolean);

  const handleSave = async () => {
    setSaving(true);
    try {
      const expandedQuestionList = splitLines(expandedQuestions);
      let parsedScope = {};
      try { parsedScope = JSON.parse(applicableScope); } catch { /* keep empty */ }

      const structured = {
        scene: { code: sceneCode, label: sceneLabel.trim() || sceneCode.replace(/_/g, ' '), risk: riskLevel },
        knowledge_type: knowledgeType,
        expanded_questions: expandedQuestionList,
        required_slots: splitComma(requiredSlots),
        emotion_hints: splitComma(emotionHints),
        recommended_terms: splitComma(recommendedTerms),
        forbidden_terms: splitComma(forbiddenTerms),
        reply_options: [
          ...(replyStandard ? [{ label: '标准版', text: replyStandard }] : []),
          ...(replySoothe ? [{ label: '安抚版', text: replySoothe }] : []),
        ],
        customer_reply_followup: replyFollowup,
        customer_reply_risk_safe: replyRiskSafe,
        agent_answer: agentAnswer,
        caution_notes: splitLines(cautionNotes),
        next_actions: splitComma(nextActions),
        escalation_conditions: splitLines(escalationConditions),
        sources: splitComma(sources),
        retrieval_tags: splitComma(tags),
        fallback_policy: fallbackPolicy,
        applicable_scope: parsedScope,
        citations: existing?.citations ?? splitComma(sources).map(s => ({ title: s, version: '', anchor: '' })),
      };
      await kmApi.updateCandidate(candidateId, {
        scene_code: sceneCode,
        variants_json: JSON.stringify(expandedQuestionList),
        retrieval_tags_json: JSON.stringify(splitComma(tags)),
        structured_json: JSON.stringify(structured),
      });
      onSaved();
    } finally { setSaving(false); }
  };

  const F = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div>
      <label className="text-[10px] text-muted-foreground mb-1 block">{label}</label>
      {children}
    </div>
  );

  return (
    <div className="w-full min-w-0 space-y-3">
      {/* 编辑器标题栏 */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium">助手知识编辑器</h3>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          <Save size={12} /> {saving ? '保存中...' : '保存'}
        </Button>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="retrieval" className="w-full min-w-0">
        <TabsList className="w-full justify-start h-8 mb-3">
          <TabsTrigger value="retrieval" className="text-[11px]">检索定义</TabsTrigger>
          <TabsTrigger value="understanding" className="text-[11px]">会话理解</TabsTrigger>
          <TabsTrigger value="customer" className="text-[11px]">客户话术</TabsTrigger>
          <TabsTrigger value="agent" className="text-[11px]">坐席答案</TabsTrigger>
          <TabsTrigger value="actions" className="text-[11px]">动作建议</TabsTrigger>
          <TabsTrigger value="evidence" className="text-[11px]">依据与降级</TabsTrigger>
        </TabsList>

        {/* Tab 1: 检索定义 */}
        <TabsContent value="retrieval" className="space-y-3">
          <F label="扩展问（每行一条）">
            <Textarea value={expandedQuestions} onChange={e => setExpandedQuestions(e.target.value)} className="text-xs min-h-[120px]" placeholder="用户昨天办了5G套餐怎么还没生效？" />
          </F>
          <div className="grid grid-cols-2 gap-3">
            <F label="检索标签（逗号分隔）">
              <Input value={tags} onChange={e => setTags(e.target.value)} className="text-xs" placeholder="计费, 扣费, 争议" />
            </F>
            <F label="适用范围（JSON）">
              <Textarea value={applicableScope} onChange={e => setApplicableScope(e.target.value)} className="text-xs font-mono min-h-[32px] h-8" placeholder='{"channels": ["online"]}' />
            </F>
          </div>
        </TabsContent>

        {/* Tab 2: 会话理解 */}
        <TabsContent value="understanding" className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <F label="场景编码">
              <Input value={sceneCode} onChange={e => setSceneCode(e.target.value)} className="text-xs font-mono" placeholder="billing_abnormal" />
            </F>
            <F label="场景名称">
              <Input value={sceneLabel} onChange={e => setSceneLabel(e.target.value)} className="text-xs" placeholder="资费争议 / 流量异常" />
            </F>
            <F label="风险级别">
              <Select value={riskLevel} onValueChange={setRiskLevel}>
                <SelectTrigger className="text-xs h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">低</SelectItem>
                  <SelectItem value="medium">中</SelectItem>
                  <SelectItem value="high">高</SelectItem>
                </SelectContent>
              </Select>
            </F>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <F label="知识类型">
              <Select value={knowledgeType} onValueChange={setKnowledgeType}>
                <SelectTrigger className="text-xs h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="reply">回复</SelectItem>
                  <SelectItem value="rag_answer">RAG 答案</SelectItem>
                  <SelectItem value="action">动作</SelectItem>
                  <SelectItem value="risk">风险</SelectItem>
                  <SelectItem value="followup">追问</SelectItem>
                </SelectContent>
              </Select>
            </F>
            <F label="情绪提示（逗号分隔）">
              <Input value={emotionHints} onChange={e => setEmotionHints(e.target.value)} className="text-xs" placeholder="焦虑, 不满" />
            </F>
          </div>
          <F label="必追问槽位（逗号分隔）">
            <Input value={requiredSlots} onChange={e => setRequiredSlots(e.target.value)} className="text-xs" placeholder="手机号, 账期, 账单月份" />
          </F>
        </TabsContent>

        {/* Tab 3: 客户话术 */}
        <TabsContent value="customer" className="space-y-3">
          <F label="标准版回复">
            <Textarea value={replyStandard} onChange={e => setReplyStandard(e.target.value)} className="text-xs min-h-[60px]" placeholder="承接情绪 + 结论 + 原因 + 下一步 + 时效" />
          </F>
          <F label="安抚版回复">
            <Textarea value={replySoothe} onChange={e => setReplySoothe(e.target.value)} className="text-xs min-h-[60px]" placeholder="安抚 + 核实 + 下一步" />
          </F>
          <F label="追问版回复">
            <Textarea value={replyFollowup} onChange={e => setReplyFollowup(e.target.value)} className="text-xs min-h-[60px]" placeholder="请问您是通过哪个渠道办理的？" />
          </F>
          <F label="风险规避版回复">
            <Textarea value={replyRiskSafe} onChange={e => setReplyRiskSafe(e.target.value)} className="text-xs min-h-[60px]" placeholder="暂时无法给出确定结论，需要进一步核实..." />
          </F>
          <div className="grid grid-cols-2 gap-3">
            <F label="推荐术语（逗号分隔）">
              <Input value={recommendedTerms} onChange={e => setRecommendedTerms(e.target.value)} className="text-xs" placeholder="以账单和详单为准, 为您核实" />
            </F>
            <F label="禁用术语（逗号分隔）">
              <Input value={forbiddenTerms} onChange={e => setForbiddenTerms(e.target.value)} className="text-xs" placeholder="系统出错了, 肯定是误扣" />
            </F>
          </div>
        </TabsContent>

        {/* Tab 4: 坐席答案 */}
        <TabsContent value="agent" className="space-y-3">
          <F label="给坐席的解释性答案">
            <Textarea value={agentAnswer} onChange={e => setAgentAnswer(e.target.value)} className="text-xs min-h-[120px]" placeholder="详细解释业务规则和处理逻辑，帮助坐席理解..." />
          </F>
          <F label="注意事项（每行一条）">
            <Textarea value={cautionNotes} onChange={e => setCautionNotes(e.target.value)} className="text-xs min-h-[80px]" placeholder="不要承诺具体恢复时间&#10;如客户已等超过3个工作日需升级处理" />
          </F>
        </TabsContent>

        {/* Tab 5: 动作建议 */}
        <TabsContent value="actions" className="space-y-3">
          <F label="下一步动作（逗号分隔）">
            <Input value={nextActions} onChange={e => setNextActions(e.target.value)} className="text-xs" placeholder="查充值流水, 发起异常工单" />
          </F>
          <F label="升级条件（每行一条）">
            <Textarea value={escalationConditions} onChange={e => setEscalationConditions(e.target.value)} className="text-xs min-h-[80px]" placeholder="客户等待超过3个工作日仍未生效&#10;受理记录显示成功但系统未切换" />
          </F>
        </TabsContent>

        {/* Tab 6: 依据与降级 */}
        <TabsContent value="evidence" className="space-y-3">
          <F label="证据来源（逗号分隔）">
            <Input value={sources} onChange={e => setSources(e.target.value)} className="text-xs" placeholder="计费规则第5章, 停复机规则" />
          </F>
          <F label="降级策略">
            <Select value={fallbackPolicy} onValueChange={setFallbackPolicy}>
              <SelectTrigger className="text-xs h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="suggest_supplement">建议补充信息</SelectItem>
                <SelectItem value="show_related">推荐相似知识</SelectItem>
                <SelectItem value="escalate">建议升级处理</SelectItem>
              </SelectContent>
            </Select>
          </F>
        </TabsContent>
      </Tabs>
    </div>
  );
}
