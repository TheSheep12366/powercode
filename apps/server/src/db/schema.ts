import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

/** 权限组（角色模板）：管理能力位 + 工作区访问范围（M3-5/M2-6） */
export const roles = sqliteTable(
  'roles',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    canManageUsers: integer('can_manage_users', { mode: 'boolean' }).notNull().default(false),
    canManageDirectories: integer('can_manage_directories', { mode: 'boolean' }).notNull().default(false),
    canViewAudit: integer('can_view_audit', { mode: 'boolean' }).notNull().default(false),
    /** 管理公告（新增/修改/删除/一键提醒） */
    canManageAnnouncements: integer('can_manage_announcements', { mode: 'boolean' }).notNull().default(false),
    /** 管理全员计划（全员倒数日 / 全员 TODO） */
    canManageGlobalPlans: integer('can_manage_global_plans', { mode: 'boolean' }).notNull().default(false),
    /** 'all' = 全部工作区；'selected' = 仅 workspaceDirIds 中的目录 */
    workspaceMode: text('workspace_mode', { enum: ['all', 'selected'] }).notNull().default('all'),
    /** 授予的工作区访问级别 */
    workspaceLevel: text('workspace_level', { enum: ['rw', 'ro'] }).notNull().default('rw'),
    /** workspaceMode='selected' 时生效的目录 ID 列表（JSON 数组字符串） */
    workspaceDirIds: text('workspace_dir_ids').notNull().default('[]'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date())
  },
  (t) => [uniqueIndex('roles_name_uk').on(t.name)]
);

/** 平台用户（管理员/普通用户） */
export const users = sqliteTable(
  'users',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    username: text('username').notNull(),
    passwordHash: text('password_hash').notNull(),
    role: text('role', { enum: ['admin', 'user'] }).notNull().default('user'),
    status: text('status', { enum: ['active', 'disabled'] }).notNull().default('active'),
    /** 关联的权限组（普通用户可挂，管理员不受影响） */
    roleId: integer('role_id').references(() => roles.id, { onDelete: 'set null' }),
    /** 头像扩展名（png/jpg/gif/webp），空 = 无自定义头像 */
    avatarExt: text('avatar_ext'),
    /** 头像版本（缓存穿透 + 前端 URL 刷新） */
    avatarVersion: integer('avatar_version'),
    // M5 SSH 账户管理预留字段
    sshEnabled: integer('ssh_enabled', { mode: 'boolean' }).notNull().default(false),
    sshShell: text('ssh_shell'),
    sshHome: text('ssh_home'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date())
  },
  (t) => [uniqueIndex('users_username_uk').on(t.username)]
);

/** 用户组（M3 权限管理预留） */
export const groups = sqliteTable(
  'groups',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date())
  },
  (t) => [uniqueIndex('groups_name_uk').on(t.name)]
);

export const groupMembers = sqliteTable('group_members', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  groupId: integer('group_id')
    .notNull()
    .references(() => groups.id, { onDelete: 'cascade' }),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' })
});

/** 共享目录（M4） */
export const directories = sqliteTable(
  'directories',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    path: text('path').notNull(),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    /** true = 所有用户可见；false = 仅 directory_visibility 中的用户可见 */
    visibleToAll: integer('visible_to_all', { mode: 'boolean' }).notNull().default(true),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date())
  },
  (t) => [uniqueIndex('directories_path_uk').on(t.path)]
);

/** 目录可见性：目录对哪些用户可见（visible_to_all=false 时生效） */
export const directoryVisibility = sqliteTable(
  'directory_visibility',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    directoryId: integer('directory_id')
      .notNull()
      .references(() => directories.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' })
  },
  (t) => [uniqueIndex('directory_visibility_uk').on(t.directoryId, t.userId)]
);

/** 目录权限：subject=user/group，mode=ro/rw/deny，deny 优先（M3 预留） */
export const permissions = sqliteTable(
  'permissions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    directoryId: integer('directory_id')
      .notNull()
      .references(() => directories.id, { onDelete: 'cascade' }),
    subjectType: text('subject_type', { enum: ['user', 'group'] }).notNull(),
    subjectId: integer('subject_id').notNull(),
    mode: text('mode', { enum: ['ro', 'rw', 'deny'] }).notNull()
  },
  (t) => [index('permissions_dir_subject_idx').on(t.directoryId, t.subjectType, t.subjectId)]
);

/** 用户 SSH 公私钥（M5 预留，私钥加密存储） */
export const sshKeys = sqliteTable('ssh_keys', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  publicKey: text('public_key').notNull(),
  privateKeyEnc: text('private_key_enc').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date())
});

/** Web 会话（Cookie Session，服务端可吊销） */
export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    /** 单点登录：被新登录顶替的旧会话（旧设备据此提示“别处登录”） */
    replaced: integer('replaced', { mode: 'boolean' }).notNull().default(false),
    ip: text('ip'),
    userAgent: text('user_agent'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date())
  },
  (t) => [index('sessions_user_id_idx').on(t.userId)]
);

/** 审计日志（M8-5） */
export const auditLogs = sqliteTable(
  'audit_logs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    target: text('target'),
    detail: text('detail'),
    ip: text('ip'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date())
  },
  (t) => [index('audit_logs_created_at_idx').on(t.createdAt), index('audit_logs_user_idx').on(t.userId)]
);

/** 应用级设置（key-value） */
export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date())
});

/** 公告（单条激活；管理员/授权者维护） */
export const announcements = sqliteTable('announcements', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  content: text('content').notNull(),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date())
});

/** 公告已读记录 */
export const announcementReads = sqliteTable(
  'announcement_reads',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    announcementId: integer('announcement_id')
      .notNull()
      .references(() => announcements.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    readAt: integer('read_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date())
  },
  (t) => [uniqueIndex('announcement_reads_uk').on(t.announcementId, t.userId)]
);

/** 倒数日：scope='user' 个人私有；'global' 全员强制展示 */
export const countdowns = sqliteTable('countdowns', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  scope: text('scope', { enum: ['user', 'global'] }).notNull(),
  /** user 私有归属者 / global 创建者 */
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  targetDate: integer('target_date', { mode: 'timestamp_ms' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' })
});

/** TODO：scope='user' 个人私有；'global' 全员强制展示（仅管理员/授权者可改勾选） */
export const todos = sqliteTable('todos', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  scope: text('scope', { enum: ['user', 'global'] }).notNull(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  done: integer('done', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  doneAt: integer('done_at', { mode: 'timestamp_ms' }),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' })
});

/** 仪表盘布局（每用户） */
export const dashboardLayouts = sqliteTable('dashboard_layouts', {
  userId: integer('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  layout: text('layout').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date())
});
