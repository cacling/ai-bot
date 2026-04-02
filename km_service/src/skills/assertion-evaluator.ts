/**
 * assertion-evaluator.ts — 共享断言引擎
 *
 * 供 version-based testcase runner 使用。
 */

// ── 类型 ─────────────────────────────────────────────────────────────────────

export interface Assertion {
  type: 'contains' | 'not_contains' | 'tool_called' | 'tool_not_called' | 'skill_loaded' | 'regex'
    | 'tool_called_any_of' | 'tool_called_before' | 'response_mentions_all' | 'response_mentions_any'
    | 'response_has_next_step' | 'llm_rubric';
  value: string;
}

export interface AssertionResult {
  type: string;
  value: string;
  passed: boolean;
  detail: string;
}

export type TestStatus = 'passed' | 'failed' | 'infra_error';

// ── Agent 结果中用于断言的字段 ──────────────────────────────────────────────────

export interface AgentResultForAssertion {
  text?: string;
  card?: { type: string; data?: unknown } | null;
  toolRecords?: Array<{ tool: string; args?: Record<string, unknown>; result?: unknown }>;
  transferData?: unknown;
  skill_diagram?: { skill_name?: string; mermaid?: string; active_node?: string } | null;
}

// ── 断言解析 ─────────────────────────────────────────────────────────────────

/**
 * 从 test_case 行解析断言列表。
 * 优先使用新 assertions 字段，fallback 到旧 expected_keywords。
 */
export function parseAssertions(tc: { assertions: string | null; expected_keywords: string }): Assertion[] {
  if (tc.assertions) {
    try { return JSON.parse(tc.assertions) as Assertion[]; } catch { /* fall through */ }
  }
  // 兼容旧格式：expected_keywords → contains 断言
  const keywords: string[] = JSON.parse(tc.expected_keywords);
  return keywords.map(kw => ({ type: 'contains' as const, value: kw }));
}

// ── 断言执行 ─────────────────────────────────────────────────────────────────

/**
 * 运行一组断言，返回每条的结果。
 * @param responseText Agent 回复文本
 * @param toolsCalled Agent 调用过的工具名列表
 * @param skillsLoaded Agent 加载过的技能名列表
 */
