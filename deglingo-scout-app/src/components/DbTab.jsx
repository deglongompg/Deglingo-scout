import { useState, useMemo } from "react";
import { dsColor, dsBg, isSilver, POSITION_COLORS, LEAGUE_COLORS, LEAGUE_FLAGS, getArchetypeColor, getAAProfile } from "../utils/colors";
import { dScoreMatch, csProb, findTeam } from "../utils/dscore";
import PlayerCard from "./PlayerCard";

// Strip position prefix from archetype (e.g. "ATT Complet" → "Complet")
const shortArch = (a) => (a || "").replace(/^(ATT|DEF|MIL|GK)\s*/, "") || a;

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
  const [club, setClub] = useState("ALL");
  const [arch, setArch] = useState("ALL");
  const [minL10, setMinL10] = useState(-1);
  const [sortKey, setSortKey] = useState(fixtures?.player_fixtures ? "dsMatch" : "l2");
  const [sortDir, setSortDir] = useState(-1);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [visibleCount, setVisibleCount] = useState(30);
  const [statCols, setStatCols] = useState([]);

  // Toggleable individual stat columns — 5 sections like Sorare AA
  const STAT_DEFS = [
    // DÉFENSE
    { key: "aa_defending", label: "AA Défense (pts)", short: "AA Def", cat: "DEF", isCat: true },
    { key: "avg_won_tackle", label: "Tacles/match", short: "Tac", cat: "DEF" },
    { key: "avg_effective_clearance", label: "Dégagements/match", short: "Clr", cat: "DEF" },
    { key: "avg_blocked_scoring_attempt", label: "Tirs bloqués/match", short: "Blk", cat: "DEF" },
    // POSSESSION
    { key: "aa_possession", label: "AA Possession (pts)", short: "AA Pos", cat: "POSS", isCat: true },
    { key: "avg_interception_won", label: "Interceptions/match", short: "Int", cat: "POSS" },
    { key: "avg_duel_won", label: "Duels gagnés/match", short: "Duel", cat: "POSS" },
    { key: "avg_ball_recovery", label: "Récupérations/match", short: "Rec", cat: "POSS" },
    { key: "avg_won_contest", label: "Contests gagnés/match", short: "Con", cat: "POSS" },
    // PASSES
    { key: "aa_passing", label: "AA Passes (pts)", short: "AA Pas", cat: "PASS", isCat: true },
    { key: "avg_accurate_pass", label: "Passes précises/match", short: "Pass", cat: "PASS" },
    { key: "avg_successful_final_third_passes", label: "Passes 1/3 final/match", short: "FTP", cat: "PASS" },
    { key: "avg_big_chance_created", label: "Grosses occas./match", short: "BCC", cat: "PASS" },
    { key: "avg_accurate_long_balls", label: "Longs ballons/match", short: "Long", cat: "PASS" },
    // ATTAQUE
    { key: "aa_attacking", label: "AA Attaque (pts)", short: "AA Att", cat: "ATT", isCat: true },
    { key: "avg_ontarget_scoring_att", label: "Tirs cadrés/match", short: "TiC", cat: "ATT" },
    { key: "avg_successful_dribble", label: "Dribbles réussis/match", short: "Dri", cat: "ATT" },
    { key: "avg_pen_area_entries", label: "Entrées surface/match", short: "Surf", cat: "ATT" },
    { key: "avg_was_fouled", label: "Fautes subies/match", short: "Foul", cat: "ATT" },
  ];
  const toggleStat = (key) => setStatCols(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);

  const clubs = useMemo(() => {
    const list = league === "ALL" ? players : players.filter(p => p.league === league);
    const set = new Set(list.map(p => p.club).filter(Boolean));
    return [...set].sort();
  }, [players, league]);

  const archetypes = useMemo(() => {
    const set = new Set(players.map(p => p.archetype).filter(Boolean));
    return [...set].sort();
  }, [players]);

  const radarMax = useMemo(() => {
    const keys = ["aa_defending", "aa_passing", "aa_possession", "aa_attacking", "final_third_passes_avg"];
    const mx = {};
    for (const k of keys) {
      mx[k] = Math.max(...players.map(p => p[k] || 0), 1);
    }
    mx._maxAA5 = Math.max(...players.map(p => p.aa5 || 0), 1);
    return mx;
  }, [players]);

  const enriched = useMemo(() => {
    const pf = fixtures?.player_fixtures || {};
    return players.map(p => {
      const fx = pf[p.slug] || pf[p.name];
      const base = { ...p, reg10: p.reg10 ?? p.regularite, ds10: p.ds10 ?? p.ds_rate, ga_season: (p.goals || 0) + (p.assists || 0) };
      if (!fx) return { ...base, dsMatch: null, oppName: null, isHome: null, matchday: null, csPercent: null };
      const oppTeam = findTeam(teams, fx.opp);
      const playerTeam = findTeam(teams, p.club);
      const ds = oppTeam ? dScoreMatch(p, oppTeam, fx.isHome, playerTeam) : null;
      let csPercent = null;
      if (oppTeam) {
        const oppXg = fx.isHome ? (oppTeam.xg_ext || 1.3) : (oppTeam.xg_dom || 1.3);
        const defXga = playerTeam ? (fx.isHome ? (playerTeam.xga_dom || 1.3) : (playerTeam.xga_ext || 1.5)) : 1.3;
        csPercent = csProb(defXga, oppXg, p.league);
      }
      return { ...base, dsMatch: ds, oppName: fx.opp, isHome: fx.isHome, matchday: fx.matchday, csPercent };
    });
  }, [players, teams, fixtures]);

  const filtered = useMemo(() => {
    let list = enriched;
    if (league !== "ALL") list = list.filter(p => p.league === league);
    if (club !== "ALL") list = list.filter(p => p.club === club);
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
  }, [enriched, league, club, pos, arch, minL10, search, sortKey, sortDir]);

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
    padding: "6px 2px", fontSize: 9, color: sortKey === key ? "#A5B4FC" : "rgba(255,255,255,0.55)",
    cursor: "pointer", textAlign: "center", fontWeight: 600, whiteSpace: "nowrap",
    userSelect: "none", borderBottom: "1px solid rgba(255,255,255,0.06)",
  });

  const arrow = (key) => sortKey === key ? (sortDir === -1 ? "↓" : "↑") : "";

  const R = v => v != null ? Math.round(v) : "—";

  const SHORT_NAMES = {
    // Fixtures names
    "Wolverhampton Wanderers": "Wolves", "Manchester United": "Man Utd", "Manchester City": "Man City",
    "Newcastle United": "Newcastle", "Nottingham Forest": "Nott. Forest", "Crystal Palace": "C. Palace",
    "Paris Saint Germain": "PSG", "Marseille": "OM", "Lyon": "OL",
    "Borussia Dortmund": "Dortmund", "Borussia M.Gladbach": "M'gladbach", "Bayern Munich": "Bayern",
    "Bayer Leverkusen": "Leverkusen", "RasenBallsport Leipzig": "Leipzig", "Eintracht Frankfurt": "Frankfurt",
    "VfB Stuttgart": "Stuttgart", "Wolfsburg": "Wolfsburg", "FC Heidenheim": "Heidenheim",
    "Union Berlin": "Union Berlin", "Werder Bremen": "Bremen", "Mainz 05": "Mainz",
    "FC Cologne": "Cologne", "Rayo Vallecano": "Rayo", "Atletico Madrid": "Atletico",
    "Real Sociedad": "R. Sociedad", "Athletic Club": "Bilbao",
    // Club names (player data)
    "Paris Saint-Germain": "PSG", "Olympique de Marseille": "OM", "Olympique Lyonnais": "OL",
    "RC Strasbourg Alsace": "Strasbourg", "Stade Brestois 29": "Brest", "Stade Rennais F.C.": "Rennes",
    "Manchester United FC": "Man Utd", "Manchester City FC": "Man City",
    "Crystal Palace FC": "C. Palace", "Tottenham Hotspur FC": "Tottenham",
    "West Ham United FC": "West Ham", "Brighton & Hove Albion FC": "Brighton",
    "AFC Bournemouth": "Bournemouth", "Leicester City FC": "Leicester",
    "Borussia Mönchengladbach": "M'gladbach", "Bayern München": "Bayern",
    "Bayer 04 Leverkusen": "Leverkusen", "RB Leipzig": "Leipzig",
    "TSG 1899 Hoffenheim": "Hoffenheim", "1. FC Union Berlin": "Union Berlin",
    "1. FC Heidenheim 1846": "Heidenheim", "SC Freiburg": "Freiburg",
    "FC Augsburg": "Augsburg", "SV Werder Bremen": "Bremen", "1. FSV Mainz 05": "Mainz",
    "FC St. Pauli": "St. Pauli", "Atlético de Madrid": "Atletico", "Deportivo Alavés": "Alavés",
  };
  const shortName = (name) => SHORT_NAMES[name] || name;

  // L2 color: same as dsColor (1-100 scale), except explosion = handled by glow badge
  const l2Color = (p) => {
    if (!p.l2) return "rgba(255,255,255,0.5)";
    return dsColor(p.l2);
  };

  return (
    <div style={{ padding: "0 16px 20px" }}>
      <style>{`
        @keyframes explosionPulse { 0%,100%{box-shadow:0 0 4px #4ADE8066,0 0 10px #4ADE8033} 50%{box-shadow:0 0 6px #4ADE8088,0 0 14px #4ADE8044} }
        @keyframes legendShimmer { 0%{background-position:-200% center} 100%{background-position:200% center} }
        @keyframes silverShine { 0%{background-position:200% center} 100%{background-position:-200% center} }
      `}</style>
      {/* Filters */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12, alignItems: "center" }}>
        <input
          placeholder="🔍 Joueur ou club..."
          value={search} onChange={e => { setSearch(e.target.value); setVisibleCount(30); }}
          style={{ ...sel({ flex: "1 1 180px", minWidth: 140 }) }}
        />
        <select value={league} onChange={e => { setLeague(e.target.value); setClub("ALL"); setVisibleCount(30); }} style={sel({ flex: "1 1 0", minWidth: 0 })}>
          <option value="ALL">Ligue</option>
          {["L1", "PL", "Liga", "Bundes"].map(l => (
            <option key={l} value={l}>{LEAGUE_FLAGS[l]} {l}</option>
          ))}
        </select>
        <select value={club} onChange={e => { setClub(e.target.value); setVisibleCount(30); }} style={sel({ flex: "1 1 0", minWidth: 0 })}>
          <option value="ALL">Club</option>
          {clubs.map(c => <option key={c} value={c}>{shortName(c)}</option>)}
        </select>
        <select value={pos} onChange={e => { setPos(e.target.value); setVisibleCount(30); }} style={sel({ flex: "1 1 0", minWidth: 0 })}>
          <option value="ALL">Poste</option>
          {["GK", "DEF", "MIL", "ATT"].map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <select value={arch} onChange={e => { setArch(e.target.value); setVisibleCount(30); }} style={sel({ flex: "1 1 0", minWidth: 0 })}>
          <option value="ALL">Profil</option>
          {archetypes.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={minL10} onChange={e => { setMinL10(Number(e.target.value)); setVisibleCount(30); }} style={sel({ flex: "1 1 0", minWidth: 0 })}>
          <option value={-1}>L10 CAP</option>
          <option value={0}>L10 = 0 (CAP 260)</option>
          {[30, 40, 50, 55, 60, 65, 70].map(v => (
            <option key={v} value={v}>L10 &lt; {v}</option>
          ))}
        </select>
      </div>

      {/* D-Score legend */}
      <div style={{ marginBottom: 10, padding: "10px 14px", background: "linear-gradient(135deg, rgba(99,102,241,0.06), rgba(192,132,252,0.04))", border: "1px solid rgba(99,102,241,0.1)", borderRadius: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.05em", background: "linear-gradient(90deg, #A5B4FC 0%, #C084FC 25%, #E879F9 50%, #C084FC 75%, #A5B4FC 100%)", backgroundSize: "200% auto", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", animation: "legendShimmer 4s linear infinite" }}>
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
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", lineHeight: 1.5 }}>
          Socle (forme L5 + AA + floor + régularité) <span style={{ color: "rgba(255,255,255,0.2)" }}>×</span> Contexte (adversaire, PPDA, xGA, style de jeu) <span style={{ color: "rgba(255,255,255,0.2)" }}>×</span> Momentum (tendance L2, séries) <span style={{ color: "rgba(255,255,255,0.2)" }}>×</span> Dom/Ext
        </div>
        <div style={{ display: "flex", gap: 14, marginTop: 6, alignItems: "center", fontSize: 10, color: "rgba(255,255,255,0.45)", flexWrap: "wrap" }}>
          <span>{filtered.length} joueurs</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
            <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: "linear-gradient(135deg,#4ADE80,#22C55E)", boxShadow: "0 0 6px #4ADE80" }} />
            L2 explosion
          </span>
          <span>Reg10 = % matchs &gt;60 sur L10</span>
          <span>Titu10 = % titularisations sur L10</span>
          <span><span style={{ color: "#FBBF24" }}>L€</span> Limited · <span style={{ color: "#EF4444" }}>R€</span> Rare</span>
        </div>
      </div>

      {/* Stat columns toggle — Sorare daily missions */}
      <div style={{ marginBottom: 8, display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
        {(() => {
          const CAT_ORDER = ["DEF", "POSS", "PASS", "ATT"];
          const CAT_LABELS = { DEF: "🛡️ DEF", POSS: "🔄 POSS", PASS: "🎯 PASS", ATT: "⚔️ ATT" };
          const CAT_COLORS = { DEF: "#60A5FA", POSS: "#FBBF24", PASS: "#4ADE80", ATT: "#F87171" };
          return CAT_ORDER.map(cat => {
            const stats = STAT_DEFS.filter(s => s.cat === cat);
            const catColor = CAT_COLORS[cat];
            return (
              <div key={cat} style={{ display: "flex", alignItems: "center", gap: 3, marginRight: 6, padding: "3px 6px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)" }}>
                <span style={{ fontSize: 9, color: catColor, fontWeight: 700, marginRight: 2, opacity: 0.7 }}>{CAT_LABELS[cat]}</span>
                {stats.map(s => {
                  const active = statCols.includes(s.key);
                  return (
                    <button key={s.key} onClick={() => toggleStat(s.key)} title={s.label}
                      style={{
                        padding: "2px 7px", borderRadius: 6, fontSize: 10, fontWeight: 600, cursor: "pointer",
                        border: active ? `1px solid ${catColor}` : "1px solid rgba(255,255,255,0.08)",
                        background: active ? `${catColor}22` : "rgba(255,255,255,0.03)",
                        color: active ? catColor : "rgba(255,255,255,0.3)",
                        transition: "all 0.15s",
                      }}>
                      {s.short}
                    </button>
                  );
                })}
              </div>
            );
          });
        })()}
        {statCols.length > 0 && (
          <button onClick={() => setStatCols([])} style={{ padding: "2px 8px", borderRadius: 6, fontSize: 9, cursor: "pointer", border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.1)", color: "#EF4444" }}>✕ Reset</button>
        )}
      </div>

      {/* Table */}
      <div style={{ overflowX: "auto", maxHeight: "75vh", overflowY: "auto", borderRadius: 12, border: "1px solid rgba(255,255,255,0.06)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: "Outfit" }}>
          <thead style={{ position: "sticky", top: 0, zIndex: 10 }}>
            <tr style={{ background: "#0C0C2D" }}>
              <th style={{ ...thStyle("name"), textAlign: "left", paddingLeft: 12, cursor: "default" }}>Joueur</th>
              <th style={{ ...thStyle("position"), cursor: "default" }}>Pos</th>
              <th style={thStyle("ga_season")} onClick={() => toggleSort("ga_season")}>G+A{arrow("ga_season")}</th>
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
              {hasFixtures && <>
                <th style={thStyle("dsMatch")} onClick={() => toggleSort("dsMatch")}>
                  <span style={{ color: sortKey === "dsMatch" ? "#C084FC" : "#C084FC80" }}>D-Score{arrow("dsMatch")}</span>
                </th>
                <th style={thStyle("csPercent")} onClick={() => toggleSort("csPercent")}>CS%{arrow("csPercent")}</th>
                <th style={{ ...thStyle("oppName"), cursor: "default" }}>Adv.</th>
              </>}
              <th style={thStyle("price_limited")} onClick={() => toggleSort("price_limited")}>L€{arrow("price_limited")}</th>
              <th style={thStyle("price_rare")} onClick={() => toggleSort("price_rare")}>R€{arrow("price_rare")}</th>
              <th style={{ ...thStyle("archetype"), cursor: "default" }}>Archétype</th>
              <th style={{ ...thStyle("aaProfile"), cursor: "default" }}>Profil AA</th>
              {(() => {
                const CAT_COLORS = { GEN: "#A78BFA", DEF: "#60A5FA", POSS: "#FBBF24", PASS: "#4ADE80", ATT: "#F87171" };
                const ordered = STAT_DEFS.filter(s => statCols.includes(s.key));
                let lastCat = null;
                return ordered.map(def => {
                  const isNewSection = def.cat !== lastCat;
                  lastCat = def.cat;
                  return <th key={def.key} style={{ ...thStyle(def.key), borderLeft: isNewSection ? "2px solid " + CAT_COLORS[def.cat] + "55" : "1px solid rgba(255,255,255,0.04)", color: CAT_COLORS[def.cat] }} onClick={() => toggleSort(def.key)}>{def.short}{arrow(def.key)}</th>;
                });
              })()}
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, visibleCount).map((p, i) => {
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
                  <td style={{ padding: "7px 2px 7px 8px", maxWidth: 170, overflow: "hidden" }}>
                    <div style={{ fontWeight: 600, color: "#fff", fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{countryFlag(p.country)} {p.name}</div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 1, display: "flex", alignItems: "center", gap: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {logos[p.club] && <img src={`/data/logos/${logos[p.club]}`} alt="" style={{ width: 12, height: 12, objectFit: "contain" }} />}
                      {shortName(p.club)}
                    </div>
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <span style={{
                      padding: "2px 6px", borderRadius: 12, fontSize: 9, fontWeight: 600,
                      background: `${POSITION_COLORS[p.position]}18`, color: POSITION_COLORS[p.position],
                    }}>{p.position}</span>
                  </td>
                  <td style={{ textAlign: "center", fontFamily: "DM Mono", fontSize: 11 }}>
                    {p.goals > 0 || p.assists > 0 ? (
                      <span>
                        {p.goals > 0 && <span style={{ color: "#4ADE80", fontWeight: 700 }}>{p.goals}G</span>}
                        {p.goals > 0 && p.assists > 0 && <span style={{ color: "rgba(255,255,255,0.2)" }}> </span>}
                        {p.assists > 0 && <span style={{ color: "#FBBF24", fontWeight: 600 }}>{p.assists}A</span>}
                      </span>
                    ) : (
                      <span style={{ color: "rgba(255,255,255,0.12)" }}>—</span>
                    )}
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <span style={{
                      padding: "2px 6px", borderRadius: 12, fontSize: 11,
                      background: `${LEAGUE_COLORS[p.league]}18`, color: LEAGUE_COLORS[p.league],
                    }}>{LEAGUE_FLAGS[p.league]}</span>
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <span style={{
                      fontFamily: "DM Mono", fontWeight: 700, fontSize: 12, color: isExplosion ? "#fff" : l2Color(p),
                      ...(isExplosion ? {
                        display: "inline-block", padding: "2px 6px", borderRadius: 6,
                        background: "linear-gradient(135deg, #4ADE8099, #22C55E88)",
                        boxShadow: "0 0 4px #4ADE8044, 0 0 10px #4ADE8022",
                        animation: "explosionPulse 2s ease-in-out infinite",
                      } : {}),
                    }}>{R(p.l2)}</span>
                  </td>
                  <td style={{ textAlign: "center", fontFamily: "DM Mono", fontSize: 10, color: "rgba(255,255,255,0.3)" }}>{R(p.aa2)}</td>
                  <td style={{ borderLeft: "1px solid rgba(255,255,255,0.04)", padding: "4px 2px", verticalAlign: "middle" }}>
                    {p.last_5 && p.last_5.length > 0 ? (() => {
                      const arr = p.last_5.slice(-5).reverse();
                      const pad = 5 - arr.length;
                      const slots = Array.from({ length: 5 }, (_, j) => j < pad ? null : arr[j - pad]);
                      return (
                        <div style={{ display: "flex", alignItems: "flex-end", gap: 1, height: 22 }}>
                          {slots.map((v, j) => (
                            <div key={j} style={{
                              width: 4, borderRadius: 1,
                              height: v != null && v > 0 ? Math.max(2, (v / 100) * 22) : v === 0 ? 2 : 0,
                              background: v != null && v > 0 ? dsColor(v) : v === 0 ? "rgba(239,68,68,0.5)" : "transparent",
                              opacity: v != null && v > 0 ? 0.85 : 0.7,
                            }} />
                          ))}
                        </div>
                      );
                    })() : <span style={{ fontSize: 9, color: "rgba(255,255,255,0.15)" }}>—</span>}
                  </td>
                  <td style={{ textAlign: "center", fontFamily: "DM Mono", fontSize: 10, color: "rgba(255,255,255,0.35)" }}>{R(p.l5)}</td>
                  <td style={{ textAlign: "center", fontFamily: "DM Mono", fontSize: 10, color: "rgba(255,255,255,0.3)" }}>{R(p.aa5)}</td>
                  <td style={{ textAlign: "center", fontFamily: "DM Mono", fontWeight: 700, fontSize: 14, color: dsColor(p.l10), borderLeft: "1px solid rgba(255,255,255,0.04)" }}>{R(p.l10)}</td>
                  <td style={{ textAlign: "center", fontFamily: "DM Mono", fontSize: 10, color: "rgba(255,255,255,0.3)" }}>{R(p.aa10)}</td>
                  <td style={{ textAlign: "center", fontFamily: "DM Mono", fontSize: 10, color: "rgba(255,255,255,0.3)", borderLeft: "1px solid rgba(255,255,255,0.04)" }}>{R(p.min_15)}</td>
                  <td style={{ textAlign: "center", fontFamily: "DM Mono", fontSize: 10, color: "rgba(255,255,255,0.3)" }}>{R(p.max_15)}</td>
                  <td style={{ textAlign: "center", fontFamily: "DM Mono", fontSize: 11, color: (p.reg10 ?? p.regularite) >= 80 ? "#4ADE80" : (p.reg10 ?? p.regularite) >= 50 ? "#FBBF24" : "#EF4444", borderLeft: "1px solid rgba(255,255,255,0.04)" }}>{R(p.reg10 ?? p.regularite)}%</td>
                  <td style={{ textAlign: "center", fontFamily: "DM Mono", fontSize: 11, color: p.titu_pct >= 80 ? "#4ADE80" : p.titu_pct >= 50 ? "#FBBF24" : "#EF4444" }}>{R(p.titu_pct)}%</td>
                  {hasFixtures && <>
                    <td style={{ textAlign: "center" }}>
                      {p.dsMatch !== null ? (
                        <span style={{
                          display: "inline-block", padding: "3px 8px", borderRadius: 8,
                          fontFamily: "DM Mono", fontSize: 14, fontWeight: 700,
                          color: isSilver(p.dsMatch) ? "#1a1a2e" : "#fff",
                          background: isSilver(p.dsMatch) ? "linear-gradient(90deg,#C0C0C0,#A8E8D0,#B0C4E8,#D4B0E8,#E0D0E8,#fff,#D4B0E8,#B0C4E8,#A8E8D0,#C0C0C0)" : dsBg(p.dsMatch),
                          backgroundSize: isSilver(p.dsMatch) ? "200% 100%" : "auto",
                          animation: isSilver(p.dsMatch) ? "silverShine 3s linear infinite" : "none",
                          boxShadow: isSilver(p.dsMatch) ? "0 0 10px rgba(255,255,255,0.4), 0 0 20px rgba(200,200,200,0.2)" : `0 0 8px ${dsColor(p.dsMatch)}30`,
                          border: isSilver(p.dsMatch) ? "1px solid rgba(255,255,255,0.5)" : "none",
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
                    <td style={{ textAlign: "left", fontSize: 9, paddingLeft: 4, maxWidth: 100, overflow: "hidden" }}>
                      {p.oppName ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                          <span style={{ width: 14, textAlign: "center", flexShrink: 0 }}>
                            {p.isHome ? "🏠" : "✈️"}
                          </span>
                          {logos[p.oppName] && <img src={`/data/logos/${logos[p.oppName]}`} alt="" style={{ width: 11, height: 11, objectFit: "contain", flexShrink: 0 }} />}
                          <span style={{ color: "rgba(255,255,255,0.5)", whiteSpace: "nowrap" }}>{shortName(p.oppName)}</span>
                        </div>
                      ) : (
                        <span style={{ color: "rgba(255,255,255,0.15)", paddingLeft: 17 }}>—</span>
                      )}
                    </td>
                  </>}
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
                  <td style={{ textAlign: "center" }}>
                    <span style={{
                      padding: "2px 6px", borderRadius: 12, fontSize: 9,
                      background: `${getArchetypeColor(p.archetype)}18`,
                      color: getArchetypeColor(p.archetype),
                    }}>{shortArch(p.archetype)}</span>
                  </td>
                  <td style={{ textAlign: "center" }}>
                    {(() => {
                      const pr = getAAProfile(p);
                      return <span title={pr.desc} style={{
                        padding: "2px 6px", borderRadius: 12, fontSize: 9,
                        background: `${pr.color}18`, color: pr.color,
                        cursor: "help",
                      }}>{pr.emoji} {pr.label}</span>;
                    })()}
                  </td>
                  {(() => {
                    const CAT_COLORS = { GEN: "#A78BFA", DEF: "#60A5FA", POSS: "#FBBF24", PASS: "#4ADE80", ATT: "#F87171" };
                    const ordered = STAT_DEFS.filter(s => statCols.includes(s.key));
                    let lastCat = null;
                    return ordered.map(def => {
                      const val = p[def.key];
                      const isNewSection = def.cat !== lastCat;
                      lastCat = def.cat;
                      const catColor = CAT_COLORS[def.cat];
                      const hasVal = val != null && val !== undefined;
                      const isGen = def.cat === "GEN";
                      const displayColor = !hasVal ? "rgba(255,255,255,0.15)" : isGen ? (val < -5 ? "#EF4444" : val < 0 ? "#FBBF24" : "#4ADE80") : val > 0 ? catColor : "rgba(255,255,255,0.2)";
                      return <td key={def.key} style={{ textAlign: "center", fontFamily: "DM Mono", fontSize: 11, fontWeight: 600, color: displayColor, borderLeft: isNewSection ? `2px solid ${catColor}55` : "1px solid rgba(255,255,255,0.04)" }}>{hasVal ? val.toFixed(1) : "—"}</td>;
                    });
                  })()}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {filtered.length > 0 && (
        <div style={{ textAlign: "center", padding: 12 }}>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
            {Math.min(visibleCount, filtered.length)} / {filtered.length} joueurs
          </span>
          {visibleCount < filtered.length && (
            <button
              onClick={() => setVisibleCount(v => v + 30)}
              style={{
                marginLeft: 12, padding: "6px 18px", borderRadius: 8, border: "1px solid rgba(99,102,241,0.3)",
                background: "rgba(99,102,241,0.1)", color: "#818CF8", fontSize: 11, fontWeight: 600, cursor: "pointer",
              }}
            >
              Voir +30
            </button>
          )}
        </div>
      )}

      {selectedPlayer && <PlayerCard player={selectedPlayer} onClose={() => setSelectedPlayer(null)} logos={logos} radarMax={radarMax} />}
    </div>
  );
}
