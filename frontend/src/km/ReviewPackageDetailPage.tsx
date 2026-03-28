import { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, Send, CheckCircle, XCircle, AlertTriangle, ShieldCheck } from 'lucide-react';
import { kmApi, type KMReviewPackageDetail } from './api';
import { Badge } from '@/components/ui/badge';
import type { KMPage } from './KnowledgeManagementPage';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

const GATE_DOT: Record<string, string> = { pass: 'bg-primary', fail: 'bg-destructive', pending: 'bg-muted-foreground' };

export function ReviewPackageDetailPage({ id, navigate }: { id: string; navigate: (p: KMPage) => void }) {
  const [data, setData] = useState<KMReviewPackageDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [blockers, setBlockers] = useState<{ candidate_id: string; q: string; reasons: string[] }[] | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    setBlockers(null);
    kmApi.getReviewPackage(id).then(setData).finally(() => setLoading(false));
  };
  useEffect(load, [id]);

  const handleSubmit = async () => {
    try {
      setError(null);
      setBlockers(null);
      await kmApi.submitReview(id, { submitted_by: 'operator' });
      load();
    } catch (err: unknown) {
      const msg = (err as Error).message;
      setError(msg);
      try {
        const res = await fetch(`/api/km/review-packages/${id}/submit`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ submitted_by: 'operator' }),
        });
        if (!res.ok) {
          const body = await res.json();
          if (body.blockers) setBlockers(body.blockers);
        }
      } catch {}
    }
  };

  const handleApprove = async () => {
    await kmApi.approveReview(id, { approved_by: 'reviewer' });
    load();
  };

  const handleReject = async () => {
    await kmApi.rejectReview(id, { rejected_by: 'reviewer', reason: '需要修改' });
    load();
  };

  const handleCreateDraft = async () => {
    if (!data) return;
    await kmApi.createActionDraft({
      action_type: 'publish', review_pkg_id: id,
      change_summary: `发布评审包: ${data.title}`, created_by: 'operator',
    });
    alert('已创建发布草案，请到「动作草案」页面执行');
  };

  if (loading) return <div className="p-4 text-xs text-muted-foreground">加载中...</div>;
  if (!data) return <div className="p-4 text-xs text-destructive">评审包不存在</div>;

  return (
    <div className="p-4">
      <Button variant="ghost" size="sm" onClick={() => navigate({ view: 'review-packages' })} className="mb-3">
        <ArrowLeft size={12} /> 返回列表
      </Button>

      {/* 基本信息 */}
      <Card className="mb-3">
        <CardContent className="pt-4">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-sm font-semibold mb-1">{data.title}</h2>
              <div className="flex gap-3 text-xs text-muted-foreground">
                <span>状态: {data.status}</span>
                <span>风险: {data.risk_level}</span>
                <span>候选数: {data.candidates.length}</span>
              </div>
            </div>
            <div className="flex gap-2">
              {data.status === 'draft' && (
                <Button size="sm" onClick={handleSubmit}><Send size={12} /> 提交评审</Button>
              )}
              {data.status === 'submitted' && (
                <>
                  <Button size="sm" onClick={handleApprove}>
                    <CheckCircle size={12} /> 通过
                  </Button>
                  <Button variant="destructive" size="sm" onClick={handleReject}>
                    <XCircle size={12} /> 驳回
                  </Button>
                </>
              )}
              {data.status === 'approved' && (
                <Button size="sm" onClick={handleCreateDraft}>
                  派生发布草案
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 阻断提示 */}
      {error && (
        <Alert variant="destructive" className="mb-3">
          <AlertTriangle size={13} />
          <AlertTitle className="text-xs font-medium">门槛检查未通过</AlertTitle>
          <AlertDescription className="text-xs">
            {blockers ? blockers.map((b, i) => (
              <div key={i} className="ml-1 mb-1">
                <span className="font-medium">{b.q}</span>：{b.reasons.join('、')}
              </div>
            )) : error}
          </AlertDescription>
        </Alert>
      )}

      {/* 助手专项校验卡 */}
      <AssistantValidationCard candidates={data.candidates} />

      {/* 候选列表 */}
      <Card>
        <CardHeader className="py-2 px-3">
          <CardTitle className="text-xs">包内候选</CardTitle>
        </CardHeader>
        <Table className="text-xs">
          <TableHeader>
            <TableRow>
              <TableHead>标准问句</TableHead>
              <TableHead className="text-center">证据</TableHead>
              <TableHead className="text-center">冲突</TableHead>
              <TableHead className="text-center">归属</TableHead>
              <TableHead>状态</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.candidates.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">评审包内无候选</TableCell></TableRow>
            ) : data.candidates.map(c => (
              <TableRow key={c.id} className="cursor-pointer" onClick={() => navigate({ view: 'candidate-detail', id: c.id })}>
                <TableCell className="text-primary">{c.normalized_q}</TableCell>
                <TableCell className="text-center"><span className={`inline-block w-2 h-2 rounded-full ${GATE_DOT[c.gate_evidence]}`} /></TableCell>
                <TableCell className="text-center"><span className={`inline-block w-2 h-2 rounded-full ${GATE_DOT[c.gate_conflict]}`} /></TableCell>
                <TableCell className="text-center"><span className={`inline-block w-2 h-2 rounded-full ${GATE_DOT[c.gate_ownership]}`} /></TableCell>
                <TableCell className="text-muted-foreground">{c.status}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

interface CandidateForValidation {
  id: string;
  normalized_q: string;
  structured_json?: string | null;
  risk_level?: string | null;
}

function AssistantValidationCard({ candidates }: { candidates: CandidateForValidation[] }) {
  const checks = useMemo(() => {
    return candidates.map(c => {
      const s = (() => { try { return JSON.parse(c.structured_json ?? '{}'); } catch { return {}; } })();
      const results = [
        { label: '坐席答案', pass: !!s.agent_answer },
        { label: '引用来源', pass: Array.isArray(s.citations) && s.citations.length > 0 || Array.isArray(s.sources) && s.sources.length > 0 },
        { label: '区分坐席/客户回复', pass: Array.isArray(s.reply_options) && s.reply_options.length > 0 },
        { label: '降级策略', pass: !!s.fallback_policy },
        { label: '禁用术语(高风险)', pass: c.risk_level !== 'high' || (Array.isArray(s.forbidden_terms) && s.forbidden_terms.length > 0) },
      ];
      return { q: c.normalized_q, results, allPass: results.every(r => r.pass) };
    });
  }, [candidates]);

  if (candidates.length === 0) return null;

  const totalPass = checks.filter(c => c.allPass).length;

  return (
    <Card className="mb-3">
      <CardHeader className="py-2 px-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs flex items-center gap-1.5">
            <ShieldCheck size={12} />
            助手专项校验
          </CardTitle>
          <Badge variant={totalPass === checks.length ? 'default' : 'secondary'} className="text-[10px]">
            {totalPass}/{checks.length} 通过
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="divide-y">
          {checks.map((c, i) => (
            <div key={i} className="py-2">
              <div className="flex items-center gap-2 mb-1">
                {c.allPass
                  ? <CheckCircle size={12} className="text-primary" />
                  : <AlertTriangle size={12} className="text-amber-500" />
                }
                <span className="text-xs font-medium">{c.q}</span>
              </div>
              <div className="flex gap-3 ml-5">
                {c.results.map((r, j) => (
                  <span key={j} className={`text-[10px] ${r.pass ? 'text-muted-foreground' : 'text-amber-600 font-medium'}`}>
                    {r.pass ? '\u2713' : '\u2717'} {r.label}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
