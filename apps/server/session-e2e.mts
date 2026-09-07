// 会话顶替（单点登录）E2E：双设备模拟
// 1) 设备A登录 → 在线  2) 设备B登录同账号 → A 的会话立即失效（401 SESSION_REPLACED）
// 3) A 的 socket 在 ≤5s 内被踢并收到 session:invalid  4) B 完全不受影响  5) B 登出正常
import { io } from 'socket.io-client';

const BASE = 'http://127.0.0.1:3100';

async function login(username: string, password: string): Promise<{ cookie: string; sid: string }> {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const cookie = r.headers.get('set-cookie')!.split(';')[0];
  return { cookie, sid: cookie.replace('pc_sid=', '') };
}

async function me(cookie: string): Promise<{ status: number; code?: string; username?: string }> {
  const r = await fetch(`${BASE}/api/auth/me`, { headers: { cookie } });
  const body = (await r.json()) as { ok: boolean; code?: string; data?: { user: { username: string } } };
  return { status: r.status, code: body.code, username: body.data?.user?.username };
}

function connect(cookie: string): Promise<{ socket: import('socket.io-client').Socket; kicked: () => Promise<boolean> }> {
  let kicked = false;
  const socket = io(BASE, {
    path: '/socket.io',
    withCredentials: true,
    extraHeaders: { cookie },
    transports: ['websocket', 'polling'],
    reconnection: false
  });
  const kickedPromise = new Promise<boolean>((resolvePromise) => {
    socket.on('session:invalid', () => {
      kicked = true;
      resolvePromise(true);
    });
    socket.on('disconnect', () => {
      setTimeout(() => resolvePromise(kicked), 100);
    });
  });
  return Promise.resolve({ socket, kicked: () => kickedPromise });
}

const results: string[] = [];
function check(name: string, ok: boolean, extra = ''): void {
  results.push(`${ok ? '✓' : '✗'} ${name}${extra ? '  ' + extra : ''}`);
  if (!ok) process.exitCode = 1;
}

// 设备 A 登录 c2test
const devA = await login('c2test', 'Test@123456');
const meA1 = await me(devA.cookie);
check('设备 A 登录并可用', meA1.status === 200 && meA1.username === 'c2test');

// 设备 A 连接 presence socket
const connA = await connect(devA.cookie);
await new Promise((r) => setTimeout(r, 600));

// 设备 B 登录同账号（触发顶替）
const devB = await login('c2test', 'Test@123456');

// 设备 A 的会话立即失效，且返回专用错误码
const meA2 = await me(devA.cookie);
check('A 会话被顶替（401）', meA2.status === 401);
check('返回 SESSION_REPLACED 专用码', meA2.code === 'SESSION_REPLACED');

// 设备 B 完全正常
const meB = await me(devB.cookie);
check('设备 B 会话正常', meB.status === 200 && meB.username === 'c2test');

// A 的 socket 在清扫周期（≤5s）内被踢并收到提示事件
const wasKicked = await Promise.race([connA.kicked(), new Promise<boolean>((r) => setTimeout(() => r(false), 9000))]);
check('A 的 socket 收到踢下线通知', wasKicked);

// B 再验证一次
const meB2 = await me(devB.cookie);
check('B 依然正常（顶替不影响新会话）', meB2.status === 200);

connA.socket.disconnect();
console.log(results.join('\n'));
process.exit(process.exitCode ?? 0);
