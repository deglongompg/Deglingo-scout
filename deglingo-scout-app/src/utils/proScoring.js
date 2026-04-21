/**
 * Helpers partagés Sorare Pro — paliers de rewards + calculs scores saved teams.
 * Utilisés par SorareProTab (section Recap) et RecapTab (onglet Mes Teams).
 */

export const PRO_LEAGUES = ["L1", "PL", "Liga", "Bundes", "MLS"];
export const TEAM_SLOTS = ["GK", "DEF", "MIL", "ATT", "FLEX"];

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

export function getPaliers(league, rarity) {
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
 * Formule Sorare officielle : post-bonus + (capitaine ? post-bonus × 0.5 : 0)
 * @param {boolean} isCap
 * @returns {{ full: number, isLive: boolean }}
 */
export function getPickScore(pick, isCap) {
  const card = getPickCard(pick);
  const power = (card?.power && card.power > 1) ? card.power : 1;
  // Match joué : utiliser le vrai score Sorare
  if (pick?.last_so5_date && pick?.matchDate && pick.last_so5_date === pick.matchDate && pick.last_so5_score != null) {
    const postBonus = pick.last_so5_score * power;
    const captainBonus = isCap ? postBonus * 0.5 : 0;
    return { full: postBonus + captainBonus, isLive: true };
  }
  // Projection : utiliser ds
  const base = pick?.ds || 0;
  const postBonus = base * power;
  const captainBonus = isCap ? postBonus * 0.5 : 0;
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
  const picks = TEAM_SLOTS.map(slot => {
    const raw = team.picks?.[slot];
    return raw ? { ...enrichPick(raw, players), _slot: slot } : null;
  }).filter(Boolean);

  const captainSlot = team.captain;
  const captainPick = captainSlot && team.picks?.[captainSlot] ? picks.find(p => p._slot === captainSlot) : null;
  const captainId = captainPick ? (captainPick.slug || captainPick.name) : null;

  const infos = picks.map(p => {
    const isCap = captainId && (p.slug || p.name) === captainId;
    const { full, isLive } = getPickScore(p, isCap);
    return { p, full, isLive, isCap };
  });

  const clubCounts = {};
  picks.forEach(p => { clubCounts[p.club] = (clubCounts[p.club] || 0) + 1; });
  const multiClub = picks.length === 5 && Object.values(clubCounts).every(c => c <= 2);
  const sumL10 = picks.reduce((s, p) => s + (p.l10 || 0), 0);
  const cap260 = picks.length === 5 && sumL10 < 260;
  const compoPct = (multiClub ? 2 : 0) + (cap260 ? 4 : 0);

  const rawBase = picks.reduce((s, p) => s + (p.ds || 0), 0);
  const rawFull = infos.reduce((s, x) => s + x.full, 0);
  const liveRaw = infos.filter(x => x.isLive).reduce((s, x) => s + x.full, 0);

  const projectedTotal = Math.round(rawFull * (1 + compoPct / 100));
  const liveTotal = Math.round(liveRaw * (1 + compoPct / 100));
  const bonusPts = Math.round(rawFull - rawBase);

  return { picks, infos, captainId, multiClub, cap260, compoPct, projectedTotal, liveTotal, bonusPts };
}
