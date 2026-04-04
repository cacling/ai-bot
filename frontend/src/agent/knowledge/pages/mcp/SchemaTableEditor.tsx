/**
 * SchemaTableEditor — JSON Schema 可视化表格编辑器
 *
 * 支持：
 * - 表格模式：增删改参数行（名称/类型/必填/描述/枚举）
 * - JSON 模式：直接编辑 JSON Schema
 * - 双向同步：表格 ↔ JSON
 * - 只读模式
 */
import React, { useState, useCallback, useEffect } from 'react';
import { Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';

// ── Types ────────────────────────────────────────────────────────────────────

export interface SchemaField {
  name: string;
  type: string;
  required: boolean;
  description: string;
  enum?: string[];
  /** nested properties for object type */
  children?: SchemaField[];
  /** item type info for array type */
  itemType?: string;
}

interface Props {
  /** JSON Schema object (parsed) */
  schema: Record<string, unknown> | null;
  /** called when schema changes; null = no change callback (readonly) */
  onChange?: (schema: Record<string, unknown>) => void;
  /** read-only mode */
  readonly?: boolean;
  /** placeholder when empty */
  emptyText?: string;
}

// ── Helpers: Schema ↔ Fields ─────────────────────────────────────────────────

function schemaToFields(schema: Record<string, unknown> | null): SchemaField[] {
  if (!schema) return [];
  const properties = (schema.properties ?? {}) as Record<string, Record<string, unknown>>;
  const required = (schema.required ?? []) as string[];

  return Object.entries(properties).map(([name, prop]) => {
    const type = Array.isArray(prop.type) ? prop.type[0] : (prop.type as string ?? 'string');
    const field: SchemaField = {
      name,
      type,
      required: required.includes(name),
      description: (prop.description as string) ?? '',
    };
    if (prop.enum) field.enum = prop.enum as string[];
    if (type === 'object' && prop.properties) {
      field.children = schemaToFields(prop as Record<string, unknown>);
    }
    if (type === 'array' && prop.items) {
      const items = prop.items as Record<string, unknown>;
      field.itemType = (items.type as string) ?? 'object';
      if (items.type === 'object' && items.properties) {
        field.children = schemaToFields(items as Record<string, unknown>);
      }
    }
    return field;
  });
}

function fieldsToSchema(fields: SchemaField[]): Record<string, unknown> {
  const properties: Record<string, Record<string, unknown>> = {};
  const required: string[] = [];

  for (const f of fields) {
    const prop: Record<string, unknown> = { type: f.type };
    if (f.description) prop.description = f.description;
    if (f.enum && f.enum.length > 0) prop.enum = f.enum;
    if (f.type === 'object' && f.children && f.children.length > 0) {
      const nested = fieldsToSchema(f.children);
      prop.properties = nested.properties;
      if ((nested.required as string[])?.length > 0) prop.required = nested.required;
    }
    if (f.type === 'array') {
      if (f.children && f.children.length > 0) {
        const nested = fieldsToSchema(f.children);
        prop.items = { type: 'object', properties: nested.properties, required: nested.required };
      } else {
        prop.items = { type: f.itemType ?? 'string' };
      }
    }
    properties[f.name] = prop;
    if (f.required) required.push(f.name);
  }

  return { type: 'object', properties, required };
}

// ── Component ────────────────────────────────────────────────────────────────

const FIELD_TYPES = ['string', 'number', 'boolean', 'object', 'array', 'integer'];

export function SchemaTableEditor({ schema, onChange, readonly = false, emptyText = '无字段定义' }: Props) {
  const [mode, setMode] = useState<'table' | 'json'>('table');
  const [fields, setFields] = useState<SchemaField[]>(() => schemaToFields(schema));
  const [jsonText, setJsonText] = useState(() => schema ? JSON.stringify(schema, null, 2) : '{}');
  const [jsonError, setJsonError] = useState<string | null>(null);

  // sync when schema prop changes externally
  useEffect(() => {
    setFields(schemaToFields(schema));
    setJsonText(schema ? JSON.stringify(schema, null, 2) : '{}');
  }, [schema]);

  const emitChange = useCallback((newFields: SchemaField[]) => {
    setFields(newFields);
    const s = fieldsToSchema(newFields);
    setJsonText(JSON.stringify(s, null, 2));
    setJsonError(null);
    onChange?.(s);
  }, [onChange]);

  const handleJsonChange = useCallback((text: string) => {
    setJsonText(text);
    try {
      const parsed = JSON.parse(text);
      setJsonError(null);
      setFields(schemaToFields(parsed));
      onChange?.(parsed);
    } catch {
      setJsonError('JSON 格式不合法');
    }
  }, [onChange]);

  const handleAddField = () => {
    emitChange([...fields, { name: '', type: 'string', required: false, description: '' }]);
  };

  const handleRemoveField = (index: number) => {
    emitChange(fields.filter((_, i) => i !== index));
  };

  const handleUpdateField = (index: number, patch: Partial<SchemaField>) => {
    const next = [...fields];
    next[index] = { ...next[index], ...patch };
    emitChange(next);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-muted-foreground">
          {mode === 'table' ? '字段列表' : 'JSON Schema'}
        </span>
        <button
          onClick={() => setMode(mode === 'table' ? 'json' : 'table')}
          className="text-[11px] text-primary hover:underline"
        >
          {mode === 'table' ? '切换到 JSON Schema' : '切换到表格模式'}
        </button>
      </div>

      {mode === 'table' ? (
        <div>
          {fields.length > 0 ? (
            <div className="space-y-0">
              {/* Header */}
              <div className="grid grid-cols-[1fr_100px_48px_1.2fr_auto] gap-2 px-1 pb-2 border-b text-[11px] font-medium text-muted-foreground">
                <span>名称</span>
                <span>类型</span>
                <span className="text-center">必填</span>
                <span>描述</span>
                {!readonly && <span className="w-7" />}
              </div>
              {/* Rows */}
              {fields.map((field, i) => (
                <FieldRow
                  key={i}
                  field={field}
                  readonly={readonly}
                  onChange={patch => handleUpdateField(i, patch)}
                  onRemove={() => handleRemoveField(i)}
                />
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-4">{emptyText}</p>
          )}
          {!readonly && (
            <Button variant="ghost" size="xs" className="mt-2" onClick={handleAddField}>
              <Plus size={11} /> 添加字段
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {readonly ? (
            <pre className="text-[11px] font-mono bg-muted p-3 rounded-lg overflow-auto max-h-60">
              {jsonText}
            </pre>
          ) : (
            <Textarea
              value={jsonText}
              onChange={e => handleJsonChange(e.target.value)}
              className="font-mono text-[11px] h-60 resize-none"
              placeholder='{"type":"object","properties":{...}}'
            />
          )}
          {jsonError && <p className="text-[11px] text-destructive">{jsonError}</p>}
          {!readonly && (
            <div className="flex gap-2">
              <Button variant="outline" size="xs" onClick={() => {
                try { setJsonText(JSON.stringify(JSON.parse(jsonText), null, 2)); setJsonError(null); } catch { setJsonError('JSON 格式不合法'); }
              }}>格式化</Button>
              <Button variant="outline" size="xs" onClick={() => {
                try { JSON.parse(jsonText); setJsonError(null); alert('JSON Schema 合法'); } catch { setJsonError('JSON 格式不合法'); }
              }}>校验</Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── FieldRow ─────────────────────────────────────────────────────────────────

function FieldRow({ field, readonly, onChange, onRemove }: {
  field: SchemaField;
  readonly: boolean;
  onChange: (patch: Partial<SchemaField>) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasChildren = (field.type === 'object' || field.type === 'array') && field.children && field.children.length > 0;

  if (readonly) {
    return (
      <div className="grid grid-cols-[1fr_100px_48px_1.2fr] gap-2 px-1 py-2 border-b last:border-0 text-xs items-center">
        <span className="font-mono font-medium flex items-center gap-1">
          {hasChildren && (
            <button onClick={() => setExpanded(!expanded)} className="p-0.5">
              {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
            </button>
          )}
          {field.name}
        </span>
        <span className="text-muted-foreground">
          {field.type}{field.type === 'array' && field.itemType ? `<${field.itemType}>` : ''}
        </span>
        <span className="text-center">{field.required ? '✓' : '○'}</span>
        <span className="text-muted-foreground text-[11px]">
          {field.enum ? field.enum.join(', ') : field.description || '—'}
        </span>
      </div>
    );
  }

  return (
    <div className="border-b last:border-0">
      <div className="grid grid-cols-[1fr_100px_48px_1.2fr_auto] gap-2 px-1 py-1.5 items-center">
        <div className="flex items-center gap-1">
          {(field.type === 'object' || field.type === 'array') && (
            <button onClick={() => setExpanded(!expanded)} className="p-0.5 text-muted-foreground hover:text-foreground">
              {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
            </button>
          )}
          <Input
            value={field.name}
            onChange={e => onChange({ name: e.target.value })}
            placeholder="字段名"
            className="text-[11px] font-mono h-7"
          />
        </div>
        <Select value={field.type} onValueChange={v => {
          const nextType = v ?? 'string';
          const patch: Partial<SchemaField> = { type: nextType };
          if (nextType === 'object' || nextType === 'array') patch.children = field.children ?? [];
          if (nextType === 'array') patch.itemType = field.itemType ?? 'string';
          onChange(patch);
        }}>
          <SelectTrigger className="text-[11px] h-7"><SelectValue /></SelectTrigger>
          <SelectContent>
            {FIELD_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex justify-center">
          <Checkbox
            checked={field.required}
            onCheckedChange={v => onChange({ required: v === true })}
          />
        </div>
        <Input
          value={field.description}
          onChange={e => onChange({ description: e.target.value })}
          placeholder="描述"
          className="text-[11px] h-7"
        />
        <Button variant="ghost" size="icon-xs" className="text-destructive" onClick={onRemove}>
          <Trash2 size={11} />
        </Button>
      </div>
      {/* Nested children for object / array<object> */}
      {expanded && (field.type === 'object' || (field.type === 'array' && (field.itemType === 'object' || field.children?.length))) && (
        <div className="ml-6 pl-3 border-l border-dashed mb-2">
          <NestedFields
            fields={field.children ?? []}
            onChange={children => onChange({ children })}
          />
        </div>
      )}
    </div>
  );
}

// ── NestedFields ─────────────────────────────────────────────────────────────

function NestedFields({ fields, onChange }: { fields: SchemaField[]; onChange: (fields: SchemaField[]) => void }) {
  const handleAdd = () => onChange([...fields, { name: '', type: 'string', required: false, description: '' }]);
  const handleRemove = (i: number) => onChange(fields.filter((_, j) => j !== i));
  const handleUpdate = (i: number, patch: Partial<SchemaField>) => {
    const next = [...fields];
    next[i] = { ...next[i], ...patch };
    onChange(next);
  };

  return (
    <div>
      {fields.map((f, i) => (
        <FieldRow key={i} field={f} readonly={false} onChange={p => handleUpdate(i, p)} onRemove={() => handleRemove(i)} />
      ))}
      <Button variant="ghost" size="xs" className="mt-1" onClick={handleAdd}>
        <Plus size={10} /> 添加子字段
      </Button>
    </div>
  );
}
