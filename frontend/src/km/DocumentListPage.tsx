import { useState, useEffect } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { kmApi, type KMDocument } from './api';
import type { KMPage } from './KnowledgeManagementPage';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const CLASSIFICATION_LABELS: Record<string, string> = { public: '公开', internal: '内部', sensitive: '敏感' };

const classVariant = (c: string): 'destructive' | 'outline' | 'secondary' =>
  c === 'sensitive' ? 'destructive' : c === 'internal' ? 'outline' : 'secondary';

export function DocumentListPage({ navigate }: { navigate: (p: KMPage) => void }) {
  const [items, setItems] = useState<KMDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: '', classification: 'internal', owner: '' });

  const load = () => {
    setLoading(true);
    kmApi.listDocuments().then(r => setItems(r.items)).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const handleCreate = async () => {
    if (!form.title.trim()) return;
    await kmApi.createDocument(form);
    setShowCreate(false);
    setForm({ title: '', classification: 'internal', owner: '' });
    load();
  };

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold">文档列表</h2>
        <div className="flex gap-2">
          <Button variant="ghost" size="icon-sm" onClick={load}><RefreshCw size={14} /></Button>
          <Button size="sm" onClick={() => setShowCreate(true)}><Plus size={12} /> 新建文档</Button>
        </div>
      </div>

      {showCreate && (
        <Card className="mb-3"><CardContent className="p-3 space-y-2">
          <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder="文档标题" className="text-xs" />
          <div className="flex gap-2">
            <Select value={form.classification} onValueChange={(v) => v && setForm(f => ({ ...f, classification: v }))}>
              <SelectTrigger className="w-24 text-xs h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="public">公开</SelectItem>
                <SelectItem value="internal">内部</SelectItem>
                <SelectItem value="sensitive">敏感</SelectItem>
              </SelectContent>
            </Select>
            <Input value={form.owner} onChange={e => setForm(f => ({ ...f, owner: e.target.value }))}
              placeholder="负责人" className="flex-1 text-xs" />
            <Button size="sm" onClick={handleCreate}>创建</Button>
            <Button variant="outline" size="sm" onClick={() => setShowCreate(false)}>取消</Button>
          </div>
        </CardContent></Card>
      )}

      <div className="rounded-lg border overflow-hidden">
        <Table className="text-xs">
          <TableHeader>
            <TableRow>
              <TableHead>标题</TableHead>
              <TableHead>来源</TableHead>
              <TableHead>密级</TableHead>
              <TableHead>负责人</TableHead>
              <TableHead>更新时间</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">加载中...</TableCell></TableRow>
            ) : items.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">暂无文档</TableCell></TableRow>
            ) : items.map(doc => (
              <TableRow key={doc.id} className="cursor-pointer" onClick={() => navigate({ view: 'document-detail', id: doc.id })}>
                <TableCell className="text-primary font-medium">{doc.title}</TableCell>
                <TableCell className="text-muted-foreground">{doc.source}</TableCell>
                <TableCell><Badge variant={classVariant(doc.classification)}>{CLASSIFICATION_LABELS[doc.classification] ?? doc.classification}</Badge></TableCell>
                <TableCell className="text-muted-foreground">{doc.owner ?? '-'}</TableCell>
                <TableCell className="text-muted-foreground">{doc.updated_at?.slice(0, 16).replace('T', ' ')}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
