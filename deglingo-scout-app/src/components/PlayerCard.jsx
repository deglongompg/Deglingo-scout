import { dsColor, dsBg, POSITION_COLORS, getArchetypeColor } from "../utils/colors";
import RadarChart from "./RadarChart";
import MiniGraph from "./MiniGraph";

export default function PlayerCard({ player, onClose }) {
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
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>{p.club}</div>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <span style={{
                padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600,
                background: `${posCol}22`, color: posCol, border: `1px solid ${posCol}44`,
              }}>{p.position}</span>
              <span style={{
                padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600,
                background: `${archCol}22`, color: archCol, border: `1px solid ${archCol}44`,
              }}>{p.archetype}</span>
            </div>
          </div>
          <button onClick={onClose} style={{
            background: "rgba(255,255,255,0.06)", border: "none", color: "#fff",
            width: 32, height: 32, borderRadius: 8, cursor: "pointer", fontSize: 16,
          }}>✕</button>
        </div>

        {/* Key Stats */}
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 20,
        }}>
          {[
            { label: "L5", value: p.l5, color: dsColor(p.l5) },
            { label: "AA5", value: p.aa5, color: "#A5B4FC" },
            { label: "Floor", value: p.floor, color: dsColor(p.floor) },
            { label: "Ceiling", value: p.ceiling, color: dsColor(p.ceiling) },
          ].map(s => (
            <div key={s.label} style={{
              background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: "10px 6px",
              textAlign: "center", border: "1px solid rgba(255,255,255,0.04)",
            }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: s.color, fontFamily: "DM Mono" }}>{s.value}</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Secondary stats */}
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 20,
        }}>
          {[
            { label: "Rég%", value: `${p.regularite}%` },
            { label: "DS%", value: `${p.ds_rate}%` },
            { label: "G+A/m", value: p.ga_per_match },
            { label: "DOM", value: p.avg_dom },
            { label: "EXT", value: p.avg_ext },
            { label: "Apps", value: p.appearances },
          ].map(s => (
            <div key={s.label} style={{
              background: "rgba(255,255,255,0.02)", borderRadius: 8, padding: "8px 4px",
              textAlign: "center", border: "1px solid rgba(255,255,255,0.03)",
            }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", fontFamily: "DM Mono" }}>{s.value}</div>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", marginTop: 1 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Radar + L5 Graph */}
        <div style={{ display: "flex", gap: 12, justifyContent: "center", alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>Radar AA</div>
            <RadarChart player={p} size={180} />
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>5 derniers matchs</div>
            <MiniGraph scores={p.last_5} width={160} height={60} />
          </div>
        </div>
      </div>
    </div>
  );
}
