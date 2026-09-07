import cookieParser from 'cookie-parser';
import express, { Router, type NextFunction, type Request, type Response } from 'express';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from './config.js';
import { logger } from './lib/logger.js';
import { requireAuth, requireCap, sessionMiddleware } from './middleware/session.js';
import { adminAnnouncementRouter } from './routes/admin-content.js';
import { adminPlansRouter } from './routes/admin-content.js';
import { adminAuditRouter } from './routes/admin-audit.js';
import { adminDirectoriesRouter } from './routes/admin-directories.js';
import { adminFsRouter } from './routes/admin-fs.js';
import { adminGroupsRouter } from './routes/admin-groups.js';
import { adminPermissionsRouter } from './routes/admin-permissions.js';
import { adminRolesRouter } from './routes/admin-roles.js';
import { adminUsersRouter } from './routes/admin-users.js';
import { authRouter } from './routes/auth.js';
import { healthRouter } from './routes/health.js';
import { myFsRouter } from './routes/my-fs.js';
import { myProfileRouter, readAvatarFile } from './routes/my-profile.js';
import { myDashboardRouter } from './routes/my-dashboard.js';
import { myRouter } from './routes/my.js';
import { myStatsRouter } from './routes/my-stats.js';

export function createApp(): express.Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(sessionMiddleware);

  const api = Router();
  api.use('/health', healthRouter);
  api.use('/auth', authRouter);

  // 管理接口：按能力位鉴权（管理员天然全权，普通用户需权限组授予）
  const adminApi = Router();
  adminApi.use('/users', requireCap('canManageUsers', '管理用户/用户组'), adminUsersRouter);
  adminApi.use('/groups', requireCap('canManageUsers', '管理用户/用户组'), adminGroupsRouter);
  adminApi.use('/directories', requireCap('canManageDirectories', '管理共享目录'), adminDirectoriesRouter);
  adminApi.use('/permissions', requireCap('canManageDirectories', '管理共享目录权限'), adminPermissionsRouter);
  adminApi.use('/fs', requireCap('canManageDirectories', '管理共享目录'), adminFsRouter);
  adminApi.use('/roles', requireCap('canManageUsers', '管理用户/用户组'), adminRolesRouter);
  adminApi.use('/audit-logs', requireCap('canViewAudit', '查看审计日志'), adminAuditRouter);
  adminApi.use('/announcement', requireCap('canManageAnnouncements', '管理公告'), adminAnnouncementRouter);
  adminApi.use('/plans', requireCap('canManageGlobalPlans', '管理全员计划'), adminPlansRouter);
  api.use('/admin', adminApi);

  // 当前用户的可见目录与权限（工作区数据源）
  api.use('/my', myRouter);
  // 工作区文件操作（逐目录鉴权）
  api.use('/my/fs', myFsRouter);
  // 仪表盘（布局/公告/倒数日/TODO/统计/贡献）
  api.use('/my', myDashboardRouter);
  api.use('/my/stats', myStatsRouter);
  // 头像 / 用户主页 / 通讯录 / 设置
  api.use('/my', myProfileRouter);
  api.get('/avatars/:id', requireAuth, (req, res) => {
    const id = Number(req.params.id);
    const avatar = Number.isInteger(id) && id > 0 ? readAvatarFile(id) : null;
    if (!avatar) {
      res.status(404).json({ ok: false, error: '无头像' });
      return;
    }
    res.setHeader('content-type', avatar.ext === 'jpg' ? 'image/jpeg' : `image/${avatar.ext}`);
    res.setHeader('cache-control', 'public, max-age=86400');
    res.send(avatar.buf);
  });

  api.use((_req, res) => {
    res.status(404).json({ ok: false, error: '接口不存在' });
  });
  app.use('/api', api);

  // 托管前端 SPA 构建产物
  if (existsSync(config.webDist)) {
    app.use(express.static(config.webDist));
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api')) {
        next();
        return;
      }
      res.sendFile(resolve(config.webDist, 'index.html'));
    });
  } else {
    logger.warn('未找到前端构建产物（apps/web/dist），当前仅提供 API；请先执行 pnpm build');
  }

  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    if (err && typeof err === 'object' && 'type' in err && (err as { type?: string }).type === 'entity.parse.failed') {
      res.status(400).json({ ok: false, error: '请求体不是合法 JSON' });
      return;
    }
    logger.error({ err, path: req.path }, '请求处理异常');
    res.status(500).json({ ok: false, error: '服务器内部错误' });
  });

  return app;
}
