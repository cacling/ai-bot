/**
 * SegmentPage.tsx — 客户分群管理
 *
 * 分群列表 + 新建分群 + 预估人数
 */
import { memo, useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, UsersRound } from 'lucide-react';
import { useAgentContext } from '../../AgentContext';
import { fetchSegments, createSegment, type SegmentItem } from '../api';

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline'> = {
  active: 'default',
  draft: 'secondary',
  disabled: 'outline',
};

export const SegmentPage = memo(function SegmentPage() {
  const { lang } = useAgentContext();
  const [items, setItems] = useState<SegmentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState('dynamic');
  const [formDesc, setFormDesc] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchSegments({ page_size: 50 });
      setItems(res.items);
    } catch (err) {
      console.error('Failed to load segments:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!formName.trim()) return;
    setSaving(true);
    try {
      await createSegment({ segment_name: formName, segment_type: formType, description: formDesc });
      setDialogOpen(false);
      setFormName('');
      setFormDesc('');
      load();
    } catch (err) {
      console.error('Create segment error:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-shrink-0 px-4 py-3 border-b border-border flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {lang === 'zh' ? `共 ${items.length} 个分群` : `${items.length} segments`}
        </span>
        <Button size="sm" className="h-8 gap-1" onClick={() => setDialogOpen(true)}>
          <Plus size={14} />
          {lang === 'zh' ? '新建分群' : 'New Segment'}
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {loading && items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">{lang === 'zh' ? '加载中...' : 'Loading...'}</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">{lang === 'zh' ? '暂无分群' : 'No segments'}</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {items.map((item) => (
              <Card key={item.segment_id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">{item.segment_name}</CardTitle>
                    <Badge variant={STATUS_VARIANT[item.status] ?? 'secondary'} className="text-[10px]">
                      {item.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground mb-2">{item.description ?? '-'}</p>
                  <div className="flex items-center gap-3 text-xs">
                    <Badge variant="outline" className="text-[10px]">{item.segment_type}</Badge>
                    <span className="flex items-center gap-1">
                      <UsersRound size={12} />
                      {item.estimated_count}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">{lang === 'zh' ? '新建分群' : 'New Segment'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">{lang === 'zh' ? '分群名称' : 'Segment Name'}</Label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} className="mt-1 h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">{lang === 'zh' ? '类型' : 'Type'}</Label>
              <Select value={formType} onValueChange={setFormType}>
                <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="dynamic">{lang === 'zh' ? '动态分群' : 'Dynamic'}</SelectItem>
                  <SelectItem value="static">{lang === 'zh' ? '静态分群' : 'Static'}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">{lang === 'zh' ? '描述' : 'Description'}</Label>
              <Textarea value={formDesc} onChange={(e) => setFormDesc(e.target.value)} rows={2} className="mt-1 text-sm" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>
                {lang === 'zh' ? '取消' : 'Cancel'}
              </Button>
              <Button size="sm" onClick={handleCreate} disabled={saving || !formName.trim()}>
                {saving ? (lang === 'zh' ? '保存中...' : 'Saving...') : (lang === 'zh' ? '保存' : 'Save')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
});
