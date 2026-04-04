/**
 * MasterDataPage.tsx — 主数据管理（活动/技能/班次/合同/排班组）
 * Full CRUD: list + create + edit + delete for all 5 sub-tabs.
 */
import { memo, useState, useEffect, useCallback } from 'react';
import { type Lang } from '../../../i18n';

type SubTab = 'activities' | 'skills' | 'shifts' | 'contracts' | 'groups';

/* ─── Tab definitions ─── */

const TABS: { id: SubTab; label: Record<Lang, string> }[] = [
  { id: 'activities', label: { zh: '活动类型', en: 'Activities' } },
  { id: 'skills', label: { zh: '技能', en: 'Skills' } },
  { id: 'shifts', label: { zh: '班次模板', en: 'Shifts' } },
  { id: 'contracts', label: { zh: '合同', en: 'Contracts' } },
  { id: 'groups', label: { zh: '排班组', en: 'Groups' } },
];

/* ─── Column definitions ─── */

interface Column {
  key: string;
  label: Record<Lang, string>;
}

const ACTIVITY_COLS: Column[] = [
  { key: 'id', label: { zh: 'ID', en: 'ID' } },
  { key: 'code', label: { zh: '编码', en: 'Code' } },
  { key: 'name', label: { zh: '名称', en: 'Name' } },
  { key: 'color', label: { zh: '颜色', en: 'Color' } },
  { key: 'icon', label: { zh: '图标', en: 'Icon' } },
  { key: 'priority', label: { zh: '优先级', en: 'Priority' } },
  { key: 'isPaid', label: { zh: '带薪', en: 'Paid' } },
  { key: 'isCoverable', label: { zh: '可覆盖', en: 'Coverable' } },
  { key: 'canCover', label: { zh: '可覆盖他人', en: 'Can Cover' } },
];

const SKILL_COLS: Column[] = [
  { key: 'id', label: { zh: 'ID', en: 'ID' } },
  { key: 'code', label: { zh: '编码', en: 'Code' } },
  { key: 'name', label: { zh: '名称', en: 'Name' } },
];

const SHIFT_COLS: Column[] = [
  { key: 'id', label: { zh: 'ID', en: 'ID' } },
  { key: 'name', label: { zh: '名称', en: 'Name' } },
  { key: 'patternId', label: { zh: '班制ID', en: 'Pattern ID' } },
  { key: 'startTime', label: { zh: '开始时间', en: 'Start' } },
  { key: 'endTime', label: { zh: '结束时间', en: 'End' } },
  { key: 'durationMinutes', label: { zh: '时长(分)', en: 'Duration(min)' } },
];

const CONTRACT_COLS: Column[] = [
  { key: 'id', label: { zh: 'ID', en: 'ID' } },
  { key: 'name', label: { zh: '名称', en: 'Name' } },
  { key: 'minHoursDay', label: { zh: '日最小工时', en: 'Min Hours/Day' } },
  { key: 'maxHoursDay', label: { zh: '日最大工时', en: 'Max Hours/Day' } },
  { key: 'minHoursWeek', label: { zh: '周最小工时', en: 'Min Hours/Week' } },
  { key: 'maxHoursWeek', label: { zh: '周最大工时', en: 'Max Hours/Week' } },
  { key: 'lunchRequired', label: { zh: '需午餐', en: 'Lunch Required' } },
];

const GROUP_COLS: Column[] = [
  { key: 'id', label: { zh: 'ID', en: 'ID' } },
  { key: 'name', label: { zh: '名称', en: 'Name' } },
  { key: 'maxStartDiffMinutes', label: { zh: '开始偏差(分)', en: 'Start Diff(min)' } },
  { key: 'maxEndDiffMinutes', label: { zh: '结束偏差(分)', en: 'End Diff(min)' } },
];

/* ─── Form field definitions ─── */

interface FormField {
  key: string;
  label: Record<Lang, string>;
  type: 'text' | 'number' | 'color' | 'checkbox';
  required?: boolean;
  defaultValue?: string | number | boolean;
}

