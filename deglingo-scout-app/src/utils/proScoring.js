/**
 * Helpers partagés Sorare Pro — paliers de rewards + calculs scores saved teams.
 * Utilisés par SorareProTab (section Recap) et RecapTab (onglet Mes Teams).
 */

export const PRO_LEAGUES = ["L1", "PL", "Liga", "Bundes", "MLS", "Champion"];
// Standard Sorare Pro SO5 : 5 joueurs (1 GK + 1 DEF + 1 MIL + 1 ATT + 1 FLEX)
export const TEAM_SLOTS = ["GK", "DEF", "MIL", "ATT", "FLEX"];
// Champion SO7 : 7 joueurs (1 GK + 2 DEF + 2 MIL + 1 ATT + 1 FLEX)
export const TEAM_SLOTS_CHAMPION = ["GK", "DEF1", "DEF2", "MIL1", "MIL2", "ATT", "FLEX"];

/** Returns the slots array for a given league (5 slots standard, 7 for Champion). */
export function getTeamSlots(league) {
  return league === "Champion" ? TEAM_SLOTS_CHAMPION : TEAM_SLOTS;
}

/** Number of picks expected in a full team for this league. */
export function getExpectedPicks(league) {
  return league === "Champion" ? 7 : 5;
}

/** L10 cap threshold triggering the +4% bonus (CAP260 standard, CAP370 Champion). */
export function getCapThreshold(league) {
  return league === "Champion" ? 370 : 260;
}

/** Resout la position "logique" d'un slot (DEF1 -> DEF, MIL2 -> MIL, etc). */
export function getSlotPosition(slot) {
  if (slot === "DEF1" || slot === "DEF2") return "DEF";
  if (slot === "MIL1" || slot === "MIL2") return "MIL";
  return slot;
}

/** Ligues accessibles depuis le pool Champion (4 grands championnats, pas MLS). */
export const CHAMPION_SOURCE_LEAGUES = ["L1", "PL", "Liga", "Bundes"];

// GW epoch (aligned sur freeze.js : GW69 = 2026-04-10 14:00 UTC)
const GW_EPOCH_DATE_MS = new Date("2026-04-10T14:00:00Z").getTime();
const GW_EPOCH_NUMBER = 69;

/**
 * Derive le numero de GW affiche (GW71, GW72, ...) depuis une gwKey du type "pro_2026-04-17_gw1".
 * Utilise l'epoch GW69 et la duree moyenne d'une GW (~3.5 jours).
 */
export function getGwDisplayNumber(gwKey) {
  if (!gwKey) return null;
  const m = /^pro_(\d{4}-\d{2}-\d{2})_gw\d$/.exec(gwKey);
  if (!m) return null;
  const startMs = new Date(`${m[1]}T14:00:00Z`).getTime();
  const avgGwDuration = 3.5 * 24 * 60 * 60 * 1000;
  const offset = Math.round((startMs - GW_EPOCH_DATE_MS) / avgGwDuration);
  return GW_EPOCH_NUMBER + offset;
}

const EU_LEAGUES = ["L1", "PL", "Liga", "Bundes"];

const PALIERS_EU_LIMITED = [
  { pts: 360, reward: "$5", color: "#94A3B8" },
  { pts: 380, reward: "$10", color: "#60A5FA" },
  { pts: 400, reward: "$50", color: "#A78BFA" },
  { pts: 420, reward: "$200", color: "#C084FC" },
  { pts: 460, reward: "$1 000", color: "#F59E0B" },
];
const PALIERS_EU_RARE = [
  { pts: 400, reward: "$20", color: "#94A3B8" },
  { pts: 420, reward: "$40", color: "#60A5FA" },
  { pts: 440, reward: "$200", color: "#A78BFA" },
  { pts: 460, reward: "$800", color: "#C084FC" },
  { pts: 510, reward: "$4 000", color: "#EF4444", fire: true },
];
const PALIERS_OTHER_LIMITED = [
  { pts: 340, reward: "500 Ess", color: "#94A3B8" },
  { pts: 380, reward: "2k Ess", color: "#60A5FA" },
  { pts: 400, reward: "$25", color: "#A78BFA" },
  { pts: 420, reward: "$100", color: "#C084FC" },
  { pts: 460, reward: "$500", color: "#F59E0B" },
];
const PALIERS_OTHER_RARE = [
  { pts: 380, reward: "500 Ess", color: "#94A3B8" },
  { pts: 420, reward: "$20", color: "#60A5FA" },
  { pts: 440, reward: "$100", color: "#A78BFA" },
  { pts: 460, reward: "$400", color: "#C084FC" },
  { pts: 510, reward: "$2 000", color: "#EF4444", fire: true },
];
// Champion : pas de rewards dollar (gains = cartes), echelle etendue jusqu'a 650.
// 6 paliers equidistants (linear scale) pour une jauge simple et lisible.
const PALIERS_CHAMPION = [
  { pts: 400, reward: "", color: "#64748B" },
  { pts: 450, reward: "", color: "#60A5FA" },
  { pts: 500, reward: "", color: "#A78BFA" },
  { pts: 550, reward: "", color: "#C084FC" },
  { pts: 600, reward: "", color: "#F472B6" },
  { pts: 650, reward: "", color: "#EF4444" },
];

