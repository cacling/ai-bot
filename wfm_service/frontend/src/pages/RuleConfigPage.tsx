/**
 * RuleConfigPage.tsx — 规则配置（定义 + 绑定 + 链）CRUD
 */
import { memo, useState, useEffect, useCallback } from 'react';
import { type Lang } from '../shared/i18n';

type SubTab = 'definitions' | 'bindings' | 'chains';

interface RuleDefinition {
  id: number;
  code: string;
  name: string;
  category: string;
  stage: string;
  scopeType: string;
  severityDefault: string;
  paramSchema?: string;
}

interface RuleBinding {
  id: number;
  definitionId: number;
  scopeType: string;
  scopeId: string | null;
  priority: number;
  enabled: boolean;
  params?: string;
}

interface RuleChain {
  id: number;
  stage: string;
  executionOrder: number;
  bindingId: number;
  stopOnError: boolean;
}

/* ---------- form types ---------- */

interface DefForm {
  code: string;
  name: string;
  category: string;
  stage: string;
  scopeType: string;
  severityDefault: string;
  paramSchema: string;
}

interface BindForm {
  definitionId: number;
  scopeType: string;
  scopeId: string;
  priority: number;
  enabled: boolean;
  params: string;
}

interface ChainForm {
  stage: string;
  executionOrder: number;
  bindingId: number;
  stopOnError: boolean;
}

const EMPTY_DEF: DefForm = { code: '', name: '', category: '', stage: 'generate', scopeType: 'global', severityDefault: 'error', paramSchema: '' };
const EMPTY_BIND: BindForm = { definitionId: 0, scopeType: 'global', scopeId: '', priority: 100, enabled: true, params: '' };
const EMPTY_CHAIN: ChainForm = { stage: 'generate', executionOrder: 0, bindingId: 0, stopOnError: false };

const STAGE_OPTIONS = ['generate', 'edit_preview', 'edit_commit', 'publish'] as const;
const SCOPE_OPTIONS = ['global', 'plan', 'staff'] as const;
const SEVERITY_OPTIONS = ['error', 'warning', 'info'] as const;

