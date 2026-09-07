import type { UserInfo } from '@powercode/shared';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: UserInfo;
      sessionId?: string;
    }
  }
}

export {};
