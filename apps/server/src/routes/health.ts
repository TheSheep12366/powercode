import { Router } from 'express';

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  res.json({
    ok: true,
    data: {
      name: 'powercode',
      uptimeSec: Math.round(process.uptime()),
      now: new Date().toISOString()
    }
  });
});
