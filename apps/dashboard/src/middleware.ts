import { defineMiddleware } from 'astro/middleware';
import { createAuth } from '@aimen/auth';

const auth = createAuth(import.meta.env.AUTH_JWT_SECRET || 'dev-secret-change-me');

// 不需要认证的路径前缀
const PUBLIC_PATHS = ['/login', '/_astro', '/favicon'];

export const onRequest = defineMiddleware(async (context, next) => {
  const url = new URL(context.request.url);
  const pathname = url.pathname;

  // 允许公开路径和静态资源
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return next();
  }

  // API 路由单独处理
  if (pathname.startsWith('/api/')) {
    if (pathname === '/api/auth/login' || pathname === '/api/auth/logout') {
      return next();
    }
    // 其他 API 从 Authorization header 验证 (ACP 内部通信)
    const authHeader = context.request.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const user = await auth.verify(token);
      if (user) {
        context.locals.user = user;
        return next();
      }
    }
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 页面路由：检查 cookie
  const cookie = context.cookies.get('aimen_token');
  if (!cookie?.value) {
    return context.redirect('/login');
  }

  const user = await auth.verify(cookie.value);
  if (!user) {
    context.cookies.delete('aimen_token');
    return context.redirect('/login');
  }

  context.locals.user = user;
  return next();
});