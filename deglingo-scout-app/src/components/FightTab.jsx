import { useState, useMemo } from "react";
import { dsColor, dsBg, LEAGUE_FLAGS, LEAGUE_NAMES, POSITION_COLORS } from "../utils/colors";
import { dScoreMatch } from "../utils/dscore";

function Sel({ value, onChange, options, placeholder }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={{
      background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 8, color: "#fff", padding: "8px 12px", fontSize: 12, width: "100%",
      outline: "none", cursor: "pointer", fontFamily: "Outfit",
    }}>
      <option value="">{placeholder}</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function Badge({ score, size = 56 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", background: dsBg(score),
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.38, fontWeight: 800, color: "#fff", fontFamily: "DM Mono",
      boxShadow: `0 0 20px ${dsColor(score)}44`,
    }}>{score}</div>
  );
}

function Bars({ scores }) {
  if (!scores || !scores.length) return null;
  return (
    <div style={{ display: "flex", gap: 2, alignItems: "flex-end", height: 24 }}>
      {scores.map((s, i) => (
        <div key={i} style={{
          width: 8, height: Math.max(4, (s / 100) * 24),
          borderRadius: 2, opacity: 1 - i * 0.15,
          background: s >= 70 ? "#4ADE80" : s >= 55 ? "#A3E635" : s >= 40 ? "#FBBF24" : "#EF4444",
        }} />
      ))}
    </div>
  );
}

function StatRow({ label, v1, v2 }) {
  const better1 = v1 > v2, better2 = v2 > v1;
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 8, padding: "6px 0",
      borderBottom: "1px solid rgba(255,255,255,0.03)", alignItems: "center",
    }}>
      <div style={{
        textAlign: "right", fontFamily: "DM Mono", fontSize: 14, fontWeight: 600,
        color: better1 ? "#4ADE80" : "rgba(255,255,255,0.4)",
      }}>{typeof v1 === "number" ? v1.toFixed?.(1) ?? v1 : v1}</div>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", textAlign: "center", minWidth: 50 }}>{label}</div>
      <div style={{
        textAlign: "left", fontFamily: "DM Mono", fontSize: 14, fontWeight: 600,
        color: better2 ? "#4ADE80" : "rgba(255,255,255,0.4)",
      }}>{typeof v2 === "number" ? v2.toFixed?.(1) ?? v2 : v2}</div>
    </div>
  );
}

