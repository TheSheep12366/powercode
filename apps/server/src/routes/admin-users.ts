import bcrypt from 'bcryptjs';
import { and, asc, desc, eq, like, ne, sql } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/client.js';
import { permissions, roles, sessions, users } from '../db/schema.js';
import { writeAudit } from '../lib/audit.js';
import { getPresenceEntry } from '../presence.js';

export const adminUsersRouter = Router();

// 挂载点已加 requireAdmin（app.ts 中 /api/admin 统一校验）
const usernameSchema = z
  .string()
  .trim()
  .regex(/^[a-zA-Z0-9_-]{3,32}$/, '用户名需 3-32 位，仅限字母、数字、下划线和连字符');
const passwordSchema = z.string().min(8, '密码至少 8 位').max(72, '密码最长 72 位');

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  q: z.string().trim().max(64).optional(),
  role: z.enum(['admin', 'user']).optional(),
  status: z.enum(['active', 'disabled']).optional(),
  sortBy: z.enum(['username', 'role', 'status', 'createdAt']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc')
});

const roleIdSchema = z
  .union([z.coerce.number().int().positive(), z.null()])
  .optional();

const createSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  role: z.enum(['admin', 'user']).default('user'),
  status: z.enum(['active', 'disabled']).default('active'),
  roleId: roleIdSchema
});

const updateSchema = z
  .object({
    password: passwordSchema.optional(),
    role: z.enum(['admin', 'user']).optional(),
    status: z.enum(['active', 'disabled']).optional(),
    roleId: roleIdSchema
  })
  .refine(
    (v) =>
      v.password !== undefined || v.role !== undefined || v.status !== undefined || v.roleId !== undefined,
    { message: '至少提供一项要修改的内容' }
  );

const idParamSchema = z.coerce.number().int().positive();

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? '参数错误';
}

function roleIdExists(id: number | null | undefined): boolean {
  if (id === null || id === undefined) return true;
  return !!db.select({ id: roles.id }).from(roles).where(eq(roles.id, id)).get();
}

function publicUser(u: typeof users.$inferSelect, roleName?: string | null) {
  return {
    id: u.id,
    username: u.username,
    role: u.role,
    status: u.status,
    roleId: u.roleId ?? null,
    roleName: roleName ?? null,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt
  };
}

function activeAdminCount(excludeUserId?: number): number {
  const row = db
    .select({ count: sql<number>`count(*)` })
    .from(users)
    .where(and(eq(users.role, 'admin'), eq(users.status, 'active'), excludeUserId ? ne(users.id, excludeUserId) : undefined))
    .get();
  return row?.count ?? 0;
}

function getUserById(id: number): typeof users.$inferSelect | undefined {
  return db.select().from(users).where(eq(users.id, id)).get();
}

adminUsersRouter.get('/', (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: firstIssue(parsed.error) });
    return;
  }
  const { page, pageSize, q, role, status, sortBy, order } = parsed.data;

  const conds = [];
  if (q) conds.push(like(users.username, `%${q}%`));
  if (role) conds.push(eq(users.role, role));
  if (status) conds.push(eq(users.status, status));
  const where = conds.length > 0 ? and(...conds) : undefined;

  const columnMap = {
    username: users.username,
    role: users.role,
    status: users.status,
    createdAt: users.createdAt
  } as const;
  const column = columnMap[sortBy];
  const orderBy = order === 'asc' ? asc(column) : desc(column);

  const items = db
    .select({
      id: users.id,
      username: users.username,
      role: users.role,
      status: users.status,
      roleId: users.roleId,
      roleName: roles.name,
      avatarExt: users.avatarExt,
      avatarVersion: users.avatarVersion,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt
    })
    .from(users)
    .leftJoin(roles, eq(roles.id, users.roleId))
    .where(where)
    .orderBy(orderBy)
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .all()
    .map((u) => ({ ...u, online: !!getPresenceEntry(u.id) }));

  const totalRow = db.select({ count: sql<number>`count(*)` }).from(users).where(where).get();

  res.json({ ok: true, data: { items, total: totalRow?.count ?? 0, page, pageSize } });
});

