/**
 * McpToolListPage.tsx — MCP 工具管理页（列表 + 编辑视图切换）
 *
 * Phase 2: 统计卡片 + 多维筛选 + 契约/风险列
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Search, AlertTriangle, Check, Circle } from 'lucide-react';
import { mcpApi, type McpToolRecord, type McpServer } from './api';
import { McpToolEditor } from './McpToolEditor';
import { CreateToolDialog } from './CreateToolDialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { t, tpl, type Lang } from './i18n';

type View = 'list' | 'edit';
type QuickFilter = 'all' | 'no_contract' | 'mock_on' | 'has_risk' | 'ready';

interface Props {
  navigateToTool?: { toolId: string; step?: string; fromServer?: string; toolName?: string } | null;
  onNavigateHandled?: () => void;
  onOpenBinding?: (toolId: string) => void;
  lang?: Lang;
}

export function McpToolListPage({ navigateToTool, onNavigateHandled, onOpenBinding, lang = 'zh' as Lang }: Props = {}) {
  const T = t(lang);
  const [tools, setTools] = useState<McpToolRecord[]>([]);
  const [servers, setServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('list');
  const [editId, setEditId] = useState<string | null>(null);
  const [editInitialStep, setEditInitialStep] = useState<string | undefined>(undefined);
  const [editFromServer, setEditFromServer] = useState<string | undefined>(undefined);

  // Create dialog
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');
  const [filterImpl, setFilterImpl] = useState<string>('all');
  const [filterServer, setFilterServer] = useState<string>('all');

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      mcpApi.listTools(),
      mcpApi.listServers(),
    ]).then(([toolsRes, serversRes]) => {
      setTools(toolsRes.items);
      setServers(serversRes.items);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  // Handle external navigation (from Server Console or Skill Manager)
  useEffect(() => {
    if (!navigateToTool) return;

    // 通过 toolId 直接跳转（来自 Server Console）
    if (navigateToTool.toolId) {
      setEditId(navigateToTool.toolId);
      setEditInitialStep(navigateToTool.step);
      setEditFromServer(navigateToTool.fromServer);
      setView('edit');
      onNavigateHandled?.();
      return;
    }

    // 通过 toolName 查找（来自技能管理）
    if (navigateToTool.toolName && tools.length > 0) {
      const target = tools.find(t => t.name === navigateToTool.toolName);
      if (target) {
        setEditId(target.id);
        setEditInitialStep(navigateToTool.step);
        setEditFromServer(navigateToTool.fromServer);
        setView('edit');
      }
      onNavigateHandled?.();
    }
  }, [navigateToTool, tools]);

  // ── Derived data ────────────────────────────────────────────────────────────

  const serverName = (id: string | null) => {
    if (!id) return '—';
    return servers.find(s => s.id === id)?.name ?? id;
  };

  const implLabel = (tool: McpToolRecord) => {
    if (!tool.adapter_type) return null;
    if (tool.adapter_type === 'script') return T.adapter_script;
    if (tool.adapter_type === 'remote_mcp') return T.adapter_mcp;
    if (tool.adapter_type === 'api_proxy') return T.adapter_api;
    if (tool.adapter_type === 'db') return T.adapter_db;
    if (tool.adapter_type === 'mock') return T.adapter_mock;
    return tool.adapter_type;
  };

  const toolStatus = (tool: McpToolRecord) => {
    if (tool.disabled) return { label: T.status_disabled, variant: 'secondary' as const };
    if (tool.mocked) return { label: T.status_mocked, variant: 'secondary' as const };
    if (!tool.adapter_type || (!tool.output_schema && !tool.input_schema)) return { label: T.status_pending, variant: 'outline' as const };
    if (!tool.output_schema) return { label: T.status_no_contract, variant: 'destructive' as const };
    if (tool.risk_flags && tool.risk_flags.length > 0) return { label: T.status_has_risk, variant: 'destructive' as const };
    if (tool.mock_aligned === false) return { label: T.status_mock_drift, variant: 'destructive' as const };
    return { label: T.status_ready, variant: 'default' as const };
  };

  const contractStatus = (tool: McpToolRecord): { label: string; ok: boolean } => {
    if (!tool.input_schema && !tool.output_schema) return { label: T.contract_undefined, ok: false };
    if (!tool.output_schema) return { label: T.contract_no_output, ok: false };
    if (!tool.input_schema) return { label: T.contract_no_input, ok: false };
    if (tool.mock_aligned === false) return { label: T.contract_defined_drift, ok: false };
    return { label: T.contract_defined_ok, ok: true };
  };

  const getToolRisks = (tool: McpToolRecord): string[] => {
    return tool.risk_flags ?? [];
  };

  // ── Stats ───────────────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const noContract = tools.filter(t => !t.output_schema).length;
    const mockOn = tools.filter(t => t.mocked).length;
    const hasRisks = tools.filter(t => (t.risk_flags?.length ?? 0) > 0 || t.mock_aligned === false).length;
    const ready = tools.filter(t => toolStatus(t).label === T.status_ready).length;
    return { total: tools.length, noContract, mockOn, hasRisks, ready };
  }, [tools, T]);

  // ── Filtered list ───────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let list = tools;

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(t =>
        t.name.toLowerCase().includes(q) ||
        t.description?.toLowerCase().includes(q) ||
        (t.skills ?? []).some(s => s.toLowerCase().includes(q)) ||
        serverName(t.server_id).toLowerCase().includes(q)
      );
    }

    // Quick filter
    if (quickFilter === 'no_contract') list = list.filter(t => !t.output_schema);
    else if (quickFilter === 'mock_on') list = list.filter(t => t.mocked);
    else if (quickFilter === 'has_risk') list = list.filter(t => (t.risk_flags?.length ?? 0) > 0 || t.mock_aligned === false);
    else if (quickFilter === 'ready') list = list.filter(t => toolStatus(t).label === T.status_ready);

    // Impl filter
    if (filterImpl !== 'all') list = list.filter(t => (t.adapter_type ?? 'none') === filterImpl);

    // Server filter
    if (filterServer !== 'all') list = list.filter(t => t.server_id === filterServer);

    return list;
  }, [tools, search, quickFilter, filterImpl, filterServer, T]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleDelete = async (tool: McpToolRecord) => {
    if (!confirm(tpl(T.confirm_delete_tool, { name: tool.name }))) return;
    await mcpApi.deleteTool(tool.id);
    load();
  };

  const handleToggleMock = async (tool: McpToolRecord) => {
    if (!tool.mocked && !tool.mock_rules) {
      alert(T.mock_rules_required);
      return;
    }
    await mcpApi.toggleToolMock(tool.id);
    load();
  };

  const handleToggleDisable = async (tool: McpToolRecord) => {
    await mcpApi.toggleToolDisable(tool.id);
    load();
  };

  // ── Edit view ───────────────────────────────────────────────────────────────

  const handleEditorBack = () => {
    setView('list');
    setEditId(null);
    setEditInitialStep(undefined);
    setEditFromServer(undefined);
  };

  // ── 双视图：list + editor 同时渲染，用 hidden 切换 ──

  return (
    <>
    {/* Editor（editId 存在时渲染，hidden 切换） */}
    {editId && (
      <div className={view !== 'edit' ? 'hidden' : 'h-full'}>
        <McpToolEditor
          toolId={editId}
          onBack={handleEditorBack}
          onUpdated={load}
          initialStep={editInitialStep as any}
          fromServer={editFromServer}
          onOpenBinding={onOpenBinding}
          lang={lang}
        />
      </div>
    )}

    {/* List */}
    <div className={view !== 'list' ? 'hidden' : ''}>
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div /> {/* Tab 标题已在上层显示 */}
        <Button size="sm" onClick={() => setShowCreateDialog(true)}><Plus size={13} /> {T.create}</Button>
      </div>

      {/* Stats cards */}
      {!loading && tools.length > 0 && (
        <div className="grid grid-cols-5 gap-2">
          {([
            { key: 'all' as QuickFilter, label: T.stat_all, value: stats.total, color: 'text-foreground' },
            { key: 'no_contract' as QuickFilter, label: T.stat_no_contract, value: stats.noContract, color: 'text-destructive' },
            { key: 'has_risk' as QuickFilter, label: T.stat_has_risk, value: stats.hasRisks, color: 'text-destructive' },
            { key: 'mock_on' as QuickFilter, label: T.status_mocked, value: stats.mockOn, color: 'text-amber-600' },
            { key: 'ready' as QuickFilter, label: T.stat_ready, value: stats.ready, color: 'text-emerald-600' },
          ]).map(card => (
            <button
              key={card.key}
              onClick={() => setQuickFilter(quickFilter === card.key ? 'all' : card.key)}
              className={`rounded-lg border p-3 text-left transition-colors ${
                quickFilter === card.key ? 'border-primary bg-primary/5' : 'hover:bg-accent'
              }`}
            >
              <div className={`text-lg font-bold ${card.color}`}>{card.value}</div>
              <div className="text-[11px] text-muted-foreground">{card.label}</div>
            </button>
          ))}
        </div>
      )}

      {/* Search + filters */}
      {!loading && tools.length > 0 && (
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-xs">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={T.search_tool_hint}
              className="pl-8 text-xs h-8"
            />
          </div>
          <Select value={filterImpl} onValueChange={v => setFilterImpl(v ?? 'all')}>
            <SelectTrigger className="w-32 text-xs h-8"><SelectValue placeholder={T.adapter_type} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{T.all_adapters}</SelectItem>
              <SelectItem value="script">{T.adapter_script}</SelectItem>
              <SelectItem value="remote_mcp">{T.adapter_mcp}</SelectItem>
              <SelectItem value="api_proxy">{T.adapter_api_proxy}</SelectItem>
              <SelectItem value="db">{T.adapter_db}</SelectItem>
              <SelectItem value="none">{T.not_configured}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterServer} onValueChange={v => setFilterServer(v ?? 'all')}>
            <SelectTrigger className="w-36 text-xs h-8"><SelectValue placeholder="Server" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{T.all_servers}</SelectItem>
              {servers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {(search || quickFilter !== 'all' || filterImpl !== 'all' || filterServer !== 'all') && (
            <Button variant="ghost" size="xs" onClick={() => { setSearch(''); setQuickFilter('all'); setFilterImpl('all'); setFilterServer('all'); }}>
              {T.clear_filters}
            </Button>
          )}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="text-sm text-muted-foreground">{T.loading}</div>
      ) : tools.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-8">{T.no_tools}</div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <Table className="text-xs">
            <TableHeader>
              <TableRow>
                <TableHead className="w-40">{T.tool_name_label}</TableHead>
                <TableHead className="w-24">Server</TableHead>
                <TableHead className="w-16 text-center">Adapter</TableHead>
                <TableHead className="w-24 text-center">{T.col_skill}</TableHead>
                <TableHead className="w-20 text-center">{T.col_contract}</TableHead>
                <TableHead className="w-28 text-center">{T.col_mode}</TableHead>
                <TableHead className="w-20 text-center">{T.col_status}</TableHead>
                <TableHead className="w-24 text-center">{T.col_risk}</TableHead>
                <TableHead className="w-16 text-center">{T.col_actions}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(tool => {
                const status = toolStatus(tool);
                const impl = implLabel(tool);
                const contract = contractStatus(tool);
                const risks = getToolRisks(tool);
                return (
                  <TableRow key={tool.id} className="cursor-pointer" onClick={() => { setEditId(tool.id); setView('edit'); }}>
                    <TableCell>
                      <div className="font-mono font-semibold">{tool.name}</div>
                      {tool.description && <div className="text-[10px] text-muted-foreground truncate max-w-[160px]">{tool.description}</div>}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-[11px]">{serverName(tool.server_id)}</TableCell>
                    <TableCell className="text-center">
                      {impl ? <Badge variant="outline" className="text-[10px]">{impl}</Badge> : <span className="text-muted-foreground text-[10px]">—</span>}
                    </TableCell>
                    <TableCell className="text-center">
                      {(tool.skills ?? []).length > 0
                        ? (tool.skills ?? []).slice(0, 2).map(s => <Badge key={s} variant="secondary" className="text-[10px] mr-0.5">{s}</Badge>)
                        : <span className="text-muted-foreground">—</span>
                      }
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        {contract.ok
                          ? <Check size={11} className="text-emerald-500" />
                          : <AlertTriangle size={11} className="text-amber-500" />
                        }
                        <span className={`text-[10px] ${contract.ok ? 'text-emerald-600' : 'text-amber-600'}`}>{contract.label}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1.5">
                        <span className={`text-[11px] ${!tool.mocked ? 'font-medium text-emerald-600' : 'text-muted-foreground'}`}>{T.mode_real}</span>
                        <button
                          onClick={() => handleToggleMock(tool)}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${tool.mocked ? 'bg-amber-500' : 'bg-emerald-500'}`}
                        >
                          <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${tool.mocked ? 'translate-x-[18px]' : 'translate-x-[3px]'}`} />
                        </button>
                        <span className={`text-[11px] ${tool.mocked ? 'font-medium text-amber-600' : 'text-muted-foreground'}`}>{T.mode_mock}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={status.variant} className="text-[10px]">{status.label}</Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      {risks.length > 0
                        ? <span className="text-[10px] text-amber-600 flex items-center justify-center gap-0.5" title={risks.join('\n')}><AlertTriangle size={10} /> {risks[0]}</span>
                        : <span className="text-[10px] text-emerald-500">—</span>
                      }
                    </TableCell>
                    <TableCell className="text-center" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1">
                        <Button variant="ghost" size="xs" onClick={() => handleToggleDisable(tool)}>
                          {tool.disabled ? T.enable_tool : T.disable_tool}
                        </Button>
                        <Button variant="ghost" size="xs" className="text-destructive hover:text-destructive" onClick={() => handleDelete(tool)}>{T.delete}</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-6">{T.no_match_tools}</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
      <CreateToolDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onCreated={(id, step) => {
          setEditId(id);
          setEditInitialStep(step);
          setEditFromServer(undefined);
          setView('edit');
          load();
        }}
        lang={lang}
      />
    </div>
    </div>
    </>
  );
}
