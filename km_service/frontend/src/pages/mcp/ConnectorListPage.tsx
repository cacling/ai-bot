/**
 * ConnectorListPage — 连接器管理（本地实现层）
 *
 * 管理 DB / API 连接依赖。
 * 连接器是 Tool Implementation 的后端连接。
 */
import { useState, useEffect, useCallback } from 'react';
import { Plus, Search, Trash2, Zap, ArrowLeft, Save } from 'lucide-react';
import { mcpApi, type Connector } from './api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { t, tpl, type Lang } from './i18n';

type View = 'list' | 'edit';
type ConnectorFilterType = 'all' | Connector['type'];
type ConnectorEditorType = Connector['type'];

export function ConnectorListPage({ lang = 'zh' as Lang }: { lang?: Lang }) {
  const T = t(lang);
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<ConnectorFilterType>('all');
  const [view, setView] = useState<View>('list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Map<string, { ok: boolean; error?: string; elapsed_ms?: number }>>(new Map());

  const load = useCallback(() => {
    setLoading(true);
    mcpApi.listConnectors().then(r => setConnectors(r.items)).catch(console.error).finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const handleDelete = async (c: Connector) => {
    if (!confirm(tpl(T.confirm_delete_connector, { name: c.name }))) return;
    await mcpApi.deleteConnector(c.id);
    load();
  };

  const handleTest = async (c: Connector) => {
    try {
      const res = await mcpApi.testConnector(c.id);
      setTestResults(prev => new Map(prev).set(c.id, res));
    } catch (err) {
      setTestResults(prev => new Map(prev).set(c.id, { ok: false, error: String(err) }));
    }
  };

  const filtered = connectors.filter(c => {
    if (search && !c.name.toLowerCase().includes(search.toLowerCase()) && !c.description?.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterType !== 'all' && c.type !== filterType) return false;
    return true;
  });

  const stats = {
    total: connectors.length,
    db: connectors.filter(c => c.type === 'db').length,
    api: connectors.filter(c => c.type === 'api').length,
  };

  if (view === 'edit') {
    return (
      <ConnectorEditor
        connectorId={editingId}
        onBack={() => { setView('list'); setEditingId(null); }}
        onSaved={() => { setView('list'); setEditingId(null); load(); }}
        lang={lang}
      />
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Stats */}
      {!loading && connectors.length > 0 && (
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: T.stat_all, value: stats.total, color: 'text-foreground' },
            { label: 'DB', value: stats.db, color: 'text-emerald-600' },
            { label: 'API', value: stats.api, color: 'text-blue-600' },
          ].map(card => (
            <div key={card.label} className="rounded-lg border p-3">
              <div className={`text-lg font-bold ${card.color}`}>{card.value}</div>
              <div className="text-[11px] text-muted-foreground">{card.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Search + filters */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder={T.search_connector} className="pl-8 text-xs h-8" />
        </div>
        <Select value={filterType} onValueChange={v => setFilterType((v as ConnectorFilterType | null) ?? 'all')}>
          <SelectTrigger className="w-32 text-xs h-8"><SelectValue placeholder={T.col_type} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{T.all_types}</SelectItem>
            <SelectItem value="db">DB</SelectItem>
            <SelectItem value="api">API</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Button size="sm" onClick={() => { setEditingId(null); setView('edit'); }}>
          <Plus size={12} /> {T.create_connector}
        </Button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-sm text-muted-foreground text-center py-8">{T.loading}</div>
      ) : connectors.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-8 border rounded-lg">
          {T.no_connectors_hint}
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <Table className="text-xs">
            <TableHeader>
              <TableRow>
                <TableHead className="w-40">{T.col_connector_name}</TableHead>
                <TableHead className="w-28 text-center">{T.col_type}</TableHead>
                <TableHead>{T.description}</TableHead>
                <TableHead className="w-20 text-center">{T.col_status}</TableHead>
                <TableHead className="w-20 text-center">{T.col_test}</TableHead>
                <TableHead className="w-28 text-center">{T.col_actions}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(c => {
                const testResult = testResults.get(c.id);
                return (
                  <TableRow
                    key={c.id}
                    className="cursor-pointer hover:bg-accent/50"
                    onClick={() => { setEditingId(c.id); setView('edit'); }}
                  >
                    <TableCell className="font-mono font-medium">{c.name}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className="text-[9px] px-1.5">
                        {c.type === 'db' ? 'DB' : 'API'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground truncate max-w-[200px]">{c.description || '—'}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant={c.status === 'active' ? 'default' : 'secondary'} className="text-[9px]">
                        {c.status === 'active' ? T.connector_normal : c.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      {testResult ? (
                        <Badge variant={testResult.ok ? 'default' : 'destructive'} className="text-[9px]">
                          {testResult.ok ? `${testResult.elapsed_ms}ms` : T.test_failed}
                        </Badge>
                      ) : (
                        <Button variant="ghost" size="xs" onClick={e => { e.stopPropagation(); handleTest(c); }}>
                          <Zap size={10} />
                        </Button>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Button variant="ghost" size="xs" onClick={e => { e.stopPropagation(); handleDelete(c); }}>
                        <Trash2 size={12} className="text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ── ConnectorEditor ──────────────────────────────────────────────────────────

function ConnectorEditor({ connectorId, onBack, onSaved, lang = 'zh' as Lang }: { connectorId: string | null; onBack: () => void; onSaved: () => void; lang?: Lang }) {
  const T = t(lang);
  const isEdit = !!connectorId;
  const [name, setName] = useState('');
  const [type, setType] = useState<ConnectorEditorType>('api');
  const [status, setStatus] = useState('active');
  const [description, setDescription] = useState('');
  const [configJson, setConfigJson] = useState('{}');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!connectorId) return;
    mcpApi.getConnector(connectorId).then(c => {
      setName(c.name);
      setType(c.type);
      setStatus(c.status);
      setDescription(c.description ?? '');
      setConfigJson(c.config ?? '{}');
    });
  }, [connectorId]);

  const handleSave = async () => {
    if (!name.trim()) return alert(T.connector_name_req);
    setSaving(true);
    try {
      if (isEdit) {
        await mcpApi.updateConnector(connectorId!, { name, type, status, description, config: configJson });
      } else {
        await mcpApi.createConnector({ name, type, status, description, config: configJson });
      }
      onSaved();
    } catch (e) {
      alert(`${T.save_failed} ${e}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft size={14} /> {T.back}</Button>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          <Save size={12} /> {saving ? T.saving : T.save}
        </Button>
      </div>

      <h2 className="text-sm font-semibold">{isEdit ? tpl(T.edit_connector, { name }) : T.create_connector}</h2>

      <div className="max-w-lg space-y-4">
        {!isEdit && (
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{T.connector_type}</label>
            <RadioGroup value={type} onValueChange={v => setType(v as typeof type)} className="flex gap-3">
              <Label className="flex items-center gap-1.5 text-xs font-normal cursor-pointer">
                <RadioGroupItem value="db" className="size-3" /> {T.db_type_label}
              </Label>
              <Label className="flex items-center gap-1.5 text-xs font-normal cursor-pointer">
                <RadioGroupItem value="api" className="size-3" /> {T.api_type_label}
              </Label>
            </RadioGroup>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">{T.connector_name}</label>
            <Input value={name} onChange={e => setName(e.target.value)} className="text-xs font-mono" placeholder="business_db" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">{T.col_status}</label>
            <Select value={status} onValueChange={value => setStatus(value ?? 'active')}>
              <SelectTrigger className="text-xs h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">{T.connector_active}</SelectItem>
                <SelectItem value="disabled">{T.connector_disabled}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">{T.description}</label>
          <Input value={description} onChange={e => setDescription(e.target.value)} className="text-xs" placeholder={T.connector_desc_ph} />
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">{T.config_json}</label>
          <Textarea
            value={configJson}
            onChange={e => setConfigJson(e.target.value)}
            className="text-xs font-mono min-h-[120px]"
            placeholder={type === 'db' ? '{ "connection_string": "sqlite:///path/to/db", "pool_size": 5 }' : '{ "base_url": "http://127.0.0.1:18008", "timeout": 5000 }'}
          />
          <p className="text-[10px] text-muted-foreground mt-1">
            {type === 'db' && T.db_config_hint}
            {type === 'api' && T.api_config_hint}
          </p>
        </div>
      </div>
    </div>
  );
}
