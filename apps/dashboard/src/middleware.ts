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
    if (pathname === '/api/auth/login' || pathname === '/api/auth/logout' || pathname === '/api/auth/refresh') {
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

  // 页面路由：检查 access token
  const tokenCookie = context.cookies.get('aimen_token');
  if (!tokenCookie?.value) {
    // 没有 access token → 尝试用 refresh token 自动刷新
    const refreshCookie = context.cookies.get('aimen_refresh');
    if (refreshCookie?.value) {
      const result = await auth.refresh(refreshCookie.value);
      if (result) {
        // 刷新成功 — 设置新 access token
        context.cookies.set('aimen_token', result.token, {
          path: '/',
          httpOnly: true,
          sameSite: 'lax',
          maxAge: 60 * 60, // 1 hour
        });
        context.locals.user = result.payload;
        return next();
      }
      // 刷新失败 — refresh token 也过期了，清除
      context.cookies.delete('aimen_refresh', { path: '/api/auth/refresh' });
    }
    // 没有 refresh token 或刷新失败 → 跳转登录
    return context.redirect('/login');
  }

  // 验证 access token
  const user = await auth.verify(tokenCookie.value);
  if (!user) {
    // Access token 过期 — 尝试刷新
    const refreshCookie = context.cookies.get('aimen_refresh');
    if (refreshCookie?.value) {
      const result = await auth.refresh(refreshCookie.value);
      if (result) {
        context.cookies.set('aimen_token', result.token, {
          path: '/',
          httpOnly: true,
          sameSite: 'lax',
          maxAge: 60 * 60, // 1 hour
        });
        context.locals.user = result.payload;
        return next();
      }
      context.cookies.delete('aimen_refresh', { path: '/api/auth/refresh' });
    }
    context.cookies.delete('aimen_token', { path: '/' });
    return context.redirect('/login');
  }

  context.locals.user = user;
  return next();
});