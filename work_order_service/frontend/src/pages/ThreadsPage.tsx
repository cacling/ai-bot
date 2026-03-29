/**
 * ThreadsPage.tsx — Issue threads list + preview dual-pane.
 * URL searchParams: ?selected=thread_123
 */
import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { T, type Lang } from '../shared/i18n';
import { type IssueThread } from './types';
import { listIssueThreads, getIssueThread } from './api';
import { WorkOrderPreviewPane, type PreviewData } from '../components/WorkOrderPreviewPane';

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  open: 'default',
  resolved: 'outline',
  closed: 'outline',
};

export function ThreadsPage({ lang = 'zh' }: { lang?: Lang }) {
  const t = T[lang];
  const [searchParams, setSearchParams] = useSearchParams();

  const selectedId = searchParams.get('selected') ?? '';

  const [items, setItems] = useState<IssueThread[]>([]);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listIssueThreads();
      setItems(data);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchList(); }, [fetchList]);

  useEffect(() => {
    if (!selectedId) { setPreview(null); return; }
    let cancelled = false;
    setPreviewLoading(true);
    getIssueThread(selectedId)
      .then(data => { if (!cancelled) setPreview({ kind: 'issue-thread', data }); })
      .catch(() => { if (!cancelled) setPreview(null); })
      .finally(() => { if (!cancelled) setPreviewLoading(false); });
    return () => { cancelled = true; };
  }, [selectedId]);

  const handleSelect = (id: string) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (id === selectedId) next.delete('selected');
      else next.set('selected', id);
      return next;
    }, { replace: true });
  };

  return (
    <div className="h-full p-4 overflow-hidden">
      <div className="h-full flex flex-col gap-4">
        <ResizablePanelGroup orientation="horizontal" className="flex-1 border rounded-lg overflow-hidden" id="wo-threads">
          <ResizablePanel id="wo-threads-list" defaultSize="60%" minSize="30%">
            <div className="h-full overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px]">ID</TableHead>
                    <TableHead>{t.wo_col_title}</TableHead>
                    <TableHead className="w-[100px]">{t.wo_filter_status}</TableHead>
                    <TableHead className="w-[160px]">{t.wo_col_updated}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                        {t.wo_loading}
                      </TableCell>
                    </TableRow>
                  ) : items.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                        {t.wo_empty}
                      </TableCell>
                    </TableRow>
                  ) : (
                    items.map(item => (
                      <TableRow
                        key={item.id}
                        className={`cursor-pointer hover:bg-muted/50 ${selectedId === item.id ? 'bg-primary/5' : ''}`}
                        onClick={() => handleSelect(item.id)}
                      >
                        <TableCell className="font-mono text-xs">{item.id}</TableCell>
                        <TableCell>{item.canonicalSubject ?? '-'}</TableCell>
                        <TableCell>
                          <Badge variant={STATUS_VARIANT[item.status] ?? 'default'}>{item.status}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{item.updatedAt}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </ResizablePanel>

          <ResizableHandle />

          <ResizablePanel id="wo-threads-preview" defaultSize="40%" minSize="25%">
            <WorkOrderPreviewPane lang={lang} detail={preview} loading={previewLoading} />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
