/**
 * Cloudflare Pages Function — OAuth callback Sorare
 * Reçoit le code d'autorisation, échange contre un access_token,
 * stocke dans un cookie httpOnly Secure (jamais exposé au JS frontend).
 *
 * Variables d'environnement Cloudflare requises :
 *   SORARE_CLIENT_ID     — UID public (peut être en clair)
 *   SORARE_CLIENT_SECRET — Secret (jamais dans le code !)
 */

const APP_URL      = "https://scout.deglingosorare.com";
const CALLBACK_URL = `${APP_URL}/auth/sorare/callback`;
const TOKEN_URL    = "https://api.sorare.com/oauth/token";

export async function onRequestGet(context) {
  const { request, env } = context;
  const url   = new URL(request.url);
  const code  = url.searchParams.get("code");
  const state = url.searchParams.get("state") || "";
  const error = url.searchParams.get("error");

  // Erreur renvoyée par Sorare (refus utilisateur, etc.)
  if (error || !code) {
    return redirect(`${APP_URL}/#sorare_error=${encodeURIComponent(error || "no_code")}&state=${state}`);
  }

  // Échange code → access_token (client_secret reste côté serveur)
  let tokenData;
  try {
    const res = await fetch(TOKEN_URL, {
      method:  "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept":        "application/json",
      },
      body: new URLSearchParams({
        grant_type:    "authorization_code",
        code,
        redirect_uri:  CALLBACK_URL,
        client_id:     env.SORARE_CLIENT_ID,
        client_secret: env.SORARE_CLIENT_SECRET,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error("Sorare token error:", res.status, body);
      return redirect(`${APP_URL}/#sorare_error=token_failed&state=${state}`);
    }

    tokenData = await res.json();
  } catch (err) {
    console.error("Sorare token exception:", err);
    return redirect(`${APP_URL}/#sorare_error=exception&state=${state}`);
  }

  const { access_token } = tokenData;
  if (!access_token) {
    return redirect(`${APP_URL}/#sorare_error=no_token&state=${state}`);
  }

  // Token stocké dans un cookie httpOnly Secure — inaccessible au JS
  // Max-Age : 23h (les tokens Sorare expirent généralement dans les 24h)
  return new Response(null, {
    status: 302,
    headers: {
      "Location":   `${APP_URL}/#sorare_authed=1&state=${state}`,
      "Set-Cookie": [
        `sorare_token=${access_token}`,
        "HttpOnly",
        "Secure",
        "SameSite=Strict",
        "Path=/",
        "Max-Age=82800",
      ].join("; "),
    },
  });
}

function redirect(url) {
  return new Response(null, { status: 302, headers: { "Location": url } });
}
