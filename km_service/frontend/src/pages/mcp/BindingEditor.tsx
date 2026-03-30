/**
 * BindingEditor — 全屏 Runtime Binding 编辑器
 *
 * 从 BindingDetailDrawer 重构而来，改为 Tool Contracts 同款全屏视图。
 * 三栏布局：左侧 Summary + 中间编辑区 + 右侧源码预览
 */
import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Save, ExternalLink, Trash2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { mcpApi, type ToolImplementation, type Connector, type McpHandler } from './api';
import { t, type Lang } from './i18n';

interface Props {
  toolId: string;
  onBack: () => void;
  onSaved: () => void;
  onOpenContract?: (toolId: string) => void;
  lang?: Lang;
}

const ADAPTER_OPTION_KEYS = [
  { value: 'script', labelKey: 'adapter_script', descKey: 'desc_script' },
  { value: 'api_proxy', labelKey: 'adapter_api_proxy', descKey: 'desc_api_proxy' },
  { value: 'remote_mcp', labelKey: 'adapter_mcp', descKey: 'desc_remote_mcp' },
  { value: 'db', labelKey: 'adapter_db', descKey: 'desc_db' },
  { value: 'mock', labelKey: 'adapter_mock', descKey: 'desc_mock' },
] as const;

const ADAPTER_COLORS: Record<string, string> = {
  script: 'bg-blue-100 text-blue-700',
  remote_mcp: 'bg-purple-100 text-purple-700',
  api_proxy: 'bg-amber-100 text-amber-700',
  db: 'bg-emerald-100 text-emerald-700',
  mock: 'bg-gray-100 text-gray-600',
};

