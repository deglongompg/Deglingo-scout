import { useState, useMemo } from "react";
import { dsColor, dsBg, LEAGUE_FLAGS, POSITION_COLORS } from "../utils/colors";
import { dScoreMatch } from "../utils/dscore";

const FIGHT_COUNT_KEY = "deglingo_fight_count";

const COUNTRY_FLAGS = {
  fra:"🇫🇷",mar:"🇲🇦",bra:"🇧🇷",arg:"🇦🇷",esp:"🇪🇸",por:"🇵🇹",ger:"🇩🇪",deu:"🇩🇪",
  ita:"🇮🇹",eng:"🏴󠁧󠁢󠁥󠁮󠁧󠁿",ned:"🇳🇱",bel:"🇧🇪",uru:"🇺🇾",col:"🇨🇴",sen:"🇸🇳",cmr:"🇨🇲",
  civ:"🇨🇮",alg:"🇩🇿",nga:"🇳🇬",jpn:"🇯🇵",kor:"🇰🇷",usa:"🇺🇸",mex:"🇲🇽",cro:"🇭🇷",
  srb:"🇷🇸",sui:"🇨🇭",aut:"🇦🇹",pol:"🇵🇱",cze:"🇨🇿",tur:"🇹🇷",den:"🇩🇰",swe:"🇸🇪",
  nor:"🇳🇴",fin:"🇫🇮",gha:"🇬🇭",chi:"🇨🇱",par:"🇵🇾",ecu:"🇪🇨",ven:"🇻🇪",per:"🇵🇪",
  sco:"🏴󠁧󠁢󠁳󠁣󠁴󠁿",wal:"🏴󠁧󠁢󠁷󠁬󠁳󠁿",irl:"🇮🇪",ukr:"🇺🇦",hun:"🇭🇺",rou:"🇷🇴",
  gre:"🇬🇷",geo:"🇬🇪",con:"🇨🇬",cod:"🇨🇩",mli:"🇲🇱",gui:"🇬🇳",gab:"🇬🇦",tun:"🇹🇳",
  egy:"🇪🇬",jam:"🇯🇲",aus:"🇦🇺",isr:"🇮🇱",svk:"🇸🇰",svn:"🇸🇮",
};

const STAT_DESC = {
  "D-Score": "Prediction pour CE match (forme + adversaire)",
  "L5": "Moyenne des 5 derniers matchs",
  "AA5": "All-Around Score moyen (hors buts)",
  "Min": "Score minimum garanti (L15)",
  "Max": "Score max possible (L15)",
  "Reg10%": "% matchs au-dessus de 60 pts (L10)",
  "Titu%": "% titularisations sur les 10 derniers matchs",
  "G+A/m": "Buts + assists par match (saison)",
};

/* ── Sound FX ───────────────────────────── */
function playBellSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [[800,400,0.3,"sine",0.6,0.8],[1200,600,0.2,"sine",0.3,0.5]].forEach(([f1,f2,dur,type,vol,len])=>{
      const o=ctx.createOscillator(),g=ctx.createGain();
      o.connect(g);g.connect(ctx.destination);o.type=type;
      o.frequency.setValueAtTime(f1,ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(f2,ctx.currentTime+dur);
      g.gain.setValueAtTime(vol,ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.01,ctx.currentTime+len);
      o.start(ctx.currentTime);o.stop(ctx.currentTime+len);
    });
  } catch {}
}
function playPunchSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o=ctx.createOscillator(),g=ctx.createGain();
    o.connect(g);g.connect(ctx.destination);o.type="sawtooth";
    o.frequency.setValueAtTime(150,ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(50,ctx.currentTime+0.15);
    g.gain.setValueAtTime(0.8,ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.01,ctx.currentTime+0.2);
    o.start(ctx.currentTime);o.stop(ctx.currentTime+0.2);
  } catch {}
}
function playKOSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [400,500,600,800].forEach((freq,i)=>{
      const o=ctx.createOscillator(),g=ctx.createGain();
      o.connect(g);g.connect(ctx.destination);o.type="sine";
      o.frequency.setValueAtTime(freq,ctx.currentTime+i*0.12);
      g.gain.setValueAtTime(0.4,ctx.currentTime+i*0.12);
      g.gain.exponentialRampToValueAtTime(0.01,ctx.currentTime+i*0.12+0.3);
      o.start(ctx.currentTime+i*0.12);o.stop(ctx.currentTime+i*0.12+0.3);
    });
  } catch {}
}

/* ── Shared UI ──────────────────────────── */
function Sel({ value, onChange, options, placeholder }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={{
      background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
      borderRadius: 8, color: "#fff", padding: "10px 12px", fontSize: 12, fontWeight: 600,
      width: "100%", appearance: "none", cursor: "pointer", outline: "none", fontFamily: "Outfit",
    }}>
      <option value="" style={{ background: "#111" }}>{placeholder}</option>
      {options.map(o => <option key={o} value={o} style={{ background: "#111" }}>{o}</option>)}
    </select>
  );
}

/* ── Hexagonal Score Badge (Sorare style) ── */
function HexBadge({ score, size = 52 }) {
  const s = size;
  const bg = score >= 75 ? "linear-gradient(135deg,#22C55E,#16A34A)" : score >= 65 ? "linear-gradient(135deg,#4ADE80,#22C55E)" : score >= 55 ? "linear-gradient(135deg,#EAB308,#CA8A04)" : score >= 45 ? "linear-gradient(135deg,#F97316,#EA580C)" : "linear-gradient(135deg,#EF4444,#DC2626)";
  const glow = score >= 75 ? "rgba(34,197,94,0.6)" : score >= 65 ? "rgba(74,222,128,0.4)" : score >= 55 ? "rgba(234,179,8,0.4)" : score >= 45 ? "rgba(249,115,22,0.4)" : "rgba(239,68,68,0.4)";
  return (
    <div style={{ position: "relative", width: s, height: s * 1.1, margin: "0 auto" }}>
      <svg width={s} height={s * 1.1} viewBox="0 0 52 57" style={{ filter: `drop-shadow(0 0 8px ${glow})` }}>
        <polygon points="26,2 50,15 50,42 26,55 2,42 2,15" fill="url(#hexGrad)" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />
        <defs>
          <linearGradient id="hexGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={score >= 75 ? "#22C55E" : score >= 65 ? "#4ADE80" : score >= 55 ? "#EAB308" : score >= 45 ? "#F97316" : "#EF4444"} />
            <stop offset="100%" stopColor={score >= 75 ? "#16A34A" : score >= 65 ? "#22C55E" : score >= 55 ? "#CA8A04" : score >= 45 ? "#EA580C" : "#DC2626"} />
          </linearGradient>
        </defs>
      </svg>
      <div style={{
        position: "absolute", top: 0, left: 0, width: s, height: s * 1.1,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: s * 0.4, fontWeight: 900, color: "#fff", fontFamily: "DM Mono",
        textShadow: "0 1px 3px rgba(0,0,0,0.4)",
      }}>{score}</div>
    </div>
  );
}

