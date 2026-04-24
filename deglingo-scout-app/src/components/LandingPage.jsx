import { useMemo, useState } from "react";
import { dScoreMatch } from "../utils/dscore";

// Cartes Sorare — Stellar (common, fond galaxy) + Pro (rare, holo doré)
const SHOWCASE_CARDS = [
  {
    name: "Bruno Fernandes", pos: "MIL",
    // Stellar Nights common (d3b53aae — 4/50, xp=0, rarest non-legacy)
    stellar: "https://assets.sorare.com/cardsamplepicture/d3b53aae-683a-4449-979c-44a20b6ba026/picture/tinified-81ea65f729863eb53d1d21ebbe510b49.png",
    pro:     "https://assets.sorare.com/card/1290539a-668e-4678-8714-dc0329fe8cf2/picture/tinified-00ca880406af133021da0474a0e3362d.png",
  },
  {
    name: "Lamine Yamal", pos: "ATT",
    // Stellar Nights common (468e803d — 2/50, fond galaxy violet confirmé visuellement)
    stellar: "https://assets.sorare.com/cardsamplepicture/468e803d-7580-4a1e-a7a6-dae371e8cf1d/picture/tinified-38989f6f9e634eec76cc25acaba03084.png",
    pro:     "https://assets.sorare.com/card/16db3f08-f9e4-40b5-ba74-da2620d8ef8f/picture/tinified-dcc4912c32f04c442a3035d03953b3b3.png",
  },
  {
    name: "Kylian Mbappé", pos: "ATT",
    // Stellar Nights common (7ac68f27 — confirmé par slug utilisateur)
    stellar: "https://assets.sorare.com/cardsamplepicture/7ac68f27-df55-4780-8cfe-e9db4e6aa0fa/picture/tinified-f602555563a6fb31be3bbd87cc71965d.png",
    pro:     "https://assets.sorare.com/card/0745baf1-be7d-4450-a434-b0dac9c46719/picture/tinified-4a44d355d026bad26b0442dacb77dcd3.png",
  },
  {
    name: "Cole Palmer", pos: "MIL",
    // Stellar Nights common (c00654f5 — 2/50, rarest = Stellar confirmé)
    stellar: "https://assets.sorare.com/cardsamplepicture/57f8457c-b51f-418e-aeef-a313cc9ed4d8/picture/tinified-f8ce522ce51c40f7028ca76b39730572.png",
    pro:     "https://assets.sorare.com/card/84a09895-5e8b-4b88-be16-e68fc98235aa/picture/tinified-0a6f73f93c4e4a64badbf07d3d6aa2cd.png",
  },
  {
    name: "Ousmane Dembélé", pos: "ATT",
    // Stellar Nights common (f103a860 — 2/50, xp=0, rarest non-legacy)
    stellar: "https://assets.sorare.com/cardsamplepicture/f103a860-8b47-4b6b-96fe-d1b48bc3083d/picture/tinified-699c67b478227097061191ddc149fc07.png",
    pro:     "https://assets.sorare.com/card/50b142ee-a741-49ba-97e5-7dce14130af3/picture/tinified-2eae4553c2dd7e62a2f09051c4013ac6.png",
  },
];
const CARD_PLAYERS = SHOWCASE_CARDS.map(c => c.name);
const CARD_COLORS = [
  "linear-gradient(145deg,#1a0533,#2d1065,#4c1d95)",
  "linear-gradient(145deg,#03100f,#064e3b,#065f46)",
  "linear-gradient(145deg,#0c0a1e,#1e1b4b,#312e81)",
  "linear-gradient(145deg,#0f172a,#1e3a5f,#1e40af)",
  "linear-gradient(145deg,#1a0a0a,#7f1d1d,#991b1b)",
];

function SorareCard({ player, idx, style, mode = "stellar" }) {
  const cardUrl = mode === "pro" ? (player?.sorare_pro_url || player?.sorare_stellar_url) : (player?.sorare_stellar_url || player?.sorare_card_url);
  const photoUrl = player?.sorare_player_url;
  const name = player?.name || CARD_PLAYERS[idx];
  const pos = player?.position || "ATT";
  const dscore = player?.dsMatch ?? player?.l5 ?? "—";
  const posColors = { GK: "#4FC3F7", DEF: "#818CF8", MIL: "#C084FC", ATT: "#F87171" };

  // Mode Pro → vraie carte rare Sorare (holo doré)
  if (mode === "pro" && cardUrl) {
    return (
      <div style={{
        width: 155, flexShrink: 0, position: "relative",
        borderRadius: 0, overflow: "visible",
        boxShadow: "0 20px 60px rgba(0,0,0,0.8), 0 0 30px rgba(251,191,36,0.15)",
        transform: `rotate(${[-4, -1.5, 0, 1.5, 4][idx]}deg) translateY(${[8, 4, 0, 4, 8][idx]}px)`,
        transition: "transform 0.3s ease, box-shadow 0.4s ease",
        aspectRatio: "0.72",
        ...style,
      }}>
        <img src={cardUrl} alt={name} style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
      </div>
    );
  }

  return (
    <div style={{
      width: 155, flexShrink: 0, position: "relative",
      borderRadius: cardUrl ? 0 : 16,
      overflow: cardUrl ? "visible" : "hidden",
      boxShadow: "0 20px 60px rgba(0,0,0,0.7), 0 0 40px rgba(139,92,246,0.15)",
      transform: `rotate(${[-4, -1.5, 0, 1.5, 4][idx]}deg) translateY(${[8, 4, 0, 4, 8][idx]}px)`,
      transition: "transform 0.3s ease",
      aspectRatio: "0.72",
      ...style,
    }}>
      {cardUrl ? (
        /* Vraie carte Sorare Stellar — contain pour ne pas couper les bords */
        <img src={cardUrl} alt={name} style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
      ) : (
        /* Fallback gradient */
        <div style={{
          width: "100%", height: "100%",
          background: CARD_COLORS[idx % CARD_COLORS.length],
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end",
          padding: "12px 10px", boxSizing: "border-box",
          border: "1px solid rgba(255,255,255,0.08)",
        }}>
          {photoUrl && (
            <img src={photoUrl} alt={name} style={{ width: "100%", position: "absolute", top: 0, left: 0, height: "75%", objectFit: "cover", objectPosition: "top" }} />
          )}
          <div style={{ position: "relative", zIndex: 2, textAlign: "center", width: "100%" }}>
            <div style={{ background: "rgba(0,0,0,0.7)", borderRadius: 8, padding: "6px 8px" }}>
              <div style={{ fontSize: 8, fontWeight: 700, color: posColors[pos] || "#A5B4FC", letterSpacing: 1, textTransform: "uppercase" }}>{pos}</div>
              <div style={{ fontSize: 10, fontWeight: 800, color: "#fff", marginTop: 2, lineHeight: 1.2 }}>{name}</div>
              <div style={{ fontSize: 16, fontWeight: 900, color: "#C4B5FD", marginTop: 4 }}>{typeof dscore === "number" ? Math.round(dscore) : dscore}</div>
            </div>
          </div>
          {/* Holographic shimmer */}
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg,transparent 30%,rgba(255,255,255,0.06) 50%,transparent 70%)", pointerEvents: "none" }} />
        </div>
      )}
    </div>
  );
}

