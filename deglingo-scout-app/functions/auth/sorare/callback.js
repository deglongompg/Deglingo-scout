/**
 * Cloudflare Pages Function — OAuth Sorare callback
 * Route: /auth/sorare/callback
 *
 * Variables d'environnement à configurer dans Cloudflare Pages :
 *   SORARE_CLIENT_ID     = NPuOENu-LuafKXV1spf6PZpWJbUodzfULnRtntnNP_U
 *   SORARE_CLIENT_SECRET = (le secret, jamais dans le code)
 */

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  // Erreur côté Sorare (user a refusé, etc.)
  if (error || !code) {
    return Response.redirect(`${url.origin}/?sorare_error=${error || "no_code"}`, 302);
  }

  const CLIENT_ID = env.SORARE_CLIENT_ID;
  const CLIENT_SECRET = env.SORARE_CLIENT_SECRET;
  const REDIRECT_URI = `${url.origin}/auth/sorare/callback`;

  // Echange code → access_token
  let tokenData;
  try {
    const resp = await fetch("https://sorare.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error("Sorare token error:", resp.status, text);
      return Response.redirect(`${url.origin}/?sorare_error=token_failed`, 302);
    }

    tokenData = await resp.json();
  } catch (e) {
    console.error("Fetch error:", e);
    return Response.redirect(`${url.origin}/?sorare_error=fetch_failed`, 302);
  }

  const accessToken = tokenData.access_token;
  if (!accessToken) {
    return Response.redirect(`${url.origin}/?sorare_error=no_token`, 302);
  }

  // Redirige vers l'app avec le token dans le hash (jamais dans l'URL query = pas loggué)
  // Le frontend lit window.location.hash et le stocke en localStorage
  return Response.redirect(
    `${url.origin}/?sorare_token=${encodeURIComponent(accessToken)}#stellar`,
    302
  );
}
