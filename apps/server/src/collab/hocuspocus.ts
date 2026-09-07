import { Hocuspocus } from '@hocuspocus/server';
import { eq } from 'drizzle-orm';
import * as Y from 'yjs';
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { db } from '../db/client.js';
import { directories } from '../db/schema.js';
import { logger } from '../lib/logger.js';
import { effectivePermissionFor } from '../lib/permissions.js';
import { getUserFromCookie } from '../lib/session-cookie.js';

/** 协作编辑允许打开的最大文件体积 */
const MAX_EDIT_SIZE = 2 * 1024 * 1024;

export interface DocRef {
  directoryId: number;
  relPath: string;
  absPath: string;
}

/**
 * 文档名格式：d<directoryId>:<相对路径>
 * 解析并做安全校验（拒绝 ..、绝对路径与越出共享目录根的路径）
 */
export function parseDocName(documentName: string): DocRef | null {
  const m = /^d(\d+):(.+)$/.exec(documentName);
  if (!m) return null;
  const directoryId = Number(m[1]);
  const relPath = m[2];
  if (!Number.isInteger(directoryId) || !relPath || relPath.startsWith('/') || relPath.split('/').includes('..')) {
    return null;
  }
  const dir = db.select().from(directories).where(eq(directories.id, directoryId)).get();
  if (!dir || !dir.isActive) return null;
  const absPath = resolve(dir.path, relPath);
  if (absPath !== dir.path && !absPath.startsWith(resolve(dir.path) + '/')) return null;
  return { directoryId, relPath, absPath };
}

/** 简单二进制启发：前 8KB 出现空字节视为二进制 */
function looksBinary(buf: Buffer): boolean {
  const n = Math.min(buf.length, 8000);
  for (let i = 0; i < n; i++) {
    if (buf[i] === 0) return true;
  }
  return false;
}

/** 原子写盘（tmp + rename），供 onStoreDocument / 强制保存共用 */
function writeDocToDisk(ref: DocRef, doc: Y.Doc): void {
  const content = doc.getText('content').toString();
  mkdirSync(dirname(ref.absPath), { recursive: true });
  const tmp = `${ref.absPath}.pc-tmp-${process.pid}`;
  writeFileSync(tmp, content, 'utf8');
  renameSync(tmp, ref.absPath);
  logger.debug({ path: ref.absPath, bytes: Buffer.byteLength(content) }, '协作文档已写盘');
}

export const hocuspocus = new Hocuspocus({
  debounce: 1000,
  maxDebounce: 5000,

  async onAuthenticate({ documentName, requestHeaders, connectionConfig }) {
    const user = getUserFromCookie(requestHeaders.get('cookie') ?? undefined);
    if (!user) {
      throw new Error('未登录或会话已过期');
    }
    const ref = parseDocName(documentName);
    if (!ref) {
      throw new Error('无效的文档标识');
    }
    const perm = effectivePermissionFor(user.id, ref.directoryId);
    if (perm === 'none' || perm === 'deny') {
      throw new Error('对该目录没有访问权限');
    }
    // 只读连接：其变更会被服务器拒绝，仅同步他人内容
    connectionConfig.readOnly = perm !== 'rw' && perm !== 'admin';
    logger.debug({ user: user.username, doc: documentName, readOnly: connectionConfig.readOnly }, '协作连接已鉴权');
    return { userId: user.id, username: user.username };
  },

  async onLoadDocument({ documentName }) {
    const doc = new Y.Doc();
    const ref = parseDocName(documentName);
    if (ref && existsSync(ref.absPath) && statSync(ref.absPath).isFile()) {
      const stat = statSync(ref.absPath);
      if (stat.size > MAX_EDIT_SIZE) {
        throw new Error('文件超过 2MB，不支持协作编辑，请下载后查看');
      }
      const buf = readFileSync(ref.absPath);
      if (looksBinary(buf)) {
        throw new Error('二进制文件不支持协作编辑');
      }
      doc.getText('content').insert(0, buf.toString('utf8'));
    }
    return doc;
  },

  async onStoreDocument({ documentName, document }) {
    const ref = parseDocName(documentName);
    if (!ref) return;
    writeDocToDisk(ref, document);
  },

  /** 客户端 Ctrl+S / 保存按钮：立即写盘并回执 */
  async onStateless({ connection, payload }) {
    try {
      const msg = JSON.parse(payload) as { type?: string };
      if (msg.type !== 'force-store') return;
      const doc = connection.document;
      const ref = parseDocName(doc.name);
      if (!ref) return;
      writeDocToDisk(ref, doc);
      connection.sendStateless(JSON.stringify({ type: 'stored', at: Date.now() }));
    } catch (e) {
      logger.warn({ err: e }, '强制保存失败');
      connection.sendStateless(JSON.stringify({ type: 'store-failed' }));
    }
  }
});
