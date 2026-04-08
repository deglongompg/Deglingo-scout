import { useState, useEffect } from "react";
import DbTab from "./components/DbTab";
import FightTab from "./components/FightTab";
import RecoTab from "./components/RecoTab";
import StellarTab from "./components/StellarTab";
import LandingPage from "./components/LandingPage";
import { t } from "./utils/i18n";

const TABS = [
  { id: "db", label: "Database", icon: "📊" },
  { id: "reco", label: "Best Pick", icon: "⚽" },
  { id: "stellar", label: "Sorare Stellar", icon: "✨" },
  { id: "fight", label: "Fight", icon: "🥊" },
];

export default function App() {
  const [showLanding, setShowLanding] = useState(() => {
    // Skip landing if direct tab URL param
    const p = new URLSearchParams(window.location.search).get("tab");
    return !["db","fight","reco","stellar"].includes(p);
  });
  const [tab, setTab] = useState(() => {
    const p = new URLSearchParams(window.location.search).get("tab");
    return ["db","fight","reco","stellar"].includes(p) ? p : "db";
  });
  const [lang, setLang] = useState("fr");
  const [players, setPlayers] = useState(null);
  const [teams, setTeams] = useState(null);
  const [fixtures, setFixtures] = useState(null);
  const [logos, setLogos] = useState({});
  const [matchEvents, setMatchEvents] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([
      fetch("/data/players.json").then(r => { if (!r.ok) throw new Error("players.json"); return r.json(); }),
      fetch("/data/teams.json").then(r => { if (!r.ok) throw new Error("teams.json"); return r.json(); }),
      fetch("/data/fixtures.json").then(r => r.ok ? r.json() : null).catch(() => null),
      fetch("/data/club_logos.json").then(r => r.ok ? r.json() : {}).catch(() => ({})),
      fetch("/data/match_events.json").then(r => r.ok ? r.json() : {}).catch(() => ({})),
    ])
      .then(([p, t, f, l, me]) => { setPlayers(p); setTeams(t); setFixtures(f); setLogos(l || {}); setMatchEvents(me || {}); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  if (loading) return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "linear-gradient(170deg, #0A0A1E, #0E0E2A 25%, #121236 50%, #10102E 75%, #0C0C22)",
      color: "#A5B4FC", fontFamily: "Outfit", fontSize: 16,
    }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>⚽</div>
        <div>{t(lang, "loading")}</div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", marginTop: 4 }}>1419 joueurs</div>
      </div>
    </div>
  );

  if (error) return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "#04040F", color: "#EF4444", fontFamily: "Outfit",
    }}>Erreur: {error}</div>
  );

  if (showLanding) return (
    <LandingPage players={players} onEnter={() => setShowLanding(false)} />
  );

  const silverShinyStyle = {
    background: "linear-gradient(90deg,#C0C0C0,#A8E8D0,#B0C4E8,#D4B0E8,#E0D0E8,#fff,#D4B0E8,#B0C4E8,#A8E8D0,#C0C0C0)",
    backgroundSize: "200% 100%",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    backgroundClip: "text",
    animation: "silverShine 3s linear infinite",
  };

  const STARS = [
    { top:"8%",  left:"7%",  big:true,  dur:2.1, delay:0    },
    { top:"15%", left:"22%", big:false, dur:3.4, delay:0.7  },
    { top:"6%",  left:"45%", big:false, dur:2.8, delay:1.2  },
    { top:"12%", left:"68%", big:true,  dur:1.9, delay:0.3  },
    { top:"4%",  left:"82%", big:false, dur:3.1, delay:1.8  },
    { top:"22%", left:"5%",  big:false, dur:2.5, delay:0.5  },
    { top:"28%", left:"38%", big:false, dur:3.7, delay:2.1  },
    { top:"18%", left:"90%", big:true,  dur:2.3, delay:0.9  },
    { top:"35%", left:"15%", big:false, dur:4.0, delay:1.5  },
    { top:"42%", left:"72%", big:false, dur:2.6, delay:0.2  },
    { top:"50%", left:"3%",  big:true,  dur:1.8, delay:1.1  },
    { top:"55%", left:"55%", big:false, dur:3.3, delay:2.4  },
    { top:"62%", left:"30%", big:false, dur:2.9, delay:0.6  },
    { top:"70%", left:"85%", big:true,  dur:2.2, delay:1.7  },
    { top:"75%", left:"12%", big:false, dur:3.6, delay:0.4  },
    { top:"80%", left:"48%", big:false, dur:2.7, delay:2.0  },
    { top:"88%", left:"65%", big:false, dur:3.0, delay:0.8  },
    { top:"92%", left:"25%", big:true,  dur:2.4, delay:1.3  },
    { top:"32%", left:"58%", big:false, dur:4.2, delay:1.9  },
    { top:"48%", left:"92%", big:false, dur:3.8, delay:0.1  },
  ];

  return (
    <>
      {/* ═══ Étoiles scintillantes — HORS du zoom, position:fixed réelle ═══ */}
      {tab === "stellar" && (
        <>
          <style>{`
            @keyframes starPulse { 0%,100%{opacity:0.2;transform:scale(0.8)} 50%{opacity:0.9;transform:scale(1.3)} }
            @keyframes starPulseBig { 0%,100%{opacity:0.4;transform:scale(0.9)} 50%{opacity:1;transform:scale(1.6);filter:drop-shadow(0 0 5px rgba(220,200,255,0.9))} }
          `}</style>
          {STARS.map((s, i) => (
            <div key={i} style={{ position:"fixed", top:s.top, left:s.left, zIndex:9999, pointerEvents:"none",
              width:0, height:0, animation:`${s.big?"starPulseBig":"starPulse"} ${s.dur}s ease-in-out ${s.delay}s infinite` }}>
              <div style={{ position:"absolute", width:s.big?"14px":"6px", height:s.big?"1px":"0.8px",
                background:"linear-gradient(90deg,transparent,rgba(255,255,255,0.95),transparent)",
                top:s.big?"-0.5px":"-0.4px", left:s.big?"-7px":"-3px" }} />
              <div style={{ position:"absolute", width:s.big?"1px":"0.8px", height:s.big?"14px":"6px",
                background:"linear-gradient(180deg,transparent,rgba(255,255,255,0.95),transparent)",
                top:s.big?"-7px":"-3px", left:s.big?"-0.5px":"-0.4px" }} />
              <div style={{ position:"absolute", width:s.big?"2px":"1px", height:s.big?"2px":"1px",
                borderRadius:"50%", background:"#fff",
                top:s.big?"-1px":"-0.5px", left:s.big?"-1px":"-0.5px",
                boxShadow:s.big?"0 0 4px 2px rgba(220,200,255,0.8)":"0 0 2px 1px rgba(255,255,255,0.7)" }} />
            </div>
          ))}
        </>
      )}
    <div className="ds-app-root" style={{
      minHeight: "100vh",
      color: "#ffffff", fontFamily: "'Outfit', sans-serif",
      zoom: 1.15,
      ...(tab === "stellar"
        ? { backgroundImage: "linear-gradient(rgba(2,0,12,0.82), rgba(2,0,12,0.82)), url('/galaxy-bg.jpg')", backgroundSize: "cover", backgroundPosition: "center", backgroundRepeat: "no-repeat", backgroundAttachment: "fixed", backgroundColor: "#03010e" }
        : { background: "linear-gradient(170deg, #0A0A1E, #0E0E2A 25%, #121236 50%, #10102E 75%, #0C0C22)" }
      ),
    }}>
      <style>{`
        @keyframes silverShine { 0%{background-position:200% center} 100%{background-position:-200% center} }
        @keyframes holoShift { 0%{filter:hue-rotate(0deg) brightness(1.4) saturate(1.2)} 50%{filter:hue-rotate(180deg) brightness(1.8) saturate(1.6)} 100%{filter:hue-rotate(360deg) brightness(1.4) saturate(1.2)} }
        @media(max-width:768px){
          .ds-app-root { zoom: 1 !important; }
          .ds-header-inner { display: flex !important; flex-wrap: wrap !important; align-items: center !important; row-gap: 6px !important; }
          .ds-header-tabs { order: 10 !important; width: 100% !important; box-sizing: border-box !important; overflow-x: auto !important; -webkit-overflow-scrolling: touch !important; flex-wrap: nowrap !important; scrollbar-width: none !important; justify-content: flex-start !important; padding-right: 24px !important; }
          .ds-header-tabs::-webkit-scrollbar { display: none; }
          .ds-cta-area { margin-left: auto !important; }
          .ds-cta-area a { padding: 5px 10px !important; font-size: 10px !important; }
          .ds-logo-sub { display: none !important; }
        }
        @media(max-width:480px){
          .ds-lang-btn { padding: 4px 7px !important; font-size: 10px !important; }
          .ds-stellar-icon { display: none !important; }
        }
        @media(max-width:768px){
          .bp-opp-name { display: none !important; }
        }
      `}</style>
      {/* Header */}
      <header style={{
        position: "sticky", top: 0, zIndex: 100,
        background: "rgba(4,4,15,0.9)", backdropFilter: "blur(20px)",
        borderBottom: "1px solid rgba(255,255,255,0.04)", padding: "12px 16px",
      }}>
        <div className="ds-header-inner" style={{
          display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center",
          maxWidth: 1400, margin: "0 auto", width: "100%",
        }}>
          {/* Logo gauche */}
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <img src="/logo.png" alt="Deglingo Scout" style={{ width: 32, height: 32, objectFit: "contain" }} />
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: "-0.5px", ...silverShinyStyle }}>DEGLINGO SCOUT</div>
              <div className="ds-logo-sub" style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", letterSpacing: "2px", textTransform: "uppercase" }}>
                Sorare Analytics
              </div>
            </div>
          </div>

          {/* Tabs centrés */}
          <div className="ds-header-tabs" style={{ display: "flex", gap: 4, justifyContent: "center" }}>
            {TABS.map(tab2 => (
              <button
                key={tab2.id}
                onClick={() => setTab(tab2.id)}
                style={{
                  padding: "6px 14px", borderRadius: 10, fontSize: 12, fontWeight: 600,
                  border: "none", fontFamily: "Outfit", position: "relative",
                  cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4,
                  whiteSpace: "nowrap", flexShrink: 0,
                  background: tab === tab2.id ? "rgba(99,102,241,0.12)" : "transparent",
                  outline: tab === tab2.id ? "1px solid rgba(99,102,241,0.3)" : "none",
                  transition: "all 0.2s",
                  ...(tab === tab2.id && tab2.id === "reco" ? {
                    ...silverShinyStyle,
                    WebkitTextFillColor: "transparent",
                  } : tab === tab2.id && tab2.id === "stellar" ? {
                    background: "linear-gradient(90deg,#C4B5FD,#A78BFA,#8B5CF6,#7C3AED,#A78BFA,#C4B5FD)",
                    backgroundSize: "200% 100%",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                    animation: "silverShine 3s linear infinite",
                  } : {
                    color: tab === tab2.id ? "#A5B4FC" : "rgba(255,255,255,0.4)",
                  }),
                }}
              >
                {tab2.id === "stellar"
                  ? <img className="ds-stellar-icon" src="/Stellar.png" alt="" style={{ width: 16, height: 16, objectFit: "contain", mixBlendMode: "screen", animation: "holoShift 3s linear infinite", flexShrink: 0 }} />
                  : <>{tab2.icon}{" "}</>
                }{tab2.label}
              </button>
            ))}
          </div>

          {/* CTA + Lang toggle droite */}
          <div className="ds-cta-area" style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8 }}>
            <button
              className="ds-lang-btn"
              onClick={() => setLang(l => l === "fr" ? "en" : "fr")}
              style={{
                padding: "6px 10px", borderRadius: 8, fontSize: 11, fontWeight: 800,
                fontFamily: "Outfit", border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.6)",
                cursor: "pointer", letterSpacing: "1px", transition: "all 0.2s",
                flexShrink: 0,
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.1)"; e.currentTarget.style.color = "#fff"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; e.currentTarget.style.color = "rgba(255,255,255,0.6)"; }}
            >
              {t(lang, "langToggle")}
            </button>
            <a
              href="http://sorare.pxf.io/Deglingo"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                padding: "7px 16px", borderRadius: 20, fontSize: 11, fontWeight: 800,
                fontFamily: "Outfit", textDecoration: "none", letterSpacing: "0.04em",
                background: "linear-gradient(#0a0618, #0a0618) padding-box, linear-gradient(135deg, #4ade80, #22d3ee, #818cf8, #c084fc, #f472b6, #4ade80) border-box",
                border: "2px solid transparent",
                color: "#fff", display: "flex", alignItems: "center", gap: 6,
                boxShadow: "0 0 16px rgba(129,140,248,0.4)",
                animation: "holoShift 3s linear infinite",
                transition: "box-shadow 0.2s, transform 0.2s",
              }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 0 28px rgba(129,140,248,0.7)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 0 16px rgba(129,140,248,0.4)"; e.currentTarget.style.transform = "translateY(0)"; }}
            >
              {t(lang, "ctaSorare")}
            </a>
          </div>
        </div>
      </header>

      {/* Content */}
      <main style={{ maxWidth: 1400, margin: "0 auto", paddingTop: 8, overflowX: "hidden" }}>
        {tab === "db" && <DbTab players={players} teams={teams} fixtures={fixtures} logos={logos} lang={lang} />}
        {tab === "fight" && <FightTab players={players} teams={teams} fixtures={fixtures} logos={logos} lang={lang} />}
        {tab === "reco" && <div style={{ display: "flex", justifyContent: "center" }}><RecoTab players={players} teams={teams} fixtures={fixtures} logos={logos} lang={lang} /></div>}
        {tab === "stellar" && <StellarTab players={players} teams={teams} fixtures={fixtures} logos={logos} matchEvents={matchEvents} onFight={() => setTab("fight")} lang={lang} />}
      </main>

      {/* Footer */}
      <footer style={{
        textAlign: "center", padding: "20px 16px", fontSize: 10,
        color: "rgba(255,255,255,0.2)", borderTop: "1px solid rgba(255,255,255,0.03)",
        marginTop: 40,
      }}>
        Deglingo Scout · deglingosorare.com · {players.length} joueurs · 4 ligues
      </footer>
    </div>
    </>
  );
}