export function runAssertions(
  assertions: Assertion[],
  responseText: string,
  toolsCalled: string[],
  skillsLoaded: string[],
): AssertionResult[] {
  return assertions.map(a => {
    switch (a.type) {
      case 'contains': {
        const ok = responseText.includes(a.value);
        return { ...a, passed: ok, detail: ok ? `回复包含 "${a.value}"` : `回复未包含 "${a.value}"` };
      }
      case 'not_contains': {
        const ok = !responseText.includes(a.value);
        return { ...a, passed: ok, detail: ok ? `回复不包含 "${a.value}"` : `回复错误地包含了 "${a.value}"` };
      }
      case 'tool_called': {
        const ok = toolsCalled.includes(a.value);
        return { ...a, passed: ok, detail: ok ? `调用了工具 ${a.value}` : `未调用工具 ${a.value}（已调用: ${toolsCalled.join(', ') || '无'}）` };
      }
      case 'tool_not_called': {
        const ok = !toolsCalled.includes(a.value);
        return { ...a, passed: ok, detail: ok ? `未调用工具 ${a.value}` : `错误地调用了工具 ${a.value}` };
      }
      case 'skill_loaded': {
        const ok = skillsLoaded.includes(a.value);
        return { ...a, passed: ok, detail: ok ? `加载了技能 ${a.value}` : `未加载技能 ${a.value}（已加载: ${skillsLoaded.join(', ') || '无'}）` };
      }
      case 'regex': {
        try {
          const ok = new RegExp(a.value).test(responseText);
          return { ...a, passed: ok, detail: ok ? `匹配正则 /${a.value}/` : `未匹配正则 /${a.value}/` };
        } catch {
          return { ...a, passed: false, detail: `正则表达式无效: ${a.value}` };
        }
      }
      case 'tool_called_any_of': {
        const candidates = a.value.split(',').map(s => s.trim());
        const matched = candidates.filter(t => toolsCalled.includes(t));
        const ok = matched.length > 0;
        return { ...a, passed: ok, detail: ok ? `调用了工具 ${matched.join(', ')}` : `未调用任一工具 [${candidates.join(', ')}]（已调用: ${toolsCalled.join(', ') || '无'}）` };
      }
      case 'tool_called_before': {
        // value format: "toolA,toolB" — asserts toolA was called before toolB
        const [before, after] = a.value.split(',').map(s => s.trim());
        const idxBefore = toolsCalled.indexOf(before);
        const idxAfter = toolsCalled.indexOf(after);
        if (idxBefore === -1) {
          return { ...a, passed: false, detail: `工具 ${before} 未被调用（已调用: ${toolsCalled.join(', ') || '无'}）` };
        }
        if (idxAfter === -1) {
          return { ...a, passed: false, detail: `工具 ${after} 未被调用（已调用: ${toolsCalled.join(', ') || '无'}）` };
        }
        const ok = idxBefore < idxAfter;
        return { ...a, passed: ok, detail: ok ? `${before} 在 ${after} 之前调用（SOP 顺序正确）` : `${before} 在 ${after} 之后调用（SOP 顺序违规）` };
      }
      case 'response_mentions_all': {
        const keywords = a.value.split(',').map(s => s.trim());
        const missing = keywords.filter(kw => !responseText.includes(kw));
        const ok = missing.length === 0;
        return { ...a, passed: ok, detail: ok ? `回复包含所有关键词: ${keywords.join(', ')}` : `回复缺少关键词: ${missing.join(', ')}` };
      }
      case 'response_mentions_any': {
        const keywords = a.value.split(',').map(s => s.trim());
        const matched = keywords.filter(kw => responseText.includes(kw));
        const ok = matched.length > 0;
        return { ...a, passed: ok, detail: ok ? `回复包含关键词: ${matched.join(', ')}` : `回复未包含任一关键词: ${keywords.join(', ')}` };
      }
      case 'response_has_next_step': {
        const patterns = ['您可以', '建议您', '如需', '下一步', '请您', '可以通过', '前往', '拨打',
          '是否需要', '需要我', '您看', '如果您', '如有', '请问', '告诉我', '联系我', '帮您', '为您'];
        const matched = patterns.filter(p => responseText.includes(p));
        const ok = matched.length > 0;
        return { ...a, passed: ok, detail: ok ? `回复包含下一步引导: "${matched[0]}"` : `回复缺少下一步引导（未匹配常见引导句式）` };
      }
      case 'llm_rubric':
        // llm_rubric 是异步的，同步 runAssertions 中标记为 pending，由 runAssertionsAsync 处理
        return { ...a, passed: false, detail: 'llm_rubric:pending' };
      default:
        return { ...a, passed: false, detail: `未知断言类型: ${a.type}` };
    }
  });
}

// ── LLM-as-Judge 语义评估 ──────────────────────────────────────────────────

const LLM_JUDGE_URL = process.env.LLM_JUDGE_URL ?? 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
const LLM_JUDGE_KEY = process.env.SKILL_CREATOR_API_KEY ?? '';
const LLM_JUDGE_MODEL = process.env.LLM_JUDGE_MODEL ?? 'qwen-max';

/**
 * 使用 LLM 裁判评估回复是否符合语义要求。
 * rubric: 自然语言描述的评估标准（如"回复应展示账单信息，包含金额"）
 * responseText: 机器人的实际回复
 * 返回 { passed, score, detail }
 */
