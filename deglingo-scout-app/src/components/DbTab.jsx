import { useState, useMemo } from "react";
import { dsColor, dsBg, POSITION_COLORS, LEAGUE_COLORS, LEAGUE_FLAGS, getArchetypeColor } from "../utils/colors";
import { dScoreMatch, csProb, findTeam } from "../utils/dscore";
import PlayerCard from "./PlayerCard";

// ISO 2/3 letter country code → flag emoji
const ISO3_TO_2 = {arg:"ar",bra:"br",bel:"be",can:"ca",che:"ch",cmr:"cm",civ:"ci",col:"co",cri:"cr",cze:"cz",deu:"de",dnk:"dk",esp:"es",fra:"fr",gbr:"gb",gha:"gh",gin:"gn",gre:"gr",hrv:"hr",hun:"hu",isl:"is",isr:"il",ita:"it",jpn:"jp",kor:"kr",mar:"ma",mex:"mx",nga:"ng",nld:"nl",nor:"no",per:"pe",pol:"pl",prt:"pt",rou:"ro",sen:"sn",srb:"rs",sui:"ch",svk:"sk",svn:"si",swe:"se",tun:"tn",tur:"tr",ukr:"ua",uru:"uy",usa:"us",ven:"ve",zaf:"za",ago:"ao",bfa:"bf",bdi:"bi",ben:"bj",caf:"cf",cod:"cd",cpv:"cv",ecu:"ec",geo:"ge",gnb:"gw",guy:"gy",jam:"jm",kos:"xk",mli:"ml",mne:"me",moz:"mz",mrt:"mr",mda:"md",mkd:"mk",pan:"pa",par:"py",prk:"kp",rwa:"rw",tgo:"tg",uzb:"uz",zmb:"zm",zwe:"zw"};
function countryFlag(code) {
  if (!code) return "";
  const c = code.toLowerCase();
  const iso2 = c.length === 3 ? (ISO3_TO_2[c] || c.slice(0, 2)) : c;
  if (iso2.length !== 2) return "";
  return String.fromCodePoint(...[...iso2.toUpperCase()].map(c => c.charCodeAt(0) + 127397));
}

