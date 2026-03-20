/**
 * McpServerForm.tsx — MCP Server 编辑页（基本信息 + 资源管理）
 *
 * 工具管理已移到独立的 McpToolListPage
 */
import React, { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Save, Plus, Trash2, Plug, RefreshCw } from 'lucide-react';
import { mcpApi, type McpServer, type McpResource } from './api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';

interface Props {
  serverId?: string;
  onBack: () => void;
  onSaved: () => void;
}

// ── Resource Edit Dialog ────────────────────────────────────────────────────
function ResourceEditDialog({ resource, serverId, onSave, onCancel }: {
  resource: Partial<McpResource> | null; // null = new
  serverId: string;
  onSave: () => void;
  onCancel: () => void;
}) {
  const isNew = !resource?.id;
  const [type, setType] = useState<'db' | 'remote_mcp' | 'api'>(resource?.type ?? 'remote_mcp');
  const [name, setName] = useState(resource?.name ?? '');
  const [status, setStatus] = useState(resource?.status ?? 'active');
  // DB
  const [dbMode, setDbMode] = useState(resource?.db_mode ?? 'readwrite');
  // Remote MCP
  const [mcpTransport, setMcpTransport] = useState(resource?.mcp_transport ?? 'http');
  const [mcpUrl, setMcpUrl] = useState(resource?.mcp_url ?? '');
  const [mcpHeaders, setMcpHeaders] = useState(resource?.mcp_headers ?? '');
  // API
  const [apiBaseUrl, setApiBaseUrl] = useState(resource?.api_base_url ?? '');
  const [apiHeaders, setApiHeaders] = useState(resource?.api_headers ?? '');

  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) { alert('资源名不能为空'); return; }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        server_id: serverId,
        name: name.trim(),
        type,
        status,
        db_mode: type === 'db' ? dbMode : null,
        mcp_transport: type === 'remote_mcp' ? mcpTransport : null,
        mcp_url: type === 'remote_mcp' ? mcpUrl || null : null,
        mcp_headers: type === 'remote_mcp' && mcpHeaders ? mcpHeaders : null,
        api_base_url: type === 'api' ? apiBaseUrl || null : null,
        api_headers: type === 'api' && apiHeaders ? apiHeaders : null,
      };
      if (isNew) {
        await mcpApi.createResource(body as any);
      } else {
        await mcpApi.updateResource(resource!.id!, body as any);
      }
      onSave();
    } catch (e) {
      alert(`保存失败: ${e}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/80 flex items-center justify-center" onClick={onCancel}>
      <div className="bg-background border rounded-lg shadow-lg w-[500px] max-h-[80vh] overflow-auto p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-semibold">{isNew ? '新增资源' : `编辑资源: ${resource?.name}`}</h3>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">资源名</label>
            <Input value={name} onChange={e => setName(e.target.value)} className="text-xs font-mono" placeholder="business_db" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">类型</label>
            <Select value={type} onValueChange={v => v && setType(v as typeof type)}>
              <SelectTrigger className="text-xs h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="db">数据库 (DB)</SelectItem>
                <SelectItem value="remote_mcp">远程 MCP</SelectItem>
                <SelectItem value="api" disabled>API（即将支持）</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {type === 'db' && (
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">权限</label>
            <RadioGroup value={dbMode} onValueChange={v => v && setDbMode(v)} className="flex gap-4">
              <Label className="flex items-center gap-1.5 text-xs font-normal cursor-pointer">
                <RadioGroupItem value="readonly" className="size-3" /> 只读
              </Label>
              <Label className="flex items-center gap-1.5 text-xs font-normal cursor-pointer">
                <RadioGroupItem value="readwrite" className="size-3" /> 读写
              </Label>
            </RadioGroup>
            <p className="text-[10px] text-muted-foreground mt-1">V1 固定连接本地应用数据库</p>
          </div>
        )}

        {type === 'remote_mcp' && (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">传输方式</label>
              <RadioGroup value={mcpTransport} onValueChange={v => v && setMcpTransport(v)} className="flex gap-4">
                {(['http', 'stdio', 'sse'] as const).map(t => (
                  <Label key={t} className="flex items-center gap-1.5 text-xs font-normal cursor-pointer">
                    <RadioGroupItem value={t} className="size-3" />
                    {t === 'http' ? 'Streamable HTTP' : t}
                  </Label>
                ))}
              </RadioGroup>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">URL</label>
              <Input value={mcpUrl} onChange={e => setMcpUrl(e.target.value)} className="text-xs font-mono" placeholder="http://127.0.0.1:18007/mcp" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Headers (JSON, 可选)</label>
              <Input value={mcpHeaders} onChange={e => setMcpHeaders(e.target.value)} className="text-xs font-mono" placeholder='{"Authorization": "Bearer xxx"}' />
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="outline" size="sm" onClick={onCancel}>取消</Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            <Save size={12} /> {saving ? '保存中...' : '确定'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Main Form ────────────────────────────────────────────────────────────────
export function McpServerForm({ serverId, onBack, onSaved }: Props) {
  const isEdit = !!serverId;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<'active' | 'planned'>('active');
  const [saving, setSaving] = useState(false);

  // Resources
  const [resources, setResources] = useState<McpResource[]>([]);
  const [editingResource, setEditingResource] = useState<Partial<McpResource> | null | 'new'>(null);
  const [discovering, setDiscovering] = useState<string | null>(null);

  useEffect(() => {
    if (!serverId) return;
    mcpApi.getServer(serverId).then(s => {
      setName(s.name);
      setDescription(s.description);
      setStatus(s.status as 'active' | 'planned');
    }).catch(console.error);
    loadResources();
  }, [serverId]);

  const loadResources = () => {
    if (!serverId) return;
    mcpApi.listResources(serverId).then(r => setResources(r.items)).catch(console.error);
  };

  const handleSave = async () => {
    if (!name.trim()) return alert('名称不能为空');
    setSaving(true);
    try {
      const body = { name: name.trim(), description, status };
      if (isEdit) {
        await mcpApi.updateServer(serverId!, body);
      } else {
        await mcpApi.createServer(body);
      }
      onSaved();
    } catch (e) {
      alert(`保存失败: ${e}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteResource = async (res: McpResource) => {
    if (!confirm(`确定删除资源「${res.name}」？`)) return;
    await mcpApi.deleteResource(res.id);
    loadResources();
  };

  const handleDiscover = async (res: McpResource) => {
    setDiscovering(res.id);
    try {
      const result = await mcpApi.discoverFromResource(res.id);
      alert(`同步完成：发现 ${result.tools} 个工具，新增 ${result.created}，更新 ${result.updated}`);
    } catch (e) {
      alert(`同步失败: ${e}`);
    } finally {
      setDiscovering(null);
    }
  };

  return (
    <div className="p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft size={14} /> 返回</Button>
        <Button size="sm" onClick={handleSave} disabled={saving}><Save size={13} /> {saving ? '保存中...' : '保存'}</Button>
      </div>

      <h2 className="text-sm font-semibold mb-4">{isEdit ? '编辑 MCP Server' : '新建 MCP Server'}</h2>

      {/* ── 基本信息 ── */}
      <Card className="mb-6">
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">名称</label>
              <Input value={name} onChange={e => setName(e.target.value)} className="text-xs" placeholder="account-service" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">状态</label>
              <Select value={status} onValueChange={v => v && setStatus(v as typeof status)}>
                <SelectTrigger className="w-full text-xs h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="planned">Planned</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">描述</label>
              <Input value={description} onChange={e => setDescription(e.target.value)} className="text-xs" placeholder="账户操作服务（身份验证、余额、合约）" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── 资源管理 ── */}
      {isEdit && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">资源管理 ({resources.length})</h3>
            <Button variant="outline" size="sm" onClick={() => setEditingResource('new')}>
              <Plus size={12} /> 新增资源
            </Button>
          </div>

          {resources.length === 0 ? (
            <div className="text-xs text-muted-foreground text-center py-8 border rounded-lg">
              暂无资源。点击"新增资源"添加数据库连接或远程 MCP 服务。
            </div>
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <Table className="text-xs">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-36">资源名</TableHead>
                    <TableHead className="w-24">类型</TableHead>
                    <TableHead>连接目标</TableHead>
                    <TableHead className="w-20 text-center">状态</TableHead>
                    <TableHead className="w-36 text-center">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {resources.map(res => (
                    <TableRow key={res.id}>
                      <TableCell className="font-mono font-medium">{res.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">
                          {res.type === 'db' ? 'DB' : res.type === 'remote_mcp' ? 'Remote MCP' : 'API'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-[11px] font-mono truncate max-w-[200px]">
                        {res.type === 'db' ? '本地数据库' : res.type === 'remote_mcp' ? (res.mcp_url ?? '—') : (res.api_base_url ?? '—')}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={res.status === 'active' ? 'default' : 'outline'} className="text-[10px]">
                          {res.status === 'active' ? '正常' : res.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-2">
                          {res.type === 'remote_mcp' && (
                            <Button variant="ghost" size="xs" onClick={() => handleDiscover(res)} disabled={discovering === res.id}>
                              {discovering === res.id ? <RefreshCw size={11} className="animate-spin" /> : <Plug size={11} />}
                              同步
                            </Button>
                          )}
                          <Button variant="ghost" size="xs" onClick={() => setEditingResource(res)}>编辑</Button>
                          <Button variant="ghost" size="xs" className="text-destructive hover:text-destructive" onClick={() => handleDeleteResource(res)}>删除</Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}

      {/* Resource edit dialog */}
      {editingResource !== null && serverId && (
        <ResourceEditDialog
          resource={editingResource === 'new' ? null : editingResource}
          serverId={serverId}
          onCancel={() => setEditingResource(null)}
          onSave={() => { setEditingResource(null); loadResources(); }}
        />
      )}
    </div>
  );
}
