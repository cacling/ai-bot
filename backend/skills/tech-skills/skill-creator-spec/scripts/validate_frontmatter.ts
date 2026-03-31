/**
 * validate_frontmatter.ts
 * 校验 SKILL.md 的 YAML frontmatter 完整性和格式
 */
import type { ValidationCheck, ParsedFrontmatter } from './types';
import { VALID_MODES, VALID_TRIGGERS, VALID_CHANNELS } from './types';

const SEMVER_RE = /^\d+\.\d+\.\d+$/;
const SKILL_NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** 从 SKILL.md 中提取 frontmatter 原始文本 */
export function extractFrontmatterRaw(skillMd: string): string | null {
  const m = skillMd.match(/^---\n([\s\S]*?)\n---/);
  return m ? m[1] : null;
}

/** 轻量 YAML 解析（只处理 frontmatter 中实际出现的简单结构） */
export function parseFrontmatter(raw: string): ParsedFrontmatter {
  const result: ParsedFrontmatter = {};
  let inMetadata = false;
  let currentKey = '';

  for (const line of raw.split('\n')) {
    const trimmed = line.trimEnd();

    // 顶层 key: value
    if (!trimmed.startsWith(' ') && !trimmed.startsWith('\t') && trimmed.includes(':')) {
      inMetadata = false;
      const colonIdx = trimmed.indexOf(':');
      const key = trimmed.slice(0, colonIdx).trim();
      const val = trimmed.slice(colonIdx + 1).trim();

      if (key === 'metadata') {
        inMetadata = true;
        result.metadata = result.metadata ?? {};
        continue;
      }
      if (key === 'name') result.name = unquote(val);
      if (key === 'description') result.description = unquote(val);
      continue;
    }

    // metadata 子字段
    if (inMetadata && (trimmed.startsWith('  ') || trimmed.startsWith('\t'))) {
      const stripped = trimmed.trim();
      if (stripped.includes(':')) {
        const colonIdx = stripped.indexOf(':');
        currentKey = stripped.slice(0, colonIdx).trim();
        const val = stripped.slice(colonIdx + 1).trim();
        result.metadata = result.metadata ?? {};

        if (currentKey === 'version') {
          result.metadata.version = unquote(val);
        } else if (currentKey === 'mode') {
          result.metadata.mode = unquote(val);
        } else if (currentKey === 'trigger') {
          result.metadata.trigger = unquote(val);
        } else if (currentKey === 'tags' || currentKey === 'channels') {
          // inline array: [a, b, c]
          if (val.startsWith('[')) {
            result.metadata[currentKey] = parseInlineArray(val);
          } else if (!val) {
            result.metadata[currentKey] = [];
          }
        }
      } else if (stripped.startsWith('- ') && (currentKey === 'tags' || currentKey === 'channels')) {
        // YAML list item
        result.metadata = result.metadata ?? {};
        result.metadata[currentKey] = result.metadata[currentKey] ?? [];
        result.metadata[currentKey]!.push(unquote(stripped.slice(2).trim()));
      }
    }
  }
  return result;
}

