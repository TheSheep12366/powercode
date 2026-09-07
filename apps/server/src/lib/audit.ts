import { db } from '../db/client.js';
import { auditLogs } from '../db/schema.js';

export interface AuditEntry {
  userId?: number | null;
  action: string;
  target?: string;
  detail?: unknown;
  ip?: string;
}

export function writeAudit(entry: AuditEntry): void {
  try {
    db.insert(auditLogs)
      .values({
        userId: entry.userId ?? null,
        action: entry.action,
        target: entry.target ?? null,
        detail: entry.detail === undefined ? null : JSON.stringify(entry.detail),
        ip: entry.ip ?? null,
        createdAt: new Date()
      })
      .run();
  } catch {
    // 审计写入失败不阻塞业务请求
  }
}
