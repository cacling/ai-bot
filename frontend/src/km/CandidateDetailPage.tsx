import { useState, useEffect } from 'react';
import { ArrowLeft, CheckCircle, XCircle, Clock, Plus, ShieldCheck, Save } from 'lucide-react';
import { kmApi, type KMCandidateDetail } from './api';
import type { KMPage } from './KnowledgeManagementPage';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';

const GATE_ICON: Record<string, React.ReactNode> = {
  pass: <CheckCircle size={14} className="text-primary" />,
  fail: <XCircle size={14} className="text-destructive" />,
  pending: <Clock size={14} className="text-muted-foreground" />,
};
const GATE_LABELS: Record<string, string> = {
  evidence: '证据门槛', conflict: '冲突门槛', ownership: '归属门槛',
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
    try {
      return data.variants_json ? JSON.parse(data.variants_json).length : 0;
    } catch {
      return 0;
    }
  })();

  return (
    <div className="p-4">
      <Button variant="ghost" size="sm" onClick={() => navigate({ view: 'candidates' })} className="mb-3">
        <ArrowLeft size={12} /> 返回列表
      </Button>

      {/* 基础信息 */}
      <Card className="mb-3">
        <CardContent className="pt-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[10px] text-muted-foreground mb-1">标准问</div>
              <h2 className="text-sm font-semibold mb-1">{data.normalized_q}</h2>
              <div className="flex gap-3 text-xs text-muted-foreground">
                <span>来源: {data.source_type}</span>
                <span>风险: {data.risk_level}</span>
                <span>状态: {data.status}</span>
                <span>扩展问: {expandedQuestionCount} 条</span>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={handleGateCheck}>
              <ShieldCheck size={12} /> 校验门槛
            </Button>
          </div>
          {data.draft_answer && (
            <div className="mt-3 p-2 bg-background rounded text-xs">
              <div className="text-[10px] text-muted-foreground mb-1">草案答案</div>
              {data.draft_answer}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 门槛体检卡 */}
      <div className="grid grid-cols-3 gap-3 mb-3">
        {(['evidence', 'conflict', 'ownership'] as const).map(key => {
          const gateStatus = key === 'evidence' ? data.gate_evidence :
            key === 'conflict' ? data.gate_conflict : data.gate_ownership;
          return (
            <Card key={key} className={
              gateStatus === 'fail' ? 'border-destructive' : gateStatus === 'pass' ? 'border-primary' : ''
            }>
              <CardContent className="pt-3 pb-3">
                <div className="flex items-center gap-2 mb-2">
                  {GATE_ICON[gateStatus]}
                  <span className="text-xs font-medium">{GATE_LABELS[key]}</span>
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {key === 'evidence' && (
                    gateStatus === 'pass' ? `${data.evidences.filter(e => e.status === 'pass').length} 条证据已通过` :
                    gateStatus === 'fail' ? '缺少有效证据引用' : '待校验'
                  )}
                  {key === 'conflict' && (
                    gateStatus === 'pass' ? '无阻断级冲突' :
                    gateStatus === 'fail' ? `${data.gate_card.conflict.details.length} 个待仲裁冲突` : '待校验'
                  )}
                  {key === 'ownership' && (
                    gateStatus === 'pass' ? (data.target_asset_id ? '已绑定目标资产' : '新增类候选') :
                    '更新类候选需绑定目标资产'
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* 结构化提示配置 */}
      <StructuredHintEditor candidateId={id} initialData={data} onSaved={load} />

      {/* 证据列表 */}
      <Card className="mb-3">
        <CardHeader className="py-2 px-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xs">证据引用</CardTitle>
            <Button variant="ghost" size="xs" onClick={() => setShowAddEvidence(true)}>
              <Plus size={11} /> 添加证据
            </Button>
          </div>
        </CardHeader>
        {showAddEvidence && (
          <div className="p-3 border-b space-y-2">
            <Input value={evidenceForm.doc_version_id} onChange={e => setEvidenceForm(f => ({ ...f, doc_version_id: e.target.value }))}
              placeholder="文档版本 ID" className="text-xs" />
            <Input value={evidenceForm.locator} onChange={e => setEvidenceForm(f => ({ ...f, locator: e.target.value }))}
              placeholder="定位（页码/条款/片段）" className="text-xs" />
            <div className="flex gap-2">
              <Button size="sm" onClick={handleAddEvidence}>确认添加</Button>
              <Button variant="outline" size="sm" onClick={() => setShowAddEvidence(false)}>取消</Button>
            </div>
          </div>
        )}
        <div className="divide-y">
          {data.evidences.length === 0 ? (
            <div className="py-4 text-center text-xs text-muted-foreground">暂无证据引用</div>
          ) : data.evidences.map(ev => (
            <div key={ev.id} className="flex items-center gap-3 px-3 py-2 text-xs">
              {GATE_ICON[ev.status]}
              <span className="text-muted-foreground font-mono">{ev.doc_version_id}</span>
              <span className="text-muted-foreground">{ev.locator ?? '-'}</span>
              <Badge variant={ev.status === 'pass' ? 'default' : ev.status === 'fail' ? 'destructive' : 'secondary'} className="ml-auto">
                {ev.status}
              </Badge>
            </div>
          ))}
        </div>
      </Card>

      {/* 阻断提示 */}
      {!allPass && data.status !== 'published' && (
        <Alert variant="destructive">
          <AlertTriangle size={13} />
          <AlertTitle className="text-xs font-medium">门槛未通过</AlertTitle>
          <AlertDescription className="text-xs">
            无法加入评审包：门槛未全部通过。请先补齐证据、完成冲突仲裁或绑定目标资产。
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

function StructuredHintEditor({ candidateId, initialData, onSaved }: {
  candidateId: string;
  initialData: KMCandidateDetail;
  onSaved: () => void;
}) {
  const existing = initialData.structured_json ? JSON.parse(initialData.structured_json) : null;
  const existingExpandedQuestions = (() => {
    try {
      return initialData.variants_json ? JSON.parse(initialData.variants_json) : [];
    } catch {
      return [];
    }
  })();

  const [sceneCode, setSceneCode] = useState(initialData.scene_code ?? '');
  const [sceneLabel, setSceneLabel] = useState(existing?.scene?.label ?? initialData.category ?? '');
  const [expandedQuestions, setExpandedQuestions] = useState(
    existingExpandedQuestions.length > 0
      ? existingExpandedQuestions.join('\n')
      : Array.isArray(existing?.expanded_questions)
        ? existing.expanded_questions.join('\n')
        : '',
  );
  const [tags, setTags] = useState(initialData.retrieval_tags_json ? JSON.parse(initialData.retrieval_tags_json).join(', ') : '');
  const [requiredSlots, setRequiredSlots] = useState(existing?.required_slots?.join(', ') ?? '');
  const [recommendedTerms, setRecommendedTerms] = useState(existing?.recommended_terms?.join(', ') ?? '');
  const [forbiddenTerms, setForbiddenTerms] = useState(existing?.forbidden_terms?.join(', ') ?? '');
  const [nextActions, setNextActions] = useState(existing?.next_actions?.join(', ') ?? '');
  const [sources, setSources] = useState(existing?.sources?.join(', ') ?? '');
  const [riskLevel, setRiskLevel] = useState(existing?.scene?.risk ?? 'low');
  const [replyStandard, setReplyStandard] = useState(existing?.reply_options?.find((o: { label: string }) => o.label === '标准版')?.text ?? '');
  const [replySoothe, setReplySoothe] = useState(existing?.reply_options?.find((o: { label: string }) => o.label === '安抚版')?.text ?? '');
  const [saving, setSaving] = useState(false);

  const splitComma = (s: string) => s.split(/[,，]/).map(t => t.trim()).filter(Boolean);
  const splitLines = (s: string) => s.split(/\n+/).map(t => t.trim()).filter(Boolean);

  const handleSave = async () => {
    setSaving(true);
    try {
      const expandedQuestionList = splitLines(expandedQuestions);
      const structured = {
        scene: {
          code: sceneCode,
          label: sceneLabel.trim() || existing?.scene?.label || sceneCode.replace(/_/g, ' '),
          risk: riskLevel,
        },
        expanded_questions: expandedQuestionList,
        required_slots: splitComma(requiredSlots),
        recommended_terms: splitComma(recommendedTerms),
        forbidden_terms: splitComma(forbiddenTerms),
        reply_options: [
          ...(replyStandard ? [{ label: '标准版', text: replyStandard }] : []),
          ...(replySoothe ? [{ label: '安抚版', text: replySoothe }] : []),
        ],
        next_actions: splitComma(nextActions),
        sources: splitComma(sources),
        retrieval_tags: splitComma(tags),
      };
      await kmApi.updateCandidate(candidateId, {
        scene_code: sceneCode,
        variants_json: JSON.stringify(expandedQuestionList),
        retrieval_tags_json: JSON.stringify(splitComma(tags)),
        structured_json: JSON.stringify(structured),
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="mb-3">
      <CardHeader className="py-2 px-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs">结构化提示配置</CardTitle>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            <Save size={12} /> {saving ? '保存中...' : '保存'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-[10px] text-muted-foreground mb-1 block">场景编码</label>
            <Input value={sceneCode} onChange={e => setSceneCode(e.target.value)} className="text-xs font-mono" placeholder="billing_abnormal" />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground mb-1 block">场景名称</label>
            <Input value={sceneLabel} onChange={e => setSceneLabel(e.target.value)} className="text-xs" placeholder="资费争议 / 流量异常" />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground mb-1 block">风险级别</label>
            <Select value={riskLevel} onValueChange={setRiskLevel}>
              <SelectTrigger className="text-xs h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">低</SelectItem>
                <SelectItem value="medium">中</SelectItem>
                <SelectItem value="high">高</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <label className="text-[10px] text-muted-foreground mb-1 block">扩展问（每行一条）</label>
          <Textarea
            value={expandedQuestions}
            onChange={e => setExpandedQuestions(e.target.value)}
            className="text-xs min-h-[88px]"
            placeholder={'用户昨天办了5G套餐怎么还没生效？\n刚充话费怎么还是停机？'}
          />
        </div>

        <div>
          <label className="text-[10px] text-muted-foreground mb-1 block">检索标签（逗号分隔）</label>
          <Input value={tags} onChange={e => setTags(e.target.value)} className="text-xs" placeholder="计费, 扣费, 争议" />
        </div>

        <div>
          <label className="text-[10px] text-muted-foreground mb-1 block">必追问槽位（逗号分隔）</label>
          <Input value={requiredSlots} onChange={e => setRequiredSlots(e.target.value)} className="text-xs" placeholder="手机号, 账期, 账单月份" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] text-muted-foreground mb-1 block">推荐术语（逗号分隔）</label>
            <Input value={recommendedTerms} onChange={e => setRecommendedTerms(e.target.value)} className="text-xs" placeholder="以账单和详单为准, 为您核实" />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground mb-1 block">禁用术语（逗号分隔）</label>
            <Input value={forbiddenTerms} onChange={e => setForbiddenTerms(e.target.value)} className="text-xs" placeholder="系统出错了, 肯定是误扣" />
          </div>
        </div>

        <div>
          <label className="text-[10px] text-muted-foreground mb-1 block">推荐回复 — 标准版</label>
          <Textarea value={replyStandard} onChange={e => setReplyStandard(e.target.value)} className="text-xs min-h-[60px]" placeholder="承接情绪 + 结论 + 原因 + 下一步 + 时效" />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground mb-1 block">推荐回复 — 安抚版</label>
          <Textarea value={replySoothe} onChange={e => setReplySoothe(e.target.value)} className="text-xs min-h-[60px]" placeholder="安抚 + 核实 + 下一步" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] text-muted-foreground mb-1 block">下一步动作（逗号分隔）</label>
            <Input value={nextActions} onChange={e => setNextActions(e.target.value)} className="text-xs" placeholder="查充值流水, 发起异常工单" />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground mb-1 block">证据来源（逗号分隔）</label>
            <Input value={sources} onChange={e => setSources(e.target.value)} className="text-xs" placeholder="计费规则第5章, 停复机规则" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
