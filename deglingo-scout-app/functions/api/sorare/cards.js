/**
 * Cloudflare Pages Function — Proxy API Sorare
 * Le frontend envoie le token via header Authorization.
 * La function fait l'appel GraphQL à Sorare côté serveur (pas de CORS).
 */
const GQL = "https://api.sorare.com/graphql";
const Q = `{ currentUser { slug nickname cards(first: 50, sport: FOOTBALL) { nodes { slug name rarityTyped pictureUrl power cardEditionName ... on Card { sealed position player { slug displayName position } } } pageInfo { hasNextPage endCursor } } } }`;
const QP = `query($a:String!){ currentUser { cards(first:50, sport:FOOTBALL, after:$a) { nodes { slug name rarityTyped pictureUrl power cardEditionName ... on Card { sealed position player { slug displayName position } } } pageInfo { hasNextPage endCursor } } } }`;
// Queries filtrees par rarete — permet de paginer separemment communs vs rares+
const Q_BY_RARITY = `query($r:[Rarity!]){ currentUser { cards(first:50, sport:FOOTBALL, rarities:$r) { nodes { slug name rarityTyped pictureUrl power cardEditionName ... on Card { sealed position player { slug displayName position } } } pageInfo { hasNextPage endCursor } } } }`;
const QP_BY_RARITY = `query($r:[Rarity!],$a:String!){ currentUser { cards(first:50, sport:FOOTBALL, rarities:$r, after:$a) { nodes { slug name rarityTyped pictureUrl power cardEditionName ... on Card { sealed position player { slug displayName position } } } pageInfo { hasNextPage endCursor } } } }`;


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
    // Etape 1 : recupere user info via une seule carte
    const userInfoQuery = `{ currentUser { slug nickname } }`;
    const u = await gql(token, userInfoQuery);
    if (u.errors) {
      return new Response(JSON.stringify(u), {
        status: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }
    const user = u.data?.currentUser;
    if (!user) {
      return new Response(JSON.stringify({ error: "no_user" }), {
        status: 502, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    // Strategie : 2 chains de pagination en PARALLELE par rarete
    // - Non-common (limited+) : typiquement <500 par user, MAX_PAGES_NONCOMMON=30 (1500 cartes)
    // - Common               : peut monter a 4000+ cartes, MAX_PAGES_COMMON=100 (5000 cartes)
    // Total potentiel : 6500 cartes (vs 2000 avant la fix)
    // Les 2 chains s'executent en Promise.all -> temps total ~= max des 2 (chain commune ~25-30s
    // au pire, dans le budget Cloudflare Pages 30s). Si time-out : fallback simple.
    // Si le filtre rarities n'est pas supporte par l'API, fallback sur pagination unique 100p.
    const MAX_PAGES_NONCOMMON = 30;
    const MAX_PAGES_COMMON = 100;

    async function paginateRarity(rarityList, maxPages) {
      const all = [];
      const d1 = await gql(token, Q_BY_RARITY, { r: rarityList });
      if (d1.errors) return { errors: d1.errors, cards: [] };
      const c1 = d1.data?.currentUser?.cards;
      if (!c1) return { errors: [{ message: "no_cards_field" }], cards: [] };
      all.push(...(c1.nodes || []));
      let cursor = c1.pageInfo?.endCursor;
      let hasNext = c1.pageInfo?.hasNextPage;
      for (let i = 0; i < maxPages - 1 && hasNext && cursor; i++) {
        const dn = await gql(token, QP_BY_RARITY, { r: rarityList, a: cursor });
        if (dn.errors || !dn.data?.currentUser?.cards?.nodes?.length) break;
        all.push(...dn.data.currentUser.cards.nodes);
        hasNext = dn.data.currentUser.cards.pageInfo?.hasNextPage;
        cursor = dn.data.currentUser.cards.pageInfo?.endCursor;
      }
      return { cards: all };
    }

    // Lance les 2 fetches en parallele
    const [nonCommonRes, commonRes] = await Promise.all([
      paginateRarity(["LIMITED", "RARE", "SUPER_RARE", "UNIQUE"], MAX_PAGES_NONCOMMON),
      paginateRarity(["COMMON"], MAX_PAGES_COMMON),
    ]);

    // Si le filtre rarities n'est pas supporte par l'API, fallback sur l'ancienne pagination unique
    if (nonCommonRes.errors || commonRes.errors) {
      let allCards = [];
      const dFallback = await gql(token, Q);
      const userF = dFallback.data?.currentUser;
      if (!userF) {
        return new Response(JSON.stringify({ error: "no_user_fallback" }), {
          status: 502, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }
      allCards = [...(userF.cards?.nodes || [])];
      let cursor = userF.cards?.pageInfo?.endCursor;
      let hasNext = userF.cards?.pageInfo?.hasNextPage;
      for (let i = 0; i < 79 && hasNext && cursor; i++) {
        const dn = await gql(token, QP, { a: cursor });
        if (dn.errors || !dn.data?.currentUser?.cards?.nodes?.length) break;
        allCards = allCards.concat(dn.data.currentUser.cards.nodes);
        hasNext = dn.data.currentUser.cards.pageInfo?.hasNextPage;
        cursor = dn.data.currentUser.cards.pageInfo?.endCursor;
      }
      const filtered = allCards.filter(c => {
        const r = (c.rarityTyped || "").toLowerCase();
        const ed = (c.cardEditionName || "").toLowerCase();
        if (r === "limited" || r === "rare" || r === "super_rare" || r === "unique") return true;
        if (ed.startsWith("stellar_")) return true;
        return false;
      });
      return new Response(JSON.stringify({
        data: { currentUser: { slug: user.slug, nickname: user.nickname, cards: { nodes: filtered } } },
        _meta: { mode: "fallback_unfiltered", total: allCards.length, kept: filtered.length },
      }), {
        status: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    // Mode normal : merge non-common + common stellar editions
    const allCards = [...nonCommonRes.cards, ...commonRes.cards];
    const filtered = allCards.filter(c => {
      const r = (c.rarityTyped || "").toLowerCase();
      const ed = (c.cardEditionName || "").toLowerCase();
      if (r === "limited" || r === "rare" || r === "super_rare" || r === "unique") return true;
      if (ed.startsWith("stellar_")) return true;
      return false;
    });

    return new Response(JSON.stringify({
      data: { currentUser: { slug: user.slug, nickname: user.nickname, cards: { nodes: filtered } } },
      _meta: { mode: "split_rarity", non_common: nonCommonRes.cards.length, common: commonRes.cards.length, kept: filtered.length },
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
