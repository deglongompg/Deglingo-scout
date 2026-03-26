import { dsColor, dsBg, POSITION_COLORS, getArchetypeColor, getAAProfile } from "../utils/colors";
import RadarChart from "./RadarChart";
import MiniGraph from "./MiniGraph";

export default function PlayerCard({ player, onClose, logos = {}, radarMax }) {
  const p = player;
  const posCol = POSITION_COLORS[p.position] || "#6B7280";
  const archCol = getArchetypeColor(p.archetype);

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      background: "rgba(4,4,15,0.92)", backdropFilter: "blur(20px)",
      zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center",
      padding: "20px",
    }} onClick={onClose}>
      <div style={{
        background: "linear-gradient(170deg, #0C0C2D, #080820)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 16, padding: 28, maxWidth: 460, width: "100%",
        maxHeight: "90vh", overflowY: "auto",
      }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#fff" }}>{p.name}</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginTop: 2, display: "flex", alignItems: "center", gap: 5 }}>
              {logos[p.club] && <img src={`/data/logos/${logos[p.club]}`} alt="" style={{ width: 16, height: 16, objectFit: "contain" }} />}
              {p.club}
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
              <span style={{
                padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600,
                background: `${posCol}22`, color: posCol, border: `1px solid ${posCol}44`,
              }}>{p.position}</span>
              <span style={{
                padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600,
                background: `${archCol}22`, color: archCol, border: `1px solid ${archCol}44`,
              }}>{p.archetype}</span>
              {(() => { const pr = getAAProfile(p); return <span title={pr.desc} style={{
                padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600,
                background: `${pr.color}22`, color: pr.color, border: `1px solid ${pr.color}44`,
              }}>{pr.emoji} {pr.label}</span>; })()}
            </div>
          </div>
          <button onClick={onClose} style={{
            background: "rgba(255,255,255,0.06)", border: "none", color: "#fff",
            width: 32, height: 32, borderRadius: 8, cursor: "pointer", fontSize: 16,
          }}>✕</button>
        </div>

        {/* Key Stats — single row */}
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 4, marginBottom: 8,
        }}>
          {[
            { label: "L5", value: p.l5, color: dsColor(p.l5) },
            { label: "AA5", value: p.aa5, color: "#A5B4FC" },
            { label: "Floor", value: p.floor, color: dsColor(p.floor) },
            { label: "Ceil", value: p.ceiling, color: dsColor(p.ceiling) },
            { label: "Rég%", value: `${p.regularite}%`, color: "#fff" },
          ].map(s => (
            <div key={s.label} style={{
              background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "6px 2px",
              textAlign: "center", border: "1px solid rgba(255,255,255,0.04)",
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: s.color, fontFamily: "DM Mono" }}>{s.value}</div>
              <div style={{ fontSize: 8, color: "rgba(255,255,255,0.4)", marginTop: 1 }}>{s.label}</div>
            </div>
          ))}
        </div>
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 4, marginBottom: 12,
        }}>
          {[
            { label: "DS%", value: `${p.ds_rate}%` },
            { label: "G+A/m", value: p.ga_per_match },
            { label: "DOM", value: p.avg_dom },
            { label: "EXT", value: p.avg_ext },
            { label: "Apps", value: p.appearances },
          ].map(s => (
            <div key={s.label} style={{
              background: "rgba(255,255,255,0.02)", borderRadius: 8, padding: "6px 2px",
              textAlign: "center", border: "1px solid rgba(255,255,255,0.03)",
            }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#fff", fontFamily: "DM Mono" }}>{s.value}</div>
              <div style={{ fontSize: 8, color: "rgba(255,255,255,0.35)", marginTop: 1 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Radar + AA Breakdown */}
        <div style={{ display: "flex", gap: 12, justifyContent: "center", alignItems: "flex-start" }}>
          <div style={{ textAlign: "center", flex: "0 0 auto", overflow: "visible" }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginBottom: 4, fontWeight: 600 }}>Radar All Around</div>
            <RadarChart player={p} size={160} maxValues={radarMax} />
          </div>
          <div style={{ flex: "1 1 auto", minWidth: 0 }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginBottom: 8, fontWeight: 600 }}>Comment il fait son AA ?</div>
            {(() => {
              const cats = [
                { key: "aa_defending", label: "🛡️ Défense", desc: "Tacles, blocks, clean sheet", color: "#3B82F6" },
                { key: "aa_passing", label: "🎯 Passes", desc: "Passes réussies, longues, clés", color: "#8B5CF6" },
                { key: "aa_possession", label: "⚡ Possession", desc: "Interceptions, duels, récups", color: "#06B6D4" },
                { key: "aa_attacking", label: "🔥 Attaque", desc: "Tirs, dribbles, entrées surface", color: "#EF4444" },
                { key: "aa_negative", label: "⚠️ Général", desc: "Fautes, cartons, fautes subies", color: "#F59E0B", allowNeg: true },
              ];
              const rawTotal = cats.reduce((s, c) => s + (c.allowNeg ? (p[c.key] || 0) : Math.max(0, p[c.key] || 0)), 0);
              const aa5 = p.aa5 || 0;
              const scale = rawTotal > 0 ? aa5 / rawTotal : 0;
              const maxBar = Math.max(...cats.filter(c => !c.allowNeg).map(c => Math.max(0, p[c.key] || 0) * scale), 1);
              return cats.map(cat => {
                const raw = cat.allowNeg ? (p[cat.key] || 0) : Math.max(0, p[cat.key] || 0);
                const scaled = Math.round(raw * scale * 10) / 10;
                const absPct = Math.min(Math.abs(scaled) / maxBar * 100, 100);
                const isNeg = scaled < 0;
                return (
                  <div key={cat.key} style={{ marginBottom: 6 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                      <span style={{ fontSize: 10, color: "rgba(255,255,255,0.7)" }}>{cat.label}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: isNeg ? "#EF4444" : cat.color, fontFamily: "DM Mono" }}>{scaled.toFixed(1)}</span>
                    </div>
                    <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 4, height: 6, overflow: "hidden" }}>
                      <div style={{ width: `${absPct}%`, height: "100%", background: isNeg ? "#EF444488" : cat.color, borderRadius: 4, transition: "width 0.3s" }} />
                    </div>
                    <div style={{ fontSize: 8, color: "rgba(255,255,255,0.25)", marginTop: 1 }}>{cat.desc}</div>
                  </div>
                );
              });
            })()}
            <div style={{ marginTop: 8, padding: "6px 8px", background: "rgba(99,102,241,0.08)", borderRadius: 8, border: "1px solid rgba(99,102,241,0.15)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>AA5 = Score complet / match</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#A5B4FC", fontFamily: "DM Mono" }}>{p.aa5}</span>
              </div>
              <div style={{ fontSize: 8, color: "rgba(255,255,255,0.25)", marginTop: 2 }}>
                Score Sorare ≈ 35 base + décisif + AA
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
