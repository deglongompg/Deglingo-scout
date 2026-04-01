import { useState, useMemo } from "react";
import { dsColor, dsBg, isSilver, POSITION_COLORS, LEAGUE_COLORS, LEAGUE_FLAGS, LEAGUE_FLAG_CODES, getArchetypeColor, getAAProfile } from "../utils/colors";
import { dScoreMatch, csProb, findTeam, isExtraGoat } from "../utils/dscore";
import PlayerCard from "./PlayerCard";
import { t } from "../utils/i18n";

// Strip position prefix from archetype (e.g. "ATT Complet" → "Complet")
const shortArch = (a) => (a || "").replace(/^(ATT|DEF|MIL|GK)\s*/, "") || a;

// ISO 2/3 letter country code → ISO2 for flag images
const ISO3_TO_2 = {arg:"ar",bra:"br",bel:"be",can:"ca",che:"ch",cmr:"cm",civ:"ci",col:"co",cri:"cr",cze:"cz",deu:"de",dnk:"dk",esp:"es",fra:"fr",gbr:"gb",gha:"gh",gin:"gn",gre:"gr",hrv:"hr",hun:"hu",isl:"is",isr:"il",ita:"it",jpn:"jp",kor:"kr",mar:"ma",mex:"mx",nga:"ng",nld:"nl",nor:"no",per:"pe",pol:"pl",prt:"pt",rou:"ro",sen:"sn",srb:"rs",sui:"ch",svk:"sk",svn:"si",swe:"se",tun:"tn",tur:"tr",ukr:"ua",uru:"uy",usa:"us",ven:"ve",zaf:"za",ago:"ao",bfa:"bf",bdi:"bi",ben:"bj",caf:"cf",cod:"cd",cpv:"cv",ecu:"ec",geo:"ge",gnb:"gw",guy:"gy",jam:"jm",kos:"xk",mli:"ml",mne:"me",moz:"mz",mrt:"mr",mda:"md",mkd:"mk",pan:"pa",par:"py",prk:"kp",rwa:"rw",tgo:"tg",uzb:"uz",zmb:"zm",zwe:"zw"};
function countryToIso2(code) {
  if (!code) return "";
  const c = code.toLowerCase();
  return c.length === 3 ? (ISO3_TO_2[c] || c.slice(0, 2)) : c;
}
function CountryFlag({ code, size = 14 }) {
  const iso2 = countryToIso2(code);
  if (!iso2 || iso2.length !== 2) return null;
  return <img src={`https://flagcdn.com/w40/${iso2}.png`} alt={iso2} width={size} height={Math.round(size * 0.75)} style={{ verticalAlign: "middle", borderRadius: 2, objectFit: "cover" }} />;
}

