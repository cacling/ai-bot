import { describe, test, expect } from 'bun:test';
import { NodeType, PortKind } from '../../../src/workflow/types';
import type { WorkflowDefinition, WorkflowNode } from '../../../src/workflow/types';

describe('Workflow type system', () => {
  test('NodeType enum has 20 values', () => {
    const values = Object.values(NodeType);
    expect(values.length).toBe(20);
  });

  test('PortKind has standard ports', () => {
    expect(PortKind.Error).toBe('error');
    expect(PortKind.Approved).toBe('approved');
    expect(PortKind.In).toBe('in');
    expect(PortKind.Out).toBe('out');
  });

  test('WorkflowDefinition can be constructed', () => {
    const def: WorkflowDefinition = {
      id: 'test', name: 'Test', version: '1.0.0',
      nodes: [
        { id: 'start', type: NodeType.Start, config: { triggerType: 'manual' as const }, outputs: [{ id: 'out' }] },
        { id: 'end', type: NodeType.End, config: { outputMode: 'none' as const } },
      ],
      edges: [
        { id: 'e1', sourceNodeId: 'start', sourcePortId: 'out', targetNodeId: 'end' },
      ],
    };
    expect(def.nodes.length).toBe(2);
    expect(def.edges.length).toBe(1);
  });

  test('WorkflowNode discriminated union type-checks correctly', () => {
    const toolNode: WorkflowNode = {
      id: 'tool1', type: NodeType.Tool,
      config: { toolRef: 'query_subscriber' },
    };
    expect(toolNode.type).toBe('tool');
    if (toolNode.type === NodeType.Tool) {
      expect(toolNode.config.toolRef).toBe('query_subscriber');
    }
  });

  test('All NodeType values are unique strings', () => {
    const values = Object.values(NodeType);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });
});
