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
const AURORA_TOP = "rgba(220,252,231,0.95)";
const AURORA_GLOW = "rgba(110,231,183,0.7)";
const AURORA_TEXT = "linear-gradient(135deg, #C4B5FD, #67E8F9, #6EE7B7, #DCFCE7)";
const AURORA_TEXT_SHADOW = "0 0 12px rgba(196,181,253,0.5)";
const AURORA_BORDER = "rgba(196,181,253,0.4)";
const AURORA_BOX_SHADOW = "0 0 14px rgba(139,92,246,0.3), inset 0 0 18px rgba(139,92,246,0.15)";
const AURORA_PROJ_COLOR = "rgba(196,181,253,0.7)";
const AURORA_BG = "linear-gradient(180deg, rgba(10,5,30,0.95), rgba(20,10,60,0.95))";

// Pro Rare : fill rouge sang (burgundy → rouge → orangé incandescent au top)
const RARE_FILL =
  "linear-gradient(0deg, rgba(76,5,25,0.55) 0%, rgba(120,10,35,0.55) 18%, rgba(185,28,28,0.6) 40%, rgba(220,38,38,0.65) 62%, rgba(239,68,68,0.7) 73%, rgba(251,146,60,0.75) 84%, rgba(254,215,170,0.9) 95%)";
const RARE_TOP = "rgba(254,215,170,0.95)";
const RARE_GLOW = "rgba(239,68,68,0.75)";
const RARE_TEXT = "linear-gradient(135deg, #FCA5A5, #F87171, #FB923C, #FED7AA)";
const RARE_TEXT_SHADOW = "0 0 12px rgba(248,113,113,0.55)";
const RARE_BORDER = "rgba(248,113,113,0.45)";
const RARE_BOX_SHADOW = "0 0 14px rgba(220,38,38,0.35), inset 0 0 18px rgba(185,28,28,0.2)";
const RARE_PROJ_COLOR = "rgba(252,165,165,0.75)";
const RARE_BG = "linear-gradient(180deg, rgba(30,3,10,0.96), rgba(60,8,20,0.95))";

// Pro Limited : fill jaune/orange/gold (amber sombre → orange → gold vif au top)
const LIMITED_FILL =
  "linear-gradient(0deg, rgba(120,53,15,0.55) 0%, rgba(146,64,14,0.55) 18%, rgba(180,83,9,0.6) 40%, rgba(217,119,6,0.65) 62%, rgba(245,158,11,0.7) 73%, rgba(251,191,36,0.78) 84%, rgba(254,240,138,0.92) 95%)";
const LIMITED_TOP = "rgba(254,240,138,0.95)";
const LIMITED_GLOW = "rgba(251,191,36,0.8)";
const LIMITED_TEXT = "linear-gradient(135deg, #FCD34D, #FBBF24, #F59E0B, #FDE68A)";
const LIMITED_TEXT_SHADOW = "0 0 12px rgba(251,191,36,0.55)";
const LIMITED_BORDER = "rgba(251,191,36,0.45)";
const LIMITED_BOX_SHADOW = "0 0 14px rgba(217,119,6,0.35), inset 0 0 18px rgba(146,64,14,0.2)";
const LIMITED_PROJ_COLOR = "rgba(252,211,77,0.75)";
const LIMITED_BG = "linear-gradient(180deg, rgba(30,15,3,0.96), rgba(60,30,8,0.95))";

function getPalette(rarity) {
  if (rarity === "rare") {
    return {
      fill: RARE_FILL, top: RARE_TOP, glow: RARE_GLOW,
      text: RARE_TEXT, textShadow: RARE_TEXT_SHADOW,
      border: RARE_BORDER, boxShadow: RARE_BOX_SHADOW,
      projColor: RARE_PROJ_COLOR, bg: RARE_BG,
    };
  }
  if (rarity === "limited") {
    return {
      fill: LIMITED_FILL, top: LIMITED_TOP, glow: LIMITED_GLOW,
      text: LIMITED_TEXT, textShadow: LIMITED_TEXT_SHADOW,
      border: LIMITED_BORDER, boxShadow: LIMITED_BOX_SHADOW,
      projColor: LIMITED_PROJ_COLOR, bg: LIMITED_BG,
    };
  }
  return {
    fill: AURORA_FILL, top: AURORA_TOP, glow: AURORA_GLOW,
    text: AURORA_TEXT, textShadow: AURORA_TEXT_SHADOW,
    border: AURORA_BORDER, boxShadow: AURORA_BOX_SHADOW,
    projColor: AURORA_PROJ_COLOR, bg: AURORA_BG,
  };
}

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

