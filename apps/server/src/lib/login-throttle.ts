/**
 * 登录限速（M1-3）：同一 IP 连续失败 5 次锁定 10 分钟。
 * 内存态实现，进程重启即清空；登录成功后自动重置。
 */
const WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILS = 5;

interface Entry {
  fails: number;
  firstFailAt: number;
  lockUntil: number;
}

const entries = new Map<string, Entry>();

export function isLocked(key: string): { locked: boolean; retryAfterSec: number } {
  const e = entries.get(key);
  if (!e) return { locked: false, retryAfterSec: 0 };
  const now = Date.now();
  if (e.lockUntil > now) return { locked: true, retryAfterSec: Math.ceil((e.lockUntil - now) / 1000) };
  if (now - e.firstFailAt > WINDOW_MS) entries.delete(key);
  return { locked: false, retryAfterSec: 0 };
}

export function recordFailure(key: string): void {
  const now = Date.now();
  const e = entries.get(key);
  if (!e || now - e.firstFailAt > WINDOW_MS) {
    entries.set(key, { fails: 1, firstFailAt: now, lockUntil: 0 });
    return;
  }
  e.fails += 1;
  if (e.fails >= MAX_FAILS) e.lockUntil = now + WINDOW_MS;
}

export function resetFailures(key: string): void {
  entries.delete(key);
}
