/**
 * Visor Gerencial × GrowthOS — Cloudflare Worker API
 * ─────────────────────────────────────────────────────
 * HOW TO DEPLOY (no CLI needed — all in your browser):
 *
 *  1. dash.cloudflare.com → Workers & Pages → Create Worker
 *     → paste this whole file → Save & Deploy
 *
 *  2. Your new Worker page → Settings → Variables
 *     → KV Namespace Bindings → Add binding:
 *         Variable name: LEADS   → create new namespace "vg-leads"
 *     → Add another binding:
 *         Variable name: STATES  → create new namespace "vg-states"
 *     → Save & Deploy again
 *
 *  3. Copy the Worker URL shown at the top (looks like:
 *     https://vg-api.YOUR-SUBDOMAIN.workers.dev)
 *     → paste it as VG_API at the bottom of the HTML file
 *
 * ROUTES:
 *   GET  /api/ping          → health check (used for LIVE badge)
 *   POST /api/lead          → capture lead  { email, lang, score }
 *   POST /api/state         → save state    { inputs, sem, lang } → { id }
 *   GET  /api/state/:id     → restore state
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

export default {
  async fetch(req, env) {

    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

    const { pathname } = new URL(req.url);

    // ── PING ─────────────────────────────────────────────────────────
    if (pathname === '/api/ping')
      return json({ ok: true, ts: new Date().toISOString() });

    // ── LEAD CAPTURE ─────────────────────────────────────────────────
    if (req.method === 'POST' && pathname === '/api/lead') {
      let body;
      try { body = await req.json(); } catch { return json({ error: 'Bad JSON' }, 400); }

      const email = (body.email || '').toLowerCase().trim();
      if (!email || !email.includes('@')) return json({ error: 'Invalid email' }, 400);

      // Silently deduplicate — same email never stored twice
      const key = `lead:${email}`;
      if (!(await env.LEADS.get(key))) {
        await env.LEADS.put(key, JSON.stringify({
          email,
          lang:  body.lang  || 'es',
          score: body.score ?? null,
          ts:    new Date().toISOString(),
        }));
      }
      return json({ ok: true });
    }

    // ── SAVE STATE ───────────────────────────────────────────────────
    if (req.method === 'POST' && pathname === '/api/state') {
      let body;
      try { body = await req.json(); } catch { return json({ error: 'Bad JSON' }, 400); }

      const id = crypto.randomUUID().slice(0, 8);
      await env.STATES.put(`state:${id}`, JSON.stringify(body), {
        expirationTtl: 60 * 60 * 24 * 30, // 30 days
      });
      return json({ id });
    }

    // ── RESTORE STATE ────────────────────────────────────────────────
    const m = pathname.match(/^\/api\/state\/([a-zA-Z0-9-]{6,36})$/);
    if (req.method === 'GET' && m) {
      const raw = await env.STATES.get(`state:${m[1]}`);
      if (!raw) return json({ error: 'Not found' }, 404);
      return json(JSON.parse(raw));
    }

    return json({ error: 'Not found' }, 404);
  },
};
