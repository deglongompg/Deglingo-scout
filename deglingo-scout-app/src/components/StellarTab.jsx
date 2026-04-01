import { useState, useMemo } from "react";
import { POSITION_COLORS, dsColor, dsBg, isSilver } from "../utils/colors";
import { dScoreMatch, csProb, findTeam } from "../utils/dscore";
import { T } from "../utils/i18n";

const PC = POSITION_COLORS;

const SHORT_NAMES = {
  "Wolverhampton Wanderers": "Wolves", "Manchester United": "Man Utd", "Manchester City": "Man City",
  "Newcastle United": "Newcastle", "Nottingham Forest": "Nott. Forest", "Crystal Palace": "C. Palace",
  "Paris Saint Germain": "PSG", "Marseille": "OM", "Lyon": "OL",
  "Rayo Vallecano": "Rayo", "Atletico Madrid": "Atletico", "Real Sociedad": "R. Sociedad",
  "Athletic Club": "Bilbao", "Paris Saint-Germain": "PSG", "Olympique de Marseille": "OM",
  "Olympique Lyonnais": "OL", "RC Strasbourg Alsace": "Strasbourg", "Stade Brestois 29": "Brest",
};
const sn = (name) => SHORT_NAMES[name] || name;

const DAYS_FR = ["LUN", "MAR", "MER", "JEU", "VEN", "SAM", "DIM"];
const STELLAR_LEAGUES = ["L1", "PL", "Liga"];