// Mode lineaire : paliers equidistants entre 15% et 90% (laisse un headroom pour que le label du top tier reste lisible)
// Ex Stellar : 280=15% / 320=30% / 360=45% / 400=60% / 440=75% / 480=90%
// Score sous min palier : rampe lineaire 0 → 15%
// Score au-dessus du max palier : rampe lineaire 90% → 100% (au prorata, plafond 110% du range)
function makeLinearValueToPos(sortedPaliers, maxPos = 90) {
  if (!sortedPaliers || sortedPaliers.length < 2) {
    return (v) => Math.max(0, Math.min(100, (v / 500) * 100));
  }
  const minPts = sortedPaliers[0].pts;
  const maxPts = sortedPaliers[sortedPaliers.length - 1].pts;
  const MIN_POS = 15;
  const MAX_POS = maxPos;
  const range = maxPts - minPts;
  return function valueToPos(v) {
    if (v <= 0) return 0;
    if (v <= minPts) return (v / minPts) * MIN_POS;
    if (v >= maxPts) {
      if (MAX_POS >= 100) return 100;
      const overflow = Math.min(1, (v - maxPts) / (range * 0.5));
      return MAX_POS + overflow * (100 - MAX_POS);
    }
    return MIN_POS + ((v - minPts) / range) * (MAX_POS - MIN_POS);
  };
}

const KEYFRAMES = `
@keyframes skrPrismFlow { 0% { background-position: 0 0; } 100% { background-position: 12px 12px; } }
@keyframes skrFloatUp { 0%, 100% { transform: translateY(0); opacity: 1; } 50% { transform: translateY(-3px); opacity: 0.6; } }
@keyframes skrShimmerText { 0% { background-position: 0% 50%; } 100% { background-position: 200% 50%; } }
@keyframes skrWaveSlide { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
@keyframes skrWaveSlide2 { 0% { transform: translateX(-50%); } 100% { transform: translateX(0); } }
@keyframes skrBubbleRise { 0% { transform: translateY(0) scale(0.6); opacity: 0; } 15% { opacity: 0.5; } 80% { opacity: 0.3; } 100% { transform: translateY(-70px) scale(1); opacity: 0; } }
@keyframes skrGloss { 0%, 100% { opacity: 0.25; } 50% { opacity: 0.5; } }
`;

