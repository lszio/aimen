import type { APIRoute } from 'astro';
import { createAuth } from '@aimen/auth';

const auth = createAuth(import.meta.env.AUTH_JWT_SECRET || 'dev-secret-change-me');

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const formData = await request.formData();
    const username = formData.get('username') as string;
    const password = formData.get('password') as string;

    if (!username || !password) {
      return new Response(JSON.stringify({ success: false, error: 'Username and password required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const result = await auth.login(username, password);

    if (!result) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid credentials' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

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