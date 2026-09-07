import { api } from './client';

export interface UserRow {
  id: number;
  username: string;
  role: 'admin' | 'user';
  status: 'active' | 'disabled';
  roleId: number | null;
  roleName: string | null;
  avatarExt: string | null;
  avatarVersion: number | null;
  online: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserListParams {
  page: number;
  pageSize: number;
  q?: string;
  role?: 'admin' | 'user';
  status?: 'active' | 'disabled';
  sortBy?: 'username' | 'role' | 'status' | 'createdAt';
  order?: 'asc' | 'desc';
}

export interface PagedData<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AuditRow {
  id: number;
  username: string | null;
  action: string;
  target: string | null;
  detail: string | null;
  ip: string | null;
  createdAt: string;
}

function buildQuery(params: Record<string, string | number | undefined>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') qs.set(key, String(value));
  }
  return qs.toString();
}

export function listUsers(params: UserListParams): Promise<PagedData<UserRow>> {
  return api(`/api/admin/users?${buildQuery({ ...params })}`);
}

export function createUser(data: {
  username: string;
  password: string;
  role: 'admin' | 'user';
  status: 'active' | 'disabled';
  roleId?: number | null;
}): Promise<{ user: UserRow }> {
  return api('/api/admin/users', { body: data });
}

export function updateUser(
  id: number,
  data: { password?: string; role?: 'admin' | 'user'; status?: 'active' | 'disabled'; roleId?: number | null }
): Promise<{ user: UserRow }> {
  return api(`/api/admin/users/${id}`, { method: 'PUT', body: data });
}

export function deleteUser(id: number): Promise<null> {
  return api(`/api/admin/users/${id}`, { method: 'DELETE' });
}

export function listAuditLogs(params: {
  page: number;
  pageSize: number;
  q?: string;
  action?: string;
}): Promise<PagedData<AuditRow>> {
  return api(`/api/admin/audit-logs?${buildQuery({ ...params })}`);
}

// ---------- 目录管理（M4） ----------

export interface DirectoryRow {
  id: number;
  name: string;
  path: string;
  isActive: boolean;
  visibleToAll: boolean;
  visibleCount: number;
  createdAt: string;
}

export interface DirectoryDetail {
  directory: DirectoryRow;
  visibleUserIds: number[];
}

export interface DirectoryStats {
  path: string;
  sizeBytes: number;
  fileCount: number;
}

export function getAdminMeta(): Promise<{ workspacesRoot: string }> {
  return api('/api/admin/directories/meta');
}

export function listDirectories(params: {
  page: number;
  pageSize: number;
  q?: string;
}): Promise<PagedData<DirectoryRow>> {
  return api(`/api/admin/directories?${buildQuery({ ...params })}`);
}

export function getDirectoryDetail(id: number): Promise<DirectoryDetail> {
  return api(`/api/admin/directories/${id}`);
}

export function createDirectory(data: {
  name: string;
  path: string;
  requireExisting: boolean;
  visibleToAll: boolean;
  visibleUserIds: number[];
}): Promise<{ directory: DirectoryRow }> {
  return api('/api/admin/directories', { body: data });
}

export function updateDirectory(
  id: number,
  data: { name?: string; visibleToAll?: boolean; visibleUserIds?: number[] }
): Promise<{ directory: DirectoryRow }> {
  return api(`/api/admin/directories/${id}`, { method: 'PUT', body: data });
}

export function deleteDirectory(id: number): Promise<null> {
  return api(`/api/admin/directories/${id}`, { method: 'DELETE' });
}

export function directoryStats(id: number): Promise<DirectoryStats> {
  return api(`/api/admin/directories/${id}/stats`);
}

// ---------- 权限矩阵（M3） ----------

export interface MatrixUser {
  id: number;
  username: string;
  role: 'admin' | 'user';
  status: 'active' | 'disabled';
  roleId: number | null;
}

export interface MatrixDirectory {
  id: number;
  name: string;
  visibleToAll: boolean;
}

