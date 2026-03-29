/**
 * workflow-service.ts — Workflow 编排引擎
 *
 * 驱动 work_item 的自动创��、状态流转、信号等待
 */
import { db, workflowDefinitions, workflowRuns, workflowRunEvents, workItems, eq, and } from "../db.js";
import { validateWorkflowRunTransition } from "../policies/workflow-policy.js";
import type { WorkflowRunStatus, WorkflowNodeType } from "../types.js";

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** spec_json 中的节点定义 */
interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  next?: string;               // 下一个节点 id
  config?: Record<string, unknown>;
  // if 节点
  condition?: string;          // context_json 中的 key
  then_next?: string;
  else_next?: string;
  // wait_signal 节点
  signal?: string;
}

interface WorkflowSpec {
  nodes: Record<string, WorkflowNode>;
  start_node: string;
}

/**
 * 列出所有 active 的 workflow 定义
 */
export async function listWorkflowDefinitions() {
  return db.select().from(workflowDefinitions)
    .where(eq(workflowDefinitions.status, 'active'))
    .all();
}

/**
 * 获取单个 workflow 定义
 */
export async function getWorkflowDefinition(id: string) {
  return db.select().from(workflowDefinitions)
    .where(eq(workflowDefinitions.id, id))
    .get();
}

/**
 * 通过 key 查找 active 的 workflow 定义
 */
export async function getWorkflowDefinitionByKey(key: string) {
  return db.select().from(workflowDefinitions)
    .where(and(eq(workflowDefinitions.key, key), eq(workflowDefinitions.status, 'active')))
    .get();
}

/**
 * 启动 Workflow Run
 */
export async function startWorkflowRun(
  definitionKey: string,
  itemId: string,
  context?: Record<string, unknown>,
): Promise<{ success: boolean; id?: string; error?: string }> {
  const def = await getWorkflowDefinitionByKey(definitionKey);
  if (!def) return { success: false, error: `Workflow 定义 "${definitionKey}" 不存在或未激活` };

  const spec = JSON.parse(def.spec_json) as WorkflowSpec;
  if (!spec.start_node || !spec.nodes[spec.start_node]) {
    return { success: false, error: `Workflow 定义 "${definitionKey}" 缺少 start_node` };
  }

  const id = generateId('wfr');
  const now = new Date().toISOString();

  await db.insert(workflowRuns).values({
    id,
    definition_id: def.id,
    item_id: itemId,
    status: 'running',
    current_node_id: spec.start_node,
    context_json: context ? JSON.stringify(context) : null,
    started_at: now,
    updated_at: now,
  }).run();

  // 写启动事件
  await writeRunEvent(id, 0, 'started', spec.start_node);

  // 开始推进
  await advanceWorkflow(id);

  return { success: true, id };
}

/**
 * 推进 Workflow — 主循环
 *
 * 从 current_node 开始执行，直到遇到 wait/end 或出错
 */
