/**
 * notify.ts — REST→WS 桥
 * Temporal Activity 通过此端点向坐席工作台推送事件
 */
import { Hono } from 'hono';
import { logger } from '../../services/logger';

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

  // P1 阶段：仅记录日志，不实际推送 WS
  // P2 阶段将接入 AgentConnectionManager 做真实推送
  logger.info('internal-notify', 'workbench_event', {
    event_type: body.event_type,
    handoff_id: body.handoff_id,
    callback_task_id: body.callback_task_id,
    phone: body.phone,
  });

  // TODO: P2 — 接入 AgentConnectionManager
  // const manager = getAgentConnectionManager();
  // const delivered = manager.broadcastToQueue(queueName, body);

  return c.json({ delivered: false, reason: 'ws_bridge_not_yet_implemented' });
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
