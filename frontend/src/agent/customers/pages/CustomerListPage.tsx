/**
 * CustomerListPage.tsx — 客户列表页
 *
 * 搜索区 + 状态筛选 + 客户表格 + 分页
 */
import { memo, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAgentContext } from '../../AgentContext';
import { fetchCustomerList, type CustomerListItem } from '../api';

const STATUS_OPTIONS: { value: string; zh: string; en: string }[] = [
  { value: '', zh: '全部状态', en: 'All Status' },
  { value: 'active', zh: '活跃', en: 'Active' },
  { value: 'inactive', zh: '非活跃', en: 'Inactive' },
  { value: 'merged', zh: '已合并', en: 'Merged' },
];

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  active: 'default',
  inactive: 'secondary',
  merged: 'outline',
  deleted: 'destructive',
};

function maskPhone(phone: string): string {
  if (phone.length >= 7) {
    return phone.slice(0, 3) + '****' + phone.slice(-4);
  }
  return phone;
}

function parseProfileField(json: string | null | undefined, field: string): string {
  if (!json) return '-';
  try {
    const obj = JSON.parse(json);
    return obj[field] ?? '-';
  } catch {
    return '-';
  }
}

export const CustomerListPage = memo(function CustomerListPage() {
  const { lang } = useAgentContext();
  const navigate = useNavigate();
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [items, setItems] = useState<CustomerListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchCustomerList({
        page,
        page_size: pageSize,
        keyword: keyword || undefined,
        status: status || undefined,
      });
      setItems(res.items);
      setTotal(res.total);
    } catch (err) {
      console.error('Failed to load customers:', err);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, keyword, status]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.ceil(total / pageSize) || 1;

  const handleSearch = () => {
    setPage(1);
    load();
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Search & Filter bar */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-border flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-[360px]">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder={lang === 'zh' ? '搜索姓名 / 手机号...' : 'Search name / phone...'}
            className="pl-8 h-8 text-sm"
          />
        </div>
        <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
          <SelectTrigger className="w-[130px] h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt[lang]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" onClick={handleSearch} className="h-8">
          {lang === 'zh' ? '查询' : 'Search'}
        </Button>
        <div className="ml-auto text-xs text-muted-foreground">
          {lang === 'zh' ? `共 ${total} 条` : `${total} total`}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[180px]">{lang === 'zh' ? '客户姓名' : 'Name'}</TableHead>
              <TableHead className="w-[140px]">{lang === 'zh' ? '手机号' : 'Phone'}</TableHead>
              <TableHead className="w-[80px]">{lang === 'zh' ? '状态' : 'Status'}</TableHead>
              <TableHead className="w-[80px]">{lang === 'zh' ? '等级' : 'Tier'}</TableHead>
              <TableHead className="w-[80px]">{lang === 'zh' ? '性别' : 'Gender'}</TableHead>
              <TableHead className="w-[100px]">{lang === 'zh' ? '地区' : 'Region'}</TableHead>
              <TableHead className="w-[160px]">{lang === 'zh' ? '更新时间' : 'Updated'}</TableHead>
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
                  {lang === 'zh' ? '暂无数据' : 'No data'}
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => (
                <TableRow
                  key={item.party_id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => navigate(`/staff/operations/customers/detail/${item.party_id}`)}
                >
                  <TableCell className="font-medium">
                    {item.display_name || item.canonical_name || '-'}
                  </TableCell>
                  <TableCell className="text-muted-foreground font-mono text-xs">
                    {item.primary_identity?.identity_type === 'phone'
                      ? maskPhone(item.primary_identity.identity_value)
                      : item.primary_identity?.identity_value ?? '-'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[item.status] ?? 'secondary'} className="text-[10px]">
                      {item.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">
                    {parseProfileField(item.profile?.basic_profile_json, 'customer_tier')}
                  </TableCell>
                  <TableCell className="text-xs">
                    {parseProfileField(item.profile?.basic_profile_json, 'gender')}
                  </TableCell>
                  <TableCell className="text-xs">
                    {parseProfileField(item.profile?.basic_profile_json, 'region')}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {item.updated_at ? new Date(item.updated_at).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US') : '-'}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex-shrink-0 px-4 py-2 border-t border-border flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          {lang === 'zh'
            ? `第 ${page} / ${totalPages} 页`
            : `Page ${page} of ${totalPages}`}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft size={14} />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            <ChevronRight size={14} />
          </Button>
        </div>
      </div>
    </div>
  );
});
