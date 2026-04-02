/**
 * TagManagementPage.tsx — 标签管理页
 *
 * 标签列表 + 分类筛选 + 新建/编辑/启停/删除
 */
import { memo, useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Search, Power, Trash2, Pencil } from 'lucide-react';
import { useAgentContext } from '../../AgentContext';
import { fetchTags, createTag, updateTag, deleteTag, type TagItem } from '../api';

const CATEGORY_OPTIONS: { value: string; zh: string; en: string }[] = [
  { value: '', zh: '全部分类', en: 'All Categories' },
  { value: '业务标签', zh: '业务标签', en: 'Business' },
  { value: '行为标签', zh: '行为标签', en: 'Behavioral' },
  { value: '模型标签', zh: '模型标签', en: 'Model' },
];

const TYPE_OPTIONS: { value: string; zh: string; en: string }[] = [
  { value: '', zh: '全部类型', en: 'All Types' },
  { value: 'manual', zh: '手动', en: 'Manual' },
  { value: 'rule', zh: '规则', en: 'Rule' },
  { value: 'model', zh: '模型', en: 'Model' },
];

const TYPE_VARIANT: Record<string, 'default' | 'secondary' | 'outline'> = {
  manual: 'default',
  rule: 'secondary',
  model: 'outline',
};

