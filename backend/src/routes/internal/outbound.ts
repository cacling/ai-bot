/**
 * outbound.ts — 服务端主动外呼入口
 * Temporal Activity 通过此端点发起外呼（REST 触发，非 WS）
 *
 * 当前实现：准备会话配置 + 通知坐席工作台，但不实际建立语音通道。
 * 后续迭代将对接 channel_host SIP 外呼网关，实现真正的服务端发起外呼。
 */
import { Hono } from 'hono';
import { logger } from '../../services/logger';
import { prepareOutboundSession } from '../../services/outbound-session-service';
import { agentConnectionManager } from '../../services/agent-connection-manager';

const router = new Hono();

// POST /initiate — 发起外呼
router.post('/initiate', async (c) => {
  const body = await c.req.json<{
    task_id: string;
    phone?: string;
    task_type?: string;
    session_id?: string;
    callback_task_id?: string;
  }>();

  const taskParam = (body.task_type ?? 'marketing') as 'collection' | 'marketing';
  const phone = body.phone ?? '13800000001';

  // 准备外呼会话配置
  const config = await prepareOutboundSession({
    userPhone: phone,
    taskParam,
    taskId: body.task_id,
    lang: 'zh',
    sessionId: body.session_id,
  });

  logger.info('internal-outbound', 'initiate_prepared', {
    task_id: body.task_id,
    phone,
    session_id: config.sessionId,
    skill: config.skillName,
  });

  // 通知坐席工作台有外呼发起
  agentConnectionManager.sendToPhone(phone, {
    type: 'outbound_initiated',
    task_id: body.task_id,
    session_id: config.sessionId,
    task_type: taskParam,
    callback_task_id: body.callback_task_id,
  });

  return c.json({
    session_id: config.sessionId,
    status: 'initiated',
    task_resolved: !!config.resolvedTask,
  });
});

export default router;
