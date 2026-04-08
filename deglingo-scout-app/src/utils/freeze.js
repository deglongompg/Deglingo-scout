// ── Freeze helpers — verrouille les recommandations à des horaires fixes ──

/** Paris time (UTC+2 — simplifié, suffisant pour GW) */
export function getParisNow() {
  return new Date(Date.now() + 2 * 60 * 60 * 1000);
}

/**
 * Retourne la clé de verrou GW en cours.
 *
 * Fenêtre de gel : Vendredi 16h → Mardi 16h (même semaine + 4 jours).
 * - Si maintenant est dans cette fenêtre → picks gelés (retourne la clé du Vendredi)
 * - Sinon (Mardi 16h → Vendredi 16h suivant) → picks live (retourne null)
 *
 * Format clé : "2026-04-11T16:00"
 */
export function getGwLockKey() {
  const now = getParisNow();

  // Cherche le dernier Vendredi à 16h (7 jours max)
  for (let daysBack = 0; daysBack <= 7; daysBack++) {
    const fri = new Date(now);
    fri.setDate(fri.getDate() - daysBack);
    fri.setHours(16, 0, 0, 0);

    if (fri.getDay() !== 5) continue; // pas un vendredi
    if (fri > now) continue;          // pas encore passé

    // Mardi suivant = Vendredi + 4 jours, 16h
    const unlock = new Date(fri);
    unlock.setDate(unlock.getDate() + 4);
    unlock.setHours(16, 0, 0, 0);

    // Sommes-nous dans la fenêtre [Vendredi 16h → Mardi 16h] ?
    if (now < unlock) {
      return fri.toISOString().slice(0, 10) + "T16:00";
    } else {
      // Le Mardi de unlock est déjà passé → picks live
      return null;
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
