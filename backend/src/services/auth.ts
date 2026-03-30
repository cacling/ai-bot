/**
 * auth.ts — 轻量级 RBAC 中间件
 *
 * 从请求头 X-User-Id 获取用户身份，查询数据库角色。
 * 角色层级：admin > flow_manager > config_editor > reviewer > auditor
 *
 * 使用方式：
 *   app.put('/api/files/content', requireRole('config_editor'), handler);
 */

import { type Context, type Next } from 'hono';
import { eq } from 'drizzle-orm';
import { platformDb as db } from '../db';
import { users } from '../db/schema';
import { logger } from './logger';

export type UserRole = 'admin' | 'flow_manager' | 'config_editor' | 'reviewer' | 'auditor';

// 角色层级（数字越大权限越高）
const ROLE_LEVEL: Record<string, number> = {
  auditor: 1,
  reviewer: 2,
  config_editor: 3,
  flow_manager: 4,
  admin: 5,
};

/**
 * 创建角色检查中间件
 *
 * @param minRole 最低所需角色（包含该角色及更高层级）
 *
 * 当 X-User-Id 未提供时：
 *   - 开发模式（NODE_ENV !== 'production'）：自动放行
 *   - 生产模式：拒绝请求
 */
export function requireRole(minRole: UserRole) {
  const minLevel = ROLE_LEVEL[minRole] ?? 0;

  return async (c: Context, next: Next) => {
    // 优先：staffSessionMiddleware 已解析的 platformRole（避免重复 DB 查询）
    const platformRole = c.get('platformRole') as string | undefined;
    if (platformRole) {
      const level = ROLE_LEVEL[platformRole] ?? 0;
      if (level < minLevel) {
        logger.warn('auth', 'permission_denied', { userId: c.get('userId'), platformRole, required: minRole });
        return c.json({ error: `权限不足：当前角色 ${platformRole}，需要 ${minRole} 或更高权限` }, 403);
      }
      await next();
      return;
    }

    // Fallback：X-User-Id header（兼容旧调用和子服务代理）
    const userId = c.req.header('X-User-Id');

    if (!userId) {
      if (process.env.NODE_ENV !== 'production') {
        await next();
        return;
      }
      return c.json({ error: '需要提供认证信息' }, 401);
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
      return c.json({ error: `权限不足：当前角色 ${userRole}，需要 ${minRole} 或更高权限` }, 403);
    }

    c.set('userId', userId);
    c.set('userRole', userRole);

    await next();
  };
}
