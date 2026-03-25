import type { WorkflowDefinition, WorkflowNode, WorkflowEdge } from './types/workflow-definition';
import type { WorkflowExecutionContext, NodeExecutionResult } from './types/execution';
import { resolveExecutor } from './executors';
import { NodeType } from './types/node-types';
import { logger } from '../services/logger';

export interface WorkflowRunResult {
  status: 'completed' | 'waiting_human' | 'error';
  outputs: Record<string, unknown>;
  currentNodeId: string | null;
  executionLog: Array<{ nodeId: string; type: string; status: string; portIds?: string[] }>;
}

/**
 * Execute a workflow definition using the executor registry.
 * Traverses the graph node by node, resolving the executor for each node type.
 */
export async function executeWorkflow(
  def: WorkflowDefinition,
  ctx: WorkflowExecutionContext,
): Promise<WorkflowRunResult> {
  const startNode = def.nodes.find(n => n.type === NodeType.Start);
  if (!startNode) {
    return { status: 'error', outputs: {}, currentNodeId: null, executionLog: [{ nodeId: '?', type: 'start', status: 'not_found' }] };
  }

  let currentNodeId: string | null = startNode.id;
  const executionLog: WorkflowRunResult['executionLog'] = [];
  let safety = 50;

  while (currentNodeId && safety-- > 0) {
    const node = def.nodes.find(n => n.id === currentNodeId);
    if (!node) {
      logger.warn('workflow-runtime', 'node_not_found', { nodeId: currentNodeId });
      break;
    }

    const executor = resolveExecutor(node.type);
    if (!executor) {
      logger.warn('workflow-runtime', 'no_executor', { nodeId: node.id, type: node.type });
      executionLog.push({ nodeId: node.id, type: node.type, status: 'no_executor' });
      return { status: 'error', outputs: ctx.vars, currentNodeId: node.id, executionLog };
    }

    // Execute the node
    let result: NodeExecutionResult;
    try {
      result = await executor.execute({ node: node as any, context: ctx });
    } catch (err) {
      logger.error('workflow-runtime', 'executor_error', { nodeId: node.id, error: String(err) });
      result = { status: 'error', error: { message: String(err) } };
    }

    executionLog.push({
      nodeId: node.id, type: node.type, status: result.status,
      portIds: result.nextPortIds,
    });

    // Merge outputs into vars
    if (result.outputs) {
      Object.assign(ctx.vars, result.outputs);
    }

    // Handle waiting_human — pause execution
    if (result.status === 'waiting_human') {
      return { status: 'waiting_human', outputs: ctx.vars, currentNodeId: node.id, executionLog };
    }

    // Handle error
    if (result.status === 'error') {
      // Check node's onError policy
      if (node.onError?.mode === 'route' && node.onError.routeToPortId) {
        const nextNode = resolveNextNode(def, node.id, [node.onError.routeToPortId]);
        currentNodeId = nextNode;
        continue;
      }
      if (node.onError?.mode === 'continue') {
        // Try default out port
        const nextNode = resolveNextNode(def, node.id, ['out']);
        currentNodeId = nextNode;
        continue;
      }
      return { status: 'error', outputs: ctx.vars, currentNodeId: node.id, executionLog };
    }

    // Resolve next node via edges
    const nextPortIds = result.nextPortIds ?? ['out'];
    currentNodeId = resolveNextNode(def, node.id, nextPortIds);

    // End node reached
    if (node.type === NodeType.End) {
      return { status: 'completed', outputs: ctx.vars, currentNodeId: null, executionLog };
    }
  }

  // Safety limit reached or no more nodes
  return { status: 'completed', outputs: ctx.vars, currentNodeId: null, executionLog };
}

/**
 * Find the next node ID by following edges from sourceNodeId with matching port.
 */
function resolveNextNode(def: WorkflowDefinition, sourceNodeId: string, portIds: string[]): string | null {
  for (const portId of portIds) {
    const edge = def.edges.find(e =>
      e.sourceNodeId === sourceNodeId &&
      (e.sourcePortId === portId || (!e.sourcePortId && portId === 'out'))
    );
    if (edge) return edge.targetNodeId;
  }
  // Fallback: try any edge from this node
  const anyEdge = def.edges.find(e => e.sourceNodeId === sourceNodeId);
  return anyEdge?.targetNodeId ?? null;
}
