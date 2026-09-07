import { eq } from 'drizzle-orm';
import { Router } from 'express';
import { db } from '../db/client.js';
import { directories } from '../db/schema.js';
import { canSeeDirectory, effectivePermissionFor } from '../lib/permissions.js';
import { requireAuth } from '../middleware/session.js';

export const myRouter = Router();

/**
 * 当前用户可见的共享目录及其有效权限（M6 文件树的数据源）：
 * 可见性 = visibleToAll / directory_visibility / 权限组授予；
 * 有效权限 = 管理员 > 用户级条目 > 权限组授予 > 组级条目 > 无授权。
 */
myRouter.get('/directories', requireAuth, (req, res) => {
  const user = req.user!;
  const dirRows = db.select().from(directories).where(eq(directories.isActive, true)).all();

  const result = dirRows
    .filter((d) => canSeeDirectory(user.id, d))
    .map((d) => ({
      id: d.id,
      name: d.name,
      path: d.path,
      permission: effectivePermissionFor(user.id, d.id)
    }));

  res.json({ ok: true, data: { items: result } });
});
