/**
 * IntakesPage.tsx — Intakes list + preview dual-pane.
 * URL searchParams: ?status=new&selected=intake_123
 */
import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { T, type Lang } from '../i18n';
import { type Intake } from './types';
import { listIntakes, getIntake } from './api';
import { WorkOrdersFilterBar } from '../components/WorkOrdersFilterBar';
import { WorkOrderPreviewPane, type PreviewData } from '../components/WorkOrderPreviewPane';

const STATUS_OPTIONS = ['', 'new', 'analyzed', 'matched', 'draft_created', 'materialized', 'discarded', 'failed'] as const;

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  new: 'default',
  analyzed: 'secondary',
  matched: 'secondary',
  draft_created: 'secondary',
  materialized: 'outline',
  discarded: 'outline',
  failed: 'destructive',
};

export function IntakesPage({ lang = 'zh' }: { lang?: Lang }) {
  const t = T[lang];
  const [searchParams, setSearchParams] = useSearchParams();

  const keyword = searchParams.get('keyword') ?? '';
  const statusFilter = searchParams.get('status') ?? '';
  const selectedId = searchParams.get('selected') ?? '';

  const [items, setItems] = useState<Intake[]>([]);
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
      const data = await listIntakes({ status: statusFilter || undefined });
      setItems(data);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { fetchList(); }, [fetchList]);

  useEffect(() => {
    if (!selectedId) { setPreview(null); return; }
    let cancelled = false;
    setPreviewLoading(true);
    getIntake(selectedId)
      .then(data => { if (!cancelled) setPreview({ kind: 'intake', data }); })
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
          statusOptions={STATUS_OPTIONS}
        />

        <ResizablePanelGroup orientation="horizontal" className="flex-1 border rounded-lg overflow-hidden" id="wo-intakes">
          <ResizablePanel id="wo-intakes-list" defaultSize="60%" minSize="30%">
            <div className="h-full overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px]">ID</TableHead>
                    <TableHead>{t.wo_col_source}</TableHead>
                    <TableHead>{t.wo_col_summary}</TableHead>
                    <TableHead className="w-[100px]">{t.wo_filter_status}</TableHead>
                    <TableHead className="w-[160px]">{t.wo_col_created}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        {t.wo_loading}
                      </TableCell>
                    </TableRow>
                  ) : items.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
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
                        <TableCell>{item.sourceKind}</TableCell>
                        <TableCell className="truncate max-w-[300px]">{item.subject ?? '-'}</TableCell>
                        <TableCell>
                          <Badge variant={STATUS_VARIANT[item.status] ?? 'default'}>{item.status}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{item.createdAt}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </ResizablePanel>

          <ResizableHandle />

          <ResizablePanel id="wo-intakes-preview" defaultSize="40%" minSize="25%">
            <WorkOrderPreviewPane lang={lang} detail={preview} loading={previewLoading} />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
