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

/**
 * Sorare Pro — détecte la GW en cours (2 GW par semaine).
 * GW1 : Vendredi 16h → Mardi 16h
 * GW2 : Mardi 16h → Vendredi 16h
 *
 * Retourne { gwKey, gwStart, gwEnd, gwNumber, startDateStr, endDateStr } ou null.
 */
export function getProGwInfo() {
  const now = getParisNow();

  // Cherche le dernier Vendredi ou Mardi à 16h (7 jours max)
  for (let daysBack = 0; daysBack <= 7; daysBack++) {
    const candidate = new Date(now);
    candidate.setDate(candidate.getDate() - daysBack);
    candidate.setHours(16, 0, 0, 0);

    const dayOfWeek = candidate.getDay(); // 0=dim, 2=mar, 5=ven
    if (dayOfWeek !== 5 && dayOfWeek !== 2) continue;
    if (candidate > now) continue;

    // Calcul de la fin de la GW
    const gwEnd = new Date(candidate);
    if (dayOfWeek === 5) {
      // GW1 : Vendredi 16h → Mardi 16h (+4 jours)
      gwEnd.setDate(gwEnd.getDate() + 4);
    } else {
      // GW2 : Mardi 16h → Vendredi 16h (+3 jours)
      gwEnd.setDate(gwEnd.getDate() + 3);
    }
    gwEnd.setHours(16, 0, 0, 0);

    if (now >= gwEnd) continue; // cette fenêtre est finie

    const gwNumber = dayOfWeek === 5 ? 1 : 2;
    const gwKey = `pro_${candidate.toISOString().slice(0, 10)}_gw${gwNumber}`;
    // Dates pour filtrer les fixtures (jour du début → jour de fin)
    const startDateStr = candidate.toISOString().slice(0, 10);
    const endDateStr = gwEnd.toISOString().slice(0, 10);

    return { gwKey, gwStart: candidate, gwEnd, gwNumber, startDateStr, endDateStr };
  }
  return null;
}

/**
 * Sorare Pro — retourne les N prochaines GW (y compris la GW en cours).
 * Chaque GW = { gwKey, gwStart, gwEnd, gwNumber, startDateStr, endDateStr, label }
 */
// GW69 = 10 avr 2026 (gameWeek interne 673, offset 604)
// Epoch de reference : GW69 commence le 10 avril 2026 a 14h UTC
const GW_EPOCH_DATE = new Date("2026-04-10T14:00:00Z");
const GW_EPOCH_NUMBER = 69;

export function getProGwList(count = 5) {
  const current = getProGwInfo();
  if (!current) return [];
  // Calculer le numero GW affiche pour la GW actuelle
  // Chaque GW dure 3-4 jours, on compte le nombre de GW depuis l'epoch
  const msSinceEpoch = current.gwStart.getTime() - GW_EPOCH_DATE.getTime();
  const avgGwDuration = 3.5 * 24 * 60 * 60 * 1000; // ~3.5 jours en moyenne
  const gwOffset = Math.round(msSinceEpoch / avgGwDuration);
  const currentGwNumber = GW_EPOCH_NUMBER + gwOffset;
  current.displayNumber = currentGwNumber;
  current.isLive = true;
  current.offsetFromLive = 0;

  // GW precedente (pour consultation apres deadline) : se termine quand la current commence
  const prevEnd = new Date(current.gwStart);
  const prevStart = new Date(prevEnd);
  const prevEndDay = prevEnd.getDay();
  // Si current commence un mardi → la precedente commence un vendredi (4 jours avant)
  // Si current commence un vendredi → la precedente commence un mardi (3 jours avant)
  const daysBack = prevEndDay === 2 ? 4 : prevEndDay === 5 ? 3 : 4;
  prevStart.setDate(prevStart.getDate() - daysBack);
  prevStart.setHours(16, 0, 0, 0);
  const prevGwNumber = prevEndDay === 5 ? 2 : 1; // si current=ven→prev=mar(gw2), si current=mar→prev=ven(gw1)
  const prev = {
    gwKey: `pro_${prevStart.toISOString().slice(0, 10)}_gw${prevGwNumber}`,
    gwStart: prevStart,
    gwEnd: prevEnd,
    gwNumber: prevGwNumber,
    startDateStr: prevStart.toISOString().slice(0, 10),
    endDateStr: prevEnd.toISOString().slice(0, 10),
    displayNumber: currentGwNumber - 1,
    isLive: false,
    isPast: true,
    offsetFromLive: -1,
  };

  const list = [prev, current];
  let cursor = new Date(current.gwEnd);
  for (let i = 1; i < count; i++) {
    // La GW suivante commence exactement quand la precedente finit
    const gwStart = new Date(cursor);
    const dayOfWeek = gwStart.getDay(); // 0=dim, 2=mar, 5=ven
    // Si on est a un Mardi 16h → prochaine fin = Vendredi 16h (+3j)
    // Si on est a un Vendredi 16h → prochaine fin = Mardi 16h (+4j)
    const daysToAdd = dayOfWeek === 2 ? 3 : dayOfWeek === 5 ? 4 : 3; // fallback 3
    const gwEnd = new Date(gwStart);
    gwEnd.setDate(gwEnd.getDate() + daysToAdd);
    gwEnd.setHours(16, 0, 0, 0);
    const gwNumber = dayOfWeek === 5 ? 1 : 2;
    const gwKey = `pro_${gwStart.toISOString().slice(0, 10)}_gw${gwNumber}`;
    const startDateStr = gwStart.toISOString().slice(0, 10);
    const endDateStr = gwEnd.toISOString().slice(0, 10);
    list.push({
      gwKey, gwStart, gwEnd, gwNumber, startDateStr, endDateStr,
      displayNumber: currentGwNumber + i,
      isLive: false, offsetFromLive: i,
    });
    cursor = gwEnd;
  }
  return list;
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
