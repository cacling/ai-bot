import { memo } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { type Lang, T } from '../shared/i18n';
import { type WorkItemDetail, type Intake, type IssueThread } from '../pages/types';

type DetailData =
  | { kind: 'work-item'; data: WorkItemDetail }
  | { kind: 'intake'; data: Intake }
  | { kind: 'issue-thread'; data: IssueThread };

interface WorkOrderDetailSheetProps {
  lang: Lang;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  detail: DetailData | null;
}

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
  pending: 'default',
  approved: 'outline',
  rejected: 'destructive',
};

function LabelValue({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 py-1.5">
      <span className="text-xs text-muted-foreground min-w-[80px] flex-shrink-0">{label}</span>
      <span className="text-sm text-foreground">{value ?? '-'}</span>
    </div>
  );
}

export const WorkOrderDetailSheet = memo(function WorkOrderDetailSheet({
  lang,
  open,
  onOpenChange,
  detail,
}: WorkOrderDetailSheetProps) {
  const t = T[lang];
  if (!detail) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[400px] sm:w-[480px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{t.wo_detail_title}</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {detail.kind === 'work-item' && <WorkItemContent data={detail.data} lang={lang} />}
          {detail.kind === 'intake' && <IntakeContent data={detail.data} lang={lang} />}
          {detail.kind === 'issue-thread' && <IssueThreadContent data={detail.data} lang={lang} />}
        </div>
      </SheetContent>
    </Sheet>
  );
});

function WorkItemContent({ data, lang }: { data: WorkItemDetail; lang: Lang }) {
  const t = T[lang];
  return (
    <>
      <div className="space-y-1">
        <h3 className="text-sm font-medium">{t.wo_basic_info}</h3>
        <Separator />
        <LabelValue label={t.wo_col_id} value={data.id} />
        <LabelValue label={t.wo_col_title} value={data.title} />
        <LabelValue label={t.wo_col_type} value={data.type} />
        <LabelValue label={t.wo_filter_status} value={<Badge variant={STATUS_VARIANT[data.status] ?? 'default'}>{data.status}</Badge>} />
        <LabelValue label={t.wo_col_phone} value={data.customerPhone} />
        {data.ownerId && <LabelValue label={t.wo_assignee} value={data.ownerId} />}
        {data.description && <LabelValue label={t.wo_description} value={data.description} />}
      </div>

      {data.relations && data.relations.length > 0 && (
        <div className="space-y-1">
          <h3 className="text-sm font-medium">{t.wo_relations}</h3>
          <Separator />
          {data.relations.map(r => (
            <LabelValue key={r.id} label={r.relationKind} value={`${r.relatedType}: ${r.relatedId}`} />
          ))}
        </div>
      )}

      {data.appointments && data.appointments.length > 0 && (
        <div className="space-y-1">
          <h3 className="text-sm font-medium">{t.wo_appointments}</h3>
          <Separator />
          {data.appointments.map(a => (
            <LabelValue key={a.id} label={a.appointmentType || a.id} value={`${a.scheduledStartAt ?? '-'} — ${a.status}`} />
          ))}
        </div>
      )}

      {data.childTasks && data.childTasks.length > 0 && (
        <div className="space-y-1">
          <h3 className="text-sm font-medium">{t.wo_sub_tasks}</h3>
          <Separator />
          {data.childTasks.map(st => (
            <LabelValue key={st.id} label={st.status} value={st.title} />
          ))}
        </div>
      )}

      <div className="space-y-1">
        <h3 className="text-sm font-medium">{t.wo_timeline}</h3>
        <Separator />
        <LabelValue label={t.wo_col_created} value={data.createdAt} />
        <LabelValue label={t.wo_col_updated} value={data.updatedAt} />
      </div>
    </>
  );
}

function IntakeContent({ data, lang }: { data: Intake; lang: Lang }) {
  const t = T[lang];
  return (
    <div className="space-y-1">
      <h3 className="text-sm font-medium">{t.wo_intake_info}</h3>
      <Separator />
      <LabelValue label="ID" value={data.id} />
      <LabelValue label={t.wo_col_source} value={data.sourceKind} />
      {data.customerPhone && <LabelValue label={t.wo_col_phone} value={data.customerPhone} />}
      <LabelValue label={t.wo_col_summary} value={data.subject ?? '-'} />
      <LabelValue label={t.wo_filter_status} value={<Badge variant={STATUS_VARIANT[data.status] ?? 'default'}>{data.status}</Badge>} />
      <LabelValue label={t.wo_col_created} value={data.createdAt} />
    </div>
  );
}

function IssueThreadContent({ data, lang }: { data: IssueThread; lang: Lang }) {
  const t = T[lang];
  return (
    <>
      <div className="space-y-1">
        <h3 className="text-sm font-medium">{t.wo_issue_thread}</h3>
        <Separator />
        <LabelValue label="ID" value={data.id} />
        <LabelValue label={t.wo_col_title} value={data.canonicalSubject ?? '-'} />
        <LabelValue label={t.wo_filter_status} value={<Badge variant={STATUS_VARIANT[data.status] ?? 'default'}>{data.status}</Badge>} />
        {data.masterTicketId && <LabelValue label={t.wo_work_items} value={data.masterTicketId} />}
        <LabelValue label={t.wo_col_created} value={data.createdAt} />
        <LabelValue label={t.wo_col_updated} value={data.updatedAt} />
      </div>
    </>
  );
}
