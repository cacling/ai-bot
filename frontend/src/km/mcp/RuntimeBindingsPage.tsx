/**
 * RuntimeBindingsPage — Tool Implementation 运行时绑定全局视图
 *
 * 展示 tool_implementations JOIN mcp_tools JOIN connectors JOIN mcp_servers 的联表结果。
 * 契约视角（schema/mock）在 Tool Contracts；这里是运行时视角（adapter/connector/policy/handler）。
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Search, ExternalLink } from 'lucide-react';
import { mcpApi, type RuntimeBindingRow } from './api';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BindingDetailDrawer } from './BindingDetailDrawer';

interface Props {
  onOpenTool?: (toolId: string, step?: string) => void;
  navigateToBinding?: string | null;
  onNavigateHandled?: () => void;
}

type StatusFilter = 'all' | 'active' | 'unbound' | 'misconfigured';
type AdapterFilter = 'all' | 'script' | 'remote_mcp' | 'api_proxy' | 'db' | 'mock';

const ADAPTER_LABELS: Record<string, string> = {
  script: 'Script',
  remote_mcp: 'MCP',
  api_proxy: 'API',
  db: 'DB',
  mock: 'Mock',
};

const ADAPTER_COLORS: Record<string, string> = {
  script: 'bg-blue-100 text-blue-700',
  remote_mcp: 'bg-purple-100 text-purple-700',
  api_proxy: 'bg-amber-100 text-amber-700',
  db: 'bg-emerald-100 text-emerald-700',
  mock: 'bg-gray-100 text-gray-600',
};

const KIND_COLORS: Record<string, string> = {
  internal: 'bg-sky-100 text-sky-700',
  external: 'bg-orange-100 text-orange-700',
  planned: 'bg-gray-100 text-gray-500',
};

function needsConnector(adapterType: string | null): boolean {
  return adapterType === 'db' || adapterType === 'api_proxy';
}

export function RuntimeBindingsPage({ onOpenTool }: Props) {
  const [items, setItems] = useState<RuntimeBindingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [adapterFilter, setAdapterFilter] = useState<AdapterFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const load = useCallback(() => {
    setLoading(true);
    mcpApi.listBindings()
      .then(r => setItems(r.items))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const stats = useMemo(() => {
    const active = items.filter(b => b.impl_status === 'active' && !b.disabled);
    const unbound = items.filter(b => !b.impl_id);
    const misconfigured = items.filter(b => needsConnector(b.adapter_type) && !b.connector_id);
    return {
      total: items.length,
      active: active.length,
      unbound: unbound.length,
      misconfigured: misconfigured.length,
    };
  }, [items]);

  const filtered = useMemo(() => {
    let result = items;

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(b =>
        b.tool_name.toLowerCase().includes(q) ||
        b.server_name.toLowerCase().includes(q) ||
        (b.connector_name ?? '').toLowerCase().includes(q)
      );
    }

    if (adapterFilter !== 'all') {
      result = result.filter(b => b.adapter_type === adapterFilter);
    }

    if (statusFilter === 'active') {
      result = result.filter(b => b.impl_status === 'active' && !b.disabled);
    } else if (statusFilter === 'unbound') {
      result = result.filter(b => !b.impl_id);
    } else if (statusFilter === 'misconfigured') {
      result = result.filter(b => needsConnector(b.adapter_type) && !b.connector_id);
    }

    return result;
  }, [items, search, adapterFilter, statusFilter]);

  function renderStatusBadges(b: RuntimeBindingRow) {
    const badges: Array<{ label: string; cls: string }> = [];
    if (b.disabled) {
      badges.push({ label: 'Disabled', cls: 'bg-red-100 text-red-600' });
    } else if (b.mocked) {
      badges.push({ label: 'Mocked', cls: 'bg-yellow-100 text-yellow-700' });
    }
    if (!b.impl_id) {
      badges.push({ label: 'Unbound', cls: 'bg-gray-100 text-gray-500' });
    } else if (b.impl_status === 'active') {
      badges.push({ label: 'Active', cls: 'bg-green-100 text-green-700' });
    } else {
      badges.push({ label: b.impl_status ?? 'Unknown', cls: 'bg-gray-100 text-gray-500' });
    }
    if (needsConnector(b.adapter_type) && !b.connector_id) {
      badges.push({ label: 'No Connector', cls: 'bg-red-50 text-red-500' });
    }
    return badges.map((bg, i) => (
      <Badge key={i} variant="outline" className={`text-[10px] px-1.5 py-0 ${bg.cls}`}>{bg.label}</Badge>
    ));
  }

  function parsePolicy(config: string | null): string {
    if (!config) return '\u2014';
    try {
      const obj = JSON.parse(config);
      const parts: string[] = [];
      if (obj.timeout_ms) parts.push(`${obj.timeout_ms}ms`);
      if (obj.channels) parts.push(Array.isArray(obj.channels) ? obj.channels.join(',') : String(obj.channels));
      if (obj.confirm_before_execute) parts.push('confirm');
      return parts.length > 0 ? parts.join(' / ') : '\u2014';
    } catch {
      return '\u2014';
    }
  }

  return (
    <div className="p-4 space-y-4">
      {/* Stats */}
      {!loading && items.length > 0 && (
        <div className="grid grid-cols-4 gap-3">
          <StatCard label="Total Bindings" value={stats.total} onClick={() => setStatusFilter('all')} active={statusFilter === 'all'} />
          <StatCard label="Active" value={stats.active} onClick={() => setStatusFilter('active')} active={statusFilter === 'active'} />
          <StatCard label="Unbound" value={stats.unbound} onClick={() => setStatusFilter('unbound')} active={statusFilter === 'unbound'} warn={stats.unbound > 0} />
          <StatCard label="Misconfigured" value={stats.misconfigured} onClick={() => setStatusFilter('misconfigured')} active={statusFilter === 'misconfigured'} warn={stats.misconfigured > 0} />
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search tool / server / connector..."
            className="pl-8 text-xs h-8"
          />
        </div>
        <Select value={adapterFilter} onValueChange={v => setAdapterFilter(v as AdapterFilter)}>
          <SelectTrigger className="w-36 text-xs h-8">
            <SelectValue placeholder="Adapter" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Adapters</SelectItem>
            <SelectItem value="script">Script</SelectItem>
            <SelectItem value="remote_mcp">MCP</SelectItem>
            <SelectItem value="api_proxy">API</SelectItem>
            <SelectItem value="db">DB</SelectItem>
            <SelectItem value="mock">Mock</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-xs text-muted-foreground p-6">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="text-xs text-muted-foreground p-6">No bindings found.</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="text-xs">
              <TableHead className="w-[220px]">Tool</TableHead>
              <TableHead className="w-[140px]">Server</TableHead>
              <TableHead className="w-[80px]">Adapter</TableHead>
              <TableHead className="w-[120px]">Connector</TableHead>
              <TableHead className="w-[160px]">Handler</TableHead>
              <TableHead className="w-[120px]">Policy</TableHead>
              <TableHead className="w-[140px]">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map(b => (
              <TableRow
                key={b.tool_id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => onOpenTool?.(b.tool_id, 'implementation')}
              >
                <TableCell>
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-mono font-medium">{b.tool_name}</span>
                    {onOpenTool && <ExternalLink size={10} className="text-muted-foreground" />}
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate max-w-[200px]">{b.tool_description}</div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs">{b.server_name}</span>
                    <Badge variant="outline" className={`text-[9px] px-1 py-0 ${KIND_COLORS[b.server_kind] ?? ''}`}>
                      {b.server_kind}
                    </Badge>
                  </div>
                </TableCell>
                <TableCell>
                  {b.adapter_type ? (
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${ADAPTER_COLORS[b.adapter_type] ?? ''}`}>
                      {ADAPTER_LABELS[b.adapter_type] ?? b.adapter_type}
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">{'\u2014'}</span>
                  )}
                </TableCell>
                <TableCell className="text-xs">
                  {b.connector_name ? (
                    <span className="font-mono">{b.connector_name}</span>
                  ) : (
                    <span className="text-muted-foreground">{'\u2014'}</span>
                  )}
                </TableCell>
                <TableCell className="text-xs font-mono text-muted-foreground truncate max-w-[160px]">
                  {b.handler_key ?? '\u2014'}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {parsePolicy(b.config)}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {renderStatusBadges(b)}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function StatCard({ label, value, onClick, active, warn }: {
  label: string;
  value: number;
  onClick: () => void;
  active?: boolean;
  warn?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`p-3 rounded-lg border text-left transition-colors ${
        active ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
      }`}
    >
      <div className={`text-lg font-semibold ${warn ? 'text-amber-600' : ''}`}>{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </button>
  );
}
