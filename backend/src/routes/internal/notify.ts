/**
 * notify.ts — REST→WS 桥
 * Temporal Activity / Interaction Platform 通过此端点向坐席/客户 WS 推送事件
 */
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { logger } from '../../services/logger';
import { agentConnectionManager } from '../../services/agent-connection-manager';
import { sessionBus } from '../../services/session-bus';
import { platformDb as db } from '../../db';
import { staffAccounts } from '../../db/schema';
import { t } from '../../services/i18n';

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

// POST /customer — interaction_platform → 客户 WS（排队/坐席接入/结束通知）
router.post('/customer', async (c) => {
  const body = await c.req.json<{
    phone: string;
    event_type: 'queue_position' | 'agent_joined' | 'session_closed';
    agent_id?: string;
    agent_name?: string;
    customer_name?: string;
    position?: number;
    lang?: 'zh' | 'en';
  }>();

  const { phone, event_type, lang = 'zh' } = body;
  if (!phone || !event_type) return c.json({ error: 'phone and event_type required' }, 400);

  logger.info('internal-notify', 'customer_event', { phone, event_type, agent_id: body.agent_id, agent_name: body.agent_name });

  const msgId = crypto.randomUUID();

  switch (event_type) {
    case 'queue_position': {
      const position = body.position ?? 0;
      sessionBus.publish(phone, { source: 'system', type: 'queue_position', position, msg_id: msgId });
      break;
    }
    case 'agent_joined': {
      // Resolve agent display_name from staff_accounts if agent_id provided
      let agentName = body.agent_name;
      if (!agentName && body.agent_id) {
        const staff = await db.select({ display_name: staffAccounts.display_name })
          .from(staffAccounts).where(eq(staffAccounts.id, body.agent_id)).limit(1);
        agentName = staff[0]?.display_name;
      }
      agentName = agentName ?? '客服专员';
      const customerName = body.customer_name ?? '';
      // 1. 通知客户坐席已接入
      sessionBus.publish(phone, { source: 'system', type: 'agent_joined', agent_name: agentName, msg_id: msgId });
      // 2. 自动发送坐席欢迎语
      const welcomeText = t('agent_welcome', lang, customerName || (lang === 'zh' ? '您' : 'there'), agentName);
      sessionBus.publish(phone, { source: 'system', type: 'agent_welcome', text: welcomeText, msg_id: crypto.randomUUID() });
      break;
    }
    case 'session_closed': {
      const closeText = t('session_closed', lang);
      sessionBus.publish(phone, { source: 'system', type: 'session_closed', text: closeText, msg_id: msgId });
      break;
    }
  }

  return c.json({ delivered: true, phone, event_type });
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
