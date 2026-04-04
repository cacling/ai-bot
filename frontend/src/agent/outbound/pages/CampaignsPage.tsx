/**
 * CampaignsPage.tsx — 活动与任务管理
 *
 * 活动列表（可展开查看关联任务）+ 催收任务列表 + 创建/编辑活动 Dialog
 */
import { Fragment, useState, useEffect, useCallback } from 'react';
import { ChevronRight, ChevronDown, Plus, Pause, Play, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { type Lang } from '../../../i18n';
import {
  type Campaign, type OutboundTask,
  fetchCampaigns, fetchTasks, createCampaign, updateCampaign,
} from '../api';

const L = {
  zh: {
    title: '活动与任务',
    allStatus: '全部状态',
    active: '进行中', paused: '已暂停', ended: '已结束',
    allTypes: '全部类型', collection: '催收', marketing: '营销',
    newCampaign: '新建活动',
    name: '活动名称', offerType: '类型', status: '状态',
    target: '目标人群', validity: '有效期', actions: '操作',
    edit: '编辑', pause: '暂停', resume: '恢复',
    taskId: '任务ID', phone: '手机号', taskStatus: '状态', label: '标签',
    collectionTasks: '催收任务（未关联活动）',
    noTasks: '暂无关联任务',
    noCampaigns: '暂无活动',
    noCollectionTasks: '暂无催收任务',
    headline: '标题', benefit: '权益摘要', targetSegment: '目标人群',
    from: '生效日期', to: '截止日期',
    cancel: '取消', save: '保存', create: '创建',
    editCampaign: '编辑活动', createCampaign: '新建活动',
    plan_upgrade: '套餐升级', roaming_pack: '漫游包', family_bundle: '家庭套餐', retention: '挽留',
    pending: '待处理', in_progress: '进行中', completed: '已完成', cancelled: '已取消',
  },
  en: {
    title: 'Campaigns & Tasks',
    allStatus: 'All Status',
    active: 'Active', paused: 'Paused', ended: 'Ended',
    allTypes: 'All Types', collection: 'Collection', marketing: 'Marketing',
    newCampaign: 'New Campaign',
    name: 'Name', offerType: 'Type', status: 'Status',
    target: 'Target', validity: 'Validity', actions: 'Actions',
    edit: 'Edit', pause: 'Pause', resume: 'Resume',
    taskId: 'Task ID', phone: 'Phone', taskStatus: 'Status', label: 'Label',
    collectionTasks: 'Collection Tasks (Unaffiliated)',
    noTasks: 'No associated tasks',
    noCampaigns: 'No campaigns',
    noCollectionTasks: 'No collection tasks',
    headline: 'Headline', benefit: 'Benefit Summary', targetSegment: 'Target Segment',
    from: 'Valid From', to: 'Valid Until',
    cancel: 'Cancel', save: 'Save', create: 'Create',
    editCampaign: 'Edit Campaign', createCampaign: 'New Campaign',
    plan_upgrade: 'Plan Upgrade', roaming_pack: 'Roaming Pack', family_bundle: 'Family Bundle', retention: 'Retention',
    pending: 'Pending', in_progress: 'In Progress', completed: 'Completed', cancelled: 'Cancelled',
  },
};

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  active: 'default', paused: 'secondary', ended: 'outline',
  pending: 'outline', in_progress: 'default', completed: 'secondary', cancelled: 'destructive',
};

const OFFER_TYPES = ['plan_upgrade', 'roaming_pack', 'family_bundle', 'retention'] as const;

interface CampaignFormData {
  campaign_id: string;
  campaign_name: string;
  offer_type: string;
  headline: string;
  benefit_summary: string;
  target_segment: string;
  valid_from: string;
  valid_until: string;
}

const EMPTY_FORM: CampaignFormData = {
  campaign_id: '', campaign_name: '', offer_type: 'plan_upgrade',
  headline: '', benefit_summary: '', target_segment: '',
  valid_from: '', valid_until: '',
};

