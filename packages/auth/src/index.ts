export const name = '@aimen/auth';

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

/** 短期 access token 载荷 */
export interface JwtPayload {
  sub: string;
  role: string;
  /** 签发时间（Unix 秒） */
  iat?: number;
  /** 过期时间（Unix 秒） */
  exp?: number;
}

/** 刷新 token 载荷 */
export interface RefreshPayload {
  sub: string;
  type: 'refresh';
  iat: number;
  exp: number;
}

/** 认证结果 */
export interface AuthResult {
  token: string;
  payload: JwtPayload;
}

/** 含 refreshToken 的扩展认证结果 */
export interface AuthResultWithRefresh extends AuthResult {
  refreshToken: string;
}

/** 认证器接口 */
export interface Auth {
  sign(payload: Record<string, unknown>): Promise<string>;
  verify(token: string): Promise<JwtPayload | null>;
  login(username: string, password: string): Promise<AuthResultWithRefresh | null>;
  refresh(refreshToken: string): Promise<AuthResultWithRefresh | null>;
}

// ---------------------------------------------------------------------------
// 编码 / 解码工具
// ---------------------------------------------------------------------------

function base64UrlEncode(data: Uint8Array): string {
  return btoa(String.fromCharCode(...data))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(str: string): Uint8Array {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Uint8Array.from(atob(str), c => c.charCodeAt(0));
}

async function hmacSha256(secret: string, data: string): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return new Uint8Array(sig);
}

/** 解码 JWT 载荷（不验证签名） */
function decodePayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const bodyStr = new TextDecoder().decode(base64UrlDecode(parts[1]));
    return JSON.parse(bodyStr);
  } catch {
    return null;
  }
}

/** 检查时间戳是否过期 */
function isExpired(payload: Record<string, unknown>): boolean {
  const exp = payload.exp;
  if (typeof exp === 'number') {
    return Math.floor(Date.now() / 1000) >= exp;
  }
  return false;
}

// ---------------------------------------------------------------------------
// createAuth — 工厂函数
// ---------------------------------------------------------------------------

/**
 * 创建认证实例
 *
 * @param secret - JWT 签名密钥
 * @returns Auth 实例
 */
export function createAuth(secret: string): Auth {
  const adminPassword = process.env.AUTH_ADMIN_PASSWORD || 'admin';

  const auth: Auth = {
    sign: async (payload: Record<string, unknown>): Promise<string> => {
      const now = Math.floor(Date.now() / 1000);
      const fullPayload = {
        ...payload,
        iat: payload.iat ?? now,
        exp: payload.exp ?? now + 3600,
      };

      const header = base64UrlEncode(new TextEncoder().encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
      const body = base64UrlEncode(new TextEncoder().encode(JSON.stringify(fullPayload)));
      const data = `${header}.${body}`;
      const sig = await hmacSha256(secret, data);
      const signature = base64UrlEncode(sig);
      return `${data}.${signature}`;
    },

    verify: async (token: string): Promise<JwtPayload | null> => {
      try {
        const parts = token.split('.');
        if (parts.length !== 3) return null;

        const [headerB64, bodyB64, sigB64] = parts;
        const data = `${headerB64}.${bodyB64}`;
        const expectedSig = await hmacSha256(secret, data);
        const actualSig = base64UrlDecode(sigB64);

        if (expectedSig.length !== actualSig.length) return null;
        for (let i = 0; i < expectedSig.length; i++) {
          if (expectedSig[i] !== actualSig[i]) return null;
        }

        const bodyStr = new TextDecoder().decode(base64UrlDecode(bodyB64));
        const payload = JSON.parse(bodyStr) as JwtPayload;
        if (!payload.sub || !payload.role) return null;

        // 检查过期
        if (isExpired(payload as Record<string, unknown>)) return null;

        return payload;
      } catch {
        return null;
      }
    },

    login: async (username: string, password: string): Promise<AuthResultWithRefresh | null> => {
      // Simple credential check
      if (password !== adminPassword) {
        return null;
      }

      const now = Math.floor(Date.now() / 1000);

      // 短期 access token（1 小时）
      const accessPayload: JwtPayload = {
        sub: username,
        role: 'admin',
        iat: now,
        exp: now + 3600,
      };
      const token = await auth.sign(accessPayload);

      // 长期 refresh token（7 天）
      const refreshPayload: RefreshPayload = {
        sub: username,
        type: 'refresh',
        iat: now,
        exp: now + 604800,
      };
      const refreshToken = await auth.sign(refreshPayload);

      return { token, payload: accessPayload, refreshToken };
    },

    refresh: async (refreshToken: string): Promise<AuthResultWithRefresh | null> => {
      try {
        // 先验证签名
        const payload = await auth.verify(refreshToken);
        if (!payload) return null;

        // 必须是 refresh token（且 role 必须匹配，我们放宽一点只检查 sub）
        const raw = decodePayload(refreshToken);
        if (!raw || raw.type !== 'refresh') return null;

        // 检查过期（verify 已经做了，但额外防御）
        if (isExpired(raw)) return null;

        const username = payload.sub;
        const now = Math.floor(Date.now() / 1000);

        // 颁发新 access token
        const accessPayload: JwtPayload = {
          sub: username,
          role: payload.role,
          iat: now,
          exp: now + 3600,
        };
        const token = await auth.sign(accessPayload);

        return { token, payload: accessPayload, refreshToken };
      } catch {
        return null;
      }
    },
  };

  return auth;
}