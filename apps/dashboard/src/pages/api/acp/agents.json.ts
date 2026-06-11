import type { APIRoute } from 'astro';

export const GET: APIRoute = async () => {
  try {
    const res = await fetch('http://localhost:4121/acp/agents');
    if (!res.ok) {
      return new Response(JSON.stringify({ success: false, agents: [], error: 'ACP Bus unreachable' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const data = await res.json();
    return new Response(JSON.stringify({ success: true, agents: data.data || [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, agents: [], error: 'ACP Bus unreachable' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};