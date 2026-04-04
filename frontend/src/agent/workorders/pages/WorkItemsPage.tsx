/**
 * WorkItemsPage.tsx — Work items list + preview dual-pane.
 * URL searchParams: ?keyword=xxx&status=open&selected=wo_123
 */
import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { T, type Lang } from '../i18n';
import { type WorkItem } from './types';
import { listWorkItems, getWorkItem } from './api';
import { WorkOrdersFilterBar } from '../components/WorkOrdersFilterBar';
import { WorkOrderPreviewPane, type PreviewData } from '../components/WorkOrderPreviewPane';

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  new: 'default',
  open: 'default',
  scheduled: 'secondary',
  in_progress: 'secondary',
  waiting_customer: 'secondary',
  resolved: 'outline',
  closed: 'outline',
  cancelled: 'destructive',
};

export function WorkItemsPage({ lang = 'zh' }: { lang?: Lang }) {
  const t = T[lang];
  const [searchParams, setSearchParams] = useSearchParams();

  const keyword = searchParams.get('keyword') ?? '';
  const statusFilter = searchParams.get('status') ?? '';
  const selectedId = searchParams.get('selected') ?? '';

  const [items, setItems] = useState<WorkItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const updateParam = (key: string, value: string) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value);
      else next.delete(key);
      return next;
    }, { replace: true });
  };

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listWorkItems({
        keyword: keyword || undefined,
        status: statusFilter || undefined,
      });
      setItems(data);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [keyword, statusFilter]);

  useEffect(() => { fetchList(); }, [fetchList]);

  useEffect(() => {
    if (!selectedId) { setPreview(null); return; }
    let cancelled = false;
    setPreviewLoading(true);
    getWorkItem(selectedId)
      .then(data => { if (!cancelled) setPreview({ kind: 'work-item', data }); })
      .catch(() => { if (!cancelled) setPreview(null); })
      .finally(() => { if (!cancelled) setPreviewLoading(false); });
    return () => { cancelled = true; };
  }, [selectedId]);

  const handleSelect = (id: string) => updateParam('selected', id === selectedId ? '' : id);
  const handleReset = () => {
    setSearchParams({}, { replace: true });
  };

  return (
    <div className="h-full p-4 overflow-hidden">
      <div className="h-full flex flex-col gap-4">
        <WorkOrdersFilterBar
          lang={lang}
          keyword={keyword}
          onKeywordChange={v => updateParam('keyword', v)}
          statusFilter={statusFilter}
          onStatusChange={v => updateParam('status', v)}
          onReset={handleReset}
        />

        <ResizablePanelGroup orientation="horizontal" className="flex-1 border rounded-lg overflow-hidden" id="wo-items">
          <ResizablePanel id="wo-items-list" defaultSize="60%" minSize="30%">
            <div className="h-full overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px]">{t.wo_col_id}</TableHead>
                    <TableHead>{t.wo_col_title}</TableHead>
                    <TableHead className="w-[120px]">{t.wo_col_phone}</TableHead>
                    <TableHead className="w-[100px]">{t.wo_filter_status}</TableHead>
                    <TableHead className="w-[90px]">{t.wo_col_type}</TableHead>
                    <TableHead className="w-[160px]">{t.wo_col_updated}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        {t.wo_loading}
                      </TableCell>
                    </TableRow>
                  ) : items.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
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
                        <TableCell>{item.title}</TableCell>
                        <TableCell className="font-mono text-xs">{item.customerPhone}</TableCell>
                        <TableCell>
                          <Badge variant={STATUS_VARIANT[item.status] ?? 'default'}>{item.status}</Badge>
                        </TableCell>
                        <TableCell className="text-xs">{item.type}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{item.updatedAt}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </ResizablePanel>

          <ResizableHandle />

          <ResizablePanel id="wo-items-preview" defaultSize="40%" minSize="25%">
            <WorkOrderPreviewPane lang={lang} detail={preview} loading={previewLoading} />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
