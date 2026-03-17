/**
 * handoff-analyzer.ts — 转人工工单摘要生成器
 *
 * 单次 LLM 调用，同时产出：
 *   - 结构化 JSON（工单字段）
 *   - 自然语言摘要（80~150 字）
 *
 * Skill 定义从 backend/skills/handoff-analysis/SKILL.md 加载。
 */

import { generateText } from 'ai';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { NO_DATA_RE } from '../../services/tool-result';
import { siliconflow } from '../../engine/llm';

// ── 模型 ──────────────────────────────────────────────────────────────────────
const MODEL = siliconflow(
  process.env.SILICONFLOW_CHAT_MODEL ?? 'stepfun-ai/Step-3.5-Flash'
);

// ── Skill 加载 ─────────────────────────────────────────────────────────────────
import { TECH_SKILLS_DIR } from '../../services/paths';

const SKILL_SYSTEM = (() => {
  const raw = readFileSync(`${TECH_SKILLS_DIR}/handoff-analysis/SKILL.md`, 'utf-8');
  return raw.replace(/^---[\s\S]*?---\n/, '').trim();
})();

// ── 公共类型 ──────────────────────────────────────────────────────────────────
export interface TurnRecord { role: 'user' | 'assistant'; text: string; ts?: number; }
export interface ToolRecord { tool: string; args: Record<string, unknown>; result_summary: string; success: boolean; ts?: number; }

export interface HandoffAnalysis {
  customer_intent:       string;
  main_issue:            string;
  business_object:       string[];
  confirmed_information: string[];
  actions_taken:         string[];
  current_status:        string;
  handoff_reason:        string;
  next_action:           string;
  priority:              string;
  risk_flags:            string[];
  session_summary:       string;
}

// ── 工具名中文映射 ─────────────────────────────────────────────────────────────
const TOOL_LABEL: Record<string, string> = {
  query_subscriber: '查询账户信息',
  query_bill:       '查询账单',
  query_plans:      '查询套餐',
  cancel_service:   '退订业务',
  diagnose_network: '网络诊断',
};

// ── 默认值 ────────────────────────────────────────────────────────────────────
const DEFAULT_ANALYSIS: HandoffAnalysis = {
  customer_intent:       '未能分析',
  main_issue:            '会话分析失败，请查看对话记录',
  business_object:       [],
  confirmed_information: [],
  actions_taken:         [],
  current_status:        '处理中',
  handoff_reason:        '转人工',
  next_action:           '请主动问候用户，了解具体需求',
  priority:              '中',
  risk_flags:            [],
  session_summary:       '会话分析失败，请查看原始对话记录了解详情。',
};

// ── 解析 LLM 输出（JSON + 摘要文本）────────────────────────────────────────────
function parseOutput(raw: string): HandoffAnalysis {
  try {
    // 去掉可能存在的 ```json ... ``` 围栏
    const cleaned = raw
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/, '')
      .trim();

    // 找到 JSON 块结束位置（第一个顶层 }）
    let depth = 0, jsonEnd = -1;
    for (let i = 0; i < cleaned.length; i++) {
      if (cleaned[i] === '{') depth++;
      else if (cleaned[i] === '}') {
        depth--;
        if (depth === 0) { jsonEnd = i; break; }
      }
    }

    if (jsonEnd === -1) throw new Error('no JSON found');

    const jsonStr   = cleaned.slice(0, jsonEnd + 1);
    const afterJson = cleaned.slice(jsonEnd + 1).trim();

    const j = JSON.parse(jsonStr) as Partial<HandoffAnalysis>;

    return {
      customer_intent:       j.customer_intent       ?? DEFAULT_ANALYSIS.customer_intent,
      main_issue:            j.main_issue            ?? DEFAULT_ANALYSIS.main_issue,
      business_object:       Array.isArray(j.business_object)       ? j.business_object       : [],
      confirmed_information: Array.isArray(j.confirmed_information) ? j.confirmed_information : [],
      actions_taken:         Array.isArray(j.actions_taken)         ? j.actions_taken         : [],
      current_status:        j.current_status  ?? DEFAULT_ANALYSIS.current_status,
      handoff_reason:        j.handoff_reason  ?? DEFAULT_ANALYSIS.handoff_reason,
      next_action:           j.next_action     ?? DEFAULT_ANALYSIS.next_action,
      priority:              j.priority        ?? DEFAULT_ANALYSIS.priority,
      risk_flags:            Array.isArray(j.risk_flags) ? j.risk_flags : [],
      session_summary:       afterJson || DEFAULT_ANALYSIS.session_summary,
    };
  } catch {
    return { ...DEFAULT_ANALYSIS, session_summary: raw.slice(0, 200) || DEFAULT_ANALYSIS.session_summary };
  }
}

// ── 格式化输入 ─────────────────────────────────────────────────────────────────
function buildPrompt(turns: TurnRecord[], toolCalls: ToolRecord[], lang: 'zh' | 'en' = 'zh'): string {
  const dialog = turns
    .slice(-12)
    .map(t => `${t.role === 'user' ? '用户' : '客服'}：${t.text}`)
    .join('\n');

  // NO_DATA_RE imported at top from utils/tool-result
  const tools = toolCalls
    .slice(-8)
    .map(tc => {
      const label = TOOL_LABEL[tc.tool] ?? tc.tool;
      const status = !tc.success ? '失败'
        : NO_DATA_RE.test(tc.result_summary) ? '成功（无数据）'
        : '成功';
      return `[${label}] ${status} | ${tc.result_summary.slice(0, 150)}`;
    })
    .join('\n');

  const langInstruction = lang === 'en'
    ? '\nIMPORTANT: Output all JSON field values and the summary text in English.'
    : '';

  return (
    `以下是用户与语音客服机器人的对话记录：\n${dialog}\n` +
    (tools ? `\n已执行的工具调用：\n${tools}\n` : '') +
    `\n请按 SKILL.md 要求生成工单摘要。${langInstruction}`
  );
}

// ── 主入口 ────────────────────────────────────────────────────────────────────
export async function analyzeHandoff(
  turns: TurnRecord[],
  toolCalls: ToolRecord[],
  lang: 'zh' | 'en' = 'zh',
): Promise<HandoffAnalysis> {
  if (turns.length === 0) return DEFAULT_ANALYSIS;

  try {
    const { text } = await generateText({
      model: MODEL,
      system: SKILL_SYSTEM,
      messages: [{ role: 'user', content: buildPrompt(turns, toolCalls, lang) }],
      maxTokens: 800,
      temperature: 0,
    });
    return parseOutput(text);
  } catch {
    return DEFAULT_ANALYSIS;
  }
}
