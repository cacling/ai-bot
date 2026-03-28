/**
 * conversation-guidance.ts — 智能引导推荐服务
 *
 * 根据已发布 biz-skills 元数据和推荐模板，动态生成 Next Best Action 推荐。
 * 一期仅支持欢迎语后推荐，模板驱动 + 规则过滤。
 */
import { readFileSync, statSync } from 'fs';
import { resolve } from 'path';
import { type Lang } from './i18n';
import { getSkillsByChannel } from '../engine/skills';
import { TECH_SKILLS_DIR } from './paths';
import { logger } from './logger';

// ── 类型 ─────────────────────────────────────────────────────────────────────

export interface SuggestionOption {
  label: string;
  text: string;
  skill_hint: string | null;
  category: 'direct' | 'followup' | 'next_step' | 'transfer';
}

export interface SuggestionPayload {
  type: 'suggestions';
  title: string;
  options: SuggestionOption[];
}

interface TemplateEntry {
  label: string;
  skill_hint: string | null;
  category: string;
}

interface Templates {
  welcome: Record<Lang, TemplateEntry[]>;
}

// ── 模板缓存（支持热更新）────────────────────────────────────────────────────

const TEMPLATES_PATH = resolve(TECH_SKILLS_DIR, 'conversation-guidance/assets/suggestion-templates.json');
let _templates: Templates | null = null;
let _templatesMtime = 0;

function loadTemplates(): Templates {
  try {
    const mtime = statSync(TEMPLATES_PATH).mtimeMs;
    if (_templates && mtime === _templatesMtime) return _templates;
    _templates = JSON.parse(readFileSync(TEMPLATES_PATH, 'utf-8')) as Templates;
    _templatesMtime = mtime;
    return _templates;
  } catch (err) {
    logger.warn('guidance', 'template_load_error', { error: String(err) });
    return { welcome: { zh: [], en: [] } };
  }
}

// ── 标题 ─────────────────────────────────────────────────────────────────────

const TITLES: Record<Lang, string> = {
  zh: '根据您的问题，推荐您这样问',
  en: 'Based on your question, try asking:',
};

// ── 推荐上限 ─────────────────────────────────────────────────────────────────

const MAX_SUGGESTIONS = 6;

// ── 主函数 ────────────────────────────────────────────────────────────────────

export function getWelcomeSuggestions(params: {
  lang: Lang;
  channel: string;
  phone?: string;
}): SuggestionPayload {
  const { lang, channel } = params;
  const templates = loadTemplates();
  const candidates = templates.welcome[lang] ?? [];

  // 获取当前 channel 已发布的 biz-skill 名称集合
  const publishedSkills = new Set(getSkillsByChannel(channel).map(s => s.name));

  // 过滤：skill_hint 为 null（如转人工）始终保留；有 skill_hint 的必须已发布且 channel 可用
  const filtered = candidates.filter(c =>
    c.skill_hint === null || publishedSkills.has(c.skill_hint),
  );

  // 排序：direct 优先，transfer 末位
  const sorted = filtered.sort((a, b) => {
    if (a.category === 'transfer' && b.category !== 'transfer') return 1;
    if (a.category !== 'transfer' && b.category === 'transfer') return -1;
    return 0;
  });

  // 截取
  const options: SuggestionOption[] = sorted.slice(0, MAX_SUGGESTIONS).map(c => ({
    label: c.label,
    text: c.label,
    skill_hint: c.skill_hint,
    category: c.category as SuggestionOption['category'],
  }));

  logger.info('guidance', 'suggestions_generated', {
    phone: params.phone,
    trigger: 'welcome',
    skills: options.map(o => o.skill_hint).filter(Boolean),
    count: options.length,
  });

  return {
    type: 'suggestions',
    title: TITLES[lang],
    options,
  };
}
