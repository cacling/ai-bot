import { useState, useEffect } from 'react';
import { ArrowLeft, Play, FileCode2, Eye, Columns2, Link2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { kmApi, type KMDocumentDetail, type KMDocVersionContent } from './api';
import type { KMPage } from './KnowledgeManagementPage';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';

const statusVariant = (s: string): 'secondary' | 'destructive' | 'outline' =>
  s === 'parsed' ? 'secondary'
  : s === 'failed' ? 'destructive'
  : 'outline';

type ViewMode = 'source' | 'preview' | 'split';

export function DocumentDetailPage({ id, navigate }: { id: string; navigate: (p: KMPage) => void }) {
  const [doc, setDoc] = useState<KMDocumentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedVersionId, setSelectedVersionId] = useState<string>('');
  const [content, setContent] = useState<KMDocVersionContent | null>(null);
  const [contentLoading, setContentLoading] = useState(false);
  const [contentError, setContentError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('split');

  const load = () => {
    setLoading(true);
    kmApi.getDocument(id).then((result) => {
      setDoc(result);
      setSelectedVersionId((current) => {
        if (current && result.versions.some((version) => version.id === current)) return current;
        return result.versions[0]?.id ?? '';
      });
    }).finally(() => setLoading(false));
  };
  useEffect(load, [id]);

  useEffect(() => {
    if (!selectedVersionId) {
      setContent(null);
      setContentError(null);
      return;
    }

    setContentLoading(true);
    setContentError(null);
    kmApi.getDocumentVersionContent(selectedVersionId)
      .then(setContent)
      .catch((error: Error) => {
        setContent(null);
        setContentError(error.message);
      })
      .finally(() => setContentLoading(false));
  }, [selectedVersionId]);

  const handleParse = async (vid: string) => {
    await kmApi.triggerParse(vid);
    load();
  };

  if (loading) return <div className="p-4 text-xs text-muted-foreground">加载中...</div>;
  if (!doc) return <div className="p-4 text-xs text-destructive">文档不存在</div>;

  const selectedVersion = doc.versions.find((version) => version.id === selectedVersionId) ?? doc.versions[0] ?? null;

  return (
    <div className="p-4 space-y-3">
      <Button variant="ghost" size="sm" onClick={() => navigate({ view: 'documents' })}>
        <ArrowLeft size={12} /> 返回列表
      </Button>

      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold mb-2">{doc.title}</h2>
              <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                <span>来源: {doc.source}</span>
                <span>密级: {doc.classification}</span>
                <span>负责人: {doc.owner ?? '-'}</span>
                <span>状态: {doc.status}</span>
                <span>版本数: {doc.versions.length}</span>
                <span>关联候选: {doc.linked_candidates.length}</span>
              </div>
            </div>
            {selectedVersion && (
              <div className="text-right text-xs text-muted-foreground space-y-1">
                <div>当前查看: v{selectedVersion.version_no}</div>
                <div>文件: {selectedVersion.file_path ?? '-'}</div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 xl:grid-cols-[380px_minmax(0,1fr)]">
        <div className="space-y-3">
          <Card>
            <CardHeader className="py-2 px-3">
              <CardTitle className="text-xs">版本列表</CardTitle>
            </CardHeader>
            <Table className="text-xs">
              <TableHeader>
                <TableRow>
                  <TableHead>版本号</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>差异摘要</TableHead>
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {doc.versions.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">暂无版本</TableCell></TableRow>
                ) : doc.versions.map((version) => (
                  <TableRow
                    key={version.id}
                    className={selectedVersionId === version.id ? 'bg-accent/50' : 'cursor-pointer'}
                    onClick={() => setSelectedVersionId(version.id)}
                  >
                    <TableCell className="font-mono">v{version.version_no}</TableCell>
                    <TableCell><Badge variant={statusVariant(version.status)}>{version.status}</Badge></TableCell>
                    <TableCell className="text-muted-foreground truncate max-w-[140px]">{version.diff_summary ?? '-'}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleParse(version.id);
                        }}
                      >
                        <Play size={11} /> 触发解析
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          <Card>
            <CardHeader className="py-2 px-3">
              <CardTitle className="text-xs">关联候选</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 px-0">
              {doc.linked_candidates.length === 0 ? (
                <div className="px-3 py-6 text-center text-xs text-muted-foreground">暂无关联候选</div>
              ) : (
                <div className="divide-y">
                  {doc.linked_candidates.map((candidate) => (
                    <button
                      key={candidate.id}
                      type="button"
                      className="w-full px-3 py-3 text-left hover:bg-accent/40 transition-colors"
                      onClick={() => navigate({ view: 'candidate-detail', id: candidate.id })}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="text-xs font-medium">{candidate.normalized_q}</div>
                        <Badge variant="outline" className="shrink-0">{candidate.status}</Badge>
                      </div>
                      <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground">
                        <span>来源: {candidate.source_type}</span>
                        <span>风险: {candidate.risk_level}</span>
                        <span>场景: {candidate.scene_code ?? '-'}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="min-w-0">
          <CardHeader className="py-2 px-3 border-b">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="space-y-1">
                <CardTitle className="text-xs">文档正文</CardTitle>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <Link2 size={11} />
                  <span>{content?.file_path ?? selectedVersion?.file_path ?? '当前版本未关联文件'}</span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button variant={viewMode === 'source' ? 'secondary' : 'ghost'} size="xs" onClick={() => setViewMode('source')}>
                  <FileCode2 size={11} /> 源码
                </Button>
                <Button variant={viewMode === 'preview' ? 'secondary' : 'ghost'} size="xs" onClick={() => setViewMode('preview')}>
                  <Eye size={11} /> 预览
                </Button>
                <Button variant={viewMode === 'split' ? 'secondary' : 'ghost'} size="xs" onClick={() => setViewMode('split')}>
                  <Columns2 size={11} /> 分栏
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {contentLoading ? (
              <div className="p-6 text-xs text-muted-foreground">加载文档内容中...</div>
            ) : contentError ? (
              <div className="p-6 text-xs text-destructive">{contentError}</div>
            ) : !content ? (
              <div className="p-6 text-xs text-muted-foreground">当前版本暂无 Markdown 内容</div>
            ) : (
              <div className={viewMode === 'split' ? 'grid xl:grid-cols-2' : ''}>
                {(viewMode === 'source' || viewMode === 'split') && (
                  <div className="border-r border-border">
                    <div className="px-3 py-2 text-[10px] text-muted-foreground border-b">Markdown 源码</div>
                    <Textarea
                      value={content.content}
                      readOnly
                      spellCheck={false}
                      className="min-h-[640px] resize-none rounded-none border-0 bg-background font-mono text-xs leading-6 shadow-none focus-visible:ring-0"
                    />
                  </div>
                )}
                {(viewMode === 'preview' || viewMode === 'split') && (
                  <div>
                    <div className="px-3 py-2 text-[10px] text-muted-foreground border-b">渲染预览</div>
                    <div className="min-h-[640px] overflow-auto px-6 py-4 prose prose-sm max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content.content}</ReactMarkdown>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