export function BindingEditor({ toolId, onBack, onSaved, onOpenContract, lang = 'zh' as Lang }: Props) {
  const T = t(lang);
  const ADAPTER_OPTIONS = ADAPTER_OPTION_KEYS.map(o => ({ value: o.value, label: T[o.labelKey], desc: T[o.descKey] }));
  const [impl, setImpl] = useState<ToolImplementation | null>(null);
  const [toolName, setToolName] = useState('');
  const [serverName, setServerName] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Editable fields
  const [adapterType, setAdapterType] = useState<string>('');
  const [handlerKey, setHandlerKey] = useState('');
  const [connectorId, setConnectorId] = useState<string>('');
  const [configText, setConfigText] = useState('');
  const [status, setStatus] = useState('active');

  // API proxy fields
  const [apiUrl, setApiUrl] = useState('');
  const [apiMethod, setApiMethod] = useState('POST');
  const [apiTimeout, setApiTimeout] = useState(10000);
  const [apiHeaders, setApiHeaders] = useState('{}');
  const [apiBodyTemplate, setApiBodyTemplate] = useState('');
  const [apiResponsePath, setApiResponsePath] = useState('$.data');
  const [apiErrorMappings, setApiErrorMappings] = useState<Array<{ status: string; error_code: string; message: string }>>([]);

  // Reference data
  const [handlers, setHandlers] = useState<McpHandler[]>([]);
  const [connectors, setConnectors] = useState<Connector[]>([]);

  // Script source preview
  const [scriptContent, setScriptContent] = useState<string | null>(null);

  const loadImpl = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const [implData, toolData, serversData] = await Promise.all([
        mcpApi.getToolImplementation(id),
        mcpApi.getTool(id),
        mcpApi.listServers(),
      ]);
      setImpl(implData);
      setToolName(toolData.name);
      const srv = serversData.items.find((s: { id: string }) => s.id === toolData.server_id);
      setServerName(srv?.name ?? '');
      setAdapterType(implData.adapter_type ?? '');
      setHandlerKey(implData.handler_key ?? '');
      setConnectorId(implData.connector_id ?? '');
      setStatus(implData.status ?? 'active');

      const cfg = implData.config ? JSON.parse(implData.config) : {};
      if (cfg.api) {
        setApiUrl(cfg.api.url ?? '');
        setApiMethod(cfg.api.method ?? 'POST');
        setApiTimeout(cfg.api.timeout ?? 10000);
        setApiHeaders(cfg.api.headers ? JSON.stringify(cfg.api.headers, null, 2) : '{}');
        setApiBodyTemplate(cfg.api.body_template ?? '');
        setApiResponsePath(cfg.api.response_path ?? '$.data');
        setApiErrorMappings(cfg.api.error_mappings ?? []);
        setConfigText('');
      } else {
        setConfigText(implData.config ? JSON.stringify(cfg, null, 2) : '');
        setApiUrl(''); setApiMethod('POST'); setApiTimeout(10000);
        setApiHeaders('{}'); setApiBodyTemplate(''); setApiResponsePath('$.data');
        setApiErrorMappings([]);
      }
    } catch (e) {
      console.error('Failed to load implementation:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    mcpApi.listHandlers().then(r => setHandlers(r.handlers)).catch(() => {});
    mcpApi.listConnectors().then(r => setConnectors(r.items ?? [])).catch(() => {});
  }, []);

  useEffect(() => { loadImpl(toolId); }, [toolId, loadImpl]);

  // Load script source when handler changes
  useEffect(() => {
    if (adapterType !== 'script' || !handlerKey) { setScriptContent(null); return; }
    const handler = handlers.find(h => h.key === handlerKey);
    if (!handler?.file) { setScriptContent(null); return; }
    fetch(`/api/files/content?path=${encodeURIComponent(handler.file)}`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d: { content: string }) => setScriptContent(d.content))
      .catch(() => setScriptContent(null));
  }, [adapterType, handlerKey, handlers]);

  const buildConfig = (): string | null => {
    if (adapterType === 'api_proxy') {
      let parsedHeaders = {};
      try { parsedHeaders = JSON.parse(apiHeaders); } catch { /* ignore */ }
      return JSON.stringify({
        api: {
          url: apiUrl.trim(),
          method: apiMethod,
          timeout: apiTimeout,
          headers: parsedHeaders,
          body_template: apiBodyTemplate || undefined,
          response_path: apiResponsePath || undefined,
          error_mappings: apiErrorMappings.length > 0 ? apiErrorMappings : undefined,
        },
      });
    }
    if (configText.trim()) {
      try { JSON.parse(configText); return configText.trim(); } catch { /* ignore */ }
    }
    return null;
  };

  const handleSave = async () => {
    if (adapterType === 'api_proxy' && !apiUrl.trim()) { alert(T.url_required); return; }
    setSaving(true);
    try {
      await mcpApi.updateToolImplementation(toolId, {
        adapter_type: adapterType || null,
        handler_key: adapterType === 'script' ? handlerKey || null : null,
        connector_id: connectorId || null,
        config: buildConfig(),
        status,
      });
      onSaved();
    } catch (e) {
      alert(`${T.save_failed} ${e}`);
    } finally {
      setSaving(false);
    }
  };

  const selectedHandler = handlers.find(h => h.key === handlerKey);
  const filteredConnectors = connectors.filter(c =>
    adapterType === 'api_proxy' ? c.type === 'api' :
    adapterType === 'db' ? c.type === 'db' : true
  );

  if (loading) return <div className="flex items-center justify-center h-full text-sm text-muted-foreground">{T.loading}</div>;

  return (
    <div className="flex flex-col h-full">
      {/* ── Header ── */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b bg-background shrink-0">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1 text-xs h-7">
          <ArrowLeft size={14} /> {T.back}
        </Button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="font-mono font-semibold text-sm truncate">{toolName}</span>
          {serverName && <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">{serverName}</Badge>}
          {adapterType && (
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 shrink-0 ${ADAPTER_COLORS[adapterType] ?? ''}`}>
              {ADAPTER_OPTIONS.find(o => o.value === adapterType)?.label ?? adapterType}
            </Badge>
          )}
          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 shrink-0 ${status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
            {status}
          </Badge>
        </div>
        {onOpenContract && (
          <Button variant="ghost" size="sm" className="text-xs h-7 gap-1" onClick={() => onOpenContract(toolId)}>
            <ExternalLink size={12} /> {T.open_contract}
          </Button>
        )}
        <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1 h-7">
          <Save size={12} /> {saving ? T.saving : T.save}
        </Button>
      </div>

      {/* ── Body: edit form + optional source preview ── */}
      <ResizablePanelGroup direction="horizontal" className="flex-1">
        {/* Left: Edit form */}
        <ResizablePanel defaultSize={adapterType === 'script' && scriptContent ? 50 : 100} minSize={40}>
          <div className="p-6 overflow-y-auto h-full">
            <div className="max-w-2xl mx-auto space-y-6">
              {/* ── 1. Adapter Type ── */}
              <section className="space-y-2">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{T.adapter_type}</h3>
                <div className="grid grid-cols-3 gap-2">
                  {ADAPTER_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setAdapterType(opt.value)}
                      className={`text-left px-3 py-2.5 rounded-lg border text-xs transition-colors ${
                        adapterType === opt.value
                          ? 'border-primary bg-primary/5 text-primary'
                          : 'border-border hover:bg-accent text-muted-foreground'
                      }`}
                    >
                      <div className="font-medium">{opt.label}</div>
                      <div className="text-[10px] opacity-70 mt-0.5">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </section>

              {/* ── 2. Script Handler ── */}
              {adapterType === 'script' && (
                <section className="space-y-2">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{T.script_handler}</h3>
                  <Select value={handlerKey} onValueChange={v => { if (v) setHandlerKey(v); }}>
                    <SelectTrigger className="text-xs h-8 font-mono">
                      <SelectValue placeholder={T.select_handler}>{handlerKey || T.select_handler}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {handlers.map(h => (
                        <SelectItem key={h.key} value={h.key}>
                          <span className="font-mono text-xs">{h.key}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedHandler && (
                    <div className="text-[10px] text-muted-foreground flex items-center gap-2">
                      <Badge variant="outline" className="text-[9px] font-mono">{selectedHandler.server_name}</Badge>
                      <span className="font-mono truncate" title={selectedHandler.file}>{selectedHandler.file}</span>
                    </div>
                  )}
                </section>
              )}

              {/* ── 2b. API Proxy Config ── */}
              {adapterType === 'api_proxy' && (
                <section className="space-y-3">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{T.api_config}</h3>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">
                      <label className="text-[11px] text-muted-foreground mb-0.5 block">URL</label>
                      <Input value={apiUrl} onChange={e => setApiUrl(e.target.value)} className="text-xs font-mono" placeholder="http://127.0.0.1:18008/api/..." />
                    </div>
                    <div>
                      <label className="text-[11px] text-muted-foreground mb-0.5 block">Method</label>
                      <Select value={apiMethod} onValueChange={v => { if (v) setApiMethod(v); }}>
                        <SelectTrigger className="text-xs h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="POST">POST</SelectItem>
                          <SelectItem value="GET">GET</SelectItem>
                          <SelectItem value="PUT">PUT</SelectItem>
                          <SelectItem value="DELETE">DELETE</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] text-muted-foreground mb-0.5 block">Timeout (ms)</label>
                    <Input type="number" value={apiTimeout} onChange={e => setApiTimeout(Number(e.target.value))} className="text-xs w-32" />
                  </div>
                  <div>
                    <label className="text-[11px] text-muted-foreground mb-0.5 block">Headers (JSON)</label>
                    <Textarea value={apiHeaders} onChange={e => setApiHeaders(e.target.value)} className="text-[11px] font-mono h-20 resize-none" placeholder='{"Authorization": "Bearer ..."}' />
                  </div>
                  <div>
                    <label className="text-[11px] text-muted-foreground mb-0.5 block">Body Template <span className="opacity-50">({T.body_template_hint})</span></label>
                    <Textarea value={apiBodyTemplate} onChange={e => setApiBodyTemplate(e.target.value)} className="text-[11px] font-mono h-20 resize-none" placeholder='{"phone": "{phone}"}' />
                  </div>
                  <div>
                    <label className="text-[11px] text-muted-foreground mb-0.5 block">Response Path</label>
                    <Input value={apiResponsePath} onChange={e => setApiResponsePath(e.target.value)} className="text-xs font-mono" placeholder="$.data" />
                  </div>
                  {/* Error mappings */}
                  <div className="space-y-2">
                    <label className="text-[11px] text-muted-foreground block">Error Mappings</label>
                    {apiErrorMappings.map((em, i) => (
                      <div key={i} className="flex gap-1.5 items-center">
                        <Input value={em.status} onChange={e => { const n = [...apiErrorMappings]; n[i] = { ...n[i], status: e.target.value }; setApiErrorMappings(n); }} placeholder="401" className="w-16 text-[11px] font-mono" />
                        <span className="text-[11px] text-muted-foreground">{'\u2192'}</span>
                        <Input value={em.error_code} onChange={e => { const n = [...apiErrorMappings]; n[i] = { ...n[i], error_code: e.target.value }; setApiErrorMappings(n); }} placeholder="error_code" className="w-28 text-[11px] font-mono" />
                        <Input value={em.message} onChange={e => { const n = [...apiErrorMappings]; n[i] = { ...n[i], message: e.target.value }; setApiErrorMappings(n); }} placeholder="消息" className="flex-1 text-[11px]" />
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive" onClick={() => setApiErrorMappings(apiErrorMappings.filter((_, j) => j !== i))}><Trash2 size={11} /></Button>
                      </div>
                    ))}
                    <Button variant="ghost" size="sm" className="text-[11px] h-6" onClick={() => setApiErrorMappings([...apiErrorMappings, { status: '', error_code: '', message: '' }])}>
                      <Plus size={11} /> {T.add_mapping}
                    </Button>
                  </div>
                </section>
              )}

              {/* ── 3. Connector ── */}
              {(adapterType === 'api_proxy' || adapterType === 'db') && (
                <section className="space-y-2">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{T.connector}</h3>
                  <Select value={connectorId} onValueChange={v => setConnectorId(v ?? '')}>
                    <SelectTrigger className="text-xs h-8">
                      <SelectValue placeholder={T.select_connector}>{filteredConnectors.find(c => c.id === connectorId)?.name ?? T.not_selected}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">{T.none}</SelectItem>
                      {filteredConnectors.map(c => (
                        <SelectItem key={c.id} value={c.id}>
                          <span className="text-xs">{c.name}</span>
                          <span className="text-[10px] text-muted-foreground ml-1.5">({c.type})</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {connectorId && (() => {
                    const c = connectors.find(x => x.id === connectorId);
                    if (!c) return null;
                    const cfg = c.config ? JSON.parse(c.config) : {};
                    return (
                      <div className="text-[10px] text-muted-foreground bg-muted p-2 rounded-lg font-mono">
                        {cfg.base_url && <div>base_url: {cfg.base_url}</div>}
                        {cfg.database && <div>database: {cfg.database}</div>}
                      </div>
                    );
                  })()}
                </section>
              )}

              {/* ── 4. Config (generic JSON for non-API adapters) ── */}
              {adapterType && adapterType !== 'api_proxy' && (
                <section className="space-y-2">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{T.config}</h3>
                  <Textarea
                    value={configText}
                    onChange={e => setConfigText(e.target.value)}
                    className="text-[11px] font-mono h-28 resize-none"
                    placeholder='{"timeout_ms": 10000, "channels": ["online", "voice"]}'
                  />
                </section>
              )}

              {/* ── 5. Status ── */}
              <section className="space-y-2">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{T.col_status}</h3>
                <Select value={status} onValueChange={v => { if (v) setStatus(v); }}>
                  <SelectTrigger className="text-xs h-8 w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">{T.active}</SelectItem>
                    <SelectItem value="inactive">{T.disabled}</SelectItem>
                  </SelectContent>
                </Select>
              </section>
            </div>
          </div>
        </ResizablePanel>

        {/* Right: Source preview (script mode only) */}
        {adapterType === 'script' && scriptContent && (
          <>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={40} minSize={25}>
              <div className="p-4 overflow-y-auto h-full">
                <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">{T.source_readonly}</h4>
                <pre className="text-[11px] font-mono bg-muted p-3 rounded-lg whitespace-pre-wrap">{scriptContent}</pre>
              </div>
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>
    </div>
  );
}
