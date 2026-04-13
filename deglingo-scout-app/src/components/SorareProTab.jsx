import { useState, useMemo, useEffect } from "react";
import { POSITION_COLORS, LEAGUE_COLORS, LEAGUE_FLAG_CODES, LEAGUE_NAMES, dsColor, dsBg, isSilver } from "../utils/colors";
import { dScoreMatch, csProb, findTeam } from "../utils/dscore";
import { T, t } from "../utils/i18n";
import { getProGwInfo, getProGwList, loadFrozen, saveFrozen } from "../utils/freeze";

const PC = POSITION_COLORS;
const PRO_LEAGUES = ["L1", "PL", "Liga", "Bundes", "MLS"];
const TEAM_SLOTS = ["GK", "DEF", "MIL", "ATT", "FLEX"];
const MAX_SAVED = { L1: 4, PL: 4, Liga: 4, Bundes: 4, MLS: 5 };

const SHORT_NAMES = {
  "Wolverhampton Wanderers": "Wolves", "Manchester United": "Man Utd", "Manchester City": "Man City",
  "Newcastle United": "Newcastle", "Nottingham Forest": "Nott. Forest", "Crystal Palace": "C. Palace",
  "Paris Saint Germain": "PSG", "Marseille": "OM", "Lyon": "OL",
  "Rayo Vallecano": "Rayo", "Atletico Madrid": "Atletico", "Real Sociedad": "R. Sociedad",
  "Athletic Club": "Bilbao", "Paris Saint-Germain": "PSG", "Olympique de Marseille": "OM",
  "Olympique Lyonnais": "OL", "RC Strasbourg Alsace": "Strasbourg", "Stade Brestois 29": "Brest",
  "Bayern Munich": "Bayern", "Borussia Dortmund": "Dortmund", "RasenBallsport Leipzig": "RB Leipzig",
  "Bayer Leverkusen": "Leverkusen", "Bayer 04 Leverkusen": "Leverkusen",
};
const sn = (name) => SHORT_NAMES[name] || name;

/* ─── Hot Streak Paliers ─── */
const EU_LEAGUES = ["L1", "PL", "Liga", "Bundes"];
const PALIERS_EU_LIMITED = [
  { pts: 360, reward: "$5", color: "#94A3B8" },
  { pts: 380, reward: "$10", color: "#60A5FA" },
  { pts: 400, reward: "$50", color: "#A78BFA" },
  { pts: 420, reward: "$200", color: "#C084FC" },
  { pts: 460, reward: "$1 000", color: "#F59E0B" },
];
const PALIERS_EU_RARE = [
  { pts: 400, reward: "$20", color: "#94A3B8" },
  { pts: 420, reward: "$40", color: "#60A5FA" },
  { pts: 440, reward: "$200", color: "#A78BFA" },
  { pts: 460, reward: "$800", color: "#C084FC" },
  { pts: 510, reward: "$4 000", color: "#EF4444", fire: true },
];
const PALIERS_OTHER_LIMITED = [
  { pts: 340, reward: "500 Ess", color: "#94A3B8" },
  { pts: 380, reward: "2k Ess", color: "#60A5FA" },
  { pts: 400, reward: "$25", color: "#A78BFA" },
  { pts: 420, reward: "$100", color: "#C084FC" },
  { pts: 460, reward: "$500", color: "#F59E0B" },
];
const PALIERS_OTHER_RARE = [
  { pts: 380, reward: "500 Ess", color: "#94A3B8" },
  { pts: 420, reward: "$20", color: "#60A5FA" },
  { pts: 440, reward: "$100", color: "#A78BFA" },
  { pts: 460, reward: "$400", color: "#C084FC" },
  { pts: 510, reward: "$2 000", color: "#EF4444", fire: true },
];
const GRAND_PRIX = { pts: 480, reward: "200k Ess (shared)", color: "silver", silver: true };

const getPaliers = (league, rarity) => {
  const isEU = EU_LEAGUES.includes(league);
  if (rarity === "rare") return isEU ? PALIERS_EU_RARE : PALIERS_OTHER_RARE;
  return isEU ? PALIERS_EU_LIMITED : PALIERS_OTHER_LIMITED;
};

/* ─── Club matching ─── */
const stripAcc = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const normClub = (n) => stripAcc((n || "").replace(/-/g, " ").trim());
const clubMatch = (a, b) => {
  const na = normClub(a).toLowerCase(), nb = normClub(b).toLowerCase();
  if (na === nb || na.includes(nb) || nb.includes(na)) return true;
  return false;
};

