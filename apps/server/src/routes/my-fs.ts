import { eq } from 'drizzle-orm';
import { Router } from 'express';
import { ZipArchive } from 'archiver';
import multer from 'multer';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { z } from 'zod';
import { db } from '../db/client.js';
import { directories } from '../db/schema.js';
import { broadcastFsChanged } from '../presence.js';
import { writeAudit } from '../lib/audit.js';
import { checkPermission } from '../lib/permissions.js';
import { requireAuth } from '../middleware/session.js';

export const myFsRouter = Router();

const MAX_UPLOAD_SIZE = 50 * 1024 * 1024;
const MAX_EDIT_SIZE = 2 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_SIZE, files: 1 }
});

myFsRouter.use(requireAuth);

const idSchema = z.coerce.number().int().positive();

function getActiveDir(dirId: number) {
  return db.select().from(directories).where(eq(directories.id, dirId)).get();
}

function fail(res: import('express').Response, status: number, error: string): void {
  res.status(status).json({ ok: false, error });
}

/** 每个路由先做鉴权并解析路径，把结果挂到 res.locals */
function withPath(need: 'ro' | 'rw', getRel: (req: import('express').Request) => string) {
  return (req: import('express').Request, res: import('express').Response, next: import('express').NextFunction): void => {
    const id = idSchema.safeParse(req.query.dirId ?? req.body?.dirId);
    if (!id.success) {
      fail(res, 400, '无效的目录 ID');
      return;
    }
    const dir = getActiveDir(id.data);
    if (!dir || !dir.isActive) {
      fail(res, 404, '共享目录不存在');
      return;
    }
    const denied = checkPermission(req.user!.id, id.data, need);
    if (denied) {
      fail(res, 403, denied);
      return;
    }
    const relPath = getRel(req);
    if (relPath.startsWith('/') || relPath.split('/').filter(Boolean).includes('..')) {
      fail(res, 400, '路径不合法');
      return;
    }
    const root = resolve(dir.path);
    const abs = relPath.trim() === '' ? root : resolve(root, relPath);
    if (abs !== root && !abs.startsWith(root + '/')) {
      fail(res, 400, '路径不合法');
      return;
    }
    res.locals.dir = { id: id.data, root, abs, relPath };
    next();
  };
}

/** 目录内容列表（懒加载单层） */
myFsRouter.get('/list', withPath('ro', (req) => String(req.query.path ?? '')), (req, res) => {
  const { abs, relPath } = res.locals.dir as { abs: string; relPath: string };
  if (!existsSync(abs) || !statSync(abs).isDirectory()) {
    fail(res, 400, '目录不存在');
    return;
  }
  const entries = readdirSync(abs, { withFileTypes: true })
    .filter((d) => !d.name.startsWith('.'))
    .map((d) => {
      const full = join(abs, d.name);
      let size = 0;
      let mtime = 0;
      try {
        const st = statSync(full);
        size = st.size;
        mtime = st.mtimeMs;
      } catch {
        // stat 失败保持默认
      }
      return {
        name: d.name,
        type: d.isDirectory() ? ('folder' as const) : ('file' as const),
        size,
        mtime
      };
    })
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      return a.name.localeCompare(b.name, 'zh-CN');
    });
  res.json({ ok: true, data: { path: relPath, items: entries } });
});

/** 文件预检（能否进编辑器） */
myFsRouter.get('/stat', withPath('ro', (req) => String(req.query.path ?? '')), (req, res) => {
  const { abs } = res.locals.dir as { abs: string };
  if (!existsSync(abs)) {
    res.json({ ok: true, data: { exists: false, isFile: false, size: 0, binary: false, editable: false, reason: '文件不存在' } });
    return;
  }
  const st = statSync(abs);
  if (!st.isFile()) {
    res.json({ ok: true, data: { exists: true, isFile: false, size: st.size, binary: false, editable: false, reason: '不是文件' } });
    return;
  }
  let binary = false;
  if (st.size > 0) {
    const head = readFileSync(abs).subarray(0, 8000);
    binary = head.includes(0);
  }
  const editable = st.size <= MAX_EDIT_SIZE && !binary;
  res.json({
    ok: true,
    data: {
      exists: true,
      isFile: true,
      size: st.size,
      binary,
      editable,
      reason: editable ? null : st.size > MAX_EDIT_SIZE ? '文件超过 2MB' : '二进制文件'
    }
  });
});

