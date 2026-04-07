/**
 * Cloudflare Pages Function — Déconnexion Sorare
 * Efface le cookie httpOnly et redirige vers l'app.
 */

export async function onRequestGet() {
  return new Response(null, {
    status: 302,
    headers: {
      "Location": "https://scout.deglingosorare.com/",
      "Set-Cookie": [
        "sorare_token=",
        "HttpOnly",
        "Secure",
        "SameSite=Strict",
        "Path=/",
        "Max-Age=0",
        "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
      ].join("; "),
    },
  });
}
