import { useState, useEffect } from "react";
import DbTab from "./components/DbTab";
import FightTab from "./components/FightTab";
import RecoTab from "./components/RecoTab";

const TABS = [
  { id: "db", label: "Database", icon: "📊" },
  { id: "fight", label: "Fight", icon: "🥊" },
  { id: "reco", label: "Reco SO7", icon: "⚽" },
];

export default function App() {
  const [tab, setTab] = useState("db");
  const [players, setPlayers] = useState(null);
  const [teams, setTeams] = useState(null);
  const [fixtures, setFixtures] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([
      fetch("/data/players.json").then(r => { if (!r.ok) throw new Error("players.json"); return r.json(); }),
      fetch("/data/teams.json").then(r => { if (!r.ok) throw new Error("teams.json"); return r.json(); }),
      fetch("/data/fixtures.json").then(r => r.ok ? r.json() : null).catch(() => null),
    ])
      .then(([p, t, f]) => { setPlayers(p); setTeams(t); setFixtures(f); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  if (loading) return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "linear-gradient(170deg, #04040F, #080820 25%, #0C0C2D 50%, #0A0A22 75%, #060612)",
      color: "#A5B4FC", fontFamily: "Outfit", fontSize: 16,
    }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>⚽</div>
        <div>Chargement des données...</div>
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

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(170deg, #04040F, #080820 25%, #0C0C2D 50%, #0A0A22 75%, #060612)",
      color: "#ffffff", fontFamily: "'Outfit', sans-serif",
    }}>
      {/* Header */}
      <header style={{
        position: "sticky", top: 0, zIndex: 100,
        background: "rgba(4,4,15,0.9)", backdropFilter: "blur(20px)",
        borderBottom: "1px solid rgba(255,255,255,0.04)", padding: "12px 16px",
      }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          maxWidth: 1000, margin: "0 auto",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 22 }}>⚽</span>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: "-0.5px" }}>DEGLINGO SCOUT</div>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", letterSpacing: "2px", textTransform: "uppercase" }}>
                Sorare SO7 Analytics
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 4 }}>
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  padding: "6px 14px", borderRadius: 10, fontSize: 12, fontWeight: 600,
                  border: "none", cursor: "pointer", fontFamily: "Outfit",
                  background: tab === t.id ? "rgba(99,102,241,0.12)" : "transparent",
                  color: tab === t.id ? "#A5B4FC" : "rgba(255,255,255,0.4)",
                  outline: tab === t.id ? "1px solid rgba(99,102,241,0.3)" : "none",
                  transition: "all 0.2s",
                }}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Content */}
      <main style={{ maxWidth: 1000, margin: "0 auto", paddingTop: 20 }}>
        {tab === "db" && <DbTab players={players} teams={teams} fixtures={fixtures} />}
        {tab === "fight" && <FightTab players={players} teams={teams} />}
        {tab === "reco" && <RecoTab players={players} teams={teams} fixtures={fixtures} />}
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
  );
}