const createSchema = z.object({
  dirId: z.coerce.number().int().positive(),
  path: z.string().trim().min(1),
  type: z.enum(['file', 'folder'])
});

/** 新建文件 / 文件夹 */
myFsRouter.post('/file', (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    fail(res, 400, parsed.error.issues[0]?.message ?? '参数错误');
    return;
  }
  const id = idSchema.safeParse(parsed.data.dirId);
  if (!id.success) {
    fail(res, 400, '无效的目录 ID');
    return;
  }
  const dir = getActiveDir(id.data);
  if (!dir || !dir.isActive) {
    fail(res, 404, '共享目录不存在');
    return;
  }
  const denied = checkPermission(req.user!.id, id.data, 'rw');
  if (denied) {
    fail(res, 403, denied);
    return;
  }
  const rel = parsed.data.path;
  if (rel.startsWith('/') || rel.split('/').filter(Boolean).includes('..')) {
    fail(res, 400, '路径不合法');
    return;
  }
  const root = resolve(dir.path);
  const abs = resolve(root, rel);
  if (!abs.startsWith(root + '/')) {
    fail(res, 400, '路径不合法');
    return;
  }
  const name = basename(abs);
  if (!name || name.startsWith('.')) {
    fail(res, 400, '名称不能为空或以点开头');
    return;
  }
  if (existsSync(abs)) {
    fail(res, 409, '同名文件或文件夹已存在');
    return;
  }
  try {
    if (parsed.data.type === 'folder') {
      mkdirSync(abs);
    } else {
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, '', 'utf8');
    }
  } catch {
    fail(res, 500, '创建失败（权限不足）');
    return;
  }
  writeAudit({ userId: req.user!.id, action: 'fs.create', target: rel, detail: { type: parsed.data.type, dirId: id.data }, ip: req.ip ?? undefined });
  broadcastFsChanged(id.data);
  res.json({ ok: true, data: null });
});

const renameSchema = z.object({
  dirId: z.coerce.number().int().positive(),
  oldPath: z.string().trim().min(1),
  newPath: z.string().trim().min(1)
});

/** 重命名 / 移动 */
myFsRouter.put('/rename', (req, res) => {
  const parsed = renameSchema.safeParse(req.body);
  if (!parsed.success) {
    fail(res, 400, parsed.error.issues[0]?.message ?? '参数错误');
    return;
  }
  const dir = getActiveDir(parsed.data.dirId);
  if (!dir || !dir.isActive) {
    fail(res, 404, '共享目录不存在');
    return;
  }
  const denied = checkPermission(req.user!.id, parsed.data.dirId, 'rw');
  if (denied) {
    fail(res, 403, denied);
    return;
  }
  const root = resolve(dir.path);
  const valid = (p: string): string | null => {
    if (!p || p.startsWith('/') || p.split('/').filter(Boolean).includes('..')) return null;
    const abs = resolve(root, p);
    return abs.startsWith(root + '/') ? abs : null;
  };
  const from = valid(parsed.data.oldPath);
  const to = valid(parsed.data.newPath);
  if (!from || !to || from === root || to === root) {
    fail(res, 400, '路径不合法');
    return;
  }
  if (!existsSync(from)) {
    fail(res, 404, '源不存在');
    return;
  }
  if (existsSync(to)) {
    fail(res, 409, '目标已存在');
    return;
  }
  try {
    mkdirSync(dirname(to), { recursive: true });
    renameSync(from, to);
  } catch {
    fail(res, 500, '重命名失败');
    return;
  }
  writeAudit({ userId: req.user!.id, action: 'fs.rename', target: parsed.data.oldPath, detail: { to: parsed.data.newPath, dirId: parsed.data.dirId }, ip: req.ip ?? undefined });
  broadcastFsChanged(parsed.data.dirId);
  res.json({ ok: true, data: null });
});

const deleteSchema = z.object({
  dirId: z.coerce.number().int().positive(),
  path: z.string().trim().min(1)
});

