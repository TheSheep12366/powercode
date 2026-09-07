import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/client.js';
import { announcementReads, announcements, auditLogs, countdowns, dashboardLayouts, todos, users } from '../db/schema.js';
import { requireAuth } from '../middleware/session.js';

export const myDashboardRouter = Router();

myDashboardRouter.use(requireAuth);

const layoutSchema = z.object({
  layout: z
    .array(
      z.object({
        type: z.string().min(1).max(40),
        config: z.record(z.any()).optional()
      })
    )
    .max(30)
});

// ---------- 仪表盘布局 ----------

myDashboardRouter.get('/dashboard', (req, res) => {
  const row = db.select().from(dashboardLayouts).where(eq(dashboardLayouts.userId, req.user!.id)).get();
  let layout: Array<{ type: string; config?: Record<string, unknown> }> | null = null;
  if (row) {
    try {
      layout = JSON.parse(row.layout) as Array<{ type: string; config?: Record<string, unknown> }>;
    } catch {
      layout = null;
    }
  }
  res.json({ ok: true, data: { layout } });
});

myDashboardRouter.put('/dashboard', (req, res) => {
  const parsed = layoutSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: '布局数据不合法' });
    return;
  }
  const json = JSON.stringify(parsed.data.layout);
  const existing = db.select().from(dashboardLayouts).where(eq(dashboardLayouts.userId, req.user!.id)).get();
  if (existing) {
    db.update(dashboardLayouts).set({ layout: json, updatedAt: new Date() }).where(eq(dashboardLayouts.userId, req.user!.id)).run();
  } else {
    db.insert(dashboardLayouts).values({ userId: req.user!.id, layout: json }).run();
  }
  res.json({ ok: true, data: null });
});

// ---------- 公告（读取侧） ----------

function activeAnnouncement() {
  return db.select().from(announcements).orderBy(desc(announcements.id)).limit(1).get();
}

myDashboardRouter.get('/announcement', (req, res) => {
  const row = activeAnnouncement();
  if (!row) {
    res.json({ ok: true, data: { announcement: null, read: true } });
    return;
  }
  const read = !!db
    .select({ id: announcementReads.id })
    .from(announcementReads)
    .where(and(eq(announcementReads.announcementId, row.id), eq(announcementReads.userId, req.user!.id)))
    .get();
  const creator = row.createdBy ? db.select({ username: users.username }).from(users).where(eq(users.id, row.createdBy)).get() : null;
  res.json({
    ok: true,
    data: {
      announcement: { id: row.id, title: row.title, content: row.content, updatedAt: row.updatedAt, creator: creator?.username ?? null },
      read
    }
  });
});

myDashboardRouter.post('/announcement/read', (req, res) => {
  const row = activeAnnouncement();
  if (!row) {
    res.json({ ok: true, data: null });
    return;
  }
  const exists = db
    .select({ id: announcementReads.id })
    .from(announcementReads)
    .where(and(eq(announcementReads.announcementId, row.id), eq(announcementReads.userId, req.user!.id)))
    .get();
  if (!exists) {
    db.insert(announcementReads).values({ announcementId: row.id, userId: req.user!.id }).run();
  }
  res.json({ ok: true, data: null });
});

// ---------- 倒数日（个人 + 全员展示） ----------

myDashboardRouter.get('/countdowns', (req, res) => {
  const mine = db
    .select()
    .from(countdowns)
    .where(and(eq(countdowns.scope, 'user'), eq(countdowns.userId, req.user!.id)))
    .orderBy(countdowns.targetDate)
    .all();
  const global = db.select().from(countdowns).where(eq(countdowns.scope, 'global')).orderBy(countdowns.targetDate).all();
  res.json({ ok: true, data: { mine, global } });
});

const countdownSchema = z.object({
  title: z.string().trim().min(1, '标题不能为空').max(60),
  targetDate: z.coerce.number().int().positive()
});

