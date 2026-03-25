import { useState, useMemo } from "react";
import { dsColor, dsBg, POSITION_COLORS, LEAGUE_COLORS, LEAGUE_FLAGS, getArchetypeColor } from "../utils/colors";
import PlayerCard from "./PlayerCard";

export default function DbTab({ players }) {
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

  const filtered = useMemo(() => {
    let list = players;
    if (league !== "ALL") list = list.filter(p => p.league === league);
    if (pos !== "ALL") list = list.filter(p => p.position === pos);
    if (arch !== "ALL") list = list.filter(p => p.archetype === arch);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(q) || p.club.toLowerCase().includes(q));
    }
    list = [...list].sort((a, b) => {
      const va = a[sortKey] ?? 0, vb = b[sortKey] ?? 0;
      return (va - vb) * sortDir;
    });
    return list;
  }, [players, league, pos, arch, search, sortKey, sortDir]);

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(d => -d);
    else { setSortKey(key); setSortDir(-1); }
  };

  const sel = (style) => ({
    background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 8, color: "#fff", padding: "6px 10px", fontSize: 12, outline: "none",
    cursor: "pointer", fontFamily: "Outfit", ...style,
  });

  const thStyle = (key) => ({
    padding: "8px 6px", fontSize: 10, color: sortKey === key ? "#A5B4FC" : "rgba(255,255,255,0.4)",
    cursor: "pointer", textAlign: "center", fontWeight: 600, whiteSpace: "nowrap",
    userSelect: "none", borderBottom: "1px solid rgba(255,255,255,0.06)",
  });

  return (
    <div style={{ padding: "0 16px 20px" }}>
      {/* Filters */}
      <div style={{
        display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16, alignItems: "center",
      }}>
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

      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginBottom: 8 }}>
        {filtered.length} joueur{filtered.length > 1 ? "s" : ""}
      </div>

      {/* Table */}
      <div style={{ overflowX: "auto", borderRadius: 12, border: "1px solid rgba(255,255,255,0.06)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: "Outfit" }}>
          <thead>
            <tr style={{ background: "rgba(255,255,255,0.02)" }}>
              <th style={{ ...thStyle("name"), textAlign: "left", paddingLeft: 12 }}>Joueur</th>
              <th style={thStyle("position")}>Pos</th>
              <th style={thStyle("league")}>Ligue</th>
              <th style={{ ...thStyle("l5"), cursor: "pointer" }} onClick={() => toggleSort("l5")}>
                L5 {sortKey === "l5" ? (sortDir === -1 ? "↓" : "↑") : ""}
              </th>
              <th style={{ ...thStyle("aa5"), cursor: "pointer" }} onClick={() => toggleSort("aa5")}>
                AA5 {sortKey === "aa5" ? (sortDir === -1 ? "↓" : "↑") : ""}
              </th>
              <th style={{ ...thStyle("floor"), cursor: "pointer" }} onClick={() => toggleSort("floor")}>
                Floor {sortKey === "floor" ? (sortDir === -1 ? "↓" : "↑") : ""}
              </th>
              <th style={{ ...thStyle("regularite"), cursor: "pointer" }} onClick={() => toggleSort("regularite")}>
                Rég% {sortKey === "regularite" ? (sortDir === -1 ? "↓" : "↑") : ""}
              </th>
              <th style={thStyle("archetype")}>Archétype</th>
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
                <td style={{ padding: "10px 6px 10px 12px" }}>
                  <div style={{ fontWeight: 600, color: "#fff" }}>{p.name}</div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 1 }}>{p.club}</div>
                </td>
                <td style={{ textAlign: "center" }}>
                  <span style={{
                    padding: "2px 8px", borderRadius: 12, fontSize: 10, fontWeight: 600,
                    background: `${POSITION_COLORS[p.position]}18`, color: POSITION_COLORS[p.position],
                  }}>{p.position}</span>
                </td>
                <td style={{ textAlign: "center" }}>
                  <span style={{
                    padding: "2px 8px", borderRadius: 12, fontSize: 10,
                    background: `${LEAGUE_COLORS[p.league]}18`, color: LEAGUE_COLORS[p.league],
                  }}>{LEAGUE_FLAGS[p.league]} {p.league}</span>
                </td>
                <td style={{ textAlign: "center", fontFamily: "DM Mono", fontWeight: 700, color: dsColor(p.l5) }}>{p.l5}</td>
                <td style={{ textAlign: "center", fontFamily: "DM Mono", color: "#A5B4FC" }}>{p.aa5}</td>
                <td style={{ textAlign: "center", fontFamily: "DM Mono", color: dsColor(p.floor) }}>{p.floor}</td>
                <td style={{ textAlign: "center", fontFamily: "DM Mono", color: p.regularite >= 80 ? "#4ADE80" : p.regularite >= 50 ? "#FBBF24" : "#EF4444" }}>{p.regularite}%</td>
                <td style={{ textAlign: "center" }}>
                  <span style={{
                    padding: "2px 8px", borderRadius: 12, fontSize: 10,
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
