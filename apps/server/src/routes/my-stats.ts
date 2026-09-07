import { eq } from 'drizzle-orm';
import { Router } from 'express';
import { db } from '../db/client.js';
import { directories } from '../db/schema.js';
import { computeDirStats } from '../lib/dir-stats.js';
import { canSeeDirectory } from '../lib/permissions.js';
import { requireAuth } from '../middleware/session.js';
import { listPresence } from '../presence.js';

export const myStatsRouter = Router();

myStatsRouter.use(requireAuth);

function fail(res: import('express').Response, status: number, error: string): void {
  res.status(status).json({ ok: false, error });
}

function getVisibleDir(req: import('express').Request, dirId: number) {
  const id = Number(dirId);
  if (!Number.isInteger(id) || id <= 0) return null;
  const dir = db.select().from(directories).where(eq(directories.id, id)).get();
  if (!dir || !dir.isActive || !canSeeDirectory(req.user!.id, dir)) return null;
  return dir;
}

/** 单项目统计：文件数 / 体积 / 代码行数 / 正在编辑的成员 */
myStatsRouter.get('/dir', (req, res) => {
  const dir = getVisibleDir(req, Number(req.query.dirId));
  if (!dir) {
    fail(res, 404, '项目不存在或无权访问');
    return;
  }
  const stats = computeDirStats(dir.path);
  const editors = listPresence()
    .filter((p) => p.currentDoc?.dirId === dir.id)
    .map((p) => ({ userId: p.userId, username: p.username }));
  res.json({ ok: true, data: { id: dir.id, name: dir.name, ...stats, editors } });
});

/** 总览统计：全部可见项目 + 汇总 */
myStatsRouter.get('/overview', (req, res) => {
  const dirRows = db.select().from(directories).where(eq(directories.isActive, true)).all();
  const dirs = dirRows
    .filter((d) => canSeeDirectory(req.user!.id, d))
    .map((d) => {
      const stats = computeDirStats(d.path);
      const editors = listPresence().filter((p) => p.currentDoc?.dirId === d.id).length;
      return { id: d.id, name: d.name, ...stats, editors };
    });
  const totals = dirs.reduce(
    (acc, d) => ({ files: acc.files + d.files, bytes: acc.bytes + d.bytes, lines: acc.lines + d.lines }),
    { files: 0, bytes: 0, lines: 0 }
  );
  res.json({ ok: true, data: { dirs, totals } });
});