myDashboardRouter.post('/countdowns', (req, res) => {
  const parsed = countdownSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: parsed.error.issues[0]?.message ?? '参数错误' });
    return;
  }
  const created = db
    .insert(countdowns)
    .values({
      scope: 'user',
      userId: req.user!.id,
      title: parsed.data.title,
      targetDate: new Date(parsed.data.targetDate),
      createdBy: req.user!.id
    })
    .returning()
    .get();
  res.json({ ok: true, data: { countdown: created } });
});

myDashboardRouter.delete('/countdowns/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ ok: false, error: '无效的 ID' });
    return;
  }
  db.delete(countdowns).where(and(eq(countdowns.id, id), eq(countdowns.scope, 'user'), eq(countdowns.userId, req.user!.id))).run();
  res.json({ ok: true, data: null });
});

// ---------- TODO（个人 + 全员展示） ----------

myDashboardRouter.get('/todos', (req, res) => {
  const mine = db
    .select()
    .from(todos)
    .where(and(eq(todos.scope, 'user'), eq(todos.userId, req.user!.id)))
    .orderBy(todos.done, desc(todos.createdAt))
    .all();
  const global = db.select().from(todos).where(eq(todos.scope, 'global')).orderBy(todos.done, desc(todos.createdAt)).all();
  res.json({ ok: true, data: { mine, global } });
});

const todoCreateSchema = z.object({ title: z.string().trim().min(1, '内容不能为空').max(120) });
const todoUpdateSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  done: z.boolean().optional()
});

myDashboardRouter.post('/todos', (req, res) => {
  const parsed = todoCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: parsed.error.issues[0]?.message ?? '参数错误' });
    return;
  }
  const created = db
    .insert(todos)
    .values({ scope: 'user', userId: req.user!.id, title: parsed.data.title, createdBy: req.user!.id })
    .returning()
    .get();
  res.json({ ok: true, data: { todo: created } });
});

function ownTodo(req: import('express').Request, idRaw: unknown) {
  const id = Number(idRaw);
  if (!Number.isInteger(id) || id <= 0) return null;
  return db
    .select()
    .from(todos)
    .where(and(eq(todos.id, id), eq(todos.scope, 'user'), eq(todos.userId, req.user!.id)))
    .get();
}

myDashboardRouter.put('/todos/:id', (req, res) => {
  const row = ownTodo(req, req.params.id);
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
  res.json({ ok: true, data: null });
});

myDashboardRouter.delete('/todos/:id', (req, res) => {
  const row = ownTodo(req, req.params.id);
  if (!row) {
    res.status(404).json({ ok: false, error: 'TODO 不存在' });
    return;
  }
  db.delete(todos).where(eq(todos.id, row.id)).run();
  res.json({ ok: true, data: null });
});

// ---------- 统计：贡献图 / 最近动态 ----------

myDashboardRouter.get('/contributions', (req, res) => {
  const since = new Date(Date.now() - 119 * 86400000);
  const rows = db
    .select({
      day: sql<string>`date(created_at / 1000, 'unixepoch')`,
      count: sql<number>`count(*)`
    })
    .from(auditLogs)
    .where(and(eq(auditLogs.userId, req.user!.id), gte(auditLogs.createdAt, since)))
    .groupBy(sql`date(created_at / 1000, 'unixepoch')`)
    .all();
  const map = new Map(rows.map((r) => [String(r.day), Number(r.count)]));
  const days: Array<{ date: string; count: number }> = [];
  for (let i = 119; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const key = d.toISOString().slice(0, 10);
    days.push({ date: key, count: map.get(key) ?? 0 });
  }
  res.json({ ok: true, data: { days } });
});

myDashboardRouter.get('/recent-actions', (req, res) => {
  const user = req.user!;
  const seeAll = user.role === 'admin' || !!user.caps?.canViewAudit;
  const base = db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      target: auditLogs.target,
      createdAt: auditLogs.createdAt,
      username: users.username
    })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.userId));
  const items = seeAll
    ? base.orderBy(desc(auditLogs.createdAt)).limit(8).all()
    : base.where(eq(auditLogs.userId, user.id)).orderBy(desc(auditLogs.createdAt)).limit(8).all();
  res.json({ ok: true, data: { items, scope: seeAll ? 'all' : 'self' } });
});
