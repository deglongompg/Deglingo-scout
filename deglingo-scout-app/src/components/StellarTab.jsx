import { useState, useMemo, useEffect } from "react";
import { POSITION_COLORS, dsColor, dsBg, isSilver } from "../utils/colors";
import { dScoreMatch, csProb, findTeam } from "../utils/dscore";
import { T, t } from "../utils/i18n";
import { getDailyLockKey, loadFrozen, saveFrozen } from "../utils/freeze";

const PC = POSITION_COLORS;

const SHORT_NAMES = {
  "Wolverhampton Wanderers": "Wolves", "Manchester United": "Man Utd", "Manchester City": "Man City",
  "Newcastle United": "Newcastle", "Nottingham Forest": "Nott. Forest", "Crystal Palace": "C. Palace",
  "Paris Saint Germain": "PSG", "Marseille": "OM", "Lyon": "OL",
  "Rayo Vallecano": "Rayo", "Atletico Madrid": "Atletico", "Real Sociedad": "R. Sociedad",
  "Athletic Club": "Bilbao", "Paris Saint-Germain": "PSG", "Olympique de Marseille": "OM",
  "Olympique Lyonnais": "OL", "RC Strasbourg Alsace": "Strasbourg", "Stade Brestois 29": "Brest",
  // Clubs européens
  "Bayern Munich": "Bayern", "Borussia Dortmund": "Dortmund", "RasenBallsport Leipzig": "RB Leipzig",
  "Bayer Leverkusen": "Leverkusen", "Inter Milan": "Inter", "AC Milan": "Milan",
  "Juventus FC": "Juventus", "SSC Napoli": "Napoli", "AS Roma": "Roma",
  "Benfica": "Benfica", "FC Porto": "Porto", "Sporting CP": "Sporting", "Sporting Clube de Portugal": "Sporting",
  "PSV Eindhoven": "PSV", "Ajax": "Ajax", "Feyenoord": "Feyenoord",
  "Celtic FC": "Celtic", "Rangers FC": "Rangers",
  "FC Salzburg": "Salzburg", "Shakhtar Donetsk": "Shakhtar",
  "Club Brugge KV": "Brugge", "Anderlecht": "Anderlecht",
  "Galatasaray A.Ş.": "Galatasaray", "Besiktas JK": "Besiktas", "Fenerbahce SK": "Fenerbahce",
  "Bayer 04 Leverkusen": "Leverkusen",
};
const sn = (name) => SHORT_NAMES[name] || name;

const DAYS_FR = ["MER", "JEU", "VEN", "SAM", "DIM", "LUN", "MAR"];
const STELLAR_LEAGUES = ["L1", "PL", "Liga"];
const EURO_LEAGUES = ["UCL", "UEL", "UECL"];
// Stats moyennes pour un adversaire européen inconnu (UCL/UEL/UECL)
const EURO_OPP_FALLBACK = { name: "European Opp", xg_dom: 1.4, xg_ext: 1.2, xga_dom: 1.2, xga_ext: 1.4, ppda_dom: 10, ppda_ext: 10, league: "EUR", cs_pct: 0.25 };
const LEAGUE_COLOR = {
  L1: "#4FC3F7", PL: "#B388FF", Liga: "#FF8A80",
  UCL: "#F59E0B", UEL: "#F97316", UECL: "#4ADE80",
};

const PALIERS = [
  { pts: 280, reward: "2 000 essence", color: "#94A3B8" },
  { pts: 320, reward: "5 000 essence", color: "#60A5FA" },
  { pts: 360, reward: "10 gems", color: "#A78BFA" },
  { pts: 400, reward: "30 gems", color: "#C084FC" },
  { pts: 440, reward: "100 $", color: "#F59E0B" },
  { pts: 480, reward: "1 000 $", color: "silver", silver: true },
];

/* ─── Éditions Stellar Nights — bonus score officiels (blog Sorare 2026) ─── */
const EDITIONS = [
  { id: "base",     label: "Base",    bonus: 0,  color: "#64748B" },
  { id: "shiny",    label: "Shiny",   bonus: 5,  color: "#93C5FD" },
  { id: "shiny_m",  label: "Maillot", bonus: 20, color: "#34D399" },
  { id: "shiny_ms", label: "Meteor",  bonus: 25, color: "#10B981" },
  { id: "holo",     label: "Holo",    bonus: 10, color: "#C4B5FD" },
  { id: "legend",   label: "Legend.", bonus: 30, color: "#FBBF24" },
  { id: "legend_s", label: "Signed",  bonus: 40, color: "#F97316" },
];
const getEdition = (id) => EDITIONS.find(e => e.id === id) || EDITIONS[0];

/* ─── Mapping cardEditionName Sorare → bonus édition % ─── */
const EDITION_BONUS = {
  stellar_standard_base: 0,
  stellar_shiny_base: 5,
  stellar_holo_base: 10,
  stellar_shiny_jersey_number: 20,
  stellar_shiny_meteor_striker: 25,
  stellar_full_art_base: 30,
};
const EDITION_LABELS = {
  stellar_standard_base: "Base",
  stellar_shiny_base: "Shiny",
  stellar_holo_base: "Holo",
  stellar_shiny_jersey_number: "Maillot",
  stellar_shiny_meteor_striker: "Meteor",
  stellar_full_art_base: "Full Art",
};

/* ─── Club matching helpers (utilisés dans useMemo ET render) ─── */
const stripAcc = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const normClubGlobal = (n) => stripAcc((n || "").replace(/-/g, " ").trim());
const clubMatchGlobal = (a, b) => {
  const na = normClubGlobal(a).toLowerCase();
  const nb = normClubGlobal(b).toLowerCase();
  if (na === nb) return true;
  const ALIASES = { "psg": ["paris saint germain", "paris sg"], "marseille": ["olympique de marseille", "om"], "lyon": ["olympique lyonnais", "ol"] };
  for (const [, syns] of Object.entries(ALIASES)) {
    if (syns.some(x => na.includes(x) || x.includes(na)) && syns.some(x => nb.includes(x) || x.includes(nb))) return true;
  }
  const words = (s) => s.split(/\s+/).filter(w => w.length > 2);
  const wa = words(na), wb = words(nb);
  if (wa.length >= 2 && wb.length >= 2) {
    const common = wa.filter(w => wb.includes(w));
    if (common.length >= 2) return true;
  }
  return na.includes(nb) || nb.includes(na);
};

/* ─── Timezone Paris — toutes les dates sont en heure de France ─── */
const TZ = "Europe/Paris";

// Date string YYYY-MM-DD en heure de Paris pour un objet Date quelconque
function toParisDateStr(d) {
  return d.toLocaleDateString("en-CA", { timeZone: TZ }); // "2026-04-03"
}

// "Aujourd'hui" en heure de Paris (string YYYY-MM-DD)
function getParisTodayStr() {
  return toParisDateStr(new Date());
}

// Affichage DD/MM en heure de Paris
function fmtDate(d) {
  const s = d.toLocaleDateString("fr-FR", { timeZone: TZ, day: "2-digit", month: "2-digit" });
  return s; // "03/04"
}

// Numéro du jour (0=dim..6=sam) en heure de Paris
function getParisDayOfWeek(d) {
  return new Date(d.toLocaleString("en-US", { timeZone: TZ })).getDay();
}

// Mercredi de la semaine Stellar contenant d (Mer→Mar, en heure de Paris)
function getWednesday(d) {
  const parisDateStr = toParisDateStr(d);
  const dt = new Date(parisDateStr + "T12:00:00"); // midi UTC = safe
  const day = dt.getDay(); // 0=dim, 3=mer
  // Mer=3 → 0, Jeu=4 → -1, Ven=5 → -2, Sam=6 → -3, Dim=0 → -4, Lun=1 → -5, Mar=2 → -6
  const diff = day >= 3 ? 3 - day : 3 - day - 7;
  dt.setDate(dt.getDate() + diff);
  return dt;
}

// Compatibilité — utilisé partout dans le composant
function isoDate(d) {
  return toParisDateStr(d);
}