export interface MatrixRole {
  id: number;
  name: string;
  workspaceMode: 'all' | 'selected';
  workspaceLevel: 'rw' | 'ro';
  workspaceDirIds: number[];
}

export interface MatrixGroup {
  id: number;
  name: string;
}

export interface MatrixEntry {
  directoryId: number;
  subjectType: 'user' | 'group';
  subjectId: number;
  mode: 'ro' | 'rw' | 'deny';
}

export interface MatrixMembership {
  groupId: number;
  userId: number;
}

export interface PermissionMatrix {
  users: MatrixUser[];
  directories: MatrixDirectory[];
  groups: MatrixGroup[];
  roles: MatrixRole[];
  memberships: MatrixMembership[];
  entries: MatrixEntry[];
}

export function getPermissionMatrix(): Promise<PermissionMatrix> {
  return api('/api/admin/permissions/matrix');
}

export function setPermission(data: {
  directoryId: number;
  subjectType: 'user' | 'group';
  subjectId: number;
  mode: 'ro' | 'rw' | 'deny' | 'none';
}): Promise<null> {
  return api('/api/admin/permissions/set', { method: 'PUT', body: data });
}

// ---------- 用户组（M3-3） ----------

export interface GroupRow {
  id: number;
  name: string;
  createdAt: string;
  memberCount: number;
}

export function listGroups(): Promise<{ items: GroupRow[] }> {
  return api('/api/admin/groups');
}

export function getGroupDetail(id: number): Promise<{ group: GroupRow; memberIds: number[] }> {
  return api(`/api/admin/groups/${id}`);
}

export function createGroup(data: { name: string; memberIds: number[] }): Promise<{ group: { id: number } }> {
  return api('/api/admin/groups', { body: data });
}

export function updateGroup(id: number, data: { name?: string; memberIds?: number[] }): Promise<null> {
  return api(`/api/admin/groups/${id}`, { method: 'PUT', body: data });
}

export function deleteGroup(id: number): Promise<null> {
  return api(`/api/admin/groups/${id}`, { method: 'DELETE' });
}

// ---------- 权限组（角色模板） ----------

export interface RoleRow {
  id: number;
  name: string;
  canManageUsers: boolean;
  canManageDirectories: boolean;
  canViewAudit: boolean;
  workspaceMode: 'all' | 'selected';
  workspaceLevel: 'rw' | 'ro';
  workspaceDirIds: number[];
  createdAt: string;
  memberCount: number;
}

export function listRoles(): Promise<{ items: RoleRow[] }> {
  return api('/api/admin/roles');
}

export function getRoleDetail(id: number): Promise<{ role: RoleRow }> {
  return api(`/api/admin/roles/${id}`);
}

export function createRole(data: {
  name: string;
  canManageUsers: boolean;
  canManageDirectories: boolean;
  canViewAudit: boolean;
  workspaceMode: 'all' | 'selected';
  workspaceLevel: 'rw' | 'ro';
  workspaceDirIds: number[];
}): Promise<{ role: RoleRow }> {
  return api('/api/admin/roles', { body: data });
}

export function updateRole(
  id: number,
  data: Partial<{
    name: string;
    canManageUsers: boolean;
    canManageDirectories: boolean;
    canViewAudit: boolean;
    workspaceMode: 'all' | 'selected';
    workspaceLevel: 'rw' | 'ro';
    workspaceDirIds: number[];
  }>
): Promise<null> {
  return api(`/api/admin/roles/${id}`, { method: 'PUT', body: data });
}

export function deleteRole(id: number): Promise<null> {
  return api(`/api/admin/roles/${id}`, { method: 'DELETE' });
}

// ---------- 目录浏览（工作区根内） ----------

export interface DirListing {
  path: string;
  parent: string | null;
  isRoot: boolean;
  folders: string[];
}

export function listServerDirs(path?: string): Promise<DirListing> {
  const qs = path ? `?path=${encodeURIComponent(path)}` : '';
  return api(`/api/admin/fs/dirs${qs}`);
}

export function mkdirServer(parent: string, name: string): Promise<{ path: string }> {
  return api('/api/admin/fs/mkdir', { body: { parent, name } });
}