export default function DbTab({ players, teams, fixtures, logos = {} }) {
  const [search, setSearch] = useState("");
  const [league, setLeague] = useState("ALL");
  const [pos, setPos] = useState("ALL");
  const [arch, setArch] = useState("ALL");
  const [minL10, setMinL10] = useState(-1);
  const [sortKey, setSortKey] = useState(fixtures?.player_fixtures ? "dsMatch" : "l2");
  const [sortDir, setSortDir] = useState(-1);
  const [selectedPlayer, setSelectedPlayer] = useState(null);

  const archetypes = useMemo(() => {
    const set = new Set(players.map(p => p.archetype).filter(Boolean));
    return [...set].sort();
  }, [players]);

  const enriched = useMemo(() => {
    const pf = fixtures?.player_fixtures || {};
    return players.map(p => {
      const fx = pf[p.name];
      const base = { ...p, reg10: p.reg10 ?? p.regularite, ds10: p.ds10 ?? p.ds_rate };
      if (!fx) return { ...base, dsMatch: null, oppName: null, isHome: null, matchday: null, csPercent: null };
      const oppTeam = teams?.find(t => t.name === fx.opp);
      const ds = oppTeam ? dScoreMatch(p, oppTeam, fx.isHome) : null;
      let csPercent = null;
      if (oppTeam) {
        const oppXg = fx.isHome ? (oppTeam.xg_ext || 1.3) : (oppTeam.xg_dom || 1.3);
        const playerTeam = findTeam(teams, p.club);
        const defXga = playerTeam ? (fx.isHome ? (playerTeam.xga_dom || 1.3) : (playerTeam.xga_ext || 1.5)) : 1.3;
        csPercent = csProb(defXga, oppXg, p.league);
      }
      return { ...base, dsMatch: ds, oppName: fx.opp, isHome: fx.isHome, matchday: fx.matchday, csPercent };
    });
  }, [players, teams, fixtures]);

  const filtered = useMemo(() => {
    let list = enriched;
    if (league !== "ALL") list = list.filter(p => p.league === league);
    if (pos !== "ALL") list = list.filter(p => p.position === pos);
    if (arch !== "ALL") list = list.filter(p => p.archetype === arch);
    if (minL10 === 0) list = list.filter(p => !p.l10 || p.l10 === 0);
    else if (minL10 > 0) list = list.filter(p => (p.l10 || 0) < minL10);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(q) || p.club.toLowerCase().includes(q));
    }
    list = [...list].sort((a, b) => {
      const va = a[sortKey] ?? -999, vb = b[sortKey] ?? -999;
      return (va - vb) * sortDir;
    });
    return list;
  }, [enriched, league, pos, arch, minL10, search, sortKey, sortDir]);

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
    padding: "8px 3px", fontSize: 9, color: sortKey === key ? "#A5B4FC" : "rgba(255,255,255,0.4)",
    cursor: "pointer", textAlign: "center", fontWeight: 600, whiteSpace: "nowrap",
    userSelect: "none", borderBottom: "1px solid rgba(255,255,255,0.06)",
  });

  const arrow = (key) => sortKey === key ? (sortDir === -1 ? "↓" : "↑") : "";

  const R = v => v != null ? Math.round(v) : "—";

  // L2 color: same as dsColor (1-100 scale), except explosion = handled by glow badge
  const l2Color = (p) => {
    if (!p.l2) return "rgba(255,255,255,0.5)";
    return dsColor(p.l2);
  };

  return (
    <div style={{ padding: "0 16px 20px" }}>
      <style>{`
        @keyframes explosionPulse { 0%,100%{box-shadow:0 0 8px #4ADE80,0 0 20px #4ADE8088,0 0 40px #22C55E44} 50%{box-shadow:0 0 12px #4ADE80,0 0 28px #4ADE80AA,0 0 50px #22C55E66} }
        @keyframes legendShimmer { 0%{background-position:-200% center} 100%{background-position:200% center} }
      `}</style>
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
        <select value={minL10} onChange={e => setMinL10(Number(e.target.value))} style={sel({})}>
          <option value={-1}>L10 tous</option>
          <option value={0}>L10 = 0 (CAP 260)</option>
          {[30, 40, 50, 55, 60, 65, 70].map(v => (
            <option key={v} value={v}>L10 &lt; {v}</option>
          ))}
        </select>
      </div>

      {/* D-Score legend */}
      <div style={{ marginBottom: 10, padding: "10px 14px", background: "linear-gradient(135deg, rgba(99,102,241,0.06), rgba(192,132,252,0.04))", border: "1px solid rgba(99,102,241,0.1)", borderRadius: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", background: "linear-gradient(90deg, #A5B4FC 0%, #C084FC 25%, #E879F9 50%, #C084FC 75%, #A5B4FC 100%)", backgroundSize: "200% auto", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", animation: "legendShimmer 4s linear infinite" }}>
            ⚡ D-SCORE — L'algo magique qui t'aide à choisir tes meilleurs joueurs pour ta prochaine Streak & GW Sorare ✨
          </div>
          {hasFixtures && (
            <div style={{ fontSize: 9, color: "rgba(99,102,241,0.6)", display: "flex", gap: 8 }}>
              {Object.entries(matchdays).map(([lg, md]) => (
                <span key={lg}>{LEAGUE_FLAGS[lg]} J{md}</span>
              ))}
            </div>
          )}
        </div>
        <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", lineHeight: 1.5 }}>
          Socle (forme L5 + AA + floor + régularité) <span style={{ color: "rgba(255,255,255,0.15)" }}>×</span> Contexte (adversaire, PPDA, xGA, style de jeu) <span style={{ color: "rgba(255,255,255,0.15)" }}>×</span> Momentum (tendance L2, séries) <span style={{ color: "rgba(255,255,255,0.15)" }}>×</span> Dom/Ext
        </div>
        <div style={{ display: "flex", gap: 14, marginTop: 6, alignItems: "center", fontSize: 9, color: "rgba(255,255,255,0.35)", flexWrap: "wrap" }}>
          <span>{filtered.length} joueurs</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
            <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: "linear-gradient(135deg,#4ADE80,#22C55E)", boxShadow: "0 0 6px #4ADE80" }} />
            L2 explosion
          </span>
          <span><span style={{ color: "#FBBF24" }}>L€</span> Limited · <span style={{ color: "#EF4444" }}>R€</span> Rare</span>
        </div>
      </div>

      {/* Table */}
      <div style={{ overflowX: "auto", borderRadius: 12, border: "1px solid rgba(255,255,255,0.06)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: "Outfit" }}>
          <thead>
            <tr style={{ background: "rgba(255,255,255,0.02)" }}>
              <th style={{ ...thStyle("name"), textAlign: "left", paddingLeft: 12, cursor: "default" }}>Joueur</th>
              <th style={{ ...thStyle("position"), cursor: "default" }}>Pos</th>
              <th style={{ ...thStyle("league"), cursor: "default" }}>Ligue</th>
              <th style={{ ...thStyle("l2"), background: sortKey === "l2" ? "rgba(74,222,128,0.06)" : "transparent" }} onClick={() => toggleSort("l2")}>L2{arrow("l2")}</th>
              <th style={thStyle("aa2")} onClick={() => toggleSort("aa2")}>AA2{arrow("aa2")}</th>
              <th style={{ ...thStyle("last5"), borderLeft: "1px solid rgba(255,255,255,0.06)", cursor: "default", fontSize: 8, color: "rgba(255,255,255,0.25)" }}>Last 5</th>
              <th style={thStyle("l5")} onClick={() => toggleSort("l5")}>L5{arrow("l5")}</th>
              <th style={thStyle("aa5")} onClick={() => toggleSort("aa5")}>AA5{arrow("aa5")}</th>
              <th style={{ ...thStyle("l10"), borderLeft: "1px solid rgba(255,255,255,0.06)" }} onClick={() => toggleSort("l10")}>L10{arrow("l10")}</th>
              <th style={thStyle("aa10")} onClick={() => toggleSort("aa10")}>AA10{arrow("aa10")}</th>
              <th style={{ ...thStyle("min_15"), borderLeft: "1px solid rgba(255,255,255,0.06)" }} onClick={() => toggleSort("min_15")}>Min{arrow("min_15")}</th>
              <th style={thStyle("max_15")} onClick={() => toggleSort("max_15")}>Max{arrow("max_15")}</th>
              <th style={{ ...thStyle("reg10"), borderLeft: "1px solid rgba(255,255,255,0.06)" }} onClick={() => toggleSort("reg10")}>Reg10{arrow("reg10")}</th>
              <th style={thStyle("titu_pct")} onClick={() => toggleSort("titu_pct")}>Titu10{arrow("titu_pct")}</th>
              <th style={thStyle("price_limited")} onClick={() => toggleSort("price_limited")}>L€{arrow("price_limited")}</th>
              <th style={thStyle("price_rare")} onClick={() => toggleSort("price_rare")}>R€{arrow("price_rare")}</th>
              {hasFixtures && <>
                <th style={thStyle("dsMatch")} onClick={() => toggleSort("dsMatch")}>
                  <span style={{ color: sortKey === "dsMatch" ? "#C084FC" : "#C084FC80" }}>D-Score{arrow("dsMatch")}</span>
                </th>
                <th style={thStyle("csPercent")} onClick={() => toggleSort("csPercent")}>CS%{arrow("csPercent")}</th>
                <th style={{ ...thStyle("oppName"), cursor: "default" }}>Adv.</th>
              </>}
              <th style={{ ...thStyle("archetype"), cursor: "default" }}>Archétype</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 100).map((p, i) => {
              const l2Diff = (p.l2 || 0) - (p.l5 || 0);
              const isExplosion = l2Diff >= 15;
              return (
                <tr
                  key={`${p.name}-${p.club}-${i}`}
                  onClick={() => setSelectedPlayer(p)}
                  style={{
                    cursor: "pointer", borderBottom: "1px solid rgba(255,255,255,0.03)",
                    background: isExplosion ? "rgba(74,222,128,0.03)" : i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = "rgba(99,102,241,0.08)"}
                  onMouseLeave={e => e.currentTarget.style.background = isExplosion ? "rgba(74,222,128,0.03)" : i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)"}
                >
                  <td style={{ padding: "8px 4px 8px 12px" }}>
                    <div style={{ fontWeight: 600, color: "#fff", fontSize: 12 }}>{countryFlag(p.country)} {p.name}</div>
                    <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", marginTop: 1, display: "flex", alignItems: "center", gap: 3 }}>
                      {logos[p.club] && <img src={`/data/logos/${logos[p.club]}`} alt="" style={{ width: 12, height: 12, objectFit: "contain" }} />}
                      {p.club}
                    </div>
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
                    }}>{LEAGUE_FLAGS[p.league]}</span>
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <span style={{
                      fontFamily: "DM Mono", fontWeight: 700, fontSize: 14, color: isExplosion ? "#fff" : l2Color(p),
                      ...(isExplosion ? {
                        display: "inline-block", padding: "2px 6px", borderRadius: 6,
                        background: "linear-gradient(135deg, #4ADE80, #22C55E)",
                        boxShadow: "0 0 8px #4ADE80, 0 0 20px #4ADE8088, 0 0 40px #22C55E44",
                        animation: "explosionPulse 2s ease-in-out infinite",
                      } : {}),
                    }}>{R(p.l2)}</span>
                  </td>
                  <td style={{ textAlign: "center", fontFamily: "DM Mono", fontSize: 10, color: "rgba(255,255,255,0.3)" }}>{R(p.aa2)}</td>
                  <td style={{ borderLeft: "1px solid rgba(255,255,255,0.04)", padding: "4px 2px", verticalAlign: "middle" }}>
                    {p.last_5 && p.last_5.length > 0 ? (
                      <div style={{ display: "flex", alignItems: "flex-end", gap: 1, height: 22, justifyContent: "center" }}>
                        {p.last_5.slice().reverse().map((v, j) => (
                          <div key={j} style={{
                            width: 4, borderRadius: 1,
                            height: Math.max(2, (v / 100) * 22),
                            background: dsColor(v),
                            opacity: 0.85,
                          }} />
                        ))}
                      </div>
                    ) : <span style={{ fontSize: 9, color: "rgba(255,255,255,0.15)" }}>—</span>}
                  </td>
                  <td style={{ textAlign: "center", fontFamily: "DM Mono", fontSize: 10, color: "rgba(255,255,255,0.35)" }}>{R(p.l5)}</td>
                  <td style={{ textAlign: "center", fontFamily: "DM Mono", fontSize: 10, color: "rgba(255,255,255,0.3)" }}>{R(p.aa5)}</td>
                  <td style={{ textAlign: "center", fontFamily: "DM Mono", fontWeight: 700, fontSize: 14, color: dsColor(p.l10), borderLeft: "1px solid rgba(255,255,255,0.04)" }}>{R(p.l10)}</td>
                  <td style={{ textAlign: "center", fontFamily: "DM Mono", fontSize: 10, color: "rgba(255,255,255,0.3)" }}>{R(p.aa10)}</td>
                  <td style={{ textAlign: "center", fontFamily: "DM Mono", fontSize: 11, color: dsColor(p.min_15), borderLeft: "1px solid rgba(255,255,255,0.04)" }}>{R(p.min_15)}</td>
                  <td style={{ textAlign: "center", fontFamily: "DM Mono", fontSize: 11, color: dsColor(p.max_15) }}>{R(p.max_15)}</td>
                  <td style={{ textAlign: "center", fontFamily: "DM Mono", fontSize: 11, color: (p.reg10 ?? p.regularite) >= 80 ? "#4ADE80" : (p.reg10 ?? p.regularite) >= 50 ? "#FBBF24" : "#EF4444", borderLeft: "1px solid rgba(255,255,255,0.04)" }}>{R(p.reg10 ?? p.regularite)}%</td>
                  <td style={{ textAlign: "center", fontFamily: "DM Mono", fontSize: 11, color: p.titu_pct >= 80 ? "#4ADE80" : p.titu_pct >= 50 ? "#FBBF24" : "#EF4444" }}>{R(p.titu_pct)}%</td>
                  <td style={{ textAlign: "center", fontFamily: "DM Mono", fontSize: 10, borderLeft: "1px solid rgba(255,255,255,0.04)" }}>
                    {p.price_limited != null ? (
                      <span style={{ color: "#FBBF24" }}>{p.price_limited < 1 ? p.price_limited.toFixed(2) : Math.round(p.price_limited)}€</span>
                    ) : <span style={{ color: "rgba(255,255,255,0.12)" }}>—</span>}
                  </td>
                  <td style={{ textAlign: "center", fontFamily: "DM Mono", fontSize: 10 }}>
                    {p.price_rare != null ? (
                      <span style={{ color: "#EF4444" }}>{p.price_rare < 1 ? p.price_rare.toFixed(2) : Math.round(p.price_rare)}€</span>
                    ) : <span style={{ color: "rgba(255,255,255,0.12)" }}>—</span>}
                  </td>
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
                    <td style={{ textAlign: "center", fontFamily: "DM Mono", fontSize: 11 }}>
                      {p.csPercent != null ? (
                        <span style={{ color: p.csPercent >= 40 ? "#4ADE80" : p.csPercent >= 25 ? "#FCD34D" : p.csPercent >= 15 ? "#FB923C" : "#EF4444", fontWeight: 600 }}>{p.csPercent}%</span>
                      ) : (
                        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.15)" }}>—</span>
                      )}
                    </td>
                    <td style={{ textAlign: "left", fontSize: 9, paddingLeft: 4 }}>
                      {p.oppName ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                          <span style={{ width: 14, textAlign: "center", flexShrink: 0 }}>
                            {p.isHome ? "🏠" : "✈️"}
                          </span>
                          {logos[p.oppName] && <img src={`/data/logos/${logos[p.oppName]}`} alt="" style={{ width: 11, height: 11, objectFit: "contain", flexShrink: 0 }} />}
                          <span style={{ color: "rgba(255,255,255,0.5)" }}>{p.oppName}</span>
                        </div>
                      ) : (
                        <span style={{ color: "rgba(255,255,255,0.15)", paddingLeft: 17 }}>—</span>
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
              );
            })}
          </tbody>
        </table>
      </div>

      {filtered.length > 100 && (
        <div style={{ textAlign: "center", padding: 12, fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
          Affichage limité à 100 joueurs — affine tes filtres
        </div>
      )}

      {selectedPlayer && <PlayerCard player={selectedPlayer} onClose={() => setSelectedPlayer(null)} logos={logos} />}
    </div>
  );
}
