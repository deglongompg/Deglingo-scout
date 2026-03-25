import { useState, useMemo } from "react";
import { dsColor, dsBg, LEAGUE_FLAGS, LEAGUE_NAMES, POSITION_COLORS } from "../utils/colors";
import { dScoreMatch, csProb, findTeam } from "../utils/dscore";

const PC = POSITION_COLORS;

const LG_META = {
  L1:     { name: "Ligue 1",        flag: "🇫🇷",  accent: "#4FC3F7" },
  PL:     { name: "Premier League",  flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", accent: "#B388FF" },
  Liga:   { name: "La Liga",         flag: "🇪🇸",  accent: "#FF8A80" },
  Bundes: { name: "Bundesliga",      flag: "🇩🇪",  accent: "#FFD180" },
};

function getTags(p) {
  const tags = [];
  if (p.aa5 >= 20) tags.push("AA Monster");
  if ((p.min_15 ?? p.floor) >= 55) tags.push("Floor King");
  if (p.regularite >= 90) tags.push("Régulier");
  if (p.ga_per_match >= 0.5) tags.push("DS Bomb");
  const sc = p.last_5 || [];
  const l2 = sc.length >= 2 ? (sc[0] + sc[1]) / 2 : p.l5;
  if (p.l5 > 0 && (l2 - p.l5) / p.l5 > 0.15) tags.push("Early Signal");
  return tags;
}

function genVerdict(p) {
  const sc = p.last_5 || [];
  const l2 = sc.length >= 2 ? (sc[0] + sc[1]) / 2 : sc[0] || p.l5;
  const es = p.l5 > 0 ? Math.round((l2 - p.l5) / p.l5 * 100) : 0;
  const oppPpda = p.isHome ? (p.oppTeam.ppda_ext || 12) : (p.oppTeam.ppda_dom || 12);
  const oppXga = p.isHome ? (p.oppTeam.xga_ext || 1.5) : (p.oppTeam.xga_dom || 1.5);
  const oppXg = p.isHome ? (p.oppTeam.xg_ext || 1.3) : (p.oppTeam.xg_dom || 1.3);
  const style = oppPpda >= 15 ? "Bloc bas" : oppPpda >= 12 ? "Équilibré" : "Pressing";
  const haLabel = p.isHome ? "à domicile" : "en déplacement";
  const lastName = p.name.split(" ").pop();
  const fl = p.min_15 ?? p.floor;

  // Situation: forme lisible
  const formeTxt = es > 15 ? `${lastName} est en pleine forme avec une hausse de +${es}% sur ses 2 derniers matchs.`
    : es > 5 ? `${lastName} progresse bien (+${es}% sur ses 2 derniers matchs).`
    : es < -10 ? `Attention, ${lastName} est en baisse de forme (${es}% sur ses 2 derniers matchs).`
    : `${lastName} est régulier et constant dans ses performances.`;
  const tituTxt = p.titu_pct >= 90 ? "Titulaire indiscutable" : p.titu_pct >= 70 ? "Titulaire régulier" : p.titu_pct >= 50 ? "Temps de jeu partagé" : "Remplaçant fréquent — risque de ne pas jouer";
  const floorTxt = fl >= 55 ? `Son floor de ${Math.round(fl)} pts garantit une base solide même en soirée difficile.` : fl >= 40 ? `Son floor de ${Math.round(fl)} pts offre un filet de sécurité correct.` : `Attention : son floor est bas (${Math.round(fl)} pts), gros risque si soirée sans.`;

  const defXga = p.playerTeam ? (p.isHome ? (p.playerTeam.xga_dom || 1.3) : (p.playerTeam.xga_ext || 1.5)) : 1.3;
  const cs = csProb(defXga, oppXg, p.league);

  if (p.position === "GK") {
    const csLabel = cs >= 45 ? "très élevée" : cs >= 30 ? "correcte" : cs >= 20 ? "moyenne" : "faible";
    return {
      situation: `${formeTxt} ${tituTxt} (${p.titu_pct}%). Il joue ${haLabel} face à ${p.oppName}.`,
      adversaire: `${p.oppName} ${p.isHome ? "se déplace" : "reçoit"} et marque en moyenne ${oppXg.toFixed(2)} buts attendus par match (xG). ${cs >= 45 ? "C'est une attaque très faible — peu de danger pour le gardien." : cs >= 30 ? "Attaque modeste — le gardien devrait être tranquille." : cs >= 20 ? "Attaque correcte — match ouvert, Clean Sheet pas garanti." : "Attaque dangereuse — il faudra beaucoup d'arrêts pour s'en sortir."}`,
      style: `La probabilité de Clean Sheet est ${csLabel} (${cs}%). ${cs >= 30 ? "Contre une équipe aussi peu offensive, le bonus CS (+10 pts) est très jouable, et les arrêts bonus viendront en complément." : cs >= 20 ? "Le CS reste possible si la défense tient. L'avantage : face à une attaque moyenne, il y aura des tirs à arrêter = bon potentiel All-Around." : "Le CS sera difficile à obtenir, mais la bonne nouvelle : beaucoup de tirs adverses = beaucoup d'arrêts = All-Around élevé qui compense."}`,
      conclusion: `Avec un D-Score de ${p.ds}, ${lastName} est ${p.ds >= 70 ? "un top pick gardien cette semaine. Fonce !" : p.ds >= 60 ? "un bon choix en gardien. Contexte favorable." : p.ds >= 50 ? "un pick correct mais pas exceptionnel. Regarde les alternatives." : "un pick risqué. Il y a sûrement mieux cette semaine."}`,
    };
  }

  // Adversaire: expliquer clairement qui est qui
  const oppLieu = p.isHome ? "se déplace" : "joue à domicile";
  const oppDefTxt = oppXga > 1.6 ? `${p.oppName} encaisse beaucoup (${oppXga.toFixed(2)} xGA/match) — c'est une défense poreuse, idéal pour scorer.`
    : oppXga > 1.3 ? `${p.oppName} a une défense moyenne (${oppXga.toFixed(2)} xGA/match) — des occasions sont à prendre.`
    : `${p.oppName} a une défense solide (${oppXga.toFixed(2)} xGA/match) — il faudra forcer pour créer des occasions.`;
  const oppStyleTxt = oppPpda >= 15 ? `${p.oppName} joue en bloc bas (PPDA ${oppPpda.toFixed(1)}) : ils défendent profond et laissent la possession à l'adversaire.`
    : oppPpda >= 12 ? `${p.oppName} joue de façon équilibrée (PPDA ${oppPpda.toFixed(1)}) : ni pressing ni bloc bas, un match classique à prévoir.`
    : `${p.oppName} pratique un pressing haut (PPDA ${oppPpda.toFixed(1)}) : ils montent agressivement, ce qui crée des espaces dans leur dos.`;

  // Style: expliquer l'impact sur le joueur
  let styleTxt;
  const csDef = cs; // same CS% for DEF — already computed above with bookmaker formula

  if (p.position === "DEF") {
    styleTxt = csDef >= 35 ? `Probabilité de CS : ${csDef}% — c'est très jouable face à ${p.oppName}. ${p.aa5 >= 18 ? `En plus, avec un AA5 de ${Math.round(p.aa5)}, ${lastName} monte beaucoup et accumule des actions offensives — le combo CS + AA peut faire exploser le score.` : `Le bonus CS (+10 pts) peut faire une grosse différence.`}`
      : csDef >= 22 ? `Probabilité de CS : ${csDef}% — possible mais pas garanti face à ${p.oppName}. ${p.aa5 >= 18 ? `L'atout de ${lastName}, c'est son All-Around très élevé (${Math.round(p.aa5)}) qui sécurise le score même sans CS.` : `Il faudra compter sur la solidité défensive.`}`
      : `Probabilité de CS : seulement ${csDef}% — ${p.oppName} est trop offensif. ${p.aa5 >= 18 ? `Mais ${lastName} compense avec son All-Around exceptionnel (${Math.round(p.aa5)}) : il crée, passe et monte constamment.` : `Sans CS, le score pourrait être moyen.`}`;
  } else if (p.position === "MIL") {
    if (p.aa5 >= 15) {
      styleTxt = oppPpda >= 15 ? `Jackpot pour ${lastName} ! Face au bloc bas de ${p.oppName}, son équipe va monopoliser le ballon. Avec un AA5 de ${Math.round(p.aa5)}, chaque minute de possession = passes décisives, duels gagnés, actions offensives. Score monster garanti.`
        : oppPpda < 12 ? `${p.oppName} presse haut — match ouvert avec beaucoup de duels et de transitions. Avec son AA5 de ${Math.round(p.aa5)}, ${lastName} va accumuler des points dans l'intensité.`
        : `Match équilibré face à ${p.oppName}. Le profil All-Around de ${lastName} (AA5: ${Math.round(p.aa5)}) lui permet de scorer des points dans tous les registres.`;
    } else {
      styleTxt = oppXga > 1.5 ? `La défense de ${p.oppName} est perméable (${oppXga.toFixed(2)} xGA) — ${lastName} et son équipe auront des occasions. Profil plus offensif que All-Around.`
        : `${p.oppName} est solide défensivement — ${lastName} aura moins d'espaces. Il faudra compter sur sa régularité plutôt que sur un gros match offensif.`;
    }
  } else { // ATT
    styleTxt = oppXga > 1.6 ? `La défense de ${p.oppName} est une vraie passoire (${oppXga.toFixed(2)} xGA/match). ${lastName} devrait avoir plein d'occasions — contexte rêvé pour un attaquant.`
      : oppXga > 1.3 ? `${p.oppName} encaisse régulièrement — des occasions seront à saisir pour ${lastName}. ${oppPpda < 12 ? "Leur pressing haut laisse des espaces dans le dos, parfait pour les contres." : ""}`
      : `${p.oppName} a une défense solide — match compliqué pour ${lastName}. ${oppPpda >= 15 ? "En plus, leur bloc bas laisse très peu d'espaces." : "Il faudra un éclair de génie pour marquer."}`;
  }

  return {
    situation: `${formeTxt} ${tituTxt} (${p.titu_pct}%). Il joue ${haLabel} face à ${p.oppName}. ${floorTxt}`,
    adversaire: `${p.oppName} ${oppLieu} et ${oppDefTxt} ${oppStyleTxt}`,
    style: styleTxt,
    conclusion: `Avec un D-Score de ${p.ds}, ${lastName} est ${p.ds >= 70 ? "un top pick cette semaine. Contexte exceptionnel, fonce !" : p.ds >= 60 ? "un bon choix. Le contexte est favorable." : p.ds >= 50 ? "un pick correct mais pas exceptionnel. Compare avec les alternatives." : "un pick risqué. Cherche une meilleure option."}`,
  };
}

function MiniHistogram({ scores }) {
  const h = 28, bw = 7;
  const rev = (scores || []).slice(0, 5).slice().reverse();
  const gc = s => s >= 75 ? "#06D6A0" : s >= 60 ? "#2EC4B6" : s >= 45 ? "#E9C46A" : s >= 30 ? "#F4A261" : "#E76F51";
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: "2px", justifyContent: "center", height: h }}>
      {rev.map((s, i) => (
        <div key={i} style={{
          width: bw, borderRadius: "2px 2px 0 0",
          height: `${Math.max((s / 100) * h, 5)}px`,
          background: s >= 100 ? "linear-gradient(180deg,#fff,#C0C0C0,#E8E8E8,#A0A0A0)" : gc(s),
          opacity: i === rev.length - 1 ? 1 : 0.75,
          border: s >= 100 ? "1px solid rgba(255,255,255,0.6)" : "1px solid rgba(255,255,255,0.12)",
          boxShadow: s >= 100 ? "0 0 6px rgba(255,255,255,0.4)" : "none",
        }} />
      ))}
    </div>
  );
}

