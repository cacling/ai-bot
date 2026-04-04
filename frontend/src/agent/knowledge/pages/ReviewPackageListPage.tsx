import { useState, useEffect } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { kmApi, type KMReviewPackage } from './api';
import type { KMPage } from './KnowledgeManagementPage';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

const STATUS_LABELS: Record<string, string> = {
  draft: '草稿', submitted: '已提交', reviewing: '评审中',
  approved: '已通过', rejected: '已驳回', published: '已发布',
};

const statusVariant = (s: string): 'secondary' | 'destructive' | 'outline' =>
  s === 'published' ? 'secondary' : s === 'rejected' ? 'destructive' : 'outline';

export function ReviewPackageListPage({ navigate }: { navigate: (p: KMPage) => void }) {
  const [items, setItems] = useState<KMReviewPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: '', candidate_ids: '' });

  const load = () => {
    setLoading(true);
    kmApi.listReviewPackages().then(r => setItems(r.items)).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const handleCreate = async () => {
    if (!form.title.trim()) return;
    const ids = form.candidate_ids.split(',').map(s => s.trim()).filter(Boolean);
    await kmApi.createReviewPackage({ title: form.title, candidate_ids: ids });
    setShowCreate(false);
    setForm({ title: '', candidate_ids: '' });
    load();
  };

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold">评审包</h2>
        <div className="flex gap-2">
          <Button variant="ghost" size="icon-sm" onClick={load}><RefreshCw size={14} /></Button>
          <Button size="sm" onClick={() => setShowCreate(true)}><Plus size={12} /> 新建评审包</Button>
        </div>
      </div>

      {showCreate && (
        <Card className="mb-3"><CardContent className="p-3 space-y-2">
          <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder="评审包标题" className="text-xs" />
          <Input value={form.candidate_ids} onChange={e => setForm(f => ({ ...f, candidate_ids: e.target.value }))}
            placeholder="候选 ID（逗号分隔）" className="text-xs" />
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
              <TableHead>标题</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>风险</TableHead>
              <TableHead>提交人</TableHead>
              <TableHead>更新时间</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">加载中...</TableCell></TableRow>
            ) : items.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">暂无评审包</TableCell></TableRow>
            ) : items.map(pkg => (
              <TableRow key={pkg.id} className="cursor-pointer" onClick={() => navigate({ view: 'review-detail', id: pkg.id })}>
                <TableCell className="text-primary font-medium">{pkg.title}</TableCell>
                <TableCell><Badge variant={statusVariant(pkg.status)}>{STATUS_LABELS[pkg.status] ?? pkg.status}</Badge></TableCell>
                <TableCell className="text-muted-foreground">{pkg.risk_level}</TableCell>
                <TableCell className="text-muted-foreground">{pkg.submitted_by ?? '-'}</TableCell>
                <TableCell className="text-muted-foreground">{pkg.updated_at?.slice(0, 16).replace('T', ' ')}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
