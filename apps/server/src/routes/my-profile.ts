import { eq } from 'drizzle-orm';
import { Router } from 'express';
import multer from 'multer';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { config } from '../config.js';
import { db } from '../db/client.js';
import { appSettings, roles, users } from '../db/schema.js';
import { getPresenceEntry } from '../presence.js';
import { writeAudit } from '../lib/audit.js';
import { requireAuth } from '../middleware/session.js';

export const myProfileRouter = Router();

const AVATAR_MAX_SIZE = 2 * 1024 * 1024;
const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: AVATAR_MAX_SIZE, files: 1 }
});

function avatarDir(): string {
  const dir = resolve(config.dataDir, 'avatars');
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** 通过魔数识别图片类型 */
function sniffImage(buf: Buffer): 'png' | 'jpg' | 'gif' | 'webp' | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return 'gif';
  if (buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return 'webp';
  return null;
}

/** 上传自己的头像（覆盖旧头像） */
myProfileRouter.post('/avatar', requireAuth, avatarUpload.single('file'), (req, res) => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ ok: false, error: '未收到文件' });
    return;
  }
  const kind = sniffImage(file.buffer);
  if (!kind) {
    res.status(400).json({ ok: false, error: '仅支持 PNG / JPG / GIF / WebP 图片' });
    return;
  }
  const userId = req.user!.id;
  const dir = avatarDir();
  // 清理旧头像
  for (const ext of ['png', 'jpg', 'gif', 'webp']) {
    const old = resolve(dir, `u${userId}.${ext}`);
    if (existsSync(old)) rmSync(old);
  }
  writeFileSync(resolve(dir, `u${userId}.${kind}`), file.buffer);
  const version = Date.now();
  db.update(users).set({ avatarExt: kind, avatarVersion: version }).where(eq(users.id, userId)).run();
  writeAudit({ userId, action: 'profile.avatar.upload', detail: { ext: kind, size: file.size }, ip: req.ip ?? undefined });
  res.json({ ok: true, data: { avatarExt: kind, avatarVersion: version } });
});

/** 用户主页信息（登录用户可查） */
myProfileRouter.get('/users/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ ok: false, error: '无效的用户 ID' });
    return;
  }
  const user = db.select().from(users).where(eq(users.id, id)).get();
  if (!user) {
    res.status(404).json({ ok: false, error: '用户不存在' });
    return;
  }
  const roleName = user.roleId
    ? db.select({ name: roles.name }).from(roles).where(eq(roles.id, user.roleId)).get()?.name ?? null
    : null;
  const presence = getPresenceEntry(id);
  res.json({
    ok: true,
    data: {
      id: user.id,
      username: user.username,
      role: user.role,
      roleName,
      avatarExt: user.avatarExt ?? null,
      avatarVersion: user.avatarVersion ?? null,
      online: !!presence,
      currentDoc: presence?.currentDoc ?? null,
      createdAt: user.createdAt
    }
  });
});

/** 通讯录可见性（默认公开） */
export function contactsPublic(): boolean {
  const row = db.select().from(appSettings).where(eq(appSettings.key, 'contactsPublic')).get();
  return row ? row.value === 'true' : true;
}

/** 通讯录：全部用户 + 在线状态（受可见性设置约束） */
myProfileRouter.get('/contacts', requireAuth, (req, res) => {
  if (!contactsPublic() && req.user!.role !== 'admin' && !req.user!.caps?.canManageUsers) {
    res.status(403).json({ ok: false, error: '通讯录仅管理员及授权人员可见' });
    return;
  }
  const rows = db
    .select({
      id: users.id,
      username: users.username,
      role: users.role,
      status: users.status,
      avatarExt: users.avatarExt,
      avatarVersion: users.avatarVersion,
      roleName: roles.name
    })
    .from(users)
    .leftJoin(roles, eq(roles.id, users.roleId))
    .all();
  const items = rows.map((u) => {
    const presence = getPresenceEntry(u.id);
    return {
      ...u,
      online: !!presence,
      currentDoc: presence?.currentDoc ?? null
    };
  });
  res.json({ ok: true, data: { items } });
});

const settingsSchema = z.object({
  contactsPublic: z.boolean().optional()
});

/** 读取设置（管理员/授权人员） */
myProfileRouter.get('/settings', requireAuth, (req, res) => {
  if (req.user!.role !== 'admin' && !req.user!.caps?.canManageUsers) {
    res.status(403).json({ ok: false, error: '缺少权限：管理用户/用户组' });
    return;
  }
  res.json({ ok: true, data: { contactsPublic: contactsPublic() } });
});

/** 更新设置（管理员/授权人员） */
myProfileRouter.put('/settings', requireAuth, (req, res) => {
  if (req.user!.role !== 'admin' && !req.user!.caps?.canManageUsers) {
    res.status(403).json({ ok: false, error: '缺少权限：管理用户/用户组' });
    return;
  }
  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: '参数错误' });
    return;
  }
  if (parsed.data.contactsPublic !== undefined) {
    const existing = db.select().from(appSettings).where(eq(appSettings.key, 'contactsPublic')).get();
    if (existing) {
      db.update(appSettings).set({ value: String(parsed.data.contactsPublic), updatedAt: new Date() }).where(eq(appSettings.key, 'contactsPublic')).run();
    } else {
      db.insert(appSettings).values({ key: 'contactsPublic', value: String(parsed.data.contactsPublic) }).run();
    }
    writeAudit({
      userId: req.user!.id,
      action: 'admin.settings.update',
      target: 'contactsPublic',
      detail: { value: parsed.data.contactsPublic },
      ip: req.ip ?? undefined
    });
  }
  res.json({ ok: true, data: { contactsPublic: contactsPublic() } });
});

// 头像文件读取辅助（供 app 级 /api/avatars/:id 路由使用）
export function readAvatarFile(id: number): { buf: Buffer; ext: string; version: number | null } | null {
  const user = db.select({ avatarExt: users.avatarExt, avatarVersion: users.avatarVersion }).from(users).where(eq(users.id, id)).get();
  if (!user?.avatarExt) return null;
  const file = resolve(avatarDir(), `u${id}.${user.avatarExt}`);
  if (!existsSync(file)) return null;
  return { buf: readFileSync(file), ext: user.avatarExt, version: user.avatarVersion };
}
