/**
 * detect_asset_need.ts
 * 检测技能是否需要 assets 回复模板（同一操作工具可能被多次调用）
 */
import type { ValidationCheck, DraftInput } from './types.ts';
import { extractMermaidBlock, parseStateDiagram } from './validate_statediagram.ts';

/** 查询类工具前缀——这些工具被多次调用是正常的，不需要 assets */
const QUERY_PREFIXES = ['query_', 'check_', 'diagnose_', 'get_', 'list_', 'search_', 'verify_'];

function isQueryTool(toolName: string): boolean {
  return QUERY_PREFIXES.some(prefix => toolName.startsWith(prefix));
}

export function detectAssetNeed(skillMd: string, assets: DraftInput['assets']): ValidationCheck[] {
  const checks: ValidationCheck[] = [];

  const mermaid = extractMermaidBlock(skillMd);
  if (!mermaid) return checks;

  const diagram = parseStateDiagram(mermaid);
  const toolAnnotations = diagram.annotations.filter(a => a.type === 'tool');

  // 统计每个工具出现次数
  const toolCounts = new Map<string, number>();
  for (const ann of toolAnnotations) {
    toolCounts.set(ann.value, (toolCounts.get(ann.value) ?? 0) + 1);
  }

  // 找出操作类工具被多次引用的情况
  const multiCallOperationTools: string[] = [];
  for (const [tool, count] of toolCounts) {
    if (count >= 2 && !isQueryTool(tool)) {
      multiCallOperationTools.push(tool);
    }
  }

  if (multiCallOperationTools.length === 0) return checks;

  // 检查是否已有 assets
  if (!assets || assets.length === 0) {
    checks.push({
      rule: 'asset.need_missing',
      severity: 'warning',
      message: `操作工具 ${multiCallOperationTools.join(', ')} 在状态图中被多次引用，建议创建 assets 回复模板以防止 tool_call 泄漏`,
    });
  }

  // 检查 SKILL.md 中是否有单步约束
  const singleStepPatterns = [
    /每次只调用一次/,
    /禁止.*连续调用/,
    /禁止.*同一轮.*调用.*两次/,
    /单步单动作/,
  ];
  const hasSingleStepRule = singleStepPatterns.some(p => p.test(skillMd));
  if (!hasSingleStepRule) {
    checks.push({
      rule: 'asset.no_single_step_rule',
      severity: 'warning',
      message: `操作工具 ${multiCallOperationTools.join(', ')} 可能被连续调用，但 SKILL.md 中未包含"每次只调用一次"的显式约束`,
    });
  }

  return checks;
}
