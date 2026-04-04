/**
 * WorkOrdersFilterBar.tsx — Search + filter bar for work order pages.
 */
import { memo } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { type Lang, T } from '../i18n';

interface WorkOrdersFilterBarProps {
  lang: Lang;
  keyword: string;
  onKeywordChange: (v: string) => void;
  statusFilter: string;
  onStatusChange: (v: string) => void;
  onReset: () => void;
  statusOptions?: readonly string[];
}

const DEFAULT_STATUS_OPTIONS = ['', 'new', 'open', 'scheduled', 'in_progress', 'waiting_customer', 'resolved', 'closed', 'cancelled'] as const;

export const WorkOrdersFilterBar = memo(function WorkOrdersFilterBar({
  lang,
  keyword,
  onKeywordChange,
  statusFilter,
  onStatusChange,
  onReset,
  statusOptions = DEFAULT_STATUS_OPTIONS,
}: WorkOrdersFilterBarProps) {
  const t = T[lang];
  return (
    <div className="flex items-center gap-2 flex-shrink-0">
      <div className="relative flex-1 max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={keyword}
          onChange={e => onKeywordChange(e.target.value)}
          placeholder={t.wo_search_placeholder}
          className="pl-9"
        />
      </div>
      <Select value={statusFilter} onValueChange={v => onStatusChange(!v || v === '__all' ? '' : v)}>
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder={t.wo_filter_status} />
        </SelectTrigger>
        <SelectContent>
          {statusOptions.map(s => (
            <SelectItem key={s || '__all'} value={s || '__all'}>
              {s || t.wo_filter_all}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button variant="outline" size="sm" onClick={onReset}>
        {t.wo_filter_reset}
      </Button>
    </div>
  );
});
