import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { db } from './client.js';
import { users } from './schema.js';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';

/** 用户表为空时创建初始管理员（幂等，只在首次启动执行） */
export function ensureAdminUser(): void {
  const rows = db.select({ id: users.id }).from(users).limit(1).all();
  if (rows.length > 0) return;

  const password = config.adminInitialPassword || randomBytes(12).toString('base64url');
  const passwordHash = bcrypt.hashSync(password, 12);
  db.insert(users)
    .values({ username: config.adminUsername, passwordHash, role: 'admin', status: 'active' })
    .run();

  if (config.adminInitialPassword) {
    logger.info(`已创建初始管理员 "${config.adminUsername}"（密码来自 ADMIN_INITIAL_PASSWORD）`);
  } else {
    logger.info(`已创建初始管理员 "${config.adminUsername}"，随机密码: ${password}`);
    logger.warn('请立即登录修改密码，或在 .env 设置 ADMIN_INITIAL_PASSWORD 后删除数据库重新初始化');
  }
}
