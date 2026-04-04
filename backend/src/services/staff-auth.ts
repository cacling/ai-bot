/**
 * staff-auth.ts — Staff 登录 API + Cookie Session 中间件
 *
 * 路由：
 *   POST /api/staff-auth/login   — 员工登录
 *   POST /api/staff-auth/logout  — 员工登出
 *   GET  /api/staff-auth/me      — 获取当前登录员工信息
 *
 * 中间件：
 *   staffSessionMiddleware — 读取 staff_session cookie，解析员工身份注入 context
 */

import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { type Context, type Next } from 'hono';
import { eq, and, gt } from 'drizzle-orm';
import { platformDb as db } from '../db';
import { staffAccounts, staffSessions } from '../db/schema';
import { logger } from './logger';

const SESSION_COOKIE = 'staff_session';
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24h

function hashToken(token: string): string {
  const hasher = new Bun.CryptoHasher('sha256');
  hasher.update(token);
  return hasher.digest('hex');
}

// ── 路由 ────────────────────────────────────────────────────────────────────

export const staffAuthRoutes = new Hono();

// POST /login
staffAuthRoutes.post('/login', async (c) => {
  const body = await c.req.json<{ username?: string; password?: string }>().catch(() => ({}));
  const { username, password } = body;
  if (!username || !password) {
    return c.json({ error: '请提供用户名和密码' }, 400);
  }

  try {
    const rows = db
      .select()
      .from(staffAccounts)
      .where(eq(staffAccounts.username, username))
      .limit(1)
      .all();

    if (rows.length === 0) {
      logger.warn('staff-auth', 'login_user_not_found', { username });
      return c.json({ error: '用户名或密码错误' }, 401);
    }

    const staff = rows[0];
    if (staff.status !== 'active') {
      logger.warn('staff-auth', 'login_disabled', { username, staffId: staff.id });
      return c.json({ error: '账号已禁用' }, 403);
    }

    const valid = await Bun.password.verify(password, staff.password_hash);
    if (!valid) {
      logger.warn('staff-auth', 'login_bad_password', { username });
      return c.json({ error: '用户名或密码错误' }, 401);
    }

    // Create session
    const token = crypto.randomUUID();
    const tokenHash = hashToken(token);
    const sessionId = crypto.randomUUID();
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

    db.insert(staffSessions).values({
      id: sessionId,
      staff_id: staff.id,
      token_hash: tokenHash,
      expires_at: expiresAt,
      last_seen_at: now,
      user_agent: c.req.header('user-agent') ?? null,
      ip: c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip') ?? null,
    }).run();

    // Update last_login_at
    db.update(staffAccounts)
      .set({ last_login_at: now })
      .where(eq(staffAccounts.id, staff.id))
      .run();

    setCookie(c, SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'Lax',
      path: '/',
      maxAge: SESSION_TTL_MS / 1000,
    });

    logger.info('staff-auth', 'login_ok', { staffId: staff.id, username });

    return c.json({
      ok: true,
      staff: buildStaffResponse(staff),
    });
  } catch (err) {
    logger.error('staff-auth', 'login_error', { username, error: String(err) });
    return c.json({ error: '服务暂时不可用，请稍后重试' }, 503);
  }
});

// POST /logout
staffAuthRoutes.post('/logout', async (c) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) {
    const tokenHash = hashToken(token);
    db.delete(staffSessions)
      .where(eq(staffSessions.token_hash, tokenHash))
      .run();
  }
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
  return c.json({ ok: true });
});

// GET /me
staffAuthRoutes.get('/me', async (c) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) {
    return c.json({ error: '未登录' }, 401);
  }

  const staff = resolveSession(token);
  if (!staff) {
    deleteCookie(c, SESSION_COOKIE, { path: '/' });
    return c.json({ error: '会话已过期' }, 401);
  }

  return c.json({ staff: buildStaffResponse(staff) });
});

// ── Session 中间件 ──────────────────────────────────────────────────────────

export async function staffSessionMiddleware(c: Context, next: Next) {
  const token = getCookie(c, SESSION_COOKIE);

  if (token) {
    const staff = resolveSession(token);
    if (staff) {
      c.set('staffId', staff.id);
      c.set('staffRole', staff.primary_staff_role);
      c.set('staffRoles', JSON.parse(staff.staff_roles) as string[]);
      c.set('platformRole', staff.platform_role);
      // 兼容现有 requireRole()：注入 userId / userRole
      c.set('userId', staff.id);
      c.set('userRole', staff.platform_role);
      await next();
      return;
    }
  }

  // Fallback: 开发模式放行（保留现有开发体验）
  if (process.env.NODE_ENV !== 'production') {
    await next();
    return;
  }

  return c.json({ error: '未登录' }, 401);
}

// ── 过期 Session 清理 ──────────────────────────────────────────────────────

export function cleanExpiredSessions() {
  const now = new Date().toISOString();
  // ISO 日期字符串可直接做字典序比较
  const deleted = db.run(`DELETE FROM staff_sessions WHERE expires_at < ?`, [now]);
  if (deleted.changes > 0) {
    logger.info('staff-auth', 'cleaned_expired_sessions', { deleted: deleted.changes });
  }
}

// ── 内部工具函数 ────────────────────────────────────────────────────────────

type StaffRow = typeof staffAccounts.$inferSelect;

function resolveSession(token: string): StaffRow | null {
  const tokenHash = hashToken(token);
  const now = new Date().toISOString();

  const rows = db
    .select({
      session_id: staffSessions.id,
      staff: staffAccounts,
    })
    .from(staffSessions)
    .innerJoin(staffAccounts, eq(staffSessions.staff_id, staffAccounts.id))
    .where(
      and(
        eq(staffSessions.token_hash, tokenHash),
        gt(staffSessions.expires_at, now),
      )
    )
    .limit(1)
    .all();

  if (rows.length === 0) return null;

  const { session_id, staff } = rows[0];
  if (staff.status !== 'active') return null;

  // Touch last_seen_at
  db.update(staffSessions)
    .set({ last_seen_at: now })
    .where(eq(staffSessions.id, session_id))
    .run();

  return staff;
}

function buildStaffResponse(staff: StaffRow) {
  return {
    id: staff.id,
    username: staff.username,
    display_name: staff.display_name,
    primary_staff_role: staff.primary_staff_role,
    staff_roles: JSON.parse(staff.staff_roles) as string[],
    platform_role: staff.platform_role,
    team_code: staff.team_code,
    seat_code: staff.seat_code,
    lang: staff.lang,
    is_demo: staff.is_demo,
  };
}