/* ── Form bars (Sorare style) ── */
function FormBars({ scores, height = 22 }) {
  if (!scores || !scores.length) return null;
  return (
    <div style={{ display: "flex", gap: 3, alignItems: "flex-end", height, justifyContent: "center" }}>
      {scores.slice(0, 5).map((s, i) => (
        <div key={i} style={{
          width: 5, borderRadius: "2px 2px 0 0",
          height: Math.max(3, (s / 100) * height),
          background: s >= 70 ? "#22C55E" : s >= 55 ? "#84CC16" : s >= 40 ? "#EAB308" : "#EF4444",
          opacity: 0.6 + (i === 0 ? 0.4 : (5 - i) * 0.08),
        }} />
      ))}
    </div>
  );
}

/* ── Star ratings (Sorare style) ── */
function DStars({ score }) {
  const n = score >= 75 ? 5 : score >= 60 ? 4 : score >= 50 ? 3 : score >= 40 ? 2 : score >= 30 ? 1 : 0;
  return (
    <div style={{ display: "flex", gap: 1, justifyContent: "center" }}>
      {Array.from({ length: 5 }, (_, i) => (
        <svg key={i} width="12" height="12" viewBox="0 0 24 24" style={{
          filter: i < n && n === 5 ? "drop-shadow(0 0 3px rgba(251,191,36,0.7))" : "none",
        }}>
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
            fill={i < n ? "#FBBF24" : "rgba(255,255,255,0.1)"} stroke={i < n ? "#F59E0B" : "none"} strokeWidth="0.5" />
        </svg>
      ))}
    </div>
  );
}

/* ── COMPACT PREMIUM PLAYER CARD ── */
function PlayerCard({ player, score, opp, isHome, oppName, league, isWinner, logos = {} }) {
  if (!player) return null;
  const posCol = POSITION_COLORS[player.position] || "#8B5CF6";
  const flag = COUNTRY_FLAGS[player.country] || "🏳️";
  const sc = player.last_5 || [];

  // Dynamic card gradient based on position
  const cardBg = {
    GK: "linear-gradient(145deg, #0c1a2e 0%, #0a2540 25%, #0d1f35 50%, #091828 75%, #060f1c 100%)",
    DEF: "linear-gradient(145deg, #0f0e2c 0%, #151340 25%, #0e0d30 50%, #0a0925 75%, #07061a 100%)",
    MIL: "linear-gradient(145deg, #1a0e2e 0%, #241244 25%, #1a0e35 50%, #120a28 75%, #0a061c 100%)",
    ATT: "linear-gradient(145deg, #2a0e18 0%, #3a1020 25%, #2d0e1a 50%, #200a14 75%, #14060c 100%)",
  }[player.position] || "linear-gradient(145deg, #1a1040, #0d0820)";

  const glowCol = isWinner ? posCol : "transparent";

  return (
    <div style={{
      position: "relative", borderRadius: 14, overflow: "hidden",
      border: `1.5px solid ${isWinner ? posCol + "50" : "rgba(255,255,255,0.06)"}`,
      boxShadow: isWinner
        ? `0 0 20px ${posCol}30, 0 0 40px ${posCol}15, inset 0 1px 0 rgba(255,255,255,0.08)`
        : "0 4px 16px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)",
      background: cardBg,
      transition: "all 0.4s ease",
    }}>
      {/* ── Relief layer 1: diagonal shine streak ── */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: "linear-gradient(135deg, rgba(255,255,255,0.06) 0%, transparent 40%, transparent 60%, rgba(255,255,255,0.03) 100%)",
      }} />

      {/* ── Relief layer 2: radial glow from position color ── */}
      <div style={{
        position: "absolute", top: "-30%", left: "-20%", width: "140%", height: "100%",
        background: `radial-gradient(ellipse at 30% 20%, ${posCol}12, transparent 60%)`,
        pointerEvents: "none",
      }} />

      {/* ── Relief layer 3: bottom edge highlight ── */}
      <div style={{
        position: "absolute", bottom: 0, left: "10%", right: "10%", height: 1,
        background: `linear-gradient(90deg, transparent, ${posCol}30, transparent)`,
        pointerEvents: "none",
      }} />

      {/* ── Star dust texture ── */}
      <div style={{
        position: "absolute", inset: 0, opacity: 0.12, pointerEvents: "none",
        backgroundImage: "radial-gradient(0.8px 0.8px at 15% 25%, #fff, transparent), radial-gradient(0.6px 0.6px at 45% 65%, #fff, transparent), radial-gradient(1px 1px at 75% 15%, #fff, transparent), radial-gradient(0.7px 0.7px at 85% 55%, #fff, transparent), radial-gradient(0.5px 0.5px at 35% 85%, #fff, transparent), radial-gradient(0.8px 0.8px at 65% 45%, #fff, transparent)",
      }} />

      {/* ── Top accent line ── */}
      <div style={{
        height: 2, width: "100%",
        background: `linear-gradient(90deg, transparent 10%, ${posCol}80 50%, transparent 90%)`,
      }} />

      {/* ── Card content ── */}
      <div style={{ padding: "10px 10px 8px", position: "relative", zIndex: 1 }}>

        {/* Row: flag + position badge + league */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 12 }}>{flag}</span>
            <span style={{
              fontSize: 8, fontWeight: 800, color: posCol,
              background: `${posCol}18`, padding: "1px 5px", borderRadius: 3,
              letterSpacing: "0.08em", border: `1px solid ${posCol}25`,
            }}>{player.position}</span>
          </div>
          <span style={{ fontSize: 7, color: "rgba(255,255,255,0.25)", fontWeight: 700, letterSpacing: "0.1em" }}>
            {LEAGUE_FLAGS[league]} {league}
          </span>
        </div>

        {/* Player name — BIG */}
        <div style={{
          textAlign: "center", marginBottom: 3,
        }}>
          <div style={{
            fontSize: 16, fontWeight: 900, color: "#fff", fontFamily: "Outfit",
            letterSpacing: "-0.3px", lineHeight: 1.15,
            textShadow: `0 1px 6px rgba(0,0,0,0.6), 0 0 20px ${posCol}15`,
          }}>
            {player.name}
          </div>
        </div>

        {/* Club + archetype */}
        <div style={{ textAlign: "center", marginBottom: 6 }}>
          {logos[player.club] && <img src={`/data/logos/${logos[player.club]}`} alt="" style={{ width: 16, height: 16, objectFit: "contain", verticalAlign: "middle", marginRight: 3 }} />}
          <span style={{ fontSize: 8, color: "rgba(255,255,255,0.3)", fontWeight: 600 }}>{player.club}</span>
          <span style={{ fontSize: 8, color: "rgba(255,255,255,0.15)", margin: "0 4px" }}>·</span>
          <span style={{ fontSize: 7, color: posCol, fontWeight: 700, opacity: 0.6, letterSpacing: "0.05em" }}>{player.archetype}</span>
        </div>

        {/* Match context pill */}
        <div style={{
          display: "flex", justifyContent: "center", marginBottom: 8,
        }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            background: "rgba(0,0,0,0.25)", borderRadius: 6, padding: "3px 8px",
            border: "1px solid rgba(255,255,255,0.04)",
          }}>
            <span style={{
              fontSize: 7, fontWeight: 800, letterSpacing: "0.08em",
              color: isHome ? "#4ADE80" : "#FB923C",
            }}>{isHome ? "DOM" : "EXT"}</span>
            <span style={{ fontSize: 7, color: "rgba(255,255,255,0.2)" }}>vs</span>
            {logos[oppName] && <img src={`/data/logos/${logos[oppName]}`} alt="" style={{ width: 12, height: 12, objectFit: "contain" }} />}
            <span style={{ fontSize: 7, color: "rgba(255,255,255,0.45)", fontWeight: 700 }}>{oppName}</span>
          </div>
        </div>

        {/* ── Score bar — glass morphism effect ── */}
        <div style={{
          background: "linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))",
          backdropFilter: "blur(4px)",
          borderRadius: 8, padding: "6px 6px",
          border: "1px solid rgba(255,255,255,0.06)",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4,
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05), 0 2px 8px rgba(0,0,0,0.3)",
        }}>
          <FormBars scores={sc} height={16} />
          <div style={{
            width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
            background: dsBg(score),
            boxShadow: `0 2px 8px rgba(0,0,0,0.5), 0 0 12px ${dsColor(score)}30`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "'DM Mono',monospace", fontSize: 14, fontWeight: 700, color: "#fff",
            border: "2px solid rgba(255,255,255,0.25)",
          }}>{score}</div>
          <DStars score={score} />
        </div>
      </div>
    </div>
  );
}

