/**
 * validate_refs.ts
 * 校验状态图中 %% ref: 和 %% tool: 注释与实际文件/工具的一致性
 */
import type { ValidationCheck, DraftInput } from './types.ts';
import { extractMermaidBlock, parseStateDiagram } from './validate_statediagram.ts';

export function validateRefs(input: DraftInput): ValidationCheck[] {
  const checks: ValidationCheck[] = [];

  const mermaid = extractMermaidBlock(input.skill_md);
  if (!mermaid) return checks;

  const diagram = parseStateDiagram(mermaid);

  // 收集所有 ref 和 tool 注释
  const refAnnotations = diagram.annotations.filter(a => a.type === 'ref');
  const toolAnnotations = diagram.annotations.filter(a => a.type === 'tool');

  // 构建文件名集合
  const refFilenames = new Set(input.references.map(r => r.filename));
  const assetFilenames = new Set(input.assets.map(a => a.filename));

  // 检查 ref 文件存在性
  for (const ref of refAnnotations) {
    const fullPath = ref.value; // e.g. "cancellation-policy.md#标准退订指引" or "assets/cancel-result.md"
    const filename = fullPath.split('#')[0]; // 去掉 #section

    if (filename.startsWith('assets/')) {
      const assetName = filename.replace('assets/', '');
      if (!assetFilenames.has(assetName)) {
        checks.push({
          rule: 'ref.file_missing',
          severity: 'error',
          message: `状态图引用了 assets 文件 "${assetName}"，但 assets 列表中不存在`,
          location: `statediagram:line:${ref.line}`,
        });
      }
    } else if (!refFilenames.has(filename)) {
      // references 中找不到时，回退检查 assets（LLM 可能省略了 assets/ 前缀）
      if (assetFilenames.has(filename)) {
        checks.push({
          rule: 'ref.asset_missing_prefix',
          severity: 'info',
          message: `状态图引用 "${filename}" 实际存在于 assets 中，建议改为 "assets/${filename}"`,
          location: `statediagram:line:${ref.line}`,
        });
      } else {
        checks.push({
          rule: 'ref.file_missing',
          severity: 'error',
          message: `状态图引用了 "${filename}"，但 references 和 assets 列表中均不存在`,
          location: `statediagram:line:${ref.line}`,
        });
      }
    }
  }

  // 检查 tool 注册状态
  if (input.registered_tools) {
    const toolSet = new Set(input.registered_tools);
    const checkedTools = new Set<string>();

    for (const tool of toolAnnotations) {
      if (checkedTools.has(tool.value)) continue;
      checkedTools.add(tool.value);

      if (!toolSet.has(tool.value)) {
        checks.push({
          rule: 'ref.tool_missing',
          severity: 'error',
          message: `状态图引用了工具 "${tool.value}"，但系统中未注册`,
          location: `statediagram:line:${tool.line}`,
        });
      }
    }
  }

  // 孤儿 reference（存在但未被引用）
  const referencedFiles = new Set(
    refAnnotations
      .map(r => r.value.split('#')[0])
      .filter(f => !f.startsWith('assets/'))
  );
  for (const ref of input.references) {
    if (!referencedFiles.has(ref.filename)) {
      checks.push({
        rule: 'ref.orphan_file',
        severity: 'info',
        message: `参考文档 "${ref.filename}" 未被状态图中任何 %% ref: 引用`,
      });
    }
  }

  return checks;
}
