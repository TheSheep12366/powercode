import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { createApp } from './app.js';
import { hocuspocus } from './collab/hocuspocus.js';
import { config } from './config.js';
import { ensureAdminUser } from './db/seed.js';
import { logger } from './lib/logger.js';
import { startSessionCleaner } from './middleware/session.js';
import { bindIo, initPresence } from './presence.js';

ensureAdminUser();
startSessionCleaner();

const app = createApp();
const httpServer = createServer(app);

// 协作 WebSocket：/collab 路径交给 Hocuspocus；/socket.io 由 Socket.IO 自行处理
const wss = new WebSocketServer({ noServer: true });
httpServer.on('upgrade', (req, socket, head) => {
  let pathname = '/';
  try {
    pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
  } catch {
    return;
  }
  if (pathname === '/collab') {
    wss.handleUpgrade(req, socket, head, (ws) => {
      // Hocuspocus v4（crossws）要求 Web 标准 Request
      const url = `http://${req.headers.host ?? 'localhost'}${req.url ?? '/'}`;
      const webReq = new Request(url, { headers: { cookie: req.headers.cookie ?? '' } });
      const connection = hocuspocus.handleConnection(ws, webReq);
      // 手动挂接时需自行转发消息与关闭事件（官方 Server 封装由 crossws 完成）
      ws.on('message', (data) => {
        connection.handleMessage(new Uint8Array(data as Buffer));
      });
      ws.on('close', (code, reason) => {
        connection.handleClose({ code, reason: reason.toString() });
      });
    });
  }
  // 其它路径（含 /socket.io）交给各自的 upgrade 监听器
});

const io = initPresence(httpServer);
bindIo(io);

let boundHost = config.host;
httpServer.on('error', (err) => {
  const e = err as NodeJS.ErrnoException;
  // 环境无 IPv6 支持时自动回退仅 IPv4
  if ((e.code === 'EAFNOSUPPORT' || e.code === 'EADDRNOTAVAIL' || e.code === 'EINVAL') && boundHost === '::') {
    logger.warn('当前环境不支持 IPv6 绑定，已回退为 0.0.0.0（仅 IPv4）');
    boundHost = '0.0.0.0';
    httpServer.listen(config.port, boundHost);
    return;
  }
  logger.error({ err }, '服务启动失败');
  process.exit(1);
});

httpServer.listen(config.port, boundHost, () => {
  logger.info(`PowerCode 服务已启动: http://${boundHost}:${config.port}（数据目录: ${config.dataDir}）`);
  logger.info('协作 WebSocket: /collab；在线状态: /socket.io');
});