function unquote(s: string): string {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

function parseInlineArray(s: string): string[] {
  const inner = s.replace(/^\[/, '').replace(/\]$/, '').trim();
  if (!inner) return [];
  return inner.split(',').map(item => unquote(item.trim())).filter(Boolean);
}

export function validateFrontmatter(skillMd: string): ValidationCheck[] {
  const checks: ValidationCheck[] = [];

  const raw = extractFrontmatterRaw(skillMd);
  if (!raw) {
    checks.push({ rule: 'fm.missing', severity: 'error', message: '缺少 YAML frontmatter（需要 --- 包裹）' });
    return checks;
  }

  const fm = parseFrontmatter(raw);

  // name
  if (!fm.name) {
    checks.push({ rule: 'fm.name_missing', severity: 'error', message: 'frontmatter 缺少 name 字段', location: 'frontmatter.name' });
  } else if (!SKILL_NAME_RE.test(fm.name)) {
    checks.push({ rule: 'fm.name_format', severity: 'error', message: `name "${fm.name}" 不符合 kebab-case 格式`, location: 'frontmatter.name' });
  }

  // description
  if (!fm.description) {
    checks.push({ rule: 'fm.desc_missing', severity: 'error', message: 'frontmatter 缺少 description 字段', location: 'frontmatter.description' });
  }

  // metadata
  if (!fm.metadata) {
    checks.push({ rule: 'fm.metadata_missing', severity: 'error', message: 'frontmatter 缺少 metadata 块' });
    return checks;
  }

  // version
  if (!fm.metadata.version) {
    checks.push({ rule: 'fm.version_missing', severity: 'error', message: 'metadata 缺少 version 字段', location: 'metadata.version' });
  } else if (!SEMVER_RE.test(fm.metadata.version)) {
    checks.push({ rule: 'fm.version_format', severity: 'error', message: `version "${fm.metadata.version}" 不符合 x.y.z 格式`, location: 'metadata.version' });
  }

  // tags
  if (!fm.metadata.tags || fm.metadata.tags.length === 0) {
    checks.push({ rule: 'fm.tags_missing', severity: 'error', message: 'metadata 缺少 tags 或为空数组', location: 'metadata.tags' });
  } else if (fm.metadata.tags.length < 3) {
    checks.push({ rule: 'fm.tags_too_few', severity: 'warning', message: `tags 只有 ${fm.metadata.tags.length} 个，建议 3-8 个`, location: 'metadata.tags' });
  } else if (fm.metadata.tags.length > 8) {
    checks.push({ rule: 'fm.tags_too_many', severity: 'warning', message: `tags 有 ${fm.metadata.tags.length} 个，建议不超过 8 个`, location: 'metadata.tags' });
  }

  // mode
  if (!fm.metadata.mode) {
    checks.push({ rule: 'fm.mode_missing', severity: 'error', message: 'metadata 缺少 mode 字段', location: 'metadata.mode' });
  } else if (!(VALID_MODES as readonly string[]).includes(fm.metadata.mode)) {
    checks.push({ rule: 'fm.mode_invalid', severity: 'error', message: `mode "${fm.metadata.mode}" 无效，必须是 inbound 或 outbound`, location: 'metadata.mode' });
  }

  // trigger
  if (!fm.metadata.trigger) {
    checks.push({ rule: 'fm.trigger_missing', severity: 'error', message: 'metadata 缺少 trigger 字段', location: 'metadata.trigger' });
  } else if (!(VALID_TRIGGERS as readonly string[]).includes(fm.metadata.trigger)) {
    checks.push({ rule: 'fm.trigger_invalid', severity: 'error', message: `trigger "${fm.metadata.trigger}" 无效，必须是 user_intent 或 task_dispatch`, location: 'metadata.trigger' });
  }

  // channels
  if (!fm.metadata.channels || fm.metadata.channels.length === 0) {
    checks.push({ rule: 'fm.channels_missing', severity: 'error', message: 'metadata 缺少 channels 或为空数组', location: 'metadata.channels' });
  } else {
    for (const ch of fm.metadata.channels) {
      if (!(VALID_CHANNELS as readonly string[]).includes(ch)) {
        checks.push({ rule: 'fm.channels_invalid', severity: 'error', message: `channel "${ch}" 无效`, location: 'metadata.channels' });
      }
    }
    // mode 与 channels 一致性
    if (fm.metadata.mode === 'outbound') {
      const inboundChannels = fm.metadata.channels.filter(ch => ch === 'online' || ch === 'voice');
      if (inboundChannels.length > 0) {
        checks.push({ rule: 'fm.mode_channel_mismatch', severity: 'warning', message: `outbound 模式不应绑定呼入渠道 (${inboundChannels.join(', ')})`, location: 'metadata.channels' });
      }
    }
  }

  return checks;
}
