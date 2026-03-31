import { useState, useMemo } from "react";
import { POSITION_COLORS, dsColor, dsBg, isSilver } from "../utils/colors";
import { dScoreMatch, findTeam } from "../utils/dscore";

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

/* ─── Helper: get Monday of the week containing `date` ─── */
function getMonday(d) {
  const dt = new Date(d);
  const day = dt.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  dt.setDate(dt.getDate() + diff);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

function fmtDate(d) {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

/* ─── Stars background CSS (animated) ─── */
const starsKeyframes = `
@keyframes twinkle { 0%,100%{opacity:0.3} 50%{opacity:1} }
@keyframes shootingStar { 0%{transform:translateX(-100px) translateY(-100px);opacity:1} 100%{transform:translateX(300px) translateY(300px);opacity:0} }
@keyframes nebulaPulse { 0%,100%{opacity:0.15} 50%{opacity:0.25} }
`;

/* ─── Build teams for a given day ─── */
function buildStellarTeams(dayPlayers) {
  if (dayPlayers.length < 5) return [];

  // Sort by D-Score descending
  const sorted = [...dayPlayers].sort((a, b) => b.ds - a.ds);

  // Pick best SO5 team: 1 GK + 1 DEF + 1 MIL + 1 ATT + 1 FLEX
  function pickTeam(pool) {
    const team = [];
    const used = new Set();
    const needs = ["GK", "DEF", "MIL", "ATT"];

    for (const pos of needs) {
      const pick = pool.find(p => p.position === pos && !used.has(p.slug));
      if (pick) { team.push({ ...pick, role: pos }); used.add(pick.slug); }
    }
    if (team.length < 4) return null;

    // FLEX = best remaining
    const flex = pool.find(p => !used.has(p.slug));
    if (flex) { team.push({ ...flex, role: "FLEX" }); used.add(flex.slug); }
    else return null;

    // Captain = highest D-Score
    const capIdx = team.reduce((best, p, i) => p.ds > team[best].ds ? i : best, 0);
    team[capIdx].isCaptain = true;

    return { players: team, usedSlugs: used };
  }

  const teams = [];

  // TEAM ULTIME — top 5 of the day
  const ultime = pickTeam(sorted);
  if (ultime) teams.push({ label: "ULTIME", icon: "★", players: ultime.players });

  // TEAMS BY TIME SLOT — group by kickoff hour
  const bySlot = {};
  for (const p of dayPlayers) {
    const slot = p.kickoff || "TBD";
    if (!bySlot[slot]) bySlot[slot] = [];
    bySlot[slot].push(p);
  }

  const slotKeys = Object.keys(bySlot).sort();
  for (const slot of slotKeys) {
    if (teams.length >= 4) break;
    const slotSorted = [...bySlot[slot]].sort((a, b) => b.ds - a.ds);
    const t = pickTeam(slotSorted);
    if (t) teams.push({ label: slot === "TBD" ? "TBD" : slot, icon: "⏰", players: t.players });
  }

  return teams;
}

/* ─── Player Mini Card (compact for Stellar) ─── */
function StellarCard({ player, logos }) {
  const pc = PC[player.position];
  const displayRole = player.isCaptain ? "© " + player.role : player.role;

  return (
    <div style={{ textAlign: "center", width: 100 }}>
      <div style={{
        position: "relative", width: 96, height: 130, borderRadius: 10,
        background: `linear-gradient(155deg, #0a0a2e 0%, #12103a 40%, ${pc}12 70%, #08082a 100%)`,
        border: player.isCaptain ? `2px solid #FFD700` : `1.5px solid ${pc}30`,
        display: "flex", flexDirection: "column", alignItems: "center",
        padding: "4px 2px 0", overflow: "hidden",
        boxShadow: player.isCaptain
          ? "0 0 16px rgba(255,215,0,0.3), 0 4px 12px rgba(0,0,0,0.5)"
          : `0 4px 12px rgba(0,0,0,0.4)`,
      }}>
        {/* Star dust */}
        <div style={{ position: "absolute", inset: 0, opacity: 0.15, pointerEvents: "none",
          backgroundImage: "radial-gradient(0.8px 0.8px at 15% 20%, #fff, transparent), radial-gradient(0.5px 0.5px at 50% 65%, #C4B5FD, transparent), radial-gradient(0.7px 0.7px at 80% 15%, #fff, transparent), radial-gradient(0.6px 0.6px at 35% 80%, #A78BFA, transparent), radial-gradient(0.4px 0.4px at 70% 50%, #fff, transparent)"
        }} />
        {/* Top accent */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: player.isCaptain ? "linear-gradient(90deg, transparent, #FFD700, transparent)" : `linear-gradient(90deg, transparent, ${pc}60, transparent)`, pointerEvents: "none" }} />

        {/* Captain badge */}
        {player.isCaptain && (
          <div style={{ position: "absolute", top: 2, right: 4, background: "linear-gradient(135deg, #FFD700, #FFA500)", borderRadius: "50%", width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 900, color: "#1a1a2e", boxShadow: "0 0 8px rgba(255,215,0,0.5)", zIndex: 2 }}>C</div>
        )}

        {/* Position */}
        <div style={{ background: `linear-gradient(135deg,${pc},${pc}CC)`, borderRadius: 3, padding: "1px 6px", marginTop: 2, fontSize: 7, fontWeight: 800, color: "#fff", letterSpacing: "0.06em", zIndex: 1, boxShadow: `0 1px 4px ${pc}40` }}>{player.role}</div>

        {/* D-Score */}
        <div style={{ marginTop: 4, width: 34, height: 34, borderRadius: "50%",
          background: isSilver(player.ds) ? "linear-gradient(135deg,#C0C0C0,#A8E8D0,#B0C4E8,#D4B0E8)" : dsBg(player.ds),
          display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: "'DM Mono',monospace", fontSize: 15, fontWeight: 700,
          color: isSilver(player.ds) ? "#1a1a2e" : "#fff",
          border: isSilver(player.ds) ? "2px solid rgba(255,255,255,0.6)" : "2px solid rgba(255,255,255,0.2)",
          zIndex: 1, boxShadow: `0 2px 8px rgba(0,0,0,0.5)`,
        }}>{player.ds}</div>

        {/* Name */}
        <div style={{ fontSize: 11, fontWeight: 700, color: "#fff", marginTop: 3, zIndex: 1, textShadow: "0 1px 3px rgba(0,0,0,0.5)", lineHeight: 1.1, maxWidth: "90%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{player.name.split(" ").pop()}</div>

        {/* Club */}
        <div style={{ fontSize: 7, color: "rgba(255,255,255,0.4)", fontWeight: 500, marginTop: 2, zIndex: 1 }}>{sn(player.club)}</div>

        {/* Club logo */}
        {logos[player.club] && <img src={`/data/logos/${logos[player.club]}`} alt="" style={{ width: 22, height: 22, objectFit: "contain", marginTop: 2, zIndex: 1, filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.4))" }} />}
      </div>

      {/* Opponent */}
      <div style={{ marginTop: 4, fontSize: 7, color: "rgba(255,255,255,0.45)", display: "inline-flex", alignItems: "center", gap: 2, background: "rgba(0,0,0,0.4)", padding: "2px 5px", borderRadius: 3 }}>
        <span style={{ fontSize: 9 }}>{player.isHome ? "🏠" : "✈️"}</span>
        <span style={{ fontWeight: 600 }}>{sn(player.oppName)}</span>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   STELLAR TAB — Main Component
   ═══════════════════════════════════════════════════════════════════ */
export default function StellarTab({ players, teams, fixtures, logos = {} }) {
  const today = new Date();
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState(null);

  const monday = useMemo(() => {
    const m = getMonday(today);
    m.setDate(m.getDate() + weekOffset * 7);
    return m;
  }, [weekOffset]);

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

      dayPlayers.push({
        ...p, ds, oppName: opp.name, oppTeam: opp, playerTeam: pTeam, isHome: fx.isHome,
        kickoff: fx.kickoff || fx.time || "TBD",
      });
    }

    const stellarTeams = buildStellarTeams(dayPlayers);
    return { fixtures: dayFixtures, players: dayPlayers, teams: stellarTeams };
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
    <div style={{ position: "relative", minHeight: "80vh", padding: "0 16px 40px" }}>
      <style>{starsKeyframes}</style>

      {/* ═══ GALAXY BACKGROUND ═══ */}
      <div style={{ position: "fixed", inset: 0, zIndex: -1, pointerEvents: "none",
        background: "radial-gradient(ellipse at 20% 50%, #1a0533 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, #0c1445 0%, transparent 40%), radial-gradient(ellipse at 50% 80%, #1a0a3a 0%, transparent 50%), #05050f",
      }}>
        {/* Milky way band */}
        <div style={{ position: "absolute", top: "10%", left: "-10%", width: "120%", height: "35%", background: "linear-gradient(135deg, transparent 20%, rgba(139,92,246,0.06) 35%, rgba(168,85,247,0.08) 50%, rgba(139,92,246,0.06) 65%, transparent 80%)", transform: "rotate(-15deg)", filter: "blur(30px)", animation: "nebulaPulse 8s ease-in-out infinite" }} />
        {/* Stars layer */}
        <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(1px 1px at 10% 15%, rgba(255,255,255,0.8), transparent), radial-gradient(1.5px 1.5px at 25% 45%, rgba(196,181,253,0.9), transparent), radial-gradient(1px 1px at 40% 10%, rgba(255,255,255,0.7), transparent), radial-gradient(1.2px 1.2px at 55% 70%, rgba(167,139,250,0.8), transparent), radial-gradient(0.8px 0.8px at 70% 30%, rgba(255,255,255,0.6), transparent), radial-gradient(1px 1px at 85% 55%, rgba(196,181,253,0.7), transparent), radial-gradient(1.3px 1.3px at 15% 80%, rgba(255,255,255,0.8), transparent), radial-gradient(1px 1px at 50% 40%, rgba(139,92,246,0.9), transparent), radial-gradient(0.7px 0.7px at 95% 85%, rgba(255,255,255,0.5), transparent), radial-gradient(1.1px 1.1px at 35% 92%, rgba(167,139,250,0.6), transparent), radial-gradient(1px 1px at 60% 5%, rgba(255,255,255,0.7), transparent), radial-gradient(0.9px 0.9px at 80% 75%, rgba(196,181,253,0.5), transparent)", animation: "twinkle 4s ease-in-out infinite alternate" }} />
        {/* Nebula accent */}
        <div style={{ position: "absolute", top: "60%", right: "5%", width: 300, height: 300, background: "radial-gradient(circle, rgba(139,92,246,0.1), transparent 70%)", borderRadius: "50%", filter: "blur(40px)" }} />
      </div>

      {/* ═══ HEADER ═══ */}
      <div style={{ textAlign: "center", padding: "24px 0 16px" }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.2em", color: "#A78BFA", textTransform: "uppercase", marginBottom: 4 }}>Sorare</div>
        <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0, letterSpacing: "-0.5px",
          background: "linear-gradient(135deg, #C4B5FD, #A78BFA, #8B5CF6, #7C3AED, #A78BFA, #C4B5FD)",
          backgroundSize: "200% auto", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          backgroundClip: "text", animation: "silverShine 4s linear infinite",
        }}>STELLAR</h1>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>Picks quotidiens · L1 · PL · Liga</div>
      </div>

      {/* ═══ PALIERS ═══ */}
      <div style={{ display: "flex", justifyContent: "center", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
        {PALIERS.map((p, i) => (
          <div key={i} style={{ background: `${p.color}12`, border: `1px solid ${p.color}30`, borderRadius: 6, padding: "4px 10px", textAlign: "center" }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: p.color, fontFamily: "'DM Mono',monospace" }}>{p.pts}</div>
            <div style={{ fontSize: 8, color: "rgba(255,255,255,0.4)" }}>{p.reward}</div>
          </div>
        ))}
      </div>

      {/* ═══ WEEK NAVIGATOR ═══ */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, marginBottom: 16 }}>
        <button onClick={() => { setWeekOffset(w => w - 1); setSelectedDay(null); }}
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#A78BFA", padding: "6px 12px", cursor: "pointer", fontSize: 14, fontWeight: 700, fontFamily: "Outfit" }}>◀</button>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>Semaine</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{weekLabel}</div>
        </div>
        <button onClick={() => { setWeekOffset(w => w + 1); setSelectedDay(null); }}
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#A78BFA", padding: "6px 12px", cursor: "pointer", fontSize: 14, fontWeight: 700, fontFamily: "Outfit" }}>▶</button>
      </div>

      {/* ═══ CALENDAR ROW ═══ */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6, marginBottom: 24 }}>
        {weekDays.map((day, i) => {
          const dateStr = isoDate(day);
          const dayFixtures = fixturesByDate[dateStr] || [];
          const hasMatches = dayFixtures.length > 0;
          const isSelected = selectedDay === i;
          const isToday = dateStr === isoDate(today);

          return (
            <div key={i} onClick={() => hasMatches && setSelectedDay(i)}
              style={{
                background: isSelected ? "rgba(139,92,246,0.15)" : hasMatches ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.2)",
                border: isSelected ? "1px solid rgba(139,92,246,0.5)" : isToday ? "1px solid rgba(139,92,246,0.25)" : "1px solid rgba(255,255,255,0.05)",
                borderRadius: 10, padding: "8px 4px", textAlign: "center",
                cursor: hasMatches ? "pointer" : "default",
                opacity: hasMatches ? 1 : 0.4,
                transition: "all 0.2s",
                boxShadow: isSelected ? "0 0 20px rgba(139,92,246,0.15)" : "none",
              }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: isSelected ? "#A78BFA" : "rgba(255,255,255,0.5)", letterSpacing: "0.05em" }}>{DAYS_FR[i]}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: isSelected ? "#fff" : "rgba(255,255,255,0.7)", margin: "2px 0" }}>{day.getDate()}</div>
              {hasMatches ? (
                <div style={{ fontSize: 9, color: "#A78BFA", fontWeight: 600 }}>{dayFixtures.length} match{dayFixtures.length > 1 ? "s" : ""}</div>
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
      </div>

      {/* ═══ SELECTED DAY CONTENT ═══ */}
      {selectedDay !== null && dayData && (
        <div>
          {/* Day header with matches */}
          <div style={{ marginBottom: 20 }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, color: "#fff", margin: "0 0 10px", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: "#A78BFA" }}>{DAYS_FR[selectedDay]}</span> {weekDays[selectedDay].getDate()}/{weekDays[selectedDay].getMonth() + 1}
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", fontWeight: 500 }}>— {dayData.fixtures.length} match{dayData.fixtures.length > 1 ? "s" : ""}</span>
            </h2>

            {/* Match list */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {dayData.fixtures.map((f, i) => (
                <div key={i} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, padding: "6px 10px", fontSize: 11, display: "flex", alignItems: "center", gap: 6 }}>
                  {logos[f.home] && <img src={`/data/logos/${logos[f.home]}`} alt="" style={{ width: 14, height: 14, objectFit: "contain" }} />}
                  <span style={{ fontWeight: 600, color: "#fff" }}>{sn(f.home)}</span>
                  <span style={{ color: "rgba(255,255,255,0.25)", fontSize: 9 }}>vs</span>
                  <span style={{ fontWeight: 600, color: "#fff" }}>{sn(f.away)}</span>
                  {logos[f.away] && <img src={`/data/logos/${logos[f.away]}`} alt="" style={{ width: 14, height: 14, objectFit: "contain" }} />}
                  <span style={{ fontSize: 8, color: f.league === "L1" ? "#4FC3F7" : f.league === "PL" ? "#B388FF" : "#FF8A80", fontWeight: 700, marginLeft: 2 }}>{f.league}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Teams */}
          {dayData.teams.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: "rgba(255,255,255,0.2)" }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🔭</div>
              <div style={{ fontSize: 13 }}>Pas assez de joueurs pour constituer des équipes</div>
            </div>
          ) : (
            dayData.teams.map((team, ti) => {
              const isUltime = team.label === "ULTIME";
              const totalScore = team.players.reduce((sum, p) => sum + (p.isCaptain ? Math.round(p.ds * 1.5) : p.ds), 0);
              const palier = PALIERS.filter(p => totalScore >= p.pts).pop();

              return (
                <div key={ti} style={{
                  marginBottom: 20, borderRadius: 14, padding: "16px",
                  background: isUltime
                    ? "linear-gradient(135deg, rgba(139,92,246,0.08), rgba(168,85,247,0.04), rgba(0,0,0,0.3))"
                    : "rgba(255,255,255,0.02)",
                  border: isUltime
                    ? "1px solid rgba(139,92,246,0.25)"
                    : "1px solid rgba(255,255,255,0.05)",
                  boxShadow: isUltime ? "0 0 30px rgba(139,92,246,0.1)" : "none",
                }}>
                  {/* Team header */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 18 }}>{team.icon}</span>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 800, color: isUltime ? "#C4B5FD" : "#fff", letterSpacing: "0.05em" }}>
                          {isUltime ? "ÉQUIPE ULTIME" : `ÉQUIPE ${team.label}`}
                        </div>
                        <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>
                          {isUltime ? "Top 5 D-Score du jour" : `Créneau ${team.label}`}
                        </div>
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 20, fontWeight: 800, color: palier ? palier.color : "#fff" }}>{totalScore}</div>
                      <div style={{ fontSize: 8, color: "rgba(255,255,255,0.3)" }}>score prévu (cap ×1.5)</div>
                      {palier && <div style={{ fontSize: 8, color: palier.color, fontWeight: 600 }}>→ {palier.reward}</div>}
                    </div>
                  </div>

                  {/* Players in formation layout */}
                  <div style={{ display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
                    {team.players.map((p, pi) => (
                      <StellarCard key={pi} player={p} logos={logos} />
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* No day selected */}
      {selectedDay === null && (
        <div style={{ textAlign: "center", padding: "50px 0", color: "rgba(255,255,255,0.2)" }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>✨</div>
          <div style={{ fontSize: 14 }}>Sélectionne un jour pour voir les picks Stellar</div>
        </div>
      )}
    </div>
  );
}
