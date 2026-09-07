import { and, eq } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/client.js';
import { announcements, countdowns, announcementReads, todos, users } from '../db/schema.js';
import { emitToUser } from '../presence.js';
import { writeAudit } from '../lib/audit.js';

export const adminAnnouncementRouter = Router();

const announcementSchema = z.object({
  title: z.string().trim().min(1, '标题不能为空').max(80),
  content: z.string().trim().min(1, '内容不能为空').max(2000)
});

function activeAnnouncement() {
  return db.select().from(announcements).orderBy(announcements.id).limit(1).get();
}

/** 新增 / 更新公告（单条激活） */
adminAnnouncementRouter.put('/', (req, res) => {
  const parsed = announcementSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: parsed.error.issues[0]?.message ?? '参数错误' });
    return;
  }
  const { title, content } = parsed.data;
  const existing = activeAnnouncement();
  let id: number;
  if (existing) {
    db.update(announcements).set({ title, content, updatedAt: new Date() }).where(eq(announcements.id, existing.id)).run();
    id = existing.id;
  } else {
    const created = db.insert(announcements).values({ title, content, createdBy: req.user!.id }).returning().get();
    id = created.id;
  }
  writeAudit({ userId: req.user!.id, action: 'admin.announcement.upsert', target: title, detail: { id }, ip: req.ip ?? undefined });
  res.json({ ok: true, data: { id } });
});

/** 删除公告（同时清空已读记录） */
adminAnnouncementRouter.delete('/', (req, res) => {
  const existing = activeAnnouncement();
  if (!existing) {
    res.status(404).json({ ok: false, error: '当前没有公告' });
    return;
  }
  db.delete(announcements).where(eq(announcements.id, existing.id)).run();
  writeAudit({ userId: req.user!.id, action: 'admin.announcement.delete', target: existing.title, detail: { id: existing.id }, ip: req.ip ?? undefined });
  res.json({ ok: true, data: null });
});

/** 已读统计 */
adminAnnouncementRouter.get('/stats', (_req, res) => {
  const row = activeAnnouncement();
  if (!row) {
    res.json({ ok: true, data: { total: 0, readCount: 0, unread: [] } });
    return;
  }
  const totalUsers = db.select({ id: users.id, username: users.username }).from(users).all();
  const reads = db
    .select({ userId: announcementReads.userId })
    .from(announcementReads)
    .where(eq(announcementReads.announcementId, row.id))
    .all()
    .map((r) => r.userId);
  const readSet = new Set(reads);
  const unread = totalUsers.filter((u) => !readSet.has(u.id));
  res.json({
    ok: true,
    data: {
      total: totalUsers.length,
      readCount: totalUsers.length - unread.length,
      unread: unread.map((u) => ({ id: u.id, username: u.username }))
    }
  });
});

/** 一键提醒未读用户（向其在线设备推送抖动动画事件） */
adminAnnouncementRouter.post('/remind', (req, res) => {
  const row = activeAnnouncement();
  if (!row) {
    res.status(404).json({ ok: false, error: '当前没有公告' });
    return;
  }
  const reads = db
    .select({ userId: announcementReads.userId })
    .from(announcementReads)
    .where(eq(announcementReads.announcementId, row.id))
    .all()
    .map((r) => r.userId);
  const readSet = new Set(reads);
  const allUsers = db.select({ id: users.id, status: users.status }).from(users).all();
  let reminded = 0;
  for (const u of allUsers) {
    if (u.status !== 'active' || readSet.has(u.id)) continue;
    emitToUser(u.id, 'announcement:remind', { id: row.id });
    reminded += 1;
  }
  writeAudit({ userId: req.user!.id, action: 'admin.announcement.remind', target: row.title, detail: { reminded }, ip: req.ip ?? undefined });
  res.json({ ok: true, data: { reminded } });
});

// ---------- 全员倒数日 / 全员 TODO ----------

export const adminPlansRouter = Router();

const countdownSchema = z.object({
  title: z.string().trim().min(1, '标题不能为空').max(60),
  targetDate: z.coerce.number().int().positive()
});

adminPlansRouter.get('/countdowns', (_req, res) => {
  const items = db.select().from(countdowns).where(eq(countdowns.scope, 'global')).orderBy(countdowns.targetDate).all();
  res.json({ ok: true, data: { items } });
});

adminPlansRouter.post('/countdowns', (req, res) => {
  const parsed = countdownSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: parsed.error.issues[0]?.message ?? '参数错误' });
    return;
  }
  const created = db
    .insert(countdowns)
    .values({
      scope: 'global',
      title: parsed.data.title,
      targetDate: new Date(parsed.data.targetDate),
      createdBy: req.user!.id
    })
    .returning()
    .get();
  writeAudit({ userId: req.user!.id, action: 'admin.plan.countdown.create', target: parsed.data.title, ip: req.ip ?? undefined });
  res.json({ ok: true, data: { countdown: created } });
});

adminPlansRouter.delete('/countdowns/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ ok: false, error: '无效的 ID' });
    return;
  }
  db.delete(countdowns).where(and(eq(countdowns.id, id), eq(countdowns.scope, 'global'))).run();
  writeAudit({ userId: req.user!.id, action: 'admin.plan.countdown.delete', ip: req.ip ?? undefined });
  res.json({ ok: true, data: null });
});

const todoCreateSchema = z.object({ title: z.string().trim().min(1, '内容不能为空').max(120) });
const todoUpdateSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  done: z.boolean().optional()
});

adminPlansRouter.get('/todos', (_req, res) => {
  const items = db.select().from(todos).where(eq(todos.scope, 'global')).orderBy(todos.done, todos.id).all();
  res.json({ ok: true, data: { items } });
});

adminPlansRouter.post('/todos', (req, res) => {
  const parsed = todoCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: parsed.error.issues[0]?.message ?? '参数错误' });
    return;
  }
  const created = db
    .insert(todos)
    .values({ scope: 'global', title: parsed.data.title, createdBy: req.user!.id })
    .returning()
    .get();
  writeAudit({ userId: req.user!.id, action: 'admin.plan.todo.create', target: parsed.data.title, ip: req.ip ?? undefined });
  res.json({ ok: true, data: { todo: created } });
});

function globalTodo(idRaw: unknown) {
  const id = Number(idRaw);
  if (!Number.isInteger(id) || id <= 0) return null;
  return db.select().from(todos).where(and(eq(todos.id, id), eq(todos.scope, 'global'))).get();
}

adminPlansRouter.put('/todos/:id', (req, res) => {
  const row = globalTodo(req.params.id);
  if (!row) {
    res.status(404).json({ ok: false, error: 'TODO 不存在' });
    return;
  }
  const parsed = todoUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: '参数错误' });
    return;
  }
  db.update(todos)
    .set({
      ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
      ...(parsed.data.done !== undefined ? { done: parsed.data.done, doneAt: parsed.data.done ? new Date() : null } : {})
    })
    .where(eq(todos.id, row.id))
    .run();
  writeAudit({ userId: req.user!.id, action: 'admin.plan.todo.update', target: row.title, ip: req.ip ?? undefined });
  res.json({ ok: true, data: null });
});

adminPlansRouter.delete('/todos/:id', (req, res) => {
  const row = globalTodo(req.params.id);
  if (!row) {
    res.status(404).json({ ok: false, error: 'TODO 不存在' });
    return;
  }
  db.delete(todos).where(eq(todos.id, row.id)).run();
  writeAudit({ userId: req.user!.id, action: 'admin.plan.todo.delete', ip: req.ip ?? undefined });
  res.json({ ok: true, data: null });
});

