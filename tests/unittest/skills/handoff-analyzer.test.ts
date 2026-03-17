/**
 * handoff-analyzer.test.ts — 转人工摘要解析测试
 *
 * 测试 parseOutput 的 JSON 解析、字段提取和容错逻辑。
 * 不调用 LLM，仅测试输出解析层。
 */

import { describe, test, expect } from 'bun:test';

// 从 handoff-analyzer.ts 复制 parseOutput 和 DEFAULT_ANALYSIS（避免触发 LLM 初始化）
interface HandoffAnalysis {
  customer_intent: string;
  main_issue: string;
  business_object: string[];
  confirmed_information: string[];
  actions_taken: string[];
  current_status: string;
  handoff_reason: string;
  next_action: string;
  priority: string;
  risk_flags: string[];
  session_summary: string;
}

const DEFAULT_ANALYSIS: HandoffAnalysis = {
  customer_intent: '未能分析',
  main_issue: '会话分析失败，请查看对话记录',
  business_object: [],
  confirmed_information: [],
  actions_taken: [],
  current_status: '处理中',
  handoff_reason: '转人工',
  next_action: '请主动问候用户，了解具体需求',
  priority: '中',
  risk_flags: [],
  session_summary: '会话分析失败，请查看原始对话记录了解详情。',
};

function parseOutput(raw: string): HandoffAnalysis {
  try {
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/, '').trim();
    let depth = 0, jsonEnd = -1;
    for (let i = 0; i < cleaned.length; i++) {
      if (cleaned[i] === '{') depth++;
      else if (cleaned[i] === '}') { depth--; if (depth === 0) { jsonEnd = i; break; } }
    }
    if (jsonEnd === -1) throw new Error('no JSON found');
    const jsonStr = cleaned.slice(0, jsonEnd + 1);
    const afterJson = cleaned.slice(jsonEnd + 1).trim();
    const j = JSON.parse(jsonStr) as Partial<HandoffAnalysis>;
    return {
      customer_intent: j.customer_intent ?? DEFAULT_ANALYSIS.customer_intent,
      main_issue: j.main_issue ?? DEFAULT_ANALYSIS.main_issue,
      business_object: Array.isArray(j.business_object) ? j.business_object : [],
      confirmed_information: Array.isArray(j.confirmed_information) ? j.confirmed_information : [],
      actions_taken: Array.isArray(j.actions_taken) ? j.actions_taken : [],
      current_status: j.current_status ?? DEFAULT_ANALYSIS.current_status,
      handoff_reason: j.handoff_reason ?? DEFAULT_ANALYSIS.handoff_reason,
      next_action: j.next_action ?? DEFAULT_ANALYSIS.next_action,
      priority: j.priority ?? DEFAULT_ANALYSIS.priority,
      risk_flags: Array.isArray(j.risk_flags) ? j.risk_flags : [],
      session_summary: afterJson || DEFAULT_ANALYSIS.session_summary,
    };
  } catch {
    return { ...DEFAULT_ANALYSIS, session_summary: raw.slice(0, 200) || DEFAULT_ANALYSIS.session_summary };
  }
}

describe('parseOutput — JSON + 摘要解析', () => {
  test('标准格式（JSON + 摘要文本）', () => {
    const raw = `{
  "customer_intent": "查询账单",
  "main_issue": "本月账单疑问",
  "business_object": ["账单"],
  "confirmed_information": ["手机号：138"],
  "actions_taken": ["查询账单"],
  "current_status": "已完成查询",
  "handoff_reason": "用户要求人工",
  "next_action": "核实费用",
  "priority": "高",
  "risk_flags": ["complaint"]
}
用户张三查询本月账单，发现异常扣费20元，情绪不满要求转人工。`;

    const result = parseOutput(raw);
    expect(result.customer_intent).toBe('查询账单');
    expect(result.priority).toBe('高');
    expect(result.risk_flags).toEqual(['complaint']);
    expect(result.session_summary).toContain('张三');
  });

  test('带 ```json 围栏的格式', () => {
    const raw = '```json\n{"customer_intent":"退订","main_issue":"退订视频包","business_object":[],"confirmed_information":[],"actions_taken":[],"current_status":"处理中","handoff_reason":"用户要求","next_action":"确认退订","priority":"中","risk_flags":[]}\n```\n摘要文本';
    const result = parseOutput(raw);
    expect(result.customer_intent).toBe('退订');
    expect(result.session_summary).toContain('摘要文本');
  });

  test('JSON 字段缺失时使用默认值', () => {
    const raw = '{"customer_intent":"测试"}';
    const result = parseOutput(raw);
    expect(result.customer_intent).toBe('测试');
    expect(result.main_issue).toBe(DEFAULT_ANALYSIS.main_issue);
    expect(result.priority).toBe('中');
    expect(result.risk_flags).toEqual([]);
  });

  test('完全无效的输入返回默认值', () => {
    const result = parseOutput('这不是 JSON 格式的内容');
    expect(result.customer_intent).toBe(DEFAULT_ANALYSIS.customer_intent);
    expect(result.session_summary).toBe('这不是 JSON 格式的内容');
  });

  test('空输入返回默认值', () => {
    const result = parseOutput('');
    expect(result.customer_intent).toBe(DEFAULT_ANALYSIS.customer_intent);
    expect(result.session_summary).toBe(DEFAULT_ANALYSIS.session_summary);
  });

  test('数组字段为非数组时返回空数组', () => {
    const raw = '{"business_object":"不是数组","risk_flags":"也不是"}';
    const result = parseOutput(raw);
    expect(result.business_object).toEqual([]);
    expect(result.risk_flags).toEqual([]);
  });

  test('JSON 后无摘要文本时使用默认摘要', () => {
    const raw = '{"customer_intent":"查询"}';
    const result = parseOutput(raw);
    expect(result.session_summary).toBe(DEFAULT_ANALYSIS.session_summary);
  });

  test('嵌套 JSON（含嵌套对象）正确找到顶层 }', () => {
    const raw = '{"customer_intent":"测试","nested":{"a":1}}\n这是摘要';
    const result = parseOutput(raw);
    expect(result.customer_intent).toBe('测试');
    expect(result.session_summary).toBe('这是摘要');
  });
});
