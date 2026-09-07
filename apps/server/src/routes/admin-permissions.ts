import { and, eq } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/client.js';
import { directories, groupMembers, groups, permissions, roles, users } from '../db/schema.js';
import { writeAudit } from '../lib/audit.js';

export const adminPermissionsRouter = Router();

const idSchema = z.coerce.number().int().positive();

const setSchema = z.object({
  directoryId: idSchema,
  subjectType: z.enum(['user', 'group']),
  subjectId: idSchema,
  /** none 表示移除该条目（回到未授权态） */
  mode: z.enum(['ro', 'rw', 'deny', 'none'])
});

/**
 * 权限矩阵（M3-2）：全量返回用户、目录与所有权限条目。
 * 有效权限由前端用 shared 的 computeEffectivePermission 计算（与后端 my/directories 同一逻辑）。
 */
adminPermissionsRouter.get('/matrix', (_req, res) => {
  const userRows = db
    .select({ id: users.id, username: users.username, role: users.role, status: users.status, roleId: users.roleId })
    .from(users)
    .all();
  const directoryRows = db
    .select({ id: directories.id, name: directories.name, visibleToAll: directories.visibleToAll })
    .from(directories)
    .all();
  const roleRows = db
    .select({
      id: roles.id,
      name: roles.name,
      workspaceMode: roles.workspaceMode,
      workspaceLevel: roles.workspaceLevel,
      workspaceDirIds: roles.workspaceDirIds
    })
    .from(roles)
    .all();
  const entries = db
    .select({
      directoryId: permissions.directoryId,
      subjectType: permissions.subjectType,
      subjectId: permissions.subjectId,
      mode: permissions.mode
    })
    .from(permissions)
    .all();
  const memberships = db
    .select({ groupId: groupMembers.groupId, userId: groupMembers.userId })
    .from(groupMembers)
    .all();
  const groupRows = db.select({ id: groups.id, name: groups.name }).from(groups).all();

  res.json({
    ok: true,
    data: {
      users: userRows,
      directories: directoryRows,
      groups: groupRows,
      roles: roleRows.map((r) => ({
        ...r,
        workspaceDirIds: (() => {
          try {
            const arr = JSON.parse(r.workspaceDirIds);
            return Array.isArray(arr) ? arr.map(Number).filter(Number.isInteger) : [];
          } catch {
            return [];
          }
        })()
      })),
      memberships,
      entries
    }
  });
});

/** 设置或清除单个单元格（用户或组 × 目录） */
adminPermissionsRouter.put('/set', (req, res) => {
  const parsed = setSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: parsed.error.issues[0]?.message ?? '参数错误' });
    return;
  }
  const { directoryId, subjectType, subjectId, mode } = parsed.data;

  if (!db.select({ id: directories.id }).from(directories).where(eq(directories.id, directoryId)).get()) {
    res.status(404).json({ ok: false, error: '目录不存在' });
    return;
  }
  if (subjectType === 'user') {
    if (!db.select({ id: users.id }).from(users).where(eq(users.id, subjectId)).get()) {
      res.status(404).json({ ok: false, error: '用户不存在' });
      return;
    }
  } else if (!db.select({ id: groups.id }).from(groups).where(eq(groups.id, subjectId)).get()) {
    res.status(404).json({ ok: false, error: '用户组不存在' });
    return;
  }

  const existing = db
    .select()
    .from(permissions)
    .where(
      and(
        eq(permissions.directoryId, directoryId),
        eq(permissions.subjectType, subjectType),
        eq(permissions.subjectId, subjectId)
      )
    )
    .get();

  const subjectLabel =
    subjectType === 'user'
      ? db.select({ username: users.username }).from(users).where(eq(users.id, subjectId)).get()?.username
      : db.select({ name: groups.name }).from(groups).where(eq(groups.id, subjectId)).get()?.name;

  if (mode === 'none') {
    if (existing) db.delete(permissions).where(eq(permissions.id, existing.id)).run();
  } else if (existing) {
    db.update(permissions).set({ mode }).where(eq(permissions.id, existing.id)).run();
  } else {
    db.insert(permissions).values({ directoryId, subjectType, subjectId, mode }).run();
  }

  writeAudit({
    userId: req.user!.id,
    action: 'admin.permission.set',
    target: subjectLabel ?? String(subjectId),
    detail: { directoryId, subjectType, subjectId, mode },
    ip: req.ip ?? undefined
  });
  res.json({ ok: true, data: null });
});
