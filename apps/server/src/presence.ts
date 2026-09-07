import type { Server as HttpServer } from 'node:http';
import { Server as SocketIOServer, type Socket } from 'socket.io';
import { db } from './db/client.js';
import { roles, sessions, users } from './db/schema.js';
import { and, eq, gt } from 'drizzle-orm';
import { logger } from './lib/logger.js';
import { getSessionFromCookie } from './lib/session-cookie.js';

export interface PresenceEntry {
  userId: number;
  username: string;
  roleName: string | null;
  isAdmin: boolean;
  /** 自定义头像信息（供前端拼 URL） */
  avatarExt: string | null;
  avatarVersion: number | null;
  /** 当前正在编辑的文件展示名（如 目录名/子路径/文件名），未编辑为 null */
  currentDoc: { dirId: number; dirName: string; path: string; name: string } | null;
}

const socketsByUser = new Map<number, Set<string>>();
const entries = new Map<number, PresenceEntry>();

export function getPresenceEntry(userId: number): PresenceEntry | null {
  return entries.get(userId) ?? null;
}

export function listPresence(): PresenceEntry[] {
  return [...entries.values()];
}

/** 向指定在线用户的所有设备推送事件 */
export function emitToUser(userId: number, event: string, payload: unknown): void {
  const set = socketsByUser.get(userId);
  if (!set) return;
  for (const sid of set) {
    ioRef?.to(sid).emit(event, payload);
  }
}

function presenceList(): PresenceEntry[] {
  return [...entries.values()];
}

function removeSocket(socket: Socket): void {
  const userId = (socket.data as { presenceUserId?: number }).presenceUserId;
  if (userId === undefined) return;
  const set = socketsByUser.get(userId);
  if (!set) return;
  set.delete(socket.id);
  if (set.size === 0) {
    socketsByUser.delete(userId);
    entries.delete(userId);
  }
}

/** 在 HTTP 服务上挂载 Socket.IO（在线状态 + 文件树变更广播） */
export function initPresence(httpServer: HttpServer): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    path: '/socket.io',
    cors: { origin: true, credentials: true }
  });

  io.use((socket, next) => {
    const session = getSessionFromCookie(socket.handshake.headers.cookie);
    if (!session) {
      next(new Error('unauthorized'));
      return;
    }
    (socket.data as { presenceUserId?: number; presenceSessionId?: string }).presenceUserId = session.user.id;
    (socket.data as { presenceSessionId?: string }).presenceSessionId = session.sid;
    next();
  });

  io.on('connection', (socket) => {
    const userId = (socket.data as { presenceUserId?: number }).presenceUserId!;
    if (!entries.has(userId)) {
      const user = db.select().from(users).where(eq(users.id, userId)).get();
      const roleName = user?.roleId
        ? db.select({ name: roles.name }).from(roles).where(eq(roles.id, user.roleId)).get()?.name ?? null
        : null;
      entries.set(userId, {
        userId,
        username: user?.username ?? `#${userId}`,
        roleName,
        isAdmin: user?.role === 'admin',
        avatarExt: user?.avatarExt ?? null,
        avatarVersion: user?.avatarVersion ?? null,
        currentDoc: null
      });
    }
    const set = socketsByUser.get(userId) ?? new Set<string>();
    set.add(socket.id);
    socketsByUser.set(userId, set);
    io.emit('presence:state', presenceList());

    socket.on('presence:editing', (doc: unknown) => {
      const entry = entries.get(userId);
      if (!entry) return;
      const d = doc as { dirId?: unknown; dirName?: unknown; path?: unknown; name?: unknown } | null;
      entry.currentDoc =
        d && typeof d === 'object' && typeof d.dirId === 'number' && typeof d.path === 'string' && typeof d.name === 'string'
          ? { dirId: d.dirId, dirName: String(d.dirName ?? ''), path: d.path, name: d.name }
          : null;
      io.emit('presence:state', presenceList());
    });

    socket.on('disconnect', () => {
      removeSocket(socket);
      io.emit('presence:state', presenceList());
    });
  });

  logger.info('Socket.IO presence 已挂载');

  // 每 5 秒清扫：按 socket 记录的会话逐一校验，被顶替/过期/销毁的立即踢下线并通知该设备
  const sweep = setInterval(() => {
    for (const [, socket] of io.sockets.sockets) {
      const data = socket.data as { presenceUserId?: number; presenceSessionId?: string };
      const sid = data.presenceSessionId;
      if (!sid) continue;
      const session = db.select().from(sessions).where(eq(sessions.id, sid)).get();
      const ok = session && !session.replaced && session.expiresAt.getTime() > Date.now();
      if (ok) continue;
      socket.emit('session:invalid');
      socket.disconnect(true);
      removeSocket(socket);
      io.emit('presence:state', presenceList());
      logger.info({ socketId: socket.id }, '会话已失效，设备被踢下线');
    }
  }, 5000);
  sweep.unref();

  return io;
}

let ioRef: SocketIOServer | null = null;

/** 文件系统变更广播（供 my-fs 路由调用），收到后前端刷新对应目录的文件树 */
export function broadcastFsChanged(directoryId: number): void {
  ioRef?.emit('fs:changed', { directoryId });
}

export function bindIo(io: SocketIOServer): void {
  ioRef = io;
}