export async function advanceWorkflow(runId: string): Promise<void> {
  const maxSteps = 50; // 安全限制，防止无限循环
  let step = 0;

  while (step < maxSteps) {
    step++;

    const run = await db.select().from(workflowRuns).where(eq(workflowRuns.id, runId)).get();
    if (!run || run.status !== 'running') break;

    const def = await db.select().from(workflowDefinitions).where(eq(workflowDefinitions.id, run.definition_id)).get();
    if (!def) break;

    const spec = JSON.parse(def.spec_json) as WorkflowSpec;
    const nodeId = run.current_node_id;
    if (!nodeId) break;

    const node = spec.nodes[nodeId];
    if (!node) {
      await failRun(runId, `节点 "${nodeId}" 不存���于 spec_json`);
      break;
    }

    const context = run.context_json ? JSON.parse(run.context_json) as Record<string, unknown> : {};
    const seq = step;

    switch (node.type) {
      case 'start': {
        await writeRunEvent(runId, seq, 'node_completed', nodeId);
        await moveToNext(runId, node.next);
        break;
      }

      case 'create_item': {
        // 动态 import 避免循环依赖
        const { createWorkItem } = await import('./item-service.js');
        const config = node.config ?? {};
        const { id: childId } = await createWorkItem({
          type: (config.type as string) ?? 'work_order',
          subtype: config.subtype as string | undefined,
          title: (config.title as string) ?? '由 Workflow 创建',
          parent_id: run.item_id,
          customer_phone: context.phone as string | undefined,
        });
        // 写上下文
        context[`child_${nodeId}`] = childId;
        await updateContext(runId, context);
        await writeRunEvent(runId, seq, 'node_completed', nodeId, { child_id: childId });
        await moveToNext(runId, node.next);
        break;
      }

      case 'create_appointment': {
        const { createAppointment } = await import('./appointment-service.js');
        const config = node.config ?? {};
        const result = await createAppointment(run.item_id, {
          appointment_type: (config.appointment_type as string) ?? 'callback',
          scheduled_start_at: config.scheduled_start_at as string | undefined,
          location_text: config.location_text as string | undefined,
        });
        if (result.success) {
          context[`appointment_${nodeId}`] = result.id;
          await updateContext(runId, context);
        }
        await writeRunEvent(runId, seq, 'node_completed', nodeId, { appointment_id: result.id });
        await moveToNext(runId, node.next);
        break;
      }

      case 'transition_item': {
        const { transitionWorkOrder } = await import('./transition-service.js');
        const config = node.config ?? {};
        const targetId = (config.target_item_id as string) ?? run.item_id;
        const action = config.action as string;
        if (action) {
          await transitionWorkOrder(targetId, action as any);
        }
        await writeRunEvent(runId, seq, 'node_completed', nodeId, { action });
        await moveToNext(runId, node.next);
        break;
      }

      case 'wait_signal': {
        const signal = node.signal ?? (node.config?.signal as string) ?? 'unknown';
        await db.update(workflowRuns).set({
          status: 'waiting_signal',
          waiting_signal: signal,
          updated_at: new Date().toISOString(),
        }).where(eq(workflowRuns.id, runId)).run();
        await writeRunEvent(runId, seq, 'waiting_signal', nodeId, { signal });
        return; // 停止推进
      }

      case 'wait_children': {
        // 检查 item 的所有子项是否都已完成
        const children = await db.select({ status: workItems.status })
          .from(workItems)
          .where(eq(workItems.parent_id, run.item_id))
          .all();
        const allDone = children.length > 0 && children.every(c =>
          ['resolved', 'closed', 'cancelled'].includes(c.status),
        );
        if (allDone) {
          await writeRunEvent(runId, seq, 'node_completed', nodeId, { reason: 'all_children_done' });
          await moveToNext(runId, node.next);
        } else {
          await db.update(workflowRuns).set({
            status: 'waiting_child',
            updated_at: new Date().toISOString(),
          }).where(eq(workflowRuns.id, runId)).run();
          await writeRunEvent(runId, seq, 'waiting_child', nodeId);
          return; // 停止推进
        }
        break;
      }

      case 'if': {
        const conditionKey = node.condition ?? '';
        const conditionValue = context[conditionKey];
        const nextNodeId = conditionValue ? node.then_next : node.else_next;
        await writeRunEvent(runId, seq, 'node_completed', nodeId, { condition: conditionKey, result: !!conditionValue });
        await moveToNext(runId, nextNodeId);
        break;
      }

      case 'end': {
        const now = new Date().toISOString();
        await db.update(workflowRuns).set({
          status: 'completed',
          finished_at: now,
          updated_at: now,
        }).where(eq(workflowRuns.id, runId)).run();
        await writeRunEvent(runId, seq, 'completed', nodeId);
        return; // 完成
      }

      default:
        await failRun(runId, `未知节点类型: ${node.type}`);
        return;
    }
  }
}

/**
 * 向等待信号的 Workflow 发送信号
 */
