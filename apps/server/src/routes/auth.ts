import bcrypt from 'bcryptjs';
import { and, eq, ne } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { db } from '../db/client.js';
import { sessions, users } from '../db/schema.js';
import { writeAudit } from '../lib/audit.js';
import { isLocked, recordFailure, resetFailures } from '../lib/login-throttle.js';
import { SESSION_COOKIE, buildUserInfo, createSession, destroySession, requireAuth } from '../middleware/session.js';

export const authRouter = Router();

const loginSchema = z.object({
  username: z.string().trim().min(1, '用户名不能为空').max(64),
  password: z.string().min(1, '密码不能为空').max(128)
});

const changePasswordSchema = z.object({
  oldPassword: z.string().min(1, '当前密码不能为空').max(128),
  newPassword: z.string().min(8, '新密码至少 8 位').max(72)
});

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? '参数错误';
}

authRouter.post('/login', (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: firstIssue(parsed.error) });
    return;
  }
  const { username, password } = parsed.data;
  const throttleKey = req.ip ?? 'unknown';

  const lock = isLocked(throttleKey);
  if (lock.locked) {
    res.status(429).json({ ok: false, error: `失败次数过多，请 ${lock.retryAfterSec} 秒后再试` });
    return;
  }

  const user = db.select().from(users).where(eq(users.username, username)).get();
  const passwordOk = user ? bcrypt.compareSync(password, user.passwordHash) : false;

  if (!user || !passwordOk) {
    recordFailure(throttleKey);
    writeAudit({
      userId: user?.id ?? null,
      action: 'auth.login.failure',
      target: username,
      detail: { reason: user ? '密码错误' : '用户不存在' },
      ip: req.ip ?? undefined
    });
    res.status(401).json({ ok: false, error: '用户名或密码错误' });
    return;
  }

  if (user.status !== 'active') {
    writeAudit({
      userId: user.id,
      action: 'auth.login.failure',
      target: username,
      detail: { reason: '账号禁用' },
      ip: req.ip ?? undefined
    });
    res.status(403).json({ ok: false, error: '账号已被禁用，请联系管理员' });
    return;
  }

  resetFailures(throttleKey);
  const sid = createSession(req, user.id);
  // 单点登录：该账号的其他会话全部标记为“被顶替”（旧设备将收到别处登录提示）
  db.update(sessions).set({ replaced: true }).where(and(eq(sessions.userId, user.id), ne(sessions.id, sid))).run();
  res.cookie(SESSION_COOKIE, sid, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    path: '/',
    maxAge: config.sessionTtlDays * 24 * 60 * 60 * 1000
  });
  writeAudit({ userId: user.id, action: 'auth.login.success', target: username, ip: req.ip ?? undefined });
  res.json({ ok: true, data: { user: buildUserInfo(user) } });
});

authRouter.post('/logout', requireAuth, (req, res) => {
  if (req.sessionId) destroySession(req.sessionId);
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  writeAudit({
    userId: req.user!.id,
    action: 'auth.logout',
    target: req.user!.username,
    ip: req.ip ?? undefined
  });
  res.json({ ok: true, data: null });
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ ok: true, data: { user: req.user } });
});

authRouter.put('/password', requireAuth, (req, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: firstIssue(parsed.error) });
    return;
  }
  const { oldPassword, newPassword } = parsed.data;

  const user = db.select().from(users).where(eq(users.id, req.user!.id)).get();
  if (!user) {
    res.status(401).json({ ok: false, error: '用户不存在' });
    return;
  }
  if (!bcrypt.compareSync(oldPassword, user.passwordHash)) {
    writeAudit({ userId: user.id, action: 'auth.password.change', target: user.username, detail: { result: '旧密码错误' }, ip: req.ip ?? undefined });
    res.status(400).json({ ok: false, error: '当前密码不正确' });
    return;
  }

  const passwordHash = bcrypt.hashSync(newPassword, 12);
  db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, user.id)).run();
  // 改密后踢掉其它会话，仅保留当前会话
  db.delete(sessions)
    .where(and(eq(sessions.userId, user.id), ne(sessions.id, req.sessionId ?? '')))
    .run();
  writeAudit({ userId: user.id, action: 'auth.password.change', target: user.username, detail: { result: '成功' }, ip: req.ip ?? undefined });
  res.json({ ok: true, data: null });
});
