import type { WorkflowSpec, WorkflowStep as OldStep } from '../engine/skill-workflow-types';
import type { WorkflowDefinition, WorkflowNode, WorkflowEdge } from './types/workflow-definition';
import { NodeType, PortKind } from './types/node-types';

/**
 * Convert an existing WorkflowSpec (from SOP compiler) to a WorkflowDefinition
 * for the registry-based runtime.
 */
export function adaptWorkflowSpec(spec: WorkflowSpec): WorkflowDefinition {
  const nodes: WorkflowNode[] = [];
  const edges: WorkflowEdge[] = [];
  let edgeCounter = 0;

  for (const step of Object.values(spec.steps)) {
    const node = convertStep(step);
    nodes.push(node);

    // Convert transitions to edges
    for (const t of step.transitions) {
      edgeCounter++;
      edges.push({
        id: `e${edgeCounter}`,
        sourceNodeId: step.id,
        sourcePortId: mapGuardToPort(t.guard),
        targetNodeId: t.target,
        targetPortId: 'in',
        label: t.label,
        condition: t.guard !== 'always' ? t.guard : undefined,
      });
    }
  }

  return {
    id: spec.skillId,
    name: spec.skillId,
    version: String(spec.version),
    nodes,
    edges,
  };
}

function convertStep(step: OldStep): WorkflowNode {
  switch (step.kind) {
    case 'tool':
      return {
        id: step.id, type: NodeType.Tool, name: step.label,
        inputs: [{ id: 'in' }],
        outputs: [{ id: 'out', kind: PortKind.Out }, { id: 'error', kind: PortKind.Error }],
        config: { toolRef: step.tool!, outputKey: step.output ?? 'toolResult' },
      };
    case 'message':
    case 'llm':    // New normalized value (message → llm)
      return {
        id: step.id, type: NodeType.LLM, name: step.label,
        inputs: [{ id: 'in' }],
        outputs: [{ id: 'out' }],
        config: { model: 'default', systemPrompt: `当前步骤：${step.label}`, outputKey: 'answer' },
      };
    case 'ref':
      return {
        id: step.id, type: NodeType.LLM, name: step.label,
        inputs: [{ id: 'in' }],
        outputs: [{ id: 'out' }],
        config: { model: 'default', systemPrompt: `参考文档：${step.ref ?? ''}`, outputKey: 'answer' },
        metadata: { ref: step.ref },
      };
    case 'confirm':
    case 'human':  // New normalized value (confirm → human); without transitions = escalation
      return {
        id: step.id, type: NodeType.Human, name: step.label,
        inputs: [{ id: 'in' }],
        outputs: [
          { id: 'approved', kind: PortKind.Approved },
          { id: 'rejected', kind: PortKind.Rejected },
        ],
        config: { mode: 'approve' as const },
      };
    case 'choice':
    case 'switch': // New normalized value (choice → switch)
      return {
        id: step.id, type: NodeType.Switch, name: step.label,
        inputs: [{ id: 'in' }],
        outputs: step.transitions.map(t => ({
          id: mapGuardToPort(t.guard),
          label: t.label,
        })),
        config: {
          expression: 'vars._lastGuard',
          cases: step.transitions.map(t => ({
            id: mapGuardToPort(t.guard),
            label: t.label ?? t.guard,
            match: t.guard,
          })),
        },
      };
    case 'end':
      return {
        id: step.id, type: NodeType.End, name: step.label,
        inputs: [{ id: 'in' }],
        outputs: [],
        config: { outputMode: 'none' as const },
      };
    default:
      return {
        id: step.id, type: NodeType.LLM, name: step.label,
        inputs: [{ id: 'in' }],
        outputs: [{ id: 'out' }],
        config: { model: 'default', outputKey: 'answer' },
      };
  }
}

function mapGuardToPort(guard: string): string {
  switch (guard) {
    case 'tool.success': return 'out';
    case 'tool.error': return 'error';
    case 'tool.no_data': return 'no_data';
    case 'user.confirm': return 'approved';
    case 'user.cancel': return 'rejected';
    case 'always': return 'out';
    default: return guard;
  }
}
