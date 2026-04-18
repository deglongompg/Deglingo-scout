import React from "react";

/**
 * Skyrocket Gauge — Minimal Glass + Aurora Boréale
 * Echelle non-lineaire : 0-200 compresse en bas (18%), 200-maxPalier elargi (18%->95%)
 *
 * Props:
 *  - score : valeur courante (number)
 *  - paliers : array de { pts, reward?, color?, silver? } trie ascendant
 *  - height : min-height du body (default 280)
 *  - width  : largeur de la colonne (default 70)
 */

const AURORA_FILL =
  "linear-gradient(0deg, rgba(67,56,202,0.5) 0%, rgba(67,56,202,0.5) 18%, rgba(99,102,241,0.55) 40%, rgba(56,189,248,0.6) 62%, rgba(45,212,191,0.65) 73%, rgba(110,231,183,0.7) 84%, rgba(220,252,231,0.85) 95%)";
const TOP_HIGHLIGHT = "rgba(220,252,231,0.95)";
const GLOW = "rgba(110,231,183,0.7)";

// Courbe Pro Limited de base. Pour Pro Rare, multiplier par 1.10 (cartes Rare ont bonus +10%).
// 0=0% / 280=20% / 360=30% / 380=45% / 400=60% / 420=75% / 460=90% / 510+=100%
const BASE_CONTROL_POINTS = [
  [0, 0],
  [280, 20],
  [360, 30],
  [380, 45],
  [400, 60],
  [420, 75],
  [460, 90],
  [510, 100],
];
function makeValueToPos(scoreMultiplier = 1.0) {
  const points = BASE_CONTROL_POINTS.map(([x, y]) => [x * scoreMultiplier, y]);
  const cap = points[points.length - 1][0];
  return function valueToPos(v) {
    if (v <= 0) return 0;
    if (v >= cap) return 100;
    for (let i = 0; i < points.length - 1; i++) {
      const [x1, y1] = points[i];
      const [x2, y2] = points[i + 1];
      if (v >= x1 && v <= x2) {
        return y1 + ((v - x1) / (x2 - x1)) * (y2 - y1);
      }
    }
    return 100;
  };
}

const KEYFRAMES = `
@keyframes skrPrismFlow { 0% { background-position: 0 0; } 100% { background-position: 12px 12px; } }
@keyframes skrFloatUp { 0%, 100% { transform: translateY(0); opacity: 1; } 50% { transform: translateY(-3px); opacity: 0.6; } }
@keyframes skrShimmerText { 0% { background-position: 0% 50%; } 100% { background-position: 200% 50%; } }
`;

