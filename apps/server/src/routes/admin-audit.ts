import { and, desc, eq, like, sql } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/client.js';
import { auditLogs, users } from '../db/schema.js';

export const adminAuditRouter = Router();

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(64).optional(),
  action: z.string().trim().max(64).optional()
});

adminAuditRouter.get('/', (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: parsed.error.issues[0]?.message ?? '参数错误' });
    return;
  }
  const { page, pageSize, q, action } = parsed.data;

  const conds = [];
  if (q) conds.push(like(users.username, `%${q}%`));
  if (action) conds.push(like(auditLogs.action, `%${action}%`));
  const where = conds.length > 0 ? and(...conds) : undefined;

  const items = db
    .select({
      id: auditLogs.id,
      username: users.username,
      action: auditLogs.action,
      target: auditLogs.target,
      detail: auditLogs.detail,
      ip: auditLogs.ip,
      createdAt: auditLogs.createdAt
    })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.userId))
    .where(where)
    .orderBy(desc(auditLogs.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .all();

  const totalRow = db
    .select({ count: sql<number>`count(*)` })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.userId))
    .where(where)
    .get();

  res.json({ ok: true, data: { items, total: totalRow?.count ?? 0, page, pageSize } });
});
