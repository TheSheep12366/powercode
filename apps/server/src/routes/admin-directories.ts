import { asc, eq, inArray, like, sql } from 'drizzle-orm';
import { Router } from 'express';
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { config } from '../config.js';
import { db } from '../db/client.js';
import { directories, directoryVisibility, users } from '../db/schema.js';
import { writeAudit } from '../lib/audit.js';
import { logger } from '../lib/logger.js';

export const adminDirectoriesRouter = Router();

const nameSchema = z.string().trim().min(1, '名称不能为空').max(64, '名称最长 64 位');

const createSchema = z.object({
  name: nameSchema,
  path: z.string().trim().min(1, '路径不能为空').max(512),
  /** true = 指定路径必须是已存在的目录；false = 不存在则自动创建 */
  requireExisting: z.boolean().default(false),
  visibleToAll: z.boolean().default(true),
  visibleUserIds: z.array(z.coerce.number().int().positive()).max(500).default([])
});

const updateSchema = z.object({
  name: nameSchema.optional(),
  visibleToAll: z.boolean().optional(),
  visibleUserIds: z.array(z.coerce.number().int().positive()).max(500).optional()
});

const idParamSchema = z.coerce.number().int().positive();

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  q: z.string().trim().max(128).optional()
});

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? '参数错误';
}

/** 归一化路径：相对路径基于工作区根目录补全；拒绝文件系统根目录 */
function normalizePath(raw: string): string {
  const abs = raw.startsWith('/') ? resolve(raw) : resolve(config.workspacesRoot, raw);
  if (abs === '/') throw new Error('禁止共享文件系统根目录 /');
  return abs;
}

function replaceVisibility(directoryId: number, userIds: number[]): void {
  db.delete(directoryVisibility).where(eq(directoryVisibility.directoryId, directoryId)).run();
  if (userIds.length === 0) return;
  const valid = db
    .select({ id: users.id })
    .from(users)
    .where(inArray(users.id, userIds))
    .all()
    .map((r) => r.id);
  if (valid.length === 0) return;
  db.insert(directoryVisibility)
    .values(valid.map((userId) => ({ directoryId, userId })))
    .run();
}

// 元信息：工作区根目录（供前端表单提示）。必须在 /:id 路由之前注册。
adminDirectoriesRouter.get('/meta', (_req, res) => {
  res.json({ ok: true, data: { workspacesRoot: config.workspacesRoot } });
});

adminDirectoriesRouter.get('/', (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: firstIssue(parsed.error) });
    return;
  }
  const { page, pageSize, q } = parsed.data;
  const where = q ? like(directories.name, `%${q}%`) : undefined;

  const items = db
    .select({
      id: directories.id,
      name: directories.name,
      path: directories.path,
      isActive: directories.isActive,
      visibleToAll: directories.visibleToAll,
      visibleCount: sql<number>`count(${directoryVisibility.userId})`,
      createdAt: directories.createdAt
    })
    .from(directories)
    .leftJoin(directoryVisibility, eq(directoryVisibility.directoryId, directories.id))
    .where(where)
    .groupBy(directories.id)
    .orderBy(asc(directories.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .all();

  const totalRow = db.select({ count: sql<number>`count(*)` }).from(directories).where(where).get();

  res.json({ ok: true, data: { items, total: totalRow?.count ?? 0, page, pageSize } });
});

adminDirectoriesRouter.get('/:id', (req, res) => {
  const id = idParamSchema.safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ ok: false, error: '无效的目录 ID' });
    return;
  }
  const row = db.select().from(directories).where(eq(directories.id, id.data)).get();
  if (!row) {
    res.status(404).json({ ok: false, error: '目录不存在' });
    return;
  }
  const visibleUserIds = db
    .select({ userId: directoryVisibility.userId })
    .from(directoryVisibility)
    .where(eq(directoryVisibility.directoryId, row.id))
    .all()
    .map((r) => r.userId);
  res.json({ ok: true, data: { directory: row, visibleUserIds } });
});