adminUsersRouter.post('/', (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: firstIssue(parsed.error) });
    return;
  }
  const { username, password, role, status, roleId } = parsed.data;

  const dup = db.select({ id: users.id }).from(users).where(eq(users.username, username)).get();
  if (dup) {
    res.status(409).json({ ok: false, error: '用户名已存在' });
    return;
  }
  if (!roleIdExists(roleId)) {
    res.status(400).json({ ok: false, error: '权限组不存在' });
    return;
  }

  const passwordHash = bcrypt.hashSync(password, 12);
  const created = db.insert(users).values({ username, passwordHash, role, status, roleId: roleId ?? null }).returning().get();

  writeAudit({
    userId: req.user!.id,
    action: 'admin.user.create',
    target: username,
    detail: { newUserId: created.id, role, status, roleId: roleId ?? null },
    ip: req.ip ?? undefined
  });
  const roleName = roleId ? db.select({ name: roles.name }).from(roles).where(eq(roles.id, roleId)).get()?.name ?? null : null;
  res.json({ ok: true, data: { user: publicUser(created, roleName) } });
});

adminUsersRouter.put('/:id', (req, res) => {
  const id = idParamSchema.safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ ok: false, error: '无效的用户 ID' });
    return;
  }
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: firstIssue(parsed.error) });
    return;
  }
  const { password, role, status, roleId } = parsed.data;

  const target = getUserById(id.data);
  if (!target) {
    res.status(404).json({ ok: false, error: '用户不存在' });
    return;
  }
  if (roleId !== undefined && !roleIdExists(roleId)) {
    res.status(400).json({ ok: false, error: '权限组不存在' });
    return;
  }

  const changes: string[] = [];
  if (role !== undefined || status !== undefined) {
    if (target.id === req.user!.id) {
      res.status(400).json({ ok: false, error: '不能修改自己的角色或状态' });
      return;
    }
    const wantsDemote =
      (role !== undefined && role !== target.role) || (status !== undefined && status !== target.status);
    if (
      wantsDemote &&
      target.role === 'admin' &&
      target.status === 'active' &&
      ((role !== undefined && role === 'user') || (status !== undefined && status === 'disabled')) &&
      activeAdminCount(target.id) === 0
    ) {
      res.status(400).json({ ok: false, error: '系统至少需要保留一名启用的管理员' });
      return;
    }
    if (role !== undefined && role !== target.role) changes.push(`role:${target.role}->${role}`);
    if (status !== undefined && status !== target.status) changes.push(`status:${target.status}->${status}`);
  }
  if (password !== undefined) changes.push('password:重置');
  if (roleId !== undefined && roleId !== target.roleId) changes.push(`roleId:${target.roleId ?? '无'}->${roleId ?? '无'}`);

  const values: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };
  if (password !== undefined) values.passwordHash = bcrypt.hashSync(password, 12);
  if (role !== undefined) values.role = role;
  if (status !== undefined) values.status = status;
  if (roleId !== undefined) values.roleId = roleId;
  db.update(users).set(values).where(eq(users.id, target.id)).run();

  // 重置密码 → 踢掉目标用户所有会话（若是自己则保留当前会话）；禁用 → 踢掉全部会话
  if (password !== undefined && target.id === req.user!.id && req.sessionId) {
    db.delete(sessions).where(and(eq(sessions.userId, target.id), ne(sessions.id, req.sessionId))).run();
  } else if (password !== undefined || status === 'disabled') {
    db.delete(sessions).where(eq(sessions.userId, target.id)).run();
  }

  writeAudit({
    userId: req.user!.id,
    action: 'admin.user.update',
    target: target.username,
    detail: { changes },
    ip: req.ip ?? undefined
  });

  const updated = getUserById(target.id)!;
  const roleName = updated.roleId
    ? db.select({ name: roles.name }).from(roles).where(eq(roles.id, updated.roleId)).get()?.name ?? null
    : null;
  res.json({ ok: true, data: { user: publicUser(updated, roleName) } });
});

adminUsersRouter.delete('/:id', (req, res) => {
  const id = idParamSchema.safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ ok: false, error: '无效的用户 ID' });
    return;
  }
  const target = getUserById(id.data);
  if (!target) {
    res.status(404).json({ ok: false, error: '用户不存在' });
    return;
  }
  if (target.id === req.user!.id) {
    res.status(400).json({ ok: false, error: '不能删除当前登录的账号' });
    return;
  }
  if (target.role === 'admin' && target.status === 'active' && activeAdminCount(target.id) === 0) {
    res.status(400).json({ ok: false, error: '系统至少需要保留一名启用的管理员' });
    return;
  }

  db.delete(users).where(eq(users.id, target.id)).run();
  // subjectId 为多态字段无外键，需手动清理该用户的权限条目
  db.delete(permissions).where(and(eq(permissions.subjectType, 'user'), eq(permissions.subjectId, target.id))).run();
  writeAudit({
    userId: req.user!.id,
    action: 'admin.user.delete',
    target: target.username,
    detail: { deletedUserId: target.id },
    ip: req.ip ?? undefined
  });
  res.json({ ok: true, data: null });
});
