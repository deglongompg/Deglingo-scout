/**
 * Cloud sync via Cloudflare KV — indexe les teams sauvegardees par compte Sorare.
 * Double-ecriture: localStorage (offline) + KV (cross-device). Lecture privilegie KV si connecte.
 *
 * Toutes les fonctions prennent le token Sorare (ou null si pas connecte).
 */

const API = "/api/teams";

function getToken() {
  try { return localStorage.getItem("sorare_access_token") || null; } catch { return null; }
}

/**
 * Push une liste de teams vers KV.
 * @param {"pro"|"stellar"} scope
 * @param {object} meta  pro: { league, rarity, gwKey }  stellar: { dateStr }
 * @param {Array} teams  contenu a sauvegarder (memes objets que localStorage)
 */
export async function pushTeams(scope, meta, teams) {
  const token = getToken();
  if (!token) return { ok: false, reason: "no_token" };
  try {
    const res = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ scope, teams, ...meta }),
    });
    if (!res.ok) return { ok: false, reason: `http_${res.status}` };
    return await res.json();
  } catch (e) {
    return { ok: false, reason: "network", error: String(e) };
  }
}

/**
 * Fetch full store cloud du user connecte.
 * @returns {Promise<null|{slug:string, data:object}>}
 */
export async function fetchCloudStore() {
  const token = getToken();
  if (!token) return null;
  try {
    const res = await fetch(API, { headers: { "Authorization": `Bearer ${token}` } });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

/**
 * Lecture d'un scope precis depuis le store cloud deja fetche.
 * Ne refait pas d'appel reseau.
 */
export function extractProTeams(store, league, rarity, gwKey) {
  const bucket = rarity === "rare" ? "proRare" : "proLimited";
  return store?.data?.[bucket]?.[league]?.[gwKey] || null;
}

export function extractStellarTeams(store, dateStr) {
  return store?.data?.stellar?.[dateStr] || null;
}

/**
 * Merge cloud > localStorage : si cloud a une entree pour la cle, on adopte sa version.
 * Appele au mount pour hydrater les composants quand l'user est connecte.
 */
export async function hydrateFromCloud(setters) {
  const store = await fetchCloudStore();
  if (!store) return null;
  if (typeof setters === "function") setters(store);
  return store;
}