/* ── Stat comparison row ── */
function Stat({ label, v1, v2 }) {
  const w1 = v1 > v2, w2 = v2 > v1;
  const isD = label === "D-Score";
  return (
    <div style={{ padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 4, alignItems: "center" }}>
        <div style={{ textAlign: "right", fontSize: isD ? 18 : 14, fontWeight: 800, fontFamily: "DM Mono", color: w1 ? "#4ADE80" : "rgba(255,255,255,0.4)" }}>
          {typeof v1 === "number" ? (Number.isInteger(v1) ? v1 : v1.toFixed(1)) : v1}
        </div>
        <div style={{ fontSize: isD ? 10 : 9, color: isD ? "#FBBF24" : "rgba(255,255,255,0.35)", fontWeight: 700, textAlign: "center", width: 55, letterSpacing: "0.05em" }}>{label}</div>
        <div style={{ textAlign: "left", fontSize: isD ? 18 : 14, fontWeight: 800, fontFamily: "DM Mono", color: w2 ? "#4ADE80" : "rgba(255,255,255,0.4)" }}>
          {typeof v2 === "number" ? (Number.isInteger(v2) ? v2 : v2.toFixed(1)) : v2}
        </div>
      </div>
      <div style={{ textAlign: "center", fontSize: 10, color: "rgba(255,255,255,0.30)", marginTop: 2, fontStyle: "italic" }}>{STAT_DESC[label] || ""}</div>
    </div>
  );
}

