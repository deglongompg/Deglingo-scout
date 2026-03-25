import { useState, useMemo } from "react";
import { dsColor, dsBg, POSITION_COLORS, LEAGUE_COLORS, LEAGUE_FLAGS, getArchetypeColor } from "../utils/colors";
import { dScoreMatch } from "../utils/dscore";
import PlayerCard from "./PlayerCard";

export default function DbTab({ players, teams, fixtures }) {
  const [search, setSearch] = useState("");
  const [league, setLeague] = useState("ALL");
  const [pos, setPos] = useState("ALL");
  const [arch, setArch] = useState("ALL");
  const [sortKey, setSortKey] = useState("l5");
  const [sortDir, setSortDir] = useState(-1);
  const [selectedPlayer, setSelectedPlayer] = useState(null);

  const archetypes = useMemo(() => {
    const set = new Set(players.map(p => p.archetype).filter(Boolean));
    return [...set].sort();
  }, [players]);

  // Enrich players with fixture D-Score
  const enriched = useMemo(() => {
    const pf = fixtures?.player_fixtures || {};
    return players.map(p => {
      const fx = pf[p.name];
      if (!fx) return { ...p, dsMatch: null, oppName: null, isHome: null, matchday: null };
      const oppTeam = teams?.find(t => t.name === fx.opp);
      const ds = oppTeam ? dScoreMatch(p, oppTeam, fx.isHome) : null;
      return { ...p, dsMatch: ds, oppName: fx.opp, isHome: fx.isHome, matchday: fx.matchday };
    });
  }, [players, teams, fixtures]);

  const filtered = useMemo(() => {
    let list = enriched;
    if (league !== "ALL") list = list.filter(p => p.league === league);
    if (pos !== "ALL") list = list.filter(p => p.position === pos);
    if (arch !== "ALL") list = list.filter(p => p.archetype === arch);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(q) || p.club.toLowerCase().includes(q));
    }
    list = [...list].sort((a, b) => {
      const va = a[sortKey] ?? -999, vb = b[sortKey] ?? -999;
      return (va - vb) * sortDir;
    });
    return list;
  }, [enriched, league, pos, arch, search, sortKey, sortDir]);

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(d => -d);
    else { setSortKey(key); setSortDir(-1); }
  };

  const hasFixtures = !!fixtures?.player_fixtures;
  const matchdays = fixtures?.matchdays || {};

  const sel = (style) => ({
    background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 8, color: "#fff", padding: "6px 10px", fontSize: 12, outline: "none",
    cursor: "pointer", fontFamily: "Outfit", ...style,
  });

  const thStyle = (key) => ({
    padding: "8px 4px", fontSize: 9, color: sortKey === key ? "#A5B4FC" : "rgba(255,255,255,0.4)",
    cursor: "pointer", textAlign: "center", fontWeight: 600, whiteSpace: "nowrap",
    userSelect: "none", borderBottom: "1px solid rgba(255,255,255,0.06)",
  });

  const arrow = (key) => sortKey === key ? (sortDir === -1 ? " ↓" : " ↑") : "";

  return (
    <div style={{ padding: "0 16px 20px" }}>
      {/* Filters */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12, alignItems: "center" }}>
        <input
          placeholder="🔍 Joueur ou club..."
          value={search} onChange={e => setSearch(e.target.value)}
          style={{ ...sel({ flex: "1 1 180px", minWidth: 140 }) }}
        />
        <select value={league} onChange={e => setLeague(e.target.value)} style={sel({})}>
          <option value="ALL">Toutes ligues</option>
          {["L1", "PL", "Liga", "Bundes"].map(l => (
            <option key={l} value={l}>{LEAGUE_FLAGS[l]} {l}</option>
          ))}
        </select>
        <select value={pos} onChange={e => setPos(e.target.value)} style={sel({})}>
          <option value="ALL">Tous postes</option>
          {["GK", "DEF", "MIL", "ATT"].map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <select value={arch} onChange={e => setArch(e.target.value)} style={sel({})}>
          <option value="ALL">Tous archétypes</option>
          {archetypes.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      {/* Info bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
          {filtered.length} joueur{filtered.length > 1 ? "s" : ""}
        </div>
        {hasFixtures && (
          <div style={{ fontSize: 9, color: "rgba(99,102,241,0.6)", display: "flex", gap: 8 }}>
            {Object.entries(matchdays).map(([lg, md]) => (
              <span key={lg}>{LEAGUE_FLAGS[lg]} J{md}</span>
            ))}
          </div>
        )}
      </div>

      {/* Table */}
      <div style={{ overflowX: "auto", borderRadius: 12, border: "1px solid rgba(255,255,255,0.06)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: "Outfit" }}>
          <thead>
            <tr style={{ background: "rgba(255,255,255,0.02)" }}>
              <th style={{ ...thStyle("name"), textAlign: "left", paddingLeft: 12, cursor: "default" }}>Joueur</th>
              <th style={{ ...thStyle("position"), cursor: "default" }}>Pos</th>
              <th style={{ ...thStyle("league"), cursor: "default" }}>Ligue</th>
              <th style={thStyle("l5")} onClick={() => toggleSort("l5")}>L5{arrow("l5")}</th>
              <th style={thStyle("aa5")} onClick={() => toggleSort("aa5")}>AA5{arrow("aa5")}</th>
              <th style={thStyle("floor")} onClick={() => toggleSort("floor")}>Floor{arrow("floor")}</th>
              <th style={thStyle("ceiling")} onClick={() => toggleSort("ceiling")}>Ceil{arrow("ceiling")}</th>
              <th style={thStyle("regularite")} onClick={() => toggleSort("regularite")}>Rég%{arrow("regularite")}</th>
              <th style={thStyle("ds_rate")} onClick={() => toggleSort("ds_rate")}>DS%{arrow("ds_rate")}</th>
              <th style={thStyle("ga_per_match")} onClick={() => toggleSort("ga_per_match")}>G+A{arrow("ga_per_match")}</th>
              {hasFixtures && <>
                <th style={thStyle("dsMatch")} onClick={() => toggleSort("dsMatch")}>
                  <span style={{ color: sortKey === "dsMatch" ? "#C084FC" : "#C084FC80" }}>D-Score{arrow("dsMatch")}</span>
                </th>
                <th style={{ ...thStyle("oppName"), cursor: "default" }}>Adversaire</th>
              </>}
              <th style={{ ...thStyle("archetype"), cursor: "default" }}>Archétype</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 100).map((p, i) => (
              <tr
                key={`${p.name}-${p.club}-${i}`}
                onClick={() => setSelectedPlayer(p)}
                style={{
                  cursor: "pointer", borderBottom: "1px solid rgba(255,255,255,0.03)",
                  background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)",
                  transition: "background 0.15s",
                }}
                onMouseEnter={e => e.currentTarget.style.background = "rgba(99,102,241,0.08)"}
                onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)"}
              >
                <td style={{ padding: "8px 4px 8px 12px" }}>
                  <div style={{ fontWeight: 600, color: "#fff", fontSize: 12 }}>{p.name}</div>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", marginTop: 1 }}>{p.club}</div>
                </td>
                <td style={{ textAlign: "center" }}>
                  <span style={{
                    padding: "2px 6px", borderRadius: 12, fontSize: 9, fontWeight: 600,
                    background: `${POSITION_COLORS[p.position]}18`, color: POSITION_COLORS[p.position],
                  }}>{p.position}</span>
                </td>
                <td style={{ textAlign: "center" }}>
                  <span style={{
                    padding: "2px 6px", borderRadius: 12, fontSize: 9,
                    background: `${LEAGUE_COLORS[p.league]}18`, color: LEAGUE_COLORS[p.league],
                  }}>{LEAGUE_FLAGS[p.league]} {p.league}</span>
                </td>
                <td style={{ textAlign: "center", fontFamily: "DM Mono", fontWeight: 700, fontSize: 12, color: dsColor(p.l5) }}>{p.l5}</td>
                <td style={{ textAlign: "center", fontFamily: "DM Mono", fontSize: 11, color: p.aa5 >= 20 ? "#A5B4FC" : "rgba(255,255,255,0.5)" }}>{p.aa5}</td>
                <td style={{ textAlign: "center", fontFamily: "DM Mono", fontSize: 11, color: dsColor(p.floor) }}>{p.floor}</td>
                <td style={{ textAlign: "center", fontFamily: "DM Mono", fontSize: 11, color: dsColor(p.ceiling) }}>{p.ceiling}</td>
                <td style={{ textAlign: "center", fontFamily: "DM Mono", fontSize: 11, color: p.regularite >= 80 ? "#4ADE80" : p.regularite >= 50 ? "#FBBF24" : "#EF4444" }}>{p.regularite}%</td>
                <td style={{ textAlign: "center", fontFamily: "DM Mono", fontSize: 11, color: p.ds_rate >= 50 ? "#4ADE80" : p.ds_rate >= 30 ? "#FBBF24" : "rgba(255,255,255,0.4)" }}>{p.ds_rate}%</td>
                <td style={{ textAlign: "center", fontFamily: "DM Mono", fontSize: 11, color: p.ga_per_match >= 0.5 ? "#4ADE80" : p.ga_per_match >= 0.2 ? "#FBBF24" : "rgba(255,255,255,0.4)" }}>{(p.ga_per_match || 0).toFixed(2)}</td>
                {hasFixtures && <>
                  <td style={{ textAlign: "center" }}>
                    {p.dsMatch !== null ? (
                      <span style={{
                        display: "inline-block", padding: "3px 8px", borderRadius: 8,
                        fontFamily: "DM Mono", fontSize: 12, fontWeight: 700,
                        color: "#fff", background: dsBg(p.dsMatch),
                        boxShadow: `0 0 8px ${dsColor(p.dsMatch)}30`,
                      }}>{p.dsMatch}</span>
                    ) : (
                      <span style={{ fontSize: 9, color: "rgba(255,255,255,0.15)" }}>—</span>
                    )}
                  </td>
                  <td style={{ textAlign: "center", fontSize: 9 }}>
                    {p.oppName ? (
                      <div>
                        <span style={{ color: p.isHome ? "#4ADE80" : "#F87171", fontWeight: 600 }}>
                          {p.isHome ? "🏠" : "✈️"}
                        </span>
                        <span style={{ color: "rgba(255,255,255,0.5)", marginLeft: 3 }}>{p.oppName}</span>
                      </div>
                    ) : (
                      <span style={{ color: "rgba(255,255,255,0.15)" }}>—</span>
                    )}
                  </td>
                </>}
                <td style={{ textAlign: "center" }}>
                  <span style={{
                    padding: "2px 6px", borderRadius: 12, fontSize: 9,
                    background: `${getArchetypeColor(p.archetype)}18`,
                    color: getArchetypeColor(p.archetype),
                  }}>{p.archetype}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length > 100 && (
        <div style={{ textAlign: "center", padding: 12, fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
          Affichage limité à 100 joueurs — affine tes filtres
        </div>
      )}

      {selectedPlayer && <PlayerCard player={selectedPlayer} onClose={() => setSelectedPlayer(null)} />}
    </div>
  );
}
