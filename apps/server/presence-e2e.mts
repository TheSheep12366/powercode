// presence 生命周期 E2E：两个独立会话（模拟两台电脑）
// 1) 双方上线互见  2) 一方退出工作区，另一方实时看到其离开  3) 一方登出（会话销毁），另一方不受影响仍在线
import { io } from 'socket.io-client';

const BASE = 'http://127.0.0.1:3100';

interface PresenceEntry {
  userId: number;
  username: string;
  currentDoc: { dirId: number; dirName: string; path: string; name: string } | null;
}

async function login(username: string, password: string): Promise<string> {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  return r.headers.get('set-cookie')!.split(';')[0];
}

function connect(cookie: string): Promise<Socket> {
  return new Promise((resolvePromise, reject) => {
    const s = io(BASE, {
      path: '/socket.io',
      withCredentials: true,
      extraHeaders: { cookie },
      transports: ['websocket', 'polling'],
      reconnection: false
    });
    s.on('connect', () => resolvePromise(s));
    s.on('connect_error', (e) => reject(new Error('连接失败: ' + e.message)));
    setTimeout(() => reject(new Error('连接超时')), 8000);
  });
}

function waitEvent(s: Socket, event: string, timeout = 8000): Promise<PresenceEntry[]> {
  return new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => reject(new Error(`等待 ${event} 超时`)), timeout);
    s.on(event, (list: PresenceEntry[]) => {
      clearTimeout(timer);
      resolvePromise(list);
    });
  });
}

const results: string[] = [];
function check(name: string, ok: boolean, extra = ''): void {
  results.push(`${ok ? '✓' : '✗'} ${name}${extra ? '  ' + extra : ''}`);
  if (!ok) process.exitCode = 1;
}

// 两个独立会话
const cookieA = await login('c2test', 'Test@123456');
const cookieB = await login('admin', 'Admin@123456');

const sockA = await connect(cookieA);
const sockB = await connect(cookieB);

// 收集每端最新 presence
let listAtA: PresenceEntry[] = [];
let listAtB: PresenceEntry[] = [];
sockA.on('presence:state', (l) => (listAtA = l));
sockB.on('presence:state', (l) => (listAtB = l));
await new Promise((r) => setTimeout(r, 600));

// 1) 双方上线
check('双方在线互见', listAtA.length >= 2 && listAtB.length >= 2, `A看到${listAtA.length}人`);

// 2) 各自上报正在编辑
const doc = { dirId: 1, dirName: '演示项目', path: 'hello.txt', name: 'hello.txt' };
sockA.emit('presence:editing', doc);
sockB.emit('presence:editing', doc);
await new Promise((r) => setTimeout(r, 500));
const editingCountA = listAtA.filter((p) => p.currentDoc).length;
check('双方工作区在编状态同步', editingCountA === 2, `${editingCountA} 人在编`);

// 3) A 退出工作区（断开 socket = 离开页面）
sockA.disconnect();
await new Promise((r) => setTimeout(r, 800));
const remaining = listAtB.filter((p) => p.username === 'admin');
check('A 退出后 B 实时看到 A 离开', !listAtB.some((p) => p.username === 'c2test') && remaining.length === 1, `B 看到 ${listAtB.length} 人`);

// 4) A 登出（会话销毁）后用旧 cookie 重连 → 必须被拒绝，且不影响 B
await fetch(`${BASE}/api/auth/logout`, { method: 'POST', headers: { cookie: cookieA } });
const reconnectedA = await new Promise<PresenceEntry[] | 'rejected'>((resolvePromise) => {
  const s = io(BASE, {
    path: '/socket.io',
    withCredentials: true,
    extraHeaders: { cookie: cookieA },
    transports: ['websocket', 'polling'],
    reconnection: false
  });
  s.on('connect', () => resolvePromise([])); // 连上了（不应发生）
  s.on('connect_error', () => resolvePromise('rejected'));
  setTimeout(() => resolvePromise('timeout'), 8000);
});
check('已登出会话重连被拒绝', reconnectedA === 'rejected', String(reconnectedA));

// 5) B 不受影响仍在线
await new Promise((r) => setTimeout(r, 400));
check('B 仍然在线不受影响', listAtB.some((p) => p.username === 'admin'), `B 看到 ${listAtB.length} 人`);

sockB.disconnect();
console.log(results.join('\n'));
process.exit(process.exitCode ?? 0);
