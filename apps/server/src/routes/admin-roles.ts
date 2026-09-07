import { eq, sql } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/client.js';
import { directories, roles, users } from '../db/schema.js';
import { writeAudit } from '../lib/audit.js';

export const adminRolesRouter = Router();

const idSchema = z.coerce.number().int().positive();
const nameSchema = z.string().trim().min(1, '名称不能为空').max(32, '名称最长 32 位');

const flagsSchema = z.object({
  canManageUsers: z.boolean().default(false),
  canManageDirectories: z.boolean().default(false),
  canViewAudit: z.boolean().default(false),
  canManageAnnouncements: z.boolean().default(false),
  canManageGlobalPlans: z.boolean().default(false)
});

const baseSchema = z.object({
  name: nameSchema,
  ...flagsSchema.shape,
  workspaceMode: z.enum(['all', 'selected']).default('all'),
  workspaceLevel: z.enum(['rw', 'ro']).default('rw'),
  workspaceDirIds: z.array(z.coerce.number().int().positive()).max(200).default([])
});

const updateSchema = baseSchema.partial();

function parseDirIds(raw: string): number[] {
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.map(Number).filter((n) => Number.isInteger(n)) : [];
  } catch {
    return [];
  }
}

function validateDirIds(ids: number[]): string | null {
  if (ids.length === 0) return null;
  const existing = db.select({ id: directories.id }).from(directories).all().map((d) => d.id);
  const bad = ids.find((id) => !existing.includes(id));
  return bad === undefined ? null : `目录不存在（id=${bad}）`;
}

adminRolesRouter.get('/', (_req, res) => {
  const rows = db
    .select({
      id: roles.id,
      name: roles.name,
      canManageUsers: roles.canManageUsers,
      canManageDirectories: roles.canManageDirectories,
      canViewAudit: roles.canViewAudit,
      canManageAnnouncements: roles.canManageAnnouncements,
      canManageGlobalPlans: roles.canManageGlobalPlans,
      workspaceMode: roles.workspaceMode,
      workspaceLevel: roles.workspaceLevel,
      workspaceDirIds: roles.workspaceDirIds,
      createdAt: roles.createdAt,
      memberCount: sql<number>`count(${users.id})`
    })
    .from(roles)
    .leftJoin(users, eq(users.roleId, roles.id))
    .groupBy(roles.id)
    .orderBy(roles.id)
    .all();
  res.json({
    ok: true,
    data: {
      items: rows.map((r) => ({ ...r, workspaceDirIds: parseDirIds(r.workspaceDirIds) }))
    }
  });
});

adminRolesRouter.get('/:id', (req, res) => {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ ok: false, error: '无效的权限组 ID' });
    return;
  }
  const row = db.select().from(roles).where(eq(roles.id, id.data)).get();
  if (!row) {
    res.status(404).json({ ok: false, error: '权限组不存在' });
    return;
  }
  res.json({ ok: true, data: { role: { ...row, workspaceDirIds: parseDirIds(row.workspaceDirIds) } } });
});

adminRolesRouter.post('/', (req, res) => {
  const parsed = baseSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: parsed.error.issues[0]?.message ?? '参数错误' });
    return;
  }
  const data = parsed.data;
  const dup = db.select({ id: roles.id }).from(roles).where(eq(roles.name, data.name)).get();
  if (dup) {
    res.status(409).json({ ok: false, error: '权限组名称已存在' });
    return;
  }
  const dirError = validateDirIds(data.workspaceDirIds);
  if (dirError) {
    res.status(400).json({ ok: false, error: dirError });
    return;
  }
  const created = db
    .insert(roles)
    .values({
      name: data.name,
      canManageUsers: data.canManageUsers,
      canManageDirectories: data.canManageDirectories,
      canViewAudit: data.canViewAudit,
      canManageAnnouncements: data.canManageAnnouncements,
      canManageGlobalPlans: data.canManageGlobalPlans,
      workspaceMode: data.workspaceMode,
      workspaceLevel: data.workspaceLevel,
      workspaceDirIds: JSON.stringify(data.workspaceDirIds)
    })
    .returning()
    .get();
  writeAudit({
    userId: req.user!.id,
    action: 'admin.role.create',
    target: data.name,
    detail: { roleId: created.id, workspaceMode: data.workspaceMode },
    ip: req.ip ?? undefined
  });
  res.json({ ok: true, data: { role: { ...created, workspaceDirIds: data.workspaceDirIds } } });
});

adminRolesRouter.put('/:id', (req, res) => {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ ok: false, error: '无效的权限组 ID' });
    return;
  }
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: parsed.error.issues[0]?.message ?? '参数错误' });
    return;
  }
  const row = db.select().from(roles).where(eq(roles.id, id.data)).get();
  if (!row) {
    res.status(404).json({ ok: false, error: '权限组不存在' });
    return;
  }
  const data = parsed.data;
  if (data.name !== undefined && data.name !== row.name) {
    const dup = db.select({ id: roles.id }).from(roles).where(eq(roles.name, data.name)).get();
    if (dup) {
      res.status(409).json({ ok: false, error: '权限组名称已存在' });
      return;
    }
  }
  const dirIds = data.workspaceDirIds ?? parseDirIds(row.workspaceDirIds);
  const dirError = validateDirIds(dirIds);
  if (dirError) {
    res.status(400).json({ ok: false, error: dirError });
    return;
  }

  db.update(roles)
    .set({
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.canManageUsers !== undefined ? { canManageUsers: data.canManageUsers } : {}),
      ...(data.canManageDirectories !== undefined ? { canManageDirectories: data.canManageDirectories } : {}),
      ...(data.canViewAudit !== undefined ? { canViewAudit: data.canViewAudit } : {}),
      ...(data.canManageAnnouncements !== undefined ? { canManageAnnouncements: data.canManageAnnouncements } : {}),
      ...(data.canManageGlobalPlans !== undefined ? { canManageGlobalPlans: data.canManageGlobalPlans } : {}),
      ...(data.workspaceMode !== undefined ? { workspaceMode: data.workspaceMode } : {}),
      ...(data.workspaceLevel !== undefined ? { workspaceLevel: data.workspaceLevel } : {}),
      workspaceDirIds: JSON.stringify(dirIds)
    })
    .where(eq(roles.id, row.id))
    .run();

  writeAudit({
    userId: req.user!.id,
    action: 'admin.role.update',
    target: data.name ?? row.name,
    detail: { roleId: row.id },
    ip: req.ip ?? undefined
  });
  res.json({ ok: true, data: null });
});

adminRolesRouter.delete('/:id', (req, res) => {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ ok: false, error: '无效的权限组 ID' });
    return;
  }
  const row = db.select().from(roles).where(eq(roles.id, id.data)).get();
  if (!row) {
    res.status(404).json({ ok: false, error: '权限组不存在' });
    return;
  }
  db.delete(roles).where(eq(roles.id, row.id)).run();
  // users.roleId ON DELETE SET NULL 自动解除关联
  writeAudit({
    userId: req.user!.id,
    action: 'admin.role.delete',
    target: row.name,
    detail: { roleId: row.id },
    ip: req.ip ?? undefined
  });
  res.json({ ok: true, data: null });
});
