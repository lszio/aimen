import type { APIRoute } from 'astro';
import { createAuth } from '@aimen/auth';

const auth = createAuth(import.meta.env.AUTH_JWT_SECRET || 'dev-secret-change-me');

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const refreshToken = cookies.get('aimen_refresh')?.value;
    if (!refreshToken) {
      return new Response(JSON.stringify({ success: false, error: 'No refresh token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const result = await auth.refresh(refreshToken);
    if (!result) {
      // Refresh token expired or invalid — clear all cookies
      cookies.delete('aimen_token', { path: '/' });
      cookies.delete('aimen_refresh', { path: '/api/auth/refresh' });
      return new Response(JSON.stringify({ success: false, error: 'Refresh token expired' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Set new access token
    cookies.set('aimen_token', result.token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 60 * 60, // 1 hour
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: 'Server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};