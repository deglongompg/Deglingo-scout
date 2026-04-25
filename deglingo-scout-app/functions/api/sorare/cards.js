/**
 * Cloudflare Pages Function — Proxy API Sorare
 * Le frontend envoie le token via header Authorization.
 * La function fait l'appel GraphQL à Sorare côté serveur (pas de CORS).
 */
const GQL = "https://api.sorare.com/graphql";
const Q = `{ currentUser { slug nickname cards(first: 50, sport: FOOTBALL) { nodes { slug name rarityTyped pictureUrl power cardEditionName ... on Card { sealed position player { slug displayName position } } } pageInfo { hasNextPage endCursor } } } }`;
const QP = `query($a:String!){ currentUser { cards(first:50, sport:FOOTBALL, after:$a) { nodes { slug name rarityTyped pictureUrl power cardEditionName ... on Card { sealed position player { slug displayName position } } } pageInfo { hasNextPage endCursor } } } }`;

async function gql(token, query, variables) {
  const r = await fetch(GQL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
    body: JSON.stringify(variables ? { query, variables } : { query }),
  });
  return r.json();
}

export async function onRequestGet({ request }) {
  const auth = request.headers.get("Authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return new Response(JSON.stringify({ error: "no_token" }), {
      status: 401, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }

  const url = new URL(request.url);

  // Test mode
  const testFields = url.searchParams.get("test");
  if (testFields) {
    const q = `{currentUser{cards(first:1,sport:FOOTBALL){nodes{slug rarityTyped ... on Card{player{slug displayName} ${testFields}}}}}}`;
    const r = await gql(token, q);
    return new Response(JSON.stringify(r), { status: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
  }

  // Raw query mode (with optional variables)
  const rawq = url.searchParams.get("rawq");
  if (rawq) {
    const vars = url.searchParams.get("vars");
    const r = await gql(token, rawq, vars ? JSON.parse(vars) : undefined);
    return new Response(JSON.stringify(r), { status: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
  }

  try {
    const d1 = await gql(token, Q);
    if (d1.errors) {
      return new Response(JSON.stringify(d1), {
        status: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }
    const user = d1.data?.currentUser;
    if (!user) {
      return new Response(JSON.stringify({ error: "no_user" }), {
        status: 502, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    // Pagination — collect ALL cards, filter after.
    // Limit a 60 pages (3000 cartes max) pour rester dans le budget Cloudflare Pages 30s
    // 60 * ~400ms ~= 24s. Au-dela : risque timeout 500.
    // Garde-fou explicite avec deadline (abort si > 25s).
    const startTime = Date.now();
    const DEADLINE_MS = 25000;
    let allCards = [...(user.cards?.nodes || [])];
    let cursor = user.cards?.pageInfo?.endCursor;
    let hasNext = user.cards?.pageInfo?.hasNextPage;
    let pagesDone = 1;
    let timedOut = false;

    for (let i = 0; i < 59 && hasNext && cursor; i++) {
      if (Date.now() - startTime > DEADLINE_MS) { timedOut = true; break; }
      const dn = await gql(token, QP, { a: cursor });
      if (dn.errors || !dn.data?.currentUser?.cards?.nodes?.length) break;
      const nodes = dn.data.currentUser.cards.nodes;
      allCards = allCards.concat(nodes);
      hasNext = dn.data.currentUser.cards.pageInfo?.hasNextPage;
      cursor = dn.data.currentUser.cards.pageInfo?.endCursor;
      pagesDone++;
    }

    // Filter: keep limited, rare, super_rare, unique + stellar editions
    const filtered = allCards.filter(c => {
      const r = (c.rarityTyped || "").toLowerCase();
      const ed = (c.cardEditionName || "").toLowerCase();
      if (r === "limited" || r === "rare" || r === "super_rare" || r === "unique") return true;
      if (ed.startsWith("stellar_")) return true;
      return false;
    });

    return new Response(JSON.stringify({
      data: { currentUser: { slug: user.slug, nickname: user.nickname, cards: { nodes: filtered } } },
      _meta: {
        total: allCards.length,
        kept: filtered.length,
        pages: pagesDone,
        elapsedMs: Date.now() - startTime,
        timedOut,
        hasMore: hasNext && !!cursor,
      },
    }), {
      status: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: "exception", msg: String(e) }), {
      status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
}

// Preflight CORS
export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
    },
  });
}
