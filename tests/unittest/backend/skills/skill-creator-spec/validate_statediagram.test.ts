import { describe, test, expect } from 'bun:test';
import { validateStatediagram, parseStateDiagram, extractMermaidBlock } from '../../../../../backend/skills/tech-skills/skill-creator-spec/scripts/validate_statediagram.ts';

// ── 正例 ──

const VALID_INBOUND = `
## 客户引导状态图

\`\`\`mermaid
stateDiagram-v2
    [*] --> 接收请求: 用户要求退订业务

    state 请求分类 <<choice>>
    接收请求 --> 请求分类
    请求分类 --> 标准退订入口: 标准退订请求 %% branch:standard_cancel
    请求分类 --> 未知扣费入口: 未知扣费投诉 %% branch:unknown_charge

    用户要求转人工 --> 转接10086: 引导拨打10086
    转接10086 --> [*]

    state 标准退订流程 {
        标准退订入口 --> 查询已订业务: query_subscriber(phone) %% tool:query_subscriber
        state 查询结果 <<choice>>
        查询已订业务 --> 查询结果
        查询结果 --> 说明退订影响: 成功
        查询结果 --> 提示稍后重试: 系统异常
        提示稍后重试 --> [*]

        说明退订影响 --> 执行退订: cancel_service(phone, service_id) %% tool:cancel_service
        state 退订结果 <<choice>>
        执行退订 --> 退订结果
        退订结果 --> 退订成功: 成功
        退订结果 --> 退订失败: 失败
    }

    退订成功 --> [*]
    退订失败 --> [*]
\`\`\`
`;

const VALID_OUTBOUND = `
\`\`\`mermaid
stateDiagram-v2
    [*] --> 任务下发

    任务下发 --> 合规检查
    state 合规结果 <<choice>>
    合规检查 --> 合规结果
    合规结果 --> 呼叫中: 时段合规
    合规结果 --> 任务延后: 不合规
    任务延后 --> [*]

    state 呼叫结果 <<choice>>
    呼叫中 --> 呼叫结果
    呼叫结果 --> 客户接听: 接通
    呼叫结果 --> 未接通: 未接
    呼叫结果 --> 忙线: 忙线
    未接通 --> [*]
    忙线 --> [*]

    用户要求转人工 --> 转接人工
    转接人工 --> [*]

    客户接听 --> [*]
\`\`\`
`;

// ── 反例 ──

const NO_MERMAID = `## 客户引导状态图\n\n没有 mermaid 块`;

const NO_START = `
\`\`\`mermaid
stateDiagram-v2
    A --> B
    B --> [*]
\`\`\`
`;

const NO_END = `
\`\`\`mermaid
stateDiagram-v2
    [*] --> A
    A --> B
\`\`\`
`;

const TOOL_NO_CHOICE = `
\`\`\`mermaid
stateDiagram-v2
    [*] --> 执行退订: cancel_service(phone, id) %% tool:cancel_service
    执行退订 --> 展示结果
    展示结果 --> [*]
\`\`\`
`;

const QUERY_NO_CHOICE = `
\`\`\`mermaid
stateDiagram-v2
    [*] --> 查询: query_subscriber(phone) %% tool:query_subscriber
    查询 --> 展示结果
    展示结果 --> [*]
\`\`\`
`;

const TRANSFER_NO_CHOICE = `
\`\`\`mermaid
stateDiagram-v2
    [*] --> A
    A --> 转人工: transfer_to_human() %% tool:transfer_to_human
    转人工 --> [*]
\`\`\`
`;

const NO_ESCALATION = `
\`\`\`mermaid
stateDiagram-v2
    [*] --> A
    state R <<choice>>
    A --> R
    R --> B: ok
    R --> C: fail
    B --> [*]
    C --> [*]
\`\`\`
`;

const OUTBOUND_NO_GATE = `
\`\`\`mermaid
stateDiagram-v2
    [*] --> 呼叫中
    state 结果 <<choice>>
    呼叫中 --> 结果
    结果 --> 客户接听: 接通
    结果 --> 未接通: 未接
    客户接听 --> [*]
    未接通 --> [*]
    用户要求转人工 --> 转接人工
    转接人工 --> [*]
\`\`\`
`;

// ── 测试 ──

