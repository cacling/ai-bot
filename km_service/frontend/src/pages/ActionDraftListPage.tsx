import { useState, useEffect } from 'react';
import { RefreshCw, Play } from 'lucide-react';
import { kmApi, type KMActionDraft } from './api';
import type { KMPage } from './KnowledgeManagementPage';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

const STATUS_LABELS: Record<string, string> = {
  draft: '草稿', submitted: '已提交', reviewed: '已复核',
  executing: '执行中', done: '已完成', failed: '失败',
};
const TYPE_LABELS: Record<string, string> = {
  publish: '发布', rollback: '回滚', rescope: '改范围',
  unpublish: '下架', downgrade: '降权', renew: '续期',
};

const statusVariant = (s: string): 'secondary' | 'destructive' | 'outline' =>
  s === 'done' ? 'secondary' : s === 'failed' ? 'destructive' : 'outline';

export function ActionDraftListPage({ navigate }: { navigate: (p: KMPage) => void }) {
  const [items, setItems] = useState<KMActionDraft[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    kmApi.listActionDrafts().then(r => setItems(r.items)).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const handleExecute = async (id: string) => {
    if (!confirm('确认执行该草案？')) return;
    try {
      await kmApi.executeActionDraft(id, { executed_by: 'admin' });
      load();
    } catch (err) {
      alert((err as Error).message);
    }
  };

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold">动作草案</h2>
        <Button variant="ghost" size="icon-sm" onClick={load}><RefreshCw size={14} /></Button>
      </div>

      <div className="rounded-lg border overflow-hidden">
        <Table className="text-xs">
          <TableHeader>
            <TableRow>
              <TableHead>类型</TableHead>
              <TableHead>变更摘要</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>回归</TableHead>
              <TableHead>更新时间</TableHead>
              <TableHead>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">加载中...</TableCell></TableRow>
            ) : items.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">暂无草案</TableCell></TableRow>
            ) : items.map(d => (
              <TableRow key={d.id}>
                <TableCell>{TYPE_LABELS[d.action_type] ?? d.action_type}</TableCell>
                <TableCell className="text-muted-foreground truncate max-w-[200px]">{d.change_summary ?? '-'}</TableCell>
                <TableCell><Badge variant={statusVariant(d.status)}>{STATUS_LABELS[d.status] ?? d.status}</Badge></TableCell>
                <TableCell className="text-muted-foreground font-mono text-[10px]">{d.regression_window_id ? '已绑定' : '-'}</TableCell>
                <TableCell className="text-muted-foreground">{d.updated_at?.slice(0, 16).replace('T', ' ')}</TableCell>
                <TableCell>
                  {(d.status === 'draft' || d.status === 'reviewed') && (
                    <Button variant="ghost" size="xs" onClick={() => handleExecute(d.id)}>
                      <Play size={11} /> 执行
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
