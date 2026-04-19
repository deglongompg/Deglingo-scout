/**
 * Cloudflare Pages Function — Sync teams cross-device via Sorare account
 *
 * GET  /api/teams  -> retourne toutes les teams du user connecte Sorare
 * POST /api/teams  -> upsert une team (body: { scope, key, payload })
 *
 * Auth: header `Authorization: Bearer <sorare_access_token>`.
 * Le slug Sorare est verifie cote serveur via GraphQL (anti-spoof).
 *
 * Binding KV requis: env.TEAMS_KV  (cf. SETUP_KV.md)
 * Structure KV: cle `teams:<slug>`, valeur JSON:
 *   {
 *     proLimited: { [league]: { [gwKey]: [team,...] } },
 *     proRare:    { [league]: { [gwKey]: [team,...] } },
 *     stellar:    { [dateStr]: [team,...] },
 *     _updatedAt: ISO
 *   }
 */

const GQL = "https://api.sorare.com/graphql";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Allow-Methods": "GET,POST,OPTIONS" };

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS } });
}

async function resolveSlug(token) {
  const r = await fetch(GQL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
    body: JSON.stringify({ query: "{currentUser{slug}}" }),
  });
  if (!r.ok) return null;
  const d = await r.json();
  return d?.data?.currentUser?.slug || null;
}

function getToken(request) {
  const auth = request.headers.get("Authorization") || "";
  return auth.replace(/^Bearer\s+/i, "").trim();
}

function emptyStore() {
  return { proLimited: {}, proRare: {}, stellar: {}, _updatedAt: null };
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestGet({ request, env }) {
  if (!env.TEAMS_KV) return json({ error: "kv_not_bound" }, 500);
  const token = getToken(request);
  if (!token) return json({ error: "no_token" }, 401);
  const slug = await resolveSlug(token);
  if (!slug) return json({ error: "invalid_token" }, 401);

  const raw = await env.TEAMS_KV.get(`teams:${slug}`);
  const data = raw ? JSON.parse(raw) : emptyStore();
  return json({ slug, data });
}

export async function onRequestPost({ request, env }) {
  if (!env.TEAMS_KV) return json({ error: "kv_not_bound" }, 500);
  const token = getToken(request);
  if (!token) return json({ error: "no_token" }, 401);
  const slug = await resolveSlug(token);
  if (!slug) return json({ error: "invalid_token" }, 401);

  let body;
  try { body = await request.json(); } catch { return json({ error: "bad_json" }, 400); }

  const { scope, league, rarity, gwKey, dateStr, teams } = body || {};
  if (!scope || !Array.isArray(teams)) return json({ error: "bad_payload" }, 400);

  const key = `teams:${slug}`;
  const raw = await env.TEAMS_KV.get(key);
  const store = raw ? JSON.parse(raw) : emptyStore();

  if (scope === "pro") {
    if (!league || !rarity || !gwKey) return json({ error: "missing_pro_fields" }, 400);
    const bucket = rarity === "rare" ? "proRare" : "proLimited";
    store[bucket][league] = store[bucket][league] || {};
    store[bucket][league][gwKey] = teams;
  } else if (scope === "stellar") {
    if (!dateStr) return json({ error: "missing_stellar_date" }, 400);
    store.stellar[dateStr] = teams;
  } else {
    return json({ error: "bad_scope" }, 400);
  }

  store._updatedAt = new Date().toISOString();
  await env.TEAMS_KV.put(key, JSON.stringify(store));
  return json({ ok: true, slug, _updatedAt: store._updatedAt });
}