// Convertit "HH:MM" UTC + date "YYYY-MM-DD" → "HH:MM" heure de Paris
// Gère automatiquement l'heure d'été (UTC+1 hiver, UTC+2 été)
function utcToParisTime(utcTimeStr, dateStr) {
  if (!utcTimeStr || utcTimeStr === "TBD" || utcTimeStr === "") return "";
  try {
    const d = new Date(`${dateStr}T${utcTimeStr}:00Z`);
    return d.toLocaleTimeString("fr-FR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
  } catch { return utcTimeStr; }
}

/* ─── Stars background CSS (animated) ─── */
const starsKeyframes = `
@keyframes twinkle { 0%,100%{opacity:0.15;transform:scale(0.8)} 50%{opacity:1;transform:scale(1.2)} }
@keyframes twinkleSlow { 0%,100%{opacity:0.1;transform:scale(0.9)} 50%{opacity:0.8;transform:scale(1.1)} }
@keyframes twinkleFast { 0%,100%{opacity:0.05;transform:scale(0.7)} 40%{opacity:1;transform:scale(1.4)} 60%{opacity:0.9;transform:scale(1.2)} }
@keyframes holoShift { 0%{filter:hue-rotate(0deg) brightness(1.4) saturate(1.2)} 50%{filter:hue-rotate(180deg) brightness(1.8) saturate(1.6)} 100%{filter:hue-rotate(360deg) brightness(1.4) saturate(1.2)} }
@keyframes starPulse { 0%,100%{opacity:0.2;transform:scale(0.8)} 50%{opacity:0.9;transform:scale(1.3);box-shadow:0 0 4px 2px rgba(255,255,255,0.7)} }
@keyframes starPulseBig { 0%,100%{opacity:0.4;transform:scale(0.9);box-shadow:0 0 3px 1px rgba(255,255,255,0.5)} 50%{opacity:1;transform:scale(1.5);box-shadow:0 0 8px 4px rgba(255,255,255,0.9), 0 0 18px 8px rgba(196,181,253,0.5)} }
@keyframes nebulaPulse { 0%,100%{opacity:0.1} 50%{opacity:0.2} }
@keyframes silverShine { 0%{background-position:0% 50%} 100%{background-position:200% 50%} }
@keyframes spin { 0%{transform:rotate(0deg)} 100%{transform:rotate(360deg)} }
@keyframes loadBar { 0%{transform:translateX(-100%)} 50%{transform:translateX(60%)} 100%{transform:translateX(200%)} }
@media(max-width:768px){
  .st-root { padding: 0 8px 40px !important; }
  .st-info-row { flex-direction: row !important; flex-wrap: nowrap !important; gap: 6px !important; padding: 8px 0 8px !important; align-items: stretch !important; }
  .st-info-bloc-title { flex: 0 0 auto !important; }
  .st-info-bloc-expl { display: none !important; }
  .st-info-bloc-paliers { display: none !important; }
  .st-cta-mobile { display: flex !important; }
  .st-cta-banner { display: none !important; }
  .st-calendar-wrap { display: grid !important; grid-template-columns: 28px repeat(7, 1fr) 28px !important; gap: 3px !important; overflow-x: unset !important; }
  .st-calendar-wrap button { padding: 0 4px !important; font-size: 11px !important; }
  .st-cal-day { padding: 5px 2px !important; }
  .st-cal-day > div:first-child { flex-wrap: wrap !important; gap: 2px !important; }
  .st-cal-day .cal-day-name { font-size: 8px !important; display: block !important; width: 100% !important; }
  .st-cal-day .cal-day-num { font-size: 11px !important; }
  .st-cal-day .cal-day-month { display: none !important; }
  .st-cal-day .cal-match-count { font-size: 8px !important; }
  .st-main-layout { flex-direction: column !important; }
  .st-main-layout > div { width: 100% !important; flex-shrink: unset !important; }
  .st-match-chip { width: 100% !important; box-sizing: border-box !important; display: grid !important; grid-template-columns: 28px 22px 15px 1fr 18px 1fr 15px !important; align-items: center !important; gap: 0 4px !important; justify-content: unset !important; }
  .st-match-chip .mc-vs { text-align: center !important; }
  .st-match-chip .mc-home { text-align: right !important; }
  .st-match-chip .mc-away { text-align: left !important; }
  .st-match-time-inline { visibility: visible !important; }
  .st-match-group-time-label { display: none !important; }
  .st-teams-grid { grid-template-columns: 1fr !important; }
  .st-top10-grid { grid-template-columns: repeat(2, 1fr) !important; }
  .st-cta-banner { flex-direction: column !important; gap: 8px !important; align-items: flex-start !important; }
  .st-decisive { flex-wrap: wrap !important; }
  .st-team-players { gap: 2px !important; }
  .st-team-players > div { width: 62px !important; }
  .st-team-players > div > div:first-child { width: 62px !important; height: 88px !important; }
  .st-team-card { padding: 6px !important; }
  .st-card-bonus-info { display: none !important; }
}
`;

/* ─── Étoiles scintillantes individuelles ─── */
const STARS = [
  { top:"8%",  left:"7%",  size:3, delay:0,    dur:2.1, big:true  },
  { top:"15%", left:"22%", size:2, delay:0.7,  dur:3.4, big:false },
  { top:"6%",  left:"45%", size:2, delay:1.2,  dur:2.8, big:false },
  { top:"12%", left:"68%", size:3, delay:0.3,  dur:1.9, big:true  },
  { top:"4%",  left:"82%", size:2, delay:1.8,  dur:3.1, big:false },
  { top:"22%", left:"5%",  size:2, delay:0.5,  dur:2.5, big:false },
  { top:"28%", left:"38%", size:2, delay:2.1,  dur:3.7, big:false },
  { top:"18%", left:"90%", size:3, delay:0.9,  dur:2.3, big:true  },
  { top:"35%", left:"15%", size:2, delay:1.5,  dur:4.0, big:false },
  { top:"42%", left:"72%", size:2, delay:0.2,  dur:2.6, big:false },
  { top:"50%", left:"3%",  size:3, delay:1.1,  dur:1.8, big:true  },
  { top:"55%", left:"55%", size:2, delay:2.4,  dur:3.3, big:false },
  { top:"62%", left:"30%", size:2, delay:0.6,  dur:2.9, big:false },
  { top:"70%", left:"85%", size:3, delay:1.7,  dur:2.2, big:true  },
  { top:"75%", left:"12%", size:2, delay:0.4,  dur:3.6, big:false },
  { top:"80%", left:"48%", size:2, delay:2.0,  dur:2.7, big:false },
  { top:"88%", left:"65%", size:2, delay:0.8,  dur:3.0, big:false },
  { top:"92%", left:"25%", size:3, delay:1.3,  dur:2.4, big:true  },
  { top:"32%", left:"58%", size:2, delay:1.9,  dur:4.2, big:false },
  { top:"48%", left:"92%", size:2, delay:0.1,  dur:3.8, big:false },
];

/* ─── Build teams for a given day ─── */
function buildStellarTeams(dayPlayers, dateStr) {
  if (dayPlayers.length < 5) return [];

  const sorted = [...dayPlayers].sort((a, b) => b.ds - a.ds);

  function pickTeam(pool) {
    // ALGORITHME (simple & optimal) :
    // 1. Meilleur GK dispo
    // 2. Trier tous les outfield par ds desc
    // 3. Sélectionner 4 outfield greedily :
    //    - Club max 2 (saut si déjà 2)
    //    - Couverture positions : si les slots restants == postes manquants, forcer le bon poste
    // 4. Assign roles : DEF/MIL/ATT obligatoires → FLEX = restant
    // 5. Cross-match check (pas adversaires dans même match)

    // Cross-match : désactivé pour Stellar (contrairement à SO5/SO7, on peut mixer
    // les deux équipes d'un même match — utile notamment pour les jours 1 seul match)
    const wouldConflict = () => false;

    // Best GK (pas cross-match avec pool outfield top)
    const gkSorted = pool.filter(p => p.position === "GK");

    // All outfield sorted by ds desc
    const outfieldSorted = pool
      .filter(p => p.position !== "GK")
      .sort((a, b) => (b.ds || 0) - (a.ds || 0));

    // Pick 4 outfield greedily — essaie d'abord maxClub=2, puis maxClub=3 si pool trop petit
    const tryPickOutfield = (maxClub) => {
      const result = [];
      const cc = {};
      for (const p of outfieldSorted) {
        if (result.length >= 4) break;
        if ((cc[p.club] || 0) >= maxClub) continue;
        if (wouldConflict(p, result)) continue;
        const remaining = 4 - result.length;
        const covered = new Set(result.map(x => x.position));
        const missing = ["DEF", "MIL", "ATT"].filter(pos => !covered.has(pos));
        if (remaining <= missing.length && !missing.includes(p.position)) continue;
        result.push(p);
        cc[p.club] = (cc[p.club] || 0) + 1;
      }
      return result;
    };

    let picks = tryPickOutfield(2);
    if (picks.length < 4) picks = tryPickOutfield(3); // fallback pool réduit
    if (picks.length < 4) picks = tryPickOutfield(11); // fallback sans limite de club (ex: stack 1 seul match)
    if (picks.length < 4) return null;

    // Best GK : pas de cross-match avec les outfield picks
    const gk = gkSorted.find(g => !wouldConflict(g, picks));
    if (!gk) return null;

    // Assigner les rôles : mandatory pos first (highest ds), FLEX = restant
    const roles = [];
    const usedFinal = new Set();
    const addRole = (p, role) => { roles.push({ ...p, role }); usedFinal.add(p.slug); };

    addRole(gk, "GK");
    const picksSorted = [...picks].sort((a, b) => (b.ds || 0) - (a.ds || 0));
    for (const pos of ["DEF", "MIL", "ATT"]) {
      const p = picksSorted.find(x => x.position === pos && !usedFinal.has(x.slug));
      if (p) addRole(p, pos);
    }
    const flex = picks.find(p => !usedFinal.has(p.slug));
    if (flex) addRole(flex, "FLEX");

    if (roles.length < 5) return null;

    const capIdx = roles.reduce((best, p, i) => (p.ds || 0) > (roles[best].ds || 0) ? i : best, 0);
    roles[capIdx].isCaptain = true;
    const capDs = roles[capIdx].ds || 0;
    const totalDs = Math.round(capDs * 0.5 + roles.reduce((s, p) => s + (p.ds || 0), 0));
    return { players: roles, usedSlugs: new Set(roles.map(p => p.slug)), totalDs };
  }

  // Assigner chaque joueur à un créneau Paris
  function getSlot(p) {
    if (!p.kickoff || !dateStr) return null;
    const parisTime = utcToParisTime(p.kickoff, dateStr);
    if (!parisTime) return null;
    const h = parseInt(parisTime.split(":")[0], 10);
    if (h >= 20) return "20H";
    if (h >= 17) return "17H";
    if (h >= 13) return "13H";
    return null;
  }

  const teams = [];

  // Top 10 avec quotas par poste : 2 GK, 3 DEF, 4 MIL, 3 ATT
  function buildTop10(pool) {
    const limits = { GK: 2, DEF: 2, MIL: 3, ATT: 3 };
    const counts = { GK: 0, DEF: 0, MIL: 0, ATT: 0 };
    const result = [];
    for (const p of pool) {
      if (result.length >= 10) break;
      const pos = p.position;
      if (counts[pos] === undefined || counts[pos] < limits[pos]) {
        result.push(p);
        if (counts[pos] !== undefined) counts[pos]++;
      }
    }
    return result;
  }

  // Fallback : essaie avec contrainte, sinon sans (1 seul match dans le créneau = full stack)
  const pickSafe = (pool) => pickTeam(pool) || pickTeam(pool.map(p => ({ ...p, oppName: null })));

  // ── CAS SPÉCIAL : 1 seul match → 2 stacks (un par club) ──────────────────
  const uniqueMatches = new Set(dayPlayers.map(p => p.matchId).filter(Boolean));
  if (uniqueMatches.size <= 1) {
    const clubs = [...new Set(dayPlayers.map(p => p.club))];
    for (const club of clubs) {
      const pool = sorted.filter(p => p.club === club);
      if (pool.length < 5) continue;
      const t = pickSafe(pool);
      if (t) teams.push({
        label: sn(club), icon: "⚽",
        players: t.players, top10: buildTop10(pool), totalDs: t.totalDs,
      });
    }
    return teams;
  }

  // ── CAS NORMAL : plusieurs matchs ────────────────────────────────────────
  // ULTIME — top 5 du jour
  const ultime = pickSafe(sorted);
  if (ultime) teams.push({ label: "ULTIME", icon: "★", players: ultime.players, top10: buildTop10(sorted), totalDs: ultime.totalDs });

  // 3 créneaux fixes : 13H, 17H, 20H
  for (const slot of ["13H", "17H", "20H"]) {
    const pool = sorted.filter(p => getSlot(p) === slot);
    if (pool.length < 5) continue;
    const t = pickSafe(pool);
    if (t) teams.push({ label: slot, icon: "⏰", players: t.players, top10: buildTop10(pool), totalDs: t.totalDs });
  }

  return teams;
}

/* ─── Top 10 Column with expandable player rows ─── */
function Top10Column({ team, logos, dateStr, lang }) {
  const S = T[lang] ?? T.fr;
  const [expanded, setExpanded] = useState(null);
  return (
    <div style={{ background: "rgba(8,4,25,0.65)", backdropFilter: "blur(10px)", borderRadius: 12, padding: "10px 10px", border: "1px solid rgba(196,181,253,0.12)" }}>
      <div style={{ fontSize: 10, fontWeight: 900, color: "#C4B5FD", marginBottom: 7, display: "flex", alignItems: "center", gap: 5 }}>
        <span>{team.icon}</span><span>{team.label}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {(team.top10 || []).map((p, ri) => {
          const pc = PC[p.position];
          const inTeam = team.players.some(tp => tp.slug === p.slug);
          const isOpen = expanded === ri;
          const clubLogo = logos[p.club];
          const oppLogo = logos[p.oppName];
          const parisTime = p.kickoff && dateStr ? utcToParisTime(p.kickoff, dateStr) : "";
          return (
            <div key={ri}>
              <div onClick={() => setExpanded(isOpen ? null : ri)} style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 4px", borderRadius: 5, cursor: "pointer",
                background: isOpen ? "rgba(196,181,253,0.12)" : inTeam ? "rgba(196,181,253,0.07)" : "transparent",
                transition: "background 0.15s",
              }}>
                <span style={{ fontSize: 8, fontWeight: 700, color: "rgba(255,255,255,0.25)", minWidth: 16, textAlign: "right" }}>#{ri + 1}</span>
                <span style={{ fontSize: 7, fontWeight: 800, background: pc, borderRadius: 3, padding: "1px 4px", color: "#fff", minWidth: 24, textAlign: "center" }}>{p.position}</span>
                {clubLogo && <img src={`/data/logos/${clubLogo}`} alt="" style={{ width: 12, height: 12, objectFit: "contain" }} />}
                <span style={{ fontSize: 10, fontWeight: inTeam ? 700 : 400, color: inTeam ? "#fff" : "rgba(255,255,255,0.6)", flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name.split(" ").pop()}</span>
                <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 11, fontWeight: 800, color: inTeam ? "#C4B5FD" : "rgba(255,255,255,0.4)" }}>{p.ds}</span>
                {inTeam && <span style={{ fontSize: 7, color: "#A78BFA" }}>✓</span>}
              </div>
              {isOpen && (
                <div style={{ margin: "2px 4px 4px", padding: "6px 8px", background: "rgba(196,181,253,0.07)", borderRadius: 6, border: "1px solid rgba(196,181,253,0.15)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    {clubLogo && <img src={`/data/logos/${clubLogo}`} alt="" style={{ width: 16, height: 16, objectFit: "contain" }} />}
                    <span style={{ fontSize: 9, fontWeight: 700, color: "#fff" }}>{sn(p.club)}</span>
                    <span style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>{p.isHome ? "🏠" : "✈️"} vs</span>
                    {oppLogo && <img src={`/data/logos/${oppLogo}`} alt="" style={{ width: 16, height: 16, objectFit: "contain" }} />}
                    <span style={{ fontSize: 9, fontWeight: 700, color: "#fff" }}>{sn(p.oppName)}</span>
                    {parisTime && <span style={{ fontSize: 9, fontWeight: 800, color: "#A78BFA", fontFamily: "'DM Mono',monospace", marginLeft: "auto" }}>{parisTime}</span>}
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 8, color: "rgba(255,255,255,0.4)" }}>D-Score</span>
                    <span style={{ fontSize: 9, fontWeight: 800, color: "#C4B5FD", fontFamily: "'DM Mono',monospace" }}>{p.ds}</span>
                    {p.proj != null && <><span style={{ fontSize: 8, color: "rgba(255,255,255,0.4)" }}>Proj</span><span style={{ fontSize: 9, fontWeight: 700, color: p.proj >= 50 ? "#4ADE80" : p.proj >= 35 ? "#F59E0B" : "#EF4444" }}>{p.proj}</span></>}
                    {["GK","DEF"].includes(p.position) && p.csPercent != null && (
                      <>
                        <span style={{ fontSize: 8, color: "rgba(255,255,255,0.4)" }}>CS%</span>
                        <span style={{ fontSize: 9, fontWeight: 700, color: p.csPercent >= 40 ? "#4ADE80" : p.csPercent >= 25 ? "#F59E0B" : "#EF4444", fontFamily: "'DM Mono',monospace" }}>{p.csPercent}%</span>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Player Mini Card (compact for Stellar) ─── */
function StellarCard({ player, logos, size = "md", isValidated = false, gwStart = "", edition = null, onEditionChange = null }) {
  const pc = PC[player.position];
  const sm = size === "sm";
  const W = sm ? 78 : 96;
  const H = sm ? 108 : 130;

  const hasPlayed = player.last_so5_date && gwStart && player.last_so5_date >= gwStart && player.last_so5_score != null;
  const edBonus = edition?.bonus || 0;
  const adjDs = Math.round((player.ds || 0) * (1 + edBonus / 100));
  const displayScore = isValidated && hasPlayed ? Math.round(player.last_so5_score) : adjDs;
  const scoreColor = isValidated && hasPlayed
    ? (player.last_so5_score >= 75 ? "#4ADE80" : player.last_so5_score >= 60 ? "#A3E635" : player.last_so5_score >= 50 ? "#FBBF24" : player.last_so5_score >= 40 ? "#FB923C" : "#EF4444")
    : null; // null = garde le dsBg habituel

  return (
    <div style={{ textAlign: "center", width: W + 4 }}>
      <div style={{
        position: "relative", width: W, height: H, borderRadius: 10,
        border: player.isCaptain ? `2px solid transparent` : `1.5px solid ${pc}30`,
        background: player.isCaptain
          ? `linear-gradient(#0d0818, #0d0818) padding-box, linear-gradient(135deg, #e2e8f0, #94a3b8, #f8fafc, #64748b, #e2e8f0) border-box`
          : `linear-gradient(155deg, rgba(8,4,28,0.92) 0%, rgba(18,10,50,0.88) 40%, ${pc}18 70%, rgba(6,4,22,0.95) 100%)`,
        display: "flex", flexDirection: "column", alignItems: "center",
        padding: "4px 2px 0", overflow: "hidden",
        boxShadow: player.isCaptain
          ? "0 0 14px rgba(148,163,184,0.25), 0 4px 12px rgba(0,0,0,0.5)"
          : `0 4px 12px rgba(0,0,0,0.4)`,
      }}>
        {/* Star dust */}
        <div style={{ position: "absolute", inset: 0, opacity: 0.15, pointerEvents: "none",
          backgroundImage: "radial-gradient(0.8px 0.8px at 15% 20%, #fff, transparent), radial-gradient(0.5px 0.5px at 50% 65%, #C4B5FD, transparent), radial-gradient(0.7px 0.7px at 80% 15%, #fff, transparent), radial-gradient(0.6px 0.6px at 35% 80%, #A78BFA, transparent), radial-gradient(0.4px 0.4px at 70% 50%, #fff, transparent)"
        }} />
        {/* Top accent */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: player.isCaptain ? "linear-gradient(90deg, transparent, #e2e8f0, #f8fafc, #e2e8f0, transparent)" : `linear-gradient(90deg, transparent, ${pc}60, transparent)`, pointerEvents: "none" }} />

        {/* Captain badge */}
        {player.isCaptain && (
          <div style={{ position: "absolute", top: 2, right: 4, borderRadius: "50%", width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 900, color: "#fff", zIndex: 2, background: "linear-gradient(135deg, #A78BFA, #7C3AED)", border: "1.5px solid rgba(196,181,253,0.5)", boxShadow: "0 0 6px rgba(139,92,246,0.5)" }}>C</div>
        )}

        {/* Position */}
        <div style={{ background: `linear-gradient(135deg,${pc},${pc}CC)`, borderRadius: 3, padding: "1px 5px", marginTop: 2, fontSize: 7, fontWeight: 800, color: "#fff", letterSpacing: "0.06em", zIndex: 1 }}>{player.role}</div>

        {/* D-Score / Score réel */}
        <div style={{ marginTop: 3, width: sm ? 28 : 34, height: sm ? 28 : 34, borderRadius: "50%",
          background: isValidated && hasPlayed
            ? scoreColor                                                          /* Cercle plein — score réel */
            : "transparent",                                                     /* Cercle vide pointillé — D-Score */
          display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: "'DM Mono',monospace", fontSize: sm ? 12 : 15, fontWeight: 700,
          color: isValidated && hasPlayed ? "#fff" : isSilver(player.ds) ? "rgba(255,255,255,0.9)" : dsColor(player.ds),
          border: isValidated && hasPlayed
            ? "2px solid rgba(255,255,255,0.3)"
            : isSilver(player.ds) ? "1px dashed rgba(255,255,255,0.4)" : `1px dashed ${dsColor(player.ds)}80`,
          zIndex: 1,
          boxShadow: isValidated && hasPlayed ? `0 0 10px ${scoreColor}99` : `0 0 6px ${dsColor(player.ds)}40`,
          transition: "all 0.3s",
        }}>{displayScore}</div>

        {/* Name */}
        <div style={{ fontSize: sm ? 9 : 11, fontWeight: 700, color: "#fff", marginTop: 2, zIndex: 1, lineHeight: 1.1, maxWidth: "95%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{player.name.split(" ").pop()}</div>

        {/* Club */}
        <div style={{ fontSize: 7, color: "rgba(255,255,255,0.4)", fontWeight: 500, marginTop: 1, zIndex: 1 }}>{sn(player.club)}</div>

        {/* Club logo */}
        {logos[player.club] && <img src={`/data/logos/${logos[player.club]}`} alt="" style={{ width: sm ? 18 : 22, height: sm ? 18 : 22, objectFit: "contain", marginTop: 2, zIndex: 1 }} />}

        {/* Titu% pancarte — badge coloré en haut droite sous capitaine */}
        {player.sorare_starter_pct != null && (
          <div style={{
            position: "absolute", top: player.isCaptain ? 22 : 2, right: 4, zIndex: 2,
            fontSize: 7, fontWeight: 800, fontFamily: "'Outfit',sans-serif",
            padding: "1px 4px", borderRadius: 3,
            background: player.sorare_starter_pct >= 70 ? "rgba(74,222,128,0.85)" : player.sorare_starter_pct >= 50 ? "rgba(251,191,36,0.85)" : "rgba(239,68,68,0.85)",
            color: "#fff",
          }}>{player.sorare_starter_pct}%</div>
        )}

      </div>

      {/* Opponent + heure — pas de IIFE, variables calculées en amont */}
      <div style={{ marginTop: 4, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 2, fontSize: 7, color: "rgba(255,255,255,0.45)", background: "rgba(0,0,0,0.4)", padding: "2px 5px", borderRadius: 3, maxWidth: "100%", overflow: "hidden" }}>
          <span style={{ fontSize: 9, flexShrink: 0 }}>{player.isHome ? "🏠" : "✈️"}</span>
          {logos[player.oppName] && <img src={`/data/logos/${logos[player.oppName]}`} alt="" style={{ width: 10, height: 10, objectFit: "contain", flexShrink: 0 }} />}
          <span className="bp-opp-name" style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{sn(player.oppName)}</span>
          {hasPlayed && player.last_match_home_goals != null ? (
            <span style={{ fontSize: 7, fontWeight: 800, fontFamily: "'DM Mono',monospace", marginLeft: 2, flexShrink: 0, whiteSpace: "nowrap",
              color: player.isHome
                ? (player.last_match_home_goals > player.last_match_away_goals ? "#4ADE80" : player.last_match_home_goals === player.last_match_away_goals ? "#FBBF24" : "#EF4444")
                : (player.last_match_away_goals > player.last_match_home_goals ? "#4ADE80" : player.last_match_away_goals === player.last_match_home_goals ? "#FBBF24" : "#EF4444")
            }}>
              {player.isHome ? `${player.last_match_home_goals}-${player.last_match_away_goals}` : `${player.last_match_away_goals}-${player.last_match_home_goals}`}
            </span>
          ) : player.sorare_starter_pct != null && (
            <span style={{ fontSize: 7, fontWeight: 800, fontFamily: "'DM Mono',monospace", color: player.sorare_starter_pct >= 80 ? "#4ADE80" : "#FBBF24", marginLeft: 2, flexShrink: 0, whiteSpace: "nowrap" }}>{player.sorare_starter_pct}%</span>
          )}
        </div>
        {player.kickoff && player.matchDate && !hasPlayed && (
          <div style={{ fontSize: 8, fontWeight: 800, color: "#A78BFA", fontFamily: "'DM Mono',monospace" }}>
            {utcToParisTime(player.kickoff, player.matchDate)}
          </div>
        )}
      </div>

      {/* ── Sélecteur édition Stellar ── */}
      {onEditionChange && (
        <div style={{ marginTop: 4 }}>
          {/* Ligne 1 : Base / Shiny / Holo / Legend */}
          <div style={{ display: "flex", gap: 2, justifyContent: "center" }}>
            {[
              { id: "base",   label: "—",   color: "#64748B" },
              { id: "shiny",  label: "S+5", color: "#93C5FD" },
              { id: "holo",   label: "H+10",color: "#C4B5FD" },
              { id: "legend", label: "L+30",color: "#FBBF24" },
            ].map(e => {
              const sel = (edition?.id || "base") === e.id
                || (e.id === "shiny" && ["shiny_m","shiny_ms"].includes(edition?.id))
                || (e.id === "legend" && edition?.id === "legend_s");
              return (
                <div key={e.id} onClick={() => onEditionChange(e.id)}
                  style={{
                    fontSize: 6, fontWeight: 800, padding: "2px 3px", borderRadius: 3, cursor: "pointer",
                    background: sel ? `${e.color}25` : "rgba(255,255,255,0.03)",
                    border: `1px solid ${sel ? e.color + "80" : "rgba(255,255,255,0.08)"}`,
                    color: sel ? e.color : "rgba(255,255,255,0.25)",
                    transition: "all 0.15s", userSelect: "none",
                  }}
                >{e.label}</div>
              );
            })}
          </div>
          {/* Ligne 2 : variantes Shiny et Legend */}
          {(["shiny","shiny_m","shiny_ms"].includes(edition?.id)) && (
            <div style={{ display: "flex", gap: 2, justifyContent: "center", marginTop: 2 }}>
              {[
                { id: "shiny",    label: "+5",  color: "#93C5FD" },
                { id: "shiny_m",  label: "+20", color: "#34D399" },
                { id: "shiny_ms", label: "+25", color: "#10B981" },
              ].map(e => (
                <div key={e.id} onClick={() => onEditionChange(e.id)}
                  style={{
                    fontSize: 6, fontWeight: 800, padding: "2px 4px", borderRadius: 3, cursor: "pointer",
                    background: edition?.id === e.id ? `${e.color}25` : "rgba(255,255,255,0.03)",
                    border: `1px solid ${edition?.id === e.id ? e.color + "80" : "rgba(255,255,255,0.08)"}`,
                    color: edition?.id === e.id ? e.color : "rgba(255,255,255,0.3)",
                    transition: "all 0.15s", userSelect: "none",
                  }}
                >{e.label}</div>
              ))}
            </div>
          )}
          {(["legend","legend_s"].includes(edition?.id)) && (
            <div style={{ display: "flex", gap: 2, justifyContent: "center", marginTop: 2 }}>
              {[
                { id: "legend",   label: "+30", color: "#FBBF24" },
                { id: "legend_s", label: "+40", color: "#F97316" },
              ].map(e => (
                <div key={e.id} onClick={() => onEditionChange(e.id)}
                  style={{
                    fontSize: 6, fontWeight: 800, padding: "2px 4px", borderRadius: 3, cursor: "pointer",
                    background: edition?.id === e.id ? `${e.color}25` : "rgba(255,255,255,0.03)",
                    border: `1px solid ${edition?.id === e.id ? e.color + "80" : "rgba(255,255,255,0.08)"}`,
                    color: edition?.id === e.id ? e.color : "rgba(255,255,255,0.3)",
                    transition: "all 0.15s", userSelect: "none",
                  }}
                >{e.label}</div>
              ))}
            </div>
          )}
          {/* Badge bonus actif */}
          {edBonus > 0 && (
            <div style={{ textAlign: "center", marginTop: 2, fontSize: 7, fontWeight: 900, color: edition?.color || "#C4B5FD", fontFamily: "'DM Mono',monospace" }}>
              ×{(1 + edBonus/100).toFixed(2)} → {adjDs}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   STELLAR TAB — Main Component
   ═══════════════════════════════════════════════════════════════════ */
export default function StellarTab({ players, teams, fixtures, logos = {}, matchEvents = {}, onFight, lang = "fr" }) {
  const S = T[lang] ?? T.fr;
  // ⚠️ Toujours en heure de Paris — peu importe le timezone du navigateur
  const todayStr = getParisTodayStr(); // "2026-04-03"
  const today = new Date(todayStr + "T12:00:00"); // objet Date safe pour getWednesday
  const [weekOffset, setWeekOffset] = useState(0);
  // Multi-selection : array d'indices de jours (max 4), triee
  const [selectedDays, setSelectedDays] = useState(() => {
    const d = new Date(getParisTodayStr() + "T12:00:00");
    const day = d.getDay(); // 0=dim, 3=mer
    // Mer=0, Jeu=1, Ven=2, Sam=3, Dim=4, Lun=5, Mar=6
    const idx = day >= 3 ? day - 3 : day + 4;
    return [idx];
  });
  // Helper : key stable pour useMemo deps
  const selectedDaysKey = selectedDays.join(",");
  // Premier jour selectionne (pour titre, sauvegarde, etc.)
  const selectedDay = selectedDays.length > 0 ? Math.min(...selectedDays) : null;
  const [expandedFixture, setExpandedFixture] = useState(null); // { key, side: "home"|"away" }
  const [selectedMatchFilters, setSelectedMatchFilters] = useState([]); // [{ home, away }, ...] — filtre joueurs par matchs
  const [leftCollapsed, setLeftCollapsed] = useState(false);

  // ── OAuth Sorare — cartes réelles de l'utilisateur ───────────────────────
  const [sorareConnected, setSorareConnected] = useState(false);
  const [sorareCards, setSorareCards] = useState([]); // { playerSlug, rarity, pictureUrl, cardSlug, cardEditionName, power }
  const [sorareUser, setSorareUser] = useState(null);
  const [sorareLoading, setSorareLoading] = useState(false);
  const [sorareLoadProgress, setSorareLoadProgress] = useState(0); // 0-100 loading bar
  const [myCardsMode, setMyCardsMode] = useState(false); // vue "Mes cartes" uniquement
  const [bonusEnabled, setBonusEnabled] = useState(false); // Toggle bonus ON/OFF (OFF par défaut)

  // Map playerSlug → meilleure carte Stellar (rarity order: limited > rare > super_rare > unique)
  const RARITY_ORDER = { unique: 4, super_rare: 3, rare: 2, limited: 1, common: 0 };
  const sorareCardMap = useMemo(() => {
    const map = {};
    for (const c of sorareCards) {
      if (!c.isStellar) continue; // Exclure Winter, classic, halloween, ice_breaker, blueprint, rookie
      const slug = c.playerSlug;
      if (!map[slug] || (c.totalBonus || 0) > (map[slug].totalBonus || 0)) {
        map[slug] = c;
      }
    }
    return map;
  }, [sorareCards]);

  // Nombre de cartes Stellar possédées
  const stellarCardCount = useMemo(() => sorareCards.filter(c => c.isStellar).length, [sorareCards]);

  // Vérifie l'auth au montage + gère le retour OAuth (hash fragment)
  useEffect(() => {
    const hash = window.location.hash;

    // Retour depuis OAuth Sorare — token dans le hash
    if (hash.includes("sorare_token=")) {
      const hashParams = new URLSearchParams(hash.replace(/^#/, ""));
      const token = hashParams.get("sorare_token");
      const returnedState = hashParams.get("state") || "";
      const savedState = sessionStorage.getItem("sorare_oauth_state") || "";
      sessionStorage.removeItem("sorare_oauth_state");
      // Nettoyer l'URL immédiatement (sécurité — token ne doit pas rester dans l'URL)
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      if (returnedState && savedState && returnedState !== savedState) {
        console.warn("Sorare OAuth: state mismatch — possible CSRF, ignoring", { returnedState, savedState });
        return;
      }
      if (token) {
        localStorage.setItem("sorare_access_token", token);
        fetchSorareCards(token);
      }
      return;
    }

    if (hash.includes("sorare_error=")) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      return;
    }

    // Vérifier silencieusement si déjà connecté (token dans localStorage)
    const savedToken = localStorage.getItem("sorare_access_token");
    if (savedToken) fetchSorareCards(savedToken, true);
  }, []);

  const fetchSorareCards = async (token, silent = false) => {
    if (!token) return;
    if (!silent) { setSorareLoading(true); setSorareLoadProgress(5); }
    try {
      const res = await fetch("/api/sorare/cards", {
        headers: { "Authorization": `Bearer ${token}` },
      });
      if (!silent) setSorareLoadProgress(40);
      if (res.status === 401) {
        localStorage.removeItem("sorare_access_token");
        setSorareConnected(false); setSorareCards([]);
        return;
      }
      if (!res.ok) { setSorareConnected(false); return; }
      const data = await res.json();
      if (!silent) setSorareLoadProgress(70);
      const user = data?.data?.currentUser;
      if (!user) { setSorareConnected(false); return; }
      setSorareUser({ slug: user.slug, nickname: user.nickname });
      // cards = AnyCardInterface, rarityTyped + cardEditionName + power
      const cards = (user.cards?.nodes || []).map(c => {
        const edName = c.cardEditionName || "";
        const isStellar = edName.startsWith("stellar_");
        const editionBonus = EDITION_BONUS[edName] ?? 0;
        const collectionBonus = c.power != null ? Math.round((c.power - 1) * 100) : 0;
        return {
          cardSlug:        c.slug,
          playerSlug:      c.player?.slug || null,
          playerName:      c.player?.displayName || null,
          position:        c.player?.position || null,
          rarity:          (c.rarityTyped || "").toLowerCase().replace(/ /g, "_"),
          pictureUrl:      c.pictureUrl || null,
          cardEditionName: edName,
          isStellar,
          editionBonus,
          collectionBonus,
          totalBonus:      editionBonus + collectionBonus,
          power:           c.power,
        };
      }).filter(c => c.playerSlug);
      if (!silent) setSorareLoadProgress(90);
      setSorareCards(cards);
      setSorareConnected(true);
      setMyCardsMode(true); // Auto switch to "Mes cartes" après connexion
    } catch {
      setSorareConnected(false);
    } finally {
      if (!silent) { setSorareLoadProgress(100); setTimeout(() => setSorareLoading(false), 400); }
    }
  };

  const connectSorare = () => {
    const state = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
    sessionStorage.setItem("sorare_oauth_state", state);
    const params = new URLSearchParams({
      client_id:     "NPuOENu-LuafKXV1spf6PZpWJbUodzfULnRtntnNP_U",
      redirect_uri:  "https://scout.deglingosorare.com/auth/sorare/callback",
      response_type: "code",
      state,
    });
    window.location.href = `https://sorare.com/oauth/authorize?${params}`;
  };

  const disconnectSorare = () => {
    localStorage.removeItem("sorare_access_token");
    setSorareConnected(false);
    setSorareCards([]);
    setSorareUser(null);
    setMyCardsMode(false);
  };

  // ── Mon Équipe Stellaire — 5 slots positionnels ───────────────────────────
  const TEAM_SLOTS = ["GK", "DEF", "MIL", "ATT", "FLEX"];
  const [myPicks, setMyPicks] = useState({ GK: null, DEF: null, MIL: null, FLEX: null, ATT: null });
  const resetTeam = () => setMyPicks({ GK: null, DEF: null, MIL: null, FLEX: null, ATT: null });
  const removeFromTeam = (slot) => setMyPicks(prev => ({ ...prev, [slot]: null }));
  const addToTeam = (player) => {
    setMyPicks(prev => {
      const pos = player.position;
      let next;
      // Si un slot est sélectionné et compatible → on y met le joueur
      if (selectedSlot) {
        if (selectedSlot === "FLEX" && pos !== "GK") next = { ...prev, FLEX: player };
        else if (selectedSlot === pos) next = { ...prev, [pos]: player };
        else next = prev;
      } else {
        // 1. slot naturel libre ?
        if (prev[pos] === null) next = { ...prev, [pos]: player };
        // 2. FLEX libre ?
        else if (prev.FLEX === null && pos !== "GK") next = { ...prev, FLEX: player };
        // 3. replace le slot naturel
        else next = { ...prev, [pos]: player };
      }
      // Auto slot suivant : GK → DEF → MIL → ATT → FLEX
      const ORDER = ["GK", "DEF", "MIL", "ATT", "FLEX"];
      const nextEmpty = ORDER.find(s => next[s] === null);
      setTimeout(() => setSelectedSlot(nextEmpty || null), 0);
      return next;
    });
  };
  const isInTeam = (p) => {
    const id = p.slug || p.name;
    // Compter combien de fois ce joueur est utilisé (myPicks + savedTeams)
    let usedCount = Object.values(myPicks).filter(pp => pp && (pp.slug || pp.name) === id).length;
    usedCount += savedTeams.reduce((sum, t) => sum + Object.values(t.picks).filter(pp => pp && (pp.slug || pp.name) === id).length, 0);
    if (usedCount === 0) return false;
    // Compter combien de cartes Stellar de ce joueur on possede
    const ownedCount = sorareCards.filter(c => c.playerSlug === id && c.isStellar).length;
    // Si on possede plus de cartes que d'utilisations → encore dispo
    if (ownedCount > usedCount) return false;
    // Pas connecte Sorare → fallback ancien comportement (1 seule carte)
    if (!sorareConnected) return usedCount > 0;
    return true;
  };
  const savedTeamLabel = (p) => {
    const id = p.slug || p.name;
    const t = savedTeams.find(t => Object.values(t.picks).some(pp => pp && (pp.slug || pp.name) === id));
    return t ? t.label : null;
  };
  const generateMagicTeam = () => {
    // Exclure les joueurs déjà utilisés (saved teams + myPicks)
    const usedIds = new Set([
      ...savedTeams.flatMap(t => Object.values(t.picks).filter(Boolean).map(pp => pp.slug || pp.name)),
      ...Object.values(myPicks).filter(Boolean).map(pp => pp.slug || pp.name),
    ]);
    // Quand connecté Sorare : uniquement joueurs dont on possède une carte STELLAR
    const basePool = (sorareConnected && myCardsDayPlayers.playing.length >= 5)
      ? myCardsDayPlayers.playing.filter(p => sorareCardMap[p.slug || p.name]) // carte Stellar uniquement
      : (dayData?.players || []);
    const pool = basePool
      .filter(p => !usedIds.has(p.slug || p.name))
      .filter(p => p.oppName) // doit jouer ce jour
      .filter(p => p.sorare_starter_pct == null || p.sorare_starter_pct >= 70) // titu% >= 70%
      // Filtre par matchs selectionnes dans la colonne gauche
      .filter(p => selectedMatchFilters.length === 0 || selectedMatchFilters.some(m => clubMatchGlobal(p.club, m.home) || clubMatchGlobal(p.club, m.away)))
      .map(p => {
        // Algo Magique trie TOUJOURS avec bonus (meme si Bonus OFF dans l'affichage)
        const slug = p.slug || p.name;
        const ownedCard = sorareCardMap[slug];
        const bonus = ownedCard && ownedCard.totalBonus > 0 ? ownedCard.totalBonus : 0;
        const adjDs = Math.round((p.ds || 0) * (1 + bonus / 100));
        return { ...p, ds: adjDs };
      })
      .sort((a, b) => b.ds - a.ds);
    if (pool.length < 5) return;

    // Conflit : ATT/MIL dont le club = adversaire d'un GK ou DEF déjà choisi (et vice-versa)
    const hasConflict = (player, picks) => {
      const picked = Object.values(picks).filter(Boolean);
      if (["ATT","MIL"].includes(player.position))
        return picked.some(pp => ["GK","DEF"].includes(pp.position) && clubMatchGlobal(pp.oppName, player.club));
      if (["GK","DEF"].includes(player.position))
        return picked.some(pp => ["ATT","MIL"].includes(pp.position) && clubMatchGlobal(player.oppName, pp.club));
      return false;
    };

    // Greedy par score decroissant — les meilleurs joueurs sont places en premier
    // Le conflit est evite en sacrifiant les joueurs les moins bien classes
    const newPicks = { GK: null, DEF: null, MIL: null, ATT: null, FLEX: null };
    const taken = new Set();
    // Pool deja trie par ds desc — on place chaque joueur dans son slot naturel ou FLEX
    for (const p of pool) {
      if (taken.has(p.slug || p.name)) continue;
      const pos = p.position;
      // Essayer le slot naturel
      if (newPicks[pos] === null) {
        if (!hasConflict(p, newPicks)) { newPicks[pos] = p; taken.add(p.slug || p.name); continue; }
      }
      // Essayer FLEX (sauf GK)
      if (pos !== "GK" && newPicks.FLEX === null) {
        if (!hasConflict(p, newPicks)) { newPicks.FLEX = p; taken.add(p.slug || p.name); continue; }
      }
      // Si tous les slots essayes sont pris, continuer
      if (Object.values(newPicks).filter(Boolean).length >= 5) break;
    }
    // Fallback: si des slots sont vides (conflit partout), remplir sans check conflit
    for (const p of pool) {
      if (taken.has(p.slug || p.name)) continue;
      const pos = p.position;
      if (newPicks[pos] === null) { newPicks[pos] = p; taken.add(p.slug || p.name); }
      else if (pos !== "GK" && newPicks.FLEX === null) { newPicks.FLEX = p; taken.add(p.slug || p.name); }
      if (Object.values(newPicks).filter(Boolean).length >= 5) break;
    }
    setMyPicks(newPicks);
  };

  // ── Mon Équipe — page cachée, accessible via bouton ──────────────────────────
  const [showMyTeam, setShowMyTeam] = useState(true); // Builder toujours visible
  const [selectedSlot, setSelectedSlot] = useState(null); // slot actif pour filtrer la liste

  // ── Sauvegarde équipes — jusqu'à 4 par jour ───────────────────────────────
  const savedTeamsKey = (dateStr) => `stellar_saved_teams_${dateStr}`;
  const [savedTeams, setSavedTeams] = useState([]);

  const saveCurrentTeam = (picks, editions, score) => {
    // Cle = 1er jour avec match parmi les jours selectionnes
    const firstMatchDay = selectedDays.find(i => (fixturesByDate[isoDate(weekDays[i])] || []).length > 0);
    const dateStr = firstMatchDay != null ? isoDate(weekDays[firstMatchDay]) : isoDate(weekDays[[...selectedDays][0]] || new Date());
    const key = savedTeamsKey(dateStr);
    const existing = (() => { try { return JSON.parse(localStorage.getItem(key) || "[]"); } catch { return []; } })();
    if (existing.length >= 4) return;
    const newTeam = {
      id: Date.now(),
      savedAt: new Date().toLocaleTimeString("fr-FR", { hour:"2-digit", minute:"2-digit" }),
      picks,
      editions: { ...editions },
      score,
      label: `Équipe ${existing.length + 1}`,
    };
    const updated = [...existing, newTeam];
    localStorage.setItem(key, JSON.stringify(updated));
    setSavedTeams(updated);
    resetTeam();
  };

  const loadSavedTeam = (team) => {
    setMyPicks({ ...team.picks });
    setCardEditions(prev => {
      const next = { ...prev, ...team.editions };
      localStorage.setItem("stellar_card_editions", JSON.stringify(next));
      return next;
    });
  };

  const deleteSavedTeam = (id) => {
    const firstMatchDay = selectedDays.find(i => (fixturesByDate[isoDate(weekDays[i])] || []).length > 0);
    const dateStr = firstMatchDay != null ? isoDate(weekDays[firstMatchDay]) : isoDate(new Date());
    const key = savedTeamsKey(dateStr);
    const updated = savedTeams.filter(t => t.id !== id).map((t, i) => ({ ...t, label: `Équipe ${i + 1}` }));
    localStorage.setItem(key, JSON.stringify(updated));
    setSavedTeams(updated);
  };

  // ── Tri du tableau joueurs du jour ──────────────────────────────────────────
  const [teamSort, setTeamSort] = useState("ds");

  // ── Filtres joueurs Stellar ────────────────────────────────────────────────
  const [hideUsed, setHideUsed] = useState(true);   // masquer les joueurs déjà utilisés (savedTeams)
  const [filterTitu, setFilterTitu] = useState(0);   // 0 = tous, 30/50/70/90 = seuil titu%

  // ── Éditions cartes — stockées par slug dans localStorage ──────────────────
  const [cardEditions, setCardEditions] = useState(() => {
    try { return JSON.parse(localStorage.getItem("stellar_card_editions") || "{}"); } catch { return {}; }
  });
  const setCardEdition = (slug, editionId) => {
    setCardEditions(prev => {
      const next = { ...prev, [slug]: editionId };
      localStorage.setItem("stellar_card_editions", JSON.stringify(next));
      return next;
    });
  };
  // Score ajusté par édition + collection (totalBonus) quand carte Sorare dispo
  const getAdjDs = (p) => {
    if (!bonusEnabled) return Math.round(p.ds || 0);
    const slug = p.slug || p.name;
    const ownedCard = sorareCardMap[slug];
    if (ownedCard && ownedCard.totalBonus > 0) {
      // Carte Sorare réelle : utilise totalBonus (edition + collection/power)
      return Math.round((p.ds || 0) * (1 + ownedCard.totalBonus / 100));
    }
    // Fallback : édition manuelle
    const ed = getEdition(cardEditions[slug] || "base");
    return Math.round((p.ds || 0) * (1 + ed.bonus / 100));
  };
  const getAdjTotalDs = (teamPlayers) =>
    Math.round(teamPlayers.reduce((sum, p) => {
      const adj = getAdjDs(p);
      return sum + (p.isCaptain ? adj * 1.5 : adj);
    }, 0));
  // ── Freeze daily Stellar : figé à 12h00 Paris ──────────────────────────────
  // dailyLockKey = "YYYY-MM-DD" si Paris >= 12h00, sinon null
  const dailyLockKey = useMemo(() => getDailyLockKey(), []);
  const stellarFreezeKey = dailyLockKey ? `stellar_${dailyLockKey}` : null;
  const frozenDayData   = useMemo(() => (stellarFreezeKey ? loadFrozen(stellarFreezeKey) : null), [stellarFreezeKey]);

  const wednesday = useMemo(() => {
    const w = getWednesday(today);
    w.setDate(w.getDate() + weekOffset * 7);
    return w;
  }, [weekOffset]);

  // GW start = mercredi de la semaine affichée
  const gwWeekStart = useMemo(() => wednesday.toISOString().split("T")[0], [wednesday]);

  // Largeur de référence des chips = match avec les 2 noms les plus longs des ligues Stellar
  const chipMinWidth = useMemo(() => {
    const names = teams
      .filter(t => STELLAR_LEAGUES.includes(t.league))
      .map(t => sn(t.name))
      .sort((a, b) => b.length - a.length);
    const l1 = names[0]?.length || 10;
    const l2 = names[1]?.length || 10;
    // ~6.5px/char (font 11px bold) + overhead: ligue(28) + 2 logos(32) + "vs"(20) + gaps+padding(30)
    return Math.round((l1 + l2) * 6.5 + 110);
  }, [teams]);

  // Build 7 days of the week (Mer→Mar)
  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(wednesday);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [wednesday]);

  // All fixtures grouped by date (Stellar leagues + European competitions)
  const fixturesByDate = useMemo(() => {
    if (!fixtures?.fixtures) return {};
    const map = {};
    for (const f of fixtures.fixtures) {
      if (!STELLAR_LEAGUES.includes(f.league) && !EURO_LEAGUES.includes(f.league)) continue;
      if (!map[f.date]) map[f.date] = [];
      map[f.date].push(f);
    }
    return map;
  }, [fixtures]);

  // Reset filtre matchs quand la selection de jours change
  useEffect(() => { setSelectedMatchFilters([]); }, [selectedDaysKey]);

  // Recharge les équipes sauvegardées quand la selection change + charge Équipe 1 par défaut
  useEffect(() => {
    if (selectedDays.length === 0) return;
    const firstMatchDay = selectedDays.find(i => (fixturesByDate[isoDate(weekDays[i])] || []).length > 0);
    if (firstMatchDay == null) return;
    const dateStr = isoDate(weekDays[firstMatchDay]);
    let teams = [];
    try { teams = JSON.parse(localStorage.getItem(savedTeamsKey(dateStr)) || "[]"); } catch { teams = []; }
    setSavedTeams(teams);
    // Charger Équipe 1 automatiquement si elle existe
    if (teams.length > 0) {
      setMyPicks({ ...teams[0].picks });
      setCardEditions(prev => {
        const next = { ...prev, ...teams[0].editions };
        localStorage.setItem("stellar_card_editions", JSON.stringify(next));
        return next;
      });
    } else {
      setMyPicks({ GK: null, DEF: null, MIL: null, FLEX: null, ATT: null });
    }
  }, [selectedDaysKey, weekDays, fixturesByDate]);

  // Scored players for selected days (multi-day merge)
  const dayData = useMemo(() => {
    if (selectedDays.length === 0) return null;
    const selectedIndices = selectedDays;

    const allFixtures = [];
    const allPlayers = [];
    const seenSlugs = new Set();
    const pf = fixtures?.player_fixtures || {};
    const NO_STELLAR_CLUBS = ["FC Metz"];

    for (const dayIdx of selectedIndices) {
      const day = weekDays[dayIdx];
      if (!day) continue;
      const dateStr = isoDate(day);

      // Freeze check (single day only)
      if (selectedIndices.length === 1 && dailyLockKey && dateStr === dailyLockKey && frozenDayData) {
        return { ...frozenDayData, frozen: true };
      }

      const dayFixtures = fixturesByDate[dateStr] || [];
      allFixtures.push(...dayFixtures);
      if (!dayFixtures.length) continue;

      const clubFxMap = {};
      for (const f of dayFixtures) {
        if (f.home) clubFxMap[f.home] = { opp: f.away, isHome: true, kickoff: f.kickoff || "" };
        if (f.away) clubFxMap[f.away] = { opp: f.home, isHome: false, kickoff: f.kickoff || "" };
      }

      for (const p of players) {
        if (!STELLAR_LEAGUES.includes(p.league)) continue;
        if (NO_STELLAR_CLUBS.some(c => clubMatchGlobal(p.club, c))) continue;
        const slug = p.slug || p.name;
        if (seenSlugs.has(slug)) continue; // deja dans le pool (1er jour = priorite)

        const fx = pf[slug] || pf[p.name];
        let fxOpp, fxIsHome, fxKickoff;
        if (fx && fx.date === dateStr) {
          fxOpp = fx.opp; fxIsHome = fx.isHome; fxKickoff = fx.kickoff || fx.time || "";
        } else {
          const cf = clubFxMap[p.club] || Object.entries(clubFxMap).find(([k]) => clubMatchGlobal(k, p.club))?.[1];
          if (!cf) continue;
          fxOpp = cf.opp; fxIsHome = cf.isHome; fxKickoff = cf.kickoff;
        }

        const lgTeams = teams.filter(t => t.league === p.league);
        const oppStats = lgTeams.find(t => t.name === fxOpp);
        if (!oppStats) continue;
        const pTeam = findTeam(lgTeams, p.club);
        const ds = dScoreMatch(p, oppStats, fxIsHome, pTeam);
        if (ds < 20) continue;
        if (p.injured || p.suspended) continue;
        if (p.sorare_starter_pct != null && p.sorare_starter_pct < 70) continue;

        let csPercent = null;
        if (["GK", "DEF"].includes(p.position)) {
          const oppXg = fxIsHome ? (oppStats.xg_ext || 1.3) : (oppStats.xg_dom || 1.3);
          const defXga = pTeam ? (fxIsHome ? (pTeam.xga_dom || 1.3) : (pTeam.xga_ext || 1.5)) : 1.3;
          csPercent = csProb(defXga, oppXg, p.league);
        }
        const matchId = pTeam ? [pTeam.name, oppStats.name].sort().join("|") : null;
        allPlayers.push({
          ...p, ds, oppName: oppStats.name, oppTeam: oppStats, playerTeam: pTeam, isHome: fxIsHome,
          kickoff: fxKickoff, matchDate: dateStr, csPercent, matchId, proj: p.sorare_proj ?? null,
        });
        seenSlugs.add(slug);
      }
    }

    if (!allFixtures.length && !allPlayers.length) return { fixtures: [], players: [], teams: [], decisiveTop3: [] };

    // Decisive Pick Top 3 on merged pool
    const POS_MULT = { ATT: 1.4, MIL: 1.05, DEF: 0.5, GK: 0.1 };
    const decisiveAll = allPlayers
      .filter(p => p.appearances >= 3 && ["ATT","MIL","DEF"].includes(p.position))
      .map(p => {
        const gaRate = p.ga_per_match || 0;
        const posMult = POS_MULT[p.position] || 1;
        const formFactor = Math.min(1.5, (p.l5 || 0) / 60 + 0.5);
        const oppXga = p.isHome ? (p.oppTeam?.xga_dom || 1.2) : (p.oppTeam?.xga_ext || 1.2);
        const oppFactor = Math.min(1.5, oppXga / 1.2);
        const decisive = gaRate * posMult * formFactor * oppFactor;
        const formImpact = Math.sqrt(formFactor);
        const pDecisive = Math.min(99, Math.round((1 - Math.exp(-gaRate * oppFactor * formImpact * 0.5)) * 100));
        return { ...p, decisive, pDecisive };
      })
      .sort((a, b) => b.decisive - a.decisive);
    const decisivePick = decisiveAll[0] || null;
    const decisiveTop3 = decisiveAll.slice(0, 3);

    return { fixtures: allFixtures, players: allPlayers, teams: [], decisivePick, decisiveTop3, frozen: false };
  }, [selectedDaysKey, weekDays, fixturesByDate, players, teams, fixtures, dailyLockKey, frozenDayData]);

  // Pool "mes cartes" — 4 ligues, sans filtre titu%, double matching (player_fixtures + club)
  const myCardsDayPlayers = useMemo(() => {
    if (!sorareCards.length || selectedDays.length === 0) return { playing: [], notPlaying: [] };
    const cardSlugSet = new Set(sorareCards.map(c => c.playerSlug));
    const ALL_LEAGUES = ["L1", "PL", "Liga", "Bundes"];

    // Club → fixture pour tous les jours selectionnes
    const clubFxMap = {};
    for (const dayIdx of selectedDays) {
      const dateStr = isoDate(weekDays[dayIdx]);
      const dayFixtures = fixturesByDate[dateStr] || [];
      for (const f of dayFixtures) {
        if (f.home && !clubFxMap[f.home]) clubFxMap[f.home] = { opp: f.away, isHome: true, kickoff: f.kickoff || f.time || "", date: dateStr };
        if (f.away && !clubFxMap[f.away]) clubFxMap[f.away] = { opp: f.home, isHome: false, kickoff: f.kickoff || f.time || "", date: dateStr };
      }
    }

    const pf = fixtures?.player_fixtures || {};
    const playing = [], playingSet = new Set();

    for (const p of (players || [])) {
      const slug = p.slug || p.name;
      if (!cardSlugSet.has(slug)) continue;
      if (!ALL_LEAGUES.includes(p.league)) continue;

      // 1) player_fixtures (check si date dans un des jours selectionnes)
      const selectedDateStrs = new Set([...selectedDays].map(di => isoDate(weekDays[di])));
      const fx = pf[p.slug] || pf[p.name];
      let oppName, isHome, kickoff, matchDate;
      if (fx && selectedDateStrs.has(fx.date)) {
        oppName = fx.opp; isHome = fx.isHome; kickoff = fx.kickoff || fx.time || ""; matchDate = fx.date;
      } else {
        // 2) Fallback club-based
        const cf = clubFxMap[p.club];
        if (!cf) continue;
        oppName = cf.opp; isHome = cf.isHome; kickoff = cf.kickoff; matchDate = cf.date;
      }

      const lgTeams = (teams || []).filter(t => t.league === p.league);
      const oppStats = lgTeams.find(t => t.name === oppName);
      const pTeam = findTeam(lgTeams, p.club);
      const ds = oppStats ? dScoreMatch(p, oppStats, isHome, pTeam) : (p.l10 || 50);
      let csPercent = null;
      if (["GK", "DEF"].includes(p.position) && oppStats) {
        const oppXg = isHome ? (oppStats.xg_ext || 1.3) : (oppStats.xg_dom || 1.3);
        const defXga = pTeam ? (isHome ? (pTeam.xga_dom || 1.3) : (pTeam.xga_ext || 1.5)) : 1.3;
        csPercent = csProb(defXga, oppXg, p.league);
      }
      playing.push({ ...p, ds, oppName, isHome, kickoff, matchDate, csPercent });
      playingSet.add(slug);
    }
    playing.sort((a, b) => b.ds - a.ds);

    const notPlaying = sorareCards
      .filter(c => !playingSet.has(c.playerSlug))
      .filter((c, i, arr) => arr.findIndex(x => x.playerSlug === c.playerSlug) === i)
      .sort((a, b) => (RARITY_ORDER[b.rarity]||0) - (RARITY_ORDER[a.rarity]||0));

    return { playing, notPlaying };
  }, [sorareCards, selectedDaysKey, weekDays, players, fixtures, teams, fixturesByDate]);

  // ── Sauvegarder dans localStorage quand le freeze est actif et pas encore figé ──
  useEffect(() => {
    if (!stellarFreezeKey || frozenDayData) return; // déjà figé ou pas encore l'heure
    if (!dayData || dayData.frozen) return;
    if (selectedDays.length === 0) return;
    const firstIdx = Math.min(...selectedDays);
    const day = weekDays[firstIdx];
    if (!day) return;
    const dateStr = isoDate(day);
    if (dateStr !== dailyLockKey) return;
    if (!dayData.players?.length) return;
    saveFrozen(stellarFreezeKey, {
      fixtures: dayData.fixtures,
      players: dayData.players,
      teams: dayData.teams || [],
      decisivePick: dayData.decisivePick,
    });
  }, [stellarFreezeKey, frozenDayData, dayData, selectedDaysKey, weekDays, dailyLockKey]);

  // Auto-select first day with matches (si aucun jour selectionne)
  useEffect(() => {
    if (selectedDays.length > 0) return;
    for (let i = 0; i < 7; i++) {
      const dateStr = isoDate(weekDays[i]);
      if (fixturesByDate[dateStr]?.length) { setSelectedDays([i]); return; }
    }
  }, [weekDays, fixturesByDate]);

  const weekLabel = `${fmtDate(weekDays[0])} — ${fmtDate(weekDays[6])}`;

  return (
    <div className="st-root" style={{ position: "relative", minHeight: "80vh", padding: "0 16px 40px", zIndex: 1, maxWidth: 1800, margin: "0 auto" }}>
      <style>{starsKeyframes}</style>

{/* Loading popup supprimé ici — il est dans le bloc Mon Equipe (position: relative overlay) */}

      {/* Vignette bords — position absolute, scroll avec le contenu */}
      <div style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", boxShadow: "inset 0 0 100px rgba(1,0,6,0.5)" }} />

      {/* ═══ LIGNE UNIQUE : STELLAR + PALIERS + CTA + MES CARTES ═══ */}
      <div className="st-info-row" style={{ display: "flex", alignItems: "stretch", padding: "4px 0 10px", gap: 10 }}>

        {/* Titre STELLAR — gauche */}
        <div className="st-info-bloc-title" style={{ flexShrink: 0, background: "rgba(8,4,25,0.60)", backdropFilter: "blur(10px)", borderRadius: 12, padding: "8px 14px", border: "1px solid rgba(196,181,253,0.12)", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "0.18em", color: "#fff", textTransform: "uppercase", lineHeight: 1, marginBottom: -8 }}>SORARE</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <h1 style={{ fontSize: 24, fontWeight: 900, margin: 0, letterSpacing: "-0.5px",
                background: "linear-gradient(135deg, #C4B5FD, #A78BFA, #8B5CF6, #7C3AED, #A78BFA, #C4B5FD)",
                backgroundSize: "200% auto", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                backgroundClip: "text", animation: "silverShine 4s linear infinite",
              }}>STELLAR</h1>
              <img src="/Stellar.png" alt="" style={{ width: 42, height: 42, objectFit: "contain", mixBlendMode: "screen", animation: "holoShift 3s linear infinite", flexShrink: 0 }} />
            </div>
          </div>
        </div>

        {/* Mini CTA — mobile only */}
        <a href="http://sorare.pxf.io/Deglingo" target="_blank" rel="noopener noreferrer"
          className="st-cta-mobile"
          style={{
            display: "none", flex: 1, flexDirection: "column", alignItems: "center", justifyContent: "center",
            background: "linear-gradient(135deg, rgba(139,92,246,0.15), rgba(109,40,217,0.1))",
            border: "1px solid rgba(167,139,250,0.4)", borderRadius: 12,
            padding: "10px 8px", textDecoration: "none", gap: 6, textAlign: "center",
          }}>
          <span style={{ fontSize: 22 }}>🎁</span>
          <div style={{ fontSize: 10, fontWeight: 800, color: "#C4B5FD", lineHeight: 1.3 }}>
            {lang === "fr" ? "Ouvre tes premiers packs gratuitement" : "Open your first packs for free"}
          </div>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.45)", lineHeight: 1.3 }}>
            {lang === "fr" ? "Sorare Stellar — joue ce soir" : "Sorare Stellar — play tonight"}
          </div>
          <div style={{ fontSize: 10, fontWeight: 800, color: "#fff", background: "linear-gradient(135deg, #8B5CF6, #6D28D9)", borderRadius: 6, padding: "4px 10px" }}>
            {lang === "fr" ? "Ouvrir mes packs →" : "Open my packs →"}
          </div>
        </a>

        {/* Paliers — avec titre ÉQUIPES PAR CRÉNEAU */}
        <div className="st-info-bloc-paliers" style={{ flexShrink: 0, display: "flex", flexDirection: "column", justifyContent: "center", gap: 6, background: "rgba(8,4,25,0.60)", backdropFilter: "blur(10px)", borderRadius: 12, padding: "8px 10px", border: "1px solid rgba(196,181,253,0.12)" }}>
          <div>
            <div style={{ fontSize: 9, fontWeight: 800, color: "#C4B5FD", marginBottom: 2 }}>⏰ {S.stellarCreneauTitle}</div>
            <div style={{ fontSize: 8.5, color: "rgba(255,255,255,0.45)", lineHeight: 1.4 }}>
              {S.stellarCreneauDesc} <span style={{ color: "#A78BFA", fontWeight: 700 }}>{S.stellarCreneauDesc2}</span>{S.stellarCreneauDesc3}
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 5 }}>
            {PALIERS.map((p, i) => (
              <div key={i} style={{ background: `${p.color}18`, border: `1px solid ${p.color}40`, borderRadius: 6, padding: "4px 6px", textAlign: "center" }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: p.color, fontFamily: "'DM Mono',monospace" }}>{p.pts}</div>
                <div style={{ fontSize: 7, color: "rgba(255,255,255,0.55)", whiteSpace: "nowrap" }}>{p.reward}</div>
              </div>
            ))}
          </div>
        </div>

        {/* CTA Ouvrir mes packs */}
        <a href="http://sorare.pxf.io/Deglingo" target="_blank" rel="noopener noreferrer"
          className="st-cta-banner"
          style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "space-between",
            background: "linear-gradient(135deg, rgba(139,92,246,0.12), rgba(109,40,217,0.08))",
            border: "1px solid rgba(167,139,250,0.35)", borderRadius: 12,
            padding: "10px 16px", textDecoration: "none",
            boxShadow: "0 0 18px rgba(139,92,246,0.12)", transition: "all 0.2s",
          }}
          onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 0 28px rgba(139,92,246,0.28)"; e.currentTarget.style.borderColor = "rgba(167,139,250,0.6)"; }}
          onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 0 18px rgba(139,92,246,0.12)"; e.currentTarget.style.borderColor = "rgba(167,139,250,0.35)"; }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 18 }}>🎁</span>
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#C4B5FD", letterSpacing: "0.03em" }}>
                {lang === "fr" ? "Viens ouvrir tes premiers packs gratuitement" : "Open your first card packs for free"}
              </div>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", marginTop: 1 }}>
                {lang === "fr" ? "Sorare Stellar est 100% gratuit — joue dès ce soir" : "Sorare Stellar is 100% free — play tonight"}
              </div>
            </div>
          </div>
          <div style={{
            fontSize: 10, fontWeight: 800, color: "#fff", whiteSpace: "nowrap",
            background: "linear-gradient(135deg, #8B5CF6, #6D28D9)", borderRadius: 8,
            padding: "6px 12px", boxShadow: "0 0 10px rgba(139,92,246,0.4)", flexShrink: 0, marginLeft: 8,
          }}>
            {lang === "fr" ? "Ouvrir →" : "Open →"}
          </div>
        </a>

{/* Bouton CONNECT déplacé dans l'overlay flou du builder */}

      </div>

      {/* ═══ CALENDRIER + bouton semaine suivante ═══ */}
      <div className="st-calendar-wrap" style={{ display: "grid", gridTemplateColumns: "auto repeat(7, 1fr) auto", gap: 4, marginBottom: 14, alignItems: "stretch" }}>
        {/* Bouton semaine précédente */}
        <button onClick={() => { setWeekOffset(w => w - 1); setSelectedDays([]); }}
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, color: "#C4B5FD", cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "Outfit", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 10px" }}>◀</button>
        {weekDays.map((day, i) => {
          const dateStr = isoDate(day);
          const dayFixtures = fixturesByDate[dateStr] || [];
          const hasMatches = dayFixtures.length > 0;
          const isSelected = selectedDays.includes(i);
          const isToday = dateStr === isoDate(today);

          return (
            <div key={i} className="st-cal-day"
              onClick={() => {
                if (!hasMatches) return;
                // Clic simple = ajoute ce jour (max 4), ctrl = retire
                setSelectedDays(prev => {
                  if (prev.includes(i)) return prev.filter(x => x !== i);
                  if (prev.length >= 4) return prev;
                  return [...prev, i].sort((a, b) => a - b);
                });
              }}
              onDoubleClick={() => {
                if (!hasMatches) return;
                // Double clic = selectionne ce jour UNIQUEMENT
                setSelectedDays([i]);
              }}
              style={{
                background: isSelected ? "rgba(120,60,240,0.40)" : hasMatches ? "rgba(15,8,40,0.70)" : "rgba(8,4,25,0.55)",
                border: isSelected ? "1px solid rgba(196,181,253,0.7)" : isToday ? "1px solid rgba(180,140,255,0.4)" : "1px solid rgba(100,70,200,0.18)",
                backdropFilter: "blur(10px)",
                borderRadius: 8, padding: "5px 3px", textAlign: "center",
                cursor: hasMatches ? "pointer" : "default",
                opacity: hasMatches ? 1 : 0.4,
                transition: "all 0.2s",
                boxShadow: isSelected ? "0 0 24px rgba(160,80,255,0.25), inset 0 0 12px rgba(140,60,255,0.1)" : "none",
              }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 5 }}>
                <div className="cal-day-name" style={{ fontSize: 10, fontWeight: 800, color: isSelected ? "#C4B5FD" : "rgba(255,255,255,0.7)", letterSpacing: "0.05em" }}>{S.stellarDays[i]}</div>
                <div className="cal-day-num" style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{day.getDate()}</div>
                <div className="cal-day-month" style={{ fontSize: 8, fontWeight: 600, color: isSelected ? "#A78BFA" : "rgba(255,255,255,0.35)", letterSpacing: "0.04em" }}>{day.toLocaleDateString(S.stellarDateLocale, { timeZone: TZ, month: "short" }).toUpperCase().replace(".","")}</div>
              </div>
              {hasMatches ? (
                <div className="cal-match-count" style={{ fontSize: 9, color: isSelected ? "#C4B5FD" : "#A78BFA", fontWeight: 600 }}>{dayFixtures.length} {dayFixtures.length > 1 ? S.stellarMatches : S.stellarMatch}</div>
              ) : (
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.2)" }}>—</div>
              )}
              {/* League dots */}
              {hasMatches && (
                <div style={{ display: "flex", justifyContent: "center", gap: 3, marginTop: 3 }}>
                  {[...new Set(dayFixtures.map(f => f.league))].map(lg => (
                    <div key={lg} style={{ width: 6, height: 6, borderRadius: "50%", background: lg === "L1" ? "#4FC3F7" : lg === "PL" ? "#B388FF" : "#FF8A80" }} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {/* Bouton semaine suivante */}
        <button onClick={() => { setWeekOffset(w => w + 1); setSelectedDays([]); }}
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, color: "#C4B5FD", cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "Outfit", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 10px" }}>▶</button>
      </div>
      <div style={{ textAlign: "center", fontSize: 8, color: "rgba(255,255,255,0.2)", marginTop: -8, marginBottom: 10 }}>
        {lang === "fr" ? "Clic = ajouter un jour · Double-clic = jour unique · Max 4 jours · Clic sur un match = filtrer" : "Click = add day · Double-click = single day · Max 4 days · Click a match = filter"}
      </div>

      {/* ═══ SELECTED DAY CONTENT ═══ */}
      {selectedDays.length > 0 && dayData && (
        <div>
          {/* Layout principal : colonne gauche (date + matchs) | colonne droite (decisive + teams) */}
          <div className="st-main-layout" style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>

          {/* Colonne gauche — Date + Matchs */}
          <div style={{ flexShrink: 0, transition: "all 0.25s" }}>

            {/* Titre du jour */}
            <div style={{ marginBottom: 8 }}>
              <h2 style={{ fontSize: 16, fontWeight: 800, color: "#fff", margin: 0, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                {!leftCollapsed && <span style={{ color: "#C4B5FD" }}>{selectedDays.map(i => weekDays[i]?.toLocaleDateString(S.stellarDateLocale, { timeZone: TZ, weekday: "short", day: "numeric", month: "short" })).join(" · ").toUpperCase()}</span>}
{/* Badge freeze supprime — plus de picks auto dans Stellar */}
                {/* Bouton collapse colonne gauche */}
                <button onClick={() => setLeftCollapsed(v => !v)}
                  title={leftCollapsed ? "Afficher les matchs" : "Réduire"}
                  style={{ marginLeft: "auto", flexShrink: 0, width: 22, height: 22, borderRadius: 6, background: "rgba(196,181,253,0.08)", border: "1px solid rgba(196,181,253,0.18)", color: "#A78BFA", cursor: "pointer", fontSize: 11, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Outfit" }}>
                  {leftCollapsed ? "▶" : "◀"}
                </button>
              </h2>
              {!leftCollapsed && <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", fontWeight: 600, letterSpacing: "0.08em", marginTop: 2 }}>{lang === "fr" ? "HEURE PARIS" : "PARIS TIME"}</div>}
              {!leftCollapsed && <div style={{ fontSize: 9, color: "#fff", fontWeight: 700, marginTop: 3 }}>{lang === "fr" ? "Clic sur un match = filtrer la base" : "Click a match = filter the list"}</div>}
            </div>

            {/* ─── DECISIVE PICK TOP 3 — colonne gauche sous la date ─── */}
            {!leftCollapsed && dayData.decisiveTop3?.length > 0 && (() => {
              const RANK_COLORS = ["#FFD700", "#C0C0C0", "#CD7F32"];
              const dp0 = dayData.decisivePick;
              const dpPlayed = dp0.last_so5_date && dp0.last_so5_date >= gwWeekStart && dp0.last_so5_score != null;
              const dpWon = dpPlayed && dp0.last_so5_score >= 60;
              return (
                <div style={{ marginBottom: 8, background: "linear-gradient(135deg, rgba(6,2,20,0.9), rgba(15,5,40,0.85))", border: "1px solid rgba(196,181,253,0.2)", borderRadius: 8, padding: "6px 10px" }}>
                  <div style={{ fontSize: 7, fontWeight: 800, color: dpPlayed ? (dpWon ? "#4ADE80" : "#EF4444") : "#A78BFA", letterSpacing: "0.1em", marginBottom: 4 }}>
                    {dpWon
                      ? (lang === "fr" ? "DECISIVE PICKER — +2 000 ESSENCE !" : "DECISIVE PICKER — +2,000 ESSENCE!")
                      : dpPlayed
                      ? (lang === "fr" ? "DECISIVE PICKER — 0 ESSENCE" : "DECISIVE PICKER — 0 ESSENCE")
                      : (lang === "fr" ? "DECISIVE PICKER — 2 000 ESSENCE" : "DECISIVE PICKER — 2,000 ESSENCE")}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    {dayData.decisiveTop3.map((dp, ri) => {
                      const rankColor = RANK_COLORS[ri] || "#888";
                      const pc = PC[dp.position];
                      const parisTime = utcToParisTime(dp.kickoff, dp.matchDate);
                      const gaR = dp.ga_per_match?.toFixed(2) || "0.00";
                      const played = dp.last_so5_date && dp.last_so5_date >= gwWeekStart && dp.last_so5_score != null;
                      return (
                        <div key={ri} style={{ display: "flex", alignItems: "center", gap: 6, background: ri === 0 ? "rgba(255,215,0,0.06)" : "rgba(255,255,255,0.02)", border: `1px solid ${rankColor}30`, borderRadius: 6, padding: "4px 8px" }}>
                          <div style={{ fontSize: 14, fontWeight: 900, color: rankColor, fontFamily: "'DM Mono',monospace", flexShrink: 0, width: 18, textAlign: "center" }}>{ri + 1}</div>
                          <span style={{ fontSize: 6, fontWeight: 800, background: `linear-gradient(135deg,${pc},${pc}CC)`, borderRadius: 3, padding: "1px 4px", color: "#fff", flexShrink: 0 }}>{dp.position}</span>
                          {logos[dp.club] && <img src={`/data/logos/${logos[dp.club]}`} alt="" style={{ width: 12, height: 12, objectFit: "contain", flexShrink: 0 }} />}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                              <span style={{ fontSize: 10, fontWeight: ri === 0 ? 900 : 700, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{dp.name}</span>
                              {dp.sorare_starter_pct != null && (
                                <span style={{ fontSize: 7, fontWeight: 800, fontFamily: "'DM Mono',monospace", color: dp.sorare_starter_pct >= 80 ? "#4ADE80" : "#FBBF24", flexShrink: 0 }}>{dp.sorare_starter_pct}%</span>
                              )}
                            </div>
                            <div style={{ fontSize: 7, color: "rgba(255,255,255,0.4)" }}>
                              {dp.isHome ? "🏠" : "✈️"} vs {sn(dp.oppName)}
                              {parisTime && !played && <span style={{ color: "#A78BFA", marginLeft: 3 }}>{parisTime}</span>}
                            </div>
                          </div>
                          <div style={{ textAlign: "right", flexShrink: 0 }}>
                            <div style={{ fontSize: 7, color: "rgba(255,255,255,0.4)" }}>G+A <span style={{ color: "#4ADE80", fontWeight: 700 }}>{gaR}</span></div>
                            <div style={{ fontSize: 8, fontWeight: 800, color: dp.pDecisive >= 50 ? "#4ADE80" : dp.pDecisive >= 30 ? "#F59E0B" : "#C4B5FD", fontFamily: "'DM Mono',monospace" }}>{dp.pDecisive}%</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Match list — groupé par créneau horaire, trié chrono heure France */}
            {!leftCollapsed && (() => {
              // Build club→score map from players who already played this GW
              // Normalise les noms (ex: "Paris Saint-Germain" → "Paris Saint Germain")
              const stripAcc = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
              const normClub = (n) => stripAcc((n || "").replace(/-/g, " ").trim());
              const ALIASES = [
                ["rennais","rennes"],
                ["celta","celta vigo"],
                ["cologne","koln"],
              ];
              const clubMatch = (a, b) => {
                const na = normClub(a).toLowerCase();
                const nb = normClub(b).toLowerCase();
                if (na === nb || na.includes(nb) || nb.includes(na)) return true;
                for (const [x, y] of ALIASES) {
                  if ((na.includes(x) && nb.includes(y)) || (na.includes(y) && nb.includes(x))) return true;
                }
                return false;
              };
              const clubScores = {};
              for (const p of dayData.players || []) {
                if (p.last_so5_date && p.last_so5_date >= gwWeekStart && p.last_match_home_goals != null) {
                  const key = normClub(p.club);
                  if (!clubScores[key]) clubScores[key] = { home: p.last_match_home_goals, away: p.last_match_away_goals };
                }
              }

              const sorted = [...dayData.fixtures].sort((a, b) => (a.date || "").localeCompare(b.date || "") || (a.kickoff || "99:99").localeCompare(b.kickoff || "99:99"));
              // Grouper par DATE puis par créneau horaire
              const dateGroups = [];
              for (const f of sorted) {
                const lastDate = dateGroups[dateGroups.length - 1];
                if (!lastDate || lastDate.date !== f.date) {
                  dateGroups.push({ date: f.date, fixtures: [f] });
                } else {
                  lastDate.fixtures.push(f);
                }
              }
              const hasEuroMatches = sorted.some(f => EURO_LEAGUES.includes(f.league));
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {hasEuroMatches && (
                    <div style={{ padding: "6px 10px", borderRadius: 8, background: "linear-gradient(135deg, rgba(249,115,22,0.15), rgba(245,158,11,0.1))", border: "1px solid rgba(249,115,22,0.3)", display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 14 }}>&#9917;</span>
                      <div>
                        <div style={{ fontSize: 8, fontWeight: 800, color: "#F97316", letterSpacing: "0.05em" }}>UCL / UEL / UECL</div>
                        <div style={{ fontSize: 7, color: "rgba(255,255,255,0.5)" }}>{lang === "fr" ? "Le D-Score n'est pas calibre pour les matchs europeens. Les predictions peuvent etre moins fiables." : "D-Score is not calibrated for European matches. Predictions may be less reliable."}</div>
                      </div>
                    </div>
                  )}
                  {dateGroups.map((dg, dgi) => {
                    // Sous-grouper par heure
                    const groups = [];
                    for (const f of dg.fixtures) {
                      const parisTime = utcToParisTime(f.kickoff, f.date) || "TBD";
                      const last = groups[groups.length - 1];
                      if (last && last.time === parisTime) last.fixtures.push(f);
                      else groups.push({ time: parisTime, fixtures: [f] });
                    }
                    // Label date en francais
                    const dateObj = new Date(dg.date + "T12:00:00");
                    const dateLabel = dateObj.toLocaleDateString(S.stellarDateLocale, { timeZone: TZ, weekday: "long", day: "numeric", month: "short" }).toUpperCase();
                    return (
                    <div key={dgi}>
                      {/* Separateur date — visible si multi-jours */}
                      {selectedDays.length > 1 && (
                        <div style={{ padding: "4px 0 3px", marginBottom: 4, borderBottom: "1px solid rgba(196,181,253,0.15)" }}>
                          <span style={{ fontSize: 9, fontWeight: 800, color: "#C4B5FD", letterSpacing: "0.06em" }}>{dateLabel}</span>
                        </div>
                      )}
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {groups.map((g, gi) => (
                    <div key={gi} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <div className="st-match-group-time-label" style={{ fontSize: 10, fontWeight: 900, color: "#fff", fontFamily: "'DM Mono',monospace", paddingLeft: 2 }}>{g.time}</div>
                      {g.fixtures.map((f, i) => {
                        const lgColor = LEAGUE_COLOR[f.league] || "#FF8A80";
                        const findScore = (name) => {
                          const direct = clubScores[normClub(name)];
                          if (direct != null) return direct;
                          for (const [key, val] of Object.entries(clubScores)) {
                            if (clubMatch(key, name)) return val;
                          }
                          return null;
                        };
                        // Score réel uniquement si le match est déjà joué (date passée)
                        const todayStrFx = new Date().toISOString().split("T")[0];
                        const sc = (f.date < todayStrFx) ? (findScore(f.home) ?? findScore(f.away) ?? null) : null;
                        const scoreStr = sc != null ? `${sc.home}-${sc.away}` : null;

                        // Trouver les events de ce match dans matchEvents
                        const ev = Object.values(matchEvents).find(e =>
                          normClub(e.home || "") === normClub(f.home) || normClub(e.away || "") === normClub(f.away)
                        ) || null;

                        // Formatter buteurs : "Dembélé x2, Ramos"
                        const fmtScorers = (scorers) => scorers.map(s => {
                          const lastName = (s.name || "").split(" ").pop();
                          return s.goals > 1 ? `${lastName} x${s.goals}` : lastName;
                        }).join(", ");

                        const homeScorersStr = ev ? fmtScorers(ev.home_scorers || []) : "";
                        const awayScorersStr = ev ? fmtScorers(ev.away_scorers || []) : "";
                        const hasScorers = homeScorersStr || awayScorersStr;

                        // Joueurs ayant scoré dans ce match
                        const matchKey = `${normClub(f.home)}_${normClub(f.away)}`;
                        const isOpenHome = expandedFixture?.key === matchKey && expandedFixture?.side === "home";
                        const isOpenAway = expandedFixture?.key === matchKey && expandedFixture?.side === "away";
                        const isOpen = isOpenHome || isOpenAway;
                        const activeSide = isOpenHome ? "home" : isOpenAway ? "away" : null;
                        const playersOf = (club) => [...(players || [])].filter(p =>
                          p.last_so5_date && p.last_so5_date >= gwWeekStart &&
                          p.last_so5_score != null && p.last_so5_score > 0 &&
                          clubMatch(p.club, club)
                        ).sort((a, b) => b.last_so5_score - a.last_so5_score);
                        const hasHomePlayers = scoreStr && playersOf(f.home).length > 0;
                        const hasAwayPlayers = scoreStr && playersOf(f.away).length > 0;
                        const matchPlayers = activeSide ? playersOf(activeSide === "home" ? f.home : f.away) : [];
                        const toggleSide = (side) => {
                          if (expandedFixture?.key === matchKey && expandedFixture?.side === side) setExpandedFixture(null);
                          else setExpandedFixture({ key: matchKey, side });
                        };

                        return (
                          <div key={i} style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                            {/* Chip cliquable */}
                            <div className="st-match-chip" onClick={() => {
                              setSelectedMatchFilters(prev => {
                                const exists = prev.some(m => m.home === f.home && m.away === f.away);
                                if (exists) return prev.filter(m => !(m.home === f.home && m.away === f.away));
                                return [...prev, { home: f.home, away: f.away }];
                              });
                            }} style={{ display: "grid", gridTemplateColumns: "38px 28px 16px 1fr 34px 1fr 16px", alignItems: "center", columnGap: 6, padding: "4px 8px", cursor: "pointer",
                              background: selectedMatchFilters.some(m => m.home === f.home && m.away === f.away) ? "rgba(139,92,246,0.35)" : isOpen ? "rgba(50,20,100,0.6)" : "rgba(30,10,70,0.45)",
                              border: `1px solid ${selectedMatchFilters.some(m => m.home === f.home && m.away === f.away) ? "rgba(167,139,250,0.6)" : isOpen ? "rgba(196,181,253,0.3)" : "rgba(140,100,255,0.12)"}`,
                              borderRadius: isOpen ? "6px 6px 0 0" : 6, backdropFilter: "blur(6px)", transition: "all 0.15s" }}>
                              <span className="st-match-time-inline" style={{ visibility: "hidden", fontSize: 8, fontWeight: 900, color: "#A78BFA", fontFamily: "'DM Mono',monospace", flexShrink: 0 }}>{g.time}</span>
                              <span style={{ fontSize: 8, fontWeight: 800, color: lgColor, minWidth: 22 }}>{f.league}</span>
                              <img src={logos[f.home] ? `/data/logos/${logos[f.home]}` : ""} alt="" style={{ width: 14, height: 14, objectFit: "contain", visibility: logos[f.home] ? "visible" : "hidden" }} />
                              <span className="mc-home" onClick={() => hasHomePlayers && toggleSide("home")} style={{ fontSize: 11, fontWeight: 600, color: isOpenHome ? "#C4B5FD" : "#fff", cursor: hasHomePlayers ? "pointer" : "default", textDecoration: isOpenHome ? "underline" : "none", transition: "color 0.15s" }}>{sn(f.home)}</span>
                              {scoreStr ? (
                                <span className="mc-vs" style={{ fontSize: 10, fontWeight: 900, color: "#fff", fontFamily: "'DM Mono',monospace", textAlign: "center", whiteSpace: "nowrap" }}>{scoreStr}</span>
                              ) : (
                                <span className="mc-vs" style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", whiteSpace: "nowrap" }}>vs</span>
                              )}
                              <span className="mc-away" onClick={() => hasAwayPlayers && toggleSide("away")} style={{ fontSize: 11, fontWeight: 600, color: isOpenAway ? "#C4B5FD" : hasAwayPlayers ? "#fff" : "rgba(255,255,255,0.35)", cursor: hasAwayPlayers ? "pointer" : "default", textDecoration: isOpenAway ? "underline" : "none", transition: "color 0.15s" }}>{sn(f.away)}</span>
                              <img src={logos[f.away] ? `/data/logos/${logos[f.away]}` : ""} alt="" style={{ width: 14, height: 14, objectFit: "contain", visibility: logos[f.away] ? "visible" : "hidden" }} />
                            </div>

                            {/* Dropdown scores joueurs */}
                            {isOpen && matchPlayers.length > 0 && (
                              <div style={{ background: "rgba(15,5,40,0.95)", border: "1px solid rgba(196,181,253,0.15)", borderTop: "none", borderRadius: "0 0 6px 6px", padding: "4px 0", backdropFilter: "blur(8px)" }}>
                                {matchPlayers.map((p, pi) => {
                                  const sc = Math.round(p.last_so5_score);
                                  const col = p.last_so5_score >= 75 ? "#4ADE80" : p.last_so5_score >= 60 ? "#A3E635" : p.last_so5_score >= 50 ? "#FBBF24" : p.last_so5_score >= 40 ? "#FB923C" : "#EF4444";
                                  const pc = PC[p.position] || "#888";
                                  const isHome = normClub(p.club) === normClub(f.home);
                                  return (
                                    <div key={pi} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 10px", borderBottom: pi < matchPlayers.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                                      <span style={{ fontSize: 7, fontWeight: 800, background: pc, borderRadius: 2, padding: "1px 4px", color: "#fff", minWidth: 22, textAlign: "center" }}>{p.position}</span>
                                      {logos[p.club] && <img src={`/data/logos/${logos[p.club]}`} alt="" style={{ width: 10, height: 10, objectFit: "contain" }} />}
                                      <span style={{ fontSize: 10, color: "rgba(255,255,255,0.8)", flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name.split(" ").pop()}</span>
                                      <span style={{ fontSize: 8, color: "rgba(255,255,255,0.3)", marginLeft: "auto" }}>{isHome ? "🏠" : "✈️"}</span>
                                      <span style={{ fontSize: 12, fontWeight: 900, color: col, fontFamily: "'DM Mono',monospace", minWidth: 28, textAlign: "right" }}>{sc}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                      </div>
                    </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>{/* fin colonne gauche */}

          {/* Colonne droite — Decisive Pick + Teams 2×2 */}
          <div style={{ flex: 1, minWidth: 0 }}>

          {/* ══ MON ÉQUIPE STELLAIRE — masqué temporairement (WIP) ══ */}
          {showMyTeam && (() => {
            const pickedPlayers = TEAM_SLOTS.map(s => myPicks[s]).filter(Boolean);
            const filledCount = pickedPlayers.length;
            // Score total ajusté + bonus capitaine (highest ds)
            const scores = pickedPlayers.map(p => getAdjDs(p));
            const capDs = scores.length === 5 ? Math.max(...scores) : 0;
            const totalAdj = Math.round(scores.reduce((s, v) => s + v, 0) + capDs * 0.5);
            const palier = PALIERS.filter(p => totalAdj >= p.pts).pop();
            const dayPool = [...(dayData?.players || [])].sort((a, b) => getAdjDs(b) - getAdjDs(a));
            const POS_SLOT_COLORS = { GK: "#4FC3F7", DEF: "#818CF8", MIL: "#C084FC", FLEX: "#A78BFA", ATT: "#F87171" };

            return (
              <div style={{ borderRadius: 14, background: "rgba(6,3,20,0.95)", border: "none", overflow: "hidden", backdropFilter: "blur(16px)", display: "flex", flexDirection: "column", height: "calc(100vh - 280px)", position: "relative" }}>

                {/* ── Loading overlay cartes Sorare ── */}
                {sorareLoading && (
                  <div style={{ position: "absolute", inset: 0, zIndex: 20, background: "rgba(6,3,20,0.97)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, backdropFilter: "blur(12px)", borderRadius: 14 }}>
                    {/* Logo Stellar anime */}
                    <img src="/Stellar.png" alt="" style={{ width: 56, height: 56, objectFit: "contain", animation: "holoShift 3s linear infinite", filter: "drop-shadow(0 0 16px rgba(167,139,250,0.5))" }} />
                    {/* Spinner */}
                    <div style={{ width: 44, height: 44, border: "3px solid rgba(196,181,253,0.15)", borderTop: "3px solid #C4B5FD", borderRight: "3px solid #A78BFA", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                    {/* Texte principal */}
                    <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", fontFamily: "Outfit", textAlign: "center" }}>
                      {sorareUser?.nickname
                        ? (lang === "fr" ? `Chargement de ${sorareUser.nickname}...` : `Loading ${sorareUser.nickname}...`)
                        : (lang === "fr" ? "Connexion a Sorare..." : "Connecting to Sorare...")}
                    </div>
                    {/* Sous-texte */}
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", textAlign: "center" }}>
                      {lang === "fr" ? "Recuperation de tes cartes Stellar" : "Fetching your Stellar cards"}
                    </div>
                    {/* Stats cache */}
                    {sorareCards.length > 0 && (
                      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                        <div style={{ textAlign: "center" }}>
                          <div style={{ fontSize: 16, fontWeight: 900, color: "#C4B5FD", fontFamily: "'DM Mono',monospace" }}>{sorareCards.length}</div>
                          <div style={{ fontSize: 8, color: "rgba(255,255,255,0.35)" }}>{lang === "fr" ? "cartes" : "cards"}</div>
                        </div>
                        <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.1)" }} />
                        <div style={{ textAlign: "center" }}>
                          <div style={{ fontSize: 16, fontWeight: 900, color: "#4ADE80", fontFamily: "'DM Mono',monospace" }}>{stellarCardCount}</div>
                          <div style={{ fontSize: 8, color: "rgba(255,255,255,0.35)" }}>Stellar</div>
                        </div>
                      </div>
                    )}
                    {/* Barre de progression */}
                    <div style={{ width: 220, height: 4, borderRadius: 4, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                      <div style={{ height: "100%", borderRadius: 4, background: "linear-gradient(90deg,#7C3AED,#C4B5FD,#A78BFA)", animation: "loadBar 2.5s ease-in-out infinite", width: "60%" }} />
                    </div>
                    {/* Estimation */}
                    <div style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", letterSpacing: "0.05em" }}>
                      {lang === "fr" ? "Synchronisation API Sorare (~10 sec)" : "Syncing with Sorare API (~10 sec)"}
                    </div>
                  </div>
                )}

                {/* ── Header ── */}
                <div style={{ padding: "9px 14px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <img src="/Stellar.png" alt="" style={{ width: 18, height: 18, objectFit: "contain" }} />
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 900, color: "#C4B5FD", letterSpacing: "0.05em" }}>{t(lang,"myTeamTitle")}</div>
                      <div style={{ fontSize: 8, color: "rgba(255,255,255,0.35)", marginTop: 1 }}>
                        {filledCount < 5 ? S.myTeamSelect(5 - filledCount) : <span style={{ color: palier?.silver ? "#C0C0C0" : palier ? palier.color : "rgba(255,255,255,0.35)" }}>Score : {totalAdj} pts{palier ? ` · ${palier.reward}` : ""}</span>}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    {/* Boutons visibles UNIQUEMENT si connecté */}
                    {sorareConnected && (<>
                      <button onClick={disconnectSorare} title={`Connecté : ${sorareUser?.nickname || sorareUser?.slug || "Sorare"}`} style={{
                        display: "flex", alignItems: "center", gap: 6,
                        padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(74,222,128,0.4)",
                        background: "rgba(74,222,128,0.08)", color: "#4ADE80",
                        fontSize: 9, fontWeight: 800, cursor: "pointer", fontFamily: "Outfit",
                      }}>
                        <div style={{ width: 20, height: 20, borderRadius: "50%", background: "rgba(74,222,128,0.25)", border: "1px solid rgba(74,222,128,0.4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 900, color: "#4ADE80", flexShrink: 0 }}>
                          {(sorareUser?.nickname || "S").charAt(0).toUpperCase()}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                          <span>{sorareUser?.nickname || "Sorare"}</span>
                          <span style={{ fontSize: 7, color: "rgba(74,222,128,0.6)" }}>{stellarCardCount} Stellar</span>
                        </div>
                      </button>
                      <button onClick={generateMagicTeam} style={{
                        display: "flex", alignItems: "center", gap: 5,
                        padding: "6px 12px", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: "Outfit",
                        background: "linear-gradient(135deg,#7C3AED,#8B5CF6,#A78BFA)",
                        color: "#fff", fontSize: 10, fontWeight: 800,
                        boxShadow: "0 0 14px rgba(139,92,246,0.5)",
                      }}>
                        <span style={{ fontSize: 12 }}>⚡</span> {t(lang,"myTeamAlgo")}
                      </button>
{/* Sauvegarder + Reset dans SCORE PROJ uniquement */}
                    </>)}
                  </div>
                </div>

                {/* ── Overlay FLOU + bouton CONNECTER si pas connecté ── */}
                {!sorareConnected && (
                  <div style={{ position: "absolute", inset: 0, zIndex: 10, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, background: "rgba(6,3,20,0.6)", backdropFilter: "blur(6px)", borderRadius: 14, padding: "20px" }}>
                    <div style={{ fontSize: 28 }}>🔗</div>
                    <div style={{ fontSize: 14, fontWeight: 900, color: "#fff", textAlign: "center", fontFamily: "Outfit" }}>
                      {lang === "fr" ? "Connecte ton compte Sorare" : "Connect your Sorare account"}
                    </div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", textAlign: "center", maxWidth: 280 }}>
                      {lang === "fr" ? "Compose ton equipe Stellar avec TES cartes et optimise ton score avec l'algo Deglingo" : "Build your Stellar team with YOUR cards and optimize your score with the Deglingo algo"}
                    </div>
                    <button onClick={connectSorare} disabled={sorareLoading} style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "12px 28px", borderRadius: 12,
                      border: "none",
                      background: "linear-gradient(135deg, #EF4444, #DC2626, #B91C1C)",
                      color: "#fff", fontSize: 15, fontWeight: 900, cursor: sorareLoading ? "wait" : "pointer", fontFamily: "Outfit",
                      boxShadow: "0 0 30px rgba(239,68,68,0.5), 0 6px 20px rgba(0,0,0,0.4)",
                      opacity: sorareLoading ? 0.6 : 1,
                      transition: "all 0.2s", letterSpacing: "0.04em",
                    }}>
                      <span style={{ fontSize: 18 }}>🔗</span>
                      {lang === "fr" ? "CONNECTER SORARE" : "CONNECT SORARE"}
                    </button>
                    <div style={{ fontSize: 8, color: "rgba(255,255,255,0.3)" }}>
                      {lang === "fr" ? "100% gratuit · Tes cartes restent sur Sorare" : "100% free · Your cards stay on Sorare"}
                    </div>
                  </div>
                )}

                {/* ── Corps : PITCH gauche + DATABASE droite ── */}
                <div style={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden" }}>

                  {/* ══ COLONNE GAUCHE : Sélection équipe ══ */}
                  <div style={{ width: 370, flexShrink: 0, display: "flex", flexDirection: "column", borderRight: "1px solid rgba(255,255,255,0.06)", background: "rgba(0,0,0,0.15)" }}>

                    {/* Reset — visible dès qu'un joueur est sélectionné */}
                    {filledCount > 0 && filledCount < 5 && (
                      <div style={{ padding: "4px 14px", borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", justifyContent: "flex-end" }}>
                        <button onClick={resetTeam} style={{ fontSize: 8, fontWeight: 700, padding: "3px 8px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontFamily: "Outfit" }}>Reset</button>
                      </div>
                    )}
                    {/* Score total — visible uniquement quand équipe complète */}
                    {filledCount === 5 && (
                      <div style={{ padding: "6px 14px", borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ fontSize: 8, color: "rgba(255,255,255,0.35)", fontWeight: 600, letterSpacing: "0.08em" }}>SCORE PROJ.</div>
                          {/* Bonus toggle inline */}
                          <button onClick={() => setBonusEnabled(v => !v)} style={{
                            fontSize: 7, fontWeight: 800, padding: "2px 6px", borderRadius: 4,
                            border: `1px solid ${bonusEnabled ? "rgba(74,222,128,0.4)" : "rgba(255,255,255,0.1)"}`,
                            background: bonusEnabled ? "rgba(74,222,128,0.08)" : "transparent",
                            color: bonusEnabled ? "#4ADE80" : "rgba(255,255,255,0.25)", cursor: "pointer", fontFamily: "Outfit",
                          }}>Bonus {bonusEnabled ? "ON" : "OFF"}</button>
                          {/* Sauvegarder — bouton rouge gradient */}
                          <button onClick={() => saveCurrentTeam(myPicks, cardEditions, totalAdj)}
                            disabled={savedTeams.length >= 4}
                            style={{
                              fontSize: 8, fontWeight: 800, padding: "3px 10px", borderRadius: 6,
                              border: "none", cursor: savedTeams.length >= 4 ? "not-allowed" : "pointer",
                              background: savedTeams.length >= 4 ? "rgba(255,255,255,0.05)" : "linear-gradient(135deg, #EF4444, #DC2626)",
                              color: savedTeams.length >= 4 ? "rgba(255,255,255,0.2)" : "#fff", fontFamily: "Outfit",
                              boxShadow: savedTeams.length >= 4 ? "none" : "0 0 8px rgba(239,68,68,0.3)",
                            }}>
                            {savedTeams.length >= 4 ? "4/4" : (lang === "fr" ? "Sauvegarder" : "Save")}
                          </button>
                          <button onClick={resetTeam} style={{
                            fontSize: 8, fontWeight: 700, padding: "3px 8px", borderRadius: 6,
                            border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.05)",
                            color: "rgba(255,255,255,0.4)", cursor: "pointer", fontFamily: "Outfit",
                          }}>Reset</button>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          {palier && <div style={{ fontSize: 8, fontWeight: 700, color: palier.silver ? "#C0C0C0" : palier.color }}>→ {palier.reward}</div>}
                          <div style={{
                            fontSize: 22, fontWeight: 900, fontFamily: "'DM Mono',monospace", lineHeight: 1, display: "inline-block",
                            color: palier?.silver ? "#1a1a2e" : (palier ? palier.color : "#C4B5FD"),
                            background: palier?.silver ? "linear-gradient(90deg,#C0C0C0,#A8E8D0,#B0C4E8,#D4B0E8,#E0D0E8,#fff,#D4B0E8,#B0C4E8,#A8E8D0,#C0C0C0)" : "none",
                            backgroundSize: palier?.silver ? "200% 100%" : "auto",
                            animation: palier?.silver ? "silverShine 3s linear infinite" : "none",
                            padding: palier?.silver ? "4px 10px" : 0,
                            borderRadius: palier?.silver ? 10 : 0,
                            boxShadow: palier?.silver ? "0 0 12px rgba(192,192,192,0.5)" : "none",
                          }}>{totalAdj}</div>
                        </div>
                      </div>
                    )}

                    {/* ── 5 CARTES STELLAIRES — layout 2 + 3 (style Sorare) ── */}
                    <div style={{ padding: "6px 8px 6px", flex: "0 0 auto", display: "flex", flexDirection: "column", gap: 5 }}>
                      {/* ── Rendu d'un slot carte (mutualisé ATT/FLEX et DEF/GK/MIL) ── */}
                      {[["ATT","FLEX"], ["DEF","GK","MIL"]].map((row, rowIdx) => (
                        <div key={rowIdx} style={{ display: "flex", gap: rowIdx === 0 ? 5 : 2, flex: "0 0 auto", justifyContent: "center", alignItems: "flex-start" }}>
                          {row.map(slot => {
                            const p = myPicks[slot];
                            const sc = POS_SLOT_COLORS[slot];
                            const adjDs = p ? getAdjDs(p) : 0;
                            const isCap = p && scores.length === 5 && adjDs === capDs;
                            const isActive = selectedSlot === slot;
                            // Vraie carte Sorare si connecté
                            const sorareCard = p ? sorareCardMap[p.slug] : null;
                            const dsColor2 = adjDs >= 80 ? "#4ADE80" : adjDs >= 65 ? "#C4B5FD" : adjDs >= 50 ? "#FBBF24" : "#F87171";
                            return (
                              <div key={slot} onClick={() => setSelectedSlot(isActive ? null : slot)}
                                style={{
                                  borderRadius: 10, cursor: "pointer", overflow: "hidden",
                                  background: sorareCard ? "transparent"
                                    : p ? `linear-gradient(160deg, #0d0826 0%, ${sc}30 60%, #0a0620 100%)`
                                    : isActive ? `${sc}18` : "rgba(255,255,255,0.025)",
                                  border: sorareCard ? "none" : `1.5px solid ${isActive ? sc + "CC" : p ? sc + "55" : "rgba(255,255,255,0.08)"}`,
                                  boxShadow: sorareCard ? "none" : (isActive ? `0 0 16px ${sc}60` : p ? `0 0 10px ${sc}25` : "none"),
                                  transition: "all 0.18s",
                                  display: "flex", flexDirection: "column", alignItems: "center",
                                  gap: sorareCard ? 0 : (rowIdx === 0 ? 5 : 4),
                                  padding: sorareCard ? 0 : (rowIdx === 0 ? "10px 8px" : "8px 6px"),
                                  position: "relative", width: 120, height: 166, flexShrink: 0,
                                  marginTop: slot === "GK" ? 12 : 0,
                                }}>

                                {/* ── Vraie carte Sorare ── */}
                                {sorareCard ? (
                                  <>
                                    <img src={sorareCard.pictureUrl} alt={p.name}
                                      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" }} />
                                    {/* Capitaine — cliquable, toggle */}
                                    <div onClick={e => { e.stopPropagation(); setMyPicks(prev => {
                                      // Toggle captain: set isCaptain on this player, remove from others
                                      const next = {};
                                      for (const [s, pp] of Object.entries(prev)) {
                                        if (!pp) { next[s] = null; continue; }
                                        next[s] = { ...pp, isCaptain: s === slot ? !pp.isCaptain : false };
                                      }
                                      return next;
                                    }); }}
                                      style={{ position: "absolute", top: 4, right: 24, width: 18, height: 18, borderRadius: "50%", background: isCap ? "#C4B5FD" : "rgba(255,255,255,0.12)", border: isCap ? "none" : "1px solid rgba(255,255,255,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 900, color: isCap ? "#0C0C2D" : "rgba(255,255,255,0.5)", cursor: "pointer", zIndex: 2, transition: "all 0.15s" }}>C</div>
                                    {/* D-Score + totalBonus en bas droite */}
                                    <div style={{ position: "absolute", bottom: 6, right: 6, zIndex: 2, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                                      {(sorareCard.totalBonus || 0) > 0 && (
                                        <span style={{ fontSize: 10, fontWeight: 900, color: "#4ADE80", fontFamily: "'DM Mono',monospace", background: "rgba(0,0,0,0.7)", borderRadius: 5, padding: "2px 5px" }}>+{sorareCard.totalBonus}%</span>
                                      )}
                                      <span style={{ display: "inline-block", padding: "3px 7px", borderRadius: 8, fontFamily: "'DM Mono',monospace", fontSize: 14, fontWeight: 700, color: isSilver(adjDs) ? "#1a1a2e" : "#fff", background: isSilver(adjDs) ? "linear-gradient(90deg,#C0C0C0,#A8E8D0,#B0C4E8,#D4B0E8,#E0D0E8,#fff,#D4B0E8,#B0C4E8,#A8E8D0,#C0C0C0)" : dsBg(adjDs), backgroundSize: isSilver(adjDs) ? "200% 100%" : "auto", animation: isSilver(adjDs) ? "silverShine 3s linear infinite" : "none", boxShadow: `0 0 8px ${dsColor(adjDs)}50` }}>{adjDs}</span>
                                    </div>
                                    {/* Titu% pancarte — haut droite sous capitaine */}
                                    <div style={{ position: "absolute", top: 24, right: 4, zIndex: 2 }}>
                                      <span style={{ fontSize: 9, fontWeight: 600, fontFamily: "Outfit", padding: "2px 5px", borderRadius: 4, letterSpacing: "0.02em", color: "#fff", background: (p.sorare_starter_pct || 0) >= 70 ? "linear-gradient(135deg,#166534,#15803d)" : (p.sorare_starter_pct || 0) >= 50 ? "linear-gradient(135deg,#854d0e,#a16207)" : "linear-gradient(135deg,#991b1b,#b91c1c)", boxShadow: "0 1px 4px rgba(0,0,0,0.5)" }}>
                                        {p.sorare_starter_pct == null ? "—" : `${p.sorare_starter_pct}%`}
                                      </span>
                                    </div>
                                    {/* Bouton x — haut gauche */}
                                    <button onClick={e => { e.stopPropagation(); removeFromTeam(slot); }}
                                      style={{ position: "absolute", top: 4, left: 4, background: "rgba(0,0,0,0.5)", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer", fontSize: 10, lineHeight: 1, padding: "2px 5px", borderRadius: 4, zIndex: 2 }}>x</button>
                                  </>
                                ) : p ? (
                                  /* ── Slot rempli sans carte Sorare ── */
                                  <>
                                    <span style={{ fontSize: rowIdx === 0 ? 7 : 6, fontWeight: 900, color: "#fff", background: sc, borderRadius: 4, padding: "2px 6px", letterSpacing: "0.05em" }}>{slot}</span>
                                    {isCap && <div style={{ position: "absolute", top: rowIdx === 0 ? 6 : 5, right: rowIdx === 0 ? 6 : 5, width: rowIdx === 0 ? 16 : 14, height: rowIdx === 0 ? 16 : 14, borderRadius: "50%", background: "#C4B5FD", display: "flex", alignItems: "center", justifyContent: "center", fontSize: rowIdx === 0 ? 8 : 7, fontWeight: 900, color: "#0C0C2D" }}>C</div>}
                                    {logos[p.club] && <img src={`/data/logos/${logos[p.club]}`} alt="" style={{ width: rowIdx === 0 ? 32 : 26, height: rowIdx === 0 ? 32 : 26, objectFit: "contain" }} />}
                                    <div style={{ fontSize: rowIdx === 0 ? 11 : 9, fontWeight: 800, color: "#fff", textAlign: "center", lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", width: "100%" }}>{p.name.split(" ").pop()}</div>
                                    <div style={{ fontSize: rowIdx === 0 ? 18 : 15, fontWeight: 900, color: dsColor2, fontFamily: "'DM Mono',monospace", lineHeight: 1 }}>{adjDs}</div>
                                    <button onClick={e => { e.stopPropagation(); removeFromTeam(slot); }}
                                      style={{ position: "absolute", bottom: rowIdx === 0 ? 4 : 3, right: rowIdx === 0 ? 4 : 3, background: "rgba(255,255,255,0.06)", border: "none", color: "rgba(255,255,255,0.3)", cursor: "pointer", fontSize: rowIdx === 0 ? 12 : 11, lineHeight: 1, padding: "2px 5px", borderRadius: 4 }}>×</button>
                                  </>
                                ) : (
                                  /* ── Slot vide ── */
                                  <>
                                    <span style={{ fontSize: rowIdx === 0 ? 7 : 6, fontWeight: 900, color: "#fff", background: sc, borderRadius: 4, padding: "2px 6px", letterSpacing: "0.05em" }}>{slot}</span>
                                    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: rowIdx === 0 ? 4 : 3 }}>
                                      <div style={{ fontSize: rowIdx === 0 ? 22 : 18, opacity: 0.15, color: sc }}>+</div>
                                      <div style={{ fontSize: rowIdx === 0 ? 7 : 6, color: "rgba(255,255,255,0.2)", fontStyle: "italic", textAlign: "center" }}>{isActive ? t(lang,"myTeamClickPlayer") : t(lang,"myTeamEmpty")}</div>
                                    </div>
                                  </>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>

                    {/* ── 4 SLOTS SAUVEGARDE ── */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 5, padding: "8px 10px", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                      {[0,1,2,3].map(i => {
                        const st = savedTeams[i];
                        const POS_ORDER = ["GK","DEF","MIL","ATT","FLEX"];
                        return st ? (
                          <div key={st.id} style={{ borderRadius: 7, background: "rgba(74,222,128,0.06)", border: "1px solid rgba(74,222,128,0.18)", padding: "5px 8px", display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontSize: 8, fontWeight: 800, color: "#4ADE80", flexShrink: 0 }}>{st.label}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 7, color: "rgba(255,255,255,0.45)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {POS_ORDER.map(s => st.picks[s]?.name?.split(" ").pop()).filter(Boolean).join(" · ")}
                              </div>
                            </div>
                            <span style={{ fontSize: 9, fontWeight: 900, color: "#C4B5FD", fontFamily: "'DM Mono',monospace", flexShrink: 0 }}>{st.score}</span>
                            <button onClick={() => loadSavedTeam(st)} style={{ fontSize: 7, fontWeight: 700, padding: "2px 6px", borderRadius: 4, border: "1px solid rgba(196,181,253,0.3)", background: "rgba(196,181,253,0.08)", color: "#C4B5FD", cursor: "pointer", fontFamily: "Outfit", flexShrink: 0 }}>{S.myTeamLoad}</button>
                            <button onClick={() => deleteSavedTeam(st.id)} style={{ fontSize: 8, fontWeight: 700, padding: "2px 5px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.3)", cursor: "pointer", fontFamily: "Outfit", flexShrink: 0 }}>×</button>
                          </div>
                        ) : (
                          <div key={i} style={{ borderRadius: 7, background: "rgba(255,255,255,0.015)", border: "1px dashed rgba(255,255,255,0.06)", padding: "5px 8px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <span style={{ fontSize: 7, color: "rgba(255,255,255,0.12)", fontStyle: "italic" }}>{S.myTeamSlotEmpty(i+1)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* ══ COLONNE DROITE : Base de données joueurs ══ */}
                  <div style={{ flex: 2, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>

                  {/* ── Filtres : Dispo - Mes Cartes - Bonus - Titu% ── */}
                  <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderBottom: "1px solid rgba(255,255,255,0.07)", background: "rgba(0,0,0,0.3)", flexShrink: 0 }}>
                    <button onClick={() => setHideUsed(v => !v)} style={{ fontSize: 7, fontWeight: 700, padding: "3px 8px", borderRadius: 6, border: `1px solid ${hideUsed ? "rgba(251,191,36,0.5)" : "rgba(255,255,255,0.1)"}`, background: hideUsed ? "rgba(251,191,36,0.12)" : "transparent", color: hideUsed ? "#FBBF24" : "rgba(255,255,255,0.3)", cursor: "pointer", fontFamily: "Outfit", transition: "all 0.15s" }}>
                      {hideUsed ? (lang === "fr" ? "Dispo" : "Avail.") : (lang === "fr" ? "Cacher" : "Hide")}
                    </button>
                    <button onClick={() => setMyCardsMode(true)} style={{ fontSize: 8, fontWeight: 700, padding: "3px 9px", borderRadius: 6, border: `1px solid ${myCardsMode ? "rgba(74,222,128,0.5)" : "rgba(255,255,255,0.1)"}`, background: myCardsMode ? "rgba(74,222,128,0.12)" : "transparent", color: myCardsMode ? "#4ADE80" : "rgba(255,255,255,0.35)", cursor: "pointer", fontFamily: "Outfit", transition: "all 0.15s" }}>{lang === "fr" ? `Mes cartes · ${myCardsDayPlayers.playing.length} ce soir` : `My cards · ${myCardsDayPlayers.playing.length} tonight`}</button>
                    <button onClick={() => setBonusEnabled(v => !v)} style={{ fontSize: 7, fontWeight: 700, padding: "3px 8px", borderRadius: 6, border: `1px solid ${bonusEnabled ? "rgba(74,222,128,0.5)" : "rgba(255,255,255,0.1)"}`, background: bonusEnabled ? "rgba(74,222,128,0.12)" : "transparent", color: bonusEnabled ? "#4ADE80" : "rgba(255,255,255,0.3)", cursor: "pointer", fontFamily: "Outfit", transition: "all 0.15s" }}>
                      {bonusEnabled ? "Bonus ON" : "Bonus OFF"}
                    </button>
                    {/* Slider Titu% */}
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ fontSize: 7, fontWeight: 700, color: filterTitu ? "#4ADE80" : "rgba(255,255,255,0.3)", fontFamily: "Outfit", whiteSpace: "nowrap" }}>
                        {filterTitu ? `Titu \u2265${filterTitu}%` : "Titu%"}
                      </span>
                      <input type="range" min={0} max={90} step={10} value={filterTitu}
                        onChange={e => setFilterTitu(Number(e.target.value))}
                        style={{ width: 70, height: 4, accentColor: "#4ADE80", cursor: "pointer" }}
                      />
                    </div>
                  </div>

                  {/* ── LISTE JOUEURS SIMPLIFIEE ── */}
                  {(() => {
                    const R = v => v != null ? Math.round(v) : "—";
                    const dc = v => v == null ? "rgba(255,255,255,0.2)" : v >= 80 ? "#4ADE80" : v >= 65 ? "#A3E635" : v >= 50 ? "#FBBF24" : v >= 35 ? "#FB923C" : "#EF4444";
                    const aac = v => v == null ? "rgba(255,255,255,0.2)" : "rgba(196,181,253,0.8)";
                    const tituC = v => v >= 80 ? "#4ADE80" : v >= 50 ? "#FBBF24" : v > 0 ? "#EF4444" : "rgba(255,255,255,0.2)";
                    const pctC = v => v == null ? "rgba(255,255,255,0.2)" : v >= 40 ? "#4ADE80" : v >= 25 ? "#FCD34D" : v >= 15 ? "#FB923C" : "#EF4444";
                    const poisPMF = (l, k) => { let f=1; for(let i=1;i<=k;i++) f*=i; return Math.exp(-l)*Math.pow(l,k)/f; };
                    const getMatchProbs = (p) => {
                      const pt = findTeam(teams, p.club);
                      const ot = findTeam(teams, p.oppName);
                      if (!pt || !ot) return null;
                      const lp = p.isHome ? (pt.xg_dom||1.3) : (pt.xg_ext||1.1);
                      const lo = p.isHome ? (ot.xg_ext||1.1) : (ot.xg_dom||1.3);
                      let w=0, d=0, l=0;
                      for (let i=0; i<=7; i++) for (let j=0; j<=7; j++) {
                        const pr = poisPMF(lp,i)*poisPMF(lo,j);
                        if (i>j) w+=pr; else if (i===j) d+=pr; else l+=pr;
                      }
                      return { win:Math.round(w*100), draw:Math.round(d*100), loss:Math.round(l*100) };
                    };
                    const [sortCol, setSortCol] = [teamSort, setTeamSort];
                    // Filtre par slot sélectionné
                    const slotFilter = selectedSlot
                      ? selectedSlot === "FLEX"
                        ? dayPool.filter(p => ["DEF","MIL","ATT"].includes(p.position))
                        : dayPool.filter(p => p.position === selectedSlot)
                      : dayPool;
                    // Filtre hideUsed (Dispo) + matchs + titu%
                    const filteredPool = slotFilter.filter(p => {
                      if (hideUsed && isInTeam(p)) return false;
                      if (filterTitu && (p.sorare_starter_pct == null || p.sorare_starter_pct < filterTitu)) return false;
                      if (selectedMatchFilters.length > 0) {
                        if (!selectedMatchFilters.some(m => clubMatchGlobal(p.club, m.home) || clubMatchGlobal(p.club, m.away))) return false;
                      }
                      return true;
                    });
                    // Filtre "Mes cartes" : une ligne par carte possédée (2x Yamal → 2 lignes)
                    // Utilise myCardsDayPlayers.playing (bypass filtre titu%) comme base
                    const visiblePool = (myCardsMode && sorareConnected)
                      ? (() => {
                          const playingToday = myCardsDayPlayers.playing;
                          const expanded = [];
                          const addedCardSlugs = new Set();
                          for (const p of playingToday) {
                            const slug = p.slug || p.name;
                            // Filtre Stellar uniquement
                            const playerCards = sorareCards.filter(c => c.playerSlug === slug && c.isStellar);
                            if (!playerCards.length) continue;
                            // Filtre slot actif si sélectionné
                            if (selectedSlot) {
                              if (selectedSlot === "FLEX" && !["DEF","MIL","ATT"].includes(p.position)) continue;
                              if (selectedSlot !== "FLEX" && p.position !== selectedSlot) continue;
                            }
                            // Filtre Dispo + titu% + matchs
                            if (hideUsed && isInTeam(p)) continue;
                            if (filterTitu && (p.sorare_starter_pct == null || p.sorare_starter_pct < filterTitu)) continue;
                            if (selectedMatchFilters.length > 0) {
                              if (!selectedMatchFilters.some(m => clubMatchGlobal(p.club, m.home) || clubMatchGlobal(p.club, m.away))) continue;
                            }
                            for (const card of playerCards) {
                              if (addedCardSlugs.has(card.cardSlug)) continue;
                              addedCardSlugs.add(card.cardSlug);
                              expanded.push({ ...p, _cardSlug: card.cardSlug, _cardRarity: card.rarity, _cardEdition: card.cardEditionName, _cardTotalBonus: card.totalBonus });
                            }
                          }
                          return expanded;
                        })()
                      : filteredPool;
                    const sortedPool = [...visiblePool].sort((a, b) => {
                      if (sortCol === "ds")   return getAdjDs(b) - getAdjDs(a);
                      if (sortCol === "win")  return 0; // Poisson removed
                      if (sortCol === "cs")   return (b.csPercent||0) - (a.csPercent||0);
                      if (sortCol === "dom")  return (b.avg_dom||0) - (a.avg_dom||0);
                      if (sortCol === "ext")  return (b.avg_ext||0) - (a.avg_ext||0);
                      if (sortCol === "l2")   return (b.l2||0) - (a.l2||0);
                      if (sortCol === "aa2")  return (b.aa2||0) - (a.aa2||0);
                      if (sortCol === "l5")   return (b.l5||0) - (a.l5||0);
                      if (sortCol === "aa5")  return (b.aa5||0) - (a.aa5||0);
                      if (sortCol === "l10")  return (b.l10||0) - (a.l10||0);
                      if (sortCol === "aa10") return (b.aa10||0) - (a.aa10||0);
                      if (sortCol === "l40")  return (b.l40||0) - (a.l40||0);
                      if (sortCol === "aa40") return (b.aa40||0) - (a.aa40||0);
                      if (sortCol === "ga")   return ((b.goals||0)+(b.assists||0)) - ((a.goals||0)+(a.assists||0));
                      if (sortCol === "titu_s") return (b.sorare_starter_pct||0) - (a.sorare_starter_pct||0);
                      if (sortCol === "titu") return (b.titu_pct||0) - (a.titu_pct||0);
                      if (sortCol === "reg")  return (b.reg10||0) - (a.reg10||0);
                      return getAdjDs(b) - getAdjDs(a);
                    });
                    // Colonnes header : [col, label, title]
                    const COLS = [
                      ["ds","D-Score","D-Score Deglingo"],
                      ["opp", S.myTeamColAdv, S.myTeamTitleAdv],
                      ["titu_s", S.myTeamColTituS, S.myTeamTitleTituS],
                      ["cs", S.myTeamColCS, S.myTeamTitleCS],
                      ["adv", S.myTeamColWin, S.myTeamTitleWin],
                      ["l2","L2", S.myTeamTitleL2],["aa2","AA2", S.myTeamTitleAA2],
                      ["l5","L5", S.myTeamTitleL5],["aa5","AA5", S.myTeamTitleAA5],
                      ["l10","L10", S.myTeamTitleL10],
                      ["dom", S.myTeamColDOM, S.myTeamTitleDOM],
                      ["ext", S.myTeamColEXT, S.myTeamTitleEXT],
                      ["aa10","AA10", S.myTeamTitleAA10],
                      ["titu", S.myTeamColTitu10, S.myTeamTitleTitu10],
                      ["reg", S.myTeamColReg, S.myTeamTitleReg],
                      ["l40","L40", S.myTeamTitleL40],["aa40","AA40", S.myTeamTitleAA40],
                      ["ga", S.myTeamColGA, S.myTeamTitleGA],
                    ];
                    const thS = (col) => ({ fontSize: 8, fontWeight: 800, color: sortCol===col?"#C084FC":"rgba(255,255,255,0.3)", cursor:"pointer", userSelect:"none", whiteSpace:"nowrap", textAlign:"center", padding:"0 4px" });
                    // Grid: +btn | pos+logo | nom | D-Score | L2 AA2 L5 AA5 | L10 DOM EXT AA10 Titu10 Reg10 L40 AA40 G+A
                    const GRID = "28px 70px 80px 52px 80px 36px 36px 90px 30px 28px 30px 28px 46px 32px 32px 28px 30px 28px 30px 30px 44px";

                    // ── Badges rareté pour cartes possédées ────────────────
                    const RARITY_COLORS = { unique: "#FFD700", super_rare: "#E040FB", rare: "#42A5F5", limited: "#FF9800", common: "rgba(255,255,255,0.3)" };
                    const RARITY_LABELS = { unique: "U", super_rare: "SR", rare: "R", limited: "L" };

                    return (
                      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflowX: "auto" }}>
                        {/* Header */}
                        <div style={{ display: "grid", gridTemplateColumns: GRID, alignItems: "center", gap: 2, padding: "3px 8px 3px", borderBottom: "1px solid rgba(255,255,255,0.07)", background: "rgba(0,0,0,0.4)", position: "sticky", top: 0, zIndex: 2, minWidth: "max-content" }}>
                          <span />
                          <span style={{ fontSize: 7, color: "rgba(255,255,255,0.3)", fontWeight: 700 }}>Pos</span>
                          <span style={{ fontSize: 7, color: "rgba(255,255,255,0.3)", fontWeight: 700 }}>Joueur</span>
                          {COLS.map(([col, label, title]) => {
                            const grp = ["l10","dom","ext","aa10","titu","reg"].includes(col);
                            return (
                              <span key={col} title={title} onClick={() => setSortCol(col)} style={{
                                ...thS(col),
                                background: grp ? "rgba(196,181,253,0.07)" : undefined,
                                borderRadius: col==="l10" ? "4px 0 0 4px" : col==="reg" ? "0 4px 4px 0" : undefined,
                                boxShadow: col==="l10" ? "-1px 0 0 0 rgba(196,181,253,0.2)" : undefined,
                              }}>
                                {label}{sortCol===col?" ↓":""}
                              </span>
                            );
                          })}
                        </div>
                        {/* Rows — 15 lignes, flex: 1 chacune = hauteur exacte = panel gauche */}
                        <div style={{ overflowY: "auto", flex: 1, minHeight: 0 }}>
                          <div style={{ minWidth: "max-content" }}>
                          {sortedPool.map(p => {
                            const slug = p.slug || p.name;
                            const rowKey = p._cardSlug || slug;
                            const ed = getEdition(cardEditions[slug] || "base");
                            const adjDs = getAdjDs(p);
                            const inTeam = isInTeam(p);
                            // Badge rareté : priorité à la carte spécifique (_cardRarity), sinon meilleure carte possédée
                            const ownedCard = sorareCardMap[slug];
                            const ownedRarity = p._cardRarity || ownedCard?.rarity || null;
                            const rarityColor = ownedRarity ? (RARITY_COLORS[ownedRarity] || null) : null;
                            const rarityLabel = ownedRarity ? (RARITY_LABELS[ownedRarity] || null) : null;
                            const pc = PC[p.position];
                            const opp = logos[p.oppName];
                            const parisTime = p.kickoff && p.matchDate ? utcToParisTime(p.kickoff, p.matchDate) : "";
                            const ga = (p.goals||0) + (p.assists||0);
                            return (
                              <div key={rowKey}
                                onClick={() => !inTeam && addToTeam(p)}
                                style={{ display: "grid", gridTemplateColumns: GRID, alignItems: "center", gap: 2, padding: "4px 8px", borderBottom: "1px solid rgba(255,255,255,0.03)", background: inTeam ? "rgba(196,181,253,0.07)" : rarityColor ? `rgba(${rarityColor === "#FFD700" ? "255,215,0" : rarityColor === "#E040FB" ? "224,64,251" : rarityColor === "#42A5F5" ? "66,165,245" : "255,152,0"},0.04)` : "transparent", transition: "background 0.12s", cursor: inTeam ? "default" : "pointer", minWidth: "max-content", borderLeft: rarityColor ? `2px solid ${rarityColor}` : "2px solid transparent" }}
                                onMouseEnter={e => { if (!inTeam) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                                onMouseLeave={e => { e.currentTarget.style.background = inTeam ? "rgba(196,181,253,0.07)" : rarityColor ? `rgba(${rarityColor === "#FFD700" ? "255,215,0" : rarityColor === "#E040FB" ? "224,64,251" : rarityColor === "#42A5F5" ? "66,165,245" : "255,152,0"},0.04)` : "transparent"; }}
                              >
                                {/* + / ✓ / E1 E2 */}
                                {(() => {
                                  const stLabel = !Object.values(myPicks).some(pp => pp && (pp.slug||pp.name)===(p.slug||p.name)) && savedTeamLabel(p);
                                  const shortLabel = stLabel ? stLabel.replace("Équipe ","E") : null;
                                  return (
                                    <div onClick={e => { e.stopPropagation(); if (!inTeam) addToTeam(p); }} style={{ width: 20, height: 20, borderRadius: 5, border: `1px solid ${inTeam?(shortLabel?"rgba(251,191,36,0.4)":"#C4B5FD40"):"rgba(255,255,255,0.15)"}`, display:"flex", alignItems:"center", justifyContent:"center", cursor: inTeam?"default":"pointer", color: inTeam?(shortLabel?"#FBBF24":"#C4B5FD"):"rgba(255,255,255,0.5)", fontSize: shortLabel?7:13, fontWeight:700, flexShrink:0 }}>
                                      {shortLabel || (inTeam ? "✓" : "+")}
                                    </div>
                                  );
                                })()}
                                {/* [POS][+X%] + logo — badge colles */}
                                <div style={{ display:"flex", alignItems:"center", gap:3 }}>
                                  <div style={{ display:"flex", alignItems:"center", gap:0, flexShrink:0 }}>
                                    <span style={{ fontSize:7, fontWeight:900, background:pc, color:"#fff", borderRadius: ownedCard?.totalBonus > 0 ? "3px 0 0 3px" : 3, padding:"2px 4px", lineHeight:1 }}>{p.position}</span>
                                    {ownedCard && ownedCard.totalBonus > 0 && (
                                      <span style={{ fontSize:7, fontWeight:900, background:"linear-gradient(135deg,#166534,#15803d)", color:"#fff", borderRadius:"0 3px 3px 0", padding:"2px 4px", lineHeight:1, whiteSpace:"nowrap" }}>+{ownedCard.totalBonus}%</span>
                                    )}
                                  </div>
                                  {logos[p.club] && <img src={`/data/logos/${logos[p.club]}`} alt="" style={{ width:14, height:14, objectFit:"contain", flexShrink:0 }} />}
                                </div>
                                {/* Nom + club + badge rareté */}
                                <div style={{ minWidth:0 }}>
                                  <div style={{ display:"flex", alignItems:"center", gap:3 }}>
                                    <div style={{ fontSize:10, fontWeight: inTeam?700:500, color: inTeam?"#C4B5FD":"#fff", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", lineHeight:1.2, minWidth:0 }}>{p.name.split(" ").pop()}</div>
                                    {rarityLabel && <span style={{ fontSize:6, fontWeight:900, color:"#000", background:rarityColor, borderRadius:2, padding:"0 3px", lineHeight:"11px", flexShrink:0 }}>{rarityLabel}</span>}
                                  </div>
{/* Nom club retiré — logo seul dans la colonne Pos */}
                                </div>
                                {/* D-Score — en tête de gondole */}
                                <div style={{ textAlign:"center" }}>
                                  <span style={{ display:"inline-block", padding:"3px 7px", borderRadius:8, fontFamily:"'DM Mono',monospace", fontSize:14, fontWeight:700, color: isSilver(adjDs)?"#1a1a2e":"#fff", background: isSilver(adjDs)?"linear-gradient(90deg,#C0C0C0,#A8E8D0,#B0C4E8,#D4B0E8,#E0D0E8,#fff,#D4B0E8,#B0C4E8,#A8E8D0,#C0C0C0)":dsBg(adjDs), backgroundSize: isSilver(adjDs)?"200% 100%":"auto", animation: isSilver(adjDs)?"silverShine 3s linear infinite":"none", boxShadow: isSilver(adjDs)?"0 0 10px rgba(255,255,255,0.4)": `0 0 8px ${dsColor(adjDs)}30` }}>
                                    {adjDs}
                                  </span>
                                </div>
                                {/* Adv. — même format Database */}
                                <div style={{ overflow:"hidden" }}>
                                  {p.oppName ? (
                                    <div style={{ display:"flex", alignItems:"center", gap:3 }}>
                                      <span style={{ fontSize:11, flexShrink:0, lineHeight:1 }}>{p.isHome ? "🏠" : "✈️"}</span>
                                      {opp && <img src={`/data/logos/${opp}`} alt="" style={{ width:14, height:14, objectFit:"contain", flexShrink:0 }} />}
                                      <span style={{ fontSize:10, color:"rgba(255,255,255,0.55)", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{sn(p.oppName)}</span>
                                    </div>
                                  ) : (
                                    <span style={{ color:"rgba(255,255,255,0.15)" }}>—</span>
                                  )}
                                </div>
                                {/* Titu% Sorare — pancarte gradient comme sur les cartes */}
                                <div style={{ textAlign:"center" }}>
                                  <span style={{
                                    fontSize: 10, fontWeight: 600, fontFamily: "Outfit", padding: "2px 6px", borderRadius: 4, letterSpacing: "0.02em", color: "#fff",
                                    background: (p.sorare_starter_pct || 0) >= 70 ? "linear-gradient(135deg,#166534,#15803d)" : (p.sorare_starter_pct || 0) >= 50 ? "linear-gradient(135deg,#854d0e,#a16207)" : p.sorare_starter_pct == null ? "rgba(255,255,255,0.06)" : "linear-gradient(135deg,#991b1b,#b91c1c)",
                                    boxShadow: "0 1px 4px rgba(0,0,0,0.5)",
                                  }}>
                                    {p.sorare_starter_pct == null ? "—" : `${p.sorare_starter_pct}%`}
                                  </span>
                                </div>
                                {/* CS% */}
                                <span style={{ fontFamily:"'DM Mono',monospace", fontSize:11, fontWeight:600, textAlign:"center", color:pctC(p.csPercent) }}>{p.csPercent!=null?`${p.csPercent}%`:"—"}</span>
                                {/* Match box Win% : Dom vs Ext */}
                                {(() => {
                                  const probs = getMatchProbs(p);
                                  const homeLogo = p.isHome ? logos[p.club] : opp;
                                  const awayLogo = p.isHome ? opp : logos[p.club];
                                  const homeWin = p.isHome ? probs?.win : probs?.loss;
                                  const awayWin = p.isHome ? probs?.loss : probs?.win;
                                  const pctC2 = v => v >= 50 ? "#4ADE80" : v >= 35 ? "#FBBF24" : "#F87171";
                                  return (
                                    <div style={{ borderRadius:5, border:"1px solid rgba(255,255,255,0.07)", background:"rgba(0,0,0,0.25)", padding:"2px 4px", display:"flex", flexDirection:"column", gap:2 }}>
                                      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:2 }}>
                                        {homeLogo ? <img src={`/data/logos/${homeLogo}`} alt="" style={{ width:13, height:13, objectFit:"contain" }} /> : <span style={{width:13}}/>}
                                        {parisTime && <span style={{ fontSize:9, color:"#A78BFA", fontFamily:"'DM Mono',monospace", fontWeight:800 }}>{parisTime}</span>}
                                        {awayLogo ? <img src={`/data/logos/${awayLogo}`} alt="" style={{ width:13, height:13, objectFit:"contain" }} /> : <span style={{width:13}}/>}
                                      </div>
                                      {probs && (
                                        <div style={{ display:"flex", justifyContent:"space-between" }}>
                                          <span style={{ fontSize:8, fontWeight:700, color: p.isHome ? pctC2(homeWin) : "rgba(255,255,255,0.55)", fontFamily:"'DM Mono',monospace" }}>{homeWin}%</span>
                                          <span style={{ fontSize:8, fontWeight:700, color:"rgba(255,255,255,0.55)", fontFamily:"'DM Mono',monospace" }}>{probs.draw}%</span>
                                          <span style={{ fontSize:8, fontWeight:700, color: p.isHome ? "rgba(255,255,255,0.55)" : pctC2(awayWin), fontFamily:"'DM Mono',monospace" }}>{awayWin}%</span>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })()}
                                <span style={{ fontFamily:"'DM Mono',monospace", fontSize:11, color:dc(p.l2), textAlign:"center" }}>{R(p.l2)}</span>
                                <span style={{ fontFamily:"'DM Mono',monospace", fontSize:10, color:aac(p.aa2), textAlign:"center" }}>{R(p.aa2)}</span>
                                <span style={{ fontFamily:"'DM Mono',monospace", fontSize:11, color:dc(p.l5), textAlign:"center" }}>{R(p.l5)}</span>
                                <span style={{ fontFamily:"'DM Mono',monospace", fontSize:10, color:aac(p.aa5), textAlign:"center" }}>{R(p.aa5)}</span>
                                {/* L10 — badge */}
                                <div style={{ textAlign:"center", boxShadow:"-1px 0 0 0 rgba(196,181,253,0.12)" }}>
                                  {p.l10 != null
                                    ? <span style={{ display:"inline-block", padding:"2px 6px", borderRadius:6, fontFamily:"'DM Mono',monospace", fontSize:12, fontWeight:700, color: dc(p.l10), background:`${dc(p.l10)}22`, border:`1px solid ${dc(p.l10)}55` }}>{R(p.l10)}</span>
                                    : <span style={{ color:"rgba(255,255,255,0.2)" }}>—</span>}
                                </div>
                                {/* DOM */}<span style={{ fontFamily:"'DM Mono',monospace", fontSize:11, fontWeight:700, textAlign:"center", color: p.avg_dom != null ? dsColor(p.avg_dom) : "rgba(255,255,255,0.2)" }}>{p.avg_dom != null ? R(p.avg_dom) : "—"}</span>
                                {/* EXT */}<span style={{ fontFamily:"'DM Mono',monospace", fontSize:11, fontWeight:700, textAlign:"center", color: p.avg_ext != null ? dsColor(p.avg_ext) : "rgba(255,255,255,0.2)" }}>{p.avg_ext != null ? R(p.avg_ext) : "—"}</span>
                                {/* AA10 */}<span style={{ fontFamily:"'DM Mono',monospace", fontSize:10, color:aac(p.aa10), textAlign:"center" }}>{R(p.aa10)}</span>
                                {/* Titu10 */}
                                <span style={{ fontFamily:"'DM Mono',monospace", fontSize:9, textAlign:"center", color:tituC(p.titu_pct) }}>
                                  {p.titu_pct > 0 ? `${R(p.titu_pct)}%` : "—"}
                                </span>
                                {/* Regu10 */}
                                <span style={{ fontFamily:"'DM Mono',monospace", fontSize:9, textAlign:"center", color:tituC(p.reg10), borderRight:"1px solid rgba(196,181,253,0.18)", paddingRight:3 }}>
                                  {p.reg10 != null ? `${R(p.reg10)}%` : "—"}
                                </span>
                                {/* L40 */}<span style={{ fontFamily:"'DM Mono',monospace", fontSize:11, color:dc(p.l40), textAlign:"center" }}>{R(p.l40)}</span>
                                {/* AA40 */}<span style={{ fontFamily:"'DM Mono',monospace", fontSize:10, color:aac(p.aa40), textAlign:"center" }}>{R(p.aa40)}</span>
                                {/* G+A */}
                                <span style={{ fontFamily:"'DM Mono',monospace", fontSize:8, textAlign:"center" }}>
                                  {ga > 0 ? <>{p.goals>0&&<span style={{color:"#4ADE80",fontWeight:700}}>{p.goals}G</span>}{p.goals>0&&p.assists>0&&" "}{p.assists>0&&<span style={{color:"#FBBF24",fontWeight:600}}>{p.assists}A</span>}</> : <span style={{color:"rgba(255,255,255,0.12)"}}>—</span>}
                                </span>
                              </div>
                            );
                          })}
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  </div>
                </div>
              </div>
            );
          })()}

          {/* Decisive Pick déplacé dans la colonne gauche */}
          </div>{/* fin colonne droite */}
          </div>{/* fin layout flex */}

          {/* ── RECAP EQUIPES SAUVEGARDEES — calé à droite (pas dans la colonne calendrier) ── */}
          {savedTeams.length > 0 && (
            <div style={{ marginTop: 16, marginLeft: "auto", width: "calc(100% - 300px)" }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: "rgba(196,181,253,0.5)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>
                {lang === "fr" ? "MES EQUIPES SAUVEGARDEES" : "MY SAVED TEAMS"}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
                {savedTeams.map((st, si) => {
                  const POS_ORDER = ["GK","DEF","MIL","ATT","FLEX"];
                  // Score dynamique selon Bonus ON/OFF
                  const stPlayers = POS_ORDER.map(s => st.picks[s]).filter(Boolean);
                  const stScores = stPlayers.map(p => getAdjDs(p));
                  const stCapDs = stScores.length === 5 ? Math.max(...stScores) : 0;
                  const stTotalAdj = Math.round(stScores.reduce((s, v) => s + v, 0) + stCapDs * 0.5);
                  const palSt = PALIERS.filter(p => stTotalAdj >= p.pts).pop();
                  return (
                    <div key={st.id} style={{ borderRadius: 12, background: "rgba(15,8,40,0.7)", border: "1px solid rgba(74,222,128,0.15)", padding: "10px 12px", backdropFilter: "blur(6px)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <span style={{ fontSize: 11, fontWeight: 900, color: "#4ADE80" }}>{st.label}</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          {palSt && <span style={{ fontSize: 8, color: palSt.silver ? "#C0C0C0" : palSt.color, fontWeight: 700 }}>{palSt.reward}</span>}
                          <span style={{
                            fontSize: 18, fontWeight: 900, fontFamily: "'DM Mono',monospace",
                            color: palSt?.silver ? "#1a1a2e" : (palSt ? palSt.color : "#C4B5FD"),
                            background: palSt?.silver ? "linear-gradient(90deg,#C0C0C0,#A8E8D0,#B0C4E8,#D4B0E8,#fff,#D4B0E8,#B0C4E8,#A8E8D0,#C0C0C0)" : "none",
                            backgroundSize: "200% 100%", WebkitBackgroundClip: palSt?.silver ? "text" : "unset", WebkitTextFillColor: palSt?.silver ? "transparent" : "unset",
                            animation: palSt?.silver ? "silverShine 3s linear infinite" : "none",
                          }}>{stTotalAdj}</span>
                        </div>
                      </div>
                      <div style={{ display: "flex", justifyContent: "center", gap: 8 }}>
                        {POS_ORDER.map(slot => {
                          const p = st.picks[slot];
                          if (!p) return null;
                          const pc = PC[p.position];
                          const clubLogo = logos[p.club];
                          const oppLogo = logos[p.oppName];
                          const ownedCard = sorareCardMap[p.slug || p.name];
                          const adjDs = getAdjDs(p);
                          const parisTime = p.kickoff && p.matchDate ? utcToParisTime(p.kickoff, p.matchDate) : "";
                          return (
                            <div key={slot} style={{ textAlign: "center", flex: 1, minWidth: 0 }}>
                              <div style={{ width: "100%", maxWidth: 80, aspectRatio: "3/4", borderRadius: 8, overflow: "hidden", margin: "0 auto", position: "relative",
                                background: ownedCard ? "transparent" : `linear-gradient(155deg, rgba(8,4,28,0.9), ${pc}25)`,
                                border: ownedCard ? "none" : `1px solid ${pc}30`,
                              }}>
                                {ownedCard ? (
                                  <img src={ownedCard.pictureUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                                ) : (
                                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 3 }}>
                                    {clubLogo && <img src={`/data/logos/${clubLogo}`} alt="" style={{ width: 22, height: 22, objectFit: "contain" }} />}
                                    <span style={{ fontSize: 8, fontWeight: 800, color: pc }}>{slot}</span>
                                  </div>
                                )}
                                {p.sorare_starter_pct != null && (
                                  <span style={{ position: "absolute", top: 2, right: 2, fontSize: 7, fontWeight: 700, padding: "1px 4px", borderRadius: 3, color: "#fff",
                                    background: p.sorare_starter_pct >= 70 ? "rgba(22,101,52,0.9)" : p.sorare_starter_pct >= 50 ? "rgba(133,77,14,0.9)" : "rgba(153,27,27,0.9)",
                                  }}>{p.sorare_starter_pct}%</span>
                                )}
                                {ownedCard && ownedCard.totalBonus > 0 && (
                                  <span style={{ position: "absolute", bottom: 2, left: 2, fontSize: 7, fontWeight: 900, padding: "1px 4px", borderRadius: 3, color: "#fff", background: "rgba(22,101,52,0.9)" }}>+{ownedCard.totalBonus}%</span>
                                )}
                              </div>
                              <div style={{ fontSize: 9, fontWeight: 700, color: "#fff", marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name.split(" ").pop()}</div>
                              <div style={{ fontSize: 12, fontWeight: 800, color: dsColor(adjDs), fontFamily: "'DM Mono',monospace" }}>{adjDs}</div>
                              {p.oppName && (
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 2, marginTop: 2 }}>
                                  <span style={{ fontSize: 8 }}>{p.isHome ? "🏠" : "✈️"}</span>
                                  {oppLogo && <img src={`/data/logos/${oppLogo}`} alt="" style={{ width: 10, height: 10, objectFit: "contain" }} />}
                                  <span style={{ fontSize: 7, color: "rgba(255,255,255,0.45)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sn(p.oppName)}</span>
                                </div>
                              )}
                              {parisTime && <div style={{ fontSize: 8, fontWeight: 800, color: "#A78BFA", fontFamily: "'DM Mono',monospace", marginTop: 1 }}>{parisTime}</div>}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── BOUTON FIGHT ── */}
          <div style={{ marginTop: 24, textAlign: "center" }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginBottom: 10 }}>
              {S.stellarFightHint}
            </div>
            <button onClick={onFight} style={{
              background: "linear-gradient(135deg, #EF4444, #DC2626)",
              border: "none", borderRadius: 14, padding: "14px 40px",
              fontSize: 16, fontWeight: 900, color: "#fff", cursor: "pointer",
              fontFamily: "Outfit", letterSpacing: "0.05em",
              boxShadow: "0 0 30px rgba(239,68,68,0.4), 0 4px 20px rgba(0,0,0,0.4)",
              display: "inline-flex", alignItems: "center", gap: 10,
              transition: "transform 0.15s, box-shadow 0.15s",
            }}
              onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.05)"; e.currentTarget.style.boxShadow = "0 0 40px rgba(239,68,68,0.6), 0 4px 20px rgba(0,0,0,0.5)"; }}
              onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.boxShadow = "0 0 30px rgba(239,68,68,0.4), 0 4px 20px rgba(0,0,0,0.4)"; }}
            >
              {S.stellarFightBtn}
            </button>
          </div>
        </div>
      )}

      {/* No day selected */}
      {selectedDays.length === 0 && (
        <div style={{ textAlign: "center", padding: "50px 0", color: "rgba(255,255,255,0.2)" }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>✨</div>
          <div style={{ fontSize: 14 }}>{S.stellarSelectDay}</div>
        </div>
      )}
    </div>
  );
}
