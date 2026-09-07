import { api } from './client';

export interface MyFileEntry {
  name: string;
  type: 'file' | 'folder';
  size: number;
  mtime: number;
}

export interface FsListResult {
  path: string;
  items: MyFileEntry[];
}

export interface FsStat {
  exists: boolean;
  isFile: boolean;
  size: number;
  binary: boolean;
  editable: boolean;
  reason: string | null;
}

/** 目录内容列表（懒加载单层） */
export function listDir(dirId: number, path = ''): Promise<FsListResult> {
  return api(`/api/my/fs/list?dirId=${dirId}&path=${encodeURIComponent(path)}`);
}

/** 文件预检（能否进协作编辑器） */
export function statFile(dirId: number, path: string): Promise<FsStat> {
  return api(`/api/my/fs/stat?dirId=${dirId}&path=${encodeURIComponent(path)}`);
}

/** 新建文件 / 文件夹 */
export function createEntry(dirId: number, path: string, type: 'file' | 'folder'): Promise<null> {
  return api('/api/my/fs/file', { body: { dirId, path, type } });
}

/** 重命名 / 移动 */
export function renameEntry(dirId: number, oldPath: string, newPath: string): Promise<null> {
  return api('/api/my/fs/rename', { method: 'PUT', body: { dirId, oldPath, newPath } });
}

/** 删除文件 / 文件夹（递归） */
export function deleteEntry(dirId: number, path: string): Promise<null> {
  return api('/api/my/fs', { method: 'DELETE', body: { dirId, path } });
}

/** 上传文件（覆盖同名） */
export async function uploadFile(dirId: number, path: string, file: File): Promise<{ path: string; size: number }> {
  const form = new FormData();
  form.set('dirId', String(dirId));
  form.set('path', path);
  form.set('file', file);
  const res = await fetch('/api/my/fs/upload', { method: 'POST', body: form, credentials: 'same-origin' });
  const payload = (await res.json().catch(() => null)) as { ok?: boolean; data?: { path: string; size: number }; error?: string } | null;
  if (!res.ok || !payload?.ok) {
    throw new Error(payload?.error ?? `上传失败（HTTP ${res.status}）`);
  }
  return payload.data!;
}

/** 文件下载地址 */
export function downloadUrl(dirId: number, path: string): string {
  return `/api/my/fs/download?dirId=${dirId}&path=${encodeURIComponent(path)}`;
}

/** 目录 zip 下载地址 */
export function zipUrl(dirId: number, path = ''): string {
  return `/api/my/fs/download-zip?dirId=${dirId}&path=${encodeURIComponent(path)}`;
}
