// Deglingo Fight Counter — Cloudflare Worker
// KV binding: FIGHT_KV (à créer sur Cloudflare dashboard)
// Routes:
//   GET  /count     → { count: N }
//   POST /increment → { count: N }

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request, env) {
    // Preflight CORS
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    const url = new URL(request.url);

    // GET /count — retourne le compteur actuel
    if (request.method === "GET" && url.pathname === "/count") {
      const val = await env.FIGHT_KV.get("fight_count");
      const count = val ? parseInt(val) : 0;
      return Response.json({ count }, { headers: CORS });
    }

    // POST /increment — incrémente et retourne la nouvelle valeur
    if (request.method === "POST" && url.pathname === "/increment") {
      const val = await env.FIGHT_KV.get("fight_count");
      const count = (val ? parseInt(val) : 0) + 1;
      await env.FIGHT_KV.put("fight_count", String(count));
      return Response.json({ count }, { headers: CORS });
    }

    return new Response("Not found", { status: 404, headers: CORS });
  },
};
