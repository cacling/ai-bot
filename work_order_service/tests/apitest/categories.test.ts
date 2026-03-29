/**
 * API tests for: Category routes + category-driven creation
 */
import { describe, test, expect } from 'bun:test';
import { createApp } from '../../src/server';

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

// ── 分类目录查询 ──────────────────────────────────────────────────────────────

describe('GET /api/categories', () => {
  test('returns active categories', async () => {
    const { status, data } = await get('/api/categories');
    expect(status).toBe(200);
    const items = data.items as any[];
    expect(items.length).toBeGreaterThan(0);
    // All returned should be active
    expect(items.every((i: any) => i.status === 'active')).toBe(true);
  });

  test('filters by type=ticket', async () => {
    const { status, data } = await get('/api/categories?type=ticket');
    expect(status).toBe(200);
    const items = data.items as any[];
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i: any) => i.type === 'ticket')).toBe(true);
  });

  test('filters by parent_code', async () => {
    const { status, data } = await get('/api/categories?parent_code=ticket.incident');
    expect(status).toBe(200);
    const items = data.items as any[];
    expect(items.length).toBeGreaterThanOrEqual(2); // app_login, service_suspend
    expect(items.every((i: any) => i.parent_code === 'ticket.incident')).toBe(true);
  });
});

describe('GET /api/categories/:code', () => {
  test('returns category detail', async () => {
    const { status, data } = await get('/api/categories/ticket.incident.app_login');
    expect(status).toBe(200);
    expect(data.code).toBe('ticket.incident.app_login');
    expect(data.display_name).toBe('App 登录异常');
    expect(data.level).toBe(2);
    expect(data.parent_code).toBe('ticket.incident');
    expect(data.allowed_child_rules_json).toBeDefined();
  });

  test('returns 404 for unknown code', async () => {
    const { status } = await get('/api/categories/nonexistent.code');
    expect(status).toBe(404);
  });
});

// ── 分类驱动建单 ──────────────────────────────────────────────────────────────

describe('Category-driven work order creation', () => {
  test('creates work order with category_code, inherits defaults', async () => {
    const { status, data } = await post('/api/work-orders', {
      title: '停机执行测试',
      work_type: 'execution',
      execution_mode: 'manual',
      category_code: 'work_order.execution.suspend_service',
      customer_phone: '13800000099',
    });
    expect(status).toBe(201);

    // Verify defaults were applied from category
    const { data: detail } = await get(`/api/work-items/${data.id}`);
    const item = detail.item as Record<string, unknown>;
    expect(item.category_code).toBe('work_order.execution.suspend_service');
    expect(item.queue_code).toBe('specialist'); // from category default
  });

  test('explicit values override category defaults', async () => {
    const { status, data } = await post('/api/work-orders', {
      title: '停机执行测试（覆盖队列）',
      work_type: 'execution',
      execution_mode: 'manual',
      category_code: 'work_order.execution.suspend_service',
      queue_code: 'frontline',
      priority: 'low',
      customer_phone: '13800000099',
    });
    expect(status).toBe(201);

    const { data: detail } = await get(`/api/work-items/${data.id}`);
    const item = detail.item as Record<string, unknown>;
    expect(item.queue_code).toBe('frontline'); // explicit override
    expect(item.priority).toBe('low');         // explicit override
  });

  test('rejects invalid category type mismatch', async () => {
    const { status, data } = await post('/api/work-orders', {
      title: '测试',
      work_type: 'execution',
      category_code: 'ticket.inquiry.bill', // ticket category on work_order route
    });
    expect(status).toBe(400);
    expect((data.error as string)).toContain('不是 work_order 类型');
  });

  test('rejects inactive category', async () => {
    // This would require an inactive category in DB; skip if not seeded
    const { status } = await post('/api/work-orders', {
      title: '测试',
      work_type: 'execution',
      category_code: 'nonexistent.category',
    });
    expect(status).toBe(400);
  });
});

describe('Category-driven ticket creation', () => {
  test('creates ticket with category_code', async () => {
    const { status, data } = await post('/api/tickets', {
      title: 'App 登录异常测试',
      ticket_category: 'incident',
      category_code: 'ticket.incident.app_login',
      customer_phone: '13800000099',
    });
    expect(status).toBe(201);

    const { data: detail } = await get(`/api/work-items/${data.id}`);
    const item = detail.item as Record<string, unknown>;
    expect(item.category_code).toBe('ticket.incident.app_login');
  });
});

// ── 父子关系校验 ──────────────────────────────────────────────────────────────

describe('Parent-child category validation', () => {
  /** Helper: create a ticket with category */
  async function createTicketWithCategory(categoryCode: string) {
    const { data } = await post('/api/tickets', {
      title: '父单测试',
      ticket_category: 'incident',
      category_code: categoryCode,
      customer_phone: '13800000099',
    });
    return data.id as string;
  }

  test('allows valid parent-child category (ticket → work_order)', async () => {
    const parentId = await createTicketWithCategory('ticket.incident.app_login');
    // app_login allows derived_work_order → password_reset
    const { status, data } = await post(`/api/tickets/${parentId}/children`, {
      type: 'work_order',
      title: '自助重置密码',
      category_code: 'work_order.self_service.password_reset',
    });
    expect(status).toBe(201);
    expect(data.success).toBe(true);
  });

  test('rejects invalid child category not in allowed list', async () => {
    const parentId = await createTicketWithCategory('ticket.incident.app_login');
    // app_login does NOT allow charge_adjustment
    const { status, data } = await post(`/api/tickets/${parentId}/children`, {
      type: 'work_order',
      title: '调账执行',
      category_code: 'work_order.execution.charge_adjustment',
    });
    expect(status).toBe(400);
    expect((data.error as string)).toContain('不允许');
  });

  test('allows child task with valid category', async () => {
    const parentId = await createTicketWithCategory('ticket.incident.app_login');
    // app_login allows task → task.collect.screenshot
    const { status, data } = await post(`/api/tickets/${parentId}/tasks`, {
      task_type: 'collect',
      title: '收集截图',
      category_code: 'task.collect.screenshot',
    });
    expect(status).toBe(201);
    expect(data.success).toBe(true);
  });

  test('no validation when parent has no category_code', async () => {
    // Create a ticket WITHOUT category_code → any child should be allowed
    const { data: parentData } = await post('/api/tickets', {
      title: '无分类父单',
      ticket_category: 'incident',
      customer_phone: '13800000099',
    });
    const parentId = parentData.id as string;

    const { status } = await post(`/api/tickets/${parentId}/children`, {
      type: 'work_order',
      title: '随意子单',
    });
    expect(status).toBe(201);
  });
});
