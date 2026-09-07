import { WebSocket } from 'ws';
import { HocuspocusProvider } from '@hocuspocus/provider';
import * as Y from 'yjs';

async function login(username, password) {
  const r = await fetch('http://127.0.0.1:3100/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  return r.headers.get('set-cookie').split(';')[0];
}

const cookie = await login('c2test', 'Test@123456');
console.log('cookie:', cookie.slice(0, 30) + '...');

class CookieWS extends WebSocket {
  constructor(url) {
    super(url, { headers: { Cookie: cookie } });
  }
}

const ydoc = new Y.Doc();
const provider = new HocuspocusProvider({
  url: 'ws://127.0.0.1:3100/collab',
  name: 'd1:m6-test/b.txt',
  document: ydoc,
  WebSocketPolyfill: CookieWS
});

provider.on('synced', () => console.log('EVT synced, text:', JSON.stringify(ydoc.getText('content').toString().slice(0, 50))));
provider.on('authenticationError', ({ message }) => console.log('EVT authError:', message));
provider.on('connectionError', ({ message }) => console.log('EVT connError:', message));
provider.on('close', ({ message }) => console.log('EVT close:', message?.slice(0, 80)));
provider.on('status', ({ status }) => console.log('EVT status:', status));
ydoc.on('update', () => console.log('DOC update, text:', JSON.stringify(ydoc.getText('content').toString().slice(0, 50))));

setTimeout(() => {
  console.log('--- 6s 后状态: synced =', provider.synced, '| text =', JSON.stringify(ydoc.getText('content').toString().slice(0, 50)));
  provider.destroy();
  process.exit(0);
}, 6000);
