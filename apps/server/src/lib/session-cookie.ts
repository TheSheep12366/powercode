import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { sessions, users } from '../db/schema.js';

export type SessionUser = typeof users.$inferSelect;

/** 解析 Cookie 请求头为键值表 */
export function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    try {
      out[key] = decodeURIComponent(part.slice(idx + 1).trim());
    } catch {
      out[key] = part.slice(idx + 1).trim();
    }
  }
  return out;
}

/** 从 Cookie 头解析出会话用户与 session id（供 WebSocket upgrade / socket.io 握手等非 Express 中间件场景使用） */
export function getSessionFromCookie(cookieHeader: string | undefined): { user: SessionUser; sid: string } | null {
  const sid = parseCookies(cookieHeader)[SESSION_COOKIE_NAME];
  if (!sid) return null;
  const row = db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.id, sid))
    .get();
  if (!row) return null;
  if (row.session.expiresAt.getTime() <= Date.now()) return null;
  // 被顶替的会话视为无效（单点登录）
  if (row.session.replaced) return null;
  if (row.user.status !== 'active') return null;
  return { user: row.user, sid };
}

export function getUserFromCookie(cookieHeader: string | undefined): SessionUser | null {
  return getSessionFromCookie(cookieHeader)?.user ?? null;
}

export const SESSION_COOKIE_NAME = 'pc_sid';
