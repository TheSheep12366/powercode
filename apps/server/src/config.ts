import { config as loadEnv } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// 编译产物 dist/config.js 与源码 src/config.ts 距仓库根目录都是三层（apps/server/dist|src）
const here = dirname(fileURLToPath(import.meta.url));
export const repoRoot = resolve(here, '..', '..', '..');
export const serverRoot = resolve(here, '..');

loadEnv({ path: resolve(repoRoot, '.env') });

function intEnv(name: string, def: number): number {
  const raw = process.env[name];
  if (!raw) return def;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : def;
}

const dataDir = resolve(repoRoot, process.env.DATA_DIR ?? 'data');

export const config = {
  port: intEnv('PORT', 3000),
  host: process.env.HOST ?? '127.0.0.1',
  dataDir,
  dbPath: resolve(dataDir, 'powercode.db'),
  sessionTtlDays: intEnv('SESSION_TTL_DAYS', 7),
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  trustProxy: process.env.TRUST_PROXY ?? 'loopback',
  adminUsername: process.env.ADMIN_USERNAME ?? 'admin',
  adminInitialPassword: process.env.ADMIN_INITIAL_PASSWORD ?? '',
  workspacesRoot: process.env.WORKSPACES_ROOT ?? '/www/wwwroot/collab-workspaces',
  sshHost: process.env.SSH_HOST ?? '127.0.0.1',
  sshPort: intEnv('SSH_PORT', 22),
  logLevel: process.env.LOG_LEVEL ?? 'info',
  webDist: resolve(repoRoot, 'apps/web/dist')
};