export const TagManagementPage = memo(function TagManagementPage() {
  const { lang } = useAgentContext();
  const [items, setItems] = useState<TagItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [category, setCategory] = useState('');
  const [tagType, setTagType] = useState('');
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);

  // Create/Edit dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<TagItem | null>(null);
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState('业务标签');
  const [formType, setFormType] = useState('manual');
  const [formDesc, setFormDesc] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchTags({
        page,
        page_size: 50,
        category: category || undefined,
        tag_type: tagType || undefined,
        keyword: keyword || undefined,
      });
      setItems(res.items);
      setTotal(res.total);
    } catch (err) {
      console.error('Failed to load tags:', err);
    } finally {
      setLoading(false);
    }
  }, [page, category, tagType, keyword]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditItem(null);
    setFormName('');
    setFormCategory('业务标签');
    setFormType('manual');
    setFormDesc('');
    setDialogOpen(true);
  };

  const openEdit = (item: TagItem) => {
    setEditItem(item);
    setFormName(item.tag_name);
    setFormCategory(item.tag_category ?? '业务标签');
    setFormType(item.tag_type);
    setFormDesc(item.description ?? '');
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formName.trim()) return;
    setSaving(true);
    try {
      if (editItem) {
        await updateTag(editItem.tag_id, {
          tag_name: formName,
          tag_category: formCategory,
          description: formDesc,
        });
      } else {
        await createTag({
          tag_name: formName,
          tag_category: formCategory,
          tag_type: formType,
          description: formDesc,
        });
      }
      setDialogOpen(false);
      load();
    } catch (err) {
      console.error('Save tag error:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (item: TagItem) => {
    const newStatus = item.status === 'active' ? 'disabled' : 'active';
    await updateTag(item.tag_id, { status: newStatus });
    load();
  };

  const handleDelete = async (item: TagItem) => {
    if (!confirm(lang === 'zh' ? `确认删除标签"${item.tag_name}"？` : `Delete tag "${item.tag_name}"?`)) return;
    await deleteTag(item.tag_id);
    load();
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Filter bar */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-border flex items-center gap-3 flex-wrap">
        <Select value={category} onValueChange={(v) => { setCategory(v); setPage(1); }}>
          <SelectTrigger className="w-[120px] h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATEGORY_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt[lang]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={tagType} onValueChange={(v) => { setTagType(v); setPage(1); }}>
          <SelectTrigger className="w-[110px] h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TYPE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt[lang]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative min-w-[160px] max-w-[280px]">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { setPage(1); load(); } }}
            placeholder={lang === 'zh' ? '搜索标签名...' : 'Search tag...'}
            className="pl-8 h-8 text-sm"
          />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {lang === 'zh' ? `共 ${total} 个标签` : `${total} tags`}
          </span>
          <Button size="sm" onClick={openCreate} className="h-8 gap-1">
            <Plus size={14} />
            {lang === 'zh' ? '新建标签' : 'New Tag'}
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{lang === 'zh' ? '标签名称' : 'Tag Name'}</TableHead>
              <TableHead className="w-[100px]">{lang === 'zh' ? '分类' : 'Category'}</TableHead>
              <TableHead className="w-[80px]">{lang === 'zh' ? '类型' : 'Type'}</TableHead>
              <TableHead className="w-[80px]">{lang === 'zh' ? '状态' : 'Status'}</TableHead>
              <TableHead className="w-[80px]">{lang === 'zh' ? '覆盖人数' : 'Count'}</TableHead>
              <TableHead className="w-[200px]">{lang === 'zh' ? '描述' : 'Description'}</TableHead>
              <TableHead className="w-[120px]">{lang === 'zh' ? '操作' : 'Actions'}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  {lang === 'zh' ? '加载中...' : 'Loading...'}
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  {lang === 'zh' ? '暂无标签' : 'No tags'}
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => (
                <TableRow key={item.tag_id}>
                  <TableCell className="font-medium">{item.tag_name}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px]">{item.tag_category ?? '-'}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={TYPE_VARIANT[item.tag_type] ?? 'secondary'} className="text-[10px]">
                      {item.tag_type}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={item.status === 'active' ? 'default' : 'secondary'} className="text-[10px]">
                      {item.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm tabular-nums">{item.cover_count}</TableCell>
                  <TableCell className="text-xs text-muted-foreground truncate max-w-[200px]">
                    {item.description ?? '-'}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon-sm" onClick={() => openEdit(item)} title={lang === 'zh' ? '编辑' : 'Edit'}>
                        <Pencil size={13} />
                      </Button>
                      <Button variant="ghost" size="icon-sm" onClick={() => handleToggleStatus(item)} title={lang === 'zh' ? '启停' : 'Toggle'}>
                        <Power size={13} />
                      </Button>
                      <Button variant="ghost" size="icon-sm" onClick={() => handleDelete(item)} title={lang === 'zh' ? '删除' : 'Delete'}>
                        <Trash2 size={13} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Create/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">
              {editItem
                ? (lang === 'zh' ? '编辑标签' : 'Edit Tag')
                : (lang === 'zh' ? '新建标签' : 'New Tag')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">{lang === 'zh' ? '标签名称' : 'Tag Name'}</Label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder={lang === 'zh' ? '输入标签名称' : 'Enter tag name'}
                className="mt-1 h-8 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">{lang === 'zh' ? '分类' : 'Category'}</Label>
                <Select value={formCategory} onValueChange={setFormCategory}>
                  <SelectTrigger className="mt-1 h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="业务标签">{lang === 'zh' ? '业务标签' : 'Business'}</SelectItem>
                    <SelectItem value="行为标签">{lang === 'zh' ? '行为标签' : 'Behavioral'}</SelectItem>
                    <SelectItem value="模型标签">{lang === 'zh' ? '模型标签' : 'Model'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {!editItem && (
                <div>
                  <Label className="text-xs">{lang === 'zh' ? '类型' : 'Type'}</Label>
                  <Select value={formType} onValueChange={setFormType}>
                    <SelectTrigger className="mt-1 h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">{lang === 'zh' ? '手动' : 'Manual'}</SelectItem>
                      <SelectItem value="rule">{lang === 'zh' ? '规则' : 'Rule'}</SelectItem>
                      <SelectItem value="model">{lang === 'zh' ? '模型' : 'Model'}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <div>
              <Label className="text-xs">{lang === 'zh' ? '描述' : 'Description'}</Label>
              <Textarea
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                rows={2}
                className="mt-1 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>
                {lang === 'zh' ? '取消' : 'Cancel'}
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving || !formName.trim()}>
                {saving ? (lang === 'zh' ? '保存中...' : 'Saving...') : (lang === 'zh' ? '保存' : 'Save')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
});
