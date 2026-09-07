import { and, eq, inArray, sql } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/client.js';
import { groupMembers, groups, permissions, users } from '../db/schema.js';
import { writeAudit } from '../lib/audit.js';

export const adminGroupsRouter = Router();

const idSchema = z.coerce.number().int().positive();
const nameSchema = z.string().trim().min(1, '组名不能为空').max(32, '组名最长 32 位');
const membersSchema = z.array(z.coerce.number().int().positive()).max(500).default([]);

const createSchema = z.object({ name: nameSchema, memberIds: membersSchema });
const updateSchema = z.object({
  name: nameSchema.optional(),
  memberIds: membersSchema.optional()
});

function replaceMembers(groupId: number, memberIds: number[]): void {
  db.delete(groupMembers).where(eq(groupMembers.groupId, groupId)).run();
  if (memberIds.length === 0) return;
  const valid = db
    .select({ id: users.id })
    .from(users)
    .where(inArray(users.id, memberIds))
    .all()
    .map((r) => r.id);
  if (valid.length === 0) return;
  db.insert(groupMembers)
    .values(valid.map((userId) => ({ groupId, userId })))
    .run();
}

adminGroupsRouter.get('/', (_req, res) => {
  const rows = db
    .select({
      id: groups.id,
      name: groups.name,
      createdAt: groups.createdAt,
      memberCount: sql<number>`count(${groupMembers.userId})`
    })
    .from(groups)
    .leftJoin(groupMembers, eq(groupMembers.groupId, groups.id))
    .groupBy(groups.id)
    .orderBy(groups.id)
    .all();
  res.json({ ok: true, data: { items: rows } });
});

adminGroupsRouter.get('/:id', (req, res) => {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ ok: false, error: '无效的组 ID' });
    return;
  }
  const row = db.select().from(groups).where(eq(groups.id, id.data)).get();
  if (!row) {
    res.status(404).json({ ok: false, error: '用户组不存在' });
    return;
  }
  const memberIds = db
    .select({ userId: groupMembers.userId })
    .from(groupMembers)
    .where(eq(groupMembers.groupId, row.id))
    .all()
    .map((r) => r.userId);
  res.json({ ok: true, data: { group: row, memberIds } });
});

adminGroupsRouter.post('/', (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: parsed.error.issues[0]?.message ?? '参数错误' });
    return;
  }
  const { name, memberIds } = parsed.data;
  const dup = db.select({ id: groups.id }).from(groups).where(eq(groups.name, name)).get();
  if (dup) {
    res.status(409).json({ ok: false, error: '组名已存在' });
    return;
  }
  const created = db.insert(groups).values({ name }).returning().get();
  replaceMembers(created.id, memberIds);
  writeAudit({
    userId: req.user!.id,
    action: 'admin.group.create',
    target: name,
    detail: { groupId: created.id, members: memberIds.length },
    ip: req.ip ?? undefined
  });
  res.json({ ok: true, data: { group: created } });
});

adminGroupsRouter.put('/:id', (req, res) => {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ ok: false, error: '无效的组 ID' });
    return;
  }
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: parsed.error.issues[0]?.message ?? '参数错误' });
    return;
  }
  const row = db.select().from(groups).where(eq(groups.id, id.data)).get();
  if (!row) {
    res.status(404).json({ ok: false, error: '用户组不存在' });
    return;
  }
  const { name, memberIds } = parsed.data;
  if (name !== undefined && name !== row.name) {
    const dup = db.select({ id: groups.id }).from(groups).where(eq(groups.name, name)).get();
    if (dup) {
      res.status(409).json({ ok: false, error: '组名已存在' });
      return;
    }
    db.update(groups).set({ name }).where(eq(groups.id, row.id)).run();
  }
  if (memberIds !== undefined) replaceMembers(row.id, memberIds);

  writeAudit({
    userId: req.user!.id,
    action: 'admin.group.update',
    target: name ?? row.name,
    detail: { groupId: row.id, renamed: name !== undefined && name !== row.name, membersUpdated: memberIds !== undefined },
    ip: req.ip ?? undefined
  });
  res.json({ ok: true, data: null });
});

adminGroupsRouter.delete('/:id', (req, res) => {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ ok: false, error: '无效的组 ID' });
    return;
  }
  const row = db.select().from(groups).where(eq(groups.id, id.data)).get();
  if (!row) {
    res.status(404).json({ ok: false, error: '用户组不存在' });
    return;
  }
  db.delete(groups).where(eq(groups.id, row.id)).run();
  // subjectId 为多态字段无外键，需手动清理该组的权限条目
  db.delete(permissions).where(and(eq(permissions.subjectType, 'group'), eq(permissions.subjectId, row.id))).run();
  writeAudit({
    userId: req.user!.id,
    action: 'admin.group.delete',
    target: row.name,
    detail: { groupId: row.id },
    ip: req.ip ?? undefined
  });
  res.json({ ok: true, data: null });
});
