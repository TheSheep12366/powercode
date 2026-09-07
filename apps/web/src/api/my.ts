import { api } from './client';

export interface MyDirectory {
  id: number;
  name: string;
  path: string;
  permission: 'ro' | 'rw' | 'deny' | 'none' | 'admin';
}

/** 当前用户可见的共享目录及有效权限（工作区文件树数据源） */
export function myDirectories(): Promise<{ items: MyDirectory[] }> {
  return api('/api/my/directories');
}

// ---------- 头像 ----------

export function avatarUrl(id: number, version?: number | null): string {
  return version ? `/api/avatars/${id}?v=${version}` : `/api/avatars/${id}`;
}

export async function uploadAvatar(file: File): Promise<{ avatarExt: string; avatarVersion: number }> {
  const form = new FormData();
  form.set('file', file);
  const res = await fetch('/api/my/avatar', { method: 'POST', body: form, credentials: 'same-origin' });
  const payload = (await res.json().catch(() => null)) as { ok?: boolean; data?: { avatarExt: string; avatarVersion: number }; error?: string } | null;
  if (!res.ok || !payload?.ok) {
    throw new Error(payload?.error ?? `上传失败（HTTP ${res.status}）`);
  }
  return payload.data!;
}

// ---------- 用户主页 / 通讯录 ----------

export interface UserHome {
  id: number;
  username: string;
  role: 'admin' | 'user';
  roleName: string | null;
  avatarExt: string | null;
  avatarVersion: number | null;
  online: boolean;
  currentDoc: { dirId: number; dirName: string; path: string; name: string } | null;
  createdAt: string;
}

export interface ContactUser {
  id: number;
  username: string;
  role: 'admin' | 'user';
  status: 'active' | 'disabled';
  avatarExt: string | null;
  avatarVersion: number | null;
  roleName: string | null;
  online: boolean;
  currentDoc: { dirId: number; dirName: string; path: string; name: string } | null;
}

export function getUserHome(id: number): Promise<UserHome> {
  return api(`/api/my/users/${id}`);
}

export function getContacts(): Promise<{ items: ContactUser[] }> {
  return api('/api/my/contacts');
}

export function getContactsSetting(): Promise<{ contactsPublic: boolean }> {
  return api('/api/my/settings');
}

export function updateContactsSetting(contactsPublic: boolean): Promise<{ contactsPublic: boolean }> {
  return api('/api/my/settings', { method: 'PUT', body: { contactsPublic } });
}
