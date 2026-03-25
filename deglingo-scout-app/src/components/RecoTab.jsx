import { useState, useMemo } from "react";
import { dsColor, dsBg, LEAGUE_FLAGS, LEAGUE_NAMES, POSITION_COLORS } from "../utils/colors";
import { dScoreMatch } from "../utils/dscore";
import MiniGraph from "./MiniGraph";

export default function RecoTab({ players, teams }) {
  const [league, setLeague] = useState("L1");
  const [sel, setSel] = useState(null);

  const leagueMap = { L1: "Ligue 1", PL: "Premier League", Liga: "La Liga", Bundes: "Bundesliga" };

  // Auto-pick SO7: top players by D-Score against a random opponent from their league
  const so7 = useMemo(() => {
    const lgPlayers = players.filter(p => p.league === league && p.l5 >= 35);
    const lgTeams = teams.filter(t => t.league === league);
    if (!lgTeams.length) return [];

    // Score each player vs a representative opponent (league average)
    const scored = lgPlayers.map(p => {
      // Pick a different team as opponent
      const opp = lgTeams.find(t => !p.club.includes(t.name) && !t.name.includes(p.club.split(" ")[0])) || lgTeams[0];
      const ds = dScoreMatch(p, opp, true); // default home
      return { ...p, ds, oppName: opp.name, isHome: true };
    }).sort((a, b) => b.ds - a.ds);

    // Pick: 1 GK, 2 DEF, 2 MIL, 2 ATT
    const picks = [];
    const quota = { GK: 1, DEF: 2, MIL: 2, ATT: 2 };
    const counts = { GK: 0, DEF: 0, MIL: 0, ATT: 0 };

    for (const p of scored) {
      if (counts[p.position] < quota[p.position]) {
        picks.push(p);
        counts[p.position]++;
      }
      if (picks.length >= 7) break;
    }
    return picks;
  }, [players, teams, league]);

  const gk = so7.filter(p => p.position === "GK");
  const def = so7.filter(p => p.position === "DEF");
  const mil = so7.filter(p => p.position === "MIL");
  const att = so7.filter(p => p.position === "ATT");

  const selPlayer = sel !== null ? so7[sel] : null;

  const card = (p, idx) => {
    const isSelected = sel === idx;
    const posCol = POSITION_COLORS[p.position];
    return (
      <div
        key={`${p.name}-${idx}`}
        onClick={() => setSel(isSelected ? null : idx)}
        style={{
          width: 96, cursor: "pointer", textAlign: "center",
          transition: "transform 0.2s, box-shadow 0.2s",
          transform: isSelected ? "scale(1.08) translateY(-4px)" : "scale(1)",
        }}
        onMouseEnter={e => { if (!isSelected) e.currentTarget.style.transform = "scale(1.04) translateY(-2px)"; }}
        onMouseLeave={e => { if (!isSelected) e.currentTarget.style.transform = "scale(1)"; }}
      >
        {/* Position badge */}
        <div style={{
          fontSize: 9, fontWeight: 700, color: posCol, background: `${posCol}22`,
          borderRadius: 6, padding: "1px 6px", display: "inline-block", marginBottom: 4,
          border: `1px solid ${posCol}44`,
        }}>{p.position}</div>

        {/* D-Score circle */}
        <div style={{
          width: 44, height: 44, borderRadius: "50%", background: dsBg(p.ds),
          display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 4px",
          fontSize: 16, fontWeight: 800, color: "#fff", fontFamily: "DM Mono",
          boxShadow: isSelected ? `0 0 20px ${dsColor(p.ds)}66` : `0 0 10px ${dsColor(p.ds)}33`,
          border: isSelected ? "2px solid #fff" : "2px solid transparent",
        }}>{p.ds}</div>

        {/* Name */}
        <div style={{ fontSize: 11, fontWeight: 700, color: "#fff", lineHeight: 1.2 }}>
          {p.name.split(" ").pop()}
        </div>
        <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", marginTop: 1 }}>
          {p.club.split(" ").slice(0, 2).join(" ")}
        </div>

        {/* Home/Away + opponent */}
        <div style={{ fontSize: 8, color: "rgba(255,255,255,0.3)", marginTop: 3 }}>
          🏠 vs {p.oppName.split(" ").slice(0, 2).join(" ")}
        </div>

        {/* Mini bars */}
        <div style={{ display: "flex", justifyContent: "center", marginTop: 4 }}>
          <div style={{ display: "flex", gap: 1, alignItems: "flex-end", height: 16 }}>
            {(p.last_5 || []).map((s, i) => (
              <div key={i} style={{
                width: 5, height: Math.max(2, (s / 100) * 16), borderRadius: 1,
                background: s >= 70 ? "#4ADE80" : s >= 55 ? "#A3E635" : s >= 40 ? "#FBBF24" : "#EF4444",
                opacity: 1 - i * 0.15,
              }} />
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{ padding: "0 16px 20px", maxWidth: 520, margin: "0 auto" }}>
      {/* League tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 20, justifyContent: "center" }}>
        {["L1", "PL", "Liga", "Bundes"].map(l => (
          <button key={l} onClick={() => { setLeague(l); setSel(null); }} style={{
            padding: "6px 16px", borderRadius: 10, fontSize: 12, fontWeight: 600,
            border: "none", cursor: "pointer", fontFamily: "Outfit",
            background: league === l ? "rgba(99,102,241,0.15)" : "rgba(255,255,255,0.03)",
            color: league === l ? "#A5B4FC" : "rgba(255,255,255,0.4)",
            outline: league === l ? "1px solid rgba(99,102,241,0.3)" : "none",
          }}>{LEAGUE_FLAGS[l]} {l}</button>
        ))}
      </div>

      {/* Terrain */}
      <div style={{
        background: "linear-gradient(180deg, #1a472a 0%, #2d6b3f 30%, #1a472a 60%, #2d6b3f 100%)",
        borderRadius: 16, padding: "24px 12px", position: "relative", overflow: "hidden",
        border: "2px solid rgba(255,255,255,0.1)",
        minHeight: 420,
      }}>
        {/* Field markings */}
        <div style={{
          position: "absolute", top: "50%", left: 12, right: 12, height: 1,
          background: "rgba(255,255,255,0.15)",
        }} />
        <div style={{
          position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
          width: 60, height: 60, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.15)",
        }} />
        {/* Penalty boxes */}
        <div style={{
          position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)",
          width: "60%", height: 50, borderTop: "1px solid rgba(255,255,255,0.12)",
          borderLeft: "1px solid rgba(255,255,255,0.12)", borderRight: "1px solid rgba(255,255,255,0.12)",
        }} />
        <div style={{
          position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)",
          width: "60%", height: 50, borderBottom: "1px solid rgba(255,255,255,0.12)",
          borderLeft: "1px solid rgba(255,255,255,0.12)", borderRight: "1px solid rgba(255,255,255,0.12)",
        }} />

        {/* League watermark */}
        <div style={{
          position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
          fontSize: 48, opacity: 0.06, fontWeight: 900, color: "#fff", fontFamily: "Outfit",
          whiteSpace: "nowrap", pointerEvents: "none",
        }}>{LEAGUE_NAMES[league]}</div>

        {/* Formation: ATT → MIL → DEF → GK (top to bottom) */}
        <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", gap: 20, alignItems: "center" }}>
          {/* ATT */}
          <div style={{ display: "flex", gap: 40, justifyContent: "center" }}>
            {att.map((p, i) => card(p, so7.indexOf(p)))}
          </div>
          {/* MIL */}
          <div style={{ display: "flex", gap: 50, justifyContent: "center" }}>
            {mil.map((p, i) => card(p, so7.indexOf(p)))}
          </div>
          {/* DEF */}
          <div style={{ display: "flex", gap: 40, justifyContent: "center" }}>
            {def.map((p, i) => card(p, so7.indexOf(p)))}
          </div>
          {/* GK */}
          <div style={{ display: "flex", justifyContent: "center" }}>
            {gk.map((p, i) => card(p, so7.indexOf(p)))}
          </div>
        </div>
      </div>

      {/* Detail panel */}
      {selPlayer && (
        <div style={{
          marginTop: 16, background: "rgba(255,255,255,0.02)", borderRadius: 14,
          border: "1px solid rgba(255,255,255,0.06)", padding: 20,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#fff" }}>{selPlayer.name}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
                {selPlayer.club} · {selPlayer.position} · {selPlayer.archetype}
              </div>
            </div>
            <div style={{
              width: 48, height: 48, borderRadius: "50%", background: dsBg(selPlayer.ds),
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 18, fontWeight: 800, color: "#fff", fontFamily: "DM Mono",
            }}>{selPlayer.ds}</div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginTop: 16 }}>
            {[
              { label: "L5", value: selPlayer.l5, color: dsColor(selPlayer.l5) },
              { label: "AA5", value: selPlayer.aa5, color: "#A5B4FC" },
              { label: "Floor", value: selPlayer.floor, color: dsColor(selPlayer.floor) },
              { label: "Rég%", value: `${selPlayer.regularite}%`, color: selPlayer.regularite >= 80 ? "#4ADE80" : "#FBBF24" },
            ].map(s => (
              <div key={s.label} style={{
                background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "8px 4px", textAlign: "center",
              }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: s.color, fontFamily: "DM Mono" }}>{s.value}</div>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)" }}>{s.label}</div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 12, textAlign: "center" }}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginBottom: 4 }}>5 derniers matchs</div>
            <div style={{ display: "flex", justifyContent: "center" }}>
              <MiniGraph scores={selPlayer.last_5} width={200} height={50} />
            </div>
          </div>

          <div style={{
            marginTop: 12, padding: "8px 12px", background: "rgba(255,255,255,0.02)",
            borderRadius: 8, fontSize: 11, color: "rgba(255,255,255,0.5)", textAlign: "center",
          }}>
            🏠 vs {selPlayer.oppName} · D-Score: <span style={{ color: dsColor(selPlayer.ds), fontWeight: 700 }}>{selPlayer.ds}</span>
          </div>
        </div>
      )}
    </div>
  );
}
