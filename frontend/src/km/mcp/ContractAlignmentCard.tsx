/**
 * ContractAlignmentCard — 契约对齐卡片
 *
 * 对比 output_schema 与实际数据（Mock / Real 返回 / DB 列）的字段覆盖情况。
 * 三种实现方式（脚本/DB/API）和 Mock 场景共用。
 */
import { Check, AlertTriangle, Minus, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

// ── Types ────────────────────────────────────────────────────────────────────

export interface AlignmentResult {
  /** output_schema 要求的字段 */
  expected: string[];
  /** 实际数据中存在的字段 */
  actual: string[];
  /** 覆盖的字段 */
  covered: string[];
  /** 缺失的字段（在 schema 中但不在实际数据中） */
  missing: string[];
  /** 多余的字段（在实际数据中但不在 schema 中） */
  extra: string[];
  /** 覆盖率 0~1 */
  ratio: number;
}

// ── Core logic ───────────────────────────────────────────────────────────────

/**
 * 从 JSON Schema 中提取扁平化字段名列表（只取顶层 properties）
 */
export function extractSchemaFields(schema: Record<string, unknown> | null): string[] {
  if (!schema) return [];
  const props = schema.properties as Record<string, unknown> | undefined;
  if (!props) return [];
  return Object.keys(props);
}

/**
 * 从实际数据对象中提取字段名列表
 */
export function extractDataFields(data: unknown): string[] {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return [];
  return Object.keys(data as Record<string, unknown>);
}

/**
 * 对比 schema 与实际数据，返回对齐结果
 */
export function compareAlignment(
  schemaFields: string[],
  dataFields: string[],
): AlignmentResult {
  const expectedSet = new Set(schemaFields);
  const actualSet = new Set(dataFields);

  const covered = schemaFields.filter(f => actualSet.has(f));
  const missing = schemaFields.filter(f => !actualSet.has(f));
  const extra = dataFields.filter(f => !expectedSet.has(f));

  return {
    expected: schemaFields,
    actual: dataFields,
    covered,
    missing,
    extra,
    ratio: schemaFields.length > 0 ? covered.length / schemaFields.length : 1,
  };
}

/**
 * 快捷：从 schema + data 直接得到 AlignmentResult
 */
export function alignSchemaWithData(
  schema: Record<string, unknown> | null,
  data: unknown,
): AlignmentResult {
  return compareAlignment(extractSchemaFields(schema), extractDataFields(data));
}

/**
 * 快捷：从 schema + Mock JSON string 得到 AlignmentResult
 */
export function alignSchemaWithMockResponse(
  schema: Record<string, unknown> | null,
  mockResponse: string,
): AlignmentResult {
  try {
    const data = JSON.parse(mockResponse);
    return alignSchemaWithData(schema, data);
  } catch {
    return compareAlignment(extractSchemaFields(schema), []);
  }
}

// ── Component ────────────────────────────────────────────────────────────────

interface CardProps {
  /** 对齐结果 */
  alignment: AlignmentResult;
  /** 卡片标题 */
  title?: string;
  /** 紧凑模式（用于 Mock 卡片内嵌） */
  compact?: boolean;
}

export function ContractAlignmentCard({ alignment, title = '契约覆盖', compact = false }: CardProps) {
  const { covered, missing, extra, expected, ratio } = alignment;
  const isFullMatch = missing.length === 0 && extra.length === 0;
  const hasMissing = missing.length > 0;

  if (compact) {
    return (
      <div className="flex items-center gap-2 text-[11px]">
        {isFullMatch ? (
          <Badge variant="default" className="text-[9px]">{covered.length}/{expected.length} 字段对齐</Badge>
        ) : (
          <Badge variant={hasMissing ? 'destructive' : 'secondary'} className="text-[9px]">
            {covered.length}/{expected.length}
            {missing.length > 0 && ` -${missing.length}`}
            {extra.length > 0 && ` +${extra.length}`}
          </Badge>
        )}
      </div>
    );
  }

  return (
    <div className={`rounded-lg border p-3 space-y-2 ${
      isFullMatch ? 'border-emerald-200 bg-emerald-50/50' :
      hasMissing ? 'border-destructive/30 bg-destructive/5' :
      'border-amber-200 bg-amber-50/50'
    }`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">{title}</span>
        <div className="flex items-center gap-1.5">
          {isFullMatch
            ? <Check size={12} className="text-emerald-500" />
            : <AlertTriangle size={12} className={hasMissing ? 'text-destructive' : 'text-amber-500'} />
          }
          <span className={`text-xs font-semibold ${
            isFullMatch ? 'text-emerald-600' :
            hasMissing ? 'text-destructive' :
            'text-amber-600'
          }`}>
            {covered.length} / {expected.length}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            isFullMatch ? 'bg-emerald-400' :
            hasMissing ? 'bg-destructive' :
            'bg-amber-400'
          }`}
          style={{ width: `${Math.round(ratio * 100)}%` }}
        />
      </div>

      {/* Details */}
      {(missing.length > 0 || extra.length > 0) && (
        <div className="space-y-1 text-[11px]">
          {missing.length > 0 && (
            <div className="flex items-start gap-1.5">
              <Minus size={10} className="text-destructive mt-0.5 flex-shrink-0" />
              <span className="text-destructive">
                缺失：<span className="font-mono">{missing.join(', ')}</span>
              </span>
            </div>
          )}
          {extra.length > 0 && (
            <div className="flex items-start gap-1.5">
              <Plus size={10} className="text-amber-500 mt-0.5 flex-shrink-0" />
              <span className="text-amber-600">
                多余：<span className="font-mono">{extra.join(', ')}</span>
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Inline badge (for list/table use) ────────────────────────────────────────

export function AlignmentBadge({ alignment }: { alignment: AlignmentResult }) {
  const { covered, expected, missing, extra } = alignment;
  const isFullMatch = missing.length === 0 && extra.length === 0;
  const hasMissing = missing.length > 0;

  return (
    <Badge
      variant={isFullMatch ? 'default' : hasMissing ? 'destructive' : 'secondary'}
      className="text-[9px]"
      title={[
        missing.length > 0 ? `缺失: ${missing.join(', ')}` : '',
        extra.length > 0 ? `多余: ${extra.join(', ')}` : '',
      ].filter(Boolean).join('\n') || '完全对齐'}
    >
      {covered.length}/{expected.length}
      {missing.length > 0 && ` -${missing.length}`}
      {extra.length > 0 && ` +${extra.length}`}
    </Badge>
  );
}
