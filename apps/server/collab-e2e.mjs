// 协作 E2E：双客户端并发合并 / 只读连接拦截 / 越权拒绝 / 路径穿越拒绝
import { WebSocket } from 'ws';
import { HocuspocusProvider } from '@hocuspocus/provider';
import * as Y from 'yjs';
import { readFileSync } from 'node:fs';

const BASE = 'http://127.0.0.1:3100';
const FILE_ON_DISK = '/www/wwwroot/collab-workspaces/demo-project/m6-test/b.txt';

async function login(username, password) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const sc = r.headers.get('set-cookie');
  if (!sc) throw new Error(`${username} 登录失败`);
  return sc.split(';')[0];
}

function makeProvider(cookie, docName) {
  class CookieWS extends WebSocket {
    constructor(url) {
      super(url, { headers: { Cookie: cookie } });
    }
  }
  const ydoc = new Y.Doc();
  const provider = new HocuspocusProvider({
    url: 'ws://127.0.0.1:3100/collab',
    name: docName,
    document: ydoc,
    WebSocketPolyfill: CookieWS
  });
  return { ydoc, provider };
}

function waitSynced(p, timeout = 8000) {
  return new Promise((resolvePromise, reject) => {
    if (p.synced) return resolvePromise();
    const timer = setTimeout(() => reject(new Error('同步超时')), timeout);
    p.on('synced', () => { clearTimeout(timer); resolvePromise(); });
    p.on('authenticationError', ({ message }) => { clearTimeout(timer); const e = new Error(`AUTH: ${message}`); e.auth = true; reject(e); });
  });
}

const results = [];
function check(name, ok, extra = '') {
  results.push(`${ok ? '✓' : '✗'} ${name}${extra ? '  ' + extra : ''}`);
  if (!ok) process.exitCode = 1;
}

// ---- 1. 授权用户 A（rw）连接并写入 ----
const cookieA = await login('c2test', 'Test@123456');
const a = makeProvider(cookieA, 'd1:m6-test/b.txt');
await waitSynced(a.provider);
check('A(rw) 连接并同步', true);

const ytextA = a.ydoc.getText('content');
ytextA.insert(0, 'A1-第一行\n');
await new Promise((r) => setTimeout(r, 2200)); // 等防抖写盘（1s 防抖 + 余量）
const onDisk = readFileSync(FILE_ON_DISK, 'utf8');
check('自动保存落盘（防抖 1s）', onDisk.includes('A1-第一行'), `磁盘内容: ${JSON.stringify(onDisk.slice(0, 30))}`);

// ---- 2. 客户端 B（admin，rw）加入，双向合并 ----
const cookieAdmin = await login('admin', 'Admin@123456');
const b = makeProvider(cookieAdmin, 'd1:m6-test/b.txt');
await waitSynced(b.provider);
const ytextB = b.ydoc.getText('content');
check('B 看到已有内容', ytextB.toString().includes('A1-第一行'));
ytextB.insert(ytextB.length, 'B1-追加\n');
await new Promise((r) => setTimeout(r, 800));
check('A 实时收到 B 的编辑', ytextA.toString().includes('B1-追加'));

// ---- 3. 只读连接（c3, ro）：写入被服务器拒绝 ----
const cookieC = await login('c3test', 'Test@123456');
const c = makeProvider(cookieC, 'd1:m6-test/b.txt');
await waitSynced(c.provider);
const ytextC = c.ydoc.getText('content');
ytextC.insert(0, 'RO-不应出现');
await new Promise((r) => setTimeout(r, 1000));
check('只读连接的写入未同步给 A', !ytextA.toString().includes('RO-不应出现'));
const onDisk2 = readFileSync(FILE_ON_DISK, 'utf8');
check('只读连接的写入未落盘', !onDisk2.includes('RO-不应出现'));

// ---- 4. 无权限用户：鉴权拒绝 ----
const cookieD = await login('admin', 'Admin@123456'); // 用 admin cookie 但文档指向不存在目录
const d = makeProvider(cookieD, 'd999:x.txt');
let dRejected = false;
try {
  await waitSynced(d.provider, 6000);
} catch (e) {
  dRejected = true;
}
check('不存在的目录被拒绝', dRejected);

// ---- 5. 路径穿越文档名拒绝 ----
const e2 = makeProvider(cookieAdmin, 'd1:../escape.txt');
let eRejected = false;
try {
  await waitSynced(e2.provider, 6000);
} catch {
  eRejected = true;
}
check('路径穿越文档名被拒绝', eRejected);

a.provider.destroy();
b.provider.destroy();
c.provider.destroy();
d.provider.destroy();
e2.provider.destroy();

console.log(results.join('\n'));
await new Promise((r) => setTimeout(r, 300));
process.exit(process.exitCode ?? 0);
