export const name = '@aimen/auth';

export interface JwtPayload {
  sub: string;
  role: string;
}

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
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return new Uint8Array(sig);
}

export function createAuth(secret: string) {
  const auth = {
    sign: async (payload: JwtPayload): Promise<string> => {
      const header = base64UrlEncode(new TextEncoder().encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
      const body = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
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

        return payload;
      } catch {
        return null;
      }
    },
    login: async (username: string, password: string): Promise<{ token: string; payload: JwtPayload } | null> => {
      // Simple credential check
      const adminPassword = process.env.AUTH_ADMIN_PASSWORD || 'admin';
      if (password !== adminPassword) {
        return null;
      }
      const payload: JwtPayload = { sub: username, role: 'admin' };
      const token = await auth.sign(payload);
      return { token, payload };
    },
  };
  return auth;
}