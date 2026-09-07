import { computeEffectivePermission, type EffectivePermission, type PermissionMode } from '@powercode/shared';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { directories, directoryVisibility, groupMembers, permissions, roles, users } from '../db/schema.js';

export function parseRoleDirIds(raw: string): number[] {
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.map(Number).filter((n) => Number.isInteger(n)) : [];
  } catch {
    return [];
  }
}

/** 权限组对某目录的授予级别（未授予返回 null） */
export function roleGrantForUser(userId: number, directoryId: number): PermissionMode | null {
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user?.roleId) return null;
  const role = db.select().from(roles).where(eq(roles.id, user.roleId)).get();
  if (!role) return null;
  if (role.workspaceMode === 'all' || parseRoleDirIds(role.workspaceDirIds).includes(directoryId)) {
    return role.workspaceLevel;
  }
  return null;
}

/** 用户对某目录的有效权限（管理员/用户级条目/权限组授予/组级条目/无授权） */
export function effectivePermissionFor(userId: number, directoryId: number): EffectivePermission {
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user || user.status !== 'active') return 'none';
  if (user.role === 'admin') return 'admin';

  const entries = db
    .select({
      subjectType: permissions.subjectType,
      subjectId: permissions.subjectId,
      mode: permissions.mode
    })
    .from(permissions)
    .where(eq(permissions.directoryId, directoryId))
    .all();

  const myGroupIds = db
    .select({ groupId: groupMembers.groupId })
    .from(groupMembers)
    .where(eq(groupMembers.userId, userId))
    .all()
    .map((r) => r.groupId);

  return computeEffectivePermission({
    role: user.role,
    userEntry: entries.find((e) => e.subjectType === 'user' && e.subjectId === userId)?.mode ?? null,
    roleGrant: roleGrantForUser(userId, directoryId),
    groupEntries: entries.filter((e) => e.subjectType === 'group' && myGroupIds.includes(e.subjectId)).map((e) => e.mode)
  });
}

/** 用户能否在工作区中看到某目录（文件树可见性） */
export function canSeeDirectory(userId: number, dir: { id: number; visibleToAll: boolean }): boolean {
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user || user.status !== 'active') return false;
  if (user.role === 'admin') return true;
  if (dir.visibleToAll) return true;
  const extra = db
    .select({ directoryId: directoryVisibility.directoryId })
    .from(directoryVisibility)
    .where(eq(directoryVisibility.userId, userId))
    .all()
    .map((r) => r.directoryId);
  if (extra.includes(dir.id)) return true;
  return roleGrantForUser(userId, dir.id) !== null;
}

/** 确保目录可见且可读；need='rw' 时要求可写。返回错误文案或 null */
export function checkPermission(
  userId: number,
  directoryId: number,
  need: 'ro' | 'rw'
): string | null {
  const perm = effectivePermissionFor(userId, directoryId);
  if (perm === 'none' || perm === 'deny') return '对该目录没有访问权限';
  if (need === 'rw' && perm !== 'rw' && perm !== 'admin') return '对该目录只有只读权限';
  return null;
}