export default function SkyrocketGauge({ score = 0, projectedScore = null, initialScore = null, paliers = [], showRewards = false, scoreMultiplier = 1.0, topRewardColor = null, height = 280, width = 70 }) {
  const valueToPos = makeValueToPos(scoreMultiplier);
  const sortedPaliers = [...(paliers || [])].sort((a, b) => (a.pts || 0) - (b.pts || 0));
  const minPalier = sortedPaliers.length > 0 ? sortedPaliers[0].pts : 200;
  const maxPalier = sortedPaliers.length > 0 ? sortedPaliers[sortedPaliers.length - 1].pts : 500;
  const midIdx = Math.max(0, Math.floor((sortedPaliers.length - 1) / 2));
  const midPalier = sortedPaliers.length > 0 ? sortedPaliers[midIdx].pts : (minPalier + maxPalier) / 2;
  const fillHeight = valueToPos(score);
  // Projected fill (matches non joues encore predits) — hauteur additive jusqu'au projected
  const hasProjection = projectedScore != null && projectedScore > score + 0.5;
  const projectedFillHeight = hasProjection ? valueToPos(projectedScore) : fillHeight;
  // Palier suivant (cible immediate, basee sur le score live)
  const nextPalier = sortedPaliers.find(p => (p.pts || 0) > score);
  const ptsToNext = nextPalier ? Math.max(0, nextPalier.pts - score) : 0;

  return (
    <div style={{ width, position: "relative", paddingTop: 36, paddingBottom: 4, flexShrink: 0 }}>
      <style>{KEYFRAMES}</style>

      {/* Score live + projection + initiale */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, textAlign: "center" }}>
        <div style={{
          fontFamily: "'Outfit', sans-serif",
          fontSize: 22, fontWeight: 900,
          background: "linear-gradient(135deg, #C4B5FD, #67E8F9, #6EE7B7, #DCFCE7)",
          backgroundSize: "200% 100%",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
          animation: "skrShimmerText 3s linear infinite",
          lineHeight: 1, textShadow: "0 0 12px rgba(196,181,253,0.5)",
        }}>{Math.round(score)}</div>
        {hasProjection ? (
          <div style={{
            fontSize: 8, fontWeight: 700, color: "rgba(196,181,253,0.7)",
            fontFamily: "'DM Mono', monospace", lineHeight: 1, marginTop: 3,
            letterSpacing: 0.3,
          }}>→ {Math.round(projectedScore)} <span style={{ opacity: 0.6 }}>proj</span></div>
        ) : nextPalier ? (
          <div style={{
            fontSize: 8, fontWeight: 700, color: "rgba(255,255,255,0.55)",
            fontFamily: "'DM Mono', monospace", lineHeight: 1, marginTop: 3,
            letterSpacing: 0.3,
          }}>+{Math.round(ptsToNext)} <span style={{ color: "#FBBF24", animation: "skrFloatUp 1.5s ease-in-out infinite", display: "inline-block" }}>↑</span></div>
        ) : (
          <div style={{ fontSize: 11, color: "#FBBF24", animation: "skrFloatUp 1.5s ease-in-out infinite", lineHeight: 1, marginTop: 2 }}>↑</div>
        )}
        {initialScore != null && Math.abs(initialScore - (projectedScore != null ? projectedScore : score)) > 1 && (
          <div style={{
            fontSize: 7, fontWeight: 600, color: "rgba(255,255,255,0.3)",
            fontFamily: "'DM Mono', monospace", lineHeight: 1, marginTop: 3,
            letterSpacing: 0.2,
          }}>init {Math.round(initialScore)}</div>
        )}
      </div>

      {/* Body */}
      <div style={{
        position: "relative", width: "100%", height: "100%", minHeight: height,
        borderRadius: "10px 10px 6px 6px",
        background: "linear-gradient(180deg, rgba(10,5,30,0.95), rgba(20,10,60,0.95))",
        border: "1px solid rgba(196,181,253,0.4)",
        overflow: "hidden",
        boxShadow: "0 0 14px rgba(139,92,246,0.3), inset 0 0 18px rgba(139,92,246,0.15)",
      }}>
        {/* Fill projection (zone ghost entre live et projected) — derriere */}
        {hasProjection && (
          <div style={{
            position: "absolute", inset: 0,
            background: AURORA_FILL,
            opacity: 0.3,
            clipPath: `inset(${Math.max(0, 100 - projectedFillHeight)}% 0 ${fillHeight}% 0)`,
            transition: "clip-path 1.2s cubic-bezier(0.34, 1.56, 0.64, 1)",
          }}>
            <div style={{
              position: "absolute", inset: 0,
              background: "repeating-linear-gradient(45deg, rgba(255,255,255,0.18) 0px, rgba(255,255,255,0.18) 2px, transparent 2px, transparent 8px)",
              animation: "skrPrismFlow 3s linear infinite",
            }} />
          </div>
        )}

        {/* Fill LIVE Aurora — couleurs FIXES (clip-path, ne stretche pas) */}
        <div style={{
          position: "absolute", inset: 0,
          background: AURORA_FILL,
          clipPath: `inset(${Math.max(0, 100 - fillHeight)}% 0 0 0)`,
          transition: "clip-path 1.2s cubic-bezier(0.34, 1.56, 0.64, 1)",
        }}>
          <div style={{
            position: "absolute", inset: 0,
            background: "repeating-linear-gradient(45deg, rgba(255,255,255,0.06) 0px, rgba(255,255,255,0.06) 2px, transparent 2px, transparent 6px)",
            animation: "skrPrismFlow 3s linear infinite",
          }} />
        </div>

        {/* Top edge highlight (au sommet du fill LIVE) */}
        <div style={{
          position: "absolute", left: 0, right: 0,
          bottom: `${fillHeight}%`, height: 3,
          background: `linear-gradient(180deg, ${TOP_HIGHLIGHT}, transparent)`,
          boxShadow: `0 0 12px ${GLOW}`,
          zIndex: 2,
          transition: "bottom 1.2s cubic-bezier(0.34, 1.56, 0.64, 1)",
        }} />

        {/* Marqueur projected (top edge du fill ghost) */}
        {hasProjection && (
          <div style={{
            position: "absolute", left: 0, right: 0,
            bottom: `${projectedFillHeight}%`, height: 1,
            borderTop: "1px dashed rgba(196,181,253,0.5)",
            zIndex: 2,
          }} />
        )}

        {/* Rewards en fond des zones (minimaliste, transparent) — uniquement si showRewards */}
        {showRewards && sortedPaliers.map((p, i) => {
          if (!p.reward) return null;
          const pos = valueToPos(p.pts);
          // Pour le dernier palier (top reward 1000$) on utilise toute la zone de headroom (jusqu'a 100%)
          const nextPos = i < sortedPaliers.length - 1
            ? valueToPos(sortedPaliers[i + 1].pts)
            : 100;
          const midPos = (pos + nextPos) / 2;
          const isTopReward = i === sortedPaliers.length - 1;
          const rewardColor = isTopReward && topRewardColor ? topRewardColor : "rgba(255,255,255,0.28)";
          const rewardWeight = isTopReward && topRewardColor ? 900 : 800;
          const rewardShadow = isTopReward && topRewardColor ? `0 0 6px ${topRewardColor}, 0 0 3px rgba(0,0,0,0.7)` : "0 0 3px rgba(0,0,0,0.6)";
          return (
            <div key={p.pts + "_reward"} style={{
              position: "absolute", left: 0, right: 0,
              bottom: `${midPos}%`,
              transform: "translateY(50%)",
              textAlign: "center",
              fontSize: isTopReward && topRewardColor ? 10 : 8,
              fontWeight: rewardWeight,
              color: rewardColor,
              fontFamily: "'Outfit', sans-serif",
              letterSpacing: "0.04em",
              pointerEvents: "none",
              zIndex: 1,
              textShadow: rewardShadow,
            }}>{p.reward}</div>
          );
        })}

        {/* Paliers : tous identiques (lignes fines + chiffres outline blanc subtil) */}
        {sortedPaliers.map((p) => {
          const pos = valueToPos(p.pts);
          return (
            <React.Fragment key={p.pts}>
              <div style={{
                position: "absolute",
                left: 6, right: 6,
                bottom: `${pos}%`,
                height: 1,
                background: "rgba(255,255,255,0.18)",
                zIndex: 3,
              }} />
              <div style={{
                position: "absolute", left: 0, right: 0,
                bottom: `calc(${pos}% - 7px)`,
                textAlign: "center",
                fontSize: 10, fontWeight: 700,
                color: "rgba(255,255,255,0.55)",
                fontFamily: "'DM Mono', monospace",
                zIndex: 4, letterSpacing: "0.5px",
                textShadow: "0 0 6px rgba(0,0,0,0.95), 0 0 6px rgba(0,0,0,0.95)",
              }}>{p.pts}</div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