const POS_COLORS = { GK: "#4FC3F7", DEF: "#818CF8", MIL: "#C084FC", ATT: "#F87171" };
const LEAGUE_FLAGS = { L1: "fr", PL: "gb-eng", Liga: "es", Bundes: "de" };

const HOLO_STYLE = {
  background: "linear-gradient(90deg,#4ade80,#22d3ee,#818cf8,#c084fc,#f472b6,#4ade80)",
  backgroundSize: "200% 100%",
  WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
  animation: "silverShine 2s linear infinite",
  fontWeight: 900,
};

function MiniDbRow({ p, rank }) {
  const score = p.dsMatch ?? p.l5 ?? 0;
  const statColor = v => v == null ? "rgba(255,255,255,0.2)" : v >= 70 ? "#4ade80" : v >= 50 ? "#fbbf24" : "#f87171";
  const flag = LEAGUE_FLAGS[p.league || ""];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "3px 6px", borderRadius: 5, background: rank % 2 === 0 ? "rgba(255,255,255,0.03)" : "transparent" }}>
      <span style={{ fontSize: 7, color: "rgba(255,255,255,0.2)", width: 8, flexShrink: 0 }}>{rank}</span>
      <span style={{ fontSize: 7, fontWeight: 800, color: POS_COLORS[p.position] || "#A5B4FC", background: `${POS_COLORS[p.position] || "#A5B4FC"}22`, borderRadius: 3, padding: "1px 3px", flexShrink: 0, minWidth: 20, textAlign: "center" }}>{p.position}</span>
      <span style={{ fontSize: 9, fontWeight: 700, color: "#fff", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
      <span style={{ fontSize: 8, color: "rgba(255,255,255,0.5)", minWidth: 28, textAlign: "right", flexShrink: 0, whiteSpace: "nowrap" }}>{p.goals != null ? `${p.goals}G ${p.assists ?? 0}A` : "—"}</span>
      <span style={{ fontSize: 8, color: statColor(p.l2), minWidth: 16, textAlign: "right", flexShrink: 0 }}>{p.l2 != null ? Math.round(p.l2) : "—"}</span>
      <span style={{ fontSize: 8, color: "rgba(255,255,255,0.25)", minWidth: 16, textAlign: "right", flexShrink: 0 }}>{p.aa2 != null ? Math.round(p.aa2) : "—"}</span>
      <span style={{ fontSize: 8, color: statColor(p.l10), minWidth: 16, textAlign: "right", flexShrink: 0 }}>{p.l10 != null ? Math.round(p.l10) : "—"}</span>
      <span style={{ fontSize: 8, color: "rgba(255,255,255,0.25)", minWidth: 16, textAlign: "right", flexShrink: 0 }}>{p.aa10 != null ? Math.round(p.aa10) : "—"}</span>
      {flag && <img src={`https://flagcdn.com/16x12/${flag}.png`} alt="" style={{ width: 12, height: 9, borderRadius: 2, flexShrink: 0 }} />}
      <span style={{ fontSize: 11, minWidth: 22, textAlign: "right", flexShrink: 0, ...HOLO_STYLE }}>{Math.round(score)}</span>
    </div>
  );
}

const DB_FEATURED = ["Bruno Fernandes", "Vitinha", "Dominik Szoboszlai", "Michael Olise", "Lamine Yamal"];

