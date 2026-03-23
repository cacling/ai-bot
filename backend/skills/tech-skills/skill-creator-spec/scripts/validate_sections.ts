/**
 * validate_sections.ts
 * 校验 SKILL.md 的章节顺序和必要章节存在性
 */
import type { ValidationCheck } from './types.ts';
import { REQUIRED_SECTIONS } from './types.ts';

interface SectionInfo {
  title: string;
  line: number;
}

/** 提取所有 ## 级标题及其行号 */
export function extractSections(skillMd: string): SectionInfo[] {
  const sections: SectionInfo[] = [];
  const lines = skillMd.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^## (.+)$/);
    if (m) {
      sections.push({ title: m[1].trim(), line: i + 1 });
    }
  }
  return sections;
}

/** 检查 frontmatter 后、第一个 ## 前是否有角色定义文本 */
function checkRoleDefinition(skillMd: string): boolean {
  // 跳过 frontmatter
  const afterFm = skillMd.replace(/^---[\s\S]*?---\s*/, '');
  // 跳过 # 一级标题行
  const afterTitle = afterFm.replace(/^#\s+.+\n*/, '');
  // 检查第一个 ## 前是否有非空文本
  const beforeFirstSection = afterTitle.split(/^## /m)[0];
  return beforeFirstSection.trim().length > 0;
}

export function validateSections(skillMd: string): ValidationCheck[] {
  const checks: ValidationCheck[] = [];
  const sections = extractSections(skillMd);
  const sectionTitles = sections.map(s => s.title);

  // 角色定义
  if (!checkRoleDefinition(skillMd)) {
    checks.push({ rule: 'sec.role_missing', severity: 'warning', message: '缺少角色定义（frontmatter 后、第一个 ## 前应有 1-2 句角色描述）' });
  }

  // 必要章节存在性
  for (const required of REQUIRED_SECTIONS) {
    if (!sectionTitles.includes(required)) {
      checks.push({ rule: `sec.${required}_missing`, severity: 'error', message: `缺少必要章节 "## ${required}"` });
    }
  }

  // 章节顺序
  const foundIndices: number[] = [];
  for (const required of REQUIRED_SECTIONS) {
    const idx = sectionTitles.indexOf(required);
    if (idx !== -1) foundIndices.push(idx);
  }
  for (let i = 1; i < foundIndices.length; i++) {
    if (foundIndices[i] < foundIndices[i - 1]) {
      const current = REQUIRED_SECTIONS[i];
      const prev = REQUIRED_SECTIONS[i - 1];
      const sec = sections[foundIndices[i]];
      checks.push({
        rule: 'sec.order_wrong',
        severity: 'error',
        message: `"## ${current}" 应在 "## ${prev}" 之后，但出现在第 ${sec.line} 行`,
        location: `line:${sec.line}`,
      });
      break; // 只报第一个顺序错误
    }
  }

  // 自造章节检测
  const knownTitles = new Set<string>([...REQUIRED_SECTIONS, '多业务退订规则', '边界与转向', '高冲突场景澄清']);
  for (const sec of sections) {
    // 忽略嵌套子标题（不以 ## 开头的上下文）和已知扩展章节
    if (!knownTitles.has(sec.title) && !sec.title.startsWith('附录')) {
      checks.push({
        rule: 'sec.unknown_section',
        severity: 'info',
        message: `检测到非标准章节 "## ${sec.title}"（第 ${sec.line} 行）`,
        location: `line:${sec.line}`,
      });
    }
  }

  return checks;
}