export function getPaliers(league, rarity) {
  if (league === "Champion") return PALIERS_CHAMPION;
  const isEU = EU_LEAGUES.includes(league);
  if (rarity === "rare") return isEU ? PALIERS_EU_RARE : PALIERS_OTHER_RARE;
  return isEU ? PALIERS_EU_LIMITED : PALIERS_OTHER_LIMITED;
}

const TZ = "Europe/Paris";
export function utcToParisTime(utcTimeStr, dateStr) {
  if (!utcTimeStr || utcTimeStr === "TBD") return "";
  try {
    const d = new Date(`${dateStr}T${utcTimeStr}:00Z`);
    return d.toLocaleTimeString("fr-FR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
  } catch { return utcTimeStr; }
}

/**
 * Enrichit un pick avec les données fraîches du joueur (last_so5, titu%, injured...).
 * Le pick sauvegardé peut être stale — on va chercher la dernière version dans `players`.
 */
export function enrichPick(pick, players) {
  if (!pick) return null;
  const fresh = players?.find?.(p => p.slug === pick.slug);
  if (!fresh) return pick;
  return {
    ...pick,
    sorare_starter_pct: fresh.sorare_starter_pct,
    injured: fresh.injured,
    suspended: fresh.suspended,
    last_so5_score: fresh.last_so5_score,
    last_so5_date: fresh.last_so5_date,
    last_match_home_goals: fresh.last_match_home_goals,
    last_match_away_goals: fresh.last_match_away_goals,
    last_match_status: fresh.last_match_status,
    last_so5_decisives: fresh.last_so5_decisives,
    // Refresh l10 pour matcher le L10 OFFICIEL Sorare actualise (CAP260 calcul correct)
    l10: fresh.l10,
    // Refresh aussi ds car il peut bouger entre la save et la lecture (forme du joueur)
    ds: fresh.ds,
  };
}

/**
 * Récupère la carte Sorare attachée au pick (sauvegardée au moment du save).
 * Fallback sur null si saved team legacy sans _card.
 */
export function getPickCard(pick) {
  return pick?._card || null;
}

export function getPowerPct(pick) {
  const card = getPickCard(pick);
  return card?.power ? Math.round((card.power - 1) * 100) : 0;
}

/**
 * Score d'un pick avec bonus power + bonus capitaine.
 * Formule Sorare officielle : post-bonus + (capitaine ? RAW × 0.5 : 0)
 *
 * IMPORTANT — RAW est FLOOR avant calcul. Sorare affiche les scores SO5 en
 * entiers (la bulle Sorare montre 71 pour un raw "71.7") et applique le power
 * + captain mult sur cette valeur entiere. Notre fetch stocke les decimales,
 * donc on doit floor avant le calcul pour matcher (sinon +3 a 5 pts d'ecart
 * cumule sur les 5 cartes).
 *
 * @param {boolean} isCap
 * @returns {{ full: number, isLive: boolean }}
 */
export function getPickScore(pick, isCap) {
  const card = getPickCard(pick);
  // Power Sorare : peut etre > 1 (bonus positif) OU < 1 (malus, ex: classic en fin
  // de saison avec power 0.88 = -12%). On applique tant que power est defini.
  // Fallback sur 1 uniquement si power null/undefined (carte non Sorare/inconnue).
  const power = (card?.power != null && card.power > 0) ? card.power : 1;
  // Match joué : utiliser le vrai score Sorare (floor pour matcher l'affichage Sorare)
  if (pick?.last_so5_date && pick?.matchDate && pick.last_so5_date === pick.matchDate && pick.last_so5_score != null) {
    const raw = Math.floor(pick.last_so5_score);
    const postBonus = raw * power;
    const captainBonus = isCap ? raw * 0.5 : 0;
    return { full: postBonus + captainBonus, isLive: true };
  }
  // Projection : utiliser ds (deja entier)
  const raw = pick?.ds || 0;
  const postBonus = raw * power;
  const captainBonus = isCap ? raw * 0.5 : 0;
  return { full: postBonus + captainBonus, isLive: false };
}

/**
 * Calcule les stats agrégées d'une team sauvegardée :
 * - liveTotal : somme des scores live uniquement (matchs joués), avec bonus compo
 * - projectedTotal : somme projection complète (matchs non joués = ds), avec bonus compo
 * - cap260 : true si somme L10 < 260 (bonus +4%)
 * - multiClub : true si 5 joueurs et aucun club représenté > 2 fois (bonus +2%)
 * - compoPct : somme des bonus compo (0/2/4/6 selon combinaison)
 * - bonusPts : total bonus points vs base ds brut
 */
export function computeTeamScores(team, players) {
  // Detect Champion via slot keys in team.picks (DEF1/DEF2/MIL1/MIL2 = Champion, GK/DEF/MIL/ATT/FLEX = others).
  // Avoids needing to pass league explicitly and works for any saved team format.
  const pickKeys = team.picks ? Object.keys(team.picks) : [];
  const isChampionShape = pickKeys.some(k => k === "DEF1" || k === "DEF2" || k === "MIL1" || k === "MIL2");
  const slots = isChampionShape ? TEAM_SLOTS_CHAMPION : TEAM_SLOTS;
  const picks = slots.map(slot => {
    const raw = team.picks?.[slot];
    return raw ? { ...enrichPick(raw, players), _slot: slot } : null;
  }).filter(Boolean);

  // Captain : team.captain peut etre null pour les saves "auto-captain"
  // (l'utilisateur n'a pas clique explicitement sur le badge C → on stockait null).
  // Fallback : on calcule l'auto-captain (highest DS x power) sur les picks effectifs.
  // Retrocompatibilite avec les saves existantes — sinon le captain bonus est perdu.
  let captainSlot = team.captain;
  let captainPick = captainSlot && team.picks?.[captainSlot] ? picks.find(p => p._slot === captainSlot) : null;
  if (!captainPick && picks.length > 0) {
    const adjScores = picks.map(p => {
      const card = getPickCard(p);
      const power = (card?.power && card.power > 1) ? card.power : 1;
      return (p.ds || 0) * power;
    });
    const idx = adjScores.indexOf(Math.max(...adjScores));
    if (idx >= 0) {
      captainPick = picks[idx];
      captainSlot = captainPick._slot;
    }
  }
  const captainId = captainPick ? (captainPick.slug || captainPick.name) : null;

  const infos = picks.map(p => {
    const isCap = captainId && (p.slug || p.name) === captainId;
    const { full, isLive } = getPickScore(p, isCap);
    return { p, full, isLive, isCap };
  });

  const clubCounts = {};
  picks.forEach(p => { clubCounts[p.club] = (clubCounts[p.club] || 0) + 1; });
  const expectedSize = isChampionShape ? 7 : 5;
  const multiClub = picks.length === expectedSize && Object.values(clubCounts).every(c => c <= 2);
  const sumL10 = picks.reduce((s, p) => s + (p.l10 || 0), 0);
  // Sorare utilise <= 260 (pas <), confirme par sumL10=260 exact qui declenche CAP chez Sorare
  const cap260 = picks.length === expectedSize && sumL10 <= 260;
  const compoPct = (multiClub ? 2 : 0) + (cap260 ? 4 : 0);

  const rawBase = picks.reduce((s, p) => s + (p.ds || 0), 0);
  const rawFull = infos.reduce((s, x) => s + x.full, 0);
  const liveRaw = infos.filter(x => x.isLive).reduce((s, x) => s + x.full, 0);

  // Math.floor (pas round) pour matcher exactement Sorare. Sorare tronque la
  // partie decimale du total final au lieu d'arrondir : 277.93 -> 277, pas 278.
  const projectedTotal = Math.floor(rawFull * (1 + compoPct / 100));
  const liveTotal = Math.floor(liveRaw * (1 + compoPct / 100));
  const bonusPts = Math.floor(rawFull - rawBase);

  return { picks, infos, captainId, multiClub, cap260, compoPct, projectedTotal, liveTotal, bonusPts };
}