describe('extractMermaidBlock', () => {
  test('提取 mermaid 块', () => {
    const block = extractMermaidBlock(VALID_INBOUND);
    expect(block).toBeTruthy();
    expect(block).toContain('stateDiagram-v2');
  });

  test('无 mermaid 返回 null', () => {
    expect(extractMermaidBlock(NO_MERMAID)).toBeNull();
  });
});

describe('parseStateDiagram', () => {
  test('解析状态和转移', () => {
    const block = extractMermaidBlock(VALID_INBOUND)!;
    const diagram = parseStateDiagram(block);
    expect(diagram.hasStart).toBe(true);
    expect(diagram.hasEnd).toBe(true);
    expect(diagram.states.length).toBeGreaterThan(5);
    expect(diagram.transitions.length).toBeGreaterThan(5);
  });

  test('提取 tool 注释', () => {
    const block = extractMermaidBlock(VALID_INBOUND)!;
    const diagram = parseStateDiagram(block);
    const tools = diagram.annotations.filter(a => a.type === 'tool');
    expect(tools.length).toBeGreaterThanOrEqual(2);
    expect(tools.map(t => t.value)).toContain('query_subscriber');
    expect(tools.map(t => t.value)).toContain('cancel_service');
  });

  test('提取 branch 注释', () => {
    const block = extractMermaidBlock(VALID_INBOUND)!;
    const diagram = parseStateDiagram(block);
    const branches = diagram.annotations.filter(a => a.type === 'branch');
    expect(branches.length).toBeGreaterThanOrEqual(2);
  });

  test('识别 choice 节点', () => {
    const block = extractMermaidBlock(VALID_INBOUND)!;
    const diagram = parseStateDiagram(block);
    const choices = diagram.states.filter(s => s.isChoice);
    expect(choices.length).toBeGreaterThanOrEqual(2);
  });
});

describe('validateStatediagram - inbound', () => {
  test('正确的 inbound 状态图无 error', () => {
    const checks = validateStatediagram(VALID_INBOUND, 'inbound');
    const errors = checks.filter(c => c.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  test('缺少 mermaid 块', () => {
    const checks = validateStatediagram(NO_MERMAID, 'inbound');
    expect(checks.some(c => c.rule === 'sd.missing')).toBe(true);
  });

  test('缺少起始状态', () => {
    const checks = validateStatediagram(NO_START, 'inbound');
    expect(checks.some(c => c.rule === 'sd.no_start')).toBe(true);
  });

  test('缺少终止状态', () => {
    const checks = validateStatediagram(NO_END, 'inbound');
    expect(checks.some(c => c.rule === 'sd.no_end')).toBe(true);
  });

  test('操作工具后无 choice → warning', () => {
    const checks = validateStatediagram(TOOL_NO_CHOICE, 'inbound');
    const toolWarnings = checks.filter(c => c.rule === 'sd.tool_no_choice' && c.severity === 'warning');
    expect(toolWarnings.length).toBeGreaterThan(0);
    expect(toolWarnings[0].message).toContain('操作工具');
  });

  test('查询工具后无 choice → warning', () => {
    const checks = validateStatediagram(QUERY_NO_CHOICE, 'inbound');
    const toolWarnings = checks.filter(c => c.rule === 'sd.tool_no_choice' && c.severity === 'warning');
    expect(toolWarnings.length).toBeGreaterThan(0);
    expect(toolWarnings[0].message).toContain('查询工具');
  });

  test('transfer_to_human 不需要 choice', () => {
    const checks = validateStatediagram(TRANSFER_NO_CHOICE, 'inbound');
    const toolChecks = checks.filter(c => c.rule === 'sd.tool_no_choice');
    expect(toolChecks).toHaveLength(0);
  });

  test('缺少转人工出口', () => {
    const checks = validateStatediagram(NO_ESCALATION, 'inbound');
    expect(checks.some(c => c.rule === 'sd.no_escalation')).toBe(true);
  });
});

describe('validateStatediagram - outbound', () => {
  test('正确的 outbound 状态图无 error', () => {
    const checks = validateStatediagram(VALID_OUTBOUND, 'outbound');
    const errors = checks.filter(c => c.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  test('outbound 缺少合规门控', () => {
    const checks = validateStatediagram(OUTBOUND_NO_GATE, 'outbound');
    expect(checks.some(c => c.rule === 'sd.outbound_no_gate')).toBe(true);
  });
});