async function evaluateLlmRubric(rubric: string, responseText: string): Promise<{ passed: boolean; score: number; detail: string }> {
  if (!LLM_JUDGE_KEY) {
    return { passed: false, score: 0, detail: 'LLM_JUDGE: SKILL_CREATOR_API_KEY 未配置' };
  }

  const systemPrompt = `你是一个 AI 回复质量评审员。请根据评审标准判断 AI 助手的回复是否合格。
输出 JSON 格式：{"pass": true/false, "score": 0.0-1.0, "reason": "简短理由"}
- score >= 0.6 为通过
- 只输出 JSON，不要其他内容`;

  const userPrompt = `## 评审标准
${rubric}

## AI 助手回复
${responseText}

请评审。`;

  try {
    const res = await fetch(LLM_JUDGE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${LLM_JUDGE_KEY}` },
      body: JSON.stringify({
        model: LLM_JUDGE_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.1,
      }),
    });

    if (!res.ok) {
      return { passed: false, score: 0, detail: `LLM_JUDGE: API 调用失败 (${res.status})` };
    }

    const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content ?? '';

    // 解析 JSON 响应
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { passed: false, score: 0, detail: `LLM_JUDGE: 无法解析响应 — ${content.slice(0, 100)}` };
    }

    const result = JSON.parse(jsonMatch[0]) as { pass?: boolean; score?: number; reason?: string };
    const score = result.score ?? (result.pass ? 1 : 0);
    const passed = score >= 0.6;
    return { passed, score, detail: `LLM_JUDGE: ${result.reason ?? (passed ? '通过' : '不通过')} (score=${score.toFixed(2)})` };
  } catch (err) {
    return { passed: false, score: 0, detail: `LLM_JUDGE: ${String(err)}` };
  }
}

/**
 * 异步版本的 runAssertions，支持 llm_rubric 断言类型。
 * 先执行同步断言，再异步执行 llm_rubric 断言。
 */
export async function runAssertionsAsync(
  assertions: Assertion[],
  responseText: string,
  toolsCalled: string[],
  skillsLoaded: string[],
): Promise<AssertionResult[]> {
  // 先跑同步断言
  const syncResults = runAssertions(assertions, responseText, toolsCalled, skillsLoaded);

  // 异步处理 llm_rubric
  const results = await Promise.all(syncResults.map(async (r, i) => {
    if (r.detail === 'llm_rubric:pending' && assertions[i].type === 'llm_rubric') {
      const evalResult = await evaluateLlmRubric(assertions[i].value, responseText);
      return { ...r, passed: evalResult.passed, detail: evalResult.detail };
    }
    return r;
  }));

  return results;
}

// ── 工具/技能提取 ────────────────────────────────────────────────────────────

/**
 * 从 Agent 执行结果中提取工具调用和技能加载列表。
 * 包含 card 类型 fallback 启发式和 get_skill_instructions 检测。
 */
export function extractToolsAndSkills(agentResult: AgentResultForAssertion): {
  toolsCalled: string[];
  skillsLoaded: string[];
} {
  const toolsCalled: string[] = [];
  const skillsLoaded: string[] = [];

  toolsCalled.push(...(agentResult.toolRecords ?? []).map(r => r.tool));

  // card 类型 fallback（toolRecords 为空时从 card 推断）
  if (toolsCalled.length === 0 && agentResult.card) {
    switch (agentResult.card.type) {
      case 'bill_card': toolsCalled.push('query_bill'); break;
      case 'cancel_card': toolsCalled.push('cancel_service'); break;
      case 'plan_card': toolsCalled.push('query_plans'); break;
      case 'diagnostic_card': toolsCalled.push('diagnose_network'); break;
    }
  }

  if (agentResult.transferData) toolsCalled.push('transfer_to_human');

  // 技能加载检测
  if (agentResult.skill_diagram?.skill_name) {
    skillsLoaded.push(agentResult.skill_diagram.skill_name);
  }
  for (const rec of agentResult.toolRecords ?? []) {
    if (rec.tool === 'get_skill_instructions' && rec.args?.skill_name && !skillsLoaded.includes(rec.args.skill_name as string)) {
      skillsLoaded.push(rec.args.skill_name as string);
    }
  }

  return { toolsCalled, skillsLoaded };
}

// ── 基础设施错误识别 ──────────────────────────────────────────────────────────

export const INFRA_ERROR_PATTERNS = [
  'ERR_TLS_CERT_ALTNAME_INVALID',
  'Too Many Requests',
  '429',
  'socket connection was closed',
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'fetch failed',
  'network error',
];

export function isInfraError(err: unknown): boolean {
  const msg = String(err);
  return INFRA_ERROR_PATTERNS.some(p => msg.includes(p));
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
