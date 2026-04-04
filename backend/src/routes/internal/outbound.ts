/**
 * outbound.ts — 服务端主动外呼入口
 * Temporal Activity 通过此端点发起外呼
 * P2 阶段：仅记录日志 + 通知工作台，不实际创建 WS 会话
 * 后续将接入 OutboundSessionService 做真实外呼
 */
import { Hono } from 'hono';
import { logger } from '../../services/logger';

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

  const sessionId = body.session_id ?? crypto.randomUUID();

  // P2 shadow 阶段：仅记录，不实际建立 WS 外呼会话
  // 后续将抽取 outbound.ts 的会话逻辑到 OutboundSessionService
  logger.info('internal-outbound', 'initiate_requested', {
    task_id: body.task_id,
    phone: body.phone,
    session_id: sessionId,
  });

  return c.json({
    session_id: sessionId,
    status: 'initiated',
    shadow: true, // 标记当前是 shadow 模式
  });
});

export default router;
