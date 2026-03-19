import { useState, useEffect } from 'react';
import { RefreshCw, CheckCircle } from 'lucide-react';
import { kmApi, type KMTask } from './api';
import type { KMPage } from './KnowledgeManagementPage';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

const TYPE_LABELS: Record<string, string> = {
  review_expiry: '到期复核', content_gap: '内容补齐', conflict_arb: '冲突仲裁',
  failure_fix: '失败修复', regression_fail: '回归失败', evidence_gap: '证据补齐',
};
const STATUS_LABELS: Record<string, string> = {
  open: '待处理', in_progress: '处理中', done: '已完成', closed: '已关闭',
};

const priorityVariant = (p: string): 'destructive' | 'outline' | 'secondary' =>
  p === 'urgent' ? 'destructive' : p === 'high' ? 'outline' : 'secondary';

export function TaskListPage({ navigate }: { navigate: (p: KMPage) => void }) {
  const [items, setItems] = useState<KMTask[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    kmApi.listTasks().then(r => setItems(r.items)).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const handleClose = async (id: string) => {
    const conclusion = prompt('请输入处置结论:');
    if (!conclusion) return;
    await kmApi.updateTask(id, { status: 'done', conclusion });
    load();
  };

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold">治理任务</h2>
        <Button variant="ghost" size="icon-sm" onClick={load}><RefreshCw size={14} /></Button>
      </div>

      <div className="rounded-lg border overflow-hidden">
        <Table className="text-xs">
          <TableHeader>
            <TableRow>
              <TableHead>类型</TableHead>
              <TableHead>来源</TableHead>
              <TableHead>优先级</TableHead>
              <TableHead>负责人</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>时限</TableHead>
              <TableHead>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">加载中...</TableCell></TableRow>
            ) : items.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">暂无任务</TableCell></TableRow>
            ) : items.map(t => (
              <TableRow key={t.id}>
                <TableCell>{TYPE_LABELS[t.task_type] ?? t.task_type}</TableCell>
                <TableCell className="text-muted-foreground font-mono text-[10px]">{t.source_ref_id?.slice(0, 8) ?? '-'}</TableCell>
                <TableCell><Badge variant={priorityVariant(t.priority)}>{t.priority}</Badge></TableCell>
                <TableCell className="text-muted-foreground">{t.assignee ?? '-'}</TableCell>
                <TableCell className="text-muted-foreground">{STATUS_LABELS[t.status] ?? t.status}</TableCell>
                <TableCell className="text-muted-foreground">{t.due_date ?? '-'}</TableCell>
                <TableCell>
                  {(t.status === 'open' || t.status === 'in_progress') && (
                    <Button variant="ghost" size="xs" onClick={() => handleClose(t.id)}>
                      <CheckCircle size={11} /> 完成
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