export function CampaignsPage({ lang }: { lang: Lang }) {
  const t = L[lang];
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [tasks, setTasks] = useState<OutboundTask[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [form, setForm] = useState<CampaignFormData>(EMPTY_FORM);

  const load = useCallback(async () => {
    const [c, tk] = await Promise.all([
      fetchCampaigns(statusFilter || undefined),
      fetchTasks(),
    ]);
    setCampaigns(c);
    setTasks(tk);
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  const collectionTasks = tasks.filter(t => t.task_type === 'collection');
  const getTasksForCampaign = (campaignId: string) => {
    // Match tasks by campaign_id; also include marketing tasks without campaign_id
    // since seeded data doesn't populate campaign linkage on outbound_tasks
    const byId = tasks.filter(t => t.campaign_id === campaignId);
    if (byId.length > 0) return byId;
    // Fallback: show marketing tasks (no campaign_id) for any campaign
    return tasks.filter(t => t.task_type === 'marketing' && !t.campaign_id);
  };

  const handleTogglePause = async (camp: Campaign) => {
    const newStatus = camp.status === 'active' ? 'paused' : 'active';
    await updateCampaign(camp.campaign_id, { status: newStatus });
    load();
  };

  const openCreate = () => {
    setEditingCampaign(null);
    setForm({ ...EMPTY_FORM, campaign_id: `CAMP-${Date.now()}` });
    setDialogOpen(true);
  };

  const openEdit = (camp: Campaign) => {
    setEditingCampaign(camp);
    setForm({
      campaign_id: camp.campaign_id,
      campaign_name: camp.campaign_name,
      offer_type: camp.offer_type,
      headline: camp.headline ?? '',
      benefit_summary: camp.benefit_summary ?? '',
      target_segment: camp.target_segment ?? '',
      valid_from: camp.valid_from ?? '',
      valid_until: camp.valid_until ?? '',
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (editingCampaign) {
      await updateCampaign(editingCampaign.campaign_id, {
        campaign_name: form.campaign_name,
        offer_type: form.offer_type as Campaign['offer_type'],
        headline: form.headline,
        benefit_summary: form.benefit_summary,
        target_segment: form.target_segment,
        valid_from: form.valid_from,
        valid_until: form.valid_until,
      });
    } else {
      await createCampaign({
        campaign_id: form.campaign_id,
        campaign_name: form.campaign_name,
        offer_type: form.offer_type as Campaign['offer_type'],
        status: 'active',
        headline: form.headline,
        benefit_summary: form.benefit_summary,
        target_segment: form.target_segment,
        valid_from: form.valid_from,
        valid_until: form.valid_until,
      });
    }
    setDialogOpen(false);
    load();
  };

  const taskLabel = (tk: OutboundTask) => lang === 'zh' ? tk.label_zh : tk.label_en;

  return (
    <div className="h-full overflow-auto p-4 space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <Select value={statusFilter} onValueChange={v => setStatusFilter(v ?? '')}>
          <SelectTrigger className="w-32 h-8 text-xs">
            <SelectValue placeholder={t.allStatus} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">{t.allStatus}</SelectItem>
            <SelectItem value="active">{t.active}</SelectItem>
            <SelectItem value="paused">{t.paused}</SelectItem>
            <SelectItem value="ended">{t.ended}</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Button size="sm" className="h-8 text-xs gap-1" onClick={openCreate}>
          <Plus size={14} />
          {t.newCampaign}
        </Button>
      </div>

      {/* Campaign Table */}
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm">{t.marketing}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {campaigns.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4">{t.noCampaigns}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead className="text-xs">{t.name}</TableHead>
                  <TableHead className="text-xs">{t.offerType}</TableHead>
                  <TableHead className="text-xs">{t.status}</TableHead>
                  <TableHead className="text-xs">{t.target}</TableHead>
                  <TableHead className="text-xs">{t.validity}</TableHead>
                  <TableHead className="text-xs text-right">{t.actions}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map(camp => {
                  const isExpanded = expandedId === camp.campaign_id;
                  const campTasks = getTasksForCampaign(camp.campaign_id);
                  return (
                    <Fragment key={camp.campaign_id}>
                      <TableRow className="group">
                        <TableCell className="w-8 px-2">
                          <Button
                            variant="ghost" size="sm" className="h-6 w-6 p-0"
                            onClick={() => setExpandedId(isExpanded ? null : camp.campaign_id)}
                          >
                            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </Button>
                        </TableCell>
                        <TableCell className="text-xs font-medium">{camp.campaign_name}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">
                            {t[camp.offer_type as keyof typeof t] ?? camp.offer_type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={STATUS_VARIANT[camp.status] ?? 'outline'} className="text-[10px]">
                            {t[camp.status as keyof typeof t] ?? camp.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{camp.target_segment}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {camp.valid_from?.slice(0, 10)} ~ {camp.valid_until?.slice(0, 10)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1" onClick={() => openEdit(camp)}>
                              <Pencil size={12} /> {t.edit}
                            </Button>
                            {camp.status !== 'ended' && (
                              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1" onClick={() => handleTogglePause(camp)}>
                                {camp.status === 'active' ? <><Pause size={12} /> {t.pause}</> : <><Play size={12} /> {t.resume}</>}
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow>
                          <TableCell colSpan={7} className="bg-muted/30 p-0">
                            {campTasks.length === 0 ? (
                              <p className="text-xs text-muted-foreground p-3">{t.noTasks}</p>
                            ) : (
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead className="text-[10px]">{t.taskId}</TableHead>
                                    <TableHead className="text-[10px]">{t.phone}</TableHead>
                                    <TableHead className="text-[10px]">{t.taskStatus}</TableHead>
                                    <TableHead className="text-[10px]">{t.label}</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {campTasks.map(tk => (
                                    <TableRow key={tk.id}>
                                      <TableCell className="text-[10px] font-mono">{tk.id}</TableCell>
                                      <TableCell className="text-[10px]">{tk.phone}</TableCell>
                                      <TableCell>
                                        <Badge variant={STATUS_VARIANT[tk.status] ?? 'outline'} className="text-[10px]">
                                          {t[tk.status as keyof typeof t] ?? tk.status}
                                        </Badge>
                                      </TableCell>
                                      <TableCell className="text-[10px]">{taskLabel(tk)}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            )}
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Collection Tasks (unaffiliated) */}
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm">{t.collectionTasks}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {collectionTasks.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4">{t.noCollectionTasks}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">{t.taskId}</TableHead>
                  <TableHead className="text-xs">{t.phone}</TableHead>
                  <TableHead className="text-xs">{t.taskStatus}</TableHead>
                  <TableHead className="text-xs">{t.label}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {collectionTasks.map(tk => (
                  <TableRow key={tk.id}>
                    <TableCell className="text-xs font-mono">{tk.id}</TableCell>
                    <TableCell className="text-xs">{tk.phone}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[tk.status] ?? 'outline'} className="text-[10px]">
                        {t[tk.status as keyof typeof t] ?? tk.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{taskLabel(tk)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">
              {editingCampaign ? t.editCampaign : t.createCampaign}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">{t.name}</Label>
              <Input className="h-8 text-xs" value={form.campaign_name}
                onChange={e => setForm(f => ({ ...f, campaign_name: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">{t.offerType}</Label>
              <Select value={form.offer_type} onValueChange={v => setForm(f => ({ ...f, offer_type: v ?? 'plan_upgrade' }))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {OFFER_TYPES.map(ot => (
                    <SelectItem key={ot} value={ot}>{t[ot as keyof typeof t] ?? ot}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">{t.headline}</Label>
              <Input className="h-8 text-xs" value={form.headline}
                onChange={e => setForm(f => ({ ...f, headline: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">{t.benefit}</Label>
              <Textarea className="text-xs min-h-[60px]" value={form.benefit_summary}
                onChange={e => setForm(f => ({ ...f, benefit_summary: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">{t.targetSegment}</Label>
              <Input className="h-8 text-xs" value={form.target_segment}
                onChange={e => setForm(f => ({ ...f, target_segment: e.target.value }))} />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <Label className="text-xs">{t.from}</Label>
                <Input type="date" className="h-8 text-xs" value={form.valid_from}
                  onChange={e => setForm(f => ({ ...f, valid_from: e.target.value }))} />
              </div>
              <div className="flex-1">
                <Label className="text-xs">{t.to}</Label>
                <Input type="date" className="h-8 text-xs" value={form.valid_until}
                  onChange={e => setForm(f => ({ ...f, valid_until: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" className="text-xs" onClick={() => setDialogOpen(false)}>
              {t.cancel}
            </Button>
            <Button size="sm" className="text-xs" onClick={handleSave} disabled={!form.campaign_name.trim()}>
              {editingCampaign ? t.save : t.create}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