export default function DbTab({ players, teams, fixtures, logos = {}, lang = "fr" }) {
  const [search, setSearch] = useState("");
  const [leagues, setLeagues] = useState(new Set()); // vide = ALL
  const [pos, setPos] = useState("ALL");
  const [club, setClub] = useState("ALL");
  const [arch, setArch] = useState("ALL");
  const [minL10, setMinL10] = useState(-1);
  const [selectedDate, setSelectedDate] = useState(null);
  const [sortKey, setSortKey] = useState(fixtures?.player_fixtures ? "dsMatch" : "l2");
  const [sortDir, setSortDir] = useState(-1);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [visibleCount, setVisibleCount] = useState(30);
  const [statCols, setStatCols] = useState([]);
  const [u23Only, setU23Only] = useState(false);

  // Toggleable individual stat columns — 5 sections like Sorare AA
  const __ = (fr, en) => lang === "en" ? en : fr;
  const STAT_DEFS = [
    // DÉFENSE
    { key: "aa_defending", label: __("AA Défense (pts)", "AA Defence (pts)"), short: "AA Def", cat: "DEF", isCat: true, tip: __("Points Sorare Défense (pondérés par poste) — moyenne par match", "Sorare Defence points (position-weighted) — average per match") },
    { key: "avg_won_tackle", label: __("Tacles/match", "Tackles/match"), short: "Tac", cat: "DEF", tip: __("Tacles réussis par match (nombre brut)", "Successful tackles per match (raw count)") },
    { key: "avg_effective_clearance", label: __("Dégagements/match", "Clearances/match"), short: "Clr", cat: "DEF", tip: __("Dégagements par match (nombre brut)", "Clearances per match (raw count)") },
    { key: "avg_blocked_scoring_attempt", label: __("Tirs bloqués/match", "Blocked shots/match"), short: "Blk", cat: "DEF", tip: __("Tirs bloqués par match (nombre brut)", "Blocked shots per match (raw count)") },
    // POSSESSION
    { key: "aa_possession", label: __("AA Possession (pts)", "AA Possession (pts)"), short: "AA Pos", cat: "POSS", isCat: true, tip: __("Points Sorare Possession (pondérés par poste) — moyenne par match", "Sorare Possession points (position-weighted) — average per match") },
    { key: "avg_interception_won", label: __("Interceptions/match", "Interceptions/match"), short: "Int", cat: "POSS", tip: __("Interceptions par match (nombre brut)", "Interceptions per match (raw count)") },
    { key: "avg_duel_won", label: __("Duels gagnés/match", "Duels won/match"), short: "Duel", cat: "POSS", tip: __("Duels gagnés par match (nombre brut)", "Duels won per match (raw count)") },
    { key: "avg_ball_recovery", label: __("Récupérations/match", "Recoveries/match"), short: "Rec", cat: "POSS", tip: __("Récupérations de balle par match (nombre brut)", "Ball recoveries per match (raw count)") },
    { key: "avg_won_contest", label: __("Contests gagnés/match", "Contests won/match"), short: "Con", cat: "POSS", tip: __("Contests gagnés par match (nombre brut)", "Contests won per match (raw count)") },
    // PASSES
    { key: "aa_passing", label: __("AA Passes (pts)", "AA Passing (pts)"), short: "AA Pas", cat: "PASS", isCat: true, tip: __("Points Sorare Passes (pondérés par poste) — moyenne par match. Ex: 1 FTP = 0.3 pts (MIL) vs 0.1 pts (ATT)", "Sorare Passing points (position-weighted) — avg per match. Ex: 1 FTP = 0.3 pts (MID) vs 0.1 pts (FWD)") },
    { key: "avg_accurate_pass", label: __("Passes précises/match", "Accurate passes/match"), short: "Pass", cat: "PASS", tip: __("Passes précises par match (nombre brut, ~0.1 pt/passe)", "Accurate passes per match (raw count, ~0.1 pt/pass)") },
    { key: "avg_successful_final_third_passes", label: __("Passes 1/3 final/match", "Final third passes/match"), short: "FTP", cat: "PASS", tip: __("Passes dernier tiers par match (nombre brut, pts varient selon poste)", "Final third passes per match (raw count, pts vary by position)") },
    { key: "avg_big_chance_created", label: __("Grosses occas./match", "Big chances/match"), short: "BCC", cat: "PASS", tip: __("Grosses occasions créées par match (nombre brut)", "Big chances created per match (raw count)") },
    { key: "avg_accurate_long_balls", label: __("Longs ballons/match", "Long balls/match"), short: "Long", cat: "PASS", tip: __("Longs ballons précis par match (nombre brut, ~0.5 pt/long ball)", "Accurate long balls per match (raw count, ~0.5 pt/long ball)") },
    // ATTAQUE
    { key: "aa_attacking", label: __("AA Attaque (pts)", "AA Attack (pts)"), short: "AA Att", cat: "ATT", isCat: true, tip: __("Points Sorare Attaque (pondérés par poste) — moyenne par match", "Sorare Attack points (position-weighted) — average per match") },
    { key: "avg_ontarget_scoring_att", label: __("Tirs cadrés/match", "Shots on target/match"), short: "TiC", cat: "ATT", tip: __("Tirs cadrés par match (nombre brut)", "Shots on target per match (raw count)") },
    { key: "avg_successful_dribble", label: __("Dribbles réussis/match", "Successful dribbles/match"), short: "Dri", cat: "ATT", tip: __("Dribbles réussis par match (nombre brut)", "Successful dribbles per match (raw count)") },
    { key: "avg_pen_area_entries", label: __("Entrées surface/match", "Box entries/match"), short: "Surf", cat: "ATT", tip: __("Entrées dans la surface par match (nombre brut)", "Penalty area entries per match (raw count)") },
    { key: "avg_was_fouled", label: __("Fautes subies/match", "Fouls won/match"), short: "Foul", cat: "ATT", tip: __("Fautes subies par match (nombre brut)", "Fouls won per match (raw count)") },
  ];
  const toggleStat = (key) => setStatCols(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);

  const clubs = useMemo(() => {
    const list = leagues.size === 0 ? players : players.filter(p => leagues.has(p.league));
    const set = new Set(list.map(p => p.club).filter(Boolean));
    return [...set].sort();
  }, [players, leagues]);

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
      if (!fx) return { ...base, dsMatch: null, oppName: null, isHome: null, matchday: null, csPercent: null, matchDate: null };
      const oppTeam = findTeam(teams, fx.opp);
      const playerTeam = findTeam(teams, p.club);
      const ds = oppTeam ? dScoreMatch(p, oppTeam, fx.isHome, playerTeam) : null;
      let csPercent = null;
      if (oppTeam) {
        const oppXg = fx.isHome ? (oppTeam.xg_ext || 1.3) : (oppTeam.xg_dom || 1.3);
        const defXga = playerTeam ? (fx.isHome ? (playerTeam.xga_dom || 1.3) : (playerTeam.xga_ext || 1.5)) : 1.3;
        csPercent = csProb(defXga, oppXg, p.league);
      }
      return { ...base, dsMatch: ds, oppName: fx.opp, isHome: fx.isHome, matchday: fx.matchday, csPercent, matchDate: fx.date || null };
    });
  }, [players, teams, fixtures]);

  const filtered = useMemo(() => {
    let list = enriched.filter(p => ["GK", "DEF", "MIL", "ATT"].includes(p.position));
    if (leagues.size > 0) list = list.filter(p => leagues.has(p.league));
    if (club !== "ALL") list = list.filter(p => p.club === club);
    if (pos !== "ALL") list = list.filter(p => p.position === pos);
    if (arch !== "ALL") list = list.filter(p => p.archetype === arch);
    if (minL10 === 0) list = list.filter(p => !p.l10 || p.l10 === 0);
    else if (minL10 > 0) list = list.filter(p => (p.l10 || 0) < minL10);
    if (u23Only) list = list.filter(p => (p.age || 0) > 0 && p.age <= 24);
    if (selectedDate) list = list.filter(p => p.matchDate === selectedDate);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(q) || p.club.toLowerCase().includes(q));
    }
    list = [...list].sort((a, b) => {
      // Tri Titu% : suspendu d'abord, puis blessé, puis valeur
      if (sortKey === "titu_pct") {
        const rank = p => p.suspended ? 2 : p.injured ? 1 : 0;
        const ra = rank(a), rb = rank(b);
        if (ra !== rb) return (rb - ra) * sortDir;
      }
      // Tri D-Score : blessé/suspendu traités comme 0 (cohérent avec l'affichage)
      if (sortKey === "dsMatch") {
        const va = (a.injured || a.suspended) ? 0 : (a.dsMatch ?? -999);
        const vb = (b.injured || b.suspended) ? 0 : (b.dsMatch ?? -999);
        return (va - vb) * sortDir;
      }
      const va = a[sortKey] ?? -999, vb = b[sortKey] ?? -999;
      return (va - vb) * sortDir;
    });
    return list;
  }, [enriched, leagues, club, pos, arch, minL10, u23Only, selectedDate, search, sortKey, sortDir]);

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(d => -d);
    else { setSortKey(key); setSortDir(-1); }
  };

  const hasFixtures = !!fixtures?.player_fixtures;
  const matchdays = fixtures?.matchdays || {};

  const availableDates = useMemo(() => {
    const dates = new Set(enriched.map(p => p.matchDate).filter(Boolean));
    return [...dates].sort();
  }, [enriched]);

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
    "Wolverhampton Wanderers": "Wolves", "Manchester United": "Man U", "Manchester City": "Man C",
    "Newcastle United": "Newc.", "Nottingham Forest": "Forest", "Crystal Palace": "Palace",
    "Bournemouth": "B'mth", "Brentford": "Brent.", "Barcelona": "Barça",
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
    "AFC Bournemouth": "B'mth", "Leicester City FC": "Leicester",
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
      {/* Day filter — dropdown */}
      {availableDates.length > 0 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 10, alignItems: "center" }}>
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", fontWeight: 700, letterSpacing: "0.05em", flexShrink: 0 }}>
            {lang === "fr" ? "JOUR" : "DAY"}
          </span>
          <select
            value={selectedDate ?? ""}
            onChange={e => { setSelectedDate(e.target.value || null); setVisibleCount(30); }}
            style={{
              background: "rgba(255,255,255,0.05)", color: selectedDate ? "#A5B4FC" : "rgba(255,255,255,0.55)",
              border: selectedDate ? "1px solid rgba(99,102,241,0.5)" : "1px solid rgba(255,255,255,0.12)",
              borderRadius: 8, padding: "5px 10px", fontSize: 11, fontWeight: 700,
              fontFamily: "Outfit", cursor: "pointer", outline: "none",
            }}
          >
            <option value="">{lang === "fr" ? "Tous les jours" : "All days"}</option>
            {availableDates.map(date => {
              const d = new Date(date + "T12:00:00Z");
              const dayNames = lang === "fr" ? ["Dim","Lun","Mar","Mer","Jeu","Ven","Sam"] : ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
              const day = dayNames[d.getUTCDay()];
              const num = d.getUTCDate();
              const months = lang === "fr" ? ["jan","fév","mar","avr","mai","jun","jul","aoû","sep","oct","nov","déc"] : ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
              const mon = months[d.getUTCMonth()];
              const count = enriched.filter(p => p.matchDate === date).length;
              return <option key={date} value={date}>{day} {num} {mon} ({count})</option>;
            })}
          </select>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12, alignItems: "center" }}>
        <input
          placeholder={t(lang, "searchPlaceholder")}
          value={search} onChange={e => { setSearch(e.target.value); setVisibleCount(30); }}
          style={{ ...sel({ flex: "1 1 180px", minWidth: 140 }) }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 3, flexShrink: 0 }}>
          {[["ALL", null], ["L1", "fr"], ["PL", "gb-eng"], ["Liga", "es"], ["Bundes", "de"]].map(([k, fc]) => {
            const isAll = k === "ALL";
            const active = isAll ? leagues.size === 0 : leagues.has(k);
            const toggle = () => {
              setClub("ALL"); setVisibleCount(30);
              if (isAll) { setLeagues(new Set()); return; }
              setLeagues(prev => {
                const next = new Set(prev);
                next.has(k) ? next.delete(k) : next.add(k);
                return next;
              });
            };
            return (
              <button key={k} onClick={toggle} style={{
                background: active ? (isAll ? "rgba(99,102,241,0.25)" : `${LEAGUE_COLORS[k]}25`) : "rgba(255,255,255,0.04)",
                border: active ? `1px solid ${isAll ? "#6366f1" : LEAGUE_COLORS[k]}60` : "1px solid rgba(255,255,255,0.08)",
                borderRadius: 6, padding: "4px 7px", cursor: "pointer", color: active ? "#fff" : "rgba(255,255,255,0.5)",
                fontSize: 11, fontWeight: active ? 700 : 500, display: "flex", alignItems: "center", gap: 4, transition: "all 0.15s",
              }}>
                {fc ? <img src={`https://flagcdn.com/w40/${fc}.png`} alt={k} width={16} height={12} style={{ borderRadius: 2, objectFit: "cover" }} /> : null}
                {isAll ? t(lang,"all") : k}
              </button>
            );
          })}
          <button
            onClick={() => { setU23Only(v => !v); setVisibleCount(30); }}
            style={{
              padding: "4px 7px", borderRadius: 6, fontSize: 11, fontWeight: 700,
              fontFamily: "Outfit", cursor: "pointer", transition: "all 0.15s",
              background: u23Only ? "rgba(251,191,36,0.2)" : "rgba(255,255,255,0.04)",
              border: u23Only ? "1px solid rgba(251,191,36,0.5)" : "1px solid rgba(255,255,255,0.08)",
              color: u23Only ? "#FBBF24" : "rgba(255,255,255,0.5)",
            }}
          >U23</button>
        </div>
        <select value={club} onChange={e => { setClub(e.target.value); setVisibleCount(30); }} style={sel({ flex: "1 1 0", minWidth: 0 })}>
          <option value="ALL">{t(lang,"club")}</option>
          {clubs.map(c => <option key={c} value={c}>{shortName(c)}</option>)}
        </select>
        <select value={pos} onChange={e => { setPos(e.target.value); setVisibleCount(30); }} style={sel({ flex: "1 1 0", minWidth: 0 })}>
          <option value="ALL">{t(lang,"poste")}</option>
          {["GK", "DEF", "MIL", "ATT"].map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <select value={arch} onChange={e => { setArch(e.target.value); setVisibleCount(30); }} style={sel({ flex: "1 1 0", minWidth: 0 })}>
          <option value="ALL">{t(lang,"profil")}</option>
          {archetypes.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={minL10} onChange={e => { setMinL10(Number(e.target.value)); setVisibleCount(30); }} style={sel({ flex: "1 1 0", minWidth: 0 })}>
          <option value={-1}>{t(lang,"l10Cap")}</option>
          <option value={0}>{t(lang,"l10Zero")}</option>
          {[30, 40, 50, 55, 60, 65, 70].map(v => (
            <option key={v} value={v}>L10 &lt; {v}</option>
          ))}
        </select>
      </div>

      {/* D-Score legend */}
      <div style={{ marginBottom: 10, padding: "10px 14px", background: "linear-gradient(135deg, rgba(99,102,241,0.06), rgba(192,132,252,0.04))", border: "1px solid rgba(99,102,241,0.1)", borderRadius: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.05em", background: "linear-gradient(90deg, #A5B4FC 0%, #C084FC 25%, #E879F9 50%, #C084FC 75%, #A5B4FC 100%)", backgroundSize: "200% auto", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", animation: "legendShimmer 4s linear infinite" }}>
            {t(lang, "dscoreLegend")}
          </div>
        </div>
        <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", marginTop: 3, lineHeight: 1.5, fontStyle: "italic" }}>
          {t(lang, "dscoreDisclaimer")}
          <span style={{ color: "rgba(255,255,255,0.15)" }}> | </span>
          <span style={{ color: "#A5B4FC" }}>50% {lang==="en"?"football expertise":"expertise foot"}</span>
          <span style={{ color: "rgba(255,255,255,0.12)" }}> · </span>
          <span style={{ color: "#4ADE80" }}>20% data</span>
          <span style={{ color: "rgba(255,255,255,0.12)" }}> · </span>
          <span style={{ color: "#C084FC" }}>20% AI</span>
          <span style={{ color: "rgba(255,255,255,0.12)" }}> · </span>
          <span style={{ color: "#FBBF24" }}>10% {lang==="en"?"maths":"maths"}</span>
          <span style={{ color: "rgba(255,255,255,0.15)" }}> | </span>
          {t(lang, "factsImprev")}
        </div>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", lineHeight: 1.5 }}>
          {__("Socle (forme L5 + AA + floor + régularité)", "Base (L5 form + AA + floor + consistency)")} <span style={{ color: "rgba(255,255,255,0.2)" }}>›</span> {__("Contexte (adversaire, PPDA, xGA, style de jeu)", "Context (opponent, PPDA, xGA, play style)")} <span style={{ color: "rgba(255,255,255,0.2)" }}>›</span> {__("Momentum (tendance L2, séries)", "Momentum (L2 trend, streaks)")} <span style={{ color: "rgba(255,255,255,0.2)" }}>›</span> {__("Dom/Ext", "H/A")}
        </div>
        <div style={{ display: "flex", gap: 14, marginTop: 6, alignItems: "center", fontSize: 10, color: "rgba(255,255,255,0.45)", flexWrap: "wrap" }}>
          <span>{filtered.length === enriched.filter(p => ["GK","DEF","MIL","ATT"].includes(p.position)).length ? `${filtered.length} joueurs` : `${filtered.length} / ${enriched.filter(p => ["GK","DEF","MIL","ATT"].includes(p.position)).length} joueurs`}</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
            <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: "linear-gradient(135deg,#4ADE80,#22C55E)", boxShadow: "0 0 6px #4ADE80" }} />
            {__("L2 explosion", "L2 explosion")}
          </span>
          <span>Reg10 = {__("% matchs >60 sur L10", "% matches >60 over L10")}</span>
          <span>Proj = {__("Score projeté Sorare (humains) — reflète la titularisation prévue. Vert ≥50, Orange ≥35, Rouge <35", "Sorare projected score (human-made) — reflects expected start. Green ≥50, Orange ≥35, Red <35")}</span>
          <span><span style={{ color: "#FBBF24" }}>&#9733;</span> Extra GOAT — {__("élite protégée par l'algo quand ça compte", "elite protected by the algo when it matters")}</span>
          <span><span style={{ color: "#FBBF24" }}>L€</span> Limited · <span style={{ color: "#EF4444" }}>R€</span> Rare</span>
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 9, color: "#F87171", fontWeight: 700, background: "rgba(239,68,68,0.12)", padding: "2px 8px", borderRadius: 20 }}>🚀 BETA GRATUITE</span>
        </div>
      </div>

      {/* Stat columns toggle — Sorare daily missions */}
      <div style={{ marginBottom: 8, display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
        {["DEF", "POSS", "PASS", "ATT"].map(cat => {
          const CAT_LABELS = { DEF: "🛡️ DEF", POSS: "🔄 POSS", PASS: "🎯 PASS", ATT: "⚔️ ATT" };
          const CAT_COLORS = { DEF: "#60A5FA", POSS: "#FBBF24", PASS: "#4ADE80", ATT: "#F87171" };
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
        })}
        {(() => {
          const allKeys = STAT_DEFS.map(s => s.key);
          const allActive = allKeys.every(k => statCols.includes(k));
          return (
            <button onClick={() => setStatCols(allActive ? [] : allKeys)} style={{
              padding: "3px 10px", borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: "pointer",
              border: allActive ? "1px solid #A78BFA" : "1px solid rgba(167,139,250,0.4)",
              background: allActive ? "rgba(167,139,250,0.2)" : "rgba(167,139,250,0.08)",
              color: allActive ? "#A78BFA" : "rgba(167,139,250,0.7)",
              transition: "all 0.15s",
            }}>{allActive ? "✕ Fermer" : "☰ Tout"}</button>
          );
        })()}
        {statCols.length > 0 && !STAT_DEFS.map(s => s.key).every(k => statCols.includes(k)) && (
          <button onClick={() => setStatCols([])} style={{ padding: "3px 8px", borderRadius: 6, fontSize: 9, cursor: "pointer", border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.1)", color: "#EF4444" }}>✕ Reset</button>
        )}
      </div>
      {statCols.length > 0 && (
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 6, padding: "4px 8px", lineHeight: 1.5, background: "rgba(255,255,255,0.02)", borderRadius: 6, border: "1px solid rgba(255,255,255,0.06)" }}>
          <span style={{ color: "#A78BFA", fontWeight: 600 }}>AA</span> = {__("Points Sorare (pondérés par poste)", "Sorare points (position-weighted)")} · <span style={{ color: "rgba(255,255,255,0.55)", fontWeight: 600 }}>{__("Sous-stats", "Sub-stats")}</span> = {__("nombre brut /match", "raw count /match")} · <span style={{ color: "rgba(255,255,255,0.3)", fontStyle: "italic" }}>{__("Hover colonnes pour détails", "Hover columns for details")}</span>
        </div>
      )}

      {/* Table */}
      <div style={{ overflowX: "auto", maxHeight: "75vh", overflowY: "auto", borderRadius: 12, border: "1px solid rgba(255,255,255,0.06)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: "Outfit" }}>
          <thead style={{ position: "sticky", top: 0, zIndex: 10 }}>
            <tr style={{ background: "#0C0C2D" }}>
              <th style={{ ...thStyle("name"), textAlign: "left", paddingLeft: 12, cursor: "default", position: "sticky", left: 0, zIndex: 2, background: "#0C0C2D" }}>{t(lang,"colJoueur")}</th>
              <th style={{ ...thStyle("position"), cursor: "default" }}>{t(lang,"colPos")}</th>
              <th style={thStyle("ga_season")} onClick={() => toggleSort("ga_season")}>G+A{arrow("ga_season")}</th>
              {statCols.length === 0 && <th style={{ ...thStyle("league"), cursor: "default" }}>{t(lang,"colLigue")}</th>}
              <th style={{ ...thStyle("l2"), background: sortKey === "l2" ? "rgba(74,222,128,0.06)" : "transparent", borderLeft: "1px solid rgba(255,255,255,0.06)" }} onClick={() => toggleSort("l2")}>L2{arrow("l2")}</th>
              {statCols.length === 0 && <th style={thStyle("aa2")} onClick={() => toggleSort("aa2")}>AA2{arrow("aa2")}</th>}
              {statCols.length === 0 && <th style={{ ...thStyle("last5"), borderLeft: "1px solid rgba(255,255,255,0.06)", cursor: "default", fontSize: 8, color: "rgba(255,255,255,0.25)" }}>Last 5</th>}
              <th style={thStyle("l5")} onClick={() => toggleSort("l5")}>L5{arrow("l5")}</th>
              {statCols.length === 0 && <th style={thStyle("aa5")} onClick={() => toggleSort("aa5")}>AA5{arrow("aa5")}</th>}
              <th style={{ ...thStyle("l10"), borderLeft: "1px solid rgba(255,255,255,0.06)" }} onClick={() => toggleSort("l10")}>L10{arrow("l10")}</th>
              {statCols.length === 0 && <th style={thStyle("aa10")} onClick={() => toggleSort("aa10")}>AA10{arrow("aa10")}</th>}
              <th style={thStyle("reg10")} onClick={() => toggleSort("reg10")}>Reg10{arrow("reg10")}</th>
              <th style={thStyle("titu_pct")} onClick={() => toggleSort("titu_pct")}>{__("Titu10","Start10")}{arrow("titu_pct")}</th>
              <th style={{ ...thStyle("l40"), borderLeft: "1px solid rgba(255,255,255,0.06)" }} onClick={() => toggleSort("l40")}>L40{arrow("l40")}</th>
              <th style={thStyle("aa40")} onClick={() => toggleSort("aa40")}>AA40{arrow("aa40")}</th>
              {hasFixtures && <>
                <th style={thStyle("dsMatch")} onClick={() => toggleSort("dsMatch")}>
                  <span style={{ color: sortKey === "dsMatch" ? "#C084FC" : "#C084FC80" }}>D-Score{arrow("dsMatch")}</span>
                </th>
                <th style={thStyle("titu_pct")} onClick={() => toggleSort("titu_pct")}>{__("Titu%","Starter%")}{arrow("titu_pct")}</th>
                <th style={{ ...thStyle("oppName"), cursor: "default" }}>{t(lang,"colAdv")}</th>
                <th style={thStyle("csPercent")} onClick={() => toggleSort("csPercent")}>CS%{arrow("csPercent")}</th>
              </>}
              {statCols.length === 0 && <th style={thStyle("price_limited")} onClick={() => toggleSort("price_limited")}>L€{arrow("price_limited")}</th>}
              {statCols.length === 0 && <th style={thStyle("price_rare")} onClick={() => toggleSort("price_rare")}>R€{arrow("price_rare")}</th>}
              {statCols.length === 0 && <th style={{ ...thStyle("archetype"), cursor: "default", padding: "4px 2px", maxWidth: 52 }}>{t(lang,"colArchetype")}</th>}
              {statCols.length === 0 && <th style={{ ...thStyle("aaProfile"), cursor: "default", padding: "4px 2px", maxWidth: 52 }}>{t(lang,"colProfilAA")}</th>}
              {(() => {
                const CAT_COLORS = { GEN: "#A78BFA", DEF: "#60A5FA", POSS: "#FBBF24", PASS: "#4ADE80", ATT: "#F87171" };
                const ordered = STAT_DEFS.filter(s => statCols.includes(s.key));
                let lastCat = null;
                return ordered.map(def => {
                  const isNewSection = def.cat !== lastCat;
                  lastCat = def.cat;
                  const catColor = CAT_COLORS[def.cat];
                  const isCatCol = def.isCat;
                  return <th key={def.key} style={{
                    ...thStyle(def.key),
                    minWidth: 0, width: isCatCol ? 30 : 22, padding: "4px 1px",
                    borderLeft: isNewSection ? `2px solid ${catColor}88` : "none",
                    color: catColor,
                    background: isCatCol ? catColor + "12" : "transparent",
                    fontSize: 7, letterSpacing: "-0.3px",
                  }} onClick={() => toggleSort(def.key)} title={def.tip}>{def.short}{arrow(def.key)}</th>;
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
                  <td style={{ padding: "4px 2px 4px 8px", maxWidth: 136, overflow: "hidden", position: "sticky", left: 0, zIndex: 1, background: isExplosion ? "#0e0e30" : i % 2 === 0 ? "#0C0C2D" : "#0d0d2f" }}>
                    <div style={{ fontWeight: 600, color: "#fff", fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "flex", alignItems: "center", gap: 4 }}>
                      <CountryFlag code={p.country} size={14} />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</span>
                      {isExtraGoat(p) && (
                        <span style={{ fontSize: 11, color: "#FBBF24", flexShrink: 0, lineHeight: 1 }}>&#9733;</span>
                      )}
                      {p.injured && (
                        <svg width="12" height="12" viewBox="0 0 12 12" style={{ flexShrink: 0 }} title="Blessé">
                          <rect width="12" height="12" rx="2" fill="#EF4444"/>
                          <rect x="5" y="2" width="2" height="8" rx="0.5" fill="#fff"/>
                          <rect x="2" y="5" width="8" height="2" rx="0.5" fill="#fff"/>
                        </svg>
                      )}
                      {p.suspended && (
                        <svg width="8" height="12" viewBox="0 0 8 12" style={{ flexShrink: 0 }} title="Suspendu">
                          <rect x="0.5" y="0.5" width="7" height="11" rx="1.5" fill="#EF4444" stroke="rgba(0,0,0,0.25)" strokeWidth="0.5"/>
                        </svg>
                      )}
                    </div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 1, display: "flex", alignItems: "center", gap: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {logos[p.club] && <img src={`/data/logos/${logos[p.club]}`} alt="" style={{ width: 12, height: 12, objectFit: "contain" }} />}
                      {shortName(p.club)}
                      {p.age > 0 && <span style={{ color: "rgba(255,255,255,0.25)", marginLeft: 2 }}>· {p.age}{__(" ans", "y")}</span>}
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
                  {statCols.length === 0 && <td style={{ textAlign: "center" }}>
                    <span style={{
                      padding: "2px 6px", borderRadius: 12, fontSize: 11,
                      background: `${LEAGUE_COLORS[p.league]}18`, color: LEAGUE_COLORS[p.league],
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                    }}><img src={`https://flagcdn.com/w40/${LEAGUE_FLAG_CODES[p.league]}.png`} alt={p.league} width={16} height={12} style={{ borderRadius: 2, objectFit: "cover", display: "block" }} /></span>
                  </td>}
                  <td style={{ textAlign: "center", borderLeft: "1px solid rgba(255,255,255,0.04)" }}>
                    <span style={{
                      fontFamily: "DM Mono", fontWeight: 700, fontSize: 14, color: isExplosion ? "#fff" : dsColor(p.l2),
                      ...(isExplosion ? {
                        display: "inline-block", padding: "2px 6px", borderRadius: 6,
                        background: "linear-gradient(135deg, #4ADE8099, #22C55E88)",
                        boxShadow: "0 0 4px #4ADE8044, 0 0 10px #4ADE8022",
                        animation: "explosionPulse 2s ease-in-out infinite",
                      } : {}),
                    }}>{R(p.l2)}</span>
                  </td>
                  {statCols.length === 0 && <td style={{ textAlign: "center", fontFamily: "DM Mono", fontSize: 10, color: "rgba(255,255,255,0.3)" }}>{R(p.aa2)}</td>}
                  {statCols.length === 0 && <td style={{ borderLeft: "1px solid rgba(255,255,255,0.04)", padding: "4px 2px", verticalAlign: "middle" }}>
                    {p.last_5 && p.last_5.length > 0 ? (() => {
                      const arr = p.last_5.slice(-5).reverse();
                      const pad = 5 - arr.length;
                      const slots = Array.from({ length: 5 }, (_, j) => j < pad ? null : arr[j - pad]);
                      return (
                        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 1, height: 22 }}>
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
                  </td>}
                  <td style={{ textAlign: "center", fontFamily: "DM Mono", fontWeight: 700, fontSize: 14, color: dsColor(p.l5) }}>{R(p.l5)}</td>
                  {statCols.length === 0 && <td style={{ textAlign: "center", fontFamily: "DM Mono", fontSize: 10, color: "rgba(255,255,255,0.3)" }}>{R(p.aa5)}</td>}
                  <td style={{ textAlign: "center", fontFamily: "DM Mono", fontWeight: 700, fontSize: 14, color: dsColor(p.l10), borderLeft: "1px solid rgba(255,255,255,0.04)" }}>{R(p.l10)}</td>
                  {statCols.length === 0 && <td style={{ textAlign: "center", fontFamily: "DM Mono", fontSize: 10, color: "rgba(255,255,255,0.3)" }}>{R(p.aa10)}</td>}
                  <td style={{ textAlign: "center", fontFamily: "DM Mono", fontSize: 11, color: (p.reg10 ?? p.regularite) >= 80 ? "#4ADE80" : (p.reg10 ?? p.regularite) >= 50 ? "#FBBF24" : "#EF4444" }}>{R(p.reg10 ?? p.regularite)}%</td>
                  <td style={{ textAlign: "center", fontFamily: "DM Mono", fontSize: 11, color: p.titu_pct >= 80 ? "#4ADE80" : p.titu_pct >= 50 ? "#FBBF24" : "#EF4444" }}>{R(p.titu_pct)}%</td>
                  <td style={{ textAlign: "center", fontFamily: "DM Mono", fontWeight: 700, fontSize: 13, color: dsColor(p.l40), borderLeft: "1px solid rgba(255,255,255,0.04)" }}>{R(p.l40)}</td>
                  <td style={{ textAlign: "center", fontFamily: "DM Mono", fontSize: 10, color: "rgba(255,255,255,0.3)" }}>{R(p.aa40)}</td>
                  {hasFixtures && <>
                    <td style={{ textAlign: "center" }}>
                      {(p.injured || p.suspended) ? (
                        <span style={{ display: "inline-block", padding: "3px 8px", borderRadius: 8, fontFamily: "DM Mono", fontSize: 14, fontWeight: 700, color: "#fff", background: "#EF444430", border: "1px solid #EF444460" }}>0</span>
                      ) : p.dsMatch !== null ? (
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
                    <td style={{ textAlign: "center" }}>
                      {p.injured && <svg width="12" height="12" viewBox="0 0 12 12"><rect width="12" height="12" rx="2" fill="#EF4444"/><rect x="5" y="2" width="2" height="8" rx="0.5" fill="#fff"/><rect x="2" y="5" width="8" height="2" rx="0.5" fill="#fff"/></svg>}
                      {p.suspended && <svg width="8" height="12" viewBox="0 0 8 12"><rect x="0.5" y="0.5" width="7" height="11" rx="1.5" fill="#EF4444" stroke="rgba(0,0,0,0.25)" strokeWidth="0.5"/></svg>}
                    </td>
                    <td style={{ textAlign: "left", fontSize: 8, paddingLeft: 2, maxWidth: 52, overflow: "hidden" }}>
                      {p.oppName ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                          <span style={{ fontSize: 13, flexShrink: 0, lineHeight: 1 }}>
                            {p.isHome ? "🏠" : "✈️"}
                          </span>
                          {logos[p.oppName] && <img src={`/data/logos/${logos[p.oppName]}`} alt="" style={{ width: 14, height: 14, objectFit: "contain", flexShrink: 0 }} />}
                          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", ...(shortName(p.oppName).length >= 12 ? { maxWidth: 30 } : {}) }}>{shortName(p.oppName)}</span>
                        </div>
                      ) : (
                        <span style={{ color: "rgba(255,255,255,0.15)", paddingLeft: 10 }}>—</span>
                      )}
                    </td>
                    <td style={{ textAlign: "center", fontFamily: "DM Mono", fontSize: 11 }}>
                      {p.csPercent != null ? (
                        <span style={{ color: p.csPercent >= 40 ? "#4ADE80" : p.csPercent >= 25 ? "#FCD34D" : p.csPercent >= 15 ? "#FB923C" : "#EF4444", fontWeight: 600 }}>{p.csPercent}%</span>
                      ) : (
                        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.15)" }}>—</span>
                      )}
                    </td>
                  </>}
                  {statCols.length === 0 && <td style={{ textAlign: "center", fontFamily: "DM Mono", fontSize: 10, borderLeft: "1px solid rgba(255,255,255,0.04)" }}>
                    {p.price_limited != null ? (
                      <span style={{ color: "#FBBF24" }}>{p.price_limited < 1 ? p.price_limited.toFixed(2) : Math.round(p.price_limited)}€</span>
                    ) : <span style={{ color: "rgba(255,255,255,0.12)" }}>—</span>}
                  </td>}
                  {statCols.length === 0 && <td style={{ textAlign: "center", fontFamily: "DM Mono", fontSize: 10 }}>
                    {p.price_rare != null ? (
                      <span style={{ color: "#EF4444" }}>{p.price_rare < 1 ? p.price_rare.toFixed(2) : Math.round(p.price_rare)}€</span>
                    ) : <span style={{ color: "rgba(255,255,255,0.12)" }}>—</span>}
                  </td>}
                  {statCols.length === 0 && <td style={{ textAlign: "center", padding: "2px 1px", maxWidth: 48, overflow: "hidden" }}>
                    <span style={{
                      padding: "1px 4px", borderRadius: 12, fontSize: 8,
                      background: `${getArchetypeColor(p.archetype)}18`,
                      color: getArchetypeColor(p.archetype), whiteSpace: "nowrap",
                    }}>{shortArch(p.archetype)}</span>
                  </td>}
                  {statCols.length === 0 && <td style={{ textAlign: "center", padding: "2px 1px", maxWidth: 48, overflow: "hidden" }}>
                    {(() => {
                      const pr = getAAProfile(p);
                      return <span title={pr.desc} style={{
                        padding: "1px 4px", borderRadius: 12, fontSize: 8,
                        background: `${pr.color}18`, color: pr.color,
                        cursor: "help", whiteSpace: "nowrap",
                      }}>{pr.emoji} {pr.label}</span>;
                    })()}
                  </td>}
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
                      const isCatCol = def.isCat;
                      return <td key={def.key} style={{
                        textAlign: "center", fontFamily: "DM Mono", fontSize: isCatCol ? 11 : 8, fontWeight: 600,
                        color: displayColor, padding: "0 1px",
                        borderLeft: isNewSection ? `2px solid ${catColor}88` : "none",
                        background: isCatCol ? catColor + "0C" : "transparent",
                      }}>{hasVal ? (isCatCol ? val.toFixed(1) : Math.round(val)) : "—"}</td>;
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
