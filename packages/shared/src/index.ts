export type UserRole = 'admin' | 'user';

export type UserStatus = 'active' | 'disabled';

/** 目录权限模式（M3）：只读 / 读写 / 禁止 */
export type PermissionMode = 'ro' | 'rw' | 'deny';

/** 矩阵单元格的有效权限：admin 表示管理员天然全权；none 表示未授权 */
export type EffectivePermission = PermissionMode | 'none' | 'admin';

/** 权限组的管理能力位 */
export interface RoleCaps {
  canManageUsers: boolean;
  canManageDirectories: boolean;
  canViewAudit: boolean;
  canManageAnnouncements: boolean;
  canManageGlobalPlans: boolean;
}

/** 登录/会话中暴露给前端的用户信息（不含敏感字段） */
export interface UserInfo {
  id: number;
  username: string;
  role: UserRole;
  status: UserStatus;
  /** 关联的权限组 */
  roleId?: number | null;
  roleName?: string | null;
  /** 管理能力（管理员恒为全 true） */
  caps?: RoleCaps;
  /** 自定义头像（有值即可用 /api/avatars/:id 加载） */
  avatarExt?: string | null;
  avatarVersion?: number | null;
}

/** 统一 API 响应封装 */
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string };

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  user: UserInfo;
}

export interface ChangePasswordRequest {
  oldPassword: string;
  newPassword: string;
}

export interface HealthInfo {
  name: string;
  uptimeSec: number;
  now: string;
}

/**
 * 计算用户对某目录的有效权限（M3-1/M3-5 规则）：
 * 1. 管理员天然读写（返回 'admin'）；
 * 2. 用户级条目最高（含 deny，显式禁止优先于一切授权）；
 * 3. 其次是权限组授予的工作区级别；
 * 4. 再次是组级条目（同级多条 deny > rw > ro）；
 * 5. 无任何条目 → 'none'（未授权）。
 */
export function computeEffectivePermission(input: {
  role: UserRole;
  userEntry?: PermissionMode | null;
  roleGrant?: PermissionMode | null;
  groupEntries?: PermissionMode[];
}): EffectivePermission {
  if (input.role === 'admin') return 'admin';
  if (input.userEntry) return input.userEntry;
  if (input.roleGrant) return input.roleGrant;
  const groupEntries = input.groupEntries ?? [];
  if (groupEntries.includes('deny')) return 'deny';
  if (groupEntries.includes('rw')) return 'rw';
  if (groupEntries.includes('ro')) return 'ro';
  return 'none';
}

/** 有效权限的中文标签 */
export function permissionLabel(mode: EffectivePermission): string {
  switch (mode) {
    case 'admin':
      return '管理员';
    case 'rw':
      return '读写';
    case 'ro':
      return '只读';
    case 'deny':
      return '禁止';
    default:
      return '无权限';
  }
}
