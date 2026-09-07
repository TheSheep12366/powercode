import { Router } from 'express';
import { readdirSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';
import { config } from '../config.js';
import { writeAudit } from '../lib/audit.js';

export const adminFsRouter = Router();

const root = resolve(config.workspacesRoot);

/** 路径必须位于工作区根目录之内（含根本身） */
function withinScope(p: string): boolean {
  return p === root || p.startsWith(root.endsWith('/') ? root : root + '/');
}

function fail(res: import('express').Response, status: number, error: string): void {
  res.status(status).json({ ok: false, error });
}

/** 列出某目录下的全部子文件夹（仅文件夹，跳过隐藏项） */
adminFsRouter.get('/dirs', (req, res) => {
  const raw = typeof req.query.path === 'string' ? req.query.path.trim() : '';
  const p = resolve(raw || root);
  if (!withinScope(p)) {
    fail(res, 403, '只能浏览工作区根目录之内的路径');
    return;
  }
  if (!existsSync(p) || !statSync(p).isDirectory()) {
    fail(res, 400, '目录不存在');
    return;
  }
  try {
    const folders = readdirSync(p, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
      .map((d) => d.name)
      .sort((a, b) => a.localeCompare(b, 'zh-CN'));
    res.json({
      ok: true,
      data: {
        path: p,
        parent: p === root ? null : dirname(p),
        isRoot: p === root,
        folders
      }
    });
  } catch {
    fail(res, 500, '读取目录失败（权限不足）');
  }
});

const mkdirSchema = z.object({
  parent: z.string().trim().min(1),
  name: z.string().trim().regex(/^[^\\/]{1,64}$/, '文件夹名不能含路径分隔符，且不超过 64 字符')
});

/** 在指定目录下新建文件夹 */
adminFsRouter.post('/mkdir', (req, res) => {
  const parsed = mkdirSchema.safeParse(req.body);
  if (!parsed.success) {
    fail(res, 400, parsed.error.issues[0]?.message ?? '参数错误');
    return;
  }
  const parent = resolve(parsed.data.parent);
  if (!withinScope(parent)) {
    fail(res, 403, '只能在工作区根目录之内新建');
    return;
  }
  if (!existsSync(parent) || !statSync(parent).isDirectory()) {
    fail(res, 400, '上级目录不存在');
    return;
  }
  const target = resolve(parent, parsed.data.name);
  if (!withinScope(target)) {
    fail(res, 403, '路径不合法');
    return;
  }
  if (existsSync(target)) {
    fail(res, 409, '同名文件夹已存在');
    return;
  }
  try {
    mkdirSync(target);
  } catch {
    fail(res, 500, '创建失败（权限不足）');
    return;
  }
  writeAudit({
    userId: req.user!.id,
    action: 'admin.fs.mkdir',
    target: target,
    detail: { name: parsed.data.name },
    ip: req.ip ?? undefined
  });
  res.json({ ok: true, data: { path: target } });
});
