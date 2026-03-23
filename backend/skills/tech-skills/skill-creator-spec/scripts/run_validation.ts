/**
 * run_validation.ts
 * 技能草稿校验汇总入口
 */
import type { ValidationCheck, ValidationResult, DraftInput, SkillMode } from './types.ts';
import { validateFrontmatter, parseFrontmatter, extractFrontmatterRaw } from './validate_frontmatter.ts';
import { validateSections } from './validate_sections.ts';
import { validateStatediagram } from './validate_statediagram.ts';
import { validateRefs } from './validate_refs.ts';
import { detectAssetNeed } from './detect_asset_need.ts';

/** 从 frontmatter 中提取 mode，用于状态图校验 */
function extractMode(skillMd: string): SkillMode {
  const raw = extractFrontmatterRaw(skillMd);
  if (!raw) return 'inbound';
  const fm = parseFrontmatter(raw);
  return (fm.metadata?.mode === 'outbound' ? 'outbound' : 'inbound');
}

export function runValidation(input: DraftInput): ValidationResult {
  const mode = extractMode(input.skill_md);

  const allChecks: ValidationCheck[] = [
    ...validateFrontmatter(input.skill_md),
    ...validateSections(input.skill_md),
    ...validateStatediagram(input.skill_md, mode),
    ...validateRefs(input),
    ...detectAssetNeed(input.skill_md, input.assets),
  ];

  return {
    valid: allChecks.filter(c => c.severity === 'error').length === 0,
    errors: allChecks.filter(c => c.severity === 'error'),
    warnings: allChecks.filter(c => c.severity === 'warning'),
    infos: allChecks.filter(c => c.severity === 'info'),
  };
}