function Stars({ n }) {
  const isFive = n >= 5;
  return (
    <div style={{ display: "flex", gap: "2px", justifyContent: "center", animation: isFive ? "starPulse 2s ease-in-out infinite" : "none", filter: isFive ? "drop-shadow(0 0 4px #FBBF24)" : "none" }}>
      {Array.from({ length: 5 }, (_, i) => (
        <svg key={i} width="11" height="11" viewBox="0 0 24 24">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
            fill={i < n ? (isFive ? "#FFD700" : "#FBBF24") : "rgba(255,255,255,0.08)"} stroke={i < n ? (isFive ? "#FFA500" : "#F59E0B") : "none"} strokeWidth="0.5" />
        </svg>
      ))}
    </div>
  );
}

function PlayerCard({ player, isSelected, onClick, logos = {} }) {
  const pc = PC[player.position];
  const conf = player.ds >= 75 ? 5 : player.ds >= 60 ? 4 : player.ds >= 50 ? 3 : player.ds >= 40 ? 2 : player.ds >= 30 ? 1 : 0;

  // Position-based card gradient (deep, diagonal, futuristic)
  const cardBg = {
    GK: `linear-gradient(145deg, #0a1e30 0%, #0d2a42 20%, #081c2e 45%, ${pc}15 70%, #06141f 100%)`,
    DEF: `linear-gradient(145deg, #0d0c28 0%, #131242 20%, #0c0b30 45%, ${pc}15 70%, #080720 100%)`,
    MIL: `linear-gradient(145deg, #180c2c 0%, #221248 20%, #180c34 45%, ${pc}15 70%, #0e0620 100%)`,
    ATT: `linear-gradient(145deg, #280c16 0%, #381020 20%, #2a0c18 45%, ${pc}15 70%, #18060e 100%)`,
  }[player.position] || `linear-gradient(145deg, #1a1040, #0d0820)`;

  return (
    <div onClick={onClick} style={{ textAlign: "center", cursor: "pointer", width: "114px" }}>
      <div style={{
        position: "relative", display: "inline-block",
        transform: isSelected ? "scale(1.06) translateY(-3px)" : "scale(1)",
        transition: "all 0.25s cubic-bezier(0.4,0,0.2,1)",
        filter: isSelected ? `drop-shadow(0 0 18px ${pc}50)` : "drop-shadow(0 4px 12px rgba(0,0,0,0.4))",
      }}>
        <div style={{
          width: 110, height: 156, borderRadius: "12px",
          background: cardBg,
          border: `1.5px solid ${isSelected ? `${pc}BB` : `${pc}20`}`,
          display: "flex", flexDirection: "column", alignItems: "center",
          padding: "4px 4px 0", position: "relative", overflow: "hidden",
          boxShadow: isSelected
            ? `inset 0 1px 0 rgba(255,255,255,0.1), 0 0 20px ${pc}25`
            : "inset 0 1px 0 rgba(255,255,255,0.06)",
        }}>
          {/* ── Relief: diagonal shine streak ── */}
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, rgba(255,255,255,0.08) 0%, transparent 35%, transparent 65%, rgba(255,255,255,0.04) 100%)", pointerEvents: "none" }} />
          {/* ── Relief: top-left radial glow ── */}
          <div style={{ position: "absolute", top: "-20%", left: "-15%", width: "80%", height: "70%", background: `radial-gradient(ellipse, ${pc}18, transparent 65%)`, pointerEvents: "none" }} />
          {/* ── Relief: bottom edge light ── */}
          <div style={{ position: "absolute", bottom: 0, left: "15%", right: "15%", height: 1, background: `linear-gradient(90deg, transparent, ${pc}35, transparent)`, pointerEvents: "none" }} />
          {/* ── Star dust texture ── */}
          <div style={{ position: "absolute", inset: 0, opacity: 0.1, pointerEvents: "none", backgroundImage: "radial-gradient(0.7px 0.7px at 18% 22%, #fff, transparent), radial-gradient(0.5px 0.5px at 55% 68%, #fff, transparent), radial-gradient(0.8px 0.8px at 78% 15%, #fff, transparent), radial-gradient(0.6px 0.6px at 40% 85%, #fff, transparent), radial-gradient(0.5px 0.5px at 85% 55%, #fff, transparent)" }} />
          {/* ── Top accent line ── */}
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent 10%, ${pc}70 50%, transparent 90%)`, pointerEvents: "none" }} />

          {/* Position badge */}
          <div style={{ background: `linear-gradient(135deg,${pc},${pc}CC)`, borderRadius: "3px", padding: "1px 6px", marginTop: "2px", fontSize: "7px", fontWeight: 800, color: "#fff", letterSpacing: "0.06em", position: "relative", zIndex: 1, boxShadow: `0 1px 4px ${pc}40` }}>{player.position}</div>
          {/* Score circle */}
          <div style={{ marginTop: "5px", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", zIndex: 1 }}>
            <div style={{
              width: 38, height: 38, borderRadius: "50%", background: dsBg(player.ds),
              boxShadow: `0 2px 8px rgba(0,0,0,0.5), 0 0 12px ${dsColor(player.ds)}30`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: "'DM Mono',monospace", fontSize: 16, fontWeight: 700, color: "#fff", border: "2px solid rgba(255,255,255,0.25)",
            }}>{player.ds}</div>
          </div>
          {/* Name */}
          <div style={{ fontSize: "12px", fontWeight: 700, color: "#fff", marginTop: "4px", letterSpacing: "-0.01em", lineHeight: 1.1, position: "relative", zIndex: 1, textShadow: "0 1px 4px rgba(0,0,0,0.5)" }}>{player.name.split(" ").pop()}</div>
          {/* Club name */}
          <div style={{ fontSize: "8px", color: "rgba(255,255,255,0.4)", fontWeight: 500, marginTop: "2px", position: "relative", zIndex: 1, lineHeight: 1.15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%", padding: "0 4px" }}>{player.club}</div>
          {/* Club logo */}
          {logos[player.club] && <img src={`/data/logos/${logos[player.club]}`} alt="" style={{ width: 26, height: 26, objectFit: "contain", marginTop: "3px", position: "relative", zIndex: 1, filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.4))" }} />}
          {/* Mini histogram at bottom */}
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, display: "flex", justifyContent: "center", zIndex: 1 }}>
            <MiniHistogram scores={player.last_5} />
          </div>
        </div>
      </div>
      {/* Stars */}
      <div style={{ marginTop: "6px" }}><Stars n={conf} /></div>
      {/* Opponent badge */}
      <div style={{ marginTop: "4px", fontSize: "8px", color: "rgba(255,255,255,0.5)", display: "inline-flex", alignItems: "center", gap: "3px", background: "rgba(0,0,0,0.5)", padding: "2px 6px", borderRadius: "4px", backdropFilter: "blur(4px)" }}>
        <span style={{ fontSize: "10px", lineHeight: 1 }}>{player.isHome ? "🏠" : "✈️"}</span>
        {logos[player.oppName] && <img src={`/data/logos/${logos[player.oppName]}`} alt="" style={{ width: 10, height: 10, objectFit: "contain" }} />}
        <span style={{ fontWeight: 600 }}>{player.oppName}</span>
      </div>
    </div>
  );
}

function DetailPanel({ player, logos = {} }) {
  if (!player) return (
    <div style={{ textAlign: "center", padding: "30px 16px", color: "rgba(255,255,255,0.15)" }}>
      <div style={{ fontSize: 36, marginBottom: 6 }}>⚽</div>
      <div style={{ fontSize: 13, fontWeight: 600 }}>Clique sur un joueur</div>
    </div>
  );

  const pc = PC[player.position];
  const dsc = dsColor(player.ds);
  const tags = getTags(player);
  const v = genVerdict(player);
  const sc = player.last_5 || [];
  const l2 = sc.length >= 2 ? (sc[0] + sc[1]) / 2 : player.l5;
  const es = player.l5 > 0 ? Math.round((l2 - player.l5) / player.l5 * 100) : 0;
  const oppPpda = player.isHome ? (player.oppTeam.ppda_ext || 12) : (player.oppTeam.ppda_dom || 12);
  const oppXga = player.isHome ? (player.oppTeam.xga_ext || 1.5) : (player.oppTeam.xga_dom || 1.5);
  const oppXg = player.isHome ? (player.oppTeam.xg_ext || 1.3) : (player.oppTeam.xg_dom || 1.3);
  const style = oppPpda >= 15 ? "Bloc bas" : oppPpda >= 12 ? "Équilibré" : "Pressing";
  const defXga = player.playerTeam ? (player.isHome ? (player.playerTeam.xga_dom || 1.3) : (player.playerTeam.xga_ext || 1.5)) : 1.3;
  const csVal = csProb(defXga, oppXg, player.league);

  return (
    <div style={{ background: `linear-gradient(135deg,rgba(8,8,24,0.98),rgba(15,15,40,0.98))`, border: `1px solid ${pc}20`, borderRadius: "14px", padding: "16px", marginTop: "14px", backdropFilter: "blur(20px)", boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}>
      {/* Hero */}
      <div style={{ display: "flex", alignItems: "center", gap: "14px", padding: "12px 14px", marginBottom: "14px", background: `linear-gradient(135deg,${pc}10,rgba(255,255,255,0.02))`, border: `1px solid ${pc}15`, borderRadius: "10px" }}>
        <div style={{ width: 62, height: 62, borderRadius: "50%", background: dsBg(player.ds), boxShadow: "0 4px 16px rgba(0,0,0,0.4)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", border: "2px solid rgba(255,255,255,0.2)", flexShrink: 0 }}>
          <div style={{ fontFamily: "'DM Mono'", fontSize: "24px", fontWeight: 700, color: "#fff", lineHeight: 1 }}>{player.ds}</div>
          <div style={{ fontSize: "6px", fontWeight: 800, color: "rgba(255,255,255,0.7)", letterSpacing: "0.1em" }}>D-SCORE</div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "16px", fontWeight: 700, color: "#fff" }}>{player.name}</div>
          <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", marginBottom: "6px", display: "flex", alignItems: "center", gap: "4px", flexWrap: "wrap" }}>{logos[player.club] && <img src={`/data/logos/${logos[player.club]}`} alt="" style={{ width: 13, height: 13, objectFit: "contain" }} />}{player.club} · {player.archetype} · {player.isHome ? "🏠 DOM" : "✈️ EXT"} vs {logos[player.oppName] && <img src={`/data/logos/${logos[player.oppName]}`} alt="" style={{ width: 13, height: 13, objectFit: "contain" }} />}{player.oppName}</div>
          <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
            {tags.map(t => <span key={t} style={{ fontSize: "9px", fontWeight: 600, color: dsc, background: `${dsc}15`, border: `1px solid ${dsc}25`, padding: "2px 6px", borderRadius: "3px" }}>{t}</span>)}
          </div>
        </div>
      </div>

      {/* Verdict Deglingo */}
      <div style={{ marginBottom: "14px" }}>
        <div style={{ fontSize: "8px", fontWeight: 800, color: "rgba(255,255,255,0.25)", letterSpacing: "0.12em", marginBottom: "8px", textTransform: "uppercase" }}>💬 Verdict Deglingo</div>
        <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: "10px", borderLeft: `3px solid ${pc}60`, overflow: "hidden" }}>
          {[
            { icon: "📋", title: "Situation & Forme", text: v.situation, col: `${pc}90` },
            { icon: "🎯", title: "Analyse adversaire", text: v.adversaire, col: "#F87171" },
            { icon: player.position === "GK" ? "🧤" : "⚙", title: player.position === "GK" ? "Clean Sheet & Arrêts" : "Style de jeu attendu", text: v.style, col: "#FBBF24" },
            { icon: "✅", title: "Conclusion", text: v.conclusion, col: "#4ADE80" },
          ].map((s, i) => (
            <div key={i} style={{ padding: "10px 12px", borderBottom: i < 3 ? "1px solid rgba(255,255,255,0.04)" : "none", background: i === 3 ? "rgba(255,255,255,0.02)" : "transparent" }}>
              <div style={{ fontSize: "8px", fontWeight: 700, color: s.col, letterSpacing: "0.08em", marginBottom: "4px", textTransform: "uppercase" }}>{s.icon} {s.title}</div>
              <p style={{ fontSize: "12.5px", lineHeight: 1.65, color: i === 3 ? "#fff" : "rgba(255,255,255,0.8)", margin: 0, fontWeight: i === 3 ? 600 : 400 }}>{s.text}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Analyse du match */}
      <div style={{ marginBottom: "14px", padding: "12px", background: `linear-gradient(135deg,${pc}08,rgba(255,255,255,0.02))`, border: `1px solid ${pc}15`, borderRadius: "8px" }}>
        <div style={{ fontSize: "10px", color: `${pc}90`, fontWeight: 800, letterSpacing: "0.12em", marginBottom: "10px" }}>📊 CONTEXTE DU MATCH — {player.name.split(" ").pop().toUpperCase()} vs {player.oppName.toUpperCase()}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: "8px" }}>
          {(player.position === "GK" ? [
            { l: `xG de ${player.oppName}`, desc: oppXg < 1.0 ? `${player.oppName} marque très peu → gros potentiel Clean Sheet` : oppXg < 1.3 ? `${player.oppName} est peu dangereux → CS jouable` : oppXg < 1.6 ? `${player.oppName} attaque correctement → CS 50/50` : `${player.oppName} est très offensif → CS compliqué`, v: oppXg.toFixed(2), c: oppXg < 1.2 ? "#4ADE80" : oppXg < 1.5 ? "#FCD34D" : "#F87171" },
            { l: "Probabilité Clean Sheet", desc: csVal >= 35 ? "Le bonus CS (+10 pts) est très jouable" : csVal >= 22 ? "Bonus CS réaliste si la défense tient" : "Difficile — miser plutôt sur les arrêts", v: `${csVal}%`, c: csVal >= 35 ? "#4ADE80" : csVal >= 22 ? "#FCD34D" : "#F87171" },
            { l: "Potentiel d'arrêts", desc: oppXg > 1.5 ? `${player.oppName} tire beaucoup → arrêts = AA élevé` : `${player.oppName} tire peu → moins d'arrêts mais CS probable`, v: oppXg > 1.5 ? "Élevé" : oppXg > 1.2 ? "Moyen" : "Faible", c: "#fff", sm: true },
            { l: `Forme de ${player.name.split(" ").pop()}`, desc: es > 10 ? "En pleine confiance, hausse nette" : es > 0 ? "Légère progression, bon signe" : es === 0 ? "Performances stables" : "En baisse — surveiller", v: `${es > 0 ? "+" : ""}${es}%`, c: es > 15 ? "#4ADE80" : es > 0 ? "#FCD34D" : "#F87171" },
          ] : player.position === "DEF" ? [
            { l: "Probabilité Clean Sheet", desc: csVal >= 35 ? `${player.oppName} est peu dangereux → CS très jouable (+10 pts)` : csVal >= 22 ? `CS possible si la défense tient face à ${player.oppName}` : `${player.oppName} est trop offensif → CS compliqué`, v: `${csVal}%`, c: csVal >= 35 ? "#4ADE80" : csVal >= 22 ? "#FCD34D" : "#F87171" },
            { l: `Défense de ${player.oppName}`, desc: oppXga < 1.2 ? `${player.oppName} attaque peu → gros potentiel CS` : `${player.oppName} est offensif → CS compliqué`, v: oppXga.toFixed(2) + " xGA", c: oppXga < 1.2 ? "#4ADE80" : oppXga < 1.5 ? "#FCD34D" : "#F87171" },
            { l: `Pressing de ${player.oppName}`, desc: oppPpda >= 15 ? `${player.oppName} défend bas → le joueur aura le ballon` : oppPpda >= 12 ? `${player.oppName} presse modérément → match classique` : `${player.oppName} presse très haut → duels et espaces`, v: oppPpda.toFixed(1), c: "#fff" },
            { l: `Forme de ${player.name.split(" ").pop()}`, desc: es > 10 ? "En pleine confiance, hausse nette" : es > 0 ? "Légère progression, bon signe" : es === 0 ? "Performances stables" : "En baisse — surveiller", v: `${es > 0 ? "+" : ""}${es}%`, c: es > 15 ? "#4ADE80" : es > 0 ? "#FCD34D" : "#F87171" },
          ] : [
            { l: `Défense de ${player.oppName}`, desc: oppXga > 1.5 ? `${player.oppName} encaisse beaucoup → plein d'occasions` : `${player.oppName} est solide → moins d'espaces`, v: oppXga.toFixed(2) + " xGA", c: oppXga > 1.6 ? "#4ADE80" : oppXga > 1.2 ? "#FCD34D" : "#F87171" },
            { l: `Pressing de ${player.oppName}`, desc: oppPpda >= 15 ? `${player.oppName} défend bas → le joueur aura le ballon` : oppPpda >= 12 ? `${player.oppName} presse modérément → match classique` : `${player.oppName} presse très haut → duels et espaces`, v: oppPpda.toFixed(1), c: "#fff" },
            { l: `Style de ${player.oppName}`, desc: style === "Bloc bas" ? `${player.oppName} joue en bloc bas → possession pour l'adversaire` : style === "Pressing" ? `${player.oppName} est agressif → match ouvert` : `${player.oppName} joue de façon équilibrée`, v: style, c: style === "Bloc bas" ? "#4ADE80" : style === "Pressing" ? "#FB923C" : "#FCD34D", sm: true },
            { l: `Forme de ${player.name.split(" ").pop()}`, desc: es > 10 ? "En pleine confiance, hausse nette" : es > 0 ? "Légère progression, bon signe" : es === 0 ? "Performances stables" : "En baisse — surveiller", v: `${es > 0 ? "+" : ""}${es}%`, c: es > 15 ? "#4ADE80" : es > 0 ? "#FCD34D" : "#F87171" },
          ]).map(item => (
            <div key={item.l} style={{ textAlign: "center", background: "rgba(255,255,255,0.02)", borderRadius: "6px", padding: "8px 6px" }}>
              <div style={{ fontSize: "9px", color: "rgba(255,255,255,0.5)", fontWeight: 700, marginBottom: "2px" }}>{item.l}</div>
              <div style={{ fontFamily: item.sm ? "inherit" : "'DM Mono',monospace", fontSize: item.sm ? "14px" : "22px", fontWeight: 700, color: item.c, margin: "4px 0" }}>{item.v}</div>
              <div style={{ fontSize: "8px", color: "rgba(255,255,255,0.35)", lineHeight: 1.3, fontStyle: "italic" }}>{item.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px" }}>
        {[
          { label: "L2", score: Math.round(l2), aa: null },
          { label: "L5", score: Math.round(player.l5), aa: Math.round(player.aa5) },
          { label: "MIN", score: player.min_15 ?? player.floor, aa: null },
        ].map(s => (
          <div key={s.label} style={{ background: "rgba(255,255,255,0.03)", borderRadius: "8px", padding: "8px 6px", textAlign: "center" }}>
            <div style={{ fontSize: "8px", color: "rgba(255,255,255,0.3)", fontWeight: 700, letterSpacing: "0.06em", marginBottom: "4px" }}>{s.label}</div>
            <div style={{ fontFamily: "'DM Mono',monospace", fontSize: "16px", fontWeight: 700, color: "#fff" }}>{s.score}</div>
            {s.aa !== null && <div style={{ fontSize: "7px", color: "#60A5FA", marginTop: "2px" }}>AA {s.aa}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function RecoTab({ players, teams, fixtures, logos = {} }) {
  const [league, setLeague] = useState("L1");
  const [sel, setSel] = useState(null);

  const hasFixtures = !!fixtures?.player_fixtures;
  const matchdays = fixtures?.matchdays || {};

  const so7 = useMemo(() => {
    const lgPlayers = players.filter(p => p.league === league && p.l5 >= 35);
    const lgTeams = teams.filter(t => t.league === league);
    if (!lgTeams.length) return [];

    const pf = fixtures?.player_fixtures || {};

    const scored = lgPlayers.map(p => {
      const fx = pf[p.name];
      let opp, isHome;
      if (fx) {
        // Real fixture data
        opp = lgTeams.find(t => t.name === fx.opp);
        isHome = fx.isHome;
      }
      if (!opp) {
        // Fallback: pick a different team from same league
        opp = lgTeams.find(t => !p.club.includes(t.name) && !t.name.includes(p.club.split(" ")[0])) || lgTeams[0];
        isHome = true;
      }
      const ds = dScoreMatch(p, opp, isHome);
      const pTeam = findTeam(lgTeams, p.club);
      return { ...p, ds, oppName: opp.name, oppTeam: opp, playerTeam: pTeam, isHome };
    }).sort((a, b) => b.ds - a.ds);

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
  }, [players, teams, league, fixtures]);

  const lg = LG_META[league];
  const gk = so7.filter(p => p.position === "GK");
  const def = so7.filter(p => p.position === "DEF");
  const mil = so7.filter(p => p.position === "MIL");
  const att = so7.filter(p => p.position === "ATT");

  const selPlayer = sel ? (() => {
    const pos = sel.replace(/\d/g, "");
    const idx = parseInt(sel.replace(/\D/g, ""));
    const arr = pos === "GK" ? gk : pos === "DEF" ? def : pos === "MIL" ? mil : att;
    return arr[idx] || null;
  })() : null;

  return (
    <div style={{ padding: "0 10px 40px", maxWidth: 480, margin: "0 auto" }}>
      <style>{`
        @keyframes starPulse { 0%,100%{opacity:1;filter:drop-shadow(0 0 4px #FBBF24)} 50%{opacity:0.7;filter:drop-shadow(0 0 8px #FFD700)} }
        @keyframes silverShine { 0%{background-position:200% center} 100%{background-position:-200% center} }
      `}</style>
      {/* League tabs */}
      <div style={{ display: "flex", gap: "4px", marginBottom: "14px" }}>
        {Object.entries(LG_META).map(([k, v]) => (
          <button key={k} onClick={() => { setLeague(k); setSel(null); }} style={{
            flex: 1, padding: "7px 2px", borderRadius: "8px", border: "none", cursor: "pointer",
            background: league === k ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.015)",
            color: league === k ? "#fff" : "rgba(255,255,255,0.22)", fontSize: "11px",
            fontWeight: league === k ? 700 : 500, fontFamily: "Outfit",
            outline: league === k ? `1px solid ${v.accent}40` : "none", transition: "all 0.2s",
          }}>
            {v.flag}<br /><span style={{ fontSize: "8px" }}>{v.name.length > 10 ? v.name.split(" ")[0] : v.name}</span>
          </button>
        ))}
      </div>

      {/* Title */}
      <div style={{ textAlign: "center", marginBottom: "8px" }}>
        <div style={{ fontSize: "28px", fontWeight: 900, letterSpacing: "-0.03em", background: "linear-gradient(135deg,#fff 0%,#A5B4FC 40%,#C084FC 80%,#E879F9 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>SO7 DEGLINGO</div>
        <div style={{ fontSize: "13px", fontWeight: 600, color: "rgba(255,255,255,0.45)", marginTop: "2px" }}>
          {lg.flag} {lg.name}{matchdays[league] ? ` · Journée ${matchdays[league]}` : ""}
        </div>
        {!hasFixtures && <div style={{ fontSize: "9px", color: "rgba(255,150,50,0.5)", marginTop: "4px" }}>⚠ Pas de calendrier — adversaires simulés</div>}
      </div>

      {/* PITCH */}
      <div style={{
        background: "radial-gradient(ellipse at 50% 0%,rgba(20,90,45,0.5) 0%,transparent 55%),radial-gradient(ellipse at 50% 100%,rgba(20,90,45,0.5) 0%,transparent 55%),linear-gradient(180deg,#0E3F20 0%,#0B3018 25%,#0D3B1E 50%,#0B3018 75%,#0E3F20 100%)",
        borderRadius: "18px", padding: "20px 6px 24px", position: "relative", overflow: "hidden",
        border: "1px solid rgba(255,255,255,0.07)", boxShadow: "0 12px 48px rgba(0,0,0,0.6)",
      }}>
        {/* Grid pattern */}
        <div style={{ position: "absolute", inset: 0, opacity: 0.035, backgroundImage: "repeating-linear-gradient(90deg,transparent,transparent 10px,rgba(255,255,255,0.5) 10px,rgba(255,255,255,0.5) 11px)", pointerEvents: "none" }} />
        {/* Field border */}
        <div style={{ position: "absolute", left: "10px", right: "10px", bottom: "10px", top: "10px", borderBottom: "1px solid rgba(255,255,255,0.06)", borderLeft: "1px solid rgba(255,255,255,0.06)", borderRight: "1px solid rgba(255,255,255,0.06)", borderRadius: "0 0 12px 12px", pointerEvents: "none" }} />
        {/* Midline */}
        <div style={{ position: "absolute", top: "38%", left: "14px", right: "14px", height: "1px", background: "rgba(255,255,255,0.05)", pointerEvents: "none" }} />
        {/* Center circle */}
        <div style={{ position: "absolute", top: "38%", left: "50%", transform: "translate(-50%,-50%)", width: 130, height: 130, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.05)", pointerEvents: "none" }} />
        {/* Watermark */}
        <div style={{ position: "absolute", top: "38%", left: "50%", transform: "translate(-50%,-50%)", textAlign: "center", pointerEvents: "none", zIndex: 0 }}>
          <div style={{ fontWeight: 900, fontSize: "32px", letterSpacing: "0.1em", lineHeight: 1, color: "rgba(255,255,255,0.05)", textTransform: "uppercase" }}>{lg.name}</div>
          <div style={{ fontWeight: 900, fontSize: "18px", letterSpacing: "0.08em", lineHeight: 1.15, color: "rgba(255,255,255,0.06)", textTransform: "uppercase" }}>DEGLINGO<br />PICK<br />SORARE</div>
        </div>
        {/* Penalty box bottom */}
        <div style={{ position: "absolute", bottom: "3%", left: "22%", right: "22%", height: "16%", borderTop: "1px solid rgba(255,255,255,0.05)", borderLeft: "1px solid rgba(255,255,255,0.05)", borderRight: "1px solid rgba(255,255,255,0.05)", borderRadius: "4px 4px 0 0", pointerEvents: "none" }} />

        {/* Formation */}
        <div style={{ position: "relative", zIndex: 2, display: "flex", flexDirection: "column", gap: "18px", alignItems: "center" }}>
          <div style={{ display: "flex", justifyContent: "center", gap: "80px" }}>
            {att.map((p, i) => <PlayerCard key={i} player={p} isSelected={sel === `ATT${i}`} onClick={() => setSel(sel === `ATT${i}` ? null : `ATT${i}`)} logos={logos} />)}
          </div>
          <div style={{ width: "100%", display: "flex", justifyContent: "space-between", padding: "0 25px" }}>
            {mil.map((p, i) => <PlayerCard key={i} player={p} isSelected={sel === `MIL${i}`} onClick={() => setSel(sel === `MIL${i}` ? null : `MIL${i}`)} logos={logos} />)}
          </div>
          <div style={{ display: "flex", justifyContent: "center", gap: "60px" }}>
            {def.map((p, i) => <PlayerCard key={i} player={p} isSelected={sel === `DEF${i}`} onClick={() => setSel(sel === `DEF${i}` ? null : `DEF${i}`)} logos={logos} />)}
          </div>
          <div style={{ display: "flex", justifyContent: "center" }}>
            {gk.map((p, i) => <PlayerCard key={i} player={p} isSelected={sel === `GK${i}`} onClick={() => setSel(sel === `GK${i}` ? null : `GK${i}`)} logos={logos} />)}
          </div>
        </div>
      </div>

      {/* Detail panel */}
      <DetailPanel player={selPlayer} logos={logos} />

      {/* CTA */}
      <div style={{ marginTop: "12px", padding: "18px", textAlign: "center", background: "linear-gradient(135deg,rgba(34,197,94,0.05),rgba(99,102,241,0.05))", border: "1px solid rgba(34,197,94,0.12)", borderRadius: "12px" }}>
        <div style={{ fontSize: "14px", fontWeight: 700, marginBottom: "8px" }}>🎯 Joue ce SO7 sur Sorare</div>
        <a href="http://sorare.pxf.io/Deglingo" target="_blank" rel="noopener noreferrer" style={{ display: "inline-block", padding: "10px 28px", borderRadius: "10px", background: "linear-gradient(135deg,#22C55E,#16A34A)", color: "#fff", fontSize: "13px", fontWeight: 700, textDecoration: "none", boxShadow: "0 4px 16px rgba(34,197,94,0.25)" }}>Créer mon compte →</a>
      </div>
    </div>
  );
}