const PALIERS = [
  { pts: 280, reward: "2 000 essence", color: "#94A3B8" },
  { pts: 320, reward: "5 000 essence", color: "#60A5FA" },
  { pts: 360, reward: "10 gems", color: "#A78BFA" },
  { pts: 400, reward: "30 gems", color: "#C084FC" },
  { pts: 440, reward: "100 $", color: "#F59E0B" },
  { pts: 480, reward: "1 000 $", color: "#EF4444" },
];

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
    const team = [];
    const used = new Set();
    for (const pos of ["GK", "DEF", "MIL", "ATT"]) {
      const pick = pool.find(p => p.position === pos && !used.has(p.slug));
      if (pick) { team.push({ ...pick, role: pos }); used.add(pick.slug); }
    }
    if (team.length < 4) return null;
    const flex = pool.find(p => !used.has(p.slug));
    if (!flex) return null;
    team.push({ ...flex, role: "FLEX" }); used.add(flex.slug);
    const capIdx = team.reduce((best, p, i) => p.ds > team[best].ds ? i : best, 0);
    team[capIdx].isCaptain = true;
    return { players: team, usedSlugs: used };
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

  // ULTIME — top 5 du jour
  const ultime = pickTeam(sorted);
  if (ultime) teams.push({ label: "ULTIME", icon: "★", players: ultime.players, top10: buildTop10(sorted) });

  // 3 créneaux fixes : 13H, 17H, 20H
  for (const slot of ["13H", "17H", "20H"]) {
    const pool = sorted.filter(p => getSlot(p) === slot);
    if (pool.length < 5) continue;
    const t = pickTeam(pool);
    if (t) teams.push({ label: slot, icon: "⏰", players: t.players, top10: buildTop10(pool) });
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
                    {p.position === "GK" && p.csPercent != null && (
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
function StellarCard({ player, logos, size = "md" }) {
  const pc = PC[player.position];
  const sm = size === "sm";
  const W = sm ? 78 : 96;
  const H = sm ? 108 : 130;

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

        {/* D-Score */}
        <div style={{ marginTop: 3, width: sm ? 28 : 34, height: sm ? 28 : 34, borderRadius: "50%",
          background: isSilver(player.ds) ? "linear-gradient(135deg,#C0C0C0,#A8E8D0,#B0C4E8,#D4B0E8)" : dsBg(player.ds),
          display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: "'DM Mono',monospace", fontSize: sm ? 12 : 15, fontWeight: 700,
          color: isSilver(player.ds) ? "#1a1a2e" : "#fff",
          border: isSilver(player.ds) ? "2px solid rgba(255,255,255,0.6)" : "2px solid rgba(255,255,255,0.2)",
          zIndex: 1, boxShadow: `0 2px 8px rgba(0,0,0,0.5)`,
        }}>{player.ds}</div>

        {/* Name */}
        <div style={{ fontSize: sm ? 9 : 11, fontWeight: 700, color: "#fff", marginTop: 2, zIndex: 1, lineHeight: 1.1, maxWidth: "95%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{player.name.split(" ").pop()}</div>

        {/* Club */}
        <div style={{ fontSize: 7, color: "rgba(255,255,255,0.4)", fontWeight: 500, marginTop: 1, zIndex: 1 }}>{sn(player.club)}</div>

        {/* Club logo */}
        {logos[player.club] && <img src={`/data/logos/${logos[player.club]}`} alt="" style={{ width: sm ? 18 : 22, height: sm ? 18 : 22, objectFit: "contain", marginTop: 2, zIndex: 1 }} />}
      </div>

      {/* Opponent + heure */}
      <div style={{ marginTop: 4, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
        <div style={{ fontSize: 7, color: "rgba(255,255,255,0.45)", display: "inline-flex", alignItems: "center", gap: 2, background: "rgba(0,0,0,0.4)", padding: "2px 5px", borderRadius: 3 }}>
          <span style={{ fontSize: 9 }}>{player.isHome ? "🏠" : "✈️"}</span>
          <span style={{ fontWeight: 600 }}>{sn(player.oppName)}</span>
        </div>
        {player.kickoff && player.matchDate && (
          <div style={{ fontSize: 8, fontWeight: 800, color: "#A78BFA", fontFamily: "'DM Mono',monospace" }}>
            {utcToParisTime(player.kickoff, player.matchDate)}
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   STELLAR TAB — Main Component
   ═══════════════════════════════════════════════════════════════════ */
export default function StellarTab({ players, teams, fixtures, logos = {}, onFight, lang = "fr" }) {
  const S = T[lang] ?? T.fr;
  // ⚠️ Toujours en heure de Paris — peu importe le timezone du navigateur
  const todayStr = getParisTodayStr(); // "2026-04-03"
  const today = new Date(todayStr + "T12:00:00"); // objet Date safe pour getMonday
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState(null);

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

  // All fixtures grouped by date (only Stellar leagues)
  const fixturesByDate = useMemo(() => {
    if (!fixtures?.fixtures) return {};
    const map = {};
    for (const f of fixtures.fixtures) {
      if (!STELLAR_LEAGUES.includes(f.league)) continue;
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
    const dayFixtures = fixturesByDate[dateStr] || [];
    if (!dayFixtures.length) return { fixtures: [], players: [], teams: [] };

    // Find all clubs playing this day
    const clubsPlaying = new Set();
    for (const f of dayFixtures) { clubsPlaying.add(f.home); clubsPlaying.add(f.away); }

    // Score players from those clubs (L1 + PL + Liga only)
    const pf = fixtures?.player_fixtures || {};
    const dayPlayers = [];

    for (const p of players) {
      if (!STELLAR_LEAGUES.includes(p.league)) continue;
      const fx = pf[p.slug] || pf[p.name];
      if (!fx || fx.date !== dateStr) continue;

      const lgTeams = teams.filter(t => t.league === p.league);
      const opp = lgTeams.find(t => t.name === fx.opp);
      if (!opp) continue;
      const pTeam = findTeam(lgTeams, p.club);
      const ds = dScoreMatch(p, opp, fx.isHome, pTeam);
      if (ds < 20) continue; // Filter ghosts

      let csPercent = null;
      if (p.position === "GK") {
        const oppXg = fx.isHome ? (opp.xg_ext || 1.3) : (opp.xg_dom || 1.3);
        const defXga = pTeam ? (fx.isHome ? (pTeam.xga_dom || 1.3) : (pTeam.xga_ext || 1.5)) : 1.3;
        csPercent = csProb(defXga, oppXg, p.league);
      }
      dayPlayers.push({
        ...p, ds, oppName: opp.name, oppTeam: opp, playerTeam: pTeam, isHome: fx.isHome,
        kickoff: fx.kickoff || fx.time || "",
        matchDate: dateStr,
        csPercent,
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

    return { fixtures: dayFixtures, players: dayPlayers, teams: stellarTeams, decisivePick };
  }, [selectedDay, weekDays, fixturesByDate, players, teams, fixtures]);

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
    <div style={{ position: "relative", minHeight: "80vh", padding: "0 16px 40px", zIndex: 1 }}>
      <style>{starsKeyframes}</style>

      {/* Vignette bords — position absolute, scroll avec le contenu */}
      <div style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", boxShadow: "inset 0 0 100px rgba(1,0,6,0.5)" }} />

      {/* ═══ LIGNE UNIQUE : STELLAR + EXPLICATIONS + PALIERS ═══ */}
      <div style={{ display: "flex", alignItems: "stretch", padding: "16px 0 12px", gap: 10 }}>
        {/* Titre STELLAR — gauche */}
        <div style={{ flexShrink: 0, background: "rgba(8,4,25,0.60)", backdropFilter: "blur(10px)", borderRadius: 12, padding: "8px 14px", border: "1px solid rgba(196,181,253,0.12)", display: "flex", flexDirection: "column", justifyContent: "center" }}>
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
          <div style={{ fontSize: 13, fontWeight: 800, color: "#fff", letterSpacing: "0.05em", marginTop: 6, textTransform: "uppercase" }}>Free 2 Play</div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", marginTop: 2 }}>{S.stellarSubtitle}</div>
        </div>

        {/* Blocs explicatifs — centre */}
        <div style={{ flex: 1, background: "rgba(8,4,25,0.65)", backdropFilter: "blur(10px)", borderRadius: 10, padding: "8px 12px", border: "1px solid rgba(196,181,253,0.15)", display: "flex", gap: 8, alignItems: "flex-start" }}>
          <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>★</span>
          <div>
            <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.75)", lineHeight: 1.5, fontStyle: "italic", marginBottom: 6 }}>
              {lang === "fr"
                ? <><span style={{ color: "#C4B5FD", fontWeight: 700, fontStyle: "normal" }}>Bienvenue</span> sur le Sorare Stellar Scout — j'ai développé un <span style={{ color: "#A78BFA", fontWeight: 700, fontStyle: "normal" }}>algo propriétaire</span> basé sur l'indicateur <span style={{ color: "#facc15", fontWeight: 800, fontStyle: "normal", letterSpacing: "0.05em" }}>⚡ D-SCORE</span> pour optimiser le choix journalier de tes équipes.</>
                : <><span style={{ color: "#C4B5FD", fontWeight: 700, fontStyle: "normal" }}>Welcome</span> to the Sorare Stellar Scout — I built a <span style={{ color: "#A78BFA", fontWeight: 700, fontStyle: "normal" }}>proprietary algorithm</span> based on the <span style={{ color: "#facc15", fontWeight: 800, fontStyle: "normal", letterSpacing: "0.05em" }}>⚡ D-SCORE</span> indicator to optimize your daily team selection.</>}
            </div>
            <div style={{ borderTop: "1px solid rgba(196,181,253,0.1)", paddingTop: 5 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: "#C4B5FD", marginBottom: 2 }}>{S.stellarUltimeTitle}</div>
              <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.45)", lineHeight: 1.4 }}>
                {S.stellarUltimeDesc}
              </div>
            </div>
          </div>
        </div>
        <div style={{ flex: 1, background: "rgba(8,4,25,0.65)", backdropFilter: "blur(10px)", borderRadius: 10, padding: "8px 12px", border: "1px solid rgba(196,181,253,0.15)", display: "flex", gap: 8, alignItems: "flex-start" }}>
          <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>⏰</span>
          <div>
            <div style={{ fontSize: 10, fontWeight: 800, color: "#C4B5FD", marginBottom: 2 }}>{S.stellarCreneauTitle}</div>
            <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.55)", lineHeight: 1.4 }}>
              {S.stellarCreneauDesc} <span style={{ color: "#A78BFA", fontWeight: 700 }}>{S.stellarCreneauDesc2}</span>{S.stellarCreneauDesc3}
            </div>
            <div style={{ marginTop: 6, borderTop: "1px solid rgba(196,181,253,0.1)", paddingTop: 5 }}>
              <div style={{ fontSize: 9, fontWeight: 800, color: "#A78BFA", marginBottom: 2 }}>⚡ DECISIVE PICKER</div>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.45)", lineHeight: 1.4 }}>
                {lang === "fr"
                  ? "1 joueur recommandé par jour — le plus susceptible de faire une action décisive. Calculé sur G+A/match × forme récente (L5) × faiblesse défensive adverse (xGA)."
                  : "1 recommended player per day — most likely to make a decisive action. Based on G+A/match × recent form (L5) × opponent defensive weakness (xGA)."}
              </div>
            </div>
          </div>
        </div>

        {/* Paliers — droite */}
        <div style={{ flexShrink: 0, display: "flex", gap: 5, flexWrap: "wrap", justifyContent: "flex-end", alignContent: "center", background: "rgba(8,4,25,0.60)", backdropFilter: "blur(10px)", borderRadius: 12, padding: "8px 10px", border: "1px solid rgba(196,181,253,0.12)" }}>
          {PALIERS.map((p, i) => (
            <div key={i} style={{ background: `${p.color}18`, border: `1px solid ${p.color}40`, borderRadius: 6, padding: "3px 8px", textAlign: "center" }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: p.color, fontFamily: "'DM Mono',monospace" }}>{p.pts}</div>
              <div style={{ fontSize: 7, color: "rgba(255,255,255,0.55)" }}>{p.reward}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ═══ CTA AFFILIATION ═══ */}
      <a
        href="http://sorare.pxf.io/Deglingo"
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: "linear-gradient(135deg, rgba(139,92,246,0.12), rgba(109,40,217,0.08))",
          border: "1px solid rgba(167,139,250,0.35)", borderRadius: 10,
          padding: "10px 16px", marginBottom: 10, textDecoration: "none",
          boxShadow: "0 0 18px rgba(139,92,246,0.12)",
          transition: "all 0.2s",
        }}
        onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 0 28px rgba(139,92,246,0.28)"; e.currentTarget.style.borderColor = "rgba(167,139,250,0.6)"; }}
        onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 0 18px rgba(139,92,246,0.12)"; e.currentTarget.style.borderColor = "rgba(167,139,250,0.35)"; }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 18 }}>🎁</span>
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#C4B5FD", letterSpacing: "0.03em" }}>
              {lang === "fr" ? "Viens ouvrir tes premiers packs de cartes gratuitement" : "Open your first card packs for free"}
            </div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginTop: 1 }}>
              {lang === "fr" ? "Sorare Stellar est 100% gratuit — inscris-toi et joue dès ce soir" : "Sorare Stellar is 100% free — sign up and play tonight"}
            </div>
          </div>
        </div>
        <div style={{
          fontSize: 11, fontWeight: 800, color: "#fff", whiteSpace: "nowrap",
          background: "linear-gradient(135deg, #8B5CF6, #6D28D9)", borderRadius: 8,
          padding: "6px 14px", boxShadow: "0 0 10px rgba(139,92,246,0.4)", flexShrink: 0,
        }}>
          {lang === "fr" ? "Ouvrir mes packs →" : "Open my packs →"}
        </div>
      </a>

      {/* ═══ CALENDRIER + bouton semaine suivante ═══ */}
      <div style={{ display: "grid", gridTemplateColumns: "auto repeat(7, 1fr) auto", gap: 6, marginBottom: 24, alignItems: "stretch" }}>
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
            <div key={i} onClick={() => hasMatches && setSelectedDay(i)}
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
                <div style={{ fontSize: 10, fontWeight: 800, color: isSelected ? "#C4B5FD" : "rgba(255,255,255,0.7)", letterSpacing: "0.05em" }}>{S.stellarDays[i]}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{day.getDate()}</div>
                <div style={{ fontSize: 8, fontWeight: 600, color: isSelected ? "#A78BFA" : "rgba(255,255,255,0.35)", letterSpacing: "0.04em" }}>{day.toLocaleDateString(S.stellarDateLocale, { timeZone: TZ, month: "short" }).toUpperCase().replace(".","")}</div>
              </div>
              {hasMatches ? (
                <div style={{ fontSize: 9, color: isSelected ? "#C4B5FD" : "#A78BFA", fontWeight: 600 }}>{dayFixtures.length} {dayFixtures.length > 1 ? S.stellarMatches : S.stellarMatch}</div>
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
          <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>

          {/* Colonne gauche — Date + Matchs */}
          <div style={{ flexShrink: 0 }}>

            {/* Titre du jour */}
            <div style={{ marginBottom: 8 }}>
              <h2 style={{ fontSize: 16, fontWeight: 800, color: "#fff", margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: "#C4B5FD" }}>{weekDays[selectedDay].toLocaleDateString(S.stellarDateLocale, { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).toUpperCase()}</span>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", fontWeight: 500 }}>— {dayData.fixtures.length} {dayData.fixtures.length > 1 ? S.stellarMatches : S.stellarMatch}</span>
              </h2>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", fontWeight: 600, letterSpacing: "0.08em", marginTop: 2 }}>{lang === "fr" ? "HEURE PARIS" : "PARIS TIME"}</div>
            </div>

            {/* Match list — groupé par créneau horaire, trié chrono heure France */}
            {(() => {
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
                      <div style={{ fontSize: 10, fontWeight: 900, color: "#fff", fontFamily: "'DM Mono',monospace", paddingLeft: 2 }}>{g.time}</div>
                      {g.fixtures.map((f, i) => {
                        const lgColor = f.league === "L1" ? "#4FC3F7" : f.league === "PL" ? "#B388FF" : "#FF8A80";
                        return (
                          <div key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 8px", background: "rgba(30,10,70,0.45)", border: "1px solid rgba(140,100,255,0.12)", borderRadius: 6, backdropFilter: "blur(6px)" }}>
                            <span style={{ fontSize: 8, fontWeight: 800, color: lgColor, minWidth: 22 }}>{f.league}</span>
                            {logos[f.home] && <img src={`/data/logos/${logos[f.home]}`} alt="" style={{ width: 13, height: 13, objectFit: "contain" }} />}
                            <span style={{ fontSize: 11, fontWeight: 600, color: "#fff" }}>{sn(f.home)}</span>
                            <span style={{ fontSize: 9, color: "rgba(255,255,255,0.25)" }}>vs</span>
                            <span style={{ fontSize: 11, fontWeight: 600, color: "#fff" }}>{sn(f.away)}</span>
                            {logos[f.away] && <img src={`/data/logos/${logos[f.away]}`} alt="" style={{ width: 13, height: 13, objectFit: "contain" }} />}
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

            {/* ─── DECISIVE PICK — pleine largeur colonne droite ─── */}
            {dayData.decisivePick && (() => {
              const dp = dayData.decisivePick;
              const parisTime = utcToParisTime(dp.kickoff, dp.matchDate);
              const gaR = dp.ga_per_match?.toFixed(2) || "0.00";
              const lgColor = dp.league === "L1" ? "#4FC3F7" : dp.league === "PL" ? "#B388FF" : "#FF8A80";
              const pc = PC[dp.position];
              return (
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10, background: "linear-gradient(135deg, rgba(6,2,20,0.9), rgba(15,5,40,0.85))", border: "1px solid rgba(196,181,253,0.2)", borderRadius: 10, padding: "8px 14px", backdropFilter: "blur(12px)", boxShadow: "0 0 16px rgba(139,92,246,0.1)" }}>
                  <div style={{ flexShrink: 0, fontSize: 18 }}>⚡</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 8, fontWeight: 800, color: "#A78BFA", letterSpacing: "0.1em", marginBottom: 3 }}>
                      {lang === "fr" ? "DECISIVE PICKER — 2 000 ESSENCE" : "DECISIVE PICKER — 2,000 ESSENCE"}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      {logos[dp.club] && <img src={`/data/logos/${logos[dp.club]}`} alt="" style={{ width: 16, height: 16, objectFit: "contain" }} />}
                      <span style={{ fontSize: 13, fontWeight: 900, color: "#fff" }}>{dp.name}</span>
                      <span style={{ fontSize: 8, fontWeight: 800, background: `linear-gradient(135deg,${pc},${pc}CC)`, borderRadius: 3, padding: "1px 5px", color: "#fff" }}>{dp.position}</span>
                      <span style={{ fontSize: 8, fontWeight: 700, color: lgColor }}>{dp.league}</span>
                      <span style={{ fontSize: 8, color: "rgba(255,255,255,0.45)" }}>vs <span style={{ color: "#fff", fontWeight: 600 }}>{sn(dp.oppName)}</span></span>
                      {parisTime && <span style={{ fontSize: 8, color: "#C4B5FD", fontWeight: 700 }}>⏰ {parisTime}</span>}
                      <span style={{ fontSize: 8, color: "rgba(255,255,255,0.45)" }}>G+A/match <span style={{ color: "#4ADE80", fontWeight: 700 }}>{gaR}</span></span>
                      <span style={{ fontSize: 8, color: "rgba(255,255,255,0.45)" }}>L5 <span style={{ color: dp.l5 >= 60 ? "#4ADE80" : dp.l5 >= 40 ? "#F59E0B" : "#EF4444", fontWeight: 700 }}>{dp.l5 ?? "—"}</span></span>
                      <span style={{ fontSize: 8, color: "rgba(255,255,255,0.45)" }}>D-Score <span style={{ color: "#C4B5FD", fontWeight: 700 }}>{dp.ds}</span></span>
                    </div>
                  </div>
                  <div style={{ flexShrink: 0, textAlign: "center", background: "rgba(139,92,246,0.15)", border: "1px solid rgba(167,139,250,0.3)", borderRadius: 8, padding: "6px 12px" }}>
                    <div style={{ fontSize: 18, fontWeight: 900, color: dp.pDecisive >= 50 ? "#4ADE80" : dp.pDecisive >= 30 ? "#F59E0B" : "#C4B5FD", fontFamily: "'DM Mono',monospace", lineHeight: 1 }}>{dp.pDecisive}%</div>
                    <div style={{ fontSize: 7, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>CHANCE</div>
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
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
            {dayData.teams.map((team, ti) => {
              const isUltime = team.label === "ULTIME";
              const totalScore = team.players.reduce((sum, p) => sum + (p.isCaptain ? Math.round(p.ds * 1.5) : p.ds), 0);
              const palier = PALIERS.filter(p => totalScore >= p.pts).pop();
              return (
                <div key={ti} style={{
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
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {/* Infos à gauche du score */}
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 7, color: "rgba(255,255,255,0.25)", fontStyle: "italic" }}>{S.stellarBonusCard}</div>
                        <div style={{ fontSize: 7, color: "rgba(255,255,255,0.2)" }}>{S.stellarProjScore}</div>
                        {palier && <div style={{ fontSize: 7, color: palier.color, fontWeight: 600 }}>→ {palier.reward}</div>}
                      </div>
                      {/* Score à droite */}
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 8, fontWeight: 700, color: "rgba(196,181,253,0.6)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 1 }}>{S.stellarScore}</div>
                        <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 20, fontWeight: 800, color: palier ? palier.color : "#fff" }}>{totalScore}</div>
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "center", gap: 4, flexWrap: "nowrap", overflow: "hidden" }}>
                    {team.players.map((p, pi) => (
                      <StellarCard key={pi} player={p} logos={logos} size="sm" />
                    ))}
                  </div>

                </div>
              );
            })}
            </div>
          )}
          {/* ── TOP 10 — 4 colonnes dans la colonne droite ── */}
          {dayData.teams.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: "rgba(196,181,253,0.5)", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 3 }}>{S.stellarTop10Title}</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: `repeat(${dayData.teams.length}, 1fr)`, gap: 8 }}>
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
