/**
 * API tests for: Workflow routes
 */
import { describe, test, expect, beforeAll } from 'bun:test';
import { createApp } from '../../src/server';
import { db, workflowDefinitions, workflowRuns, workflowRunEvents, eq } from '../../src/db';

const app = createApp();

async function get(path: string) {
  const res = await app.request(path);
  return { status: res.status, data: await res.json() as Record<string, unknown> };
}

async function post(path: string, body: Record<string, unknown>) {
  const res = await app.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() as Record<string, unknown> };
}

/** Helper: create a work order and return its id */
async function createWorkOrder(title = 'Workflow 测试工单') {
  const { data } = await post('/api/work-orders', {
    title,
    customer_phone: '13800000099',
    work_type: 'execution',
    execution_mode: 'manual',
  });
  return data.id as string;
}

// Seed test-specific workflow definitions (upsert pattern — don't wipe seed data)
beforeAll(async () => {
  // Clean up prior test-specific data only
  const testIds = ['wfdef_test_simple', 'wfdef_test_branch', 'wfdef_test_retired'];
  for (const id of testIds) {
    await db.delete(workflowRunEvents).where(eq(workflowRunEvents.run_id, id)).run();
    await db.delete(workflowRuns).where(eq(workflowRuns.definition_id, id)).run();
    await db.delete(workflowDefinitions).where(eq(workflowDefinitions.id, id)).run();
  }

  const now = new Date().toISOString();

  // Simple linear: start → wait_signal(done) → end
  await db.insert(workflowDefinitions).values({
    id: 'wfdef_test_simple',
    key: 'test_simple',
    name: '简单测试流程',
    target_type: 'work_order',
    version_no: 1,
    status: 'active',
    spec_json: JSON.stringify({
      start_node: 'start',
      nodes: {
        start: { id: 'start', type: 'start', next: 'wait' },
        wait: { id: 'wait', type: 'wait_signal', signal: 'done', next: 'end' },
        end: { id: 'end', type: 'end' },
      },
    }),
    created_at: now,
    updated_at: now,
  }).run();

  // Workflow with if branch: start → if(approved) → end_ok / end_rejected
  await db.insert(workflowDefinitions).values({
    id: 'wfdef_test_branch',
    key: 'test_branch',
    name: '分支测试流程',
    target_type: 'work_order',
    version_no: 1,
    status: 'active',
    spec_json: JSON.stringify({
      start_node: 'start',
      nodes: {
        start: { id: 'start', type: 'start', next: 'wait_approval' },
        wait_approval: { id: 'wait_approval', type: 'wait_signal', signal: 'approval', next: 'check' },
        check: { id: 'check', type: 'if', condition: 'signal_approval', then_next: 'end_ok', else_next: 'end_rejected' },
        end_ok: { id: 'end_ok', type: 'end' },
        end_rejected: { id: 'end_rejected', type: 'end' },
      },
    }),
    created_at: now,
    updated_at: now,
  }).run();

  // Retired definition (should not appear in list)
  await db.insert(workflowDefinitions).values({
    id: 'wfdef_test_retired',
    key: 'test_retired',
    name: '已退役流程',
    target_type: 'work_order',
    version_no: 1,
    status: 'retired',
    spec_json: JSON.stringify({ start_node: 'start', nodes: { start: { id: 'start', type: 'end' } } }),
    created_at: now,
    updated_at: now,
  }).run();
});

describe('GET /api/workflows/definitions', () => {
  test('lists only active definitions', async () => {
    const { status, data } = await get('/api/workflows/definitions');
    expect(status).toBe(200);
    const items = data.items as any[];
    expect(items.length).toBeGreaterThanOrEqual(2);
    // retired should not appear
    expect(items.find((d: any) => d.key === 'test_retired')).toBeUndefined();
  });
});

describe('GET /api/workflows/definitions/:id', () => {
  test('returns definition by id', async () => {
    const { status, data } = await get('/api/workflows/definitions/wfdef_test_simple');
    expect(status).toBe(200);
    expect(data.key).toBe('test_simple');
  });

  test('returns 404 for unknown id', async () => {
    const { status } = await get('/api/workflows/definitions/nonexistent');
    expect(status).toBe(404);
  });
});

describe('POST /api/workflows/runs', () => {
  test('returns 400 when definition_key is missing', async () => {
    const { status } = await post('/api/workflows/runs', { item_id: 'xxx' });
    expect(status).toBe(400);
  });

  test('returns 400 for unknown definition_key', async () => {
    const { status, data } = await post('/api/workflows/runs', {
      definition_key: 'nonexistent',
      item_id: 'xxx',
    });
    expect(status).toBe(400);
    expect(data.error).toBeDefined();
  });

  test('starts a workflow run (simple: start → wait_signal)', async () => {
    const woId = await createWorkOrder();
    const { status, data } = await post('/api/workflows/runs', {
      definition_key: 'test_simple',
      item_id: woId,
    });
    expect(status).toBe(201);
    expect(data.success).toBe(true);
    expect(data.id).toBeDefined();

    // Run should be in waiting_signal state
    const { data: runData } = await get(`/api/workflows/runs/${data.id}`);
    expect(runData.status).toBe('waiting_signal');
    expect(runData.waiting_signal).toBe('done');
    expect(runData.current_node_id).toBe('wait');
  });
});

describe('GET /api/workflows/runs/:id', () => {
  test('returns 404 for unknown run', async () => {
    const { status } = await get('/api/workflows/runs/nonexistent');
    expect(status).toBe(404);
  });
});

describe('POST /api/workflows/runs/:id/signal', () => {
  test('returns 400 when signal is missing', async () => {
    const { status } = await post('/api/workflows/runs/xxx/signal', {});
    expect(status).toBe(400);
  });

  test('signal wrong name returns error', async () => {
    const woId = await createWorkOrder();
    const { data: startData } = await post('/api/workflows/runs', {
      definition_key: 'test_simple',
      item_id: woId,
    });
    const runId = startData.id as string;

    const { status, data } = await post(`/api/workflows/runs/${runId}/signal`, {
      signal: 'wrong_signal',
    });
    expect(status).toBe(400);
    expect(data.error).toBeDefined();
  });

  test('signal completes the simple workflow', async () => {
    const woId = await createWorkOrder();
    const { data: startData } = await post('/api/workflows/runs', {
      definition_key: 'test_simple',
      item_id: woId,
    });
    const runId = startData.id as string;

    // Send the correct signal
    const { status, data } = await post(`/api/workflows/runs/${runId}/signal`, {
      signal: 'done',
    });
    expect(status).toBe(200);
    expect(data.success).toBe(true);

    // Run should now be completed
    const { data: runData } = await get(`/api/workflows/runs/${runId}`);
    expect(runData.status).toBe('completed');
    expect(runData.finished_at).toBeDefined();
  });
});

describe('Workflow branching (if node)', () => {
  test('signal with truthy payload → then_next branch', async () => {
    const woId = await createWorkOrder();
    const { data: startData } = await post('/api/workflows/runs', {
      definition_key: 'test_branch',
      item_id: woId,
    });
    const runId = startData.id as string;

    // Send signal with payload (truthy)
    await post(`/api/workflows/runs/${runId}/signal`, {
      signal: 'approval',
      payload: { approved: true },
    });

    const { data: runData } = await get(`/api/workflows/runs/${runId}`);
    expect(runData.status).toBe('completed');
    // The events should show it went through end_ok
    const events = runData.events as any[];
    const completedEvent = events.find((e: any) => e.event_type === 'completed');
    expect(completedEvent.node_id).toBe('end_ok');
  });
});
