// 全局在线状态：登录期间保持一条 socket.io 连接（App.vue 挂载后初始化）
// “在线”= 正在使用平台（任意页面），与是否进入工作区无关
import { ref } from 'vue';
import { io, type Socket } from 'socket.io-client';
import { handleKicked } from '@/api/client';

export interface PresenceEntry {
  userId: number;
  username: string;
  roleName: string | null;
  isAdmin: boolean;
  avatarExt: string | null;
  avatarVersion: number | null;
  currentDoc: { dirId: number; dirName: string; path: string; name: string } | null;
}

const list = ref<PresenceEntry[]>([]);
let socket: Socket | null = null;
const fsListeners = new Set<(payload: { directoryId: number }) => void>();
/** 公告提醒时间戳（收到推送时更新，卡片据此播放抖动动画） */
export const announceRemindAt = ref(0);

export function initPresenceSocket(): void {
  if (socket) return;
  socket = io({ path: '/socket.io', withCredentials: true });
  socket.on('presence:state', (l: PresenceEntry[]) => {
    list.value = l;
  });
  socket.on('fs:changed', (payload: { directoryId: number }) => {
    fsListeners.forEach((fn) => fn(payload));
  });
  socket.on('session:invalid', () => {
    handleKicked();
  });
  socket.on('announcement:remind', () => {
    announceRemindAt.value = Date.now();
  });
}

export function destroyPresenceSocket(): void {
  socket?.disconnect();
  socket = null;
  list.value = [];
}

export function usePresence() {
  return { list };
}

export function emitEditing(doc: { dirId: number; dirName: string; path: string; name: string } | null): void {
  socket?.emit('presence:editing', doc);
}

export function onFsChanged(fn: (payload: { directoryId: number }) => void): void {
  fsListeners.add(fn);
}

export function offFsChanged(fn: (payload: { directoryId: number }) => void): void {
  fsListeners.delete(fn);
}
