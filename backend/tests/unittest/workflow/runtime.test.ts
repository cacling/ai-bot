import { describe, test, expect, beforeAll } from 'bun:test';
import { executeWorkflow } from '../../../src/workflow/runtime';
import { registerDefaultExecutors } from '../../../src/workflow/executors';
import { NodeType } from '../../../src/workflow/types';
import type { WorkflowDefinition, WorkflowExecutionContext } from '../../../src/workflow/types';

beforeAll(() => {
  registerDefaultExecutors();
});

const SIMPLE_FLOW: WorkflowDefinition = {
  id: 'test', name: 'Test', version: '1.0.0',
  nodes: [
    { id: 'start', type: NodeType.Start, config: { triggerType: 'manual' }, outputs: [{ id: 'out' }] },
    { id: 'check', type: NodeType.If, config: { expression: 'vars.x > 5' }, outputs: [{ id: 'true' }, { id: 'false' }] },
    { id: 'end_yes', type: NodeType.End, name: 'Yes', config: { outputMode: 'none' }, inputs: [{ id: 'in' }] },
    { id: 'end_no', type: NodeType.End, name: 'No', config: { outputMode: 'none' }, inputs: [{ id: 'in' }] },
  ],
  edges: [
    { id: 'e1', sourceNodeId: 'start', sourcePortId: 'out', targetNodeId: 'check' },
    { id: 'e2', sourceNodeId: 'check', sourcePortId: 'true', targetNodeId: 'end_yes' },
    { id: 'e3', sourceNodeId: 'check', sourcePortId: 'false', targetNodeId: 'end_no' },
  ],
};

describe('Workflow Runtime (registry-based)', () => {
  test('executes start -> if(true) -> end', async () => {
    const ctx: WorkflowExecutionContext = {
      workflowId: 'test', executionId: 'e1',
      input: {}, vars: { x: 10 },
    };
    const result = await executeWorkflow(SIMPLE_FLOW, ctx);
    expect(result.status).toBe('completed');
    expect(result.executionLog.length).toBe(3); // start, if, end
    expect(result.executionLog[1].portIds).toEqual(['true']);
  });

  test('executes start -> if(false) -> end', async () => {
    const ctx: WorkflowExecutionContext = {
      workflowId: 'test', executionId: 'e2',
      input: {}, vars: { x: 2 },
    };
    const result = await executeWorkflow(SIMPLE_FLOW, ctx);
    expect(result.status).toBe('completed');
    expect(result.executionLog[1].portIds).toEqual(['false']);
  });

  test('human node pauses execution', async () => {
    const def: WorkflowDefinition = {
      id: 'test', name: 'Test', version: '1.0.0',
      nodes: [
        { id: 'start', type: NodeType.Start, config: { triggerType: 'manual' }, outputs: [{ id: 'out' }] },
        { id: 'human', type: NodeType.Human, config: { mode: 'approve' }, inputs: [{ id: 'in' }] },
        { id: 'end', type: NodeType.End, config: { outputMode: 'none' }, inputs: [{ id: 'in' }] },
      ],
      edges: [
        { id: 'e1', sourceNodeId: 'start', sourcePortId: 'out', targetNodeId: 'human' },
        { id: 'e2', sourceNodeId: 'human', sourcePortId: 'approved', targetNodeId: 'end' },
      ],
    };
    const ctx: WorkflowExecutionContext = {
      workflowId: 'test', executionId: 'e3',
      input: {}, vars: {},
    };
    const result = await executeWorkflow(def, ctx);
    expect(result.status).toBe('waiting_human');
    expect(result.currentNodeId).toBe('human');
  });

  test('guard node routes to rejected', async () => {
    const def: WorkflowDefinition = {
      id: 'test', name: 'Test', version: '1.0.0',
      nodes: [
        { id: 'start', type: NodeType.Start, config: { triggerType: 'manual' }, outputs: [{ id: 'out' }] },
        { id: 'guard', type: NodeType.Guard, config: { mode: 'rule', expression: 'vars.balance > 0', failMessage: 'Insufficient balance' }, outputs: [{ id: 'approved' }, { id: 'rejected' }] },
        { id: 'ok', type: NodeType.End, config: { outputMode: 'none' } },
        { id: 'fail', type: NodeType.End, config: { outputMode: 'none' } },
      ],
      edges: [
        { id: 'e1', sourceNodeId: 'start', sourcePortId: 'out', targetNodeId: 'guard' },
        { id: 'e2', sourceNodeId: 'guard', sourcePortId: 'approved', targetNodeId: 'ok' },
        { id: 'e3', sourceNodeId: 'guard', sourcePortId: 'rejected', targetNodeId: 'fail' },
      ],
    };
    const ctx: WorkflowExecutionContext = {
      workflowId: 'test', executionId: 'e4',
      input: {}, vars: { balance: -10 },
    };
    const result = await executeWorkflow(def, ctx);
    expect(result.status).toBe('completed');
    // Should have gone through: start -> guard(rejected) -> fail(end)
    expect(result.executionLog[1].portIds).toEqual(['rejected']);
  });
});