const ACTIVITY_FIELDS: FormField[] = [
  { key: 'code', label: { zh: '编码', en: 'Code' }, type: 'text', required: true },
  { key: 'name', label: { zh: '名称', en: 'Name' }, type: 'text', required: true },
  { key: 'color', label: { zh: '颜色', en: 'Color' }, type: 'color', defaultValue: '#9ca3af' },
  { key: 'icon', label: { zh: '图标', en: 'Icon' }, type: 'text', defaultValue: 'circle' },
  { key: 'priority', label: { zh: '优先级', en: 'Priority' }, type: 'number', defaultValue: 50 },
  { key: 'isPaid', label: { zh: '带薪', en: 'Paid' }, type: 'checkbox', defaultValue: false },
  { key: 'isCoverable', label: { zh: '可覆盖', en: 'Coverable' }, type: 'checkbox', defaultValue: false },
  { key: 'canCover', label: { zh: '可覆盖他人', en: 'Can Cover' }, type: 'checkbox', defaultValue: false },
];

const SKILL_FIELDS: FormField[] = [
  { key: 'code', label: { zh: '编码', en: 'Code' }, type: 'text', required: true },
  { key: 'name', label: { zh: '名称', en: 'Name' }, type: 'text', required: true },
];

const SHIFT_FIELDS: FormField[] = [
  { key: 'name', label: { zh: '名称', en: 'Name' }, type: 'text', required: true },
  { key: 'patternId', label: { zh: '班制ID', en: 'Pattern ID' }, type: 'number', required: true },
  { key: 'startTime', label: { zh: '开始时间', en: 'Start Time' }, type: 'text' },
  { key: 'endTime', label: { zh: '结束时间', en: 'End Time' }, type: 'text' },
  { key: 'durationMinutes', label: { zh: '时长(分)', en: 'Duration(min)' }, type: 'number' },
];

const CONTRACT_FIELDS: FormField[] = [
  { key: 'name', label: { zh: '名称', en: 'Name' }, type: 'text', required: true },
  { key: 'minHoursDay', label: { zh: '日最小工时', en: 'Min Hours/Day' }, type: 'number' },
  { key: 'maxHoursDay', label: { zh: '日最大工时', en: 'Max Hours/Day' }, type: 'number' },
  { key: 'minHoursWeek', label: { zh: '周最小工时', en: 'Min Hours/Week' }, type: 'number' },
  { key: 'maxHoursWeek', label: { zh: '周最大工时', en: 'Max Hours/Week' }, type: 'number' },
  { key: 'minBreakMinutes', label: { zh: '最小休息(分)', en: 'Min Break(min)' }, type: 'number' },
  { key: 'lunchRequired', label: { zh: '需午餐', en: 'Lunch Required' }, type: 'checkbox', defaultValue: false },
  { key: 'lunchMinMinutes', label: { zh: '午餐最少(分)', en: 'Lunch Min(min)' }, type: 'number' },
];

const GROUP_FIELDS: FormField[] = [
  { key: 'name', label: { zh: '名称', en: 'Name' }, type: 'text', required: true },
  { key: 'maxStartDiffMinutes', label: { zh: '开始偏差(分)', en: 'Start Diff(min)' }, type: 'number', defaultValue: 120 },
  { key: 'maxEndDiffMinutes', label: { zh: '结束偏差(分)', en: 'End Diff(min)' }, type: 'number', defaultValue: 120 },
];

/* ─── Tab config ─── */

interface TabConfig {
  endpoint: string;
  columns: Column[];
  fields: FormField[];
  dialogTitle: Record<Lang, string>;
}

const TAB_CONFIG: Record<SubTab, TabConfig> = {
  activities: {
    endpoint: '/api/wfm/activities',
    columns: ACTIVITY_COLS,
    fields: ACTIVITY_FIELDS,
    dialogTitle: { zh: '活动类型', en: 'Activity' },
  },
  skills: {
    endpoint: '/api/wfm/staff-skills/skills',
    columns: SKILL_COLS,
    fields: SKILL_FIELDS,
    dialogTitle: { zh: '技能', en: 'Skill' },
  },
  shifts: {
    endpoint: '/api/wfm/shifts',
    columns: SHIFT_COLS,
    fields: SHIFT_FIELDS,
    dialogTitle: { zh: '班次', en: 'Shift' },
  },
  contracts: {
    endpoint: '/api/wfm/contracts',
    columns: CONTRACT_COLS,
    fields: CONTRACT_FIELDS,
    dialogTitle: { zh: '合同', en: 'Contract' },
  },
  groups: {
    endpoint: '/api/wfm/groups',
    columns: GROUP_COLS,
    fields: GROUP_FIELDS,
    dialogTitle: { zh: '排班组', en: 'Group' },
  },
};

/* ─── Helper: build default form values from field definitions ─── */

