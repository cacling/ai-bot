import { useState, useEffect } from 'react';
import { ArrowLeft, Play } from 'lucide-react';
import { kmApi, type KMDocument, type KMDocVersion } from './api';
import type { KMPage } from './KnowledgeManagementPage';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

const statusVariant = (s: string): 'secondary' | 'destructive' | 'outline' =>
  s === 'parsed' ? 'secondary' :
  s === 'failed' ? 'destructive' : 'outline';

export function DocumentDetailPage({ id, navigate }: { id: string; navigate: (p: KMPage) => void }) {
  const [doc, setDoc] = useState<(KMDocument & { versions: KMDocVersion[] }) | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    kmApi.getDocument(id).then(setDoc).finally(() => setLoading(false));
  };
  useEffect(load, [id]);

  const handleParse = async (vid: string) => {
    await kmApi.triggerParse(vid);
    load();
  };

  if (loading) return <div className="p-4 text-xs text-muted-foreground">加载中...</div>;
  if (!doc) return <div className="p-4 text-xs text-destructive">文档不存在</div>;

  return (
    <div className="p-4">
      <Button variant="ghost" size="sm" onClick={() => navigate({ view: 'documents' })} className="mb-3">
        <ArrowLeft size={12} /> 返回列表
      </Button>

      <Card className="mb-3">
        <CardContent className="pt-4">
          <h2 className="text-sm font-semibold mb-2">{doc.title}</h2>
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span>来源: {doc.source}</span>
            <span>密级: {doc.classification}</span>
            <span>负责人: {doc.owner ?? '-'}</span>
            <span>状态: {doc.status}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="py-2 px-3">
          <CardTitle className="text-xs">版本列表</CardTitle>
        </CardHeader>
        <Table className="text-xs">
          <TableHeader>
            <TableRow>
              <TableHead>版本号</TableHead>
              <TableHead>生效时间</TableHead>
              <TableHead>到期时间</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>差异摘要</TableHead>
              <TableHead>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {doc.versions.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">暂无版本</TableCell></TableRow>
            ) : doc.versions.map(v => (
              <TableRow key={v.id}>
                <TableCell className="font-mono">v{v.version_no}</TableCell>
                <TableCell className="text-muted-foreground">{v.effective_from ?? '-'}</TableCell>
                <TableCell className="text-muted-foreground">{v.effective_to ?? '-'}</TableCell>
                <TableCell><Badge variant={statusVariant(v.status)}>{v.status}</Badge></TableCell>
                <TableCell className="text-muted-foreground truncate max-w-[200px]">{v.diff_summary ?? '-'}</TableCell>
                <TableCell>
                  <Button variant="ghost" size="xs" onClick={() => handleParse(v.id)}>
                    <Play size={11} /> 触发解析
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
