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
    tagline1: "Le Scout qui pense",
    tagline2: "avec tes cartes",
    sub1: "Optimisé pour",
    sub2: "Algo propriétaire · 4 ligues · 2 600+ joueurs · D-Score, AA, Titu%, CS%",
    cta1: "Accéder au Scout →",
    cta2: "Connecter avec Sorare",
    boxDb: "Top Joueurs",
    boxDbSub: "Classement live D-Score",
    boxBest: "⚽ Best Pick SO5 / SO7",
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
    tagline1: "The Scout that thinks",
    tagline2: "with your cards",
    sub1: "Optimized for",
    sub2: "Proprietary algo · 4 leagues · 2,600+ players · D-Score, AA, Titu%, CS%",
    cta1: "Open Scout →",
    cta2: "Connect with Sorare",
    boxDb: "Top Players",
    boxDbSub: "Live D-Score ranking",
    boxBest: "⚽ Best Pick SO5 / SO7",
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

export default function LandingPage({ players, onEnter, onNavigate }) {
  const [cardMode, setCardMode] = useState("stellar"); // "stellar" | "pro"
  const [lang, setLang] = useState("fr");

  const showcasePlayers = useMemo(() => {
    return SHOWCASE_CARDS.map(c => {
      const pl = players?.find(p => p.name === c.name) || {};
      return { ...pl, name: c.name, position: c.pos, sorare_stellar_url: c.stellar, sorare_pro_url: c.pro };
    });
  }, [players]);

  return (
    <div style={{
      height: "100vh", display: "flex", flexDirection: "column",
      background: "linear-gradient(180deg,#02000c 0%,#07021a 40%,#0a0422 100%)",
      fontFamily: "'Outfit',sans-serif", overflow: "hidden",
      position: "relative",
      zoom: 1.25,
    }}>
      {/* Galaxy background */}
      <div style={{
        position: "absolute", inset: 0, zIndex: 0,
        backgroundImage: "url('/galaxy-bg.jpg')",
        backgroundSize: "cover", backgroundPosition: "center",
        opacity: 0.25,
      }} />

      {/* Gradient overlay */}
      <div style={{
        position: "absolute", inset: 0, zIndex: 1,
        background: "linear-gradient(180deg,rgba(2,0,12,0.6) 0%,rgba(2,0,12,0.4) 40%,rgba(2,0,12,0.85) 80%,rgba(2,0,12,1) 100%)",
      }} />

      {/* Content */}
      <div style={{ position: "relative", zIndex: 2, flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", padding: "2px 0 8px", gap: 0 }}>

        {/* Header logo */}
        <div style={{ padding: "4px 24px 0", display: "flex", alignItems: "center", gap: 10, alignSelf: "stretch" }}>
          <img src="/logo.png" alt="Deglingo Scout" style={{ width: 36, height: 36, objectFit: "contain" }} />
          <div style={{ flex: 1 }}>
            <div style={{
              fontSize: 15, fontWeight: 900, letterSpacing: "-0.5px",
              background: "linear-gradient(90deg,#C0C0C0,#A8E8D0,#B0C4E8,#D4B0E8,#fff,#D4B0E8,#B0C4E8,#C0C0C0)",
              backgroundSize: "200% 100%",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
              animation: "silverShine 3s linear infinite",
            }}>DEGLINGO SCOUT</div>
            <div style={{ fontSize: 8, color: "rgba(255,255,255,0.3)", letterSpacing: "2px", textTransform: "uppercase" }}>Sorare Analytics</div>
          </div>
          {/* Lang toggle */}
          <button
            onClick={() => setLang(l => l === "fr" ? "en" : "fr")}
            style={{
              background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: 8, padding: "3px 10px", cursor: "pointer",
              fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,0.7)",
              letterSpacing: 1, fontFamily: "Outfit",
              display: "flex", alignItems: "center", gap: 5,
              flexShrink: 0,
            }}
          >
            <img src={`https://flagcdn.com/16x12/${lang === "fr" ? "gb" : "fr"}.png`} alt="" style={{ width: 12, height: 9, borderRadius: 1 }} />
            {lang === "fr" ? "EN" : "FR"}
          </button>
        </div>

        {/* Hero */}
        <div style={{ textAlign: "center", padding: "4px 24px 2px", maxWidth: 640 }}>

          {/* Badges PRO + STELLAR — hover switche les cartes */}

          <h1 style={{
            fontSize: "clamp(24px, 5vw, 42px)", fontWeight: 900, lineHeight: 1.05,
            margin: "0 0 8px", color: "#fff", letterSpacing: "-1px",
          }}>
            {T[lang].tagline1}<br />
            <span style={{
              background: "linear-gradient(135deg,#C4B5FD,#A78BFA,#8B5CF6,#C4B5FD)",
              backgroundSize: "200% 100%",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
              animation: "silverShine 4s linear infinite",
            }}>{T[lang].tagline2}</span>
          </h1>

          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 1.5, margin: "0 0 14px" }}>
            {T[lang].sub1} <strong style={{ color: "rgba(255,255,255,0.8)" }}>Sorare Pro</strong> et <strong style={{ color: "rgba(196,181,253,0.9)" }}>Sorare Stellar</strong><br />
            {T[lang].sub2}
          </p>

        </div>

        {/* Spacer flexible entre hero et cartes */}
        <div style={{ flex: "1 1 0", minHeight: 4, maxHeight: 20 }} />

        {/* CTAs au-dessus des cartes */}
        <div style={{ display: "flex", gap: 12, justifyContent: "center", marginBottom: 12 }}>
          <button onClick={() => onNavigate ? onNavigate("db") : onEnter()}
            style={{ padding: "10px 24px", borderRadius: 20, fontSize: 13, fontWeight: 800, fontFamily: "Outfit", cursor: "pointer", border: "none", background: cardMode === "pro" ? "linear-gradient(135deg,#6366F1,#818CF8)" : "linear-gradient(135deg,#7C3AED,#8B5CF6,#A78BFA)", color: "#fff", boxShadow: cardMode === "pro" ? "0 6px 28px rgba(99,102,241,0.6)" : "0 6px 24px rgba(124,58,237,0.5)", transition: "all 0.3s", display: "flex", alignItems: "center", gap: 6, transform: cardMode === "pro" ? "translateY(-2px) scale(1.03)" : "" }}
            onMouseEnter={() => setCardMode("pro")}
            onMouseLeave={() => setCardMode("stellar")}>
            Sorare Pro →
          </button>
          <button onClick={() => onNavigate ? onNavigate("stellar") : onEnter()}
            style={{ padding: "10px 24px", borderRadius: 20, fontSize: 13, fontWeight: 800, fontFamily: "Outfit", cursor: "pointer", background: cardMode === "stellar" ? "rgba(139,92,246,0.2)" : "rgba(255,255,255,0.06)", border: `1px solid ${cardMode === "stellar" ? "rgba(139,92,246,0.5)" : "rgba(255,255,255,0.18)"}`, color: cardMode === "stellar" ? "#C4B5FD" : "rgba(255,255,255,0.85)", boxShadow: cardMode === "stellar" ? "0 6px 24px rgba(139,92,246,0.4)" : "none", transition: "all 0.3s", display: "flex", alignItems: "center", gap: 6, transform: cardMode === "stellar" ? "translateY(-2px) scale(1.03)" : "" }}
            onMouseEnter={() => setCardMode("stellar")}
            onMouseLeave={() => setCardMode("stellar")}>
            <img src="/Stellar.png" alt="" style={{ width: 14, height: 14, objectFit: "contain" }} />
            Sorare Stellar →
          </button>
        </div>

        {/* Cards showcase */}
        <div style={{
          display: "flex", gap: 10, justifyContent: "center",
          alignItems: "flex-end", padding: "0 24px 0",
          perspective: 1000,
        }}>
          {showcasePlayers.map((player, idx) => (
            <SorareCard key={idx} player={player} idx={idx} mode={cardMode} />
          ))}
        </div>

        {/* Spacer flexible entre cartes et boxes */}
        <div style={{ flex: "1 1 0", minHeight: 4, maxHeight: 16 }} />

        {/* Features — mini previews live */}
        <FeatureBoxes players={players} showcasePlayers={showcasePlayers} lang={lang} />
      </div>


      <style>{`
        @keyframes silverShine { 0%{background-position:200% center} 100%{background-position:-200% center} }
        @media(max-width:600px){
          .landing-cards > div { width: 110px !important; }
          .landing-cards > div:first-child,
          .landing-cards > div:last-child { display: none !important; }
          .landing-features { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
