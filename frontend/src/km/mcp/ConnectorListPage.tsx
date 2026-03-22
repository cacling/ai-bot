/**
 * ConnectorListPage — 连接器管理（本地实现层）
 *
 * 管理 DB / API / Remote MCP 连接依赖。
 * 连接器不是 MCP Resource，而是 Tool Implementation 的后端连接。
 */
import { useState, useEffect, useCallback } from 'react';
import { Plus, Search, Trash2, Zap, Database, Globe, Server, Plug, ArrowLeft, Save, X } from 'lucide-react';
import { mcpApi, type Connector } from './api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';

type View = 'list' | 'edit';

export function ConnectorListPage() {
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [view, setView] = useState<View>('list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Map<string, { ok: boolean; error?: string; elapsed_ms?: number }>>(new Map());

  const load = useCallback(() => {
    setLoading(true);
    mcpApi.listConnectors().then(r => setConnectors(r.items)).catch(console.error).finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const handleDelete = async (c: Connector) => {
    if (!confirm(`确定删除连接器 ${c.name}？`)) return;
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
    api: connectors.filter(c => c.type === 'api').length,
    mcp: connectors.filter(c => c.type === 'remote_mcp').length,
  };

  if (view === 'edit') {
    return (
      <ConnectorEditor
        connectorId={editingId}
        onBack={() => { setView('list'); setEditingId(null); }}
        onSaved={() => { setView('list'); setEditingId(null); load(); }}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      {!loading && connectors.length > 0 && (
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: '全部', value: stats.total, color: 'text-foreground' },
            { label: 'API (mock/prod)', value: stats.api, color: 'text-blue-600' },
            { label: 'Remote MCP', value: stats.mcp, color: 'text-purple-600' },
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
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索连接器" className="pl-8 text-xs h-8" />
        </div>
        <Select value={filterType} onValueChange={v => setFilterType(v)}>
          <SelectTrigger className="w-32 text-xs h-8"><SelectValue placeholder="类型" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部类型</SelectItem>
            <SelectItem value="api">API</SelectItem>
            <SelectItem value="remote_mcp">Remote MCP</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Button size="sm" onClick={() => { setEditingId(null); setView('edit'); }}>
          <Plus size={12} /> 新建连接器
        </Button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-sm text-muted-foreground text-center py-8">加载中...</div>
      ) : connectors.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-8 border rounded-lg">
          暂无连接器。连接器是 Tool 实现层的后端连接依赖（DB / API / Remote MCP）。
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <Table className="text-xs">
            <TableHeader>
              <TableRow>
                <TableHead className="w-40">连接器名</TableHead>
                <TableHead className="w-28 text-center">类型</TableHead>
                <TableHead>描述</TableHead>
                <TableHead className="w-20 text-center">状态</TableHead>
                <TableHead className="w-20 text-center">测试</TableHead>
                <TableHead className="w-28 text-center">操作</TableHead>
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
                        {c.type === 'remote_mcp' ? 'MCP' : c.type === 'db' ? 'DB' : 'API'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground truncate max-w-[200px]">{c.description || '—'}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant={c.status === 'active' ? 'default' : 'secondary'} className="text-[9px]">
                        {c.status === 'active' ? '正常' : c.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      {testResult ? (
                        <Badge variant={testResult.ok ? 'default' : 'destructive'} className="text-[9px]">
                          {testResult.ok ? `${testResult.elapsed_ms}ms` : '失败'}
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

function ConnectorEditor({ connectorId, onBack, onSaved }: { connectorId: string | null; onBack: () => void; onSaved: () => void }) {
  const isEdit = !!connectorId;
  const [name, setName] = useState('');
  const [type, setType] = useState<'api' | 'remote_mcp'>('api');
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
    if (!name.trim()) return alert('连接器名不能为空');
    setSaving(true);
    try {
      if (isEdit) {
        await mcpApi.updateConnector(connectorId!, { name, type, status, description, config: configJson });
      } else {
        await mcpApi.createConnector({ name, type, status, description, config: configJson });
      }
      onSaved();
    } catch (e) {
      alert(`保存失败: ${e}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft size={14} /> 返回</Button>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          <Save size={12} /> {saving ? '保存中...' : '保存'}
        </Button>
      </div>

      <h2 className="text-sm font-semibold">{isEdit ? `编辑连接器: ${name}` : '新建连接器'}</h2>

      <div className="max-w-lg space-y-4">
        {!isEdit && (
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">连接器类型</label>
            <RadioGroup value={type} onValueChange={v => setType(v as typeof type)} className="flex gap-3">
              <Label className="flex items-center gap-1.5 text-xs font-normal cursor-pointer">
                <RadioGroupItem value="api" className="size-3" /> API (mock_apis / 真实系统)
              </Label>
              <Label className="flex items-center gap-1.5 text-xs font-normal cursor-pointer">
                <RadioGroupItem value="remote_mcp" className="size-3" /> Remote MCP
              </Label>
            </RadioGroup>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">连接器名</label>
            <Input value={name} onChange={e => setName(e.target.value)} className="text-xs font-mono" placeholder="business_db" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">状态</label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="text-xs h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="disabled">Disabled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">描述</label>
          <Input value={description} onChange={e => setDescription(e.target.value)} className="text-xs" placeholder="连接器描述" />
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">配置 JSON</label>
          <Textarea
            value={configJson}
            onChange={e => setConfigJson(e.target.value)}
            className="text-xs font-mono min-h-[120px]"
            placeholder={type === 'api' ? '{ "base_url": "http://127.0.0.1:18008", "timeout": 5000 }' : '{ "url": "http://.../mcp", "transport": "http" }'}
          />
          <p className="text-[10px] text-muted-foreground mt-1">
            {type === 'api' && '配置项：base_url, method, headers, timeout（demo 阶段指向 mock_apis，生产替换为真实 URL）'}
            {type === 'remote_mcp' && '配置项：url, transport, headers'}
          </p>
        </div>
      </div>
    </div>
  );
}