/* ── Match verdict generator ── */
function genVerdict(p, opp, isHome, d) {
  if (!p || !opp) return "";
  const oppPpda = isHome ? (opp.ppda_ext || 12) : (opp.ppda_dom || 12);
  const oppXga = isHome ? (opp.xga_ext || 1.5) : (opp.xga_dom || 1.5);
  const oppXg = isHome ? (opp.xg_ext || 1.3) : (opp.xg_dom || 1.3);
  const lastName = p.name.split(" ").pop();
  const sc = p.last_5 || [];
  const l2 = sc.length >= 2 ? (sc[0] + sc[1]) / 2 : p.l5;
  const es = p.l5 > 0 ? Math.round((l2 - p.l5) / p.l5 * 100) : 0;
  const fl = p.min_15 ?? p.floor ?? 0;
  const haLabel = isHome ? "à domicile" : "en déplacement";

  const formeTxt = es > 15 ? `${lastName} est en pleine forme (+${es}%).`
    : es > 5 ? `${lastName} progresse (+${es}%).`
    : es < -10 ? `${lastName} est en baisse (${es}%).`
    : `${lastName} est régulier.`;

  if (p.position === "GK") {
    const csChance = oppXg < 1.0 ? "très élevée (>50%)" : oppXg < 1.3 ? "correcte (35-45%)" : oppXg < 1.6 ? "moyenne (25-35%)" : "faible (<25%)";
    return `${formeTxt} Il joue ${haLabel} face à ${opp.name}. ` +
      `${opp.name} ${isHome ? "se déplace" : "reçoit"} et marque ${oppXg.toFixed(2)} buts attendus/match. ` +
      `Probabilité de Clean Sheet : ${csChance}. ` +
      `${oppXg < 1.3 ? "Attaque faible = gros potentiel CS + arrêts bonus." : oppXg < 1.6 ? "CS possible, beaucoup d'arrêts potentiels." : "CS difficile mais arrêts = AA élevé."} ` +
      `D-Score ${d} — ${d >= 70 ? "Top GK pick !" : d >= 60 ? "Bon choix gardien." : d >= 50 ? "Pick correct." : "Pick risqué."}`;
  }

  const oppDefTxt = oppXga > 1.6 ? `${opp.name} encaisse beaucoup (${oppXga.toFixed(2)} xGA) — défense poreuse.`
    : oppXga > 1.3 ? `${opp.name} a une défense moyenne (${oppXga.toFixed(2)} xGA).`
    : `${opp.name} est solide défensivement (${oppXga.toFixed(2)} xGA).`;
  const oppStyleTxt = oppPpda >= 15 ? `${opp.name} joue en bloc bas — possession pour l'adversaire.`
    : oppPpda >= 12 ? `${opp.name} joue de façon équilibrée.`
    : `${opp.name} presse haut — espaces dans le dos.`;

  let styleTxt;
  if (p.position === "DEF") {
    styleTxt = oppXga < 1.2 ? `CS très jouable. ${p.aa5 >= 18 ? `AA5 de ${Math.round(p.aa5)} = il monte et crée en plus.` : ""}`
      : `CS incertain. ${p.aa5 >= 18 ? `Mais son AA5 (${Math.round(p.aa5)}) sécurise le score.` : ""}`;
  } else if (p.position === "MIL") {
    styleTxt = p.aa5 >= 15
      ? `AA élevé (${Math.round(p.aa5)}) = points garantis. ${oppPpda >= 15 ? `Face au bloc bas de ${opp.name}, score monster possible.` : "Match ouvert = duels et actions."}`
      : `${oppXga > 1.5 ? `${opp.name} est perméable — occasions à prendre.` : "Adversaire solide — miser sur la régularité."}`;
  } else {
    styleTxt = oppXga > 1.6 ? `Défense poreuse de ${opp.name} — contexte rêvé pour scorer.`
      : oppXga > 1.3 ? `Des occasions à saisir face à ${opp.name}.`
      : `${opp.name} défend bien — match compliqué.`;
  }

  return `${formeTxt} Il joue ${haLabel} face à ${opp.name}. ${oppDefTxt} ${oppStyleTxt} ${styleTxt} ` +
    `Floor ${Math.round(fl)} pts. D-Score ${d} — ${d >= 70 ? "Top pick !" : d >= 60 ? "Bon choix." : d >= 50 ? "Pick correct." : "Pick risqué."}`;
}

