// ── Freeze helpers — verrouille les recommandations à des horaires fixes ──

/** Composants Paris d'une Date via Intl (gere CEST/CET + machine timezone n'importe ou) */
function parisParts(d = new Date()) {
  const s = d.toLocaleString("sv", { timeZone: "Europe/Paris" }); // "2026-04-28 18:00:00"
  const [dPart, tPart] = s.split(" ");
  const [y, m, da] = dPart.split("-").map(Number);
  const [h, mi] = tPart.split(":").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, da)).getUTCDay(); // 0=dim,2=mar,5=ven
  return { year: y, month: m, day: da, hour: h, minute: mi, dayOfWeek: dow };
}

/**
 * Construit une Date UTC representant "year-month-day hourPa Paris".
 * Approxime l'offset Paris (+2h CEST en ete, +1h CET en hiver) en regardant
 * l'offset reel de cette date precise via toLocaleString.
 */
function parisToUtc(year, month, day, hour, minute = 0) {
  // 1. Construit une Date UTC naive (year-month-day hour:minute UTC)
  const naiveUtc = new Date(Date.UTC(year, month - 1, day, hour, minute));
  // 2. Que serait l'heure de cette UTC date en Paris ? Compare pour trouver l'offset.
  const naiveParisStr = naiveUtc.toLocaleString("sv", { timeZone: "Europe/Paris" });
  const [, tPart] = naiveParisStr.split(" ");
  const naiveParisHour = parseInt(tPart.split(":")[0]);
  // 3. Offset = (heure Paris affichee) - (heure UTC naive). Ex: si UTC 16h s'affiche 18h Paris -> offset +2h.
  const offsetH = naiveParisHour - hour;
  // 4. Pour avoir 16h Paris on construit Date UTC 16h - offsetH.
  // Mais offsetH peut etre negatif si on est tombe sur un wrap minuit. Normalise via le mod.
  const safeOffset = ((offsetH % 24) + 24) % 24;
  return new Date(Date.UTC(year, month - 1, day, hour - safeOffset, minute));
}

/** Paris time (kept pour retrocompat — utilise maintenant parisParts en interne) */
export function getParisNow() {
  // Ne pas utiliser pour comparer avec setHours/getHours (machine-tz dependent).
  // Prefere parisParts() qui retourne les composants Paris correctement.
  const p = parisParts(new Date());
  return new Date(Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute));
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
  const p = parisParts(new Date()); // { year, month, day, hour, dayOfWeek }
  // Cherche le dernier Vendredi 16h Paris dans les 7 derniers jours
  for (let daysBack = 0; daysBack <= 7; daysBack++) {
    const candDate = new Date(Date.UTC(p.year, p.month - 1, p.day - daysBack));
    const candDow = candDate.getUTCDay();
    if (candDow !== 5) continue;
    // Si daysBack=0 et qu'on est avant 16h Paris -> pas encore passé
    if (daysBack === 0 && p.hour < 16) continue;
    // unlock = Mardi suivant = Vendredi + 4j a 16h Paris
    const unlockDate = new Date(Date.UTC(
      candDate.getUTCFullYear(),
      candDate.getUTCMonth(),
      candDate.getUTCDate() + 4
    ));
    const unlockY = unlockDate.getUTCFullYear();
    const unlockM = unlockDate.getUTCMonth() + 1;
    const unlockD = unlockDate.getUTCDate();
    // Comparaison Paris-aware : (year*1e6 + month*1e4 + day*100 + hour) >= unlock
    const nowKey = p.year * 1e6 + p.month * 1e4 + p.day * 100 + p.hour;
    const unlockKey = unlockY * 1e6 + unlockM * 1e4 + unlockD * 100 + 16;
    if (nowKey >= unlockKey) return null; // deja passé Mardi 16h Paris
    const ymd = `${candDate.getUTCFullYear()}-${String(candDate.getUTCMonth() + 1).padStart(2, "0")}-${String(candDate.getUTCDate()).padStart(2, "0")}`;
    return ymd + "T16:00";
  }
  return null;
}

/**
 * Retourne la clé de verrou daily Stellar :
 * aujourd'hui si Paris >= 12h00, sinon null (pas encore figé).
 * Format : "2026-04-05"
 */
