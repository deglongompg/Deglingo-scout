/**
 * Cloudflare Pages Function — Proxy API Sorare
 * Le frontend envoie le token via header Authorization.
 * La function fait l'appel GraphQL à Sorare côté serveur (pas de CORS).
 */
const GQL = "https://api.sorare.com/graphql";
const Q = `{ currentUser { slug nickname cards(first: 100, sport: FOOTBALL) { nodes { slug name rarityTyped pictureUrl power cardEditionName seasonYear ... on Card { player { slug displayName position } } } pageInfo { hasNextPage endCursor } } } }`;
const QP = `query($a:String!){ currentUser { cards(first:100, sport:FOOTBALL, after:$a) { nodes { slug name rarityTyped pictureUrl power cardEditionName seasonYear ... on Card { player { slug displayName position } } } pageInfo { hasNextPage endCursor } } } }`;

async function gql(token, query, variables) {
  const r = await fetch(GQL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
    body: JSON.stringify(variables ? { query, variables } : { query }),
  });
  return r.json();
}

export async function onRequestGet({ request }) {
  // Token depuis le header Authorization (envoyé par le frontend)
  const auth = request.headers.get("Authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return new Response(JSON.stringify({ error: "no_token" }), {
      status: 401, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }

  // Test mode: /api/sorare/cards?test=field1,field2,field3
  const url = new URL(request.url);
  const testFields = url.searchParams.get("test");
  if (testFields) {
    const q = `{currentUser{cards(first:1,sport:FOOTBALL){nodes{slug rarityTyped ... on Card{player{slug displayName} ${testFields}}}}}}`;
    const r = await gql(token, q);
    return new Response(JSON.stringify(r), { status: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
  }

  // Raw query mode (with optional variables): /api/sorare/cards?rawq=<query>&vars=<json>
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

    // Pagination
    let allCards = [...(user.cards?.nodes || [])];
    let cursor = user.cards?.pageInfo?.endCursor;
    let hasNext = user.cards?.pageInfo?.hasNextPage;
    for (let i = 0; i < 39 && hasNext && cursor; i++) {
      const dn = await gql(token, QP, { a: cursor });
      if (dn.errors || !dn.data?.currentUser?.cards?.nodes?.length) break;
      allCards = allCards.concat(dn.data.currentUser.cards.nodes);
      hasNext = dn.data.currentUser.cards.pageInfo?.hasNextPage;
      cursor = dn.data.currentUser.cards.pageInfo?.endCursor;
    }

    return new Response(JSON.stringify({
      data: { currentUser: { slug: user.slug, nickname: user.nickname, cards: { nodes: allCards } } }
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
