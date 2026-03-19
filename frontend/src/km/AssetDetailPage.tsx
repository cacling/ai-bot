import { useState, useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { kmApi, type KMAsset, type KMAssetVersion } from './api';
import type { KMPage } from './KnowledgeManagementPage';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

export function AssetDetailPage({ id, navigate }: { id: string; navigate: (p: KMPage) => void }) {
  const [asset, setAsset] = useState<KMAsset | null>(null);
  const [versions, setVersions] = useState<KMAssetVersion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([kmApi.getAsset(id), kmApi.getAssetVersions(id)])
      .then(([a, v]) => { setAsset(a); setVersions(v.items); })
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
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span>类型: {asset.asset_type}</span>
            <span>状态: {asset.status}</span>
            <span>当前版本: v{asset.current_version}</span>
            <span>负责人: {asset.owner ?? '-'}</span>
          </div>
          <Alert className="mt-2">
            <AlertTriangle size={13} />
            <AlertTitle className="text-xs font-medium">操作须知</AlertTitle>
            <AlertDescription className="text-xs">
              任何对资产的操作（发布/回滚/下架/降权/改范围）必须通过动作草案执行，不允许直接操作。
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

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