function buildDefaults(fields: FormField[]): Record<string, any> {
  const defaults: Record<string, any> = {};
  for (const f of fields) {
    if (f.type === 'checkbox') {
      defaults[f.key] = f.defaultValue ?? false;
    } else {
      defaults[f.key] = f.defaultValue ?? '';
    }
  }
  return defaults;
}

/* ─── Helper: prepare body for POST/PUT (cast types) ─── */

function prepareBody(form: Record<string, any>, fields: FormField[]): Record<string, any> {
  const body: Record<string, any> = {};
  for (const f of fields) {
    const v = form[f.key];
    if (f.type === 'checkbox') {
      body[f.key] = !!v;
    } else if (f.type === 'number') {
      if (v !== '' && v !== undefined && v !== null) {
        body[f.key] = Number(v);
      }
    } else {
      if (v !== '' && v !== undefined && v !== null) {
        body[f.key] = v;
      }
    }
  }
  return body;
}

/* ─── FormDialog component ─── */

const FormDialog = memo(function FormDialog({
  lang,
  title,
  fields,
  initialValues,
  onSave,
  onCancel,
}: {
  lang: Lang;
  title: string;
  fields: FormField[];
  initialValues: Record<string, any>;
  onSave: (values: Record<string, any>) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<Record<string, any>>(initialValues);

  const handleChange = useCallback((key: string, value: any) => {
    setForm(prev => ({ ...prev, [key]: value }));
  }, []);

  const handleSubmit = useCallback(() => {
    for (const f of fields) {
      if (f.required && !form[f.key] && form[f.key] !== 0) {
        alert(lang === 'zh' ? `${f.label.zh} 不能为空` : `${f.label.en} is required`);
        return;
      }
    }
    onSave(form);
  }, [form, fields, lang, onSave]);

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-background border border-border rounded-lg p-4 w-96 shadow-lg max-h-[80vh] overflow-y-auto">
        <h3 className="text-sm font-semibold mb-3">{title}</h3>
        <div className="space-y-2">
          {fields.map(f => (
            <div key={f.key}>
              <label className="block text-xs text-muted-foreground mb-0.5">
                {f.label[lang]}{f.required ? ' *' : ''}
              </label>
              {f.type === 'checkbox' ? (
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!form[f.key]}
                    onChange={e => handleChange(f.key, e.target.checked)}
                  />
                  <span className="text-xs">{f.label[lang]}</span>
                </label>
              ) : f.type === 'color' ? (
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={form[f.key] || '#9ca3af'}
                    onChange={e => handleChange(f.key, e.target.value)}
                    className="w-8 h-8 border border-input rounded cursor-pointer"
                  />
                  <input
                    type="text"
                    value={form[f.key] || ''}
                    onChange={e => handleChange(f.key, e.target.value)}
                    className="flex-1 text-sm border border-input rounded px-2 py-1.5"
                    placeholder="#000000"
                  />
                </div>
              ) : (
                <input
                  type={f.type}
                  value={form[f.key] ?? ''}
                  onChange={e => handleChange(f.key, e.target.value)}
                  className="w-full text-sm border border-input rounded px-2 py-1.5"
                  placeholder={f.label[lang]}
                />
              )}
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-xs border border-border rounded hover:bg-muted/50 transition-colors"
          >
            {lang === 'zh' ? '取消' : 'Cancel'}
          </button>
          <button
            onClick={handleSubmit}
            className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded hover:opacity-90 transition-colors"
          >
            {lang === 'zh' ? '保存' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
});

/* ─── DataTable with actions ─── */

function DataTable({
  endpoint,
  columns,
  lang,
  refreshKey,
  onEdit,
  onDelete,
}: {
  endpoint: string;
  columns: Column[];
  lang: Lang;
  refreshKey: number;
  onEdit: (row: any) => void;
  onDelete: (row: any) => void;
}) {
  const [rows, setRows] = useState<any[]>([]);

  useEffect(() => {
    fetch(endpoint).then(r => r.json()).then(d => setRows(d.items ?? []));
  }, [endpoint, refreshKey]);

  return (
    <div className="overflow-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            {columns.map(c => (
              <th key={c.key} className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                {c.label[lang]}
              </th>
            ))}
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
              {lang === 'zh' ? '操作' : 'Actions'}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.id ?? i} className="border-b border-border hover:bg-accent/30">
              {columns.map(c => (
                <td key={c.key} className="px-3 py-2 text-xs">
                  {c.key === 'color' ? (
                    <span className="inline-flex items-center gap-1">
                      <span className="w-3 h-3 rounded" style={{ backgroundColor: row[c.key] }} />
                      {row[c.key]}
                    </span>
                  ) : typeof row[c.key] === 'boolean' ? (
                    row[c.key] ? '✓' : '✗'
                  ) : (
                    String(row[c.key] ?? '')
                  )}
                </td>
              ))}
              <td className="px-3 py-2 text-xs">
                <button
                  onClick={() => onEdit(row)}
                  className="text-primary hover:underline mr-2"
                >
                  {lang === 'zh' ? '编辑' : 'Edit'}
                </button>
                <button
                  onClick={() => onDelete(row)}
                  className="text-destructive hover:underline"
                >
                  {lang === 'zh' ? '删除' : 'Delete'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && (
        <div className="py-8 text-center text-sm text-muted-foreground">
          {lang === 'zh' ? '暂无数据' : 'No data'}
        </div>
      )}
    </div>
  );
}