/** 删除文件 / 文件夹（递归） */
myFsRouter.delete('/', (req, res) => {
  const body = req.body ?? {};
  const parsed = deleteSchema.safeParse(req.method === 'DELETE' && Object.keys(body).length > 0 ? body : req.query);
  if (!parsed.success) {
    fail(res, 400, parsed.error.issues[0]?.message ?? '参数错误');
    return;
  }
  const dir = getActiveDir(parsed.data.dirId);
  if (!dir || !dir.isActive) {
    fail(res, 404, '共享目录不存在');
    return;
  }
  const denied = checkPermission(req.user!.id, parsed.data.dirId, 'rw');
  if (denied) {
    fail(res, 403, denied);
    return;
  }
  const root = resolve(dir.path);
  if (!parsed.data.path || parsed.data.path.startsWith('/') || parsed.data.path.split('/').filter(Boolean).includes('..')) {
    fail(res, 400, '路径不合法');
    return;
  }
  const abs = resolve(root, parsed.data.path);
  if (!abs.startsWith(root + '/')) {
    fail(res, 400, '路径不合法');
    return;
  }
  if (!existsSync(abs)) {
    fail(res, 404, '目标不存在');
    return;
  }
  try {
    rmSync(abs, { recursive: true });
  } catch {
    fail(res, 500, '删除失败');
    return;
  }
  writeAudit({ userId: req.user!.id, action: 'fs.delete', target: parsed.data.path, detail: { dirId: parsed.data.dirId }, ip: req.ip ?? undefined });
  broadcastFsChanged(parsed.data.dirId);
  res.json({ ok: true, data: null });
});

/** 上传（覆盖同名） */
myFsRouter.post('/upload', upload.single('file'), (req, res) => {
  const file = req.file;
  const dirId = Number(req.body.dirId);
  const relPath = String(req.body.path ?? '');
  if (!file) {
    fail(res, 400, '未收到文件');
    return;
  }
  const id = idSchema.safeParse(dirId);
  if (!id.success) {
    fail(res, 400, '无效的目录 ID');
    return;
  }
  const dir = getActiveDir(id.data);
  if (!dir || !dir.isActive) {
    fail(res, 404, '共享目录不存在');
    return;
  }
  const denied = checkPermission(req.user!.id, id.data, 'rw');
  if (denied) {
    fail(res, 403, denied);
    return;
  }
  if (relPath.startsWith('/') || relPath.split('/').filter(Boolean).includes('..')) {
    fail(res, 400, '路径不合法');
    return;
  }
  const root = resolve(dir.path);
  const abs = resolve(root, relPath, file.originalname);
  if (!abs.startsWith(root + '/')) {
    fail(res, 400, '路径不合法');
    return;
  }
  try {
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, file.buffer);
  } catch {
    fail(res, 500, '保存失败（权限不足）');
    return;
  }
  writeAudit({ userId: req.user!.id, action: 'fs.upload', target: join(relPath, file.originalname), detail: { size: file.size, dirId: id.data }, ip: req.ip ?? undefined });
  broadcastFsChanged(id.data);
  res.json({ ok: true, data: { path: join(relPath, file.originalname), size: file.size } });
});

/** 下载文件（只读即可） */
myFsRouter.get('/download', withPath('ro', (req) => String(req.query.path ?? '')), (req, res) => {
  const { abs } = res.locals.dir as { abs: string };
  if (!existsSync(abs) || !statSync(abs).isFile()) {
    fail(res, 404, '文件不存在');
    return;
  }
  res.download(abs);
});

/** 目录打包 zip 下载（只读即可） */
myFsRouter.get('/download-zip', withPath('ro', (req) => String(req.query.path ?? '')), (req, res) => {
  const { abs, relPath } = res.locals.dir as { abs: string; relPath: string };
  if (!existsSync(abs) || !statSync(abs).isDirectory()) {
    fail(res, 404, '目录不存在');
    return;
  }
  const zipName = `${basename(abs) || 'workspace'}.zip`;
  res.setHeader('content-type', 'application/zip');
  res.setHeader('content-disposition', `attachment; filename="${encodeURIComponent(zipName)}"`);
  const archive = new ZipArchive({ zlib: { level: 6 } });
  archive.on('error', () => {
    res.destroy();
  });
  archive.pipe(res);
  archive.directory(abs, relPath === '' ? false : basename(abs));
  void archive.finalize();
});
