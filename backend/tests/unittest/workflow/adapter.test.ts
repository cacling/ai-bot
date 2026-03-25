import { describe, test, expect } from 'bun:test';
import { adaptWorkflowSpec } from '../../../src/workflow/adapter';
import type { WorkflowSpec } from '../../../src/engine/skill-workflow-types';
import { NodeType } from '../../../src/workflow/types';

const SIMPLE_SPEC: WorkflowSpec = {
  skillId: 'test', version: 1, startStepId: 'query',
  steps: {
    query: { id: 'query', label: 'Query', kind: 'tool', tool: 'query_subscriber', transitions: [{ target: 'check', guard: 'always' }] },
    check: { id: 'check', label: 'Check', kind: 'choice', transitions: [
      { target: 'confirm', guard: 'tool.success' },
      { target: 'error', guard: 'tool.error' },
    ]},
    confirm: { id: 'confirm', label: 'Confirm', kind: 'confirm', transitions: [
      { target: 'done', guard: 'user.confirm' },
      { target: 'cancelled', guard: 'user.cancel' },
    ]},
    done: { id: 'done', label: 'Done', kind: 'end', transitions: [] },
    cancelled: { id: 'cancelled', label: 'Cancelled', kind: 'end', transitions: [] },
    error: { id: 'error', label: 'Error', kind: 'human', transitions: [] },
  },
  terminalSteps: ['done', 'cancelled', 'error'],
};

describe('WorkflowSpec Adapter', () => {
  test('converts spec to definition', () => {
    const def = adaptWorkflowSpec(SIMPLE_SPEC);
    expect(def.id).toBe('test');
    expect(def.nodes.length).toBe(6);
    expect(def.edges.length).toBeGreaterThan(0);
  });

  test('maps tool step to NodeType.Tool', () => {
    const def = adaptWorkflowSpec(SIMPLE_SPEC);
    const toolNode = def.nodes.find(n => n.id === 'query');
    expect(toolNode?.type).toBe(NodeType.Tool);
  });

  test('maps confirm step to NodeType.Human', () => {
    const def = adaptWorkflowSpec(SIMPLE_SPEC);
    const confirmNode = def.nodes.find(n => n.id === 'confirm');
    expect(confirmNode?.type).toBe(NodeType.Human);
  });

  test('maps choice step to NodeType.Switch', () => {
    const def = adaptWorkflowSpec(SIMPLE_SPEC);
    const choiceNode = def.nodes.find(n => n.id === 'check');
    expect(choiceNode?.type).toBe(NodeType.Switch);
  });

  test('maps end step to NodeType.End', () => {
    const def = adaptWorkflowSpec(SIMPLE_SPEC);
    const endNode = def.nodes.find(n => n.id === 'done');
    expect(endNode?.type).toBe(NodeType.End);
  });

  test('creates edges from transitions', () => {
    const def = adaptWorkflowSpec(SIMPLE_SPEC);
    const queryEdges = def.edges.filter(e => e.sourceNodeId === 'query');
    expect(queryEdges.length).toBe(1);
    expect(queryEdges[0].targetNodeId).toBe('check');
  });
});