export default function FightTab({ players, teams }) {
  const [lg1, setLg1] = useState("L1"); const [lg2, setLg2] = useState("L1");
  const [c1, setC1] = useState(""); const [c2, setC2] = useState("");
  const [pn1, setPn1] = useState(""); const [pn2, setPn2] = useState("");
  const [o1, setO1] = useState(""); const [o2, setO2] = useState("");
  const [h1, setH1] = useState(true); const [h2, setH2] = useState(true);

  const clubs1 = useMemo(() => [...new Set(players.filter(p => p.league === lg1).map(p => p.club))].sort(), [players, lg1]);
  const clubs2 = useMemo(() => [...new Set(players.filter(p => p.league === lg2).map(p => p.club))].sort(), [players, lg2]);
  const pls1 = useMemo(() => players.filter(p => p.league === lg1 && p.club === c1).sort((a, b) => b.l5 - a.l5), [players, lg1, c1]);
  const pls2 = useMemo(() => players.filter(p => p.league === lg2 && p.club === c2).sort((a, b) => b.l5 - a.l5), [players, lg2, c2]);

  const opps1 = useMemo(() => teams.filter(t => t.league === lg1).map(t => t.name).sort(), [teams, lg1]);
  const opps2 = useMemo(() => teams.filter(t => t.league === lg2).map(t => t.name).sort(), [teams, lg2]);

  const sel1 = pls1.find(p => p.name === pn1);
  const sel2 = pls2.find(p => p.name === pn2);
  const opp1 = teams.find(t => t.name === o1);
  const opp2 = teams.find(t => t.name === o2);

  const d1 = sel1 && opp1 ? dScoreMatch(sel1, opp1, h1) : null;
  const d2 = sel2 && opp2 ? dScoreMatch(sel2, opp2, h2) : null;

  const ready = d1 !== null && d2 !== null;
  const winner = ready ? (d1 > d2 ? 1 : d2 > d1 ? 2 : 0) : null;

  const verdict = () => {
    if (!ready) return "";
    const best = Math.max(d1, d2);
    const delta = Math.abs(d1 - d2);
    if (best >= 75 && delta > 10) return "🔥 Pick évident !";
    if (best >= 75 && delta > 6) return "✅ Avantage net";
    if (best >= 75) return "🤝 Deux excellents picks !";
    if (best >= 65 && delta > 10) return "👍 Bon pick clair";
    if (best >= 65 && delta > 6) return "👍 Bon pick";
    if (best >= 65) return "⚖️ Match serré";
    if (best >= 55) return "🤔 Moyen — cherche mieux";
    return "❌ Évite ces deux";
  };

  return (
    <div style={{ padding: "0 16px 20px", maxWidth: 800, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {/* Side 1 */}
        <div style={{
          flex: 1, minWidth: 220, background: "rgba(255,255,255,0.02)",
          border: `1px solid ${winner === 1 ? "rgba(74,222,128,0.3)" : "rgba(255,255,255,0.06)"}`,
          borderRadius: 14, padding: 16,
          boxShadow: winner === 1 ? "0 0 30px rgba(74,222,128,0.1)" : "none",
        }}>
          <div style={{ display: "flex", gap: 4, marginBottom: 12, flexWrap: "wrap" }}>
            {["L1", "PL", "Liga", "Bundes"].map(l => (
              <button key={l} onClick={() => { setLg1(l); setC1(""); setPn1(""); setO1(""); }} style={{
                padding: "4px 10px", borderRadius: 8, fontSize: 11, border: "none", cursor: "pointer",
                fontFamily: "Outfit", fontWeight: 600,
                background: lg1 === l ? "rgba(99,102,241,0.15)" : "rgba(255,255,255,0.03)",
                color: lg1 === l ? "#A5B4FC" : "rgba(255,255,255,0.4)",
                outline: lg1 === l ? "1px solid rgba(99,102,241,0.3)" : "none",
              }}>{LEAGUE_FLAGS[l]} {l}</button>
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <Sel value={c1} onChange={v => { setC1(v); setPn1(""); }} options={clubs1} placeholder="Club..." />
            <Sel value={pn1} onChange={setPn1} options={pls1.map(p => p.name)} placeholder="Joueur..." />
            <Sel value={o1} onChange={setO1} options={opps1} placeholder="Adversaire..." />
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
            <button onClick={() => setH1(true)} style={{
              flex: 1, padding: "6px 0", borderRadius: 8, fontSize: 11, fontWeight: 600, border: "none",
              cursor: "pointer", fontFamily: "Outfit",
              background: h1 ? "rgba(74,222,128,0.15)" : "rgba(255,255,255,0.03)",
              color: h1 ? "#4ADE80" : "rgba(255,255,255,0.3)",
              outline: h1 ? "1px solid rgba(74,222,128,0.3)" : "none",
            }}>🏠 DOM</button>
            <button onClick={() => setH1(false)} style={{
              flex: 1, padding: "6px 0", borderRadius: 8, fontSize: 11, fontWeight: 600, border: "none",
              cursor: "pointer", fontFamily: "Outfit",
              background: !h1 ? "rgba(239,68,68,0.15)" : "rgba(255,255,255,0.03)",
              color: !h1 ? "#F87171" : "rgba(255,255,255,0.3)",
              outline: !h1 ? "1px solid rgba(239,68,68,0.3)" : "none",
            }}>✈️ EXT</button>
          </div>
          {sel1 && d1 !== null && (
            <div style={{ textAlign: "center", marginTop: 16 }}>
              <div style={{ display: "flex", justifyContent: "center" }}><Badge score={d1} /></div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginTop: 8 }}>{sel1.name}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{sel1.position} · {sel1.archetype}</div>
              <div style={{ display: "flex", justifyContent: "center", marginTop: 8 }}><Bars scores={sel1.last_5} /></div>
            </div>
          )}
        </div>

        {/* VS */}
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          minWidth: 50, padding: "20px 0",
        }}>
          <div style={{
            fontSize: 28, fontWeight: 900, color: "#6366F1",
            textShadow: "0 0 20px rgba(99,102,241,0.5)", fontFamily: "Outfit",
          }}>VS</div>
        </div>

        {/* Side 2 */}
        <div style={{
          flex: 1, minWidth: 220, background: "rgba(255,255,255,0.02)",
          border: `1px solid ${winner === 2 ? "rgba(74,222,128,0.3)" : "rgba(255,255,255,0.06)"}`,
          borderRadius: 14, padding: 16,
          boxShadow: winner === 2 ? "0 0 30px rgba(74,222,128,0.1)" : "none",
        }}>
          <div style={{ display: "flex", gap: 4, marginBottom: 12, flexWrap: "wrap" }}>
            {["L1", "PL", "Liga", "Bundes"].map(l => (
              <button key={l} onClick={() => { setLg2(l); setC2(""); setPn2(""); setO2(""); }} style={{
                padding: "4px 10px", borderRadius: 8, fontSize: 11, border: "none", cursor: "pointer",
                fontFamily: "Outfit", fontWeight: 600,
                background: lg2 === l ? "rgba(99,102,241,0.15)" : "rgba(255,255,255,0.03)",
                color: lg2 === l ? "#A5B4FC" : "rgba(255,255,255,0.4)",
                outline: lg2 === l ? "1px solid rgba(99,102,241,0.3)" : "none",
              }}>{LEAGUE_FLAGS[l]} {l}</button>
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <Sel value={c2} onChange={v => { setC2(v); setPn2(""); }} options={clubs2} placeholder="Club..." />
            <Sel value={pn2} onChange={setPn2} options={pls2.map(p => p.name)} placeholder="Joueur..." />
            <Sel value={o2} onChange={setO2} options={opps2} placeholder="Adversaire..." />
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
            <button onClick={() => setH2(true)} style={{
              flex: 1, padding: "6px 0", borderRadius: 8, fontSize: 11, fontWeight: 600, border: "none",
              cursor: "pointer", fontFamily: "Outfit",
              background: h2 ? "rgba(74,222,128,0.15)" : "rgba(255,255,255,0.03)",
              color: h2 ? "#4ADE80" : "rgba(255,255,255,0.3)",
              outline: h2 ? "1px solid rgba(74,222,128,0.3)" : "none",
            }}>🏠 DOM</button>
            <button onClick={() => setH2(false)} style={{
              flex: 1, padding: "6px 0", borderRadius: 8, fontSize: 11, fontWeight: 600, border: "none",
              cursor: "pointer", fontFamily: "Outfit",
              background: !h2 ? "rgba(239,68,68,0.15)" : "rgba(255,255,255,0.03)",
              color: !h2 ? "#F87171" : "rgba(255,255,255,0.3)",
              outline: !h2 ? "1px solid rgba(239,68,68,0.3)" : "none",
            }}>✈️ EXT</button>
          </div>
          {sel2 && d2 !== null && (
            <div style={{ textAlign: "center", marginTop: 16 }}>
              <div style={{ display: "flex", justifyContent: "center" }}><Badge score={d2} /></div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginTop: 8 }}>{sel2.name}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{sel2.position} · {sel2.archetype}</div>
              <div style={{ display: "flex", justifyContent: "center", marginTop: 8 }}><Bars scores={sel2.last_5} /></div>
            </div>
          )}
        </div>
      </div>

      {/* Comparison */}
      {ready && (
        <div style={{
          marginTop: 20, background: "rgba(255,255,255,0.02)", borderRadius: 14,
          border: "1px solid rgba(255,255,255,0.06)", padding: 20,
        }}>
          <div style={{ textAlign: "center", fontSize: 18, fontWeight: 700, color: "#fff", marginBottom: 16 }}>
            {verdict()}
          </div>
          <StatRow label="D-Score" v1={d1} v2={d2} />
          <StatRow label="L5" v1={sel1.l5} v2={sel2.l5} />
          <StatRow label="AA5" v1={sel1.aa5} v2={sel2.aa5} />
          <StatRow label="Floor" v1={sel1.floor} v2={sel2.floor} />
          <StatRow label="Ceiling" v1={sel1.ceiling} v2={sel2.ceiling} />
          <StatRow label="Rég%" v1={sel1.regularite} v2={sel2.regularite} />
          <StatRow label="DS%" v1={sel1.ds_rate} v2={sel2.ds_rate} />
          <StatRow label="G+A/m" v1={sel1.ga_per_match} v2={sel2.ga_per_match} />
        </div>
      )}
    </div>
  );
}
