/**
 * ResourceEditDrawer — 资源编辑侧滑抽屉
 *
 * 按资源类型（Remote MCP / DB / API）切换表单
 * 使用 overlay + 右侧滑入面板实现（无需 shadcn Sheet）
 */
import { useState, useEffect } from 'react';
import { X, Save, Zap } from 'lucide-react';
import { mcpApi, type McpResource, type McpToolRecord } from '../api';
import { EnvEditor, type EnvEntry, parseEnvJson, envToJson } from './EnvEditor';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';

interface Props {
  serverId: string;
  resource: McpResource | null; // null = create mode
  tools: McpToolRecord[];
  onClose: () => void;
  onSaved: () => void;
}

export function ResourceEditDrawer({ serverId, resource, tools, onClose, onSaved }: Props) {
  const isEdit = !!resource;

  // Form state
  const [type, setType] = useState<'remote_mcp' | 'db' | 'api'>(resource?.type ?? 'remote_mcp');
  const [name, setName] = useState(resource?.name ?? '');
  const [status, setStatus] = useState<'active' | 'planned' | 'disabled'>(resource?.status ?? 'active');
  const [description, setDescription] = useState(resource?.description ?? '');

  // Remote MCP fields
  const [mcpTransport, setMcpTransport] = useState(resource?.mcp_transport ?? 'http');
  const [mcpUrl, setMcpUrl] = useState(resource?.mcp_url ?? '');
  const [mcpHeaders, setMcpHeaders] = useState(resource?.mcp_headers ?? '');

  // API fields
  const [apiBaseUrl, setApiBaseUrl] = useState(resource?.api_base_url ?? '');
  const [apiHeaders, setApiHeaders] = useState(resource?.api_headers ?? '');
  const [apiTimeout, setApiTimeout] = useState(resource?.api_timeout ?? 10000);

  // DB fields
  const [dbMode, setDbMode] = useState(resource?.db_mode ?? 'local');

  // Env
  const [envEntries, setEnvEntries] = useState<EnvEntry[]>(parseEnvJson(resource?.env_json ?? null));
  const [envProdEntries, setEnvProdEntries] = useState<EnvEntry[]>(parseEnvJson(resource?.env_prod_json ?? null));
  const [envTestEntries, setEnvTestEntries] = useState<EnvEntry[]>(parseEnvJson(resource?.env_test_json ?? null));

  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string; elapsed_ms?: number } | null>(null);
  const [testingConn, setTestingConn] = useState(false);

  const handleTestConnection = async () => {
    if (!resource) return;
    setTestingConn(true);
    try {
      const res = await mcpApi.testResource(resource.id);
      setTestResult(res);
    } catch (e) {
      setTestResult({ ok: false, error: String(e) });
    } finally {
      setTestingConn(false);
    }
  };

  // Related tools
  const relatedTools = resource ? tools.filter(t => t.resource?.id === resource.id) : [];

  const handleSave = async () => {
    if (!name.trim()) return alert('资源名不能为空');
    setSaving(true);
    try {
      const body: Partial<McpResource> = {
        server_id: serverId,
        name: name.trim(),
        type,
        status,
        description: description || null,
        // Remote MCP
        mcp_transport: type === 'remote_mcp' ? mcpTransport : null,
        mcp_url: type === 'remote_mcp' ? mcpUrl || null : null,
        mcp_headers: type === 'remote_mcp' && mcpHeaders ? mcpHeaders : null,
        // API
        api_base_url: type === 'api' ? apiBaseUrl || null : null,
        api_headers: type === 'api' && apiHeaders ? apiHeaders : null,
        api_timeout: type === 'api' ? apiTimeout : null,
        // DB
        db_mode: type === 'db' ? dbMode : null,
        // Env
        env_json: envToJson(envEntries),
        env_prod_json: envToJson(envProdEntries),
        env_test_json: envToJson(envTestEntries),
      };

      if (isEdit) {
        await mcpApi.updateResource(resource!.id, body);
      } else {
        await mcpApi.createResource(body);
      }
      onSaved();
    } catch (e) {
      alert(`保存失败: ${e}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-background/60" />

      {/* Drawer */}
      <div
        className="relative w-[480px] max-w-full h-full bg-background border-l shadow-lg overflow-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-background border-b px-4 py-3 flex items-center justify-between z-10">
          <h3 className="text-sm font-semibold">
            {isEdit ? `编辑资源: ${resource!.name}` : '新增资源'}
          </h3>
          <div className="flex items-center gap-2">
            {isEdit && (
              <Button variant="outline" size="sm" onClick={handleTestConnection} disabled={testingConn}>
                <Zap size={12} /> {testingConn ? '测试中...' : '测试连接'}
              </Button>
            )}
            <Button size="sm" onClick={handleSave} disabled={saving}>
              <Save size={12} /> {saving ? '保存中...' : '保存'}
            </Button>
            <Button variant="ghost" size="icon-xs" onClick={onClose}><X size={14} /></Button>
          </div>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          {/* Type selection (only for create) */}
          {!isEdit && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">资源类型</label>
              <RadioGroup value={type} onValueChange={v => v && setType(v as typeof type)} className="flex gap-3">
                <Label className="flex items-center gap-1.5 text-xs font-normal cursor-pointer">
                  <RadioGroupItem value="remote_mcp" className="size-3" />
                  Remote MCP
                </Label>
                <Label className="flex items-center gap-1.5 text-xs font-normal cursor-pointer">
                  <RadioGroupItem value="db" className="size-3" />
                  DB
                </Label>
                <Label className="flex items-center gap-1.5 text-xs font-normal cursor-pointer">
                  <RadioGroupItem value="api" className="size-3" />
                  API
                </Label>
              </RadioGroup>
            </div>
          )}

          {/* Common fields */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">资源名</label>
              <Input value={name} onChange={e => setName(e.target.value)} className="text-xs font-mono" placeholder="primary_mcp" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">状态</label>
              <Select value={status} onValueChange={v => v && setStatus(v as typeof status)}>
                <SelectTrigger className="text-xs h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="planned">Planned</SelectItem>
                  <SelectItem value="disabled">Disabled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">描述</label>
            <Input value={description} onChange={e => setDescription(e.target.value)} className="text-xs" placeholder="资源描述" />
          </div>

          {/* Type-specific fields */}
          {type === 'remote_mcp' && (
            <div className="space-y-3 pt-2 border-t">
              <h4 className="text-xs font-medium">Remote MCP 配置</h4>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Transport</label>
                <RadioGroup value={mcpTransport} onValueChange={v => v && setMcpTransport(v)} className="flex gap-3">
                  <Label className="flex items-center gap-1.5 text-xs font-normal cursor-pointer">
                    <RadioGroupItem value="http" className="size-3" />
                    Streamable HTTP
                  </Label>
                  <Label className="flex items-center gap-1.5 text-xs font-normal cursor-pointer">
                    <RadioGroupItem value="sse" className="size-3" />
                    SSE
                  </Label>
                </RadioGroup>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">URL</label>
                <Input value={mcpUrl} onChange={e => setMcpUrl(e.target.value)} className="text-xs font-mono" placeholder="http://localhost:18003/mcp" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Headers (JSON)</label>
                <Input value={mcpHeaders} onChange={e => setMcpHeaders(e.target.value)} className="text-xs font-mono" placeholder='{"Authorization": "Bearer xxx"}' />
              </div>
            </div>
          )}

          {type === 'api' && (
            <div className="space-y-3 pt-2 border-t">
              <h4 className="text-xs font-medium">API 配置</h4>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Base URL</label>
                <Input value={apiBaseUrl} onChange={e => setApiBaseUrl(e.target.value)} className="text-xs font-mono" placeholder="https://api.example.com" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">默认 Headers (JSON)</label>
                <Input value={apiHeaders} onChange={e => setApiHeaders(e.target.value)} className="text-xs font-mono" placeholder='{"Authorization": "Bearer xxx"}' />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Timeout (ms)</label>
                <Input type="number" value={apiTimeout} onChange={e => setApiTimeout(Number(e.target.value))} className="text-xs w-32" />
              </div>
            </div>
          )}

          {type === 'db' && (
            <div className="space-y-3 pt-2 border-t">
              <h4 className="text-xs font-medium">DB 配置</h4>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">数据源模式</label>
                <Select value={dbMode} onValueChange={v => v && setDbMode(v)}>
                  <SelectTrigger className="text-xs h-8 w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="local">Local（本地数据库）</SelectItem>
                    <SelectItem value="readonly">Read-Only</SelectItem>
                    <SelectItem value="readwrite">Read-Write</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Environment variables */}
          {(type === 'remote_mcp' || type === 'api') && (
            <div className="pt-2 border-t">
              <h4 className="text-xs font-medium mb-2">环境变量</h4>
              <div className="space-y-3">
                <EnvEditor label="公共" entries={envEntries} onChange={setEnvEntries} />
                <EnvEditor label="Prod 覆盖" entries={envProdEntries} onChange={setEnvProdEntries} />
                <EnvEditor label="Test 覆盖" entries={envTestEntries} onChange={setEnvTestEntries} />
              </div>
            </div>
          )}

          {/* Test result */}
          {testResult && (
            <div className={`rounded-lg border p-3 text-xs ${testResult.ok ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950' : 'border-destructive/30 bg-destructive/5'}`}>
              <div className="font-medium mb-1">{testResult.ok ? '连接成功' : '连接失败'}</div>
              {testResult.elapsed_ms != null && <div className="text-muted-foreground">耗时 {testResult.elapsed_ms}ms</div>}
              {testResult.error && <div className="text-destructive mt-1">{testResult.error}</div>}
            </div>
          )}

          {/* Related tools (edit mode only) */}
          {isEdit && relatedTools.length > 0 && (
            <div className="pt-2 border-t">
              <h4 className="text-xs font-medium mb-2">被哪些工具使用</h4>
              <div className="flex flex-wrap gap-1.5">
                {relatedTools.map(t => (
                  <Badge key={t.id} variant="secondary" className="text-[10px]">{t.name}</Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
