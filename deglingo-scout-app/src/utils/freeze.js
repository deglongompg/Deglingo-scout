// ── Freeze helpers — verrouille les recommandations à des horaires fixes ──

/** Paris time (UTC+2 — simplifié, suffisant pour l10/GW) */
export function getParisNow() {
  return new Date(Date.now() + 2 * 60 * 60 * 1000);
}

/**
 * Retourne la clé de verrou GW en cours :
 * le dernier Vendredi OU Mardi à 16h00 Paris écoulé.
 * Format : "2026-04-04T16:00"
 */
export function getGwLockKey() {
  const now = getParisNow();
  for (let daysBack = 0; daysBack <= 7; daysBack++) {
    const d = new Date(now);
    d.setDate(d.getDate() - daysBack);
    d.setHours(16, 0, 0, 0);
    const wd = d.getDay(); // 0=Sun 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri 6=Sat
    if (wd === 5 || wd === 2) { // Vendredi ou Mardi
      if (d <= now) {
        const ymd = d.toISOString().slice(0, 10);
        return `${ymd}T16:00`;
      }
    }
  }
  return null;
}

/**
 * Retourne la clé de verrou daily Stellar :
 * aujourd'hui si Paris >= 12h00, sinon null (pas encore figé).
 * Format : "2026-04-05"
 */
export function getDailyLockKey() {
  const now = getParisNow();
  const hh = now.getUTCHours();
  const mm = now.getUTCMinutes();
  if (hh > 12 || (hh === 12 && mm >= 0)) {
    return now.toISOString().slice(0, 10);
  }
  return null;
}

/** Lit depuis localStorage, retourne null si absent ou erreur */
export function loadFrozen(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

/** Sauvegarde dans localStorage, ignore les erreurs */
export function saveFrozen(key, data) {
  try { localStorage.setItem(key, JSON.stringify(data)); } catch {}
}
