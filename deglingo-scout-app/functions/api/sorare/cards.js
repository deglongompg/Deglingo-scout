/**
 * Cloudflare Pages Function — Proxy API Sorare : cartes du joueur connecté
 * Lit le cookie httpOnly, appelle l'API Sorare GraphQL, retourne les données.
 * Le frontend ne voit jamais le token — il appelle juste /api/sorare/cards.
 */

const SORARE_GQL = "https://api.sorare.com/graphql";

const CARDS_QUERY = `
  query DeglingSorareCards {
    currentUser {
      slug
      nickname
      cards(first: 500) {
        nodes {
          slug
          rarityTyped
          ... on Card {
            player {
              slug
              displayName
            }
          }
        }
      }
    }
  }
`;

export async function onRequestGet(context) {
  const { request } = context;

  // Lire le token depuis le cookie httpOnly
  const cookieHeader = request.headers.get("Cookie") || "";
  const match = cookieHeader.match(/(?:^|;\s*)sorare_token=([^;]+)/);
  const token = match ? match[1] : null;

  // Non authentifié
  if (!token) {
    return json({ error: "not_authenticated" }, 401);
  }

  // Appel GraphQL Sorare avec le token Bearer
  try {
    const res = await fetch(SORARE_GQL, {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Accept":        "application/json",
        "Authorization": `Bearer ${token}`,
        "User-Agent":    "Deglingo-Scout/1.0",
      },
      body: JSON.stringify({ query: CARDS_QUERY }),
    });

    const statusCode = res.status;
    const rawBody = await res.text().catch(() => "");

    // DEBUG : toujours 200 pour éviter que Cloudflare mange nos erreurs
    if (statusCode === 401) {
      return json({ ok: false, error: "token_expired", debug_status: 401 }, 200);
    }

    if (!res.ok) {
      return json({ ok: false, error: "sorare_api_error", debug_status: statusCode, body: rawBody.slice(0, 1000) }, 200);
    }

    let data;
    try { data = JSON.parse(rawBody); }
    catch (e) { return json({ ok: false, error: "json_parse_error", raw: rawBody.slice(0, 500) }, 200); }

    if (data.errors?.length) {
      return json({ ok: false, error: "graphql_error", details: data.errors }, 200);
    }

    return json({ ok: true, ...data }, 200);

  } catch (err) {
    return json({ ok: false, error: "fetch_exception", message: String(err) }, 200);
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
