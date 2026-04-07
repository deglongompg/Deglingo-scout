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

const DAYS_FR = ["LUN", "MAR", "MER", "JEU", "VEN", "SAM", "DIM"];
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
  { pts: 480, reward: "1 000 $", color: "#EF4444" },
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

// Lundi de la semaine contenant d (en heure de Paris)
function getMonday(d) {
  const parisDateStr = toParisDateStr(d);
  const dt = new Date(parisDateStr + "T12:00:00"); // midi UTC = safe, pas de décalage de date
  const day = dt.getDay(); // 0=dim
  const diff = day === 0 ? -6 : 1 - day;
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

      </div>

      {/* Opponent + heure */}
      {(() => {
        const hg = player.last_match_home_goals;
        const ag = player.last_match_away_goals;
        const matchResult = hasPlayed && hg != null && ag != null
          ? (player.isHome ? `${hg}-${ag}` : `${ag}-${hg}`)
          : null;
        const matchResultColor = matchResult
          ? (player.isHome ? (hg > ag ? "#4ADE80" : hg === ag ? "#FBBF24" : "#EF4444")
                           : (ag > hg ? "#4ADE80" : ag === hg ? "#FBBF24" : "#EF4444"))
          : null;
        return (
      <div style={{ marginTop: 4, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 2, fontSize: 7, color: "rgba(255,255,255,0.45)", background: "rgba(0,0,0,0.4)", padding: "2px 5px", borderRadius: 3, maxWidth: "100%", overflow: "hidden" }}>
          <span style={{ fontSize: 9, flexShrink: 0 }}>{player.isHome ? "🏠" : "✈️"}</span>
          {logos[player.oppName] && <img src={`/data/logos/${logos[player.oppName]}`} alt="" style={{ width: 10, height: 10, objectFit: "contain", flexShrink: 0 }} />}
          <span className="bp-opp-name" style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{sn(player.oppName)}</span>
          {matchResult ? (
            <span style={{ fontSize: 7, fontWeight: 800, fontFamily: "'DM Mono',monospace", color: matchResultColor, marginLeft: 2, flexShrink: 0, whiteSpace: "nowrap" }}>{matchResult}</span>
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
        );
      })()}

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
  const today = new Date(todayStr + "T12:00:00"); // objet Date safe pour getMonday
  const [weekOffset, setWeekOffset] = useState(0);
  // Défaut = jour courant (0=Lun … 6=Dim)
  const [selectedDay, setSelectedDay] = useState(() => {
    const d = new Date(getParisTodayStr() + "T12:00:00");
    return (d.getDay() + 6) % 7; // JS: 0=Dim → on convertit en Lun=0
  });
  const [expandedFixture, setExpandedFixture] = useState(null); // { key, side: "home"|"away" }
  const [leftCollapsed, setLeftCollapsed] = useState(false);

  // ── OAuth Sorare — cartes réelles de l'utilisateur ───────────────────────
  const [sorareConnected, setSorareConnected] = useState(false);
  const [sorareCards, setSorareCards] = useState([]); // { playerSlug, rarity, pictureUrl, cardSlug }
  const [sorareUser, setSorareUser] = useState(null);
  const [sorareLoading, setSorareLoading] = useState(false);

  // Map playerSlug → meilleure carte (rarity order: limited > rare > super_rare > unique)
  const RARITY_ORDER = { unique: 4, super_rare: 3, rare: 2, limited: 1, common: 0 };
  const sorareCardMap = useMemo(() => {
    const map = {};
    for (const c of sorareCards) {
      const slug = c.playerSlug;
      if (!map[slug] || (RARITY_ORDER[c.rarity] || 0) > (RARITY_ORDER[map[slug].rarity] || 0)) {
        map[slug] = c;
      }
    }
    return map;
  }, [sorareCards]);

  // Vérifie l'auth au montage + gère le retour OAuth (hash fragment)
  useEffect(() => {
    const hash = window.location.hash;

    // Retour depuis OAuth Sorare
    if (hash.includes("sorare_authed=1")) {
      // Vérification anti-CSRF : le state doit correspondre
      const hashParams = new URLSearchParams(hash.replace(/^#/, ""));
      const returnedState = hashParams.get("state") || "";
      const savedState = sessionStorage.getItem("sorare_oauth_state") || "";
      sessionStorage.removeItem("sorare_oauth_state");
      // Nettoyer l'URL immédiatement (sécurité)
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      if (returnedState && returnedState !== savedState) {
        console.warn("Sorare OAuth: state mismatch — possible CSRF, ignoring");
        return;
      }
      // Charger les cartes
      fetchSorareCards();
      return;
    }

    if (hash.includes("sorare_error=")) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      return;
    }

    // Vérifier silencieusement si déjà connecté (cookie valide)
    fetchSorareCards(true);
  }, []);

  const fetchSorareCards = async (silent = false) => {
    if (!silent) setSorareLoading(true);
    try {
      const res = await fetch("/api/sorare/cards", { credentials: "same-origin" });
      if (res.status === 401) { setSorareConnected(false); setSorareCards([]); return; }
      if (!res.ok) { setSorareConnected(false); return; }
      const data = await res.json();
      const user = data?.data?.currentUser;
      if (!user) { setSorareConnected(false); return; }
      setSorareUser({ slug: user.slug, nickname: user.nickname });
      const cards = (user.footballCards?.nodes || []).map(c => ({
        cardSlug:   c.slug,
        playerSlug: c.player?.slug,
        playerName: c.player?.displayName,
        position:   c.player?.position,
        rarity:     c.rarity,
        pictureUrl: c.pictureUrl,
        season:     c.season?.startYear,
      })).filter(c => c.playerSlug);
      setSorareCards(cards);
      setSorareConnected(true);
    } catch { setSorareConnected(false); }
    finally { if (!silent) setSorareLoading(false); }
  };

  const connectSorare = () => {
    // Générer un state aléatoire anti-CSRF
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
    window.location.href = "/auth/sorare/logout";
  };

  // ── Mon Équipe Stellaire — 5 slots positionnels ───────────────────────────
  const TEAM_SLOTS = ["GK", "DEF", "MIL", "ATT", "FLEX"];
  const [myPicks, setMyPicks] = useState({ GK: null, DEF: null, MIL: null, FLEX: null, ATT: null });
  const resetTeam = () => setMyPicks({ GK: null, DEF: null, MIL: null, FLEX: null, ATT: null });
  const removeFromTeam = (slot) => setMyPicks(prev => ({ ...prev, [slot]: null }));
  const addToTeam = (player) => {
    setMyPicks(prev => {
      const pos = player.position;
      // Si un slot est sélectionné et compatible → on y met le joueur
      if (selectedSlot) {
        if (selectedSlot === "FLEX" && pos !== "GK") return { ...prev, FLEX: player };
        if (selectedSlot === pos) return { ...prev, [pos]: player };
      }
      // 1. slot naturel libre ?
      if (prev[pos] === null) return { ...prev, [pos]: player };
      // 2. FLEX libre ?
      if (prev.FLEX === null && pos !== "GK") return { ...prev, FLEX: player };
      // 3. replace le slot naturel
      return { ...prev, [pos]: player };
    });
    setSelectedSlot(null); // reset filtre après sélection
  };
  const isInTeam = (p) => {
    const id = p.slug || p.name;
    if (Object.values(myPicks).some(pp => pp && (pp.slug || pp.name) === id)) return true;
    return savedTeams.some(t => Object.values(t.picks).some(pp => pp && (pp.slug || pp.name) === id));
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
    const pool = (dayData?.players || [])
      .filter(p => !usedIds.has(p.slug || p.name))
      .map(p => ({ ...p, ds: getAdjDs(p) }))
      .sort((a, b) => b.ds - a.ds);
    if (pool.length < 5) return;

    // Conflit : ATT/MIL dont le club = adversaire d'un GK ou DEF déjà choisi (et vice-versa)
    const hasConflict = (player, picks) => {
      const picked = Object.values(picks).filter(Boolean);
      if (["ATT","MIL"].includes(player.position))
        return picked.some(pp => ["GK","DEF"].includes(pp.position) && pp.oppName === player.club);
      if (["GK","DEF"].includes(player.position))
        return picked.some(pp => ["ATT","MIL"].includes(pp.position) && player.oppName === pp.club);
      return false;
    };

    // Greedy : meilleur D-Score sans conflit (fallback avec conflit si nécessaire)
    const newPicks = { GK: null, DEF: null, MIL: null, ATT: null, FLEX: null };
    const taken = new Set();
    for (const pos of ["GK","DEF","MIL","ATT"]) {
      const candidates = pool.filter(p => p.position === pos && !taken.has(p.slug || p.name));
      const best = candidates.find(p => !hasConflict(p, newPicks)) || candidates[0];
      if (best) { newPicks[pos] = best; taken.add(best.slug || best.name); }
    }
    // FLEX : meilleur outfield restant sans conflit
    const flexCandidates = pool.filter(p => p.position !== "GK" && !taken.has(p.slug || p.name));
    const flex = flexCandidates.find(p => !hasConflict(p, newPicks)) || flexCandidates[0];
    if (flex) newPicks.FLEX = flex;
    setMyPicks(newPicks);
  };

  // ── Mon Équipe — page cachée, accessible via bouton ──────────────────────────
  const [showMyTeam, setShowMyTeam] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null); // slot actif pour filtrer la liste

  // ── Sauvegarde équipes — jusqu'à 4 par jour ───────────────────────────────
  const savedTeamsKey = (dateStr) => `stellar_saved_teams_${dateStr}`;
  const [savedTeams, setSavedTeams] = useState([]);

  const saveCurrentTeam = (picks, editions, score) => {
    const dateStr = isoDate(weekDays[selectedDay]);
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
    const dateStr = isoDate(weekDays[selectedDay]);
    const key = savedTeamsKey(dateStr);
    const updated = savedTeams.filter(t => t.id !== id).map((t, i) => ({ ...t, label: `Équipe ${i + 1}` }));
    localStorage.setItem(key, JSON.stringify(updated));
    setSavedTeams(updated);
  };

  // ── Tri du tableau joueurs du jour ──────────────────────────────────────────
  const [teamSort, setTeamSort] = useState("ds");

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
  // Score ajusté par édition + capitaine ×1.5
  const getAdjDs = (p) => {
    const ed = getEdition(cardEditions[p.slug || p.name] || "base");
    return Math.round((p.ds || 0) * (1 + ed.bonus / 100));
  };
  const getAdjTotalDs = (teamPlayers) =>
    Math.round(teamPlayers.reduce((sum, p) => {
      const adj = getAdjDs(p);
      return sum + (p.isCaptain ? adj * 1.5 : adj);
    }, 0));
  const CURRENT_GW_START = "2026-04-03";

  // ── Freeze daily Stellar : figé à 12h00 Paris ──────────────────────────────
  // dailyLockKey = "YYYY-MM-DD" si Paris >= 12h00, sinon null
  const dailyLockKey = useMemo(() => getDailyLockKey(), []);
  const stellarFreezeKey = dailyLockKey ? `stellar_${dailyLockKey}` : null;
  const frozenDayData   = useMemo(() => (stellarFreezeKey ? loadFrozen(stellarFreezeKey) : null), [stellarFreezeKey]);

  const monday = useMemo(() => {
    const m = getMonday(today);
    m.setDate(m.getDate() + weekOffset * 7);
    return m;
  }, [weekOffset]);

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

  // Build 7 days of the week
  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [monday]);

  // Recharge les équipes sauvegardées quand le jour change + charge Équipe 1 par défaut
  useEffect(() => {
    if (selectedDay === null || !weekDays[selectedDay]) return;
    const dateStr = isoDate(weekDays[selectedDay]);
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
  }, [selectedDay, weekDays]);

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

  // Scored players for selected day
  const dayData = useMemo(() => {
    if (selectedDay === null) return null;
    const day = weekDays[selectedDay];
    const dateStr = isoDate(day);

    // ── Freeze : si aujourd'hui >= 12h00 Paris → utilise les données figées ──
    if (dailyLockKey && dateStr === dailyLockKey && frozenDayData) {
      return { ...frozenDayData, frozen: true };
    }

    const dayFixtures = fixturesByDate[dateStr] || [];
    if (!dayFixtures.length) return { fixtures: [], players: [], teams: [] };

    // Find all clubs playing this day
    const clubsPlaying = new Set();
    for (const f of dayFixtures) { clubsPlaying.add(f.home); clubsPlaying.add(f.away); }

    // Score players from those clubs (L1 + PL + Liga only)
    const pf = fixtures?.player_fixtures || {};
    const dayPlayers = [];

    // Clubs sans cartes Stellar (pas dans le jeu Sorare SO5/SO7)
    const NO_STELLAR_CLUBS = ["FC Metz"];

    for (const p of players) {
      if (!STELLAR_LEAGUES.includes(p.league)) continue;
      if (NO_STELLAR_CLUBS.some(c => clubMatchGlobal(p.club, c))) continue;
      const fx = pf[p.slug] || pf[p.name];
      if (!fx || fx.date !== dateStr) continue;

      const lgTeams = teams.filter(t => t.league === p.league);
      const oppStats = lgTeams.find(t => t.name === fx.opp);
      if (!oppStats) continue;
      const pTeam = findTeam(lgTeams, p.club);
      const ds = dScoreMatch(p, oppStats, fx.isHome, pTeam);
      if (ds < 20) continue; // Filter ghosts
      if (p.injured || p.suspended) continue; // Filter injured/suspended
      if (p.sorare_starter_pct != null && p.sorare_starter_pct < 70) continue; // Titu% Sorare < 70%

      let csPercent = null;
      if (["GK", "DEF"].includes(p.position)) {
        const oppXg = fx.isHome ? (oppStats.xg_ext || 1.3) : (oppStats.xg_dom || 1.3);
        const defXga = pTeam ? (fx.isHome ? (pTeam.xga_dom || 1.3) : (pTeam.xga_ext || 1.5)) : 1.3;
        csPercent = csProb(defXga, oppXg, p.league);
      }
      const matchId = pTeam ? [pTeam.name, oppStats.name].sort().join("|") : null;
      dayPlayers.push({
        ...p, ds, oppName: oppStats.name, oppTeam: oppStats, playerTeam: pTeam, isHome: fx.isHome,
        kickoff: fx.kickoff || fx.time || "",
        matchDate: dateStr,
        csPercent, matchId,
        proj: p.sorare_proj ?? null,
      });
    }

    const stellarTeams = buildStellarTeams(dayPlayers, dateStr);

    // ─── Decisive Pick ───
    const POS_MULT = { ATT: 1.4, MIL: 1.05, DEF: 0.5, GK: 0.1 };
    const decisivePick = dayPlayers
      .filter(p => p.appearances >= 3 && (p.position === "ATT" || p.position === "MIL" || p.position === "DEF"))
      .map(p => {
        const gaRate = p.ga_per_match || 0;
        const posMult = POS_MULT[p.position] || 1;
        const formFactor = Math.min(1.5, (p.l5 || 0) / 60 + 0.5);
        const oppXga = p.isHome ? (p.oppTeam?.xga_dom || 1.2) : (p.oppTeam?.xga_ext || 1.2);
        const oppFactor = Math.min(1.5, oppXga / 1.2);
        const decisive = gaRate * posMult * formFactor * oppFactor;
        // Poisson: P(≥1 action décisive) = 1 - e^(-λ), λ = gaRate * oppFactor * 0.5
        // formFactor intégré légèrement (racine carrée pour atténuer l'impact)
        const formImpact = Math.sqrt(formFactor);
        const pDecisive = Math.min(99, Math.round((1 - Math.exp(-gaRate * oppFactor * formImpact * 0.5)) * 100));
        return { ...p, decisive, pDecisive };
      })
      .sort((a, b) => b.decisive - a.decisive)[0] || null;

    return { fixtures: dayFixtures, players: dayPlayers, teams: stellarTeams, decisivePick, frozen: false };
  }, [selectedDay, weekDays, fixturesByDate, players, teams, fixtures, dailyLockKey, frozenDayData]);

  // ── Sauvegarder dans localStorage quand le freeze est actif et pas encore figé ──
  useEffect(() => {
    if (!stellarFreezeKey || frozenDayData) return; // déjà figé ou pas encore l'heure
    if (!dayData || dayData.frozen) return;
    if (selectedDay === null) return;
    const day = weekDays[selectedDay];
    const dateStr = isoDate(day);
    if (dateStr !== dailyLockKey) return; // seulement aujourd'hui
    if (!dayData.teams?.length && !dayData.players?.length) return; // rien à figer
    saveFrozen(stellarFreezeKey, {
      fixtures: dayData.fixtures,
      players: dayData.players,
      teams: dayData.teams,
      decisivePick: dayData.decisivePick,
    });
  }, [stellarFreezeKey, frozenDayData, dayData, selectedDay, weekDays, dailyLockKey]);

  // Auto-select first day with matches
  useMemo(() => {
    if (selectedDay !== null) return;
    for (let i = 0; i < 7; i++) {
      const dateStr = isoDate(weekDays[i]);
      if (fixturesByDate[dateStr]?.length) { setSelectedDay(i); return; }
    }
  }, [weekDays, fixturesByDate]);

  const weekLabel = `${fmtDate(weekDays[0])} — ${fmtDate(weekDays[6])}`;

  return (
    <div className="st-root" style={{ position: "relative", minHeight: "80vh", padding: "0 16px 40px", zIndex: 1 }}>
      <style>{starsKeyframes}</style>

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

        {/* Bouton CRÉER MON ÉQUIPE — masqué temporairement (WIP) */}
        {/* HIDDEN_MYTEAM_START */}
        <button onClick={() => setShowMyTeam(v => !v)}
          className="st-cta-banner"
          style={{
            flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
            background: showMyTeam ? "rgba(196,181,253,0.10)" : "rgba(10,6,30,0.75)",
            border: showMyTeam ? "1px solid rgba(196,181,253,0.45)" : "1px solid rgba(255,255,255,0.10)",
            borderRadius: 12, padding: "10px 14px", cursor: "pointer", fontFamily: "Outfit",
            backdropFilter: "blur(10px)", transition: "all 0.2s", minWidth: 0,
          }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: "rgba(196,181,253,0.12)", border: "1px solid rgba(196,181,253,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>🃏</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {showMyTeam ? t(lang,"myTeamBtnClose") : t(lang,"myTeamBtnOpen")}
              </div>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", marginTop: 1, whiteSpace: "nowrap" }}>
                {showMyTeam ? t(lang,"myTeamBtnCloseSub") : t(lang,"myTeamBtnSub")}
              </div>
            </div>
          </div>
          <div style={{
            fontSize: 10, fontWeight: 800, color: showMyTeam ? "#C4B5FD" : "#fff", whiteSpace: "nowrap", flexShrink: 0,
            background: showMyTeam ? "rgba(196,181,253,0.15)" : "linear-gradient(135deg, #7C3AED, #5B21B6)",
            borderRadius: 8, padding: "5px 12px", border: showMyTeam ? "1px solid rgba(196,181,253,0.3)" : "none",
          }}>
            {showMyTeam ? t(lang,"myTeamBtnBadgeClose") : t(lang,"myTeamBtnBadge")}
          </div>
        </button>

      </div>

      {/* ═══ CALENDRIER + bouton semaine suivante ═══ */}
      <div className="st-calendar-wrap" style={{ display: "grid", gridTemplateColumns: "auto repeat(7, 1fr) auto", gap: 6, marginBottom: 24, alignItems: "stretch" }}>
        {/* Bouton semaine précédente */}
        <button onClick={() => { setWeekOffset(w => w - 1); setSelectedDay(null); }}
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, color: "#C4B5FD", cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "Outfit", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 10px" }}>◀</button>
        {weekDays.map((day, i) => {
          const dateStr = isoDate(day);
          const dayFixtures = fixturesByDate[dateStr] || [];
          const hasMatches = dayFixtures.length > 0;
          const isSelected = selectedDay === i;
          const isToday = dateStr === isoDate(today);

          return (
            <div key={i} className="st-cal-day" onClick={() => hasMatches && setSelectedDay(i)}
              style={{
                background: isSelected ? "rgba(120,60,240,0.40)" : hasMatches ? "rgba(15,8,40,0.70)" : "rgba(8,4,25,0.55)",
                border: isSelected ? "1px solid rgba(196,181,253,0.7)" : isToday ? "1px solid rgba(180,140,255,0.4)" : "1px solid rgba(100,70,200,0.18)",
                backdropFilter: "blur(10px)",
                borderRadius: 10, padding: "8px 4px", textAlign: "center",
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
        <button onClick={() => { setWeekOffset(w => w + 1); setSelectedDay(null); }}
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, color: "#C4B5FD", cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "Outfit", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 10px" }}>▶</button>
      </div>

      {/* ═══ SELECTED DAY CONTENT ═══ */}
      {selectedDay !== null && dayData && (
        <div>
          {/* Layout principal : colonne gauche (date + matchs) | colonne droite (decisive + teams) */}
          <div className="st-main-layout" style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>

          {/* Colonne gauche — Date + Matchs */}
          <div style={{ flexShrink: 0, transition: "all 0.25s" }}>

            {/* Titre du jour */}
            <div style={{ marginBottom: 8 }}>
              <h2 style={{ fontSize: 16, fontWeight: 800, color: "#fff", margin: 0, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                {!leftCollapsed && <span style={{ color: "#C4B5FD" }}>{weekDays[selectedDay].toLocaleDateString(S.stellarDateLocale, { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).toUpperCase()}</span>}
                {!leftCollapsed && dayData.frozen && (
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 6, background: "rgba(196,181,253,0.08)", border: "1px solid rgba(196,181,253,0.18)" }}>
                    <span style={{ fontSize: 11 }}>🔒</span>
                    <span style={{ fontSize: 9, fontWeight: 700, color: "#A78BFA" }}>Picks figés à 12h00 Paris</span>
                  </div>
                )}
                {/* Bouton collapse colonne gauche */}
                <button onClick={() => setLeftCollapsed(v => !v)}
                  title={leftCollapsed ? "Afficher les matchs" : "Réduire"}
                  style={{ marginLeft: "auto", flexShrink: 0, width: 22, height: 22, borderRadius: 6, background: "rgba(196,181,253,0.08)", border: "1px solid rgba(196,181,253,0.18)", color: "#A78BFA", cursor: "pointer", fontSize: 11, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Outfit" }}>
                  {leftCollapsed ? "▶" : "◀"}
                </button>
              </h2>
              {!leftCollapsed && <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", fontWeight: 600, letterSpacing: "0.08em", marginTop: 2 }}>{lang === "fr" ? "HEURE PARIS" : "PARIS TIME"}</div>}
            </div>

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
                if (p.last_so5_date && p.last_so5_date >= CURRENT_GW_START && p.last_match_home_goals != null) {
                  const key = normClub(p.club);
                  if (!clubScores[key]) clubScores[key] = { home: p.last_match_home_goals, away: p.last_match_away_goals };
                }
              }

              const sorted = [...dayData.fixtures].sort((a, b) => (a.kickoff || "99:99").localeCompare(b.kickoff || "99:99"));
              // Grouper par créneau horaire
              const groups = [];
              for (const f of sorted) {
                const parisTime = utcToParisTime(f.kickoff, f.date) || "TBD";
                const last = groups[groups.length - 1];
                if (last && last.time === parisTime) last.fixtures.push(f);
                else groups.push({ time: parisTime, fixtures: [f] });
              }
              return (
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
                        const sc = findScore(f.home) ?? findScore(f.away) ?? null;
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
                          p.last_so5_date && p.last_so5_date >= CURRENT_GW_START &&
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
                            <div className="st-match-chip" style={{ display: "grid", gridTemplateColumns: "38px 28px 16px 1fr 34px 1fr 16px", alignItems: "center", columnGap: 6, padding: "4px 8px", background: isOpen ? "rgba(50,20,100,0.6)" : "rgba(30,10,70,0.45)", border: `1px solid ${isOpen ? "rgba(196,181,253,0.3)" : "rgba(140,100,255,0.12)"}`, borderRadius: isOpen ? "6px 6px 0 0" : 6, backdropFilter: "blur(6px)" }}>
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
              <div style={{ borderRadius: 14, background: "rgba(6,3,20,0.95)", border: "1px solid rgba(196,181,253,0.18)", overflow: "hidden", backdropFilter: "blur(16px)", display: "flex", flexDirection: "column", height: "calc(100vh - 280px)" }}>

                {/* ── Header ── */}
                <div style={{ padding: "9px 14px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <img src="/Stellar.png" alt="" style={{ width: 18, height: 18, objectFit: "contain" }} />
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 900, color: "#C4B5FD", letterSpacing: "0.05em" }}>{t(lang,"myTeamTitle")}</div>
                      <div style={{ fontSize: 8, color: "rgba(255,255,255,0.35)", marginTop: 1 }}>
                        {filledCount < 5 ? S.myTeamSelect(5 - filledCount) : `Score : ${totalAdj} pts${palier ? ` · ${palier.reward}` : ""}`}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    {/* Bouton Connect/Disconnect Sorare */}
                    {sorareConnected ? (
                      <button onClick={disconnectSorare} title={`Connecté : ${sorareUser?.nickname || sorareUser?.slug || "Sorare"}`} style={{
                        display: "flex", alignItems: "center", gap: 5,
                        padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(74,222,128,0.4)",
                        background: "rgba(74,222,128,0.08)", color: "#4ADE80",
                        fontSize: 9, fontWeight: 800, cursor: "pointer", fontFamily: "Outfit",
                      }}>
                        <span style={{ fontSize: 10 }}>✓</span> {sorareUser?.nickname || "Sorare"}
                      </button>
                    ) : (
                      <button onClick={connectSorare} disabled={sorareLoading} style={{
                        display: "flex", alignItems: "center", gap: 5,
                        padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(196,181,253,0.35)",
                        background: "rgba(196,181,253,0.08)", color: "#C4B5FD",
                        fontSize: 9, fontWeight: 800, cursor: sorareLoading ? "wait" : "pointer", fontFamily: "Outfit",
                        opacity: sorareLoading ? 0.6 : 1,
                      }}>
                        {sorareLoading ? "..." : "🔗 Mes cartes"}
                      </button>
                    )}
                    {/* Bouton magique */}
                    <button onClick={generateMagicTeam} style={{
                      display: "flex", alignItems: "center", gap: 5,
                      padding: "6px 12px", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: "Outfit",
                      background: "linear-gradient(135deg,#7C3AED,#8B5CF6,#A78BFA)",
                      color: "#fff", fontSize: 10, fontWeight: 800,
                      boxShadow: "0 0 14px rgba(139,92,246,0.5)",
                    }}>
                      <span style={{ fontSize: 12 }}>⚡</span> {t(lang,"myTeamAlgo")}
                    </button>
                    {filledCount > 0 && (<>
                      <button onClick={() => saveCurrentTeam(myPicks, cardEditions, totalAdj)}
                        disabled={savedTeams.length >= 4}
                        style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(74,222,128,0.3)", background: savedTeams.length >= 4 ? "rgba(255,255,255,0.03)" : "rgba(74,222,128,0.08)", color: savedTeams.length >= 4 ? "rgba(255,255,255,0.2)" : "#4ADE80", fontSize: 10, fontWeight: 800, cursor: savedTeams.length >= 4 ? "not-allowed" : "pointer", fontFamily: "Outfit" }}>
                        {savedTeams.length >= 4 ? "4/4 max" : t(lang,"myTeamSave")}
                      </button>
                      <button onClick={resetTeam} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.4)", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "Outfit" }}>Reset</button>
                    </>)}
                  </div>
                </div>

                {/* ── Corps : PITCH gauche + DATABASE droite ── */}
                <div style={{ display: "flex", flex: 1, minHeight: 0 }}>

                  {/* ══ COLONNE GAUCHE : Sélection équipe ══ */}
                  <div style={{ width: 427, flexShrink: 0, display: "flex", flexDirection: "column", borderRight: "1px solid rgba(255,255,255,0.06)", background: "rgba(0,0,0,0.15)" }}>

                    {/* Score total — visible uniquement quand équipe complète */}
                    {filledCount === 5 && (
                      <div style={{ padding: "6px 14px", borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div style={{ fontSize: 8, color: "rgba(255,255,255,0.35)", fontWeight: 600, letterSpacing: "0.08em" }}>SCORE PROJ.</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          {palier && <div style={{ fontSize: 8, fontWeight: 700, color: palier.color }}>→ {palier.reward}</div>}
                          <div style={{ fontSize: 22, fontWeight: 900, color: palier ? palier.color : "#C4B5FD", fontFamily: "'DM Mono',monospace", lineHeight: 1 }}>{totalAdj}</div>
                        </div>
                      </div>
                    )}

                    {/* ── 5 CARTES STELLAIRES — layout 2 + 3 (style Sorare) ── */}
                    <div style={{ padding: "6px 8px 6px", flex: "0 0 auto", display: "flex", flexDirection: "column", gap: 5 }}>
                      {/* ── Rendu d'un slot carte (mutualisé ATT/FLEX et DEF/GK/MIL) ── */}
                      {[["ATT","FLEX"], ["DEF","GK","MIL"]].map((row, rowIdx) => (
                        <div key={rowIdx} style={{ display: "flex", gap: 5, flex: "0 0 auto", justifyContent: rowIdx === 0 ? "center" : undefined, alignItems: "flex-start" }}>
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
                                  border: `1.5px solid ${isActive ? sc + "CC" : p ? sc + "55" : "rgba(255,255,255,0.08)"}`,
                                  boxShadow: isActive ? `0 0 16px ${sc}60` : p ? `0 0 10px ${sc}25` : "none",
                                  transition: "all 0.18s",
                                  display: "flex", flexDirection: "column", alignItems: "center",
                                  gap: sorareCard ? 0 : (rowIdx === 0 ? 5 : 4),
                                  padding: sorareCard ? 0 : (rowIdx === 0 ? "10px 8px" : "8px 6px"),
                                  position: "relative", width: 137, height: 190, flexShrink: 0,
                                }}>

                                {/* ── Vraie carte Sorare ── */}
                                {sorareCard ? (
                                  <>
                                    <img src={sorareCard.pictureUrl} alt={p.name}
                                      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", borderRadius: 9 }} />
                                    {/* Overlay gradient bas pour lisibilité */}
                                    <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 60, background: "linear-gradient(transparent, rgba(0,0,0,0.85))", borderRadius: "0 0 9px 9px" }} />
                                    {/* Badge slot */}
                                    <span style={{ position: "absolute", top: 6, left: 6, fontSize: 6, fontWeight: 900, color: "#fff", background: sc, borderRadius: 4, padding: "2px 5px", zIndex: 2 }}>{slot}</span>
                                    {/* Capitaine */}
                                    {isCap && <div style={{ position: "absolute", top: 5, right: 5, width: 16, height: 16, borderRadius: "50%", background: "#C4B5FD", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 900, color: "#0C0C2D", zIndex: 2 }}>C</div>}
                                    {/* D-Score + nom en bas */}
                                    <div style={{ position: "absolute", bottom: 6, left: 0, right: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 1, zIndex: 2 }}>
                                      <div style={{ fontSize: rowIdx === 0 ? 20 : 16, fontWeight: 900, color: dsColor2, fontFamily: "'DM Mono',monospace", lineHeight: 1 }}>{adjDs}</div>
                                      <div style={{ fontSize: 9, fontWeight: 700, color: "#fff", textAlign: "center", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", width: "90%" }}>{p.name.split(" ").pop()}</div>
                                    </div>
                                    {/* Rareté badge */}
                                    <div style={{ position: "absolute", bottom: 5, right: 5, fontSize: 6, fontWeight: 800, color: sorareCard.rarity === "unique" ? "#F59E0B" : sorareCard.rarity === "super_rare" ? "#C084FC" : sorareCard.rarity === "rare" ? "#60A5FA" : "#94A3B8", zIndex: 2 }}>
                                      {sorareCard.rarity === "unique" ? "U" : sorareCard.rarity === "super_rare" ? "SR" : sorareCard.rarity === "rare" ? "R" : "L"}
                                    </div>
                                    <button onClick={e => { e.stopPropagation(); removeFromTeam(slot); }}
                                      style={{ position: "absolute", top: 5, right: isCap ? 26 : 5, background: "rgba(0,0,0,0.5)", border: "none", color: "rgba(255,255,255,0.6)", cursor: "pointer", fontSize: 11, lineHeight: 1, padding: "2px 5px", borderRadius: 4, zIndex: 2 }}>×</button>
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

                  {/* ── TABLEAU JOUEURS — style Database enrichi ── */}
                  {(() => {
                    const R = v => v != null ? Math.round(v) : "—";
                    const dc = v => v == null ? "rgba(255,255,255,0.2)" : v >= 80 ? "#4ADE80" : v >= 65 ? "#A3E635" : v >= 50 ? "#FBBF24" : v >= 35 ? "#FB923C" : "#EF4444";
                    const aac = v => v == null ? "rgba(255,255,255,0.2)" : "rgba(196,181,253,0.8)";
                    const tituC = v => v >= 80 ? "#4ADE80" : v >= 50 ? "#FBBF24" : v > 0 ? "#EF4444" : "rgba(255,255,255,0.2)";
                    const pctC = v => v == null ? "rgba(255,255,255,0.2)" : v >= 40 ? "#4ADE80" : v >= 25 ? "#FCD34D" : v >= 15 ? "#FB923C" : "#EF4444";
                    // Win/Draw/Loss via Poisson (xG dom/ext des équipes)
                    const poisPMF = (λ, k) => { let f=1; for(let i=1;i<=k;i++) f*=i; return Math.exp(-λ)*Math.pow(λ,k)/f; };
                    const getMatchProbs = (p) => {
                      const pt = findTeam(teams, p.club);
                      const ot = findTeam(teams, p.oppName);
                      if (!pt || !ot) return null;
                      const λp = p.isHome ? (pt.xg_dom||1.3) : (pt.xg_ext||1.1);
                      const λo = p.isHome ? (ot.xg_ext||1.1) : (ot.xg_dom||1.3);
                      let w=0, d=0, l=0;
                      for (let i=0; i<=7; i++) for (let j=0; j<=7; j++) {
                        const pr = poisPMF(λp,i)*poisPMF(λo,j);
                        if (i>j) w+=pr; else if (i===j) d+=pr; else l+=pr;
                      }
                      return { win:Math.round(w*100), draw:Math.round(d*100), loss:Math.round(l*100) };
                    };
                    const getWinPct = (p) => getMatchProbs(p)?.win ?? null;
                    const [sortCol, setSortCol] = [teamSort, setTeamSort];
                    // Filtre par slot sélectionné
                    const slotFilter = selectedSlot
                      ? selectedSlot === "FLEX"
                        ? dayPool.filter(p => ["DEF","MIL","ATT"].includes(p.position))
                        : dayPool.filter(p => p.position === selectedSlot)
                      : dayPool;
                    const sortedPool = [...slotFilter].sort((a, b) => {
                      if (sortCol === "ds")   return getAdjDs(b) - getAdjDs(a);
                      if (sortCol === "win")  return (getWinPct(b)||0) - (getWinPct(a)||0);
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
                    const GRID = "28px 36px 80px 52px 80px 36px 36px 90px 30px 28px 30px 28px 46px 32px 32px 28px 30px 28px 30px 30px 44px";
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
                            const ed = getEdition(cardEditions[slug] || "base");
                            const adjDs = getAdjDs(p);
                            const inTeam = isInTeam(p);
                            const pc = PC[p.position];
                            const opp = logos[p.oppName];
                            const parisTime = p.kickoff && p.matchDate ? utcToParisTime(p.kickoff, p.matchDate) : "";
                            const ga = (p.goals||0) + (p.assists||0);
                            return (
                              <div key={slug}
                                onClick={() => !inTeam && addToTeam(p)}
                                style={{ display: "grid", gridTemplateColumns: GRID, alignItems: "center", gap: 2, padding: "4px 8px", borderBottom: "1px solid rgba(255,255,255,0.03)", background: inTeam ? "rgba(196,181,253,0.07)" : "transparent", transition: "background 0.12s", cursor: inTeam ? "default" : "pointer", minWidth: "max-content" }}
                                onMouseEnter={e => { if (!inTeam) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                                onMouseLeave={e => { e.currentTarget.style.background = inTeam ? "rgba(196,181,253,0.07)" : "transparent"; }}
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
                                {/* Pos + logo */}
                                <div style={{ display:"flex", alignItems:"center", gap:3 }}>
                                  <span style={{ fontSize:6, fontWeight:900, background:pc, color:"#fff", borderRadius:2, padding:"1px 4px", flexShrink:0 }}>{p.position}</span>
                                  {logos[p.club] && <img src={`/data/logos/${logos[p.club]}`} alt="" style={{ width:14, height:14, objectFit:"contain", flexShrink:0 }} />}
                                </div>
                                {/* Nom + club */}
                                <div style={{ minWidth:0 }}>
                                  <div style={{ fontSize:10, fontWeight: inTeam?700:500, color: inTeam?"#C4B5FD":"#fff", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", lineHeight:1.2 }}>{p.name.split(" ").pop()}</div>
                                  <div style={{ fontSize:6, color:"rgba(255,255,255,0.3)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", lineHeight:1.2 }}>{sn(p.club)}</div>
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
                                {/* Titu% Sorare */}
                                <span style={{ fontFamily:"'DM Mono',monospace", fontSize:11, textAlign:"center", fontWeight:700, color: p.sorare_starter_pct >= 80 ? "#4ADE80" : p.sorare_starter_pct >= 60 ? "#FBBF24" : p.sorare_starter_pct != null ? "#F87171" : "rgba(255,255,255,0.2)" }}>
                                  {p.sorare_starter_pct != null ? `${p.sorare_starter_pct}%` : "—"}
                                </span>
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

            {/* ─── DECISIVE PICK — pleine largeur colonne droite ─── */}
            {dayData.decisivePick && (() => {
              const dp = dayData.decisivePick;
              const parisTime = utcToParisTime(dp.kickoff, dp.matchDate);
              const gaR = dp.ga_per_match?.toFixed(2) || "0.00";
              const lgColor = LEAGUE_COLOR[dp.league] || "#FF8A80";
              const pc = PC[dp.position];
              const dpPlayed = dp.last_so5_date && dp.last_so5_date >= CURRENT_GW_START && dp.last_so5_score != null;
              const dpWon = dpPlayed && dp.last_so5_score >= 60;
              const dpRealScore = dpPlayed ? Math.round(dp.last_so5_score) : null;
              const dpRealColor = dpPlayed ? (dp.last_so5_score >= 75 ? "#4ADE80" : dp.last_so5_score >= 60 ? "#A3E635" : dp.last_so5_score >= 50 ? "#FBBF24" : dp.last_so5_score >= 40 ? "#FB923C" : "#EF4444") : null;
              const hg = dp.last_match_home_goals;
              const ag = dp.last_match_away_goals;
              const dpMatchResult = dpPlayed && hg != null ? (dp.isHome ? `${hg}-${ag}` : `${ag}-${hg}`) : null;
              return (
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10, background: dpPlayed ? `linear-gradient(135deg, rgba(6,2,20,0.9), ${dpRealColor}18)` : "linear-gradient(135deg, rgba(6,2,20,0.9), rgba(15,5,40,0.85))", border: dpPlayed ? `1px solid ${dpRealColor}50` : "1px solid rgba(196,181,253,0.2)", borderRadius: 10, padding: "8px 14px", backdropFilter: "blur(12px)", boxShadow: dpPlayed ? `0 0 16px ${dpRealColor}30` : "0 0 16px rgba(139,92,246,0.1)" }}>
                  <div style={{ flexShrink: 0, fontSize: 18 }}>{dpWon ? "✅" : dpPlayed ? "❌" : "⚡"}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 8, fontWeight: 800, color: dpPlayed ? dpRealColor : "#A78BFA", letterSpacing: "0.1em", marginBottom: 1 }}>
                      {dpWon
                        ? (lang === "fr" ? "DECISIVE PICKER — +2 000 ESSENCE !" : "DECISIVE PICKER — +2,000 ESSENCE!")
                        : dpPlayed
                        ? (lang === "fr" ? "DECISIVE PICKER — 0 ESSENCE" : "DECISIVE PICKER — 0 ESSENCE")
                        : (lang === "fr" ? "DECISIVE PICKER — 2 000 ESSENCE" : "DECISIVE PICKER — 2,000 ESSENCE")}
                    </div>
                    {!dpPlayed && <div style={{ fontSize: 7.5, color: "rgba(255,255,255,0.35)", lineHeight: 1.3, marginBottom: 3 }}>
                      {lang === "fr"
                        ? "Le plus susceptible de faire une action décisive — G+A/match × forme (L5) × faiblesse adverse (xGA)"
                        : "Most likely to make a decisive action — G+A/match × form (L5) × opponent weakness (xGA)"}
                    </div>}
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      {logos[dp.club] && <img src={`/data/logos/${logos[dp.club]}`} alt="" style={{ width: 16, height: 16, objectFit: "contain" }} />}
                      <span style={{ fontSize: 13, fontWeight: 900, color: "#fff" }}>{dp.name}</span>
                      <span style={{ fontSize: 8, fontWeight: 800, background: `linear-gradient(135deg,${pc},${pc}CC)`, borderRadius: 3, padding: "1px 5px", color: "#fff" }}>{dp.position}</span>
                      <span style={{ fontSize: 8, fontWeight: 700, color: lgColor }}>{dp.league}</span>
                      <span style={{ fontSize: 8, color: "rgba(255,255,255,0.45)" }}>vs <span style={{ color: "#fff", fontWeight: 600 }}>{sn(dp.oppName)}</span>{dpMatchResult && <span style={{ color: dpRealColor, fontWeight: 700 }}> {dpMatchResult}</span>}</span>
                      {!dpPlayed && parisTime && <span style={{ fontSize: 8, color: "#C4B5FD", fontWeight: 700 }}>⏰ {parisTime}</span>}
                      <span style={{ fontSize: 8, color: "rgba(255,255,255,0.45)" }}>G+A/match <span style={{ color: "#4ADE80", fontWeight: 700 }}>{gaR}</span></span>
                      <span style={{ fontSize: 8, color: "rgba(255,255,255,0.45)" }}>L5 <span style={{ color: dp.l5 >= 60 ? "#4ADE80" : dp.l5 >= 40 ? "#F59E0B" : "#EF4444", fontWeight: 700 }}>{dp.l5 ?? "—"}</span></span>
                      {!dpPlayed && <span style={{ fontSize: 8, color: "rgba(255,255,255,0.45)" }}>D-Score <span style={{ color: "#C4B5FD", fontWeight: 700 }}>{dp.ds}</span></span>}
                    </div>
                  </div>
                  <div style={{ flexShrink: 0, textAlign: "center", background: dpPlayed ? `${dpRealColor}22` : "rgba(139,92,246,0.15)", border: dpPlayed ? `1px solid ${dpRealColor}60` : "1px solid rgba(167,139,250,0.3)", borderRadius: 8, padding: "6px 12px" }}>
                    {dpWon ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <img src="/essence.png" alt="essence" style={{ width: 44, height: 44, objectFit: "contain", filter: `drop-shadow(0 0 8px #A855F7)` }} />
                        <div>
                          <div style={{ fontSize: 22, fontWeight: 900, color: "#E9D5FF", fontFamily: "'DM Mono',monospace", lineHeight: 1 }}>+2 000</div>
                          <div style={{ fontSize: 10, fontWeight: 800, color: "#A855F7", letterSpacing: "0.05em" }}>ESSENCE</div>
                        </div>
                      </div>
                    ) : dpPlayed ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <img src="/essence.png" alt="essence" style={{ width: 44, height: 44, objectFit: "contain", filter: "grayscale(1) opacity(0.4)" }} />
                        <div>
                          <div style={{ fontSize: 22, fontWeight: 900, color: "#6B7280", fontFamily: "'DM Mono',monospace", lineHeight: 1 }}>0</div>
                          <div style={{ fontSize: 10, fontWeight: 800, color: "#6B7280", letterSpacing: "0.05em" }}>ESSENCE</div>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div style={{ fontSize: 18, fontWeight: 900, color: dp.pDecisive >= 50 ? "#4ADE80" : dp.pDecisive >= 30 ? "#F59E0B" : "#C4B5FD", fontFamily: "'DM Mono',monospace", lineHeight: 1 }}>{dp.pDecisive}%</div>
                        <div style={{ fontSize: 7, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>CHANCE</div>
                      </>
                    )}
                  </div>
                </div>
              );
            })()}

          {dayData.teams.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: "rgba(255,255,255,0.2)" }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🔭</div>
              <div style={{ fontSize: 13 }}>{S.stellarNoTeams}</div>
            </div>
          ) : (
            <>
            <div className="st-teams-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
            {dayData.teams.map((team, ti) => {
              const isUltime = team.label === "ULTIME";
              const totalScore = getAdjTotalDs(team.players);
              const palier = PALIERS.filter(p => totalScore >= p.pts).pop();
              // Score réel : remplace ds par last_so5_score si le joueur a joué cette GW
              const hasRealData = team.players.some(p => p.last_so5_date && p.last_so5_date >= CURRENT_GW_START && p.last_so5_score != null);
              const isValidated = hasRealData; // automatique dès que des scores réels existent
              const realScore = Math.round(team.players.reduce((sum, p) => {
                const played = p.last_so5_date && p.last_so5_date >= CURRENT_GW_START;
                const sc = played && p.last_so5_score != null ? p.last_so5_score : p.ds;
                return sum + (p.isCaptain ? sc * 1.5 : sc);
              }, 0));
              const realPalier = PALIERS.filter(p => realScore >= p.pts).pop();
              const realPalierIdx = realPalier ? PALIERS.indexOf(realPalier) + 1 : null;

              return (
                <div key={ti} className="st-team-card" style={{
                  borderRadius: 14, padding: "12px",
                  background: isUltime
                    ? "linear-gradient(135deg, rgba(220,210,255,0.14) 0%, rgba(140,80,240,0.10) 25%, rgba(180,140,255,0.08) 50%, rgba(100,80,220,0.10) 75%, rgba(220,210,255,0.14) 100%)"
                    : "rgba(20,10,50,0.45)",
                  border: isUltime ? "1px solid rgba(196,181,253,0.5)" : "1px solid rgba(140,100,255,0.12)",
                  boxShadow: isUltime ? "0 0 50px rgba(160,80,255,0.18), 0 0 25px rgba(180,120,255,0.12), inset 0 1px 0 rgba(255,255,255,0.15), inset 0 -1px 0 rgba(196,181,253,0.08)" : "0 4px 20px rgba(0,0,0,0.4)",
                  backdropFilter: "blur(8px)",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 18 }}>{team.icon}</span>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 800, color: isUltime ? "#C4B5FD" : "#fff", letterSpacing: "0.05em" }}>
                          {isUltime ? S.stellarUltimeLabel : S.stellarTeamLabel(team.label)}
                        </div>
                        <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>{isUltime ? S.stellarTop5 : S.stellarTeamFrom(team.label)}
                        </div>
                        {team.totalDs > 0 && <div style={{ fontSize: 9, fontWeight: 800, color: "#A78BFA", fontFamily: "'DM Mono',monospace", marginTop: 1 }}>⚡ Score : {team.totalDs}</div>}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {/* Infos à gauche du score */}
                      <div className="st-card-bonus-info" style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 7, color: "rgba(255,255,255,0.25)", fontStyle: "italic" }}>{S.stellarBonusCard}</div>
                        <div style={{ fontSize: 7, color: "rgba(255,255,255,0.2)" }}>{S.stellarProjScore}</div>
                        {isValidated && hasRealData
                          ? realPalier && <div style={{ fontSize: 7, color: realPalier.color, fontWeight: 600 }}>→ {realPalier.reward}</div>
                          : palier && <div style={{ fontSize: 7, color: palier.color, fontWeight: 600 }}>→ {palier.reward}</div>
                        }
                      </div>
                      {/* Score + palier réel */}
                      <div style={{ textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
                        <div style={{ fontSize: 8, fontWeight: 700, color: "rgba(196,181,253,0.6)", letterSpacing: "0.12em", textTransform: "uppercase" }}>{S.stellarScore}</div>
                        {isValidated ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.25)", textDecoration: "line-through" }}>{totalScore}</span>
                            <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 22, fontWeight: 900, color: realPalier ? realPalier.color : "#4ADE80", textShadow: `0 0 12px ${realPalier ? realPalier.color : "#4ADE80"}66` }}>{realScore}</span>
                          </div>
                        ) : (
                          <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 20, fontWeight: 800, color: palier ? palier.color : "#fff" }}>{totalScore}</div>
                        )}
                        {/* Palier atteint */}
                        {isValidated && (
                          <div style={{
                            display: "flex", alignItems: "center", gap: 4, padding: "3px 8px",
                            borderRadius: 20, background: realPalier ? `${realPalier.color}22` : "rgba(255,255,255,0.06)",
                            border: `1px solid ${realPalier ? realPalier.color + "66" : "rgba(255,255,255,0.1)"}`,
                          }}>
                            <svg width="10" height="10" viewBox="0 0 14 14" fill="none">
                              <circle cx="7" cy="7" r="6.5" stroke={realPalier ? realPalier.color : "#4ADE80"} strokeWidth="1.5"/>
                              <path d="M4 7l2.2 2.2L10 4.5" stroke={realPalier ? realPalier.color : "#4ADE80"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                            <span style={{ fontSize: 9, fontWeight: 800, color: realPalier ? realPalier.color : "rgba(255,255,255,0.3)", whiteSpace: "nowrap" }}>
                              {realPalierIdx ? `Palier ${realPalierIdx}` : "Hors palier"}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="st-team-players" style={{ display: "flex", justifyContent: "center", gap: 4, flexWrap: "nowrap" }}>
                    {team.players.map((p, pi) => (
                      <StellarCard key={pi} player={p} logos={logos} size="sm" isValidated={isValidated} gwStart={CURRENT_GW_START}
                        edition={getEdition(cardEditions[p.slug || p.name] || "base")}
                        onEditionChange={(id) => setCardEdition(p.slug || p.name, id)}
                      />
                    ))}
                  </div>

                </div>
              );
            })}
            </div>
            </>
          )}
          {/* ── TOP 10 — 4 colonnes dans la colonne droite ── */}
          {dayData.teams.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: "rgba(196,181,253,0.5)", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 3 }}>{S.stellarTop10Title}</div>
              </div>
              <div className="st-top10-grid" style={{ display: "grid", gridTemplateColumns: `repeat(${dayData.teams.length}, 1fr)`, gap: 8 }}>
                {dayData.teams.map((team, ti) => (
                  <Top10Column key={ti} team={team} logos={logos} dateStr={isoDate(weekDays[selectedDay])} lang={lang} />
                ))}
              </div>
              <div style={{ marginTop: 10, fontSize: 10, color: "rgba(255,255,255,0.38)", fontStyle: "italic", lineHeight: 1.4, textAlign: "center" }}>
                {S.stellarTop10Hint}{" "}
                <span style={{ color: "rgba(252,165,165,0.8)", fontWeight: 700, fontStyle: "normal" }}>{S.stellarTop10Fight}</span>
              </div>
            </div>
          )}
          </div>{/* fin colonne droite */}
          </div>{/* fin layout flex */}

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
      {selectedDay === null && (
        <div style={{ textAlign: "center", padding: "50px 0", color: "rgba(255,255,255,0.2)" }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>✨</div>
          <div style={{ fontSize: 14 }}>{S.stellarSelectDay}</div>
        </div>
      )}
    </div>
  );
}
