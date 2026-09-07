export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// 单点登录：被顶替的全局提示（多个并发请求只提示一次）
let kickHandled = false;

export function handleKicked(): void {
  if (kickHandled) return;
  kickHandled = true;
  import('fuxsto-design/message').then(({ Message }) => {
    Message.warning('您的账号已在其他设备登录，您已被迫下线');
  });
  setTimeout(() => {
    window.location.href = '/login';
  }, 1500);
}

interface ApiOptions {
  method?: string;
  body?: unknown;
}

/** 统一请求封装：自动 JSON 序列化、携带 Cookie、解包 {ok,data} */
export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const method = options.method ?? (options.body !== undefined ? 'POST' : 'GET');
  const res = await fetch(path, {
    method,
    headers: options.body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    credentials: 'same-origin'
  });

  let payload: { ok?: boolean; data?: T; error?: string; code?: string } | null = null;
  try {
    payload = await res.json();
  } catch {
    // 非 JSON 响应
  }

  if (!res.ok || !payload?.ok) {
    if (res.status === 401 && payload?.code === 'SESSION_REPLACED') {
      handleKicked();
    }
    throw new ApiError(res.status, payload?.error ?? `请求失败（HTTP ${res.status}）`, payload?.code);
  }
  return payload.data as T;
}
