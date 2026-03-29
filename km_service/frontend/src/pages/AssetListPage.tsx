import { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { kmApi, type KMAsset } from './api';
import type { KMPage } from './KnowledgeManagementPage';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

const STATUS_LABELS: Record<string, string> = {
  online: '在线', canary: '灰度', downgraded: '降权', unpublished: '已下架',
};

const statusVariant = (s: string): 'secondary' | 'destructive' | 'outline' =>
  s === 'online' ? 'secondary' : s === 'unpublished' ? 'destructive' : 'outline';

export function AssetListPage({ navigate }: { navigate: (p: KMPage) => void }) {
  const [items, setItems] = useState<KMAsset[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    kmApi.listAssets().then(r => setItems(r.items)).finally(() => setLoading(false));
  };
  useEffect(load, []);

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold">在线资产</h2>
        <Button variant="ghost" size="icon-sm" onClick={load}><RefreshCw size={14} /></Button>
      </div>

      <div className="rounded-lg border overflow-hidden">
        <Table className="text-xs">
          <TableHeader>
            <TableRow>
              <TableHead>标题</TableHead>
              <TableHead>类型</TableHead>
              <TableHead>服务模式</TableHead>
              <TableHead>策略</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>版本</TableHead>
              <TableHead>负责人</TableHead>
              <TableHead>更新时间</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">加载中...</TableCell></TableRow>
            ) : items.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">暂无资产</TableCell></TableRow>
            ) : items.map(a => {
              const modes: string[] = (() => { try { return JSON.parse((a as Record<string, unknown>).service_modes as string ?? '[]'); } catch { return []; } })();
              const modeLabels: Record<string, string> = { auto_recommend: '推荐', kb_answer: '问答', action_suggest: '动作' };
              const strategy = (a as Record<string, unknown>).rollout_strategy as string ?? 'online';
              const strategyLabels: Record<string, string> = { online: '在线', canary: '灰度', downgraded: '降权' };
              return (
              <TableRow key={a.id} className="cursor-pointer" onClick={() => navigate({ view: 'asset-detail', id: a.id })}>
                <TableCell className="text-primary font-medium">{a.title}</TableCell>
                <TableCell className="text-muted-foreground">{a.asset_type}</TableCell>
                <TableCell>
                  <div className="flex gap-1 flex-wrap">
                    {modes.map(m => <Badge key={m} variant="outline" className="text-[10px]">{modeLabels[m] ?? m}</Badge>)}
                    {modes.length === 0 && <span className="text-muted-foreground">-</span>}
                  </div>
                </TableCell>
                <TableCell><Badge variant={strategy === 'online' ? 'secondary' : 'outline'} className="text-[10px]">{strategyLabels[strategy] ?? strategy}</Badge></TableCell>
                <TableCell><Badge variant={statusVariant(a.status)}>{STATUS_LABELS[a.status] ?? a.status}</Badge></TableCell>
                <TableCell className="font-mono">v{a.current_version}</TableCell>
                <TableCell className="text-muted-foreground">{a.owner ?? '-'}</TableCell>
                <TableCell className="text-muted-foreground">{a.updated_at?.slice(0, 16).replace('T', ' ')}</TableCell>
              </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
