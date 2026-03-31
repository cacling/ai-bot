/**
 * assertion-evaluator.ts — 共享断言引擎
 *
 * 从 sandbox.ts 提取，供 sandbox 回归测试 和 version-based testcase runner 共用。
 */

// ── 类型 ─────────────────────────────────────────────────────────────────────

export interface Assertion {
  type: 'contains' | 'not_contains' | 'tool_called' | 'tool_not_called' | 'skill_loaded' | 'regex'
    | 'tool_called_any_of' | 'tool_called_before' | 'response_mentions_all' | 'response_mentions_any' | 'response_has_next_step';
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
      default:
        return { ...a, passed: false, detail: `未知断言类型: ${a.type}` };
    }
  });
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