/* ─── Main page component ─── */

export const MasterDataPage = memo(function MasterDataPage({ lang }: { lang: Lang }) {
  const [tab, setTab] = useState<SubTab>('activities');
  const [refreshKey, setRefreshKey] = useState(0);
  const [dialogMode, setDialogMode] = useState<'create' | 'edit' | null>(null);
  const [editingRow, setEditingRow] = useState<any>(null);

  const config = TAB_CONFIG[tab];

  const refresh = useCallback(() => {
    setRefreshKey(k => k + 1);
  }, []);

  const handleCreate = useCallback(() => {
    setEditingRow(null);
    setDialogMode('create');
  }, []);

  const handleEdit = useCallback((row: any) => {
    setEditingRow(row);
    setDialogMode('edit');
  }, []);

  const handleDelete = useCallback(async (row: any) => {
    const msg = lang === 'zh'
      ? `确定要删除 "${row.name ?? row.code ?? row.id}" 吗？`
      : `Delete "${row.name ?? row.code ?? row.id}"?`;
    if (!window.confirm(msg)) return;

    await fetch(`${config.endpoint}/${row.id}`, { method: 'DELETE' });
    refresh();
  }, [config.endpoint, lang, refresh]);

  const handleSave = useCallback(async (values: Record<string, any>) => {
    const body = prepareBody(values, config.fields);
    if (dialogMode === 'create') {
      await fetch(config.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } else if (dialogMode === 'edit' && editingRow) {
      await fetch(`${config.endpoint}/${editingRow.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    }
    setDialogMode(null);
    setEditingRow(null);
    refresh();
  }, [dialogMode, editingRow, config.endpoint, config.fields, refresh]);

  const handleCancel = useCallback(() => {
    setDialogMode(null);
    setEditingRow(null);
  }, []);

  // Build initial form values for the dialog
  const initialValues = dialogMode === 'edit' && editingRow
    ? (() => {
        const vals: Record<string, any> = {};
        for (const f of config.fields) {
          vals[f.key] = editingRow[f.key] ?? (f.type === 'checkbox' ? false : f.defaultValue ?? '');
        }
        return vals;
      })()
    : buildDefaults(config.fields);

  const dialogTitle = dialogMode === 'create'
    ? (lang === 'zh' ? `新建${config.dialogTitle.zh}` : `Create ${config.dialogTitle.en}`)
    : (lang === 'zh' ? `编辑${config.dialogTitle.zh}` : `Edit ${config.dialogTitle.en}`);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Sub-tab bar */}
      <div className="px-4 border-b border-border flex items-center h-9 flex-shrink-0">
        {TABS.map(t => (
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
      </div>

      {/* Toolbar */}
      <div className="px-4 py-2 border-b border-border flex items-center justify-between flex-shrink-0">
        <span className="text-xs text-muted-foreground">
          {config.dialogTitle[lang]}
        </span>
        <button
          onClick={handleCreate}
          className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded hover:opacity-90 transition-colors"
        >
          {lang === 'zh' ? '+ 新建' : '+ New'}
        </button>
      </div>

      {/* Data table */}
      <div className="flex-1 overflow-auto">
        <DataTable
          key={tab}
          endpoint={config.endpoint}
          columns={config.columns}
          lang={lang}
          refreshKey={refreshKey}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      </div>

      {/* Create / Edit dialog */}
      {dialogMode && (
        <FormDialog
          lang={lang}
          title={dialogTitle}
          fields={config.fields}
          initialValues={initialValues}
          onSave={handleSave}
          onCancel={handleCancel}
        />
      )}
    </div>
  );
});
