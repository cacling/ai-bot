import { useState, useEffect } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { kmApi, type KMCandidate } from './api';
import type { KMPage } from './KnowledgeManagementPage';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

const GATE_DOT: Record<string, string> = { pass: 'bg-primary', fail: 'bg-destructive', pending: 'bg-muted-foreground' };
const STATUS_LABELS: Record<string, string> = {
  draft: '草稿', validating: '校验中', gate_pass: '门槛通过',
  in_review: '评审中', published: '已发布', rejected: '已驳回',
};

const riskVariant = (r: string): 'destructive' | 'outline' | 'secondary' =>
  r === 'high' ? 'destructive' : r === 'medium' ? 'outline' : 'secondary';

const KNOWLEDGE_TYPE_LABELS: Record<string, string> = {
  reply: '回复', rag_answer: 'RAG', action: '动作', risk: '风险', followup: '追问',
};

export function CandidateListPage({ navigate }: { navigate: (p: KMPage) => void }) {
  const [items, setItems] = useState<KMCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ normalized_q: '', draft_answer: '', variants: '', source_type: 'manual' });

  const splitLines = (s: string) => s.split(/\n+/).map(t => t.trim()).filter(Boolean);

  const load = () => {
    setLoading(true);
    kmApi.listCandidates().then(r => setItems(r.items)).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const handleCreate = async () => {
    if (!form.normalized_q.trim()) return;
    await kmApi.createCandidate({
      normalized_q: form.normalized_q,
      draft_answer: form.draft_answer,
      source_type: form.source_type,
      variants_json: JSON.stringify(splitLines(form.variants)),
    });
    setShowCreate(false);
    setForm({ normalized_q: '', draft_answer: '', variants: '', source_type: 'manual' });
    load();
  };

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold">助手知识</h2>
        <div className="flex gap-2">
          <Button variant="ghost" size="icon-sm" onClick={load}><RefreshCw size={14} /></Button>
          <Button size="sm" onClick={() => setShowCreate(true)}><Plus size={12} /> 新建候选</Button>
        </div>
      </div>

      {showCreate && (
        <Card className="mb-3"><CardContent className="p-3 space-y-2">
          <Input value={form.normalized_q} onChange={e => setForm(f => ({ ...f, normalized_q: e.target.value }))}
            placeholder="标准问句" className="text-xs" />
          <Textarea value={form.variants} onChange={e => setForm(f => ({ ...f, variants: e.target.value }))}
            placeholder={'扩展问（每行一条，可选）\n用户没怎么用怎么流量就没了？'} rows={3} className="text-xs" />
          <Textarea value={form.draft_answer} onChange={e => setForm(f => ({ ...f, draft_answer: e.target.value }))}
            placeholder="草案答案" rows={3} className="text-xs" />
          <div className="flex gap-2">
            <Button size="sm" onClick={handleCreate}>创建</Button>
            <Button variant="outline" size="sm" onClick={() => setShowCreate(false)}>取消</Button>
          </div>
        </CardContent></Card>
      )}

      <div className="rounded-lg border overflow-hidden">
        <Table className="text-xs">
          <TableHeader>
            <TableRow>
              <TableHead>标准问句</TableHead>
              <TableHead>类型</TableHead>
              <TableHead>来源</TableHead>
              <TableHead className="text-center">门槛</TableHead>
              <TableHead>风险</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>更新时间</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">加载中...</TableCell></TableRow>
            ) : items.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">暂无知识</TableCell></TableRow>
            ) : items.map(c => {
              const kt = (() => { try { return JSON.parse(c.structured_json ?? '{}').knowledge_type; } catch { return null; } })();
              return (
              <TableRow key={c.id} className="cursor-pointer" onClick={() => navigate({ view: 'candidate-detail', id: c.id })}>
                <TableCell className="text-primary font-medium truncate max-w-[250px]">{c.normalized_q}</TableCell>
                <TableCell>{kt ? <Badge variant="outline" className="text-[10px]">{KNOWLEDGE_TYPE_LABELS[kt] ?? kt}</Badge> : '-'}</TableCell>
                <TableCell className="text-muted-foreground">{c.source_type}</TableCell>
                <TableCell>
                  <div className="flex items-center justify-center gap-1" title={`证据:${c.gate_evidence} 冲突:${c.gate_conflict} 归属:${c.gate_ownership}`}>
                    <span className={`w-2 h-2 rounded-full ${GATE_DOT[c.gate_evidence]}`} />
                    <span className={`w-2 h-2 rounded-full ${GATE_DOT[c.gate_conflict]}`} />
                    <span className={`w-2 h-2 rounded-full ${GATE_DOT[c.gate_ownership]}`} />
                  </div>
                </TableCell>
                <TableCell><Badge variant={riskVariant(c.risk_level)}>{c.risk_level}</Badge></TableCell>
                <TableCell className="text-muted-foreground">{STATUS_LABELS[c.status] ?? c.status}</TableCell>
                <TableCell className="text-muted-foreground">{c.updated_at?.slice(0, 16).replace('T', ' ')}</TableCell>
              </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
