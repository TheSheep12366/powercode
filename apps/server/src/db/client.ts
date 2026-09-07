import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';
import * as schema from './schema.js';

const here = dirname(fileURLToPath(import.meta.url));

mkdirSync(config.dataDir, { recursive: true });

export const sqlite = new Database(config.dbPath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });

// 启动时自动执行 drizzle 迁移（dist/db 或 src/db 向上两级即 apps/server）
const migrationsFolder = resolve(here, '..', '..', 'drizzle');
migrate(db, { migrationsFolder });
logger.info({ db: config.dbPath }, '数据库已就绪（WAL 模式，迁移已应用）');
