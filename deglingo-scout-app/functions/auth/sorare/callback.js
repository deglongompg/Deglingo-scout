/**
 * Cloudflare Pages Function — OAuth callback Sorare
 * Échange le code contre un access_token, puis le passe au frontend via URL hash.
 * Le frontend stocke le token dans localStorage et fait les appels GraphQL directement.
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

  if (error || !code) {
    return redirect(`${APP_URL}/?tab=stellar#sorare_error=${encodeURIComponent(error || "no_code")}&state=${state}`);
  }

  let tokenData;
  try {
    const res = await fetch(TOKEN_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json" },
      body: new URLSearchParams({
        grant_type:    "authorization_code",
        code,
        redirect_uri:  CALLBACK_URL,
        client_id:     env.SORARE_CLIENT_ID,
        client_secret: env.SORARE_CLIENT_SECRET,
      }),
    });

    if (!res.ok) {
      return redirect(`${APP_URL}/?tab=stellar#sorare_error=token_failed&state=${state}`);
    }
    tokenData = await res.json();
  } catch (err) {
    return redirect(`${APP_URL}/?tab=stellar#sorare_error=exception&state=${state}`);
  }

  const { access_token } = tokenData;
  if (!access_token) {
    return redirect(`${APP_URL}/?tab=stellar#sorare_error=no_token&state=${state}`);
  }

  // Passe le token au frontend via URL hash (jamais dans les query params = logs serveur)
  return redirect(`${APP_URL}/?tab=stellar#sorare_token=${access_token}&state=${state}`);
}

function redirect(url) {
  return new Response(null, { status: 302, headers: { "Location": url } });
}