/* ─── Paris timezone ─── */
const TZ = "Europe/Paris";
function toParisDateStr(d) { return d.toLocaleDateString("en-CA", { timeZone: TZ }); }
function utcToParisTime(utcTimeStr, dateStr) {
  if (!utcTimeStr || utcTimeStr === "TBD") return "";
  try {
    const d = new Date(`${dateStr}T${utcTimeStr}:00Z`);
    return d.toLocaleTimeString("fr-FR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
  } catch { return utcTimeStr; }
}

/* ─── CSS Animations ─── */
const proKeyframes = `
@keyframes proShine { 0%{background-position:0% 50%} 100%{background-position:200% 50%} }
@keyframes spin { 0%{transform:rotate(0deg)} 100%{transform:rotate(360deg)} }
@keyframes loadBar { 0%{transform:translateX(-100%)} 50%{transform:translateX(60%)} 100%{transform:translateX(200%)} }
`;

/* ═══════════════════════════════════════════════════════════════════
   SORARE PRO TAB — Main Component
   ═══════════════════════════════════════════════════════════════════ */
export default function SorareProTab({ players, teams, fixtures, logos = {}, matchEvents = {}, lang = "fr" }) {
  const S = T[lang] ?? T.fr;

  // ── UI State ──
  const [league, setLeague] = useState("L1");
  const [rarity, setRarity] = useState("limited");
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [hideUsed, setHideUsed] = useState(true);
  const [filterTitu, setFilterTitu] = useState(0);
  const [selectedMatchFilters, setSelectedMatchFilters] = useState([]);
  const [includeRare, setIncludeRare] = useState(true);
  const [bonusEnabled, setBonusEnabled] = useState(true);

  // ── GW Info — 5 prochaines GW ──
  const gwList = useMemo(() => getProGwList(5), []);
  const [selectedGwIdx, setSelectedGwIdx] = useState(0);
  const gwInfo = gwList[selectedGwIdx] || null;
  const [countdown, setCountdown] = useState("");
  const [teamSort, setTeamSort] = useState("ds");
  useEffect(() => {
    if (!gwInfo) return;
    const tick = () => {
      const diff = gwInfo.gwEnd.getTime() - Date.now();
      if (diff <= 0) { setCountdown("00:00:00"); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setCountdown(`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [gwInfo]);

  // ── OAuth Sorare ──
  const [sorareConnected, setSorareConnected] = useState(false);
  const [sorareCards, setSorareCards] = useState([]);
  const [sorareUser, setSorareUser] = useState(null);
  const [sorareLoading, setSorareLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState({ scanned: 0, found: 0 });
  const [myCardsMode, setMyCardsMode] = useState(false);

  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes("sorare_token=")) {
      const hashParams = new URLSearchParams(hash.replace(/^#/, ""));
      const token = hashParams.get("sorare_token");
      const returnedState = hashParams.get("state") || "";
      const savedState = sessionStorage.getItem("sorare_oauth_state") || "";
      sessionStorage.removeItem("sorare_oauth_state");
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      if (returnedState && savedState && returnedState !== savedState) return;
      if (token) { localStorage.setItem("sorare_access_token", token); fetchCards(token); }
      return;
    }
    if (hash.includes("sorare_error=")) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      return;
    }
    const savedToken = localStorage.getItem("sorare_access_token");
    if (savedToken) fetchCards(savedToken, true);
  }, []);

  // Pro-specific: paginated fetch client-side to get ALL Limited/Rare cards
  // Paginates in background — shows cards progressively as they are found
  // Uses localStorage cache to avoid re-paginating on every page load
  const parseCard = (c) => {
    const edName = c.cardEditionName || "";
    const r = (c.rarityTyped || "").toLowerCase().replace(/ /g, "_");
    return {
      cardSlug: c.slug, playerSlug: c.player?.slug || null, playerName: c.player?.displayName || null,
      position: c.player?.position || null, rarity: r, pictureUrl: c.pictureUrl || null,
      cardEditionName: edName, isStellar: false,
      isLimited: r === "limited", isRare: r === "rare",
      isClassic: (() => { const m = c.slug?.match(/-(\d{4})-(?:limited|rare)-/); return m ? parseInt(m[1]) < 2025 : false; })(),
      power: c.power,
    };
  };
  const isLR = (c) => { const r = (c.rarityTyped || "").toLowerCase(); return r === "limited" || r === "rare"; };

  const fetchCards = async (token, silent = false) => {
    if (!token) return;
    if (!silent) setSorareLoading(true);
    try {
      // Check localStorage cache first (valid for 1 hour)
      const cacheKey = "pro_cards_cache";
      const cacheTimeKey = "pro_cards_cache_time";
      const cached = localStorage.getItem(cacheKey);
      const cachedTime = parseInt(localStorage.getItem(cacheTimeKey) || "0");
      if (cached && Date.now() - cachedTime < 3600000) {
        try {
          const cachedCards = JSON.parse(cached);
          if (cachedCards.length > 0) {
            // Get user info from a quick call
            const uRes = await fetch(`/api/sorare/cards?rawq=${encodeURIComponent("{currentUser{slug nickname}}")}`, { headers: { "Authorization": `Bearer ${token}` } });
            if (uRes.status === 401) { localStorage.removeItem("sorare_access_token"); setSorareConnected(false); setSorareCards([]); return; }
            const uData = await uRes.json();
            const u = uData?.data?.currentUser;
            if (u) setSorareUser({ slug: u.slug, nickname: u.nickname });
            setSorareCards(cachedCards);
            setSorareConnected(true);
            setMyCardsMode(true);
            if (!silent) setTimeout(() => setSorareLoading(false), 300);
            return;
          }
        } catch { /* cache corrupt, re-fetch */ }
      }

      // First page — also gets user info
      const firstQ = encodeURIComponent(`{currentUser{slug nickname cards(first:50,sport:FOOTBALL){nodes{slug name rarityTyped pictureUrl power cardEditionName ... on Card{player{slug displayName position}}}pageInfo{hasNextPage endCursor}}}}`);
      const res = await fetch(`/api/sorare/cards?rawq=${firstQ}`, { headers: { "Authorization": `Bearer ${token}` } });
      if (res.status === 401) { localStorage.removeItem("sorare_access_token"); setSorareConnected(false); setSorareCards([]); return; }
      if (!res.ok) { setSorareConnected(false); return; }
      const data = await res.json();
      const user = data?.data?.currentUser;
      if (!user) { setSorareConnected(false); return; }
      setSorareUser({ slug: user.slug, nickname: user.nickname });

      // Show whatever LR cards we find immediately
      let scanned = user.cards?.nodes?.length || 0;
      let allLR = (user.cards?.nodes || []).filter(isLR).map(parseCard).filter(c => c.playerSlug);
      setSorareCards(allLR);
      setSorareConnected(true);
      setMyCardsMode(true);
      setLoadingProgress({ scanned, found: allLR.length });

      // Continue pagination in background (up to 200 pages = 10000 cards)
      let cursor = user.cards?.pageInfo?.endCursor;
      let hasNext = user.cards?.pageInfo?.hasNextPage;
      for (let i = 0; i < 200 && hasNext && cursor; i++) {
        const pageQ = `query($a:String!){currentUser{cards(first:50,sport:FOOTBALL,after:$a){nodes{slug name rarityTyped pictureUrl power cardEditionName ... on Card{player{slug displayName position}}}pageInfo{hasNextPage endCursor}}}}`;
        const pr = await fetch(`/api/sorare/cards?rawq=${encodeURIComponent(pageQ)}&vars=${encodeURIComponent(JSON.stringify({a:cursor}))}`, { headers: { "Authorization": `Bearer ${token}` } });
        if (!pr.ok) break;
        const pd = await pr.json();
        if (pd.errors || !pd.data?.currentUser?.cards?.nodes?.length) break;
        const nodes = pd.data.currentUser.cards.nodes;
        scanned += nodes.length;
        const newLR = nodes.filter(isLR).map(parseCard).filter(c => c.playerSlug);
        if (newLR.length > 0) {
          allLR = [...allLR, ...newLR];
          setSorareCards([...allLR]);
        }
        setLoadingProgress({ scanned, found: allLR.length });
        hasNext = pd.data.currentUser.cards.pageInfo?.hasNextPage;
        cursor = pd.data.currentUser.cards.pageInfo?.endCursor;
      }
      setLoadingProgress({ scanned: 0, found: 0 });

      // Cache the final result
      try {
        localStorage.setItem(cacheKey, JSON.stringify(allLR));
        localStorage.setItem(cacheTimeKey, String(Date.now()));
      } catch { /* localStorage full, ignore */ }

    } catch { setSorareConnected(false); }
  };

  const connectSorare = () => {
    const state = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
    sessionStorage.setItem("sorare_oauth_state", state);
    sessionStorage.setItem("sorare_return_tab", "pro");
    const params = new URLSearchParams({
      client_id: "NPuOENu-LuafKXV1spf6PZpWJbUodzfULnRtntnNP_U",
      redirect_uri: "https://scout.deglingosorare.com/auth/sorare/callback",
      response_type: "code", state,
    });
    window.location.href = `https://sorare.com/oauth/authorize?${params}`;
  };

  const disconnectSorare = () => {
    localStorage.removeItem("sorare_access_token");
    localStorage.removeItem("pro_cards_cache");
    localStorage.removeItem("pro_cards_cache_time");
    setSorareConnected(false); setSorareCards([]); setSorareUser(null); setMyCardsMode(false);
  };

  const refreshCards = () => {
    localStorage.removeItem("pro_cards_cache");
    localStorage.removeItem("pro_cards_cache_time");
    const token = localStorage.getItem("sorare_access_token");
    if (token) fetchCards(token);
  };

  // ── Card maps — Limited/Rare par rarity selectionnee ──
  const proCardMap = useMemo(() => {
    const map = {};
    for (const c of sorareCards) {
      if (c.isStellar) continue;
      // Limited mode: Limited + optionally Rare (higher tier, toggleable)
      // Rare mode: Rare only
      if (rarity === "limited" && !c.isLimited && !(includeRare && c.isRare)) continue;
      if (rarity === "rare" && !c.isRare) continue;
      const slug = c.playerSlug;
      if (!map[slug] || (c.power || 1) > (map[slug].power || 1)) map[slug] = c;
    }
    return map;
  }, [sorareCards, rarity, includeRare]);

  const proCardCount = useMemo(() => {
    return sorareCards.filter(c => !c.isStellar && (c.isLimited || c.isRare)).length;
  }, [sorareCards]);

  // ── Bonus power — D-Score ajusté ──
  // getAdjDs : score avec power (pour affichage dans le tableau et les cartes)
  const getAdjDs = (p) => {
    const slug = p.slug || p.name;
    const card = proCardMap[slug];
    if (!bonusEnabled || !card?.power || card.power <= 1) return Math.round(p.ds || 0);
    return Math.round((p.ds || 0) * card.power);
  };
  // getFullScore : score final d'un joueur (avec power + capitaine si applicable)
  // C'est la formule Sorare Pro : base × captain_mult × power
  const getFullScore = (p, isCap) => {
    const slug = p.slug || p.name;
    const card = proCardMap[slug];
    const base = p.ds || 0;
    const capMult = isCap ? 1.5 : 1;
    const power = (bonusEnabled && card?.power && card.power > 1) ? card.power : 1;
    return base * capMult * power;
  };
  // getPowerPct : bonus % de la carte (pour affichage badge)
  const getPowerPct = (p) => {
    const card = proCardMap[p.slug || p.name];
    return card?.power ? Math.round((card.power - 1) * 100) : 0;
  };
  // Algo Magique: toujours avec bonus (meme si toggle OFF)
  const getAlgoDs = (p) => {
    const slug = p.slug || p.name;
    const card = proCardMap[slug];
    if (!card?.power || card.power <= 1) return Math.round(p.ds || 0);
    return Math.round((p.ds || 0) * card.power);
  };

  // ── Team builder ──
  const [myPicks, setMyPicks] = useState({ GK: null, DEF: null, MIL: null, ATT: null, FLEX: null });
  const resetTeam = () => setMyPicks({ GK: null, DEF: null, MIL: null, ATT: null, FLEX: null });
  const removeFromTeam = (slot) => setMyPicks(prev => ({ ...prev, [slot]: null }));

  const addToTeam = (player) => {
    setMyPicks(prev => {
      // Classic enforcement: max 1 off-season card per team
      const playerCard = proCardMap[player.slug || player.name];
      if (playerCard?.isClassic) {
        const classicCount = Object.values(prev).filter(pp => {
          if (!pp) return false;
          const c = proCardMap[pp.slug || pp.name];
          return c?.isClassic;
        }).length;
        if (classicCount >= 1) return prev; // refuse — already 1 Classic
      }

      const pos = player.position;
      let next;
      if (selectedSlot) {
        if (selectedSlot === "FLEX" && pos !== "GK") next = { ...prev, FLEX: player };
        else if (selectedSlot === pos) next = { ...prev, [pos]: player };
        else next = prev;
      } else {
        if (prev[pos] === null) next = { ...prev, [pos]: player };
        else if (prev.FLEX === null && pos !== "GK") next = { ...prev, FLEX: player };
        else next = { ...prev, [pos]: player };
      }
      const ORDER = ["GK", "DEF", "MIL", "ATT", "FLEX"];
      const nextEmpty = ORDER.find(s => next[s] === null);
      setTimeout(() => setSelectedSlot(nextEmpty || null), 0);
      return next;
    });
  };

  const isInTeam = (p) => {
    const id = p.slug || p.name;
    const usedCount = Object.values(myPicks).filter(pp => pp && (pp.slug || pp.name) === id).length
      + savedTeams.reduce((sum, t) => sum + Object.values(t.picks).filter(pp => pp && (pp.slug || pp.name) === id).length, 0);
    if (usedCount === 0) return false;
    const ownedCount = sorareCards.filter(c => c.playerSlug === id && ((rarity === "limited" && (c.isLimited || (includeRare && c.isRare))) || (rarity === "rare" && c.isRare))).length;
    if (ownedCount > usedCount) return false;
    return true;
  };

  // ── Saved teams ──
  const savedTeamsKey = gwInfo ? `pro_saved_${league}_${rarity}_${gwInfo.gwKey}` : null;
  const [savedTeams, setSavedTeams] = useState([]);
  const maxSaved = MAX_SAVED[league] || 4;

  useEffect(() => {
    if (!savedTeamsKey) return;
    try { setSavedTeams(JSON.parse(localStorage.getItem(savedTeamsKey) || "[]")); } catch { setSavedTeams([]); }
    resetTeam();
  }, [savedTeamsKey]);

  const saveCurrentTeam = () => {
    if (!savedTeamsKey) return;
    const existing = savedTeams;
    if (existing.length >= maxSaved) return;
    const newTeam = { id: Date.now(), picks: { ...myPicks }, score: totalScore, captain: captainSlot, label: `Equipe ${existing.length + 1}` };
    const updated = [...existing, newTeam];
    localStorage.setItem(savedTeamsKey, JSON.stringify(updated));
    setSavedTeams(updated);
    resetTeam();
    setCaptainSlot(null);
  };

  const deleteSavedTeam = (id) => {
    if (!savedTeamsKey) return;
    const updated = savedTeams.filter(t => t.id !== id).map((t, i) => ({ ...t, label: `Equipe ${i + 1}` }));
    localStorage.setItem(savedTeamsKey, JSON.stringify(updated));
    setSavedTeams(updated);
  };

  const loadSavedTeam = (team) => { setMyPicks({ ...team.picks }); };

  // ── GW fixtures for selected league ──
  const gwMatches = useMemo(() => {
    if (!gwInfo || !fixtures?.fixtures) return [];
    return fixtures.fixtures.filter(f => f.league === league && f.date >= gwInfo.startDateStr && f.date <= gwInfo.endDateStr)
      .sort((a, b) => (a.date + (a.kickoff || "99:99")).localeCompare(b.date + (b.kickoff || "99:99")));
  }, [gwInfo, fixtures, league]);

  // ── Player scoring for selected league + GW ──
  // Build club → fixture mapping from gwMatches (supports multi-GW, not just player_fixtures)
  const gwPlayers = useMemo(() => {
    if (!gwInfo) return [];
    const lgTeams = teams.filter(t => t.league === league);
    const result = [];

    // Build club → fixture from gwMatches (all fixtures in this GW date range)
    const clubFx = {};
    for (const f of gwMatches) {
      clubFx[f.home] = { opp: f.away, isHome: true, date: f.date, kickoff: f.kickoff || "" };
      clubFx[f.away] = { opp: f.home, isHome: false, date: f.date, kickoff: f.kickoff || "" };
    }

    for (const p of players) {
      if (p.league !== league) continue;
      if (p.injured || p.suspended) continue;

      // Match player club to fixture via clubMatch (handles name variants)
      let fx = null;
      for (const [club, fxData] of Object.entries(clubFx)) {
        if (clubMatch(p.club, club)) { fx = fxData; break; }
      }
      if (!fx) continue;

      const oppStats = lgTeams.find(t => t.name === fx.opp);
      if (!oppStats) continue;
      const pTeam = findTeam(lgTeams, p.club);
      const ds = dScoreMatch(p, oppStats, fx.isHome, pTeam);
      if (ds < 20) continue;

      let csPercent = null;
      if (["GK", "DEF"].includes(p.position) && oppStats) {
        const oppXg = fx.isHome ? (oppStats.xg_ext || 1.3) : (oppStats.xg_dom || 1.3);
        const defXga = pTeam ? (fx.isHome ? (pTeam.xga_dom || 1.3) : (pTeam.xga_ext || 1.5)) : 1.3;
        csPercent = csProb(defXga, oppXg, p.league);
      }

      result.push({ ...p, ds, oppName: fx.opp, isHome: fx.isHome, kickoff: fx.kickoff || "", matchDate: fx.date, csPercent });
    }
    return result.sort((a, b) => b.ds - a.ds);
  }, [gwInfo, players, teams, gwMatches, league]);

  // ── Decisive Pick Top 3 ──
  const decisiveTop3 = useMemo(() => {
    return gwPlayers.filter(p => p.position !== "GK" && p.appearances >= 3).slice(0, 3);
  }, [gwPlayers]);

  // ── Algo Magique ──
  const generateMagicTeam = () => {
    const usedIds = new Set([
      ...savedTeams.flatMap(t => Object.values(t.picks).filter(Boolean).map(pp => pp.slug || pp.name)),
      ...Object.values(myPicks).filter(Boolean).map(pp => pp.slug || pp.name),
    ]);
    const pool = gwPlayers
      .filter(p => !usedIds.has(p.slug || p.name))
      .filter(p => !sorareConnected || proCardMap[p.slug || p.name])
      .filter(p => p.sorare_starter_pct == null || p.sorare_starter_pct >= 70)
      .filter(p => selectedMatchFilters.length === 0 || selectedMatchFilters.some(m => clubMatch(p.club, m.home) || clubMatch(p.club, m.away)))
      .map(p => ({ ...p, ds: getAlgoDs(p) }))
      .sort((a, b) => b.ds - a.ds);
    if (pool.length < 5) return;

    const newPicks = { GK: null, DEF: null, MIL: null, ATT: null, FLEX: null };
    const taken = new Set();
    let classicUsed = false;
    const clubCount = {};
    let totalL10 = 0;

    const canAdd = (p) => {
      const card = proCardMap[p.slug || p.name];
      if (card?.isClassic && classicUsed) return false;
      // Multi-club: max 2 par club
      if ((clubCount[p.club] || 0) >= 2) return false;
      // Cap260: somme L10 < 260
      if (totalL10 + (p.l10 || 0) >= 260) return false;
      return true;
    };
    const markAdded = (p) => {
      taken.add(p.slug || p.name);
      clubCount[p.club] = (clubCount[p.club] || 0) + 1;
      totalL10 += (p.l10 || 0);
      if (proCardMap[p.slug || p.name]?.isClassic) classicUsed = true;
    };

    for (const pos of ["GK", "DEF", "MIL", "ATT"]) {
      const best = pool.find(p => p.position === pos && !taken.has(p.slug || p.name) && canAdd(p));
      if (best) { newPicks[pos] = best; markAdded(best); }
    }
    const flex = pool.find(p => p.position !== "GK" && !taken.has(p.slug || p.name) && canAdd(p));
    if (flex) { newPicks.FLEX = flex; markAdded(flex); }
    setMyPicks(newPicks);
  };

  // ── Captain (modifiable) ──
  const [captainSlot, setCaptainSlot] = useState(null); // null = auto (highest DS)

  // ── Score calculation — Sorare Pro formula ──
  // Score = sum( ds × power × (1.5 if captain) ) × (1 + compo_bonus%)
  const pickedPlayers = TEAM_SLOTS.map(s => myPicks[s]).filter(Boolean);
  const filledCount = pickedPlayers.length;
  // Captain: user-selected or auto (highest adjusted DS)
  const adjScores = pickedPlayers.map(p => getAdjDs(p));
  const autoCaptainIdx = adjScores.length === 5 ? adjScores.indexOf(Math.max(...adjScores)) : -1;
  const captainPlayer = captainSlot && myPicks[captainSlot] ? myPicks[captainSlot] : (autoCaptainIdx >= 0 ? pickedPlayers[autoCaptainIdx] : null);
  const captainId = captainPlayer ? (captainPlayer.slug || captainPlayer.name) : null;

  // Full scores: each player × power × captain_mult
  const fullScores = pickedPlayers.map(p => {
    const isCap = captainId && (p.slug || p.name) === captainId;
    return getFullScore(p, isCap);
  });

  // Bonus de composition
  const clubCounts = {};
  pickedPlayers.forEach(p => { clubCounts[p.club] = (clubCounts[p.club] || 0) + 1; });
  const isMultiClub = filledCount === 5 && Object.values(clubCounts).every(c => c <= 2);
  const sumL10 = pickedPlayers.reduce((s, p) => s + (p.l10 || 0), 0);
  const isCap260 = filledCount === 5 && sumL10 < 260;
  const compoBonusPct = (isMultiClub ? 2 : 0) + (isCap260 ? 4 : 0);

  const rawTotal = fullScores.reduce((s, v) => s + v, 0);
  const totalScore = Math.round(rawTotal * (1 + compoBonusPct / 100));
  const paliers = getPaliers(league, rarity);
  const palier = paliers.filter(p => totalScore >= p.pts).pop();

  // ── Filtered player list ──
  const visiblePlayers = useMemo(() => {
    let pool = gwPlayers;
    if (selectedSlot) {
      pool = selectedSlot === "FLEX" ? pool.filter(p => ["DEF","MIL","ATT"].includes(p.position)) : pool.filter(p => p.position === selectedSlot);
    }
    if (hideUsed) pool = pool.filter(p => !isInTeam(p));
    if (filterTitu) pool = pool.filter(p => p.sorare_starter_pct != null && p.sorare_starter_pct >= filterTitu);
    if (selectedMatchFilters.length > 0) {
      pool = pool.filter(p => selectedMatchFilters.some(m => clubMatch(p.club, m.home) || clubMatch(p.club, m.away)));
    }
    if (myCardsMode && sorareConnected) {
      pool = pool.filter(p => proCardMap[p.slug || p.name]);
    }
    return pool;
  }, [gwPlayers, selectedSlot, hideUsed, filterTitu, selectedMatchFilters, myCardsMode, sorareConnected, proCardMap, myPicks, savedTeams]);

  // Reset match filters on league change
  useEffect(() => { setSelectedMatchFilters([]); }, [league]);

  // ═══ RENDER ═══
  const POS_SLOT_COLORS = { GK: "#4FC3F7", DEF: "#818CF8", MIL: "#C084FC", FLEX: "#A78BFA", ATT: "#F87171" };
  const rarityColor = rarity === "rare" ? "#EF4444" : "#F59E0B";
  const rarityBg = rarity === "rare" ? "linear-gradient(135deg, #EF4444, #DC2626)" : "linear-gradient(135deg, #F59E0B, #D97706)";

  return (
    <div style={{ position: "relative", minHeight: "80vh", padding: "0 16px 40px", maxWidth: 1800, margin: "0 auto" }}>
      <style>{proKeyframes}</style>

      {/* ═══ HEADER : Titre + League selector + Rarity toggle ═══ */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0 12px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: "rgba(255,255,255,0.5)", letterSpacing: "0.12em" }}>SORARE</span>
          <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "3px 10px", borderRadius: 5, background: rarityBg, boxShadow: `0 0 10px ${rarityColor}40` }}>
            <span style={{ fontSize: 14, fontWeight: 900, color: "#fff", letterSpacing: "0.06em" }}>PRO</span>
          </span>
        </div>
        {/* League buttons */}
        <div style={{ display: "flex", gap: 4 }}>
          {PRO_LEAGUES.map(lg => (
            <button key={lg} onClick={() => setLeague(lg)} style={{
              padding: "6px 12px", borderRadius: 8, border: league === lg ? `2px solid ${LEAGUE_COLORS[lg]}` : "1px solid rgba(255,255,255,0.1)",
              background: league === lg ? `${LEAGUE_COLORS[lg]}20` : "rgba(255,255,255,0.03)",
              color: league === lg ? LEAGUE_COLORS[lg] : "rgba(255,255,255,0.4)",
              fontSize: 10, fontWeight: 800, cursor: "pointer", fontFamily: "Outfit", transition: "all 0.15s",
              display: "flex", alignItems: "center", gap: 4,
            }}>
              <img src={`https://flagcdn.com/w20/${LEAGUE_FLAG_CODES[lg]}.png`} alt="" style={{ width: 14, height: 10, objectFit: "cover", borderRadius: 1 }} />
              {lg}
            </button>
          ))}
        </div>
        {/* Rarity toggle */}
        <div style={{ display: "flex", gap: 2, background: "rgba(255,255,255,0.05)", borderRadius: 8, padding: 2 }}>
          {["limited", "rare"].map(r => (
            <button key={r} onClick={() => setRarity(r)} style={{
              padding: "5px 14px", borderRadius: 6, border: "none", cursor: "pointer", fontFamily: "Outfit",
              background: rarity === r ? (r === "rare" ? "#EF4444" : "#F59E0B") : "transparent",
              color: rarity === r ? "#fff" : "rgba(255,255,255,0.35)", fontSize: 11, fontWeight: 800, transition: "all 0.15s",
            }}>
              {r === "rare" ? t(lang, "proRare") : t(lang, "proLimited")}
            </button>
          ))}
        </div>
        {/* Separateur */}
        <span style={{ width: 1, height: 18, background: "rgba(255,255,255,0.12)", flexShrink: 0, marginLeft: 4, marginRight: 4 }} />
        {/* Hot Streak paliers — meme ligne */}
        <span style={{ fontSize: 8, fontWeight: 800, color: "#EF4444", letterSpacing: "0.08em", flexShrink: 0 }}>HOT STREAK</span>
        {paliers.map((p, i) => {
          const reached = totalScore >= p.pts;
          return (
            <div key={i} style={{ padding: "4px 8px", borderRadius: 6, textAlign: "center", border: `1px solid ${reached ? p.color + "80" : "rgba(255,255,255,0.08)"}`, background: reached ? `${p.color}18` : "rgba(255,255,255,0.02)" }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: reached ? p.color : "rgba(255,255,255,0.3)", fontFamily: "'DM Mono',monospace" }}>{p.pts}</div>
              <div style={{ fontSize: 7, color: reached ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.2)" }}>{p.reward}</div>
            </div>
          );
        })}
        {/* Grand Prix — MLS only */}
        {league === "MLS" && (
          <div style={{ padding: "4px 8px", borderRadius: 6, border: `1px solid ${totalScore >= GRAND_PRIX.pts ? "rgba(192,192,192,0.6)" : "rgba(255,255,255,0.06)"}`, background: totalScore >= GRAND_PRIX.pts ? "rgba(192,192,192,0.1)" : "rgba(255,255,255,0.01)" }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: totalScore >= GRAND_PRIX.pts ? "#C0C0C0" : "rgba(255,255,255,0.2)", fontFamily: "'DM Mono',monospace" }}>{GRAND_PRIX.pts}</div>
            <div style={{ fontSize: 6, color: "rgba(255,255,255,0.15)" }}>GP</div>
          </div>
        )}
        {/* GW selector + countdown — fin de ligne */}
        {gwList.length > 0 && (
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
            {gwList.map((gw, i) => {
              const isActive = selectedGwIdx === i;
              const isCurrent = i === 0;
              const startD = gw.gwStart.getDate();
              const endD = gw.gwEnd.getDate();
              const month = gw.gwStart.toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US", { month: "short" }).toUpperCase().replace(".", "");
              return (
                <button key={i} onClick={() => setSelectedGwIdx(i)} style={{
                  padding: "3px 8px", borderRadius: 6, cursor: "pointer", fontFamily: "Outfit", border: "none",
                  background: isActive ? `${rarityColor}30` : "rgba(255,255,255,0.04)",
                  outline: isActive ? `2px solid ${rarityColor}` : "none",
                  transition: "all 0.15s",
                }}>
                  <div style={{ fontSize: 7, fontWeight: 800, color: isActive ? rarityColor : "rgba(255,255,255,0.35)" }}>
                    GW{gw.displayNumber || "?"}{isCurrent ? " LIVE" : ""}
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: isActive ? "#fff" : "rgba(255,255,255,0.4)", fontFamily: "'DM Mono',monospace" }}>
                    {startD}-{endD}
                  </div>
                  <div style={{ fontSize: 6, color: "rgba(255,255,255,0.25)" }}>{month}</div>
                </button>
              );
            })}
            {selectedGwIdx === 0 && (
              <span style={{ fontSize: 12, fontWeight: 900, color: rarityColor, fontFamily: "'DM Mono',monospace", marginLeft: 4 }}>{countdown}</span>
            )}
          </div>
        )}
      </div>

      {/* ═══ MAIN LAYOUT : Left (matches) + Right (builder + players) ═══ */}
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>

        {/* ── Left column: Decisive Pick + Matches ── */}
        <div style={{ width: 280, flexShrink: 0 }}>
          {/* GW Matches */}
          <div style={{ fontSize: 9, fontWeight: 700, color: "#fff", marginBottom: 4 }}>{t(lang, "proMatchClick")}</div>
          {gwMatches.length === 0 ? (
            <div style={{ padding: 20, textAlign: "center", color: "rgba(255,255,255,0.2)", fontSize: 11 }}>{t(lang, "proNoFixtures")}</div>
          ) : (() => {
            const groups = [];
            for (const f of gwMatches) {
              const last = groups[groups.length - 1];
              if (!last || last.date !== f.date) groups.push({ date: f.date, fixtures: [f] });
              else last.fixtures.push(f);
            }
            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {groups.map((g, gi) => {
                  const dateLabel = new Date(g.date + "T12:00:00").toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" }).toUpperCase();
                  return (
                    <div key={gi}>
                      <div style={{ fontSize: 9, fontWeight: 800, color: rarityColor, marginBottom: 3 }}>{dateLabel}</div>
                      {g.fixtures.map((f, fi) => {
                        const isActive = selectedMatchFilters.some(m => m.home === f.home && m.away === f.away);
                        const parisTime = utcToParisTime(f.kickoff, f.date);
                        return (
                          <div key={fi} onClick={() => {
                            setSelectedMatchFilters(prev => {
                              const exists = prev.some(m => m.home === f.home && m.away === f.away);
                              return exists ? prev.filter(m => !(m.home === f.home && m.away === f.away)) : [...prev, { home: f.home, away: f.away }];
                            });
                          }} style={{
                            display: "flex", alignItems: "center", gap: 4, padding: "4px 6px", borderRadius: 5, cursor: "pointer", marginBottom: 2,
                            background: isActive ? `${rarityColor}25` : "rgba(20,10,40,0.5)", border: `1px solid ${isActive ? rarityColor + "60" : "rgba(255,255,255,0.06)"}`, transition: "all 0.15s",
                          }}>
                            <span style={{ fontSize: 8, fontWeight: 800, color: "#A78BFA", fontFamily: "'DM Mono',monospace", width: 32 }}>{parisTime}</span>
                            {logos[f.home] && <img src={`/data/logos/${logos[f.home]}`} alt="" style={{ width: 12, height: 12, objectFit: "contain" }} />}
                            <span style={{ fontSize: 9, fontWeight: 600, color: "#fff", flex: 1, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sn(f.home)}</span>
                            <span style={{ fontSize: 8, color: "rgba(255,255,255,0.2)" }}>vs</span>
                            <span style={{ fontSize: 9, fontWeight: 600, color: "#fff", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sn(f.away)}</span>
                            {logos[f.away] && <img src={`/data/logos/${logos[f.away]}`} alt="" style={{ width: 12, height: 12, objectFit: "contain" }} />}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>

        {/* ── Right column: Builder + Player list ── */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ borderRadius: 14, background: "rgba(6,3,20,0.95)", border: "none", overflow: "hidden", display: "flex", flexDirection: "column", height: "calc(100vh - 180px)", position: "relative" }}>

            {/* Loading overlay — first connection */}
            {sorareLoading && (
              <div style={{ position: "absolute", inset: 0, zIndex: 20, background: "rgba(6,3,20,0.97)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, backdropFilter: "blur(12px)", borderRadius: 14 }}>
                <div style={{ width: 36, height: 36, border: "3px solid rgba(255,255,255,0.1)", borderTop: `3px solid ${rarityColor}`, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                <div style={{ fontSize: 15, fontWeight: 800, color: rarityColor }}>{sorareUser?.nickname || "Sorare"}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                  {loadingProgress.scanned > 0
                    ? `Scan de tes cartes... ${loadingProgress.scanned} scannees · ${loadingProgress.found} Limited/Rare`
                    : "Connexion a Sorare..."}
                </div>
                <div style={{ width: 220, height: 6, borderRadius: 4, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                  <div style={{ height: "100%", borderRadius: 4, background: rarityBg, transition: "width 0.3s", width: loadingProgress.scanned > 0 ? `${Math.min(100, (loadingProgress.scanned / 4500) * 100)}%` : "10%" }} />
                </div>
                {loadingProgress.scanned > 0 && (
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.25)" }}>~{Math.round((4500 - loadingProgress.scanned) / 50 * 0.8)}s restantes</div>
                )}
              </div>
            )}

            {/* Connect overlay */}
            {!sorareConnected && !sorareLoading && (
              <div style={{ position: "absolute", inset: 0, zIndex: 10, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, background: "rgba(6,3,20,0.6)", backdropFilter: "blur(6px)", borderRadius: 14, padding: 20 }}>
                <div style={{ fontSize: 28 }}>🔗</div>
                <div style={{ fontSize: 14, fontWeight: 900, color: "#fff", fontFamily: "Outfit" }}>{t(lang, "proConnect")}</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", textAlign: "center", maxWidth: 280 }}>{t(lang, "proConnectDesc")}</div>
                <button onClick={connectSorare} style={{
                  padding: "12px 28px", borderRadius: 12, border: "none", background: rarityBg,
                  color: "#fff", fontSize: 15, fontWeight: 900, cursor: "pointer", fontFamily: "Outfit",
                  boxShadow: `0 0 30px ${rarityColor}50`, transition: "all 0.2s",
                }}>{t(lang, "proConnect")}</button>
                <div style={{ fontSize: 8, color: "rgba(255,255,255,0.3)" }}>{t(lang, "proConnectSub")}</div>
              </div>
            )}

            {/* Header */}
            <div style={{ padding: "8px 14px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 900, color: rarityColor, letterSpacing: "0.05em" }}>{t(lang, "proMyTeamTitle")}</div>
                <div style={{ fontSize: 8, color: "rgba(255,255,255,0.35)" }}>
                  {filledCount < 5 ? S.proMyTeamSelect(5 - filledCount) : `Score : ${totalScore} pts${palier ? ` · ${palier.reward}` : ""}`}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                {sorareConnected && (<>
                  <button onClick={disconnectSorare} style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 8px", borderRadius: 6, border: "1px solid rgba(74,222,128,0.4)", background: "rgba(74,222,128,0.08)", color: "#4ADE80", fontSize: 8, fontWeight: 800, cursor: "pointer", fontFamily: "Outfit" }}>
                    {sorareUser?.nickname || "Sorare"} · {proCardCount} cards{loadingProgress.scanned > 0 ? ` (${loadingProgress.scanned}...)` : ""}
                  </button>
                  <button onClick={refreshCards} title="Refresh cartes (nouvelle carte achetee ?)" style={{ padding: "4px 6px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.4)", fontSize: 10, cursor: "pointer" }}>↻</button>
                </>)}
                <button onClick={generateMagicTeam} style={{ padding: "5px 10px", borderRadius: 6, border: "none", cursor: "pointer", fontFamily: "Outfit", background: rarityBg, color: "#fff", fontSize: 9, fontWeight: 800 }}>
                  {t(lang, "proAlgo")}
                </button>
              </div>
            </div>

            {/* Body: Pitch + Player list */}
            <div style={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden" }}>

              {/* Pitch (left) */}
              <div style={{ width: 370, flexShrink: 0, display: "flex", flexDirection: "column", borderRight: "1px solid rgba(255,255,255,0.06)", background: "rgba(0,0,0,0.15)" }}>
                {/* Score bar */}
                {filledCount === 5 && (
                  <div style={{ padding: "6px 14px", borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ fontSize: 8, color: "rgba(255,255,255,0.35)", fontWeight: 600 }}>{t(lang, "proScore")}</div>
                      <button onClick={saveCurrentTeam} disabled={savedTeams.length >= maxSaved} style={{ fontSize: 8, fontWeight: 800, padding: "3px 10px", borderRadius: 6, border: "none", cursor: savedTeams.length >= maxSaved ? "not-allowed" : "pointer", background: savedTeams.length >= maxSaved ? "rgba(255,255,255,0.05)" : rarityBg, color: savedTeams.length >= maxSaved ? "rgba(255,255,255,0.2)" : "#fff", fontFamily: "Outfit" }}>
                        {savedTeams.length >= maxSaved ? `${maxSaved}/${maxSaved}` : t(lang, "proSave")}
                      </button>
                      <button onClick={resetTeam} style={{ fontSize: 7, fontWeight: 700, padding: "2px 6px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontFamily: "Outfit" }}>{t(lang, "proReset")}</button>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ fontSize: 7, fontWeight: 800, padding: "2px 5px", borderRadius: 4, border: `1px solid ${isMultiClub ? "rgba(74,222,128,0.5)" : "rgba(255,255,255,0.1)"}`, background: isMultiClub ? "rgba(74,222,128,0.15)" : "transparent", color: isMultiClub ? "#4ADE80" : "rgba(255,255,255,0.2)" }}>MC +2%</span>
                      <span style={{ fontSize: 7, fontWeight: 800, padding: "2px 5px", borderRadius: 4, border: `1px solid ${isCap260 ? "rgba(139,92,246,0.5)" : "rgba(255,255,255,0.1)"}`, background: isCap260 ? "rgba(139,92,246,0.15)" : "transparent", color: isCap260 ? "#A78BFA" : "rgba(255,255,255,0.2)" }}>CAP +4%</span>
                      {palier && <span style={{ fontSize: 8, fontWeight: 700, color: palier.color }}>{palier.reward}</span>}
                      {compoBonusPct > 0 && <span style={{ fontSize: 9, fontWeight: 700, color: "#4ADE80" }}>+{compoBonusPct}%</span>}
                      <span style={{ fontSize: 20, fontWeight: 900, fontFamily: "'DM Mono',monospace", color: palier ? palier.color : rarityColor }}>{totalScore}</span>
                    </div>
                  </div>
                )}

                {/* 5 card slots */}
                <div style={{ padding: "6px 8px", flex: "0 0 auto", display: "flex", flexDirection: "column", gap: 4 }}>
                  {[["ATT", "FLEX"], ["DEF", "GK", "MIL"]].map((row, rowIdx) => (
                    <div key={rowIdx} style={{ display: "flex", gap: 6, justifyContent: "center", alignItems: "flex-start" }}>
                      {row.map(slot => {
                        const p = myPicks[slot];
                        const sc = POS_SLOT_COLORS[slot];
                        const isActive = selectedSlot === slot;
                        const card = p ? proCardMap[p.slug] : null;
                        const dsVal = p ? getAdjDs(p) : 0;
                        const dsCol = dsVal >= 80 ? "#4ADE80" : dsVal >= 65 ? "#C4B5FD" : dsVal >= 50 ? "#FBBF24" : "#F87171";
                        const isCaptain = p && captainPlayer && (p.slug || p.name) === (captainPlayer.slug || captainPlayer.name);
                        const bonusPct = card?.power ? Math.round((card.power - 1) * 100) : 0;
                        return (
                          <div key={slot} onClick={() => setSelectedSlot(isActive ? null : slot)} style={{
                            borderRadius: 10, cursor: "pointer", overflow: "hidden",
                            background: card ? "transparent" : p ? `linear-gradient(160deg, #0d0826, ${sc}30)` : isActive ? `${sc}18` : "rgba(255,255,255,0.025)",
                            border: card ? "none" : isCaptain ? `2px solid #FBBF24` : `1.5px solid ${isActive ? sc + "CC" : p ? sc + "55" : "rgba(255,255,255,0.08)"}`,
                            display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                            padding: card ? 0 : "8px 6px", position: "relative", width: 120, height: 166, flexShrink: 0,
                            marginTop: slot === "GK" ? 12 : 0,
                          }}>
                            {/* Captain badge — click to toggle */}
                            {p && filledCount === 5 && (
                              <button onClick={e => { e.stopPropagation(); setCaptainSlot(captainSlot === slot ? null : slot); }} style={{ position: "absolute", top: card ? 4 : 2, right: card ? 4 : 2, zIndex: 3, width: 18, height: 18, borderRadius: "50%", border: isCaptain ? "2px solid #FBBF24" : "1px solid rgba(255,255,255,0.2)", background: isCaptain ? "#FBBF24" : "rgba(0,0,0,0.5)", color: isCaptain ? "#000" : "rgba(255,255,255,0.4)", fontSize: 9, fontWeight: 900, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>C</button>
                            )}
                            {card ? (
                              <>
                                <img src={card.pictureUrl} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" }} />
                                {card.isClassic && <span style={{ position: "absolute", top: 4, left: 4, fontSize: 6, fontWeight: 900, color: "#fff", background: "rgba(139,92,246,0.8)", borderRadius: 3, padding: "1px 4px", zIndex: 2 }}>CLASSIC</span>}
                                {bonusPct > 0 && <span style={{ position: "absolute", bottom: 26, left: 4, fontSize: 7, fontWeight: 900, color: "#fff", background: "rgba(22,101,52,0.9)", borderRadius: 3, padding: "1px 4px", zIndex: 2 }}>+{bonusPct}%</span>}
                                <div style={{ position: "absolute", bottom: 6, right: 6, zIndex: 2 }}>
                                  <span style={{ display: "inline-block", padding: "3px 7px", borderRadius: 8, fontFamily: "'DM Mono',monospace", fontSize: 14, fontWeight: 700, color: "#fff", background: dsBg(dsVal), boxShadow: `0 0 8px ${dsColor(dsVal)}50` }}>{dsVal}</span>
                                </div>
                                {p.sorare_starter_pct != null && (
                                  <span style={{ position: "absolute", top: 22, right: 4, fontSize: 8, fontWeight: 700, padding: "1px 4px", borderRadius: 3, color: "#fff", background: p.sorare_starter_pct >= 70 ? "rgba(22,101,52,0.9)" : p.sorare_starter_pct >= 50 ? "rgba(133,77,14,0.9)" : "rgba(153,27,27,0.9)", zIndex: 2 }}>{p.sorare_starter_pct}%</span>
                                )}
                                <button onClick={e => { e.stopPropagation(); removeFromTeam(slot); }} style={{ position: "absolute", top: 4, left: card.isClassic ? 40 : 4, background: "rgba(0,0,0,0.5)", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer", fontSize: 10, padding: "2px 5px", borderRadius: 4, zIndex: 2 }}>x</button>
                              </>
                            ) : p ? (
                              <>
                                <span style={{ fontSize: 7, fontWeight: 900, color: "#fff", background: sc, borderRadius: 4, padding: "2px 6px" }}>{slot}</span>
                                {logos[p.club] && <img src={`/data/logos/${logos[p.club]}`} alt="" style={{ width: 26, height: 26, objectFit: "contain" }} />}
                                <div style={{ fontSize: 9, fontWeight: 800, color: "#fff", textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", width: "100%" }}>{p.name.split(" ").pop()}</div>
                                <div style={{ fontSize: 15, fontWeight: 900, color: dsCol, fontFamily: "'DM Mono',monospace" }}>{dsVal}</div>
                                <button onClick={e => { e.stopPropagation(); removeFromTeam(slot); }} style={{ position: "absolute", bottom: 3, right: 3, background: "rgba(255,255,255,0.06)", border: "none", color: "rgba(255,255,255,0.3)", cursor: "pointer", fontSize: 11, padding: "2px 5px", borderRadius: 4 }}>x</button>
                              </>
                            ) : (
                              <>
                                <span style={{ fontSize: 7, fontWeight: 900, color: "#fff", background: sc, borderRadius: 4, padding: "2px 6px" }}>{slot}</span>
                                <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3 }}>
                                  <div style={{ fontSize: 18, opacity: 0.15, color: sc }}>+</div>
                                  <div style={{ fontSize: 6, color: "rgba(255,255,255,0.2)", fontStyle: "italic" }}>{isActive ? "Clique un joueur" : "Vide"}</div>
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>

                {/* Saved teams */}
                <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: "6px 10px", borderTop: "1px solid rgba(255,255,255,0.05)", overflowY: "auto" }}>
                  {Array.from({ length: maxSaved }).map((_, i) => {
                    const st = savedTeams[i];
                    return st ? (
                      <div key={st.id} style={{ borderRadius: 6, background: `${rarityColor}08`, border: `1px solid ${rarityColor}25`, padding: "4px 8px", display: "flex", alignItems: "center", gap: 5 }}>
                        <span style={{ fontSize: 8, fontWeight: 800, color: rarityColor, flexShrink: 0 }}>{st.label}</span>
                        <div style={{ flex: 1, fontSize: 7, color: "rgba(255,255,255,0.4)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {TEAM_SLOTS.map(s => st.picks[s]?.name?.split(" ").pop()).filter(Boolean).join(" · ")}
                        </div>
                        <span style={{ fontSize: 9, fontWeight: 900, color: rarityColor, fontFamily: "'DM Mono',monospace", flexShrink: 0 }}>{st.score}</span>
                        <button onClick={() => loadSavedTeam(st)} style={{ fontSize: 7, fontWeight: 700, padding: "2px 5px", borderRadius: 3, border: `1px solid ${rarityColor}40`, background: `${rarityColor}10`, color: rarityColor, cursor: "pointer", fontFamily: "Outfit", flexShrink: 0 }}>Charger</button>
                        <button onClick={() => deleteSavedTeam(st.id)} style={{ fontSize: 8, padding: "2px 4px", borderRadius: 3, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.3)", cursor: "pointer", flexShrink: 0 }}>x</button>
                      </div>
                    ) : (
                      <div key={i} style={{ borderRadius: 6, background: "rgba(255,255,255,0.015)", border: "1px dashed rgba(255,255,255,0.06)", padding: "4px 8px", textAlign: "center" }}>
                        <span style={{ fontSize: 7, color: "rgba(255,255,255,0.1)", fontStyle: "italic" }}>Slot {i + 1}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Player list (right) */}
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                {/* Filters */}
                <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderBottom: "1px solid rgba(255,255,255,0.07)", background: "rgba(0,0,0,0.3)", flexShrink: 0 }}>
                  <button onClick={() => setHideUsed(v => !v)} style={{ fontSize: 7, fontWeight: 700, padding: "3px 8px", borderRadius: 6, border: `1px solid ${hideUsed ? "rgba(251,191,36,0.5)" : "rgba(255,255,255,0.1)"}`, background: hideUsed ? "rgba(251,191,36,0.12)" : "transparent", color: hideUsed ? "#FBBF24" : "rgba(255,255,255,0.3)", cursor: "pointer", fontFamily: "Outfit" }}>
                    {t(lang, "proDispo")}
                  </button>
                  {sorareConnected && (
                    <button onClick={() => setMyCardsMode(v => !v)} style={{ fontSize: 7, fontWeight: 700, padding: "3px 8px", borderRadius: 6, border: `1px solid ${myCardsMode ? `${rarityColor}80` : "rgba(255,255,255,0.1)"}`, background: myCardsMode ? `${rarityColor}15` : "transparent", color: myCardsMode ? rarityColor : "rgba(255,255,255,0.3)", cursor: "pointer", fontFamily: "Outfit" }}>
                      {t(lang, "proMesCartes")}
                    </button>
                  )}
                  {sorareConnected && rarity === "limited" && (
                    <button onClick={() => setIncludeRare(v => !v)} style={{ fontSize: 7, fontWeight: 700, padding: "3px 8px", borderRadius: 6, border: `1px solid ${includeRare ? "#EF444480" : "rgba(255,255,255,0.1)"}`, background: includeRare ? "rgba(239,68,68,0.12)" : "transparent", color: includeRare ? "#EF4444" : "rgba(255,255,255,0.3)", cursor: "pointer", fontFamily: "Outfit" }}>
                      + Rare
                    </button>
                  )}
                  {sorareConnected && (
                    <button onClick={() => setBonusEnabled(v => !v)} style={{ fontSize: 7, fontWeight: 700, padding: "3px 8px", borderRadius: 6, border: `1px solid ${bonusEnabled ? "rgba(74,222,128,0.5)" : "rgba(255,255,255,0.1)"}`, background: bonusEnabled ? "rgba(74,222,128,0.12)" : "transparent", color: bonusEnabled ? "#4ADE80" : "rgba(255,255,255,0.3)", cursor: "pointer", fontFamily: "Outfit" }}>
                      Bonus {bonusEnabled ? "ON" : "OFF"}
                    </button>
                  )}
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ fontSize: 7, fontWeight: 700, color: filterTitu ? "#4ADE80" : "rgba(255,255,255,0.3)", fontFamily: "Outfit" }}>
                      {filterTitu ? `Titu \u2265${filterTitu}%` : "Titu%"}
                    </span>
                    <input type="range" min={0} max={90} step={10} value={filterTitu} onChange={e => setFilterTitu(Number(e.target.value))}
                      style={{ width: 60, height: 4, accentColor: "#4ADE80", cursor: "pointer" }} />
                  </div>
                </div>

                {/* Player table — full stats like Database */}
                {(() => {
                  const R = v => v != null ? Math.round(v) : "—";
                  const dc = v => v == null ? "rgba(255,255,255,0.2)" : v >= 80 ? "#4ADE80" : v >= 65 ? "#A3E635" : v >= 50 ? "#FBBF24" : v >= 35 ? "#FB923C" : "#EF4444";
                  const aac = () => "rgba(196,181,253,0.8)";
                  const tituC = v => v >= 80 ? "#4ADE80" : v >= 50 ? "#FBBF24" : v > 0 ? "#EF4444" : "rgba(255,255,255,0.2)";
                  const pctC = v => v == null ? "rgba(255,255,255,0.2)" : v >= 40 ? "#4ADE80" : v >= 25 ? "#FCD34D" : v >= 15 ? "#FB923C" : "#EF4444";
                  const poisPMF = (l, k) => { let f=1; for(let i=1;i<=k;i++) f*=i; return Math.exp(-l)*Math.pow(l,k)/f; };
                  const getMatchProbs = (p) => {
                    const pt = findTeam(teams.filter(t => t.league === league), p.club);
                    const ot = findTeam(teams.filter(t => t.league === league), p.oppName);
                    if (!pt || !ot) return null;
                    const lp = p.isHome ? (pt.xg_dom||1.3) : (pt.xg_ext||1.1);
                    const lo = p.isHome ? (ot.xg_ext||1.1) : (ot.xg_dom||1.3);
                    let w=0, d=0, l=0;
                    for (let i=0; i<=7; i++) for (let j=0; j<=7; j++) {
                      const pr = poisPMF(lp,i)*poisPMF(lo,j);
                      if (i>j) w+=pr; else if (i===j) d+=pr; else l+=pr;
                    }
                    return { win:Math.round(w*100), draw:Math.round(d*100), loss:Math.round(l*100) };
                  };
                  const [sortCol, setSortCol] = [teamSort, setTeamSort];
                  const sortedPool = [...visiblePlayers].sort((a, b) => {
                    if (sortCol === "ds")   return (b.ds||0) - (a.ds||0);
                    if (sortCol === "win")  return ((getMatchProbs(b)?.win||0)) - ((getMatchProbs(a)?.win||0));
                    if (sortCol === "cs")   return (b.csPercent||0) - (a.csPercent||0);
                    if (sortCol === "l2")   return (b.l2||0) - (a.l2||0);
                    if (sortCol === "aa2")  return (b.aa2||0) - (a.aa2||0);
                    if (sortCol === "l5")   return (b.l5||0) - (a.l5||0);
                    if (sortCol === "aa5")  return (b.aa5||0) - (a.aa5||0);
                    if (sortCol === "l10")  return (b.l10||0) - (a.l10||0);
                    if (sortCol === "dom")  return (b.avg_dom||0) - (a.avg_dom||0);
                    if (sortCol === "ext")  return (b.avg_ext||0) - (a.avg_ext||0);
                    if (sortCol === "aa10") return (b.aa10||0) - (a.aa10||0);
                    if (sortCol === "titu") return (b.titu_pct||0) - (a.titu_pct||0);
                    if (sortCol === "reg")  return (b.reg10||0) - (a.reg10||0);
                    if (sortCol === "l40")  return (b.l40||0) - (a.l40||0);
                    if (sortCol === "aa40") return (b.aa40||0) - (a.aa40||0);
                    if (sortCol === "ga")   return ((b.goals||0)+(b.assists||0)) - ((a.goals||0)+(a.assists||0));
                    if (sortCol === "titu_s") return (b.sorare_starter_pct||0) - (a.sorare_starter_pct||0);
                    return (b.ds||0) - (a.ds||0);
                  });
                  const COLS = [
                    ["ds","D-Score"], ["opp","Adv."], ["titu_s","Titu%"], ["cs","CS%"], ["win","Win%"],
                    ["l2","L2"], ["aa2","AA2"], ["l5","L5"], ["aa5","AA5"],
                    ["l10","L10"], ["dom","DOM"], ["ext","EXT"], ["aa10","AA10"],
                    ["titu","Titu10"], ["reg","Reg10"], ["l40","L40"], ["aa40","AA40"], ["ga","G+A"],
                  ];
                  const GRID = "28px 70px 80px 52px 80px 36px 36px 90px 30px 28px 30px 28px 46px 32px 32px 28px 30px 28px 30px 30px 44px";
                  const thS = (col) => ({ fontSize: 8, fontWeight: 800, color: sortCol===col ? rarityColor : "rgba(255,255,255,0.3)", cursor: "pointer", userSelect: "none", whiteSpace: "nowrap", textAlign: "center", padding: "0 4px" });

                  return (
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflowX: "auto" }}>
                      {/* Header */}
                      <div style={{ display: "grid", gridTemplateColumns: GRID, alignItems: "center", gap: 2, padding: "3px 8px", borderBottom: "1px solid rgba(255,255,255,0.07)", background: "rgba(0,0,0,0.4)", position: "sticky", top: 0, zIndex: 2, minWidth: "max-content" }}>
                        <span />
                        <span style={{ fontSize: 7, color: "rgba(255,255,255,0.3)", fontWeight: 700 }}>Pos</span>
                        <span style={{ fontSize: 7, color: "rgba(255,255,255,0.3)", fontWeight: 700 }}>Joueur</span>
                        {COLS.map(([col, label]) => {
                          const grp = ["l10","dom","ext","aa10","titu","reg"].includes(col);
                          return (
                            <span key={col} onClick={() => setSortCol(col)} style={{
                              ...thS(col), background: grp ? "rgba(196,181,253,0.07)" : undefined,
                            }}>{label}{sortCol===col?" ↓":""}</span>
                          );
                        })}
                      </div>
                      {/* Rows */}
                      <div style={{ overflowY: "auto", flex: 1, minHeight: 0 }}>
                        <div style={{ minWidth: "max-content" }}>
                        {sortedPool.map(p => {
                          const slug = p.slug || p.name;
                          const inTeam = isInTeam(p);
                          const pc = PC[p.position];
                          const opp = logos[p.oppName];
                          const parisTime = p.kickoff && p.matchDate ? utcToParisTime(p.kickoff, p.matchDate) : "";
                          const ga = (p.goals||0) + (p.assists||0);
                          const ownedCard = proCardMap[slug];
                          return (
                            <div key={slug} onClick={() => !inTeam && addToTeam(p)}
                              style={{ display: "grid", gridTemplateColumns: GRID, alignItems: "center", gap: 2, padding: "4px 8px", borderBottom: "1px solid rgba(255,255,255,0.03)", background: inTeam ? `${rarityColor}12` : "transparent", transition: "background 0.12s", cursor: inTeam ? "default" : "pointer", minWidth: "max-content" }}
                              onMouseEnter={e => { if (!inTeam) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                              onMouseLeave={e => { e.currentTarget.style.background = inTeam ? `${rarityColor}12` : "transparent"; }}
                            >
                              {/* + / check */}
                              <div style={{ width: 20, height: 20, borderRadius: 5, border: `1px solid ${inTeam ? `${rarityColor}40` : "rgba(255,255,255,0.15)"}`, display: "flex", alignItems: "center", justifyContent: "center", color: inTeam ? rarityColor : "rgba(255,255,255,0.5)", fontSize: 13, fontWeight: 700 }}>
                                {inTeam ? "✓" : "+"}
                              </div>
                              {/* Pos + logo */}
                              <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                                <span style={{ fontSize: 7, fontWeight: 900, background: pc, color: "#fff", borderRadius: 3, padding: "2px 4px", flexShrink: 0 }}>{p.position}</span>
                                {logos[p.club] && <img src={`/data/logos/${logos[p.club]}`} alt="" style={{ width: 14, height: 14, objectFit: "contain", flexShrink: 0 }} />}
                              </div>
                              {/* Name */}
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: 10, fontWeight: inTeam ? 700 : 500, color: inTeam ? rarityColor : "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name.split(" ").pop()}</div>
                              </div>
                              {/* D-Score */}
                              <div style={{ textAlign: "center" }}>
                                <span style={{ display: "inline-block", padding: "3px 7px", borderRadius: 8, fontFamily: "'DM Mono',monospace", fontSize: 14, fontWeight: 700, color: isSilver(getAdjDs(p)) ? "#1a1a2e" : "#fff", background: isSilver(getAdjDs(p)) ? "linear-gradient(90deg,#C0C0C0,#A8E8D0,#B0C4E8,#D4B0E8,#fff,#D4B0E8,#B0C4E8,#A8E8D0,#C0C0C0)" : dsBg(getAdjDs(p)), backgroundSize: isSilver(getAdjDs(p)) ? "200% 100%" : "auto", animation: isSilver(getAdjDs(p)) ? "proShine 3s linear infinite" : "none" }}>{getAdjDs(p)}</span>
                              </div>
                              {/* Adv */}
                              <div style={{ overflow: "hidden" }}>
                                {p.oppName ? (
                                  <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                                    <span style={{ fontSize: 11, flexShrink: 0 }}>{p.isHome ? "🏠" : "✈️"}</span>
                                    {opp && <img src={`/data/logos/${opp}`} alt="" style={{ width: 14, height: 14, objectFit: "contain", flexShrink: 0 }} />}
                                    <span style={{ fontSize: 8, color: "rgba(255,255,255,0.5)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sn(p.oppName)}</span>
                                  </div>
                                ) : <span style={{ color: "rgba(255,255,255,0.15)" }}>—</span>}
                              </div>
                              {/* Titu% Sorare */}
                              <div style={{ textAlign: "center" }}>
                                <span style={{ fontSize: 10, fontWeight: 600, fontFamily: "Outfit", padding: "2px 5px", borderRadius: 3, color: "#fff",
                                  background: (p.sorare_starter_pct||0) >= 70 ? "linear-gradient(135deg,#166534,#15803d)" : (p.sorare_starter_pct||0) >= 50 ? "linear-gradient(135deg,#854d0e,#a16207)" : p.sorare_starter_pct == null ? "rgba(255,255,255,0.06)" : "linear-gradient(135deg,#991b1b,#b91c1c)",
                                }}>{p.sorare_starter_pct == null ? "—" : `${p.sorare_starter_pct}%`}</span>
                              </div>
                              {/* CS% */}
                              <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 11, fontWeight: 600, textAlign: "center", color: pctC(p.csPercent) }}>{p.csPercent != null ? `${p.csPercent}%` : "—"}</span>
                              {/* Win% box */}
                              {(() => {
                                const probs = getMatchProbs(p);
                                const homeLogo = p.isHome ? logos[p.club] : opp;
                                const awayLogo = p.isHome ? opp : logos[p.club];
                                const homeWin = p.isHome ? probs?.win : probs?.loss;
                                const awayWin = p.isHome ? probs?.loss : probs?.win;
                                const pctC2 = v => v >= 50 ? "#4ADE80" : v >= 35 ? "#FBBF24" : "#F87171";
                                return (
                                  <div style={{ borderRadius: 5, border: "1px solid rgba(255,255,255,0.07)", background: "rgba(0,0,0,0.25)", padding: "2px 4px", display: "flex", flexDirection: "column", gap: 2 }}>
                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2 }}>
                                      {homeLogo ? <img src={`/data/logos/${homeLogo}`} alt="" style={{ width: 13, height: 13, objectFit: "contain" }} /> : <span style={{width:13}}/>}
                                      {parisTime && <span style={{ fontSize: 9, color: "#A78BFA", fontFamily: "'DM Mono',monospace", fontWeight: 800 }}>{parisTime}</span>}
                                      {awayLogo ? <img src={`/data/logos/${awayLogo}`} alt="" style={{ width: 13, height: 13, objectFit: "contain" }} /> : <span style={{width:13}}/>}
                                    </div>
                                    {probs && (
                                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                                        <span style={{ fontSize: 8, fontWeight: 700, color: p.isHome ? pctC2(homeWin) : "rgba(255,255,255,0.55)", fontFamily: "'DM Mono',monospace" }}>{homeWin}%</span>
                                        <span style={{ fontSize: 8, fontWeight: 700, color: "rgba(255,255,255,0.55)", fontFamily: "'DM Mono',monospace" }}>{probs.draw}%</span>
                                        <span style={{ fontSize: 8, fontWeight: 700, color: p.isHome ? "rgba(255,255,255,0.55)" : pctC2(awayWin), fontFamily: "'DM Mono',monospace" }}>{awayWin}%</span>
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}
                              <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 11, color: dc(p.l2), textAlign: "center" }}>{R(p.l2)}</span>
                              <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: aac(), textAlign: "center" }}>{R(p.aa2)}</span>
                              <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 11, color: dc(p.l5), textAlign: "center" }}>{R(p.l5)}</span>
                              <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: aac(), textAlign: "center" }}>{R(p.aa5)}</span>
                              {/* L10 badge */}
                              <div style={{ textAlign: "center", boxShadow: "-1px 0 0 0 rgba(196,181,253,0.12)" }}>
                                {p.l10 != null ? <span style={{ display: "inline-block", padding: "2px 6px", borderRadius: 6, fontFamily: "'DM Mono',monospace", fontSize: 12, fontWeight: 700, color: dc(p.l10), background: `${dc(p.l10)}22`, border: `1px solid ${dc(p.l10)}55` }}>{R(p.l10)}</span> : <span style={{ color: "rgba(255,255,255,0.2)" }}>—</span>}
                              </div>
                              <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 11, fontWeight: 700, textAlign: "center", color: p.avg_dom != null ? dsColor(p.avg_dom) : "rgba(255,255,255,0.2)" }}>{p.avg_dom != null ? R(p.avg_dom) : "—"}</span>
                              <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 11, fontWeight: 700, textAlign: "center", color: p.avg_ext != null ? dsColor(p.avg_ext) : "rgba(255,255,255,0.2)" }}>{p.avg_ext != null ? R(p.avg_ext) : "—"}</span>
                              <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: aac(), textAlign: "center" }}>{R(p.aa10)}</span>
                              <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, textAlign: "center", color: tituC(p.titu_pct) }}>{p.titu_pct > 0 ? `${R(p.titu_pct)}%` : "—"}</span>
                              <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, textAlign: "center", color: tituC(p.reg10), borderRight: "1px solid rgba(196,181,253,0.18)", paddingRight: 3 }}>{p.reg10 != null ? `${R(p.reg10)}%` : "—"}</span>
                              <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 11, color: dc(p.l40), textAlign: "center" }}>{R(p.l40)}</span>
                              <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: aac(), textAlign: "center" }}>{R(p.aa40)}</span>
                              <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 8, textAlign: "center" }}>
                                {ga > 0 ? <>{p.goals>0&&<span style={{color:"#4ADE80",fontWeight:700}}>{p.goals}G</span>}{p.goals>0&&p.assists>0&&" "}{p.assists>0&&<span style={{color:"#FBBF24",fontWeight:600}}>{p.assists}A</span>}</> : <span style={{color:"rgba(255,255,255,0.12)"}}>—</span>}
                              </span>
                            </div>
                          );
                        })}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ RECAP EQUIPES SAUVEGARDEES ═══ */}
      {savedTeams.length > 0 && (
        <div style={{ marginTop: 24, padding: "0 0 20px" }}>
          <div style={{ fontSize: 13, fontWeight: 900, color: rarityColor, letterSpacing: "0.06em", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
            {t(lang, "proRecap")}
            <span style={{ fontSize: 9, fontWeight: 600, color: "rgba(255,255,255,0.35)" }}>{savedTeams.length}/{maxSaved} · {LEAGUE_NAMES[league] || league} · {rarity === "rare" ? t(lang, "proRare") : t(lang, "proLimited")} · {gwInfo?.displayNumber ? `GW${gwInfo.displayNumber}` : ""}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
            {savedTeams.map((st) => {
              const stPlayers = TEAM_SLOTS.map(s => st.picks[s]).filter(Boolean);
              const stAdjScores = stPlayers.map(p => getAdjDs(p));
              const stCaptain = st.captain && st.picks[st.captain] ? st.picks[st.captain] : (stAdjScores.length === 5 ? stPlayers[stAdjScores.indexOf(Math.max(...stAdjScores))] : null);
              const stCaptainId = stCaptain ? (stCaptain.slug || stCaptain.name) : null;
              const stFullScores = stPlayers.map(p => getFullScore(p, stCaptainId && (p.slug || p.name) === stCaptainId));
              // Bonus compo recap
              const stClubCounts = {};
              stPlayers.forEach(p => { stClubCounts[p.club] = (stClubCounts[p.club] || 0) + 1; });
              const stMultiClub = stPlayers.length === 5 && Object.values(stClubCounts).every(c => c <= 2);
              const stSumL10 = stPlayers.reduce((s, p) => s + (p.l10 || 0), 0);
              const stCap260 = stPlayers.length === 5 && stSumL10 < 260;
              const stCompoPct = (stMultiClub ? 2 : 0) + (stCap260 ? 4 : 0);
              const stTotal = Math.round(stFullScores.reduce((s, v) => s + v, 0) * (1 + stCompoPct / 100));
              const palSt = paliers.filter(p => stTotal >= p.pts).pop();
              return (
                <div key={st.id} style={{ borderRadius: 12, background: "rgba(15,8,40,0.7)", border: `1px solid ${rarityColor}20`, padding: "10px 12px", backdropFilter: "blur(6px)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 11, fontWeight: 900, color: rarityColor }}>{st.label}</span>
                      <button onClick={() => loadSavedTeam(st)} style={{ fontSize: 7, fontWeight: 700, padding: "2px 6px", borderRadius: 4, border: `1px solid ${rarityColor}40`, background: `${rarityColor}10`, color: rarityColor, cursor: "pointer", fontFamily: "Outfit" }}>Charger</button>
                      <button onClick={() => deleteSavedTeam(st.id)} style={{ fontSize: 8, padding: "2px 5px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.3)", cursor: "pointer" }}>x</button>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      {stMultiClub && <span style={{ fontSize: 6, fontWeight: 800, padding: "1px 4px", borderRadius: 3, background: "rgba(74,222,128,0.15)", color: "#4ADE80" }}>MC</span>}
                      {stCap260 && <span style={{ fontSize: 6, fontWeight: 800, padding: "1px 4px", borderRadius: 3, background: "rgba(139,92,246,0.15)", color: "#A78BFA" }}>CAP</span>}
                      {palSt && <span style={{ fontSize: 8, color: palSt.color, fontWeight: 700 }}>{palSt.reward}</span>}
                      <span style={{ fontSize: 18, fontWeight: 900, fontFamily: "'DM Mono',monospace", color: palSt ? palSt.color : rarityColor }}>{stTotal}</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "center", gap: 8 }}>
                    {TEAM_SLOTS.map(slot => {
                      const p = st.picks[slot];
                      if (!p) return null;
                      const pc = PC[p.position];
                      const clubLogo = logos[p.club];
                      const oppLogo = logos[p.oppName];
                      const ownedCard = proCardMap[p.slug || p.name];
                      const dsVal = getAdjDs(p);
                      const parisTime = p.kickoff && p.matchDate ? utcToParisTime(p.kickoff, p.matchDate) : "";
                      const dateLabel = p.matchDate ? new Date(p.matchDate + "T12:00:00").toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US", { timeZone: TZ, weekday: "short", day: "numeric" }).toUpperCase() : "";
                      return (
                        <div key={slot} style={{ textAlign: "center", flex: 1, minWidth: 0 }}>
                          <div style={{ width: "100%", maxWidth: 80, aspectRatio: "3/4", borderRadius: 8, overflow: "hidden", margin: "0 auto", position: "relative",
                            background: ownedCard ? "transparent" : `linear-gradient(155deg, rgba(8,4,28,0.9), ${pc}25)`,
                            border: ownedCard ? "none" : `1px solid ${pc}30`,
                          }}>
                            {ownedCard ? (
                              <img src={ownedCard.pictureUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                            ) : (
                              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 3 }}>
                                {clubLogo && <img src={`/data/logos/${clubLogo}`} alt="" style={{ width: 22, height: 22, objectFit: "contain" }} />}
                                <span style={{ fontSize: 8, fontWeight: 800, color: pc }}>{slot}</span>
                              </div>
                            )}
                            {ownedCard && ownedCard.isClassic && (
                              <span style={{ position: "absolute", top: 2, left: 2, fontSize: 6, fontWeight: 900, color: "#fff", background: "rgba(139,92,246,0.8)", borderRadius: 3, padding: "1px 4px", zIndex: 2 }}>CLASSIC</span>
                            )}
                            {p.sorare_starter_pct != null && (
                              <span style={{ position: "absolute", top: 2, right: 2, fontSize: 7, fontWeight: 700, padding: "1px 4px", borderRadius: 3, color: "#fff",
                                background: p.sorare_starter_pct >= 70 ? "rgba(22,101,52,0.9)" : p.sorare_starter_pct >= 50 ? "rgba(133,77,14,0.9)" : "rgba(153,27,27,0.9)",
                              }}>{p.sorare_starter_pct}%</span>
                            )}
                          </div>
                          <div style={{ fontSize: 9, fontWeight: 700, color: "#fff", marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name.split(" ").pop()}</div>
                          <div style={{ fontSize: 12, fontWeight: 800, color: dsColor(dsVal), fontFamily: "'DM Mono',monospace" }}>{dsVal}</div>
                          {p.oppName && (
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 2, marginTop: 2 }}>
                              <span style={{ fontSize: 8 }}>{p.isHome ? "🏠" : "✈️"}</span>
                              {oppLogo && <img src={`/data/logos/${oppLogo}`} alt="" style={{ width: 10, height: 10, objectFit: "contain" }} />}
                              <span style={{ fontSize: 7, color: "rgba(255,255,255,0.45)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sn(p.oppName)}</span>
                            </div>
                          )}
                          {(parisTime || dateLabel) && (
                            <div style={{ fontSize: 7, fontWeight: 700, color: "#A78BFA", fontFamily: "'DM Mono',monospace", marginTop: 1 }}>
                              {dateLabel}{parisTime ? ` ${parisTime}` : ""}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