export async function signalWorkflow(
  runId: string,
  signal: string,
  payload?: Record<string, unknown>,
): Promise<{ success: boolean; error?: string }> {
  const run = await db.select().from(workflowRuns).where(eq(workflowRuns.id, runId)).get();
  if (!run) return { success: false, error: `Workflow Run ${runId} 不存在` };

  if (run.status !== 'waiting_signal') {
    return { success: false, error: `当前状态 "${run.status}" 无法接收信号` };
  }

  if (run.waiting_signal && run.waiting_signal !== signal) {
    return { success: false, error: `等待信号 "${run.waiting_signal}"，收到 "${signal}"` };
  }

  // 更新上下文
  const context = run.context_json ? JSON.parse(run.context_json) as Record<string, unknown> : {};
  context[`signal_${signal}`] = payload ?? true;

  // 获取当前节点的 next
  const def = await db.select().from(workflowDefinitions).where(eq(workflowDefinitions.id, run.definition_id)).get();
  if (!def) return { success: false, error: `定义不存在` };

  const spec = JSON.parse(def.spec_json) as WorkflowSpec;
  const currentNode = run.current_node_id ? spec.nodes[run.current_node_id] : null;
  const nextNodeId = currentNode?.next;

  const now = new Date().toISOString();
  await db.update(workflowRuns).set({
    status: 'running',
    waiting_signal: null,
    current_node_id: nextNodeId ?? run.current_node_id,
    context_json: JSON.stringify(context),
    updated_at: now,
  }).where(eq(workflowRuns.id, runId)).run();

  await writeRunEvent(runId, 0, 'signal_received', run.current_node_id, { signal, payload });

  // 继续推进
  await advanceWorkflow(runId);

  return { success: true };
}

/**
 * 当子项完成时，检查是否有 workflow 可以恢复
 */
export async function onChildCompleted(parentItemId: string): Promise<void> {
  const activeRuns = await db.select().from(workflowRuns)
    .where(and(eq(workflowRuns.item_id, parentItemId), eq(workflowRuns.status, 'waiting_child')))
    .all();

  for (const run of activeRuns) {
    // 重新检查是否所有子项都完成
    const children = await db.select({ status: workItems.status })
      .from(workItems)
      .where(eq(workItems.parent_id, parentItemId))
      .all();
    const allDone = children.length > 0 && children.every(c =>
      ['resolved', 'closed', 'cancelled'].includes(c.status),
    );

    if (allDone) {
      // 获取 next node
      const def = await db.select().from(workflowDefinitions).where(eq(workflowDefinitions.id, run.definition_id)).get();
      if (!def) continue;

      const spec = JSON.parse(def.spec_json) as WorkflowSpec;
      const currentNode = run.current_node_id ? spec.nodes[run.current_node_id] : null;
      const nextNodeId = currentNode?.next;

      await db.update(workflowRuns).set({
        status: 'running',
        current_node_id: nextNodeId ?? run.current_node_id,
        updated_at: new Date().toISOString(),
      }).where(eq(workflowRuns.id, run.id)).run();

      await writeRunEvent(run.id, 0, 'child_completed', run.current_node_id, { reason: 'all_children_done' });
      await advanceWorkflow(run.id);
    }
  }
}

/**
 * 获取 Workflow Run 详情 + events
 */
export async function getWorkflowRun(runId: string) {
  const run = await db.select().from(workflowRuns).where(eq(workflowRuns.id, runId)).get();
  if (!run) return null;

  const events = await db.select().from(workflowRunEvents)
    .where(eq(workflowRunEvents.run_id, runId))
    .all();

  return { ...run, events };
}

// ── 内部辅助 ────────────────────────────────────────────────────────────────

async function moveToNext(runId: string, nextNodeId?: string) {
  if (!nextNodeId) {
    await failRun(runId, '节点没有定义 next');
    return;
  }
  await db.update(workflowRuns).set({
    current_node_id: nextNodeId,
    updated_at: new Date().toISOString(),
  }).where(eq(workflowRuns.id, runId)).run();
}

async function failRun(runId: string, error: string) {
  const now = new Date().toISOString();
  await db.update(workflowRuns).set({
    status: 'failed',
    finished_at: now,
    updated_at: now,
  }).where(eq(workflowRuns.id, runId)).run();
  await writeRunEvent(runId, 0, 'error', null, { error });
}

async function updateContext(runId: string, context: Record<string, unknown>) {
  await db.update(workflowRuns).set({
    context_json: JSON.stringify(context),
    updated_at: new Date().toISOString(),
  }).where(eq(workflowRuns.id, runId)).run();
}

async function writeRunEvent(
  runId: string,
  seq: number,
  eventType: string,
  nodeId?: string | null,
  payload?: Record<string, unknown>,
) {
  await db.insert(workflowRunEvents).values({
    run_id: runId,
    seq,
    event_type: eventType,
    node_id: nodeId ?? null,
    payload_json: payload ? JSON.stringify(payload) : null,
    created_at: new Date().toISOString(),
  }).run();
}
