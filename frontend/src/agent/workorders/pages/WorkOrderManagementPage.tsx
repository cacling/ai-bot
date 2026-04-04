import { memo, useState, useEffect, useCallback } from 'react';
import { Search } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { type Lang, T } from '../i18n';
import { type WorkItem, type WorkItemDetail, type Intake, type IssueThread } from './types';
import { listWorkItems, getWorkItem, listIntakes, listIssueThreads, getIntake, getIssueThread } from './api';
import { WorkOrderDetailSheet } from '../components/WorkOrderDetailSheet';

interface WorkOrderManagementPageProps {
  lang: Lang;
}

type DetailData =
  | { kind: 'work-item'; data: WorkItemDetail }
  | { kind: 'intake'; data: Intake }
  | { kind: 'issue-thread'; data: IssueThread };

const STATUS_OPTIONS = ['', 'new', 'open', 'scheduled', 'in_progress', 'waiting_customer', 'resolved', 'closed', 'cancelled'] as const;

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  new: 'default',
  open: 'default',
  analyzed: 'secondary',
  matched: 'secondary',
  scheduled: 'secondary',
  in_progress: 'secondary',
  draft_created: 'secondary',
  waiting_customer: 'secondary',
  materialized: 'outline',
  resolved: 'outline',
  closed: 'outline',
  discarded: 'outline',
  cancelled: 'destructive',
  failed: 'destructive',
};

export const WorkOrderManagementPage = memo(function WorkOrderManagementPage({ lang }: WorkOrderManagementPageProps) {
  const t = T[lang];

  const [workItems, setWorkItems] = useState<WorkItem[]>([]);
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [workItemsLoading, setWorkItemsLoading] = useState(false);

  const [intakes, setIntakes] = useState<Intake[]>([]);
  const [intakesLoading, setIntakesLoading] = useState(false);

  const [threads, setThreads] = useState<IssueThread[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(false);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<DetailData | null>(null);

  const fetchWorkItems = useCallback(async () => {
    setWorkItemsLoading(true);
    try {
      const items = await listWorkItems({
        keyword: keyword || undefined,
        status: statusFilter || undefined,
      });
      setWorkItems(items);
    } catch {
      setWorkItems([]);
    } finally {
      setWorkItemsLoading(false);
    }
  }, [keyword, statusFilter]);

  useEffect(() => { fetchWorkItems(); }, [fetchWorkItems]);

  const fetchIntakes = useCallback(async () => {
    setIntakesLoading(true);
    try {
      const items = await listIntakes();
      setIntakes(items);
    } catch {
      setIntakes([]);
    } finally {
      setIntakesLoading(false);
    }
  }, []);

  const fetchThreads = useCallback(async () => {
    setThreadsLoading(true);
    try {
      const items = await listIssueThreads();
      setThreads(items);
    } catch {
      setThreads([]);
    } finally {
      setThreadsLoading(false);
    }
  }, []);

  const handleTabChange = (tab: string) => {
    if (tab === 'intakes') fetchIntakes();
    if (tab === 'threads') fetchThreads();
  };

  const openWorkItemDetail = async (id: string) => {
    try {
      const data = await getWorkItem(id);
      setDetail({ kind: 'work-item', data });
      setDetailOpen(true);
    } catch { /* ignore */ }
  };

  const openIntakeDetail = async (id: string) => {
    try {
      const data = await getIntake(id);
      setDetail({ kind: 'intake', data });
      setDetailOpen(true);
    } catch { /* ignore */ }
  };

  const openThreadDetail = async (id: string) => {
    try {
      const data = await getIssueThread(id);
      setDetail({ kind: 'issue-thread', data });
      setDetailOpen(true);
    } catch { /* ignore */ }
  };

  const handleReset = () => {
    setKeyword('');
    setStatusFilter('');
  };

  return (
    <div className="h-full flex flex-col overflow-hidden p-4">
      <Tabs defaultValue="list" onValueChange={handleTabChange} className="flex-1 flex flex-col overflow-hidden">
        <TabsList className="flex-shrink-0">
          <TabsTrigger value="list">{t.wo_tab_list}</TabsTrigger>
          <TabsTrigger value="intakes">{t.wo_tab_intakes}</TabsTrigger>
          <TabsTrigger value="threads">{t.wo_tab_threads}</TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="flex-1 flex flex-col overflow-hidden mt-4">
          <div className="flex items-center gap-2 mb-4 flex-shrink-0">
            <div className="relative flex-1 max-w-sm">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={keyword}
                onChange={e => setKeyword(e.target.value)}
                placeholder={t.wo_search_placeholder}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={v => setStatusFilter(v ?? '')}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder={t.wo_filter_status} />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map(s => (
                  <SelectItem key={s || '__all'} value={s || '__all'}>
                    {s || t.wo_filter_all}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={handleReset}>
              {t.wo_filter_reset}
            </Button>
          </div>

          <div className="flex-1 overflow-auto border rounded-lg">
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
                {workItemsLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">{t.wo_loading}</TableCell>
                  </TableRow>
                ) : workItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">{t.wo_empty}</TableCell>
                  </TableRow>
                ) : (
                  workItems.map(item => (
                    <TableRow key={item.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openWorkItemDetail(item.id)}>
                      <TableCell className="font-mono text-xs">{item.id}</TableCell>
                      <TableCell>{item.title}</TableCell>
                      <TableCell className="font-mono text-xs">{item.customerPhone}</TableCell>
                      <TableCell><Badge variant={STATUS_VARIANT[item.status] ?? 'default'}>{item.status}</Badge></TableCell>
                      <TableCell className="text-xs">{item.type}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{item.updatedAt}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="intakes" className="flex-1 overflow-auto mt-4">
          <div className="border rounded-lg">
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
                {intakesLoading ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">{t.wo_loading}</TableCell></TableRow>
                ) : intakes.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">{t.wo_empty}</TableCell></TableRow>
                ) : (
                  intakes.map(item => (
                    <TableRow key={item.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openIntakeDetail(item.id)}>
                      <TableCell className="font-mono text-xs">{item.id}</TableCell>
                      <TableCell>{item.sourceKind}</TableCell>
                      <TableCell className="truncate max-w-[300px]">{item.subject ?? '-'}</TableCell>
                      <TableCell><Badge variant={STATUS_VARIANT[item.status] ?? 'default'}>{item.status}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{item.createdAt}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="threads" className="flex-1 overflow-auto mt-4">
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">ID</TableHead>
                  <TableHead>{t.wo_col_title}</TableHead>
                  <TableHead className="w-[120px]">{t.wo_col_items}</TableHead>
                  <TableHead className="w-[100px]">{t.wo_filter_status}</TableHead>
                  <TableHead className="w-[160px]">{t.wo_col_updated}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {threadsLoading ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">{t.wo_loading}</TableCell></TableRow>
                ) : threads.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">{t.wo_empty}</TableCell></TableRow>
                ) : (
                  threads.map(item => (
                    <TableRow key={item.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openThreadDetail(item.id)}>
                      <TableCell className="font-mono text-xs">{item.id}</TableCell>
                      <TableCell>{item.canonicalSubject ?? '-'}</TableCell>
                      <TableCell className="text-center">{[item.masterTicketId, item.latestItemId].filter(Boolean).length || '-'}</TableCell>
                      <TableCell><Badge variant={STATUS_VARIANT[item.status] ?? 'default'}>{item.status}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{item.updatedAt}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      <WorkOrderDetailSheet lang={lang} open={detailOpen} onOpenChange={setDetailOpen} detail={detail} />
    </div>
  );
});
