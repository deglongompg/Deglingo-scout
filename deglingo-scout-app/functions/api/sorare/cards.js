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
      footballCards(first: 500) {
        nodes {
          slug
          player {
            slug
            displayName
            position
          }
          rarity
          pictureUrl(derivative: "tinified_card_png")
          season {
            startYear
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
      },
      body: JSON.stringify({ query: CARDS_QUERY }),
    });

    if (res.status === 401) {
      return new Response(JSON.stringify({ error: "token_expired" }), {
        status: 401,
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": "sorare_token=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT",
        },
      });
    }

    if (!res.ok) {
      return json({ error: "sorare_api_error", status: res.status }, 502);
    }

    const data = await res.json();

    if (data.errors?.length) {
      return json({ error: "graphql_error", details: data.errors }, 502);
    }

    return json(data, 200);

  } catch (err) {
    return json({ error: "fetch_error" }, 500);
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
