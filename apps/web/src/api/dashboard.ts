import { api } from './client';

// ---------- 仪表盘布局 ----------

export interface WidgetLayoutItem {
  type: string;
  config?: Record<string, unknown>;
}

export function getDashboardLayout(): Promise<{ layout: WidgetLayoutItem[] | null }> {
  return api('/api/my/dashboard');
}

export function saveDashboardLayout(layout: WidgetLayoutItem[]): Promise<null> {
  return api('/api/my/dashboard', { method: 'PUT', body: { layout } });
}

// ---------- 公告 ----------

export interface AnnouncementInfo {
  id: number;
  title: string;
  content: string;
  updatedAt: string;
  creator: string | null;
}

export function getAnnouncement(): Promise<{ announcement: AnnouncementInfo | null; read: boolean }> {
  return api('/api/my/announcement');
}

export function markAnnouncementRead(): Promise<null> {
  return api('/api/my/announcement/read', { method: 'POST', body: {} });
}

export function upsertAnnouncement(data: { title: string; content: string }): Promise<{ id: number }> {
  return api('/api/admin/announcement', { method: 'PUT', body: data });
}

export function deleteAnnouncement(): Promise<null> {
  return api('/api/admin/announcement', { method: 'DELETE' });
}

export function getAnnouncementStats(): Promise<{ total: number; readCount: number; unread: Array<{ id: number; username: string }> }> {
  return api('/api/admin/announcement/stats');
}

export function remindAnnouncement(): Promise<{ reminded: number }> {
  return api('/api/admin/announcement/remind', { method: 'POST', body: {} });
}

// ---------- 倒数日 ----------

export interface CountdownItem {
  id: number;
  scope: 'user' | 'global';
  title: string;
  targetDate: string;
  createdAt: string;
}

export function getCountdowns(): Promise<{ mine: CountdownItem[]; global: CountdownItem[] }> {
  return api('/api/my/countdowns');
}

export function createCountdown(title: string, targetDate: number): Promise<{ countdown: CountdownItem }> {
  return api('/api/my/countdowns', { body: { title, targetDate } });
}

export function deleteCountdown(id: number): Promise<null> {
  return api(`/api/my/countdowns/${id}`, { method: 'DELETE' });
}

export function getGlobalCountdowns(): Promise<{ items: CountdownItem[] }> {
  return api('/api/admin/plans/countdowns');
}

export function createGlobalCountdown(title: string, targetDate: number): Promise<{ countdown: CountdownItem }> {
  return api('/api/admin/plans/countdowns', { body: { title, targetDate } });
}

export function deleteGlobalCountdown(id: number): Promise<null> {
  return api(`/api/admin/plans/countdowns/${id}`, { method: 'DELETE' });
}

// ---------- TODO ----------

export interface TodoItem {
  id: number;
  scope: 'user' | 'global';
  title: string;
  done: boolean;
  createdAt: string;
  doneAt: string | null;
}

export function getTodos(): Promise<{ mine: TodoItem[]; global: TodoItem[] }> {
  return api('/api/my/todos');
}

export function createTodo(title: string): Promise<{ todo: TodoItem }> {
  return api('/api/my/todos', { body: { title } });
}

export function updateTodo(id: number, data: { title?: string; done?: boolean }): Promise<null> {
  return api(`/api/my/todos/${id}`, { method: 'PUT', body: data });
}

export function deleteTodo(id: number): Promise<null> {
  return api(`/api/my/todos/${id}`, { method: 'DELETE' });
}

export function getGlobalTodos(): Promise<{ items: TodoItem[] }> {
  return api('/api/admin/plans/todos');
}

export function createGlobalTodo(title: string): Promise<{ todo: TodoItem }> {
  return api('/api/admin/plans/todos', { body: { title } });
}

export function updateGlobalTodo(id: number, data: { title?: string; done?: boolean }): Promise<null> {
  return api(`/api/admin/plans/todos/${id}`, { method: 'PUT', body: data });
}

export function deleteGlobalTodo(id: number): Promise<null> {
  return api(`/api/admin/plans/todos/${id}`, { method: 'DELETE' });
}

// ---------- 统计 ----------

export interface DirStatsInfo {
  id: number;
  name: string;
  files: number;
  bytes: number;
  lines: number;
  editors?: Array<{ userId: number; username: string }>;
}

export function getDirStats(dirId: number): Promise<DirStatsInfo> {
  return api(`/api/my/stats/dir?dirId=${dirId}`);
}

export function getOverviewStats(): Promise<{
  dirs: Array<DirStatsInfo & { editors: number }>;
  totals: { files: number; bytes: number; lines: number };
}> {
  return api('/api/my/stats/overview');
}

// ---------- 贡献图 / 最近动态 ----------

export function getContributions(): Promise<{ days: Array<{ date: string; count: number }> }> {
  return api('/api/my/contributions');
}

export interface RecentAction {
  id: number;
  action: string;
  target: string | null;
  createdAt: string;
  username: string | null;
}

export function getRecentActions(): Promise<{ items: RecentAction[]; scope: 'all' | 'self' }> {
  return api('/api/my/recent-actions');
}
