import { describe, test, expect } from 'bun:test';
import { compileWorkflow } from '../../../src/engine/skill-workflow-compiler';

function wrapMermaid(diagram: string): string {
  return `---
name: test-skill
description: test
metadata:
  version: "1.0.0"
  channels: ["online"]
---

# Test Skill

\`\`\`mermaid
stateDiagram-v2
${diagram}
\`\`\`
`;
}

describe('skill-workflow-compiler', () => {
  // ── Test 1: Simple linear skill with explicit annotations ──
  test('compiles a linear skill with explicit annotations', () => {
    const md = wrapMermaid(`
    [*] --> Query %% step:query %% kind:tool %% tool:query_subscriber
    state Check <<choice>>
    Query --> Check %% step:check %% kind:choice
    Check --> Show : ok %% guard:tool.success %% step:show %% kind:message
    Check --> Error : fail %% guard:tool.error %% step:error %% kind:human
    Show --> Confirm %% step:confirm %% kind:confirm
    Confirm --> Exec : yes %% guard:user.confirm %% step:exec %% kind:tool %% tool:do_action
    Confirm --> Cancel : no %% guard:user.cancel %% step:cancel %% kind:end
    Exec --> Done %% step:done %% kind:end
    Done --> [*]
    Error --> [*]
    `);

    const result = compileWorkflow(md, 'test-linear', 1);

    expect(result.errors).toEqual([]);
    expect(result.spec).not.toBeNull();

    const spec = result.spec!;
    expect(spec.skillId).toBe('test-linear');
    expect(spec.version).toBe(1);
    expect(spec.startStepId).toBe('query');

    // Check step kinds
    expect(spec.steps['query'].kind).toBe('tool');
    expect(spec.steps['query'].tool).toBe('query_subscriber');
    expect(spec.steps['check'].kind).toBe('switch');
    expect(spec.steps['show'].kind).toBe('llm');
    expect(spec.steps['confirm'].kind).toBe('human');
    expect(spec.steps['cancel'].kind).toBe('end');
    expect(spec.steps['exec'].kind).toBe('tool');
    expect(spec.steps['exec'].tool).toBe('do_action');
    expect(spec.steps['done'].kind).toBe('end');
    expect(spec.steps['error'].kind).toBe('human');

    // Check transitions from Check (choice) node
    const checkTransitions = spec.steps['check'].transitions;
    expect(checkTransitions.length).toBe(2);
    const toShow = checkTransitions.find(t => t.target === 'show');
    const toError = checkTransitions.find(t => t.target === 'error');
    expect(toShow?.guard).toBe('tool.success');
    expect(toError?.guard).toBe('tool.error');

    // Check transitions from Confirm
    const confirmTransitions = spec.steps['confirm'].transitions;
    expect(confirmTransitions.length).toBe(2);
    expect(confirmTransitions.find(t => t.target === 'exec')?.guard).toBe('user.confirm');
    expect(confirmTransitions.find(t => t.target === 'cancel')?.guard).toBe('user.cancel');

    // Terminal steps
    expect(spec.terminalSteps).toContain('done');
    expect(spec.terminalSteps).toContain('error');
  });

  // ── Test 2: Guard heuristic ──
  test('infers guards from Chinese labels using heuristic', () => {
    const md = wrapMermaid(`
    [*] --> 查询 %% step:query %% kind:tool %% tool:query_data
    state 检查结果 <<choice>>
    查询 --> 检查结果 %% step:check %% kind:choice
    检查结果 --> 展示结果 : 成功
    检查结果 --> 系统异常 : 系统异常
    展示结果 --> [*] %% step:show %% kind:end
    系统异常 --> [*] %% step:sys-error %% kind:end
    `);

    const result = compileWorkflow(md, 'test-heuristic', 1);

    expect(result.errors).toEqual([]);
    expect(result.spec).not.toBeNull();

    const checkStep = result.spec!.steps['check'];
    expect(checkStep.kind).toBe('switch');
    expect(checkStep.transitions.length).toBe(2);

    const successTrans = checkStep.transitions.find(t => t.label === '成功');
    expect(successTrans?.guard).toBe('tool.success');

    const errorTrans = checkStep.transitions.find(t => t.label === '系统异常');
    expect(errorTrans?.guard).toBe('tool.error');
  });

  // ── Test 3: Nested state flattening ──
  test('flattens nested states with parent prefix', () => {
    const md = wrapMermaid(`
    [*] --> 验证身份 %% step:verify %% kind:tool %% tool:verify_identity
    state 标准退订流程 {
      [*] --> 查询合约 %% step:query-contract %% kind:tool %% tool:query_contract
      state 合约检查 <<choice>>
      查询合约 --> 合约检查 %% step:contract-check %% kind:choice
      合约检查 --> 执行退订 : 无违约金 %% guard:tool.success %% step:do-unsub %% kind:tool %% tool:unsubscribe
      合约检查 --> 告知违约 : 有违约金 %% guard:tool.error %% step:penalty-info %% kind:message
      执行退订 --> [*]
      告知违约 --> [*]
    }
    验证身份 --> 标准退订流程
    标准退订流程 --> [*]
    `);

    const result = compileWorkflow(md, 'test-nested', 1);

    expect(result.errors).toEqual([]);
    expect(result.spec).not.toBeNull();

    const spec = result.spec!;

    // Nested nodes should be prefixed
    expect(spec.steps['query-contract']).toBeDefined();
    expect(spec.steps['query-contract'].label).toBe('标准退订流程.查询合约');
    expect(spec.steps['contract-check']).toBeDefined();
    expect(spec.steps['do-unsub']).toBeDefined();
    expect(spec.steps['do-unsub'].tool).toBe('unsubscribe');
    expect(spec.steps['penalty-info']).toBeDefined();

    // Entry to composite should rewrite to first child
    const verifyTransitions = spec.steps['verify'].transitions;
    expect(verifyTransitions.some(t => t.target === 'query-contract')).toBe(true);
  });

  // ── Test 4: Missing mermaid block ──
  test('returns error for missing mermaid block', () => {
    const md = `---
name: no-mermaid
description: no diagram
---

# No Diagram

Just some text without a mermaid block.
`;

    const result = compileWorkflow(md, 'test-no-mermaid', 1);

    expect(result.spec).toBeNull();
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('mermaid');
  });

  // ── Test 5: No start transition ──
  test('returns error for missing start transition', () => {
    const md = wrapMermaid(`
    A --> B %% step:a %% kind:message
    B --> [*] %% step:b %% kind:end
    `);

    const result = compileWorkflow(md, 'test-no-start', 1);

    expect(result.spec).toBeNull();
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('start');
  });

  // ── Additional: choice with fewer than 2 exits ──
  test('errors when choice node has fewer than 2 exits', () => {
    const md = wrapMermaid(`
    [*] --> A %% step:a %% kind:message
    state B <<choice>>
    A --> B %% step:b
    B --> C : ok %% step:c %% kind:end
    C --> [*]
    `);

    const result = compileWorkflow(md, 'test-choice-err', 1);

    expect(result.spec).toBeNull();
    expect(result.errors.some(e => e.includes('fewer than 2 exits'))).toBe(true);
  });
});
