import { useState, useEffect } from 'react';
import { ArrowLeft, BarChart3 } from 'lucide-react';
import { kmApi, type KMAsset, type KMAssetVersion } from './api';
import type { KMPage } from './KnowledgeManagementPage';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

interface AssetMetrics {
  total_shown: number; total_used: number; total_edited: number; total_dismissed: number;
  adopt_rate: number; edit_rate: number; dismiss_rate: number;
}

export function AssetDetailPage({ id, navigate }: { id: string; navigate: (p: KMPage) => void }) {
  const [asset, setAsset] = useState<KMAsset | null>(null);
  const [versions, setVersions] = useState<KMAssetVersion[]>([]);
  const [metrics, setMetrics] = useState<AssetMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      kmApi.getAsset(id),
      kmApi.getAssetVersions(id),
      fetch(`/api/km/assets/${id}/metrics`).then(r => r.json()).catch(() => null),
    ])
      .then(([a, v, m]) => { setAsset(a); setVersions(v.items); setMetrics(m); })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="p-4 text-xs text-muted-foreground">加载中...</div>;
  if (!asset) return <div className="p-4 text-xs text-destructive">资产不存在</div>;

  return (
    <div className="p-4">
      <Button variant="ghost" size="sm" onClick={() => navigate({ view: 'assets' })} className="mb-3">
        <ArrowLeft size={12} /> 返回列表
      </Button>

      <Card className="mb-3">
        <CardContent className="pt-4">
          <h2 className="text-sm font-semibold mb-2">{asset.title}</h2>
          <div className="flex gap-4 text-xs text-muted-foreground flex-wrap">
            <span>类型: {asset.asset_type}</span>
            <span>状态: {asset.status}</span>
            <span>当前版本: v{asset.current_version}</span>
            <span>负责人: {asset.owner ?? '-'}</span>
            <span>策略: <Badge variant="outline" className="text-[10px] ml-1">{(asset as Record<string, unknown>).rollout_strategy as string ?? 'online'}</Badge></span>
          </div>
          {(() => {
            const modes: string[] = (() => { try { return JSON.parse((asset as Record<string, unknown>).service_modes as string ?? '[]'); } catch { return []; } })();
            const modeLabels: Record<string, string> = { auto_recommend: '自动推荐', kb_answer: '知识问答', action_suggest: '动作建议' };
            return modes.length > 0 ? (
              <div className="flex gap-1.5 mt-2">
                <span className="text-[10px] text-muted-foreground">服务模式:</span>
                {modes.map(m => <Badge key={m} variant="secondary" className="text-[10px]">{modeLabels[m] ?? m}</Badge>)}
              </div>
            ) : null;
          })()}
          <Alert className="mt-2">
            <AlertTriangle size={13} />
            <AlertTitle className="text-xs font-medium">操作须知</AlertTitle>
            <AlertDescription className="text-xs">
              任何对资产的操作（发布/回滚/下架/降权/改范围）必须通过动作草案执行，不允许直接操作。
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Metrics card */}
      {metrics && (
        <div className="grid grid-cols-4 gap-3 mb-3">
          {[
            { label: '展示次数', value: metrics.total_shown },
            { label: '采纳率', value: `${(metrics.adopt_rate * 100).toFixed(1)}%` },
            { label: '编辑采纳率', value: `${(metrics.edit_rate * 100).toFixed(1)}%` },
            { label: '忽略率', value: `${(metrics.dismiss_rate * 100).toFixed(1)}%` },
          ].map(m => (
            <Card key={m.label}>
              <CardContent className="pt-3 pb-2 text-center">
                <p className="text-[10px] text-muted-foreground mb-0.5">{m.label}</p>
                <p className="text-lg font-bold">{m.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader className="py-2 px-3">
          <CardTitle className="text-xs">版本链</CardTitle>
        </CardHeader>
        <Table className="text-xs">
          <TableHeader>
            <TableRow>
              <TableHead>版本</TableHead>
              <TableHead>生效时间</TableHead>
              <TableHead>回滚点</TableHead>
              <TableHead>内容摘要</TableHead>
              <TableHead>创建时间</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {versions.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">暂无版本</TableCell></TableRow>
            ) : versions.map(v => (
              <TableRow key={v.id}>
                <TableCell className="font-mono">v{v.version_no}</TableCell>
                <TableCell className="text-muted-foreground">{v.effective_from ?? '-'}</TableCell>
                <TableCell className="text-muted-foreground font-mono text-[10px]">{v.rollback_point_id ?? '-'}</TableCell>
                <TableCell className="text-muted-foreground truncate max-w-[200px]">{v.content_snapshot ? JSON.parse(v.content_snapshot).q ?? '-' : '-'}</TableCell>
                <TableCell className="text-muted-foreground">{v.created_at?.slice(0, 16).replace('T', ' ')}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