export default function SkyrocketGauge({ score = 0, projectedScore = null, initialScore = null, paliers = [], showRewards = false, scoreMultiplier = 1.0, topRewardColor = null, rarity = null, scaleMode = "control-points", maxPos = 90, height = 280, width = 70 }) {
  const palette = getPalette(rarity);
  const sortedPaliers = [...(paliers || [])].sort((a, b) => (a.pts || 0) - (b.pts || 0));
  const valueToPos = scaleMode === "linear"
    ? makeLinearValueToPos(sortedPaliers, maxPos)
    : makeValueToPos(scoreMultiplier);
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
          background: palette.text,
          backgroundSize: "200% 100%",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
          animation: "skrShimmerText 3s linear infinite",
          lineHeight: 1, textShadow: palette.textShadow,
        }}>{Math.round(score)}</div>
        {hasProjection ? (
          <div style={{
            fontSize: 8, fontWeight: 700, color: palette.projColor,
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

      {/* Body — wrappee dans gauge-premium pour bevel gold + reflets premium */}
      <div className="gauge-premium" style={{ minHeight: height + 4 }}>
      <div style={{
        position: "relative", width: "100%", height: "100%", minHeight: height,
        borderRadius: "8px 8px 4px 4px",
        background: palette.bg,
        overflow: "hidden",
        boxShadow: palette.boxShadow,
      }}>
        {/* Fill projection (zone ghost entre live et projected) — derriere, vide et subtil */}
        {hasProjection && (
          <div style={{
            position: "absolute", inset: 0,
            background: palette.fill,
            opacity: 0.18,
            clipPath: `inset(${Math.max(0, 100 - projectedFillHeight)}% 0 ${fillHeight}% 0)`,
            transition: "clip-path 1.2s cubic-bezier(0.34, 1.56, 0.64, 1)",
            filter: "saturate(0.6)",
          }} />
        )}

        {/* Fill LIVE — couleurs FIXES (clip-path, ne stretche pas), liquide plein */}
        <div style={{
          position: "absolute", inset: 0,
          background: palette.fill,
          clipPath: `inset(${Math.max(0, 100 - fillHeight)}% 0 0 0)`,
          transition: "clip-path 1.2s cubic-bezier(0.34, 1.56, 0.64, 1)",
        }}>
          {/* Gloss interieur — reflet vertical qui donne profondeur */}
          <div style={{
            position: "absolute", inset: 0,
            background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.18) 15%, rgba(255,255,255,0.08) 50%, transparent 85%)",
            animation: "skrGloss 4s ease-in-out infinite",
            pointerEvents: "none",
          }} />
          {/* Bulles qui montent */}
          <div style={{
            position: "absolute", left: "25%", bottom: 0, width: 4, height: 4, borderRadius: "50%",
            background: `radial-gradient(circle, ${palette.top} 0%, transparent 70%)`,
            animation: "skrBubbleRise 5s ease-in infinite",
            animationDelay: "0s",
            pointerEvents: "none",
          }} />
          <div style={{
            position: "absolute", left: "65%", bottom: 0, width: 3, height: 3, borderRadius: "50%",
            background: `radial-gradient(circle, ${palette.top} 0%, transparent 70%)`,
            animation: "skrBubbleRise 6s ease-in infinite",
            animationDelay: "1.2s",
            pointerEvents: "none",
          }} />
          <div style={{
            position: "absolute", left: "45%", bottom: 0, width: 2, height: 2, borderRadius: "50%",
            background: `radial-gradient(circle, ${palette.top} 0%, transparent 70%)`,
            animation: "skrBubbleRise 4.5s ease-in infinite",
            animationDelay: "2.2s",
            pointerEvents: "none",
          }} />
          <div style={{
            position: "absolute", left: "78%", bottom: 0, width: 3, height: 3, borderRadius: "50%",
            background: `radial-gradient(circle, ${palette.top} 0%, transparent 70%)`,
            animation: "skrBubbleRise 5.5s ease-in infinite",
            animationDelay: "0.6s",
            pointerEvents: "none",
          }} />
          <div style={{
            position: "absolute", left: "15%", bottom: 0, width: 2, height: 2, borderRadius: "50%",
            background: `radial-gradient(circle, ${palette.top} 0%, transparent 70%)`,
            animation: "skrBubbleRise 4s ease-in infinite",
            animationDelay: "3.2s",
            pointerEvents: "none",
          }} />
          <div style={{
            position: "absolute", left: "55%", bottom: 0, width: 2.5, height: 2.5, borderRadius: "50%",
            background: `radial-gradient(circle, ${palette.top} 0%, transparent 70%)`,
            animation: "skrBubbleRise 5.8s ease-in infinite",
            animationDelay: "4s",
            pointerEvents: "none",
          }} />
        </div>

        {/* Surface liquide ondulee — SVG waves animes */}
        <div style={{
          position: "absolute", left: 0, right: 0,
          bottom: `${fillHeight}%`,
          height: 10,
          zIndex: 2,
          transition: "bottom 1.2s cubic-bezier(0.34, 1.56, 0.64, 1)",
          pointerEvents: "none",
          overflow: "visible",
        }}>
          {/* Vague arriere (plus lente, plus pale) */}
          <svg viewBox="0 0 200 10" preserveAspectRatio="none" style={{
            position: "absolute", top: -3, left: 0, width: "200%", height: 10,
            animation: "skrWaveSlide2 6s linear infinite",
            opacity: 0.5,
          }}>
            <path d="M0,6 Q25,2 50,6 T100,6 T150,6 T200,6 L200,10 L0,10 Z" fill={palette.top} />
          </svg>
          {/* Vague avant (plus rapide, plus brillante) */}
          <svg viewBox="0 0 200 10" preserveAspectRatio="none" style={{
            position: "absolute", top: 0, left: 0, width: "200%", height: 10,
            animation: "skrWaveSlide 3.5s linear infinite",
            filter: `drop-shadow(0 0 6px ${palette.glow})`,
          }}>
            <path d="M0,5 Q25,1 50,5 T100,5 T150,5 T200,5 L200,10 L0,10 Z" fill={palette.top} />
          </svg>
        </div>

        {/* Marqueur projected (top edge du fill ghost) — fin trait plein */}
        {hasProjection && (
          <div style={{
            position: "absolute", left: 0, right: 0,
            bottom: `${projectedFillHeight}%`, height: 1,
            background: palette.projColor,
            zIndex: 2,
            opacity: 0.6,
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
          // Parse reward string : detecte essence / gems / $ pour afficher icone + nombre
          const rewardStr = p.reward.toLowerCase();
          let icon = null;
          let text = p.reward;
          if (rewardStr.includes("essence")) {
            icon = "/essence.png";
            text = p.reward.replace(/essences?/i, "").trim();
          } else if (rewardStr.includes("gem")) {
            icon = "/gem.png";
            text = p.reward.replace(/gems?/i, "").trim();
          } else if (rewardStr.includes("shard")) {
            icon = "/shard-stellar.png";
            text = p.reward.replace(/shards?/i, "").trim();
          }
          return (
            <div key={p.pts + "_reward"} style={{
              position: "absolute", left: 0, right: 0,
              bottom: `${midPos}%`,
              transform: "translateY(50%)",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 3,
              fontSize: isTopReward && topRewardColor ? 10 : 8,
              fontWeight: rewardWeight,
              color: rewardColor,
              fontFamily: "'Outfit', sans-serif",
              letterSpacing: "0.04em",
              pointerEvents: "none",
              zIndex: 1,
              textShadow: rewardShadow,
              opacity: isTopReward && topRewardColor ? 1 : 0.55,
            }}>
              {icon && <img src={icon} alt="" style={{ width: 11, height: 11, objectFit: "contain", filter: "drop-shadow(0 0 2px rgba(0,0,0,0.8))" }} />}
              <span>{text}</span>
            </div>
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
        <div className="gauge-premium__highlight" />
        <div className="gauge-premium__edge-shine" />
      </div>
    </div>
  );
}
