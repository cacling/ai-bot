const CUSTOMER_GUIDANCE_HEADING = '客户引导状态图';
const MERMAID_BLOCK_RE = /```mermaid\s*\r?\n([\s\S]*?)```/m;
const SECTION_HEADING_RE = new RegExp(`^##\\s+${CUSTOMER_GUIDANCE_HEADING}\\s*$`, 'm');

export interface SkillMarkdownSectionMatch {
  hasSection: boolean;
  hasMermaidBlock: boolean;
  mermaid: string | null;
  sectionStart: number | null;
  sectionEnd: number | null;
  bodyStart: number | null;
  blockStart: number | null;
  blockEnd: number | null;
  contentStart: number | null;
  contentEnd: number | null;
}

export function findCustomerGuidanceDiagramSection(skillMd: string): SkillMarkdownSectionMatch {
  const headingMatch = SECTION_HEADING_RE.exec(skillMd);
  if (!headingMatch) {
    return {
      hasSection: false,
      hasMermaidBlock: false,
      mermaid: null,
      sectionStart: null,
      sectionEnd: null,
      bodyStart: null,
      blockStart: null,
      blockEnd: null,
      contentStart: null,
      contentEnd: null,
    };
  }

  const sectionStart = headingMatch.index;
  const bodyStart = sectionStart + headingMatch[0].length;

  const nextHeadingRe = /^##\s+/gm;
  nextHeadingRe.lastIndex = bodyStart;
  const nextHeading = nextHeadingRe.exec(skillMd);
  const sectionEnd = nextHeading ? nextHeading.index : skillMd.length;
  const body = skillMd.slice(bodyStart, sectionEnd);
  const mermaidMatch = MERMAID_BLOCK_RE.exec(body);

  if (!mermaidMatch) {
    return {
      hasSection: true,
      hasMermaidBlock: false,
      mermaid: null,
      sectionStart,
      sectionEnd,
      bodyStart,
      blockStart: null,
      blockEnd: null,
      contentStart: null,
      contentEnd: null,
    };
  }

  const blockStart = bodyStart + mermaidMatch.index;
  const blockEnd = blockStart + mermaidMatch[0].length;
  const contentStart = blockStart + mermaidMatch[0].indexOf(mermaidMatch[1]);
  const contentEnd = contentStart + mermaidMatch[1].length;

  return {
    hasSection: true,
    hasMermaidBlock: true,
    mermaid: mermaidMatch[1],
    sectionStart,
    sectionEnd,
    bodyStart,
    blockStart,
    blockEnd,
    contentStart,
    contentEnd,
  };
}

export function extractPrimaryMermaidBlock(skillMd: string): string | null {
  const section = findCustomerGuidanceDiagramSection(skillMd);
  if (section.mermaid) return section.mermaid;
  const fallback = MERMAID_BLOCK_RE.exec(skillMd);
  return fallback ? fallback[1] : null;
}
