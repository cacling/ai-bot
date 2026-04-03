/**
 * SearchDialog.tsx — Global workspace search (Cmd+K).
 *
 * Searches interactions by customer_party_id, handoff_summary, interaction_id.
 * Results link to the corresponding interaction in the inbox.
 */
import { memo, useState, useCallback, useEffect, useRef } from 'react';
import { Search, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { type Lang } from '../../i18n';

const IX_API_BASE = '/ix-api';

interface SearchResult {
  interaction_id: string;
  customer_party_id: string | null;
  channel: string;
  state: string;
  queue_code: string | null;
  handoff_summary: string | null;
  priority: number;
  updated_at: string;
}

interface SearchDialogProps {
  open: boolean;
  lang: Lang;
  onClose: () => void;
  onSelectInteraction: (interactionId: string) => void;
}

const STATE_LABELS: Record<string, Record<Lang, string>> = {
  assigned: { zh: '已分配', en: 'Assigned' },
  active: { zh: '处理中', en: 'Active' },
  wrapping_up: { zh: '收尾中', en: 'Wrapping Up' },
  queued: { zh: '排队中', en: 'Queued' },
  closed: { zh: '已关闭', en: 'Closed' },
};

export const SearchDialog = memo(function SearchDialog({
  open,
  lang,
  onClose,
  onSelectInteraction,
}: SearchDialogProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Focus input when dialog opens
  useEffect(() => {
    if (open) {
      setQuery('');
      setResults([]);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Global Cmd+K listener
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (!open) {
          // Parent handles opening — this is just a convenience
        }
      }
      if (e.key === 'Escape' && open) {
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${IX_API_BASE}/api/interactions?search=${encodeURIComponent(q)}&limit=20`);
      if (res.ok) {
        const data = await res.json();
        setResults(data.items ?? []);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInputChange = useCallback((value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(value), 300);
  }, [doSearch]);

  const handleSelect = useCallback((id: string) => {
    onSelectInteraction(id);
    onClose();
  }, [onSelectInteraction, onClose]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50" onClick={onClose} />

      {/* Dialog */}
      <div className="fixed top-[20%] left-1/2 -translate-x-1/2 w-full max-w-lg z-50 bg-popover border border-border rounded-lg shadow-2xl overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
          <Search size={16} className="text-muted-foreground shrink-0" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => handleInputChange(e.target.value)}
            placeholder={lang === 'zh' ? '搜索会话、客户、手机号...' : 'Search interactions, customers, phone...'}
            className="border-0 shadow-none focus-visible:ring-0 text-sm h-8"
          />
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 shrink-0" onClick={onClose}>
            <X size={14} />
          </Button>
        </div>

        {/* Results */}
        <div className="max-h-[300px] overflow-y-auto">
          {loading && (
            <div className="px-3 py-4 text-center text-sm text-muted-foreground">
              {lang === 'zh' ? '搜索中...' : 'Searching...'}
            </div>
          )}

          {!loading && query && results.length === 0 && (
            <div className="px-3 py-4 text-center text-sm text-muted-foreground">
              {lang === 'zh' ? '无匹配结果' : 'No results found'}
            </div>
          )}

          {!loading && results.map((r) => (
            <button
              key={r.interaction_id}
              onClick={() => handleSelect(r.interaction_id)}
              className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-muted transition-colors border-b border-border last:border-b-0"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium truncate">
                    {r.customer_party_id?.slice(0, 11) ?? r.interaction_id.slice(0, 8)}
                  </span>
                  {r.queue_code && (
                    <Badge variant="outline" className="text-[10px] px-1 py-0 h-3.5 font-normal">
                      {r.queue_code}
                    </Badge>
                  )}
                  <Badge variant="secondary" className="text-[10px] px-1 py-0 h-3.5 font-normal">
                    {STATE_LABELS[r.state]?.[lang] ?? r.state}
                  </Badge>
                </div>
                {r.handoff_summary && (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{r.handoff_summary.slice(0, 80)}</p>
                )}
              </div>
              <span className="text-[10px] text-muted-foreground shrink-0">
                {r.interaction_id.slice(0, 8)}
              </span>
            </button>
          ))}

          {!loading && !query && (
            <div className="px-3 py-4 text-center text-xs text-muted-foreground">
              <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">⌘K</kbd>
              {' '}{lang === 'zh' ? '打开搜索' : 'to search'}
            </div>
          )}
        </div>
      </div>
    </>
  );
});