export function getDailyLockKey() {
  const p = parisParts(new Date());
  if (p.hour >= 12) {
    return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
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
  // Logique 100% Paris-aware via parisParts (Intl). Marche depuis n'importe quelle
  // timezone machine. Transition GW : Mardi 16h Paris (gw2->gw1) et Vendredi 16h Paris (gw1->gw2).
  const p = parisParts(new Date());
  const nowKey = p.year * 1e6 + p.month * 1e4 + p.day * 100 + p.hour;

  for (let daysBack = 0; daysBack <= 7; daysBack++) {
    const candDate = new Date(Date.UTC(p.year, p.month - 1, p.day - daysBack));
    const candDow = candDate.getUTCDay();
    if (candDow !== 5 && candDow !== 2) continue;
    // Si on est sur ce meme jour aujourd'hui ET avant 16h Paris -> pas encore passé
    if (daysBack === 0 && p.hour < 16) continue;

    const candY = candDate.getUTCFullYear();
    const candM = candDate.getUTCMonth() + 1;
    const candD = candDate.getUTCDate();

    // gwEnd = candidate + 4j (Ven->Mar) ou +3j (Mar->Ven)
    const offsetDays = candDow === 5 ? 4 : 3;
    const endDate = new Date(Date.UTC(candY, candM - 1, candD + offsetDays));
    const endY = endDate.getUTCFullYear();
    const endM = endDate.getUTCMonth() + 1;
    const endD = endDate.getUTCDate();

    // Cette fenetre est-elle finie ? (now Paris >= end Paris 16h)
    const endKey = endY * 1e6 + endM * 1e4 + endD * 100 + 16;
    if (nowKey >= endKey) continue;

    const gwNumber = candDow === 5 ? 1 : 2;
    // Construit Date UTC representant "16h Paris" pour cohérence avec gwStart/gwEnd
    const gwStart = parisToUtc(candY, candM, candD, 16);
    const gwEnd = parisToUtc(endY, endM, endD, 16);

    const startDateStr = `${candY}-${String(candM).padStart(2, "0")}-${String(candD).padStart(2, "0")}`;
    const endDateStr = `${endY}-${String(endM).padStart(2, "0")}-${String(endD).padStart(2, "0")}`;
    const gwKey = `pro_${startDateStr}_gw${gwNumber}`;

    return { gwKey, gwStart, gwEnd, gwNumber, startDateStr, endDateStr };
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
  // Utilise UTC operations sur les Dates parisToUtc (= UTC representant 16h Paris).
  const prevEnd = current.gwStart;
  const prevEndDow = prevEnd.getUTCDay(); // UTC day = Paris day (cf parisToUtc)
  const daysBack = prevEndDow === 2 ? 4 : prevEndDow === 5 ? 3 : 4;
  // Construit prevStart Paris = prevEnd Paris - daysBack jours, a 16h Paris
  const prevStartParts = parisParts(new Date(prevEnd.getTime() - daysBack * 86400000));
  const prevStart = parisToUtc(prevStartParts.year, prevStartParts.month, prevStartParts.day, 16);
  const prevGwNumber = prevEndDow === 5 ? 2 : 1;
  const prevStartStr = `${prevStartParts.year}-${String(prevStartParts.month).padStart(2, "0")}-${String(prevStartParts.day).padStart(2, "0")}`;
  const prevEndStr = current.startDateStr;
  const prev = {
    gwKey: `pro_${prevStartStr}_gw${prevGwNumber}`,
    gwStart: prevStart,
    gwEnd: prevEnd,
    gwNumber: prevGwNumber,
    startDateStr: prevStartStr,
    endDateStr: prevEndStr,
    displayNumber: currentGwNumber - 1,
    isLive: false,
    isPast: true,
    offsetFromLive: -1,
  };

  const list = [prev, current];
  let cursorParts = parisParts(current.gwEnd);
  for (let i = 1; i < count; i++) {
    const gwStart = parisToUtc(cursorParts.year, cursorParts.month, cursorParts.day, 16);
    const startDow = gwStart.getUTCDay();
    const daysToAdd = startDow === 2 ? 3 : startDow === 5 ? 4 : 3;
    const endParts = parisParts(new Date(gwStart.getTime() + daysToAdd * 86400000));
    const gwEnd = parisToUtc(endParts.year, endParts.month, endParts.day, 16);
    const gwNumber = startDow === 5 ? 1 : 2;
    const startDateStr = `${cursorParts.year}-${String(cursorParts.month).padStart(2, "0")}-${String(cursorParts.day).padStart(2, "0")}`;
    const endDateStr = `${endParts.year}-${String(endParts.month).padStart(2, "0")}-${String(endParts.day).padStart(2, "0")}`;
    const gwKey = `pro_${startDateStr}_gw${gwNumber}`;
    list.push({
      gwKey, gwStart, gwEnd, gwNumber, startDateStr, endDateStr,
      displayNumber: currentGwNumber + i,
      isLive: false, offsetFromLive: i,
    });
    cursorParts = endParts;
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