export const RuleConfigPage = memo(function RuleConfigPage({ lang }: { lang: Lang }) {
  const [tab, setTab] = useState<SubTab>('definitions');
  const [definitions, setDefinitions] = useState<RuleDefinition[]>([]);
  const [bindings, setBindings] = useState<RuleBinding[]>([]);
  const [chains, setChains] = useState<RuleChain[]>([]);
  const [loading, setLoading] = useState(false);

  /* definition dialog */
  const [defDialog, setDefDialog] = useState(false);
  const [defEditing, setDefEditing] = useState<RuleDefinition | null>(null);
  const [defForm, setDefForm] = useState<DefForm>(EMPTY_DEF);

  /* binding dialog */
  const [bindDialog, setBindDialog] = useState(false);
  const [bindEditing, setBindEditing] = useState<RuleBinding | null>(null);
  const [bindForm, setBindForm] = useState<BindForm>(EMPTY_BIND);

  /* chain dialog */
  const [chainDialog, setChainDialog] = useState(false);
  const [chainForm, setChainForm] = useState<ChainForm>(EMPTY_CHAIN);

  /* ---------- fetch ---------- */

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [dRes, bRes, cRes] = await Promise.all([
        fetch('/api/wfm/rules/definitions').then(r => r.json()),
        fetch('/api/wfm/rules/bindings').then(r => r.json()),
        fetch('/api/wfm/rules/chains').then(r => r.json()),
      ]);
      setDefinitions(dRes.items ?? []);
      setBindings(bRes.items ?? []);
      setChains(cRes.items ?? []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  /* ---------- definition CRUD ---------- */

  const openDefCreate = useCallback(() => {
    setDefEditing(null);
    setDefForm({ ...EMPTY_DEF });
    setDefDialog(true);
  }, []);

  const openDefEdit = useCallback((d: RuleDefinition) => {
    setDefEditing(d);
    setDefForm({ code: d.code, name: d.name, category: d.category, stage: d.stage, scopeType: d.scopeType, severityDefault: d.severityDefault, paramSchema: d.paramSchema ?? '' });
    setDefDialog(true);
  }, []);

  const saveDef = useCallback(async () => {
    try {
      const body: Record<string, unknown> = { ...defForm };
      if (!body.paramSchema) delete body.paramSchema;
      if (defEditing) {
        await fetch(`/api/wfm/rules/definitions/${defEditing.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      } else {
        await fetch('/api/wfm/rules/definitions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      }
      setDefDialog(false);
      reload();
    } catch {
      /* ignore */
    }
  }, [defForm, defEditing, reload]);

  /* ---------- binding CRUD ---------- */

  const openBindCreate = useCallback(() => {
    setBindEditing(null);
    setBindForm({ ...EMPTY_BIND });
    setBindDialog(true);
  }, []);

  const openBindEdit = useCallback((b: RuleBinding) => {
    setBindEditing(b);
    setBindForm({ definitionId: b.definitionId, scopeType: b.scopeType, scopeId: b.scopeId ?? '', priority: b.priority, enabled: b.enabled, params: b.params ?? '' });
    setBindDialog(true);
  }, []);

  const saveBind = useCallback(async () => {
    try {
      const body: Record<string, unknown> = { ...bindForm };
      if (!body.scopeId) delete body.scopeId;
      if (!body.params) delete body.params;
      if (bindEditing) {
        await fetch(`/api/wfm/rules/bindings/${bindEditing.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      } else {
        await fetch('/api/wfm/rules/bindings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      }
      setBindDialog(false);
      reload();
    } catch {
      /* ignore */
    }
  }, [bindForm, bindEditing, reload]);

  const deleteBind = useCallback(async (id: number) => {
    if (!window.confirm(lang === 'zh' ? '确认删除此绑定？' : 'Delete this binding?')) return;
    try {
      await fetch(`/api/wfm/rules/bindings/${id}`, { method: 'DELETE' });
      reload();
    } catch {
      /* ignore */
    }
  }, [lang, reload]);

  /* ---------- chain CRUD ---------- */

  const openChainCreate = useCallback(() => {
    setChainForm({ ...EMPTY_CHAIN });
    setChainDialog(true);
  }, []);

  const saveChain = useCallback(async () => {
    try {
      await fetch('/api/wfm/rules/chains', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(chainForm) });
      setChainDialog(false);
      reload();
    } catch {
      /* ignore */
    }
  }, [chainForm, reload]);

  const deleteChain = useCallback(async (id: number) => {
    if (!window.confirm(lang === 'zh' ? '确认删除此链项？' : 'Delete this chain item?')) return;
    try {
      await fetch(`/api/wfm/rules/chains/${id}`, { method: 'DELETE' });
      reload();
    } catch {
      /* ignore */
    }
  }, [lang, reload]);

  /* ---------- tabs ---------- */

  const tabs: { id: SubTab; label: Record<Lang, string> }[] = [
    { id: 'definitions', label: { zh: '规则定义', en: 'Definitions' } },
    { id: 'bindings', label: { zh: '规则绑定', en: 'Bindings' } },
    { id: 'chains', label: { zh: '规则链', en: 'Chains' } },
  ];

  const thCls = 'px-3 py-2 text-left text-xs font-medium text-muted-foreground';
  const tdCls = 'px-3 py-2 text-xs';

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-4 border-b border-border flex items-center h-9 flex-shrink-0">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 h-full text-xs font-medium border-b-2 transition-colors ${
              tab === t.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
            }`}
          >
            {t.label[lang]}
          </button>
        ))}
        <div className="flex-1" />
        {loading && <span className="text-xs text-muted-foreground mr-2">{lang === 'zh' ? '加载中...' : 'Loading...'}</span>}
      </div>

      <div className="flex-1 overflow-auto">
        {/* ========== Definitions ========== */}
        {tab === 'definitions' && (
          <>
            <div className="px-3 py-2 flex justify-end">
              <button onClick={openDefCreate} className="text-xs px-3 py-1 rounded bg-primary text-primary-foreground">
                {lang === 'zh' ? '+ 新建' : '+ New'}
              </button>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className={thCls}>ID</th>
                  <th className={thCls}>{lang === 'zh' ? '编码' : 'Code'}</th>
                  <th className={thCls}>{lang === 'zh' ? '名称' : 'Name'}</th>
                  <th className={thCls}>{lang === 'zh' ? '分类' : 'Category'}</th>
                  <th className={thCls}>{lang === 'zh' ? '阶段' : 'Stage'}</th>
                  <th className={thCls}>{lang === 'zh' ? '严重级别' : 'Severity'}</th>
                  <th className={thCls}>{lang === 'zh' ? '操作' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody>
                {definitions.map(d => (
                  <tr key={d.id} className="border-b border-border hover:bg-accent/30">
                    <td className={tdCls}>{d.id}</td>
                    <td className={`${tdCls} font-mono`}>{d.code}</td>
                    <td className={tdCls}>{d.name}</td>
                    <td className={tdCls}>{d.category}</td>
                    <td className={tdCls}>{d.stage}</td>
                    <td className={tdCls}>{d.severityDefault}</td>
                    <td className={tdCls}>
                      <button onClick={() => openDefEdit(d)} className="text-xs text-primary hover:underline mr-2">{lang === 'zh' ? '编辑' : 'Edit'}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {/* ========== Bindings ========== */}
        {tab === 'bindings' && (
          <>
            <div className="px-3 py-2 flex justify-end">
              <button onClick={openBindCreate} className="text-xs px-3 py-1 rounded bg-primary text-primary-foreground">
                {lang === 'zh' ? '+ 新建' : '+ New'}
              </button>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className={thCls}>ID</th>
                  <th className={thCls}>{lang === 'zh' ? '定义ID' : 'Def ID'}</th>
                  <th className={thCls}>{lang === 'zh' ? '作用域' : 'Scope'}</th>
                  <th className={thCls}>{lang === 'zh' ? '优先级' : 'Priority'}</th>
                  <th className={thCls}>{lang === 'zh' ? '启用' : 'Enabled'}</th>
                  <th className={thCls}>{lang === 'zh' ? '操作' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody>
                {bindings.map(b => (
                  <tr key={b.id} className="border-b border-border hover:bg-accent/30">
                    <td className={tdCls}>{b.id}</td>
                    <td className={tdCls}>{b.definitionId}</td>
                    <td className={tdCls}>{b.scopeType}{b.scopeId ? `:${b.scopeId}` : ''}</td>
                    <td className={tdCls}>{b.priority}</td>
                    <td className={tdCls}>{b.enabled ? '✓' : '✗'}</td>
                    <td className={tdCls}>
                      <button onClick={() => openBindEdit(b)} className="text-xs text-primary hover:underline mr-2">{lang === 'zh' ? '编辑' : 'Edit'}</button>
                      <button onClick={() => deleteBind(b.id)} className="text-xs text-destructive hover:underline">{lang === 'zh' ? '删除' : 'Del'}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {/* ========== Chains ========== */}
        {tab === 'chains' && (
          <>
            <div className="px-3 py-2 flex justify-end">
              <button onClick={openChainCreate} className="text-xs px-3 py-1 rounded bg-primary text-primary-foreground">
                {lang === 'zh' ? '+ 新建' : '+ New'}
              </button>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className={thCls}>ID</th>
                  <th className={thCls}>{lang === 'zh' ? '阶段' : 'Stage'}</th>
                  <th className={thCls}>{lang === 'zh' ? '执行顺序' : 'Order'}</th>
                  <th className={thCls}>{lang === 'zh' ? '绑定ID' : 'Binding ID'}</th>
                  <th className={thCls}>{lang === 'zh' ? '出错停止' : 'Stop on Error'}</th>
                  <th className={thCls}>{lang === 'zh' ? '操作' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody>
                {chains.map(ch => (
                  <tr key={ch.id} className="border-b border-border hover:bg-accent/30">
                    <td className={tdCls}>{ch.id}</td>
                    <td className={tdCls}>{ch.stage}</td>
                    <td className={tdCls}>{ch.executionOrder}</td>
                    <td className={tdCls}>{ch.bindingId}</td>
                    <td className={tdCls}>{ch.stopOnError ? '✓' : '✗'}</td>
                    <td className={tdCls}>
                      <button onClick={() => deleteChain(ch.id)} className="text-xs text-destructive hover:underline">{lang === 'zh' ? '删除' : 'Del'}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      {/* ========== Definition Dialog ========== */}
      {defDialog && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-background border border-border rounded-lg p-4 w-96 shadow-lg">
            <h3 className="text-sm font-semibold mb-3">
              {defEditing
                ? (lang === 'zh' ? '编辑规则定义' : 'Edit Definition')
                : (lang === 'zh' ? '新建规则定义' : 'Create Definition')}
            </h3>
            <div className="space-y-2">
              <input
                type="text"
                placeholder={lang === 'zh' ? '编码 (必填)' : 'Code (required)'}
                value={defForm.code}
                onChange={e => setDefForm(f => ({ ...f, code: e.target.value }))}
                className="w-full text-sm border border-input rounded px-2 py-1.5"
              />
              <input
                type="text"
                placeholder={lang === 'zh' ? '名称 (必填)' : 'Name (required)'}
                value={defForm.name}
                onChange={e => setDefForm(f => ({ ...f, name: e.target.value }))}
                className="w-full text-sm border border-input rounded px-2 py-1.5"
              />
              <input
                type="text"
                placeholder={lang === 'zh' ? '分类' : 'Category'}
                value={defForm.category}
                onChange={e => setDefForm(f => ({ ...f, category: e.target.value }))}
                className="w-full text-sm border border-input rounded px-2 py-1.5"
              />
              <div className="flex gap-2">
                <label className="flex-1">
                  <span className="text-xs text-muted-foreground">{lang === 'zh' ? '阶段' : 'Stage'}</span>
                  <select
                    value={defForm.stage}
                    onChange={e => setDefForm(f => ({ ...f, stage: e.target.value }))}
                    className="w-full text-sm border border-input rounded px-2 py-1.5"
                  >
                    {STAGE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
                <label className="flex-1">
                  <span className="text-xs text-muted-foreground">{lang === 'zh' ? '作用域' : 'Scope Type'}</span>
                  <select
                    value={defForm.scopeType}
                    onChange={e => setDefForm(f => ({ ...f, scopeType: e.target.value }))}
                    className="w-full text-sm border border-input rounded px-2 py-1.5"
                  >
                    {SCOPE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
              </div>
              <label>
                <span className="text-xs text-muted-foreground">{lang === 'zh' ? '严重级别' : 'Severity'}</span>
                <select
                  value={defForm.severityDefault}
                  onChange={e => setDefForm(f => ({ ...f, severityDefault: e.target.value }))}
                  className="w-full text-sm border border-input rounded px-2 py-1.5"
                >
                  {SEVERITY_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <input
                type="text"
                placeholder={lang === 'zh' ? 'paramSchema (JSON, 可选)' : 'paramSchema (JSON, optional)'}
                value={defForm.paramSchema}
                onChange={e => setDefForm(f => ({ ...f, paramSchema: e.target.value }))}
                className="w-full text-sm border border-input rounded px-2 py-1.5"
              />
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setDefDialog(false)} className="text-xs px-3 py-1 rounded border border-border">
                {lang === 'zh' ? '取消' : 'Cancel'}
              </button>
              <button onClick={saveDef} disabled={!defForm.code || !defForm.name} className="text-xs px-3 py-1 rounded bg-primary text-primary-foreground disabled:opacity-50">
                {lang === 'zh' ? '保存' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========== Binding Dialog ========== */}
      {bindDialog && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-background border border-border rounded-lg p-4 w-96 shadow-lg">
            <h3 className="text-sm font-semibold mb-3">
              {bindEditing
                ? (lang === 'zh' ? '编辑规则绑定' : 'Edit Binding')
                : (lang === 'zh' ? '新建规则绑定' : 'Create Binding')}
            </h3>
            <div className="space-y-2">
              <label>
                <span className="text-xs text-muted-foreground">{lang === 'zh' ? '定义ID (必填)' : 'Definition ID (required)'}</span>
                <input
                  type="number"
                  value={bindForm.definitionId}
                  onChange={e => setBindForm(f => ({ ...f, definitionId: Number(e.target.value) }))}
                  className="w-full text-sm border border-input rounded px-2 py-1.5"
                />
              </label>
              <div className="flex gap-2">
                <label className="flex-1">
                  <span className="text-xs text-muted-foreground">{lang === 'zh' ? '作用域类型' : 'Scope Type'}</span>
                  <select
                    value={bindForm.scopeType}
                    onChange={e => setBindForm(f => ({ ...f, scopeType: e.target.value }))}
                    className="w-full text-sm border border-input rounded px-2 py-1.5"
                  >
                    {SCOPE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
                <label className="flex-1">
                  <span className="text-xs text-muted-foreground">{lang === 'zh' ? '作用域ID' : 'Scope ID'}</span>
                  <input
                    type="text"
                    placeholder={lang === 'zh' ? '可选' : 'Optional'}
                    value={bindForm.scopeId}
                    onChange={e => setBindForm(f => ({ ...f, scopeId: e.target.value }))}
                    className="w-full text-sm border border-input rounded px-2 py-1.5"
                  />
                </label>
              </div>
              <label>
                <span className="text-xs text-muted-foreground">{lang === 'zh' ? '优先级' : 'Priority'}</span>
                <input
                  type="number"
                  value={bindForm.priority}
                  onChange={e => setBindForm(f => ({ ...f, priority: Number(e.target.value) }))}
                  className="w-full text-sm border border-input rounded px-2 py-1.5"
                />
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={bindForm.enabled}
                  onChange={e => setBindForm(f => ({ ...f, enabled: e.target.checked }))}
                />
                <span className="text-xs">{lang === 'zh' ? '启用' : 'Enabled'}</span>
              </label>
              <input
                type="text"
                placeholder={lang === 'zh' ? 'params (JSON, 可选)' : 'params (JSON, optional)'}
                value={bindForm.params}
                onChange={e => setBindForm(f => ({ ...f, params: e.target.value }))}
                className="w-full text-sm border border-input rounded px-2 py-1.5"
              />
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setBindDialog(false)} className="text-xs px-3 py-1 rounded border border-border">
                {lang === 'zh' ? '取消' : 'Cancel'}
              </button>
              <button onClick={saveBind} disabled={!bindForm.definitionId} className="text-xs px-3 py-1 rounded bg-primary text-primary-foreground disabled:opacity-50">
                {lang === 'zh' ? '保存' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========== Chain Dialog ========== */}
      {chainDialog && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-background border border-border rounded-lg p-4 w-96 shadow-lg">
            <h3 className="text-sm font-semibold mb-3">
              {lang === 'zh' ? '新建规则链项' : 'Create Chain Item'}
            </h3>
            <div className="space-y-2">
              <label>
                <span className="text-xs text-muted-foreground">{lang === 'zh' ? '阶段 (必填)' : 'Stage (required)'}</span>
                <select
                  value={chainForm.stage}
                  onChange={e => setChainForm(f => ({ ...f, stage: e.target.value }))}
                  className="w-full text-sm border border-input rounded px-2 py-1.5"
                >
                  {STAGE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <label>
                <span className="text-xs text-muted-foreground">{lang === 'zh' ? '执行顺序 (必填)' : 'Execution Order (required)'}</span>
                <input
                  type="number"
                  value={chainForm.executionOrder}
                  onChange={e => setChainForm(f => ({ ...f, executionOrder: Number(e.target.value) }))}
                  className="w-full text-sm border border-input rounded px-2 py-1.5"
                />
              </label>
              <label>
                <span className="text-xs text-muted-foreground">{lang === 'zh' ? '绑定ID (必填)' : 'Binding ID (required)'}</span>
                <input
                  type="number"
                  value={chainForm.bindingId}
                  onChange={e => setChainForm(f => ({ ...f, bindingId: Number(e.target.value) }))}
                  className="w-full text-sm border border-input rounded px-2 py-1.5"
                />
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={chainForm.stopOnError}
                  onChange={e => setChainForm(f => ({ ...f, stopOnError: e.target.checked }))}
                />
                <span className="text-xs">{lang === 'zh' ? '出错停止' : 'Stop on Error'}</span>
              </label>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setChainDialog(false)} className="text-xs px-3 py-1 rounded border border-border">
                {lang === 'zh' ? '取消' : 'Cancel'}
              </button>
              <button onClick={saveChain} disabled={!chainForm.bindingId} className="text-xs px-3 py-1 rounded bg-primary text-primary-foreground disabled:opacity-50">
                {lang === 'zh' ? '保存' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
