/**
 * auth.ts — 轻量级 RBAC 中间件（从主后端复制）
 */
import { type Context, type Next } from 'hono';
import { eq } from 'drizzle-orm';
import { db } from './db';
import { logger } from './logger';

// users 表在 platform schema 中，km_service 的 db 已 re-export
import { users } from '@ai-bot/shared-db/schema/platform';

export type UserRole = 'admin' | 'flow_manager' | 'config_editor' | 'reviewer' | 'auditor';

const ROLE_LEVEL: Record<string, number> = {
  auditor: 1,
  reviewer: 2,
  config_editor: 3,
  flow_manager: 4,
  admin: 5,
};

export function requireRole(minRole: UserRole) {
  const minLevel = ROLE_LEVEL[minRole] ?? 0;

  return async (c: Context, next: Next) => {
    const userId = c.req.header('X-User-Id');

    if (!userId) {
      if (process.env.NODE_ENV !== 'production') {
        await next();
        return;
      }
      return c.json({ error: '需要提供 X-User-Id 请求头' }, 401);
    }

    const rows = await db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (rows.length === 0) {
      logger.warn('auth', 'user_not_found', { userId });
      return c.json({ error: `用户不存在: ${userId}` }, 401);
    }

    const userRole = rows[0].role;
    const userLevel = ROLE_LEVEL[userRole] ?? 0;

    if (userLevel < minLevel) {
      logger.warn('auth', 'permission_denied', { userId, userRole, required: minRole });
      return c.json({
        error: `权限不足：当前角色 ${userRole}，需要 ${minRole} 或更高权限`,
      }, 403);
    }

    c.set('userId', userId);
    c.set('userRole', userRole);
    await next();
  };
}
