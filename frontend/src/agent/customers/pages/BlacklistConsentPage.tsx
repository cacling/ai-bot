/**
 * BlacklistConsentPage.tsx — 黑名单/隐私授权管理页
 *
 * 两个 Tab：黑名单列表 + 授权记录（consent 复用已有 API）
 */
import { memo, useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { ChevronLeft, ChevronRight, ShieldBan, ShieldCheck } from 'lucide-react';
import { useAgentContext } from '../../AgentContext';
import { fetchBlacklist, removeFromBlacklist, type BlacklistItem } from '../api';

type SubTab = 'blacklist' | 'consent';

function maskPhone(phone: string): string {
  if (phone.length >= 7) return phone.slice(0, 3) + '****' + phone.slice(-4);
  return phone;
}

export const BlacklistConsentPage = memo(function BlacklistConsentPage() {
  const { lang } = useAgentContext();
  const [subTab, setSubTab] = useState<SubTab>('blacklist');

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Sub-tab bar */}
      <div className="flex-shrink-0 bg-background border-b border-border px-4 flex items-center h-8">
        {([
          { id: 'blacklist' as const, Icon: ShieldBan, label: { zh: '黑名单', en: 'Blacklist' } },
          { id: 'consent' as const, Icon: ShieldCheck, label: { zh: '授权记录', en: 'Consent' } },
        ]).map((tab) => (
          <Button
            key={tab.id}
            variant="ghost"
            size="sm"
            onClick={() => setSubTab(tab.id)}
            className={`flex items-center gap-1 px-3 h-full rounded-none text-xs font-medium border-b-2 transition-colors ${
              subTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <tab.Icon size={12} />
            {tab.label[lang]}
          </Button>
        ))}
      </div>

      <div className="flex-1 overflow-hidden relative">
        <div className={`absolute inset-0 ${subTab !== 'blacklist' ? 'hidden' : ''}`}>
          <BlacklistTab lang={lang} />
        </div>
        <div className={`absolute inset-0 ${subTab !== 'consent' ? 'hidden' : ''}`}>
          <ConsentPlaceholder lang={lang} />
        </div>
      </div>
    </div>
  );
});

// ── Blacklist Tab ──

function BlacklistTab({ lang }: { lang: string }) {
  const [items, setItems] = useState<BlacklistItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [statusFilter, setStatusFilter] = useState('active');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchBlacklist({ page, page_size: pageSize, status: statusFilter });
      setItems(res.items);
      setTotal(res.total);
    } catch (err) {
      console.error('Failed to load blacklist:', err);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.ceil(total / pageSize) || 1;

  const handleRemove = async (item: BlacklistItem) => {
    if (!confirm(lang === 'zh' ? '确认解除黑名单？' : 'Remove from blacklist?')) return;
    await removeFromBlacklist(item.blacklist_id);
    load();
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-shrink-0 px-4 py-3 border-b border-border flex items-center gap-3">
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[120px] h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">{lang === 'zh' ? '生效中' : 'Active'}</SelectItem>
            <SelectItem value="removed">{lang === 'zh' ? '已解除' : 'Removed'}</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto text-xs text-muted-foreground">
          {lang === 'zh' ? `共 ${total} 条` : `${total} total`}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{lang === 'zh' ? '客户' : 'Customer'}</TableHead>
              <TableHead className="w-[120px]">{lang === 'zh' ? '手机号' : 'Phone'}</TableHead>
              <TableHead>{lang === 'zh' ? '原因' : 'Reason'}</TableHead>
              <TableHead className="w-[80px]">{lang === 'zh' ? '来源' : 'Source'}</TableHead>
              <TableHead className="w-[100px]">{lang === 'zh' ? '操作人' : 'Operator'}</TableHead>
              <TableHead className="w-[140px]">{lang === 'zh' ? '时间' : 'Time'}</TableHead>
              <TableHead className="w-[80px]">{lang === 'zh' ? '操作' : 'Action'}</TableHead>
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
                  {lang === 'zh' ? '暂无记录' : 'No records'}
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => (
                <TableRow key={item.blacklist_id}>
                  <TableCell className="font-medium">{item.display_name ?? '-'}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {item.primary_phone ? maskPhone(item.primary_phone) : '-'}
                  </TableCell>
                  <TableCell className="text-sm">{item.reason}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px]">{item.source}</Badge>
                  </TableCell>
                  <TableCell className="text-sm">{item.operator_name ?? '-'}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(item.created_at).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US')}
                  </TableCell>
                  <TableCell>
                    {item.status === 'active' ? (
                      <Button variant="outline" size="sm" className="h-6 text-xs" onClick={() => handleRemove(item)}>
                        {lang === 'zh' ? '解除' : 'Remove'}
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {item.removed_by ?? '-'}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex-shrink-0 px-4 py-2 border-t border-border flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          {lang === 'zh' ? `第 ${page} / ${totalPages} 页` : `Page ${page} of ${totalPages}`}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon-sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            <ChevronLeft size={14} />
          </Button>
          <Button variant="outline" size="icon-sm" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
            <ChevronRight size={14} />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Consent Placeholder (uses existing /api/cdp/consents API) ──

function ConsentPlaceholder({ lang }: { lang: string }) {
  return (
    <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
      {lang === 'zh'
        ? '授权记录查询：请从客户详情页查看单客授权状态。批量授权管理即将上线。'
        : 'Consent records: view per-customer consent in Customer Detail. Batch management coming soon.'}
    </div>
  );
}