/* ── Fight Animation ── */
function FightAnimation({ phase, winner, name1, name2, d1, d2, club1, club2, logos = {} }) {
  if (phase === 0) return null;
  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999,
      background: "rgba(0,0,0,0.88)", backdropFilter: "blur(10px)",
      display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column",
    }}>
      <div style={{ position: "relative", width: 320, height: 260, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{
          position: "absolute", left: 0, top: 10, textAlign: "center", width: 120,
          fontSize: 18, fontWeight: 900, fontFamily: "Outfit",
          color: winner === 1 ? "#4ADE80" : "#fff",
          textShadow: winner === 1 ? "0 0 15px rgba(74,222,128,0.5)" : "none",
          animation: phase === 3 && winner !== 1 ? "loserFly 0.8s ease forwards" : "none",
          "--fly-dir": "-200px", "--fly-rot": "-30deg",
        }}>
          {logos[club1] && <img src={`/data/logos/${logos[club1]}`} alt="" style={{ width: 32, height: 32, objectFit: "contain", marginBottom: 4, filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.6))" }} />}
          <div>{name1}{phase >= 2 && winner === 1 ? " 🏆" : ""}</div>
        </div>
        <div style={{
          position: "absolute", right: 0, top: 10, textAlign: "center", width: 120,
          fontSize: 18, fontWeight: 900, fontFamily: "Outfit",
          color: winner === 2 ? "#4ADE80" : "#fff",
          textShadow: winner === 2 ? "0 0 15px rgba(74,222,128,0.5)" : "none",
          animation: phase === 3 && winner !== 2 ? "loserFly 0.8s ease forwards" : "none",
          "--fly-dir": "200px", "--fly-rot": "30deg",
        }}>
          {logos[club2] && <img src={`/data/logos/${logos[club2]}`} alt="" style={{ width: 32, height: 32, objectFit: "contain", marginBottom: 4, filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.6))" }} />}
          <div>{name2}{phase >= 2 && winner === 2 ? " 🏆" : ""}</div>
        </div>
        <div style={{
          position: "absolute", left: 20, top: 110, fontSize: 64,
          animation: phase === 1 ? "gloveLeft 1.2s ease forwards" : phase === 2 && winner === 1 ? "winnerPunch 0.8s ease" : phase === 3 && winner === 2 ? "loserFly 0.8s ease forwards" : "none",
          "--punch-dir": "40px", "--fly-dir": "-200px", "--fly-rot": "-45deg",
        }}>🤜</div>
        <div style={{
          position: "absolute", right: 20, top: 110, fontSize: 64,
          animation: phase === 1 ? "gloveRight 1.2s ease forwards" : phase === 2 && winner === 2 ? "winnerPunch 0.8s ease" : phase === 3 && winner === 1 ? "loserFly 0.8s ease forwards" : "none",
          "--punch-dir": "-40px", "--fly-dir": "200px", "--fly-rot": "45deg",
        }}>🤛</div>
        {phase === 2 && <div style={{ position: "absolute", top: 130, fontSize: 48, animation: "clash 0.6s ease forwards" }}>💥</div>}
      </div>
      <div style={{ marginTop: 20, textAlign: "center" }}>
        {phase === 1 && <div style={{ fontFamily: "Outfit", fontSize: 32, fontWeight: 900, color: "#fff", animation: "fightTextPulse 0.5s ease infinite" }}>FIGHT !</div>}
        {phase === 2 && <div style={{ fontFamily: "Outfit", fontSize: 36, fontWeight: 900, color: "#FBBF24", textShadow: "0 0 20px rgba(251,191,36,0.5)" }}>💥 CLASH !</div>}
        {phase === 3 && (
          <div>
            <div style={{ fontFamily: "Outfit", fontSize: 28, fontWeight: 900, color: "#4ADE80", textShadow: "0 0 20px rgba(74,222,128,0.5)" }}>🏆 K.O. !</div>
            <div style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", marginTop: 6 }}>{winner === 1 ? name1 : name2} gagne {Math.max(d1, d2)} a {Math.min(d1, d2)}</div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════
   MAIN COMPONENT
   ════════════════════════════════════════════ */
export default function FightTab({ players, teams, fixtures, logos = {} }) {
  const [lg1, setLg1] = useState("L1"); const [lg2, setLg2] = useState("L1");
  const [c1, setC1] = useState(""); const [c2, setC2] = useState("");
  const [pn1, setPn1] = useState(""); const [pn2, setPn2] = useState("");
  const [o1, setO1] = useState(""); const [o2, setO2] = useState("");
  const [h1, setH1] = useState(true); const [h2, setH2] = useState(true);
  const [launched, setLaunched] = useState(false);
  const [animPhase, setAnimPhase] = useState(0);
  const [fightCount, setFightCount] = useState(() => {
    try { return parseInt(localStorage.getItem(FIGHT_COUNT_KEY) || "0", 10); } catch { return 0; }
  });

  const pf = fixtures?.player_fixtures || {};
  const autoFill = (name, setO, setH) => { const fx = pf[name]; if (fx) { setO(fx.opp); setH(fx.isHome); } };
  const resetFight = () => { setLaunched(false); setAnimPhase(0); };

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

  const d1 = sel1 && opp1 ? dScoreMatch(sel1, opp1, h1) : 0;
  const d2 = sel2 && opp2 ? dScoreMatch(sel2, opp2, h2) : 0;

  const ready = sel1 && sel2 && opp1 && opp2;
  const delta = ready ? Math.abs(d1 - d2) : 0;
  const winner = ready ? (d1 > d2 ? 1 : d2 > d1 ? 2 : 0) : 0;
  const cert = delta > 12 ? "FORTE" : delta > 6 ? "MOYENNE" : "SERREE";
  const certCol = delta > 12 ? "#22C55E" : delta > 6 ? "#FBBF24" : "#F87171";

  const doFight = () => {
    if (!ready) return;
    const nc = fightCount + 1; setFightCount(nc);
    try { localStorage.setItem(FIGHT_COUNT_KEY, String(nc)); } catch {}
    setAnimPhase(1); playBellSound();
    setTimeout(() => { setAnimPhase(2); playPunchSound(); }, 1500);
    setTimeout(() => { setAnimPhase(3); playKOSound(); }, 2800);
    setTimeout(() => { setAnimPhase(0); setLaunched(true); }, 4200);
  };

  return (
    <div style={{ padding: "0 16px 20px", maxWidth: 800, margin: "0 auto" }}>
      <style>{`
@keyframes gloveLeft{0%{transform:translateX(-120px) rotate(-15deg);opacity:0}30%{transform:translateX(0) rotate(5deg);opacity:1}50%{transform:translateX(60px) rotate(-3deg)}100%{transform:translateX(50px) rotate(0);opacity:1}}
@keyframes gloveRight{0%{transform:translateX(120px) rotate(15deg);opacity:0}30%{transform:translateX(0) rotate(-5deg);opacity:1}50%{transform:translateX(-60px) rotate(3deg)}100%{transform:translateX(-50px) rotate(0);opacity:1}}
@keyframes clash{0%{transform:scale(0);opacity:0}50%{transform:scale(1.5);opacity:1}100%{transform:scale(0.8);opacity:0}}
@keyframes winnerPunch{0%{transform:translateX(0) scale(1)}25%{transform:translateX(var(--punch-dir)) scale(1.3)}50%{transform:translateX(calc(var(--punch-dir)*0.5)) scale(1.1)}100%{transform:translateX(0) scale(1)}}
@keyframes loserFly{0%{transform:translateX(0) rotate(0) scale(1);opacity:1}100%{transform:translateX(var(--fly-dir)) rotate(var(--fly-rot)) scale(0.3);opacity:0}}
@keyframes fightPulse{0%,100%{transform:scale(1);box-shadow:0 0 20px rgba(239,68,68,0.3),0 0 40px rgba(251,146,60,0.15)}50%{transform:scale(1.03);box-shadow:0 0 30px rgba(239,68,68,0.5),0 0 60px rgba(251,146,60,0.3)}}
@keyframes fightTextPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.05)}}
@keyframes vsFlame{0%{background-position:200% center}50%{background-position:0% center}100%{background-position:200% center}}
@keyframes shimmer{0%{background-position:200% center}100%{background-position:-200% center}}
@media(max-width:600px){.fight-cards{grid-template-columns:1fr!important}.fight-verdicts{grid-template-columns:1fr!important}}
      `}</style>

      {animPhase > 0 && <FightAnimation phase={animPhase} winner={d1 >= d2 ? 1 : 2} name1={pn1} name2={pn2} d1={d1} d2={d2} club1={sel1?.club} club2={sel2?.club} logos={logos} />}

      {/* Title */}
      <div style={{ textAlign: "center", marginBottom: 14 }}>
        <div style={{
          fontSize: 32, fontWeight: 900, fontFamily: "Outfit",
          background: "linear-gradient(90deg,#fff 0%,#F87171 25%,#FBBF24 50%,#F87171 75%,#fff 100%)",
          backgroundSize: "200% auto", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          animation: "shimmer 3s linear infinite",
        }}>Deglingo Fight</div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>Qui choisir pour ta prochaine GW Sorare ?</div>
      </div>

      {/* Model explanation */}
      <div style={{ background: "linear-gradient(135deg,rgba(99,102,241,0.06),rgba(239,68,68,0.04))", border: "1px solid rgba(99,102,241,0.12)", borderRadius: 12, padding: "12px 14px", marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#A5B4FC", marginBottom: 6 }}>🧠 Comment ca marche ?</div>
        <div style={{ fontSize: 11, lineHeight: 1.7, color: "rgba(255,255,255,0.5)" }}>
          Notre <span style={{ color: "#FBBF24", fontWeight: 700 }}>D-Score</span> evalue <span style={{ color: "#fff", fontWeight: 600 }}>{players.length}+ joueurs</span> sur 4 ligues et estime leur potentiel pour <span style={{ color: "#fff", fontWeight: 600 }}>le prochain match</span>.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 8 }}>
          <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "6px 8px" }}>
            <div style={{ fontSize: 10, color: "#4ADE80", fontWeight: 700 }}>📊 Forme joueur</div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>L5, L10, AA5, Floor, Regularite, G+A, Momentum</div>
          </div>
          <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "6px 8px" }}>
            <div style={{ fontSize: 10, color: "#F87171", fontWeight: 700 }}>⚔ Contexte adversaire</div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>PPDA dom/ext, xGA, style de jeu, DOM/EXT</div>
          </div>
        </div>
        <div style={{ marginTop: 6, textAlign: "center" }}><span style={{ fontSize: 9, color: "#F87171", fontWeight: 700, background: "rgba(239,68,68,0.12)", padding: "3px 10px", borderRadius: 20 }}>🚀 BETA GRATUITE</span></div>
      </div>

      {/* Player selection */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
        {[[lg1, setLg1, c1, setC1, pn1, setPn1, o1, setO1, h1, setH1, clubs1, pls1, opps1, "🔵 JOUEUR 1", "#A5B4FC", "rgba(99,102,241,0.2)"],
          [lg2, setLg2, c2, setC2, pn2, setPn2, o2, setO2, h2, setH2, clubs2, pls2, opps2, "🔴 JOUEUR 2", "#F87171", "rgba(239,68,68,0.2)"]].map(([lg, sLg, c, sC, pn, sPn, o, sO, h, sH, clubs, pls, opps, label, col, bgCol], idx) => (
          <div key={idx} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <div style={{ fontSize: 9, color: col, fontWeight: 700, textAlign: "center", letterSpacing: "0.1em" }}>{label}</div>
            <div style={{ display: "flex", gap: 3 }}>
              {["L1", "PL", "Liga", "Bundes"].map(l => (
                <button key={l} onClick={() => { sLg(l); sC(""); sPn(""); sO(""); resetFight(); }} style={{
                  flex: 1, padding: "7px 3px", borderRadius: 6, border: "none", cursor: "pointer",
                  background: lg === l ? bgCol : "rgba(255,255,255,0.03)",
                  color: lg === l ? col : "rgba(255,255,255,0.25)", fontSize: 10, fontWeight: 700, fontFamily: "Outfit",
                }}>{LEAGUE_FLAGS[l]} {l}</button>
              ))}
            </div>
            <Sel value={c} onChange={v => { sC(v); sPn(""); resetFight(); }} options={clubs} placeholder="Club..." />
            {c && <Sel value={pn} onChange={v => { sPn(v); autoFill(v, sO, sH); resetFight(); }} options={pls.map(x => x.name)} placeholder="Joueur..." />}
            {pn && <Sel value={o} onChange={v => { sO(v); resetFight(); }} options={opps} placeholder="Adversaire..." />}
            {pn && !pf[pn] && <div style={{ fontSize: 9, color: "rgba(255,150,50,0.6)", marginTop: -4 }}>⚠ Pas de match programme</div>}
            {o && (
              <div style={{ display: "flex", gap: 4 }}>
                {[true, false].map(v => (
                  <button key={v ? "H" : "A"} onClick={() => { sH(v); resetFight(); }} style={{
                    flex: 1, padding: "8px", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: "Outfit", fontWeight: 700, fontSize: 12,
                    background: h === v ? (v ? "rgba(74,222,128,0.2)" : "rgba(251,146,60,0.2)") : "rgba(255,255,255,0.03)",
                    color: h === v ? (v ? "#4ADE80" : "#FB923C") : "rgba(255,255,255,0.25)",
                  }}>{v ? "🏠 DOM" : "✈️ EXT"}</button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* FIGHT BUTTON */}
      {ready && !launched ? (
        <div style={{ textAlign: "center", margin: "20px 0" }}>
          <button onClick={doFight} style={{
            fontFamily: "Outfit", fontSize: 28, fontWeight: 900,
            color: "#fff", border: "none", cursor: "pointer",
            background: "linear-gradient(135deg,#EF4444,#DC2626,#F97316)",
            padding: "18px 50px", borderRadius: 16,
            letterSpacing: "0.06em",
            animation: "fightPulse 2s ease-in-out infinite",
          }}>
            <span style={{ position: "relative", zIndex: 1 }}>🥊 FIGHT !</span>
          </button>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", marginTop: 8 }}>
            {fightCount > 0 ? fightCount + " fights lances" : ""}
          </div>
        </div>
      ) : null}

      {/* ═══ RESULTS ═══ */}
      {ready && launched ? (
        <div>
          {/* SORARE-STYLE CARDS */}
          <div className="fight-cards" style={{
            display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 12,
            alignItems: "center", marginBottom: 20,
          }}>
            <PlayerCard player={sel1} score={d1} opp={opp1} isHome={h1} oppName={o1} league={lg1} isWinner={winner === 1} logos={logos} />
            <div style={{ textAlign: "center" }}>
              <div style={{
                width: 52, height: 52, borderRadius: "50%",
                background: "radial-gradient(circle,rgba(239,68,68,0.15),rgba(251,146,60,0.08))",
                border: "2px solid rgba(239,68,68,0.3)",
                display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto",
                boxShadow: "0 0 20px rgba(239,68,68,0.2)",
              }}>
                <span style={{
                  fontFamily: "Outfit", fontSize: 20, fontWeight: 900,
                  background: "linear-gradient(90deg,#EF4444,#FB923C,#FBBF24,#FB923C,#EF4444)",
                  backgroundSize: "200% auto", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                  animation: "vsFlame 2s linear infinite",
                }}>VS</span>
              </div>
              <div style={{ fontSize: 8, color: "rgba(255,255,255,0.2)", marginTop: 3, fontFamily: "DM Mono" }}>Δ{delta}</div>
              <div style={{ fontSize: 8, color: certCol, fontWeight: 800, marginTop: 2 }}>{cert}</div>
            </div>
            <PlayerCard player={sel2} score={d2} opp={opp2} isHome={h2} oppName={o2} league={lg2} isWinner={winner === 2} logos={logos} />
          </div>

          {/* STATS + ANALYSIS PANEL */}
          <div style={{
            background: "linear-gradient(180deg,rgba(8,8,24,0.98),rgba(12,15,30,0.98))",
            borderRadius: 16, overflow: "hidden",
            border: "1px solid rgba(255,255,255,0.06)", boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          }}>
            {/* Stats comparison */}
            <div style={{ padding: "12px 14px 8px" }}>
              <Stat label="D-Score" v1={d1} v2={d2} />
              <Stat label="L5" v1={sel1.l5} v2={sel2.l5} />
              <Stat label="AA5" v1={sel1.aa5} v2={sel2.aa5} />
              <Stat label="Min" v1={sel1.min_15} v2={sel2.min_15} />
              <Stat label="Max" v1={sel1.max_15} v2={sel2.max_15} />
              <Stat label="Reg10%" v1={sel1.regularite} v2={sel2.regularite} />
              <Stat label="Titu%" v1={sel1.titu_pct} v2={sel2.titu_pct} />
              <Stat label="G+A/m" v1={sel1.ga_per_match} v2={sel2.ga_per_match} />
            </div>

            {/* Opponent context cards */}
            <div style={{ padding: "0 14px 8px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              {[[sel1, opp1, h1], [sel2, opp2, h2]].map(([pl, op, hm], i) => {
                const ppda = hm ? op.ppda_ext : op.ppda_dom;
                const xga = hm ? op.xga_ext : op.xga_dom;
                return (
                  <div key={i} style={{ background: "rgba(255,255,255,0.02)", borderRadius: 8, padding: 8, border: "1px solid rgba(255,255,255,0.04)" }}>
                    <div style={{ fontSize: 10, color: i === 0 ? "#A5B4FC" : "#F87171", fontWeight: 700, letterSpacing: "0.08em", marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
                      {logos[op.name] && <img src={`/data/logos/${logos[op.name]}`} alt="" style={{ width: 14, height: 14, objectFit: "contain" }} />}
                      vs {op.name} ({hm ? "DOM" : "EXT"})
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                      <div>
                        <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)" }}>PPDA</div>
                        <div style={{ fontSize: 14, fontWeight: 800, fontFamily: "DM Mono", color: ppda > 13 ? "#FB923C" : ppda < 10 ? "#F87171" : "#fff" }}>{ppda}</div>
                        <div style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", fontStyle: "italic" }}>{ppda > 13 ? "Bloc bas" : ppda < 10 ? "Pressing" : "Equilibre"}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)" }}>xGA</div>
                        <div style={{ fontSize: 14, fontWeight: 800, fontFamily: "DM Mono", color: xga > 1.6 ? "#4ADE80" : xga < 1.2 ? "#F87171" : "#fff" }}>{xga}</div>
                        <div style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", fontStyle: "italic" }}>{xga > 1.6 ? "Passoire" : xga < 1.2 ? "Solide" : "Moyen"}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Match analysis */}
            <div style={{ padding: "0 14px 10px" }}>
              <div style={{ background: "linear-gradient(135deg,rgba(251,191,36,0.04),rgba(251,191,36,0.01))", border: "1px solid rgba(251,191,36,0.1)", borderRadius: 10, padding: 12 }}>
                <div style={{ fontSize: 9, color: "#FBBF24", fontWeight: 800, letterSpacing: "0.1em", marginBottom: 8 }}>💬 ANALYSE MATCH</div>
                <div className="fight-verdicts" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div style={{ fontSize: 12, lineHeight: 1.7, color: winner === 1 ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.35)" }}>
                    {genVerdict(sel1, opp1, h1, d1)}
                  </div>
                  <div style={{ fontSize: 12, lineHeight: 1.7, color: winner === 2 ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.35)" }}>
                    {genVerdict(sel2, opp2, h2, d2)}
                  </div>
                </div>
              </div>
            </div>

            {/* WINNER PANEL */}
            <div style={{ padding: "0 14px 14px" }}>
              <div style={{ padding: "16px 12px", background: "linear-gradient(135deg,rgba(74,222,128,0.08),rgba(251,191,36,0.06))", borderRadius: 12, textAlign: "center", border: "1px solid rgba(74,222,128,0.15)" }}>
                <div style={{ fontSize: 36, marginBottom: 2 }}>🏆</div>
                <div style={{ fontSize: 10, color: "#FBBF24", fontWeight: 700, letterSpacing: "0.12em", marginBottom: 6 }}>
                  {Math.max(d1, d2) >= 75 ? "🔥 WINNER" : "WINNER"}
                </div>
                <div style={{
                  fontSize: 24, fontWeight: 900, letterSpacing: "-0.02em",
                  color: Math.max(d1, d2) >= 70 ? "#4ADE80" : Math.max(d1, d2) >= 55 ? "#FBBF24" : "#F87171",
                }}>
                  {winner === 1 ? sel1.name : winner === 2 ? sel2.name : "Egalite !"}
                </div>
                <DStars score={Math.max(d1, d2)} />
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 4, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                  {winner !== 0 && logos[winner === 1 ? sel1.club : sel2.club] && <img src={`/data/logos/${logos[winner === 1 ? sel1.club : sel2.club]}`} alt="" style={{ width: 20, height: 20, objectFit: "contain" }} />}
                  {winner !== 0 ? (winner === 1 ? sel1.club : sel2.club) + " · " + (winner === 1 ? sel1.archetype : sel2.archetype) : ""}
                </div>
                <div style={{ display: "flex", justifyContent: "center", gap: 20, marginTop: 12 }}>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 28, fontWeight: 900, color: "#4ADE80", fontFamily: "DM Mono" }}>{Math.max(d1, d2)}</div>
                    <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)" }}>Winner</div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 28, fontWeight: 900, color: "rgba(255,255,255,0.3)", fontFamily: "DM Mono" }}>{Math.min(d1, d2)}</div>
                    <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)" }}>Loser</div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 28, fontWeight: 900, color: certCol, fontFamily: "DM Mono" }}>Δ{delta}</div>
                    <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)" }}>{cert}</div>
                  </div>
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginTop: 12, lineHeight: 1.7, textAlign: "left" }}>
                  {(() => {
                    const w = winner === 1 ? sel1 : sel2;
                    const l = winner === 1 ? sel2 : sel1;
                    const wD = Math.max(d1, d2);
                    const lD = Math.min(d1, d2);
                    const wOpp = winner === 1 ? opp1 : opp2;
                    const lOpp = winner === 1 ? opp2 : opp1;
                    const wHome = winner === 1 ? h1 : h2;
                    const lHome = winner === 1 ? h2 : h1;
                    const wXga = wHome ? (wOpp.xga_ext || 1.5) : (wOpp.xga_dom || 1.5);
                    const lXga = lHome ? (lOpp.xga_ext || 1.5) : (lOpp.xga_dom || 1.5);
                    const wPpda = wHome ? (wOpp.ppda_ext || 12) : (wOpp.ppda_dom || 12);
                    const lPpda = lHome ? (lOpp.ppda_ext || 12) : (lOpp.ppda_dom || 12);
                    const wFloor = w.min_15 ?? w.floor ?? 0;
                    const lFloor = l.min_15 ?? l.floor ?? 0;
                    if (winner === 0) return "🤝 Égalité parfaite ! D-Score " + d1 + " vs " + d2 + ". Même potentiel, choisis selon ton feeling ou la cote Sorare.";
                    let lines = [];
                    // Why winner is safer
                    lines.push((delta > 10 ? "🔥" : delta > 6 ? "✅" : "👍") + " " + w.name + " est le pick le plus safe (D-Score " + wD + " vs " + lD + ").");
                    // Context advantage
                    const wCtx = []; const lCtx = [];
                    if (wHome) wCtx.push("joue à domicile"); else lCtx.push("avantage domicile");
                    if (wXga > lXga) wCtx.push("adversaire plus perméable (xGA " + wXga.toFixed(2) + " vs " + lXga.toFixed(2) + ")");
                    else if (lXga > wXga + 0.2) lCtx.push("adversaire plus faible défensivement");
                    if (wFloor > lFloor) wCtx.push("meilleur floor (" + wFloor + " vs " + lFloor + ")");
                    else if (lFloor > wFloor) lCtx.push("meilleur floor (" + lFloor + ")");
                    if (w.regularite > l.regularite) wCtx.push("plus régulier (" + w.regularite + "% vs " + l.regularite + "%)");
                    if (wCtx.length > 0) lines.push("📈 Ses atouts : " + wCtx.join(", ") + ".");
                    // Risk of loser
                    const risks = [];
                    if (!lHome) risks.push("en déplacement");
                    if (lFloor < 35) risks.push("floor bas (" + lFloor + ")");
                    if (l.regularite < 50) risks.push("irrégulier (" + l.regularite + "%)");
                    if (lPpda < 10) risks.push("adversaire en pressing haut (risqué)");
                    const lSc = l.last_5 || [];
                    if (lSc.length > 0 && lSc[0] < 25) risks.push("dernier score faible (" + lSc[0] + ")");
                    if (risks.length > 0) lines.push("⚠️ Risques " + l.name + " : " + risks.join(", ") + ".");
                    // Reward of loser (why you might still pick them)
                    if (lCtx.length > 0 || l.aa5 > w.aa5 || (l.last_5 && l.last_5[0] > 70)) {
                      const rewards = [...lCtx];
                      if (l.aa5 > w.aa5) rewards.push("AA5 supérieur (" + l.aa5 + " vs " + w.aa5 + ")");
                      if (l.last_5 && l.last_5[0] > 70) rewards.push("en forme (dernier score " + l.last_5[0] + ")");
                      if (rewards.length > 0) lines.push("💡 Mais " + l.name + " a : " + rewards.join(", ") + ". Pick plus risqué mais ceiling plus élevé.");
                    }
                    // Final recommendation
                    if (wD >= 75 && delta > 10) lines.push("🎯 Verdict : pick évident, fonce sur " + w.name + ".");
                    else if (wD >= 70 && delta > 6) lines.push("🎯 Verdict : avantage clair pour " + w.name + ". Safe pick.");
                    else if (delta <= 5) lines.push("🎯 Verdict : très serré ! Les deux sont jouables. " + w.name + " a un léger edge.");
                    else lines.push("🎯 Verdict : " + w.name + " est le choix le plus rationnel cette semaine.");
                    return lines.join(" ");
                  })()}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : !ready ? (
        <div style={{ textAlign: "center", padding: "40px 20px", color: "rgba(255,255,255,0.15)" }}>
          <div style={{ fontSize: 44, marginBottom: 8 }}>🥊</div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Choisis tes 2 combattants</div>
          <div style={{ fontSize: 12, marginTop: 6 }}>Ligue → Club → Joueur → Adversaire → Dom/Ext</div>
        </div>
      ) : null}

      <div style={{ textAlign: "center", marginTop: 16 }}>
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.15)", fontFamily: "DM Mono" }}>
          {fightCount} fight{fightCount !== 1 ? "s" : ""} lances
        </span>
      </div>
    </div>
  );
}
