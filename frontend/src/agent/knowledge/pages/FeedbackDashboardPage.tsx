/**
 * FeedbackDashboardPage.tsx — Feedback overview, detail list, and knowledge gap detection
 */
import { memo, useState, useEffect, useCallback } from 'react';
import { BarChart3, RefreshCw, PlusCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { type KMPage } from './KnowledgeManagementPage';

const BASE = '/api/km';

interface Overview {
  total_shown: number;
  total_used: number;
  total_dismissed: number;
  total_not_helpful: number;
  adopt_rate: number;
  dismiss_rate: number;
  not_helpful_rate: number;
}

interface FeedbackDetail {
  id: string;
  event_type: string;
  feedback_scope: string;
  question_text: string;
  answer_text: string;
  reason_code: string;
  asset_version_id: string;
  phone: string;
  created_at: string;
}

interface KnowledgeGap {
  id: string;
  question_text: string;
  count: number;
  last_seen: string;
  feedback_scope: string;
}

export const FeedbackDashboardPage = memo(function FeedbackDashboardPage({ navigate }: { navigate: (p: KMPage) => void }) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [details, setDetails] = useState<FeedbackDetail[]>([]);
  const [gaps, setGaps] = useState<KnowledgeGap[]>([]);
  const [scopeFilter, setScopeFilter] = useState<string>('all');
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [ovRes, detRes, gapRes] = await Promise.all([
        fetch(`${BASE}/feedback-dashboard/overview`),
        fetch(`${BASE}/feedback-dashboard/details${scopeFilter !== 'all' ? `?feedback_scope=${scopeFilter}` : ''}`),
        fetch(`${BASE}/feedback-dashboard/gaps`),
      ]);
      const [ovData, detData, gapData] = await Promise.all([ovRes.json(), detRes.json(), gapRes.json()]);
      setOverview(ovData);
      setDetails(detData.items ?? []);
      setGaps(gapData.items ?? []);
    } catch { /* ignore */ }
    setLoading(false);
  }, [scopeFilter]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleCreateCandidate = useCallback(async (gap: KnowledgeGap) => {
    try {
      const res = await fetch(`${BASE}/feedback-dashboard/gaps/create-candidate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question_text: gap.question_text }),
      });
      const data = await res.json();
      if (data.id) {
        navigate({ view: 'candidate-detail', id: data.id });
      }
    } catch { /* ignore */ }
  }, [navigate]);

  const handleCreateTask = useCallback(async (gap: KnowledgeGap) => {
    try {
      await fetch(`${BASE}/feedback-dashboard/gaps/create-task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question_text: gap.question_text }),
      });
      loadData();
    } catch { /* ignore */ }
  }, [loadData]);

  const eventLabel: Record<string, string> = {
    shown: '展示', use: '采纳', copy: '复制', edit: '编辑后采纳',
    dismiss: '忽略', adopt_direct: '直接采纳', adopt_with_edit: '编辑采纳',
    helpful: '有帮助', not_helpful: '无帮助',
  };

  const scopeLabel: Record<string, string> = {
    reply_hint: '回复提示', kb_answer: '知识问答', action_suggest: '动作建议',
  };

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      {/* Overview metrics */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: '总推荐次数', value: overview?.total_shown ?? '-', color: 'text-foreground' },
          { label: '采纳率', value: overview ? `${(overview.adopt_rate * 100).toFixed(1)}%` : '-', color: 'text-green-600' },
          { label: '无帮助率', value: overview ? `${(overview.not_helpful_rate * 100).toFixed(1)}%` : '-', color: 'text-amber-600' },
          { label: '忽略率', value: overview ? `${(overview.dismiss_rate * 100).toFixed(1)}%` : '-', color: 'text-red-500' },
        ].map(m => (
          <Card key={m.label}>
            <CardContent className="pt-4 pb-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">{m.label}</p>
              <p className={`text-2xl font-bold ${m.color}`}>{m.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Feedback detail */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <BarChart3 size={14} />
              反馈明细
            </CardTitle>
            <div className="flex items-center gap-2">
              <Select value={scopeFilter} onValueChange={setScopeFilter}>
                <SelectTrigger className="w-32 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部</SelectItem>
                  <SelectItem value="reply_hint">回复提示</SelectItem>
                  <SelectItem value="kb_answer">知识问答</SelectItem>
                  <SelectItem value="action_suggest">动作建议</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="ghost" size="sm" onClick={loadData} disabled={loading}>
                <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {details.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">暂无反馈记录</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-32">时间</TableHead>
                  <TableHead className="w-24">类型</TableHead>
                  <TableHead className="w-24">范围</TableHead>
                  <TableHead>坐席提问</TableHead>
                  <TableHead className="w-24">反馈</TableHead>
                  <TableHead className="w-24">原因</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {details.slice(0, 50).map(d => (
                  <TableRow key={d.id}>
                    <TableCell className="text-xs text-muted-foreground">{d.created_at?.slice(0, 16).replace('T', ' ')}</TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px]">{scopeLabel[d.feedback_scope] ?? d.feedback_scope}</Badge></TableCell>
                    <TableCell><Badge variant="secondary" className="text-[10px]">{eventLabel[d.event_type] ?? d.event_type}</Badge></TableCell>
                    <TableCell className="text-xs max-w-xs truncate">{d.question_text || '-'}</TableCell>
                    <TableCell className="text-xs">{eventLabel[d.event_type] ?? d.event_type}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{d.reason_code || '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Knowledge gaps */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">知识缺口</CardTitle>
        </CardHeader>
        <CardContent>
          {gaps.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">暂无知识缺口</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>问题文本</TableHead>
                  <TableHead className="w-20">出现次数</TableHead>
                  <TableHead className="w-32">最近时间</TableHead>
                  <TableHead className="w-48">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {gaps.map(g => (
                  <TableRow key={g.id}>
                    <TableCell className="text-xs font-medium">{g.question_text}</TableCell>
                    <TableCell><Badge variant="destructive">{g.count}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{g.last_seen?.slice(0, 10)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => handleCreateCandidate(g)}>
                          <PlusCircle size={11} className="mr-1" />
                          创建知识候选
                        </Button>
                        <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => handleCreateTask(g)}>
                          创建治理任务
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
});
