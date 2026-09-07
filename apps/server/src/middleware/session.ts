import { eq, lt } from 'drizzle-orm';
import type { NextFunction, Request, Response } from 'express';
import { randomBytes } from 'node:crypto';
import type { RoleCaps, UserInfo } from '@powercode/shared';
import { config } from '../config.js';
import { db } from '../db/client.js';
import { roles, sessions, users } from '../db/schema.js';

export const SESSION_COOKIE = 'pc_sid';

export type CapKey = keyof RoleCaps;

const ALL_CAPS: RoleCaps = {
    canManageUsers: true,
    canManageDirectories: true,
    canViewAudit: true,
    canManageAnnouncements: true,
    canManageGlobalPlans: true
  };
const NO_CAPS: RoleCaps = {
    canManageUsers: false,
    canManageDirectories: false,
    canViewAudit: false,
    canManageAnnouncements: false,
    canManageGlobalPlans: false
  };

/** 组装完整用户信息（登录响应 / 会话中间件共用） */
export function buildUserInfo(u: typeof users.$inferSelect): UserInfo {
  const role = u.roleId ? db.select().from(roles).where(eq(roles.id, u.roleId)).get() : null;
  const caps: RoleCaps = u.role === 'admin'
    ? ALL_CAPS
    : role
      ? {
          canManageUsers: role.canManageUsers,
          canManageDirectories: role.canManageDirectories,
          canViewAudit: role.canViewAudit,
          canManageAnnouncements: role.canManageAnnouncements,
          canManageGlobalPlans: role.canManageGlobalPlans
        }
      : NO_CAPS;
  return {
    id: u.id,
    username: u.username,
    role: u.role,
    status: u.status,
    roleId: u.roleId ?? null,
    roleName: role?.name ?? null,
    avatarExt: u.avatarExt ?? null,
    avatarVersion: u.avatarVersion ?? null,
    caps
  };
}

export function createSession(req: Request, userId: number): string {
  const id = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + config.sessionTtlDays * 24 * 60 * 60 * 1000);
  db.insert(sessions)
    .values({
      id,
      userId,
      expiresAt,
      ip: req.ip ?? null,
      userAgent: (req.headers['user-agent'] ?? '').slice(0, 255) || null,
      createdAt: new Date()
    })
    .run();
  return id;
}

export function destroySession(id: string): void {
  db.delete(sessions).where(eq(sessions.id, id)).run();
}

/** 从 Cookie 加载会话与用户（含权限组能力位），挂到 req.user / req.sessionId */
export function sessionMiddleware(req: Request, res: Response, next: NextFunction): void {
  const sid = (req.cookies as Record<string, string | undefined>)?.[SESSION_COOKIE];
  if (sid) {
    const row = db
      .select({ session: sessions, user: users, role: roles })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .leftJoin(roles, eq(roles.id, users.roleId))
      .where(eq(sessions.id, sid))
      .get();
    if (row) {
      if (row.session.expiresAt.getTime() > Date.now() && row.user.status === 'active') {
        // 被顶替的会话：返回专用错误码，前端提示“别处登录”
        if (row.session.replaced) {
          res.clearCookie(SESSION_COOKIE, { path: '/' });
          res.status(401).json({ ok: false, code: 'SESSION_REPLACED', error: '您的账号已在其他设备登录' });
          return;
        }
        req.sessionId = sid;
        req.user = buildUserInfo(row.user);
      } else {
        destroySession(sid);
        res.clearCookie(SESSION_COOKIE, { path: '/' });
      }
    }
  }
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ ok: false, code: 'UNAUTHORIZED', error: '未登录或会话已过期' });
    return;
  }
  next();
}

/** 旧的管理员总闸（部分接口仍用） */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ ok: false, error: '未登录或会话已过期' });
    return;
  }
  if (req.user.role !== 'admin') {
    res.status(403).json({ ok: false, error: '需要管理员权限' });
    return;
  }
  next();
}

/** 能力位鉴权：管理员放行；否则要求权限组授予对应能力 */
export function requireCap(cap: CapKey, label: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ ok: false, error: '未登录或会话已过期' });
      return;
    }
    if (req.user.role === 'admin' || req.user.caps?.[cap]) {
      next();
      return;
    }
    res.status(403).json({ ok: false, error: `缺少权限：${label}` });
  };
}

/** 每小时清理过期会话 */
export function startSessionCleaner(): void {
  const timer = setInterval(() => {
    db.delete(sessions).where(lt(sessions.expiresAt, new Date())).run();
  }, 60 * 60 * 1000);
  timer.unref();
}
