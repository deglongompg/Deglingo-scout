/**
 * Cloudflare Pages Function — Proxy API Sorare
 * Le frontend envoie le token via header Authorization.
 * La function fait l'appel GraphQL à Sorare côté serveur (pas de CORS).
 *
 * IMPORTANT — limite Cloudflare 50 subrequests par invocation (free plan).
 * On limite donc a 40 pages par appel + le client peut rappeler avec ?cursor=
 * pour continuer la pagination sur une autre invocation. Permet 5000+ cartes
 * via 4-5 appels chainés cote client.
 */
const GQL = "https://api.sorare.com/graphql";
const Q = `{ currentUser { slug nickname cards(first: 50, sport: FOOTBALL) { nodes { slug name rarityTyped pictureUrl power cardEditionName ... on Card { sealed position player { slug displayName position } } } pageInfo { hasNextPage endCursor } } } }`;
const QP = `query($a:String!){ currentUser { cards(first:50, sport:FOOTBALL, after:$a) { nodes { slug name rarityTyped pictureUrl power cardEditionName ... on Card { sealed position player { slug displayName position } } } pageInfo { hasNextPage endCursor } } } }`;

// 40 pagination calls + 1 initial = 41 subrequests, sous la limite 50
const MAX_PAGES_PER_CALL = 40;

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

  // Test mode (1 carte avec champs custom)
  const testFields = url.searchParams.get("test");
  if (testFields) {
    const q = `{currentUser{cards(first:1,sport:FOOTBALL){nodes{slug rarityTyped ... on Card{player{slug displayName} ${testFields}}}}}}`;
    const r = await gql(token, q);
    return new Response(JSON.stringify(r), { status: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
  }

  // Raw query mode
  const rawq = url.searchParams.get("rawq");
  if (rawq) {
    const vars = url.searchParams.get("vars");
    const r = await gql(token, rawq, vars ? JSON.parse(vars) : undefined);
    return new Response(JSON.stringify(r), { status: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
  }

  // Pagination via ?cursor=<endCursor> pour appels chaines
  const incomingCursor = url.searchParams.get("cursor");

  try {
    let allCards = [];
    let cursor = incomingCursor || null;
    let hasNext = true;
    let userInfo = null;

    if (!incomingCursor) {
      // 1er appel : fetch user info + 1ere page
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
      userInfo = { slug: user.slug, nickname: user.nickname };
      allCards = [...(user.cards?.nodes || [])];
      cursor = user.cards?.pageInfo?.endCursor;
      hasNext = user.cards?.pageInfo?.hasNextPage;
    }

    // Pagination jusqu'a MAX_PAGES_PER_CALL pages OU plus de cursor
    let pagesDone = incomingCursor ? 0 : 1;
    for (let i = 0; i < MAX_PAGES_PER_CALL && hasNext && cursor; i++) {
      const dn = await gql(token, QP, { a: cursor });
      if (dn.errors || !dn.data?.currentUser?.cards?.nodes?.length) break;
      const nodes = dn.data.currentUser.cards.nodes;
      allCards.push(...nodes);
      hasNext = dn.data.currentUser.cards.pageInfo?.hasNextPage;
      cursor = dn.data.currentUser.cards.pageInfo?.endCursor;
      pagesDone++;
    }

    // Filter: keep limited+ et stellar editions
    const filtered = allCards.filter(c => {
      const r = (c.rarityTyped || "").toLowerCase();
      const ed = (c.cardEditionName || "").toLowerCase();
      if (r === "limited" || r === "rare" || r === "super_rare" || r === "unique") return true;
      if (ed.startsWith("stellar_")) return true;
      return false;
    });

    return new Response(JSON.stringify({
      data: {
        currentUser: {
          ...(userInfo || {}),
          cards: {
            nodes: filtered,
            // Cursor pour le prochain appel chain par le client (null = fini)
            nextCursor: hasNext ? cursor : null,
            hasMore: hasNext && !!cursor,
          },
        },
      },
      _meta: { total: allCards.length, kept: filtered.length, pages: pagesDone },
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
