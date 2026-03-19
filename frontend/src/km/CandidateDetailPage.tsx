import { useState, useEffect } from 'react';
import { ArrowLeft, CheckCircle, XCircle, Clock, Plus, ShieldCheck } from 'lucide-react';
import { kmApi, type KMCandidateDetail } from './api';
import type { KMPage } from './KnowledgeManagementPage';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
              <h2 className="text-sm font-semibold mb-1">{data.normalized_q}</h2>
              <div className="flex gap-3 text-xs text-muted-foreground">
                <span>来源: {data.source_type}</span>
                <span>风险: {data.risk_level}</span>
                <span>状态: {data.status}</span>
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
