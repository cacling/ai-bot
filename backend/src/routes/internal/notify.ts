/**
 * notify.ts — REST→WS 桥
 * Temporal Activity 通过此端点向坐席工作台推送事件
 */
import { Hono } from 'hono';
import { logger } from '../../services/logger';
import { agentConnectionManager } from '../../services/agent-connection-manager';

const router = new Hono();

// POST /workbench — 向坐席 WS 连接推送事件
router.post('/workbench', async (c) => {
  const body = await c.req.json<{
    handoff_id?: string;
    callback_task_id?: string;
    phone?: string;
    event_type: string;
    payload?: Record<string, unknown>;
  }>();

  logger.info('internal-notify', 'workbench_event', {
    event_type: body.event_type,
    handoff_id: body.handoff_id,
    callback_task_id: body.callback_task_id,
    phone: body.phone,
  });

  const event = {
    type: body.event_type,
    handoff_id: body.handoff_id,
    callback_task_id: body.callback_task_id,
    phone: body.phone,
    ...(body.payload ?? {}),
  };

  // 有 phone 则定向推送，否则广播
  if (body.phone) {
    const delivered = agentConnectionManager.sendToPhone(body.phone, event);
    return c.json({ delivered, phone: body.phone });
  }

  const count = agentConnectionManager.broadcast(event);
  return c.json({ delivered: count > 0, broadcast: true, count });
});

// POST /sms — 发送短信提醒（P1 阶段 mock）
router.post('/sms', async (c) => {
  const body = await c.req.json<{
    phone: string;
    sms_type: string;
    content: string;
  }>();

  logger.info('internal-notify', 'sms_mock', {
    phone: body.phone,
    sms_type: body.sms_type,
  });

  return c.json({ sent: false, reason: 'sms_mock_only' });
});

export default router;