function FeatureBoxes({ players, showcasePlayers, lang = "fr" }) {
  const t = T[lang];
  const fakeOpp = { xg_dom: 1.3, xg_ext: 1.3, ppda_dom: 10, ppda_ext: 10, xga_dom: 1.3, xga_ext: 1.5 };

  const topPlayers = useMemo(() => {
    if (!players) return [];
    const featured = DB_FEATURED.map(name => players.find(p => p.name === name)).filter(Boolean);
    const list = featured.length === 5 ? featured : [...players].filter(p => p.l5 > 0).sort((a,b) => (b.l5??0)-(a.l5??0)).slice(0,5);
    return list
      .map(p => {
        let ds = p.l5 || 0;
        try { ds = Math.round(dScoreMatch(p, fakeOpp, true)); } catch(e) {}
        return { ...p, dsMatch: ds };
      })
      .sort((a, b) => (b.dsMatch ?? 0) - (a.dsMatch ?? 0));
  }, [players]);

  // Best picks SO5: GK + DEF + MIL + MIL + ATT — meilleur par poste sur TOUS les joueurs
  const bestPicks = useMemo(() => {
    if (!players) return [];
    const withDs = players.filter(p => p.l5 > 0).map(p => {
      let ds = p.l5 || 0;
      try { ds = Math.round(dScoreMatch(p, fakeOpp, true)); } catch(e) {}
      return { ...p, dsMatch: ds };
    });
    const byPos = pos => [...withDs].filter(p => p.position === pos).sort((a,b) => (b.dsMatch??0)-(a.dsMatch??0));
    const gk = byPos("GK")[0];
    const def = byPos("DEF")[0];
    const mils = byPos("MIL");
    const att = byPos("ATT")[0];
    return [gk, def, mils[0], mils[1], att].filter(Boolean);
  }, [players]);

  const boxStyle = {
    background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 16, overflow: "hidden", display: "flex", flexDirection: "column",
  };
  const headerStyle = { padding: "6px 10px 5px", borderBottom: "1px solid rgba(255,255,255,0.06)" };

  return (
    <div style={{
      display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10,
      maxWidth: 1100, width: "100%", padding: "0 24px 12px",
    }}>
      {/* Box 1 — Database D-Score */}
      <div style={boxStyle}>
        <div style={headerStyle}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: "#C4B5FD" }}>📊 Database · D-Score</span>
            <span style={{ fontSize: 8, color: "rgba(196,181,253,0.6)", background: "rgba(196,181,253,0.08)", borderRadius: 4, padding: "2px 6px", whiteSpace: "nowrap" }}>AA · 6 catégories dispo</span>
          </div>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>Socle · Contexte · Momentum · Passing · Attacking · Defending…</div>
        </div>
        <div style={{ padding: "4px 4px 6px" }}>
          <div style={{ display: "flex", gap: 5, padding: "2px 6px 4px", marginBottom: 2, borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
            <span style={{ width: 8 }} />
            <span style={{ minWidth: 20 }} />
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 7, color: "rgba(255,255,255,0.25)", minWidth: 28, textAlign: "right", flexShrink: 0 }}>G+A</span>
            {["L2","AA2","L10","AA10"].map(h => (
              <span key={h} style={{ fontSize: 7, color: h==="AA2"||h==="AA10" ? "rgba(196,181,253,0.5)" : "rgba(255,255,255,0.3)", minWidth: 16, textAlign: "right", flexShrink: 0 }}>{h}</span>
            ))}
            <span style={{ minWidth: 12 }} />
            <span style={{ fontSize: 7, color: "#C4B5FD", fontWeight: 800, minWidth: 22, textAlign: "right", flexShrink: 0 }}>D</span>
          </div>
          {topPlayers.map((p, i) => <MiniDbRow key={p.name} p={p} rank={i + 1} />)}
        </div>
      </div>

      {/* Box 2 — Best Pick SO5/SO7 */}
      <div style={boxStyle}>
        <div style={headerStyle}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#A5B4FC" }}>{t.boxBest}</div>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>{t.boxBestSub}</div>
        </div>
        <div style={{ padding: "5px 7px 6px", display: "flex", flexDirection: "column", gap: 3 }}>
          {bestPicks.map((p, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 5, background: "rgba(255,255,255,0.04)", borderRadius: 6, padding: "4px 7px" }}>
              <span style={{ fontSize: 7, fontWeight: 800, color: POS_COLORS[p.position], background: `${POS_COLORS[p.position]}22`, borderRadius: 3, padding: "1px 4px", flexShrink: 0, minWidth: 24, textAlign: "center" }}>{p.position}</span>
              <span style={{ fontSize: 9, fontWeight: 700, color: "#fff", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
              <span style={{ fontSize: 10, fontWeight: 900, color: "#4ade80", flexShrink: 0 }}>{Math.round(p.dsMatch ?? p.l5 ?? 0)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Box 3 — Mission du jour Sorare Pro */}
      <div style={boxStyle}>
        <div style={headerStyle}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ fontSize: 12 }}>⚡</span>
              <span style={{ fontSize: 11, fontWeight: 800, color: "#fbbf24" }}>{t.boxMission}</span>
            </div>
            <span style={{ fontSize: 7, fontWeight: 700, color: "rgba(251,191,36,0.6)", background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 4, padding: "2px 5px" }}>Sorare Pro</span>
          </div>
          <div style={{ fontSize: 8, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>{t.boxMissionSub}</div>
        </div>
        <div style={{ padding: "4px 6px 5px", display: "flex", gap: 6, alignItems: "center" }}>
          {/* Missions — bandes étroites à gauche */}
          <div style={{ display: "flex", flexDirection: "column", gap: 2, width: 112, flexShrink: 0 }}>
            {[
              { label: t.mStellar, sub: t.mStellarSub, color: "#C4B5FD", stellar: true },
              { label: t.mEssences, sub: t.mEssencesSub, color: "#fbbf24" },
              { label: t.mCraft, sub: t.mCraftSub, color: "#34d399" },
              { label: t.mHebdo, sub: t.mHebdoSub, color: "#a78bfa" },
            ].map(m => (
              <div key={m.label} style={{ display: "flex", alignItems: "center", gap: 4, background: `${m.color}0d`, border: `1px solid ${m.color}22`, borderRadius: 5, padding: "3px 6px" }}>
                {m.stellar
                  ? <img src="/Stellar.png" alt="" style={{ width: 10, height: 10, objectFit: "contain", flexShrink: 0 }} />
                  : <div style={{ width: 4, height: 4, borderRadius: "50%", background: m.color, flexShrink: 0 }} />
                }
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: m.color, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.label}</div>
                  <div style={{ fontSize: 7.5, color: "rgba(255,255,255,0.35)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.sub}</div>
                </div>
              </div>
            ))}
          </div>
          {/* Mini cartes Pro à droite — plus grosses */}
          <div style={{ display: "flex", gap: 2, flex: 1, justifyContent: "center" }}>
            {showcasePlayers.slice(0, 3).map((p, i) => p && (
              <div key={i} style={{ flex: 1, maxWidth: 56, aspectRatio: "0.72", flexShrink: 0 }}>
                <img src={p.sorare_pro_url || p.sorare_card_url} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const T = {
  fr: {
    // Hero
    heroEyebrow: "Sorare SO7 · Saison 2025-26",
    heroTitle: "DEGLINGO SCOUT",
    heroHighlight: "Ton arme secrète sur SORARE",
    heroSub: "Algo propriétaire · 5 ligues · 3 500+ joueurs",
    heroSub2: "Pensé pour Manager Débutant (Stellar) et Manager Pro",
    ctaEnter: "Entrer dans le Scout",
    ctaDemo: "Voir ce que fait Scout",
    // Affiliate boxes
    affDebTag: "MANAGER DÉBUTANT",
    affDebTitle: "Sorare Stellar",
    affDebBadge: "100% GRATUIT",
    affDebLead: "Ouvre ton pack de démarrage et aligne tes premières équipes sans dépenser.",
    affDebB1: "Pack Stellar offert à l'inscription",
    affDebB2: "Joue SO7 sans mettre un centime",
    affDebB3: "Récompenses cartes et essences chaque GW",
    affDebCta: "Ouvrir mon pack gratuit",
    affProTag: "MANAGER PRO",
    affProTitle: "Sorare Pro",
    affProBadge: "OFFRE EXCLUSIVE",
    affProLead: "Rejoins les compétitions Pro et reçois 100€ de crédits offerts.",
    affProB1: "100€ de crédits offerts à l'inscription",
    affProB2: "Compétitions avec gains en ETH et cartes",
    affProB3: "Accès Rare, Limited, Super Rare, Unique",
    affProCta: "Activer mon offre 100€",
    // Pour qui
    whoEyebrow: "POUR QUI ?",
    whoTitle: "Scout t'accompagne dans les deux modes",
    whoSub: "Débutant ou compétiteur aguerri — Scout transforme tes choix en victoires.",
    debQ: "Tu débutes sur Stellar ?",
    debLead: "Scout te donne les bons réflexes dès ta première équipe, sans maîtriser les stats.",
    debB1: "Stellar Team Builder : aligne tes cartes en un clic",
    debB2: "Floor titu 35+ : joueurs fiables identifiés",
    debB3: "D-Score multi-jours (Mer → Mar)",
    debB4: "Alternatives auto si ton joueur est blessé",
    debB5: "Connexion Sorare : tes cartes directement dans l'app",
    debGo: "Ouvrir Sorare Stellar",
    proQ: "Tu joues Sorare Pro ?",
    proLead: "Scout te donne l'avantage analytique pour dominer les compétitions payantes.",
    proB1: "Best Pick SO5/SO7 : picks figés chaque GW",
    proB2: "Mission du jour : Decisive Picker, Essences, Craft",
    proB3: "Hot Streaks & Leaderboards par ligue",
    proB4: "Database D-Score : 3 500+ joueurs, 5 ligues",
    proB5: "Stats détaillées : Titu%, AA, CS%, xG",
    proGo: "Ouvrir Sorare Pro",
    // Final CTA
    finalTitle: "Prêt à maîtriser Sorare ?",
    finalSub: "Rejoins les managers qui pensent leurs équipes avec data.",
    finalCta: "Entrer dans le Scout",
    // FeatureBoxes (existing)
    boxBest: "Best Pick SO5 / SO7",
    boxBestSub: "Sorare Pro · picks figés chaque GW",
    boxMission: "Mission du Jour",
    boxMissionSub: "Aide à la décision · Essences + Craft Index",
    mStellar: "Stellar Pick",
    mEssences: "Mission Essences",
    mCraft: "Craft Index",
    mHebdo: "Mission Hebdo",
    mStellarSub: "Decisive Picker · 2K",
    mEssencesSub: "Multi-joueurs · GW",
    mCraftSub: "Indice de craft",
    mHebdoSub: "Objectifs · Récomp.",
  },
  en: {
    heroEyebrow: "Sorare SO7 · Season 2025-26",
    heroTitle: "DEGLINGO SCOUT",
    heroHighlight: "Your secret weapon on SORARE",
    heroSub: "Proprietary algo · 5 leagues · 3,500+ players",
    heroSub2: "Built for Beginner Manager (Stellar) and Pro Manager",
    ctaEnter: "Open Scout",
    ctaDemo: "See what Scout does",
    affDebTag: "BEGINNER MANAGER",
    affDebTitle: "Sorare Stellar",
    affDebBadge: "100% FREE",
    affDebLead: "Open your starter pack and play your first squads for free.",
    affDebB1: "Free Stellar pack on sign-up",
    affDebB2: "Play SO7 without spending a cent",
    affDebB3: "Card & essence rewards every GW",
    affDebCta: "Open my free pack",
    affProTag: "PRO MANAGER",
    affProTitle: "Sorare Pro",
    affProBadge: "EXCLUSIVE OFFER",
    affProLead: "Join Pro competitions and get 100€ in credits.",
    affProB1: "100€ in credits on sign-up",
    affProB2: "Real-money competitions (ETH, cards)",
    affProB3: "Rare, Limited, Super Rare, Unique access",
    affProCta: "Activate my 100€ offer",
    whoEyebrow: "WHO IS IT FOR?",
    whoTitle: "Scout backs you in both modes",
    whoSub: "Beginner or seasoned competitor — Scout turns your choices into wins.",
    debQ: "Starting on Stellar?",
    debLead: "Scout gives you the right instincts from day one — no stats degree needed.",
    debB1: "Stellar Team Builder: line up your cards in one click",
    debB2: "Starter floor 35+: reliable players flagged",
    debB3: "Multi-day D-Score (Wed → Tue)",
    debB4: "Auto-alternatives when a player is injured",
    debB5: "Sorare connect: your cards right in the app",
    debGo: "Open Sorare Stellar",
    proQ: "Playing Sorare Pro?",
    proLead: "Scout gives you the analytical edge to dominate paid competitions.",
    proB1: "Best Pick SO5/SO7: picks locked each GW",
    proB2: "Mission of the Day: Decisive Picker, Essences, Craft",
    proB3: "Hot Streaks & Leaderboards by league",
    proB4: "D-Score database: 3,500+ players, 5 leagues",
    proB5: "Detailed stats: Titu%, AA, CS%, xG",
    proGo: "Open Sorare Pro",
    finalTitle: "Ready to master Sorare?",
    finalSub: "Join managers who plan their squads with data.",
    finalCta: "Open Scout",
    boxBest: "Best Pick SO5 / SO7",
    boxBestSub: "Sorare Pro · picks locked each GW",
    boxMission: "Mission of the Day",
    boxMissionSub: "Decision support · Essences + Craft Index",
    mStellar: "Stellar Pick",
    mEssences: "Mission Essences",
    mCraft: "Craft Index",
    mHebdo: "Weekly Mission",
    mStellarSub: "Decisive Picker · 2K",
    mEssencesSub: "Multi-players · GW",
    mCraftSub: "Craft boost",
    mHebdoSub: "Goals · Rewards",
  },
};

// ---- SVG icons (no emojis — UI/UX rule) ----
const IconCheck = ({ color = "#4ADE80", size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none" style={{ display: "block" }} aria-hidden>
    <path d="M4 10.5l4 4 8-9" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const IconArrow = ({ color = "currentColor", size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none" style={{ display: "block" }} aria-hidden>
    <path d="M4 10h12M12 5l5 5-5 5" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const IconCrown = ({ color = "#FBBF24", size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M3 18h18l-1.5-9-5 3.5L12 6l-2.5 6.5L4.5 9 3 18z" fill={color} fillOpacity="0.18" stroke={color} strokeWidth="1.6" strokeLinejoin="round" />
    <circle cx="3" cy="8" r="1.3" fill={color} />
    <circle cx="21" cy="8" r="1.3" fill={color} />
    <circle cx="12" cy="4" r="1.4" fill={color} />
  </svg>
);
const IconSpark = ({ color = "#C4B5FD", size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2z" fill={color} fillOpacity="0.25" stroke={color} strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M19 16l.8 2.2 2.2.8-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16z" fill={color} fillOpacity="0.4" />
  </svg>
);

// ---- Checkmark bullet row ----
function Bullet({ text, tone = "violet" }) {
  const palette = {
    violet: { ring: "rgba(196,181,253,0.35)", bg: "rgba(139,92,246,0.15)", check: "#C4B5FD" },
    gold:   { ring: "rgba(251,191,36,0.4)",   bg: "rgba(251,191,36,0.14)", check: "#FBBF24" },
    green:  { ring: "rgba(74,222,128,0.35)",  bg: "rgba(74,222,128,0.14)", check: "#4ADE80" },
  }[tone] || { ring: "rgba(255,255,255,0.2)", bg: "rgba(255,255,255,0.06)", check: "#fff" };
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "4px 0" }}>
      <span style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
        background: palette.bg, border: `1px solid ${palette.ring}`, marginTop: 1,
      }}>
        <IconCheck color={palette.check} size={12} />
      </span>
      <span style={{ fontSize: 13, lineHeight: 1.4, color: "rgba(255,255,255,0.82)", fontWeight: 500 }}>{text}</span>
    </div>
  );
}

export default function LandingPage({ players, onEnter, onNavigate }) {
  const [cardMode, setCardMode] = useState("stellar"); // "stellar" | "pro"
  const [lang, setLang] = useState("fr");
  const t = T[lang];

  const showcasePlayers = useMemo(() => {
    return SHOWCASE_CARDS.map(c => {
      const pl = players?.find(p => p.name === c.name) || {};
      return { ...pl, name: c.name, position: c.pos, sorare_stellar_url: c.stellar, sorare_pro_url: c.pro };
    });
  }, [players]);

  return (
    <div style={{
      minHeight: "100vh", display: "flex", flexDirection: "column",
      background: "linear-gradient(180deg,#02000c 0%,#07021a 40%,#0a0422 100%)",
      fontFamily: "'Outfit',sans-serif",
      position: "relative",
      zoom: 1.25,
    }}>
      {/* Galaxy background */}
      <div style={{
        position: "absolute", inset: 0, zIndex: 0,
        backgroundImage: "url('/galaxy-bg.jpg')",
        backgroundSize: "cover", backgroundPosition: "center",
        opacity: 0.22,
      }} />

      {/* Gradient overlay */}
      <div style={{
        position: "absolute", inset: 0, zIndex: 1,
        background: "linear-gradient(180deg,rgba(2,0,12,0.65) 0%,rgba(2,0,12,0.35) 30%,rgba(7,2,26,0.7) 70%,rgba(2,0,12,0.95) 100%)",
      }} />

      {/* Content */}
      <div style={{ position: "relative", zIndex: 2, flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>

        {/* ==== HEADER ==== */}
        <div style={{ padding: "14px 24px 0", display: "flex", alignItems: "center", gap: 12, alignSelf: "stretch", maxWidth: 1200, width: "100%", margin: "0 auto" }}>
          <img src="/logo.png" alt="Deglingo Scout" style={{ width: 40, height: 40, objectFit: "contain" }} />
          <div style={{ flex: 1 }}>
            <div style={{
              fontSize: 17, fontWeight: 900, letterSpacing: "-0.5px",
              background: "linear-gradient(90deg,#C0C0C0,#A8E8D0,#B0C4E8,#D4B0E8,#fff,#D4B0E8,#B0C4E8,#C0C0C0)",
              backgroundSize: "200% 100%",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
              animation: "silverShine 3s linear infinite",
            }}>DEGLINGO SCOUT</div>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", letterSpacing: "2px", textTransform: "uppercase" }}>Sorare Analytics</div>
          </div>
          {/* Lang toggle */}
          <button
            onClick={() => setLang(l => l === "fr" ? "en" : "fr")}
            style={{
              background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: 10, padding: "5px 12px", cursor: "pointer",
              fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.75)",
              letterSpacing: 1, fontFamily: "Outfit",
              display: "flex", alignItems: "center", gap: 6,
              flexShrink: 0, backdropFilter: "blur(10px)",
              transition: "background 0.2s, border-color 0.2s",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.1)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.25)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)"; }}
          >
            <img src={`https://flagcdn.com/16x12/${lang === "fr" ? "gb" : "fr"}.png`} alt="" style={{ width: 14, height: 11, borderRadius: 1 }} />
            {lang === "fr" ? "EN" : "FR"}
          </button>
        </div>

        {/* ==== HERO ==== */}
        <section style={{ textAlign: "center", padding: "30px 24px 18px", maxWidth: 1150 }}>
          <h1 style={{
            fontSize: "clamp(22px, 4vw, 40px)", fontWeight: 700, lineHeight: 1.08,
            margin: "0 0 16px", letterSpacing: "-0.02em",
          }}>
            {/* Brand name — same treatment as header logo (Outfit 900 + silver shine) */}
            <span style={{
              fontFamily: "'Outfit', sans-serif",
              fontWeight: 900,
              letterSpacing: "-0.02em",
              background: "linear-gradient(90deg,#C0C0C0,#A8E8D0,#B0C4E8,#D4B0E8,#fff,#D4B0E8,#B0C4E8,#C0C0C0)",
              backgroundSize: "200% 100%",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
              animation: "silverShine 3s linear infinite",
            }}>{t.heroTitle}</span>
            <br />
            {/* Tagline punch — Outfit (same family as SORARE ANALYTICS) + violet holo */}
            <span style={{
              fontFamily: "'Outfit', sans-serif",
              fontWeight: 700,
              letterSpacing: "-0.01em",
              background: "linear-gradient(135deg,#C4B5FD,#A78BFA,#8B5CF6,#C4B5FD)",
              backgroundSize: "200% 100%",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
              animation: "silverShine 4s linear infinite",
            }}>{t.heroHighlight}</span>
          </h1>

          <p style={{ fontSize: 15, color: "rgba(255,255,255,0.7)", lineHeight: 1.55, margin: "0 auto 22px", maxWidth: 580 }}>
            {t.heroSub}<br />
            <span style={{ color: "rgba(255,255,255,0.5)" }}>{t.heroSub2}</span>
          </p>

          {/* League chips — 6 competitions (5 ligues + Champion cross-ligues) */}
          {/* Backgrounds officiels Sorare frontend-assets */}
          <div className="landing-leagues" style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginBottom: 24 }}>
            {[
              { code: "L1",       color: "#3B82F6", name: "Ligue 1",        bg: "https://frontend-assets.sorare.com/football/so5_league/seasonal-france/picture.jpg?v=1" },
              { code: "PL",       color: "#D946EF", name: "Premier League", bg: "https://frontend-assets.sorare.com/football/so5_league/seasonal-england/picture.jpg?v=1" },
              { code: "Liga",     color: "#EF4444", name: "La Liga",        bg: "https://frontend-assets.sorare.com/football/so5_league/seasonal-spain/picture.jpg?v=1" },
              { code: "Bundes",   color: "#DC2626", name: "Bundesliga",     bg: "https://frontend-assets.sorare.com/football/so5_league/seasonal-germany/picture.jpg?v=1" },
              { code: "MLS",      color: "#3B82F6", name: "MLS",            bg: "https://frontend-assets.sorare.com/football/so5_league/seasonal-us/picture.jpg?v=1" },
              { code: "Champion", color: "#EC4899", name: "Champion",       bg: "https://frontend-assets.sorare.com/football/so5_league/seasonal-champions/picture.jpg?v=1" },
            ].map(l => (
              <div key={l.code} title={l.name} style={{
                position: "relative", overflow: "hidden",
                width: 130, height: 46,
                padding: 0, borderRadius: 99,
                border: `1px solid ${l.color}66`,
                backgroundColor: "rgba(10,5,25,0.6)",
                boxShadow: `0 0 18px ${l.color}30, 0 0 2px ${l.color}40`,
              }}>
                {/* Logo officiel Sorare centre dans la chip via object-position */}
                <img src={l.bg} alt={l.name} style={{
                  width: "100%", height: "100%",
                  objectFit: "cover",
                  // Le logo Sorare est dans les 0-25% gauche de l'image. On cale la vue
                  // sur cette zone pour que le logo apparaisse centre dans la chip.
                  objectPosition: "13% center",
                  display: "block",
                }} />
              </div>
            ))}
          </div>

          {/* Primary CTA — meme format box que les chips ligue (pill + glow) */}
          <div style={{ display: "flex", justifyContent: "center" }}>
            <button onClick={() => onNavigate ? onNavigate("db") : onEnter()}
              style={{
                position: "relative", overflow: "hidden",
                padding: "14px 36px", borderRadius: 99,
                cursor: "pointer", fontSize: 14, fontWeight: 800, fontFamily: "Outfit",
                color: "#fff", letterSpacing: "0.04em",
                border: "1px solid rgba(196,181,253,0.5)",
                background: "linear-gradient(135deg, #7C3AED 0%, #A78BFA 40%, #EC4899 100%)",
                boxShadow: "0 0 24px rgba(167,139,250,0.5), 0 0 2px rgba(236,72,153,0.5)",
                display: "inline-flex", alignItems: "center", gap: 10,
              }}>
              <span>{t.ctaEnter}</span>
              <span style={{ display: "inline-flex" }}><IconArrow color="#fff" size={16} /></span>
            </button>
          </div>
        </section>

        {/* ==== CARDS SHOWCASE ==== */}
        <div className="landing-cards" style={{
          display: "flex", gap: 12, justifyContent: "center",
          alignItems: "flex-end", padding: "12px 24px 0",
          perspective: 1000,
        }}>
          {showcasePlayers.map((player, idx) => (
            <SorareCard key={idx} player={player} idx={idx} mode={cardMode} />
          ))}
        </div>

        {/* ==== AFFILIATE BOXES (enriched with bullets) ==== */}
        <section style={{ width: "100%", padding: "50px 24px 20px" }}>
          <div className="landing-affi" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, maxWidth: 1080, margin: "0 auto" }}>

            {/* Box Manager Débutant — Sorare Stellar */}
            <div onMouseEnter={() => setCardMode("stellar")} style={{
              position: "relative", overflow: "hidden",
              borderRadius: 22,
              background: "linear-gradient(160deg, rgba(139,92,246,0.14), rgba(196,181,253,0.04) 55%, rgba(10,5,30,0.35))",
              border: "1px solid rgba(196,181,253,0.3)",
              padding: "26px 26px 22px",
              display: "flex", flexDirection: "column", gap: 16,
              backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)",
              boxShadow: "0 10px 40px rgba(139,92,246,0.18), inset 0 1px 0 rgba(255,255,255,0.05)",
            }}>
              {/* Glow accent */}
              <div style={{ position: "absolute", top: -60, right: -60, width: 220, height: 220, borderRadius: "50%", background: "radial-gradient(circle, rgba(196,181,253,0.22), transparent 70%)", pointerEvents: "none" }} />

              {/* Header */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, position: "relative" }}>
                <img src="/Stellar-logo.png" alt="Sorare Stellar" style={{ width: 44, height: 44, objectFit: "contain", flexShrink: 0, filter: "drop-shadow(0 4px 14px rgba(139,92,246,0.55))" }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: "#C4B5FD", letterSpacing: "0.14em" }}>{t.affDebTag}</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: "#fff", letterSpacing: "-0.5px", lineHeight: 1.1 }}>{t.affDebTitle}</div>
                </div>
                <span style={{ fontSize: 10, fontWeight: 900, color: "#4ADE80", background: "rgba(74,222,128,0.12)", border: "1px solid rgba(74,222,128,0.4)", borderRadius: 6, padding: "5px 10px", letterSpacing: "0.06em", flexShrink: 0 }}>{t.affDebBadge}</span>
              </div>

              {/* Pack + lead */}
              <div style={{ display: "flex", gap: 16, alignItems: "center", position: "relative" }}>
                <img src="/stellar-pack.png" alt="Pack Stellar" style={{ width: 104, height: 140, objectFit: "contain", flexShrink: 0, filter: "drop-shadow(0 10px 30px rgba(139,92,246,0.5))" }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, color: "rgba(255,255,255,0.78)", lineHeight: 1.5, margin: 0 }}>{t.affDebLead}</p>
                </div>
              </div>

              {/* Bullets */}
              <div style={{ display: "flex", flexDirection: "column", gap: 2, position: "relative" }}>
                <Bullet tone="violet" text={t.affDebB1} />
                <Bullet tone="violet" text={t.affDebB2} />
                <Bullet tone="violet" text={t.affDebB3} />
              </div>

              {/* CTA */}
              <a href="http://sorare.pxf.io/Deglingo" target="_blank" rel="noopener noreferrer"
                style={{
                  textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
                  padding: "13px 20px", borderRadius: 11,
                  background: "linear-gradient(135deg,#7C3AED,#8B5CF6,#A78BFA)",
                  color: "#fff", fontSize: 14, fontWeight: 800, fontFamily: "Outfit",
                  boxShadow: "0 8px 26px rgba(124,58,237,0.5), inset 0 1px 0 rgba(255,255,255,0.15)",
                  transition: "transform 0.2s, box-shadow 0.2s",
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 12px 32px rgba(124,58,237,0.7), inset 0 1px 0 rgba(255,255,255,0.2)"; }}
                onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = "0 8px 26px rgba(124,58,237,0.5), inset 0 1px 0 rgba(255,255,255,0.15)"; }}>
                {t.affDebCta}
                <IconArrow color="#fff" size={14} />
              </a>
            </div>

            {/* Box Manager Pro — Sorare Pro */}
            <div onMouseEnter={() => setCardMode("pro")} onMouseLeave={() => setCardMode("stellar")} style={{
              position: "relative", overflow: "hidden",
              borderRadius: 22,
              background: "linear-gradient(160deg, rgba(251,191,36,0.14), rgba(245,158,11,0.04) 55%, rgba(10,5,30,0.35))",
              border: "1px solid rgba(251,191,36,0.35)",
              padding: "26px 26px 22px",
              display: "flex", flexDirection: "column", gap: 16,
              backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)",
              boxShadow: "0 10px 40px rgba(251,191,36,0.18), inset 0 1px 0 rgba(255,255,255,0.05)",
            }}>
              <div style={{ position: "absolute", top: -60, right: -60, width: 220, height: 220, borderRadius: "50%", background: "radial-gradient(circle, rgba(251,191,36,0.22), transparent 70%)", pointerEvents: "none" }} />

              {/* Header */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, position: "relative" }}>
                <div style={{ width: 42, height: 42, borderRadius: 12, background: "linear-gradient(135deg, rgba(251,191,36,0.3), rgba(245,158,11,0.15))", border: "1px solid rgba(251,191,36,0.3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <IconCrown color="#FBBF24" size={24} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: "#FBBF24", letterSpacing: "0.14em" }}>{t.affProTag}</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: "#fff", letterSpacing: "-0.5px", lineHeight: 1.1 }}>{t.affProTitle}</div>
                </div>
                <span style={{ fontSize: 10, fontWeight: 900, color: "#FBBF24", background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.4)", borderRadius: 6, padding: "5px 10px", letterSpacing: "0.06em", flexShrink: 0 }}>{t.affProBadge}</span>
              </div>

              {/* Mbappé card + lead */}
              <div style={{ display: "flex", gap: 16, alignItems: "center", position: "relative" }}>
                <div style={{ position: "relative", flexShrink: 0 }}>
                  <img src="/mbappe.png" alt="Sorare Pro Limited card" style={{ width: 104, height: 140, objectFit: "contain", display: "block", filter: "drop-shadow(0 12px 28px rgba(251,191,36,0.45))" }} onError={e => { e.currentTarget.style.display = "none"; }} />
                  {/* 100€ chip overlay */}
                  <div style={{ position: "absolute", top: -6, right: -10, background: "linear-gradient(135deg,#F59E0B,#FBBF24)", color: "#0A0530", fontSize: 12, fontWeight: 900, fontFamily: "Outfit", padding: "4px 10px", borderRadius: 20, border: "2px solid rgba(10,5,48,0.6)", boxShadow: "0 4px 14px rgba(251,191,36,0.5)", letterSpacing: "-0.3px" }}>100€</div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, color: "rgba(255,255,255,0.78)", lineHeight: 1.5, margin: 0 }}>{t.affProLead}</p>
                </div>
              </div>

              {/* Bullets */}
              <div style={{ display: "flex", flexDirection: "column", gap: 2, position: "relative" }}>
                <Bullet tone="gold" text={t.affProB1} />
                <Bullet tone="gold" text={t.affProB2} />
                <Bullet tone="gold" text={t.affProB3} />
              </div>

              {/* CTA */}
              <a href="http://sorare.pxf.io/Deglingo" target="_blank" rel="noopener noreferrer"
                style={{
                  textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
                  padding: "13px 20px", borderRadius: 11,
                  background: "linear-gradient(135deg,#F59E0B,#FBBF24)",
                  color: "#0A0530", fontSize: 14, fontWeight: 900, fontFamily: "Outfit",
                  boxShadow: "0 8px 26px rgba(251,191,36,0.5), inset 0 1px 0 rgba(255,255,255,0.25)",
                  transition: "transform 0.2s, box-shadow 0.2s",
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 12px 32px rgba(251,191,36,0.7), inset 0 1px 0 rgba(255,255,255,0.3)"; }}
                onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = "0 8px 26px rgba(251,191,36,0.5), inset 0 1px 0 rgba(255,255,255,0.25)"; }}>
                {t.affProCta}
                <IconArrow color="#0A0530" size={14} />
              </a>
            </div>
          </div>
        </section>

        {/* ==== POUR QUI ? (new section — Scout pour les 2 profils) ==== */}
        <section style={{ width: "100%", padding: "40px 24px 30px" }}>
          <div style={{ maxWidth: 1080, margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: 32 }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "5px 12px", borderRadius: 99, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", marginBottom: 14 }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#A78BFA" }} />
                <span style={{ fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,0.7)", letterSpacing: "0.18em" }}>{t.whoEyebrow}</span>
              </div>
              <h2 style={{ fontSize: "clamp(24px, 4vw, 38px)", fontWeight: 900, color: "#fff", letterSpacing: "-1px", margin: "0 0 10px" }}>{t.whoTitle}</h2>
              <p style={{ fontSize: 14, color: "rgba(255,255,255,0.55)", maxWidth: 560, margin: "0 auto", lineHeight: 1.55 }}>{t.whoSub}</p>
            </div>

            <div className="landing-who" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>

              {/* Profile Manager Débutant */}
              <div style={{
                position: "relative", overflow: "hidden", borderRadius: 22,
                background: "rgba(139,92,246,0.04)", border: "1px solid rgba(196,181,253,0.2)",
                padding: "26px 26px 22px", display: "flex", flexDirection: "column", gap: 14,
                backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
              }}>
                <div style={{ position: "absolute", bottom: -80, left: -80, width: 220, height: 220, borderRadius: "50%", background: "radial-gradient(circle, rgba(196,181,253,0.12), transparent 70%)", pointerEvents: "none" }} />

                <div style={{ display: "flex", alignItems: "center", gap: 12, position: "relative" }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(139,92,246,0.2)", border: "1px solid rgba(196,181,253,0.3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <IconSpark color="#C4B5FD" size={22} />
                  </div>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 800, color: "#C4B5FD", letterSpacing: "0.14em" }}>{t.affDebTag}</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", letterSpacing: "-0.3px" }}>{t.debQ}</div>
                  </div>
                </div>

                <p style={{ fontSize: 13, color: "rgba(255,255,255,0.62)", lineHeight: 1.5, margin: 0, position: "relative" }}>{t.debLead}</p>

                <div style={{ display: "flex", flexDirection: "column", gap: 2, position: "relative" }}>
                  <Bullet tone="violet" text={t.debB1} />
                  <Bullet tone="violet" text={t.debB2} />
                  <Bullet tone="violet" text={t.debB3} />
                  <Bullet tone="violet" text={t.debB4} />
                  <Bullet tone="violet" text={t.debB5} />
                </div>

                <button onClick={() => onNavigate ? onNavigate("stellar") : onEnter()}
                  style={{
                    marginTop: "auto", padding: "11px 18px", borderRadius: 10, cursor: "pointer",
                    fontSize: 13, fontWeight: 700, fontFamily: "Outfit",
                    background: "rgba(139,92,246,0.15)", border: "1px solid rgba(196,181,253,0.4)",
                    color: "#C4B5FD",
                    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
                    transition: "background 0.2s, border-color 0.2s, transform 0.2s",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = "rgba(139,92,246,0.25)"; e.currentTarget.style.borderColor = "rgba(196,181,253,0.6)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "rgba(139,92,246,0.15)"; e.currentTarget.style.borderColor = "rgba(196,181,253,0.4)"; e.currentTarget.style.transform = ""; }}>
                  {t.debGo}
                  <IconArrow color="#C4B5FD" size={14} />
                </button>
              </div>

              {/* Profile Manager Pro */}
              <div style={{
                position: "relative", overflow: "hidden", borderRadius: 22,
                background: "rgba(251,191,36,0.04)", border: "1px solid rgba(251,191,36,0.2)",
                padding: "26px 26px 22px", display: "flex", flexDirection: "column", gap: 14,
                backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
              }}>
                <div style={{ position: "absolute", bottom: -80, right: -80, width: 220, height: 220, borderRadius: "50%", background: "radial-gradient(circle, rgba(251,191,36,0.12), transparent 70%)", pointerEvents: "none" }} />

                <div style={{ display: "flex", alignItems: "center", gap: 12, position: "relative" }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(251,191,36,0.2)", border: "1px solid rgba(251,191,36,0.3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <IconCrown color="#FBBF24" size={22} />
                  </div>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 800, color: "#FBBF24", letterSpacing: "0.14em" }}>{t.affProTag}</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", letterSpacing: "-0.3px" }}>{t.proQ}</div>
                  </div>
                </div>

                <p style={{ fontSize: 13, color: "rgba(255,255,255,0.62)", lineHeight: 1.5, margin: 0, position: "relative" }}>{t.proLead}</p>

                <div style={{ display: "flex", flexDirection: "column", gap: 2, position: "relative" }}>
                  <Bullet tone="gold" text={t.proB1} />
                  <Bullet tone="gold" text={t.proB2} />
                  <Bullet tone="gold" text={t.proB3} />
                  <Bullet tone="gold" text={t.proB4} />
                  <Bullet tone="gold" text={t.proB5} />
                </div>

                <button onClick={() => onNavigate ? onNavigate("pro") : onEnter()}
                  style={{
                    marginTop: "auto", padding: "11px 18px", borderRadius: 10, cursor: "pointer",
                    fontSize: 13, fontWeight: 700, fontFamily: "Outfit",
                    background: "rgba(251,191,36,0.15)", border: "1px solid rgba(251,191,36,0.4)",
                    color: "#FBBF24",
                    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
                    transition: "background 0.2s, border-color 0.2s, transform 0.2s",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = "rgba(251,191,36,0.25)"; e.currentTarget.style.borderColor = "rgba(251,191,36,0.6)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "rgba(251,191,36,0.15)"; e.currentTarget.style.borderColor = "rgba(251,191,36,0.4)"; e.currentTarget.style.transform = ""; }}>
                  {t.proGo}
                  <IconArrow color="#FBBF24" size={14} />
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* ==== FEATURES live preview (existing FeatureBoxes) ==== */}
        <section id="features" style={{ width: "100%", padding: "20px 0 40px" }}>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <FeatureBoxes players={players} showcasePlayers={showcasePlayers} lang={lang} />
          </div>
        </section>

        {/* ==== FINAL CTA ==== */}
        <section style={{ width: "100%", padding: "20px 24px 60px" }}>
          <div style={{
            maxWidth: 880, margin: "0 auto",
            position: "relative", overflow: "hidden",
            borderRadius: 28, padding: "44px 32px", textAlign: "center",
            background: "linear-gradient(135deg, rgba(139,92,246,0.14), rgba(251,191,36,0.1) 70%)",
            border: "1px solid rgba(255,255,255,0.12)",
            backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
            boxShadow: "0 12px 48px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)",
          }}>
            <div style={{ position: "absolute", top: -80, left: "50%", transform: "translateX(-50%)", width: 360, height: 240, background: "radial-gradient(ellipse at center, rgba(196,181,253,0.18), transparent 70%)", pointerEvents: "none" }} />
            <h2 style={{ fontSize: "clamp(22px, 3.5vw, 32px)", fontWeight: 900, color: "#fff", letterSpacing: "-0.8px", margin: "0 0 10px", position: "relative" }}>{t.finalTitle}</h2>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.62)", margin: "0 0 22px", position: "relative" }}>{t.finalSub}</p>
            <button onClick={() => onNavigate ? onNavigate("db") : onEnter()} className="scout-cta-holo"
              style={{
                padding: "15px 32px", borderRadius: 14, cursor: "pointer",
                fontSize: 15, fontWeight: 800, fontFamily: "Outfit",
                color: "#fff", border: "none",
                display: "inline-flex", alignItems: "center", gap: 10,
                letterSpacing: "0.02em",
              }}>
              <span style={{ position: "relative", zIndex: 2 }}>{t.finalCta}</span>
              <span style={{ position: "relative", zIndex: 2, display: "inline-flex" }}><IconArrow color="#fff" size={16} /></span>
            </button>
          </div>
        </section>
      </div>

      <style>{`
        @keyframes silverShine { 0%{background-position:200% center} 100%{background-position:-200% center} }

        /* ==== Shiny Holographic CTA (Sorare holo vibe: violet + cyan + pink shimmer) ==== */
        @keyframes holoShift {
          0% { background-position: 0% 50%; }
          100% { background-position: 300% 50%; }
        }
        @keyframes ctaShine {
          0%, 20% { transform: translateX(-140%) skewX(22deg); opacity: 0; }
          30% { opacity: 1; }
          65% { opacity: 1; }
          85%, 100% { transform: translateX(240%) skewX(22deg); opacity: 0; }
        }
        @keyframes holoGlow {
          0%, 100% {
            box-shadow:
              0 10px 32px rgba(124,58,237,0.5),
              0 0 42px rgba(196,181,253,0.3),
              inset 0 0 0 1px rgba(255,255,255,0.12),
              inset 0 1px 0 rgba(255,255,255,0.28);
          }
          50% {
            box-shadow:
              0 14px 46px rgba(167,139,250,0.55),
              0 0 64px rgba(103,232,249,0.35),
              inset 0 0 0 1px rgba(255,255,255,0.22),
              inset 0 1px 0 rgba(255,255,255,0.35);
          }
        }
        .scout-cta-holo {
          position: relative;
          overflow: hidden;
          isolation: isolate;
          background: linear-gradient(110deg,
            #7C3AED 0%,
            #A78BFA 18%,
            #67E8F9 36%,
            #F9A8D4 52%,
            #A78BFA 72%,
            #7C3AED 90%,
            #C4B5FD 100%);
          background-size: 280% 100%;
          animation: holoShift 6s linear infinite, holoGlow 3s ease-in-out infinite;
          transition: transform 0.2s ease;
        }
        .scout-cta-holo::before {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(100deg,
            transparent 38%,
            rgba(255,255,255,0.55) 50%,
            transparent 62%);
          animation: ctaShine 4s ease-in-out infinite;
          pointer-events: none;
          z-index: 1;
        }
        .scout-cta-holo::after {
          content: "";
          position: absolute;
          inset: 0;
          background:
            radial-gradient(circle at 25% 15%, rgba(255,255,255,0.18), transparent 50%),
            radial-gradient(circle at 75% 85%, rgba(103,232,249,0.15), transparent 55%);
          pointer-events: none;
          z-index: 0;
          mix-blend-mode: screen;
        }
        .scout-cta-holo:hover { transform: translateY(-2px); }
        .scout-cta-holo:active { transform: translateY(0); }

        @media(max-width:820px){
          .landing-cards > div { width: 120px !important; }
          .landing-cards > div:first-child,
          .landing-cards > div:last-child { display: none !important; }
          .landing-affi, .landing-who { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
