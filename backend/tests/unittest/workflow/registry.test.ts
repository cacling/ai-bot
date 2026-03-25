import { describe, test, expect, beforeAll } from 'bun:test';
import { registerDefaultExecutors, resolveExecutor, hasExecutor, getRegisteredTypes } from '../../../src/workflow/executors';
import { NodeType } from '../../../src/workflow/types';

beforeAll(() => {
  registerDefaultExecutors();
});

describe('ExecutorRegistry', () => {
  test('registers 7 default executors', () => {
    const types = getRegisteredTypes();
    expect(types.length).toBe(7);
  });

  test('resolves Tool executor', () => {
    expect(hasExecutor(NodeType.Tool)).toBe(true);
    expect(resolveExecutor(NodeType.Tool)).toBeTruthy();
  });

  test('resolves LLM executor', () => {
    expect(hasExecutor(NodeType.LLM)).toBe(true);
  });

  test('resolves If executor', () => {
    expect(hasExecutor(NodeType.If)).toBe(true);
  });

  test('resolves Guard executor', () => {
    expect(hasExecutor(NodeType.Guard)).toBe(true);
  });

  test('returns undefined for unregistered type', () => {
    expect(resolveExecutor(NodeType.ForEach)).toBeUndefined();
  });

  test('If executor evaluates expression', async () => {
    const executor = resolveExecutor(NodeType.If)!;
    const result = await executor.execute({
      node: { id: 'test', type: NodeType.If, config: { expression: 'vars.x > 5' } } as any,
      context: { workflowId: 'w1', executionId: 'e1', input: {}, vars: { x: 10 } },
    });
    expect(result.status).toBe('success');
    expect(result.nextPortIds).toEqual(['true']);
  });

  test('If executor returns false port', async () => {
    const executor = resolveExecutor(NodeType.If)!;
    const result = await executor.execute({
      node: { id: 'test', type: NodeType.If, config: { expression: 'vars.x > 5' } } as any,
      context: { workflowId: 'w1', executionId: 'e1', input: {}, vars: { x: 2 } },
    });
    expect(result.nextPortIds).toEqual(['false']);
  });

  test('Guard executor with passing rule', async () => {
    const executor = resolveExecutor(NodeType.Guard)!;
    const result = await executor.execute({
      node: { id: 'test', type: NodeType.Guard, config: { mode: 'rule', expression: 'vars.balance > 0' } } as any,
      context: { workflowId: 'w1', executionId: 'e1', input: {}, vars: { balance: 100 } },
    });
    expect(result.nextPortIds).toEqual(['approved']);
  });

  test('Guard executor with failing rule', async () => {
    const executor = resolveExecutor(NodeType.Guard)!;
    const result = await executor.execute({
      node: { id: 'test', type: NodeType.Guard, config: { mode: 'rule', expression: 'vars.balance > 0' } } as any,
      context: { workflowId: 'w1', executionId: 'e1', input: {}, vars: { balance: -10 } },
    });
    expect(result.nextPortIds).toEqual(['rejected']);
  });

  test('Human executor returns waiting_human', async () => {
    const executor = resolveExecutor(NodeType.Human)!;
    const result = await executor.execute({
      node: { id: 'test', type: NodeType.Human, config: { mode: 'approve' } } as any,
      context: { workflowId: 'w1', executionId: 'e1', input: {}, vars: {} },
    });
    expect(result.status).toBe('waiting_human');
  });

  test('Start executor passes input through', async () => {
    const executor = resolveExecutor(NodeType.Start)!;
    const result = await executor.execute({
      node: { id: 'start', type: NodeType.Start, config: { triggerType: 'manual' } } as any,
      context: { workflowId: 'w1', executionId: 'e1', input: { message: 'hello' }, vars: {} },
    });
    expect(result.status).toBe('success');
    expect(result.outputs?.message).toBe('hello');
  });
});