adminDirectoriesRouter.post('/', (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: firstIssue(parsed.error) });
    return;
  }
  const { name, path: rawPath, requireExisting, visibleToAll, visibleUserIds } = parsed.data;

  let abs: string;
  try {
    abs = normalizePath(rawPath);
  } catch (e) {
    res.status(400).json({ ok: false, error: e instanceof Error ? e.message : '路径不合法' });
    return;
  }

  if (!existsSync(abs)) {
    if (!requireExisting) {
      try {
        mkdirSync(abs, { recursive: true });
      } catch (e) {
        logger.warn({ err: e, abs }, '创建目录失败');
        res.status(400).json({ ok: false, error: '目录不存在且自动创建失败（检查权限）' });
        return;
      }
    } else {
      res.status(400).json({ ok: false, error: '目录不存在' });
      return;
    }
  }
  if (!statSync(abs).isDirectory()) {
    res.status(400).json({ ok: false, error: '该路径不是目录' });
    return;
  }

  const dup = db.select({ id: directories.id }).from(directories).where(eq(directories.path, abs)).get();
  if (dup) {
    res.status(409).json({ ok: false, error: '该目录已添加为共享' });
    return;
  }

  const created = db.insert(directories).values({ name, path: abs, visibleToAll }).returning().get();
  if (!visibleToAll) replaceVisibility(created.id, visibleUserIds);

  writeAudit({
    userId: req.user!.id,
    action: 'admin.directory.create',
    target: name,
    detail: { path: abs, visibleToAll, visibleUserIds: visibleToAll ? 'all' : visibleUserIds.length },
    ip: req.ip ?? undefined
  });
  res.json({ ok: true, data: { directory: created } });
});

adminDirectoriesRouter.put('/:id', (req, res) => {
  const id = idParamSchema.safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ ok: false, error: '无效的目录 ID' });
    return;
  }
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: firstIssue(parsed.error) });
    return;
  }
  const { name, visibleToAll, visibleUserIds } = parsed.data;
  if (name === undefined && visibleToAll === undefined && visibleUserIds === undefined) {
    res.status(400).json({ ok: false, error: '至少提供一项要修改的内容' });
    return;
  }

  const row = db.select().from(directories).where(eq(directories.id, id.data)).get();
  if (!row) {
    res.status(404).json({ ok: false, error: '目录不存在' });
    return;
  }

  const values: Partial<typeof directories.$inferInsert> = {};
  if (name !== undefined) values.name = name;
  if (visibleToAll !== undefined) values.visibleToAll = visibleToAll;
  if (Object.keys(values).length > 0) {
    db.update(directories).set(values).where(eq(directories.id, row.id)).run();
  }
  if (visibleUserIds !== undefined) {
    replaceVisibility(row.id, visibleUserIds);
  }

  writeAudit({
    userId: req.user!.id,
    action: 'admin.directory.update',
    target: name ?? row.name,
    detail: {
      changes: [
        ...(name !== undefined && name !== row.name ? [`name:${row.name}->${name}`] : []),
        ...(visibleToAll !== undefined ? [`visibleToAll:${visibleToAll}`] : []),
        ...(visibleUserIds !== undefined ? ['visibleUserIds:更新'] : [])
      ]
    },
    ip: req.ip ?? undefined
  });

  const updated = db.select().from(directories).where(eq(directories.id, row.id)).get()!;
  res.json({ ok: true, data: { directory: updated } });
});

adminDirectoriesRouter.delete('/:id', (req, res) => {
  const id = idParamSchema.safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ ok: false, error: '无效的目录 ID' });
    return;
  }
  const row = db.select().from(directories).where(eq(directories.id, id.data)).get();
  if (!row) {
    res.status(404).json({ ok: false, error: '目录不存在' });
    return;
  }

  db.delete(directories).where(eq(directories.id, row.id)).run();
  writeAudit({
    userId: req.user!.id,
    action: 'admin.directory.remove',
    target: row.name,
    detail: { path: row.path, note: '仅解除共享，未删除磁盘文件' },
    ip: req.ip ?? undefined
  });
  res.json({ ok: true, data: null });
});

adminDirectoriesRouter.get('/:id/stats', (req, res) => {
  const id = idParamSchema.safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ ok: false, error: '无效的目录 ID' });
    return;
  }
  const row = db.select().from(directories).where(eq(directories.id, id.data)).get();
  if (!row) {
    res.status(404).json({ ok: false, error: '目录不存在' });
    return;
  }

  const run = (cmd: string, args: string[]) =>
    new Promise<string>((resolvePromise, reject) => {
      execFile(cmd, args, { timeout: 30_000, maxBuffer: 1 << 20 }, (err, stdout) => {
        if (err) reject(err);
        else resolvePromise(stdout);
      });
    });

  void (async () => {
    try {
      const duOut = await run('du', ['-sb', row.path]);
      const sizeBytes = Number.parseInt(duOut.split('\t')[0] ?? '0', 10) || 0;
      const findOut = await run('sh', ['-c', 'find "$1" -xdev -type f 2>/dev/null | wc -l', 'sh', row.path]);
      const fileCount = Number.parseInt(findOut.trim(), 10) || 0;
      res.json({ ok: true, data: { path: row.path, sizeBytes, fileCount } });
    } catch (e) {
      logger.warn({ err: e, path: row.path }, '目录统计失败');
      res.status(500).json({ ok: false, error: '目录统计失败（目录过大或权限不足）' });
    }
  })();
});
