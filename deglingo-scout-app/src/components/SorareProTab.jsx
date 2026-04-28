import { useState, useMemo, useEffect } from "react";
import { POSITION_COLORS, LEAGUE_COLORS, LEAGUE_FLAG_CODES, LEAGUE_NAMES, dsColor, dsBg, isSilver } from "../utils/colors";
import { dScoreMatch, csProb, findTeam } from "../utils/dscore";
import { T, t } from "../utils/i18n";
import { getProGwInfo, getProGwList, loadFrozen, saveFrozen } from "../utils/freeze";
import { pushTeams, fetchCloudStore, extractProTeams } from "../utils/cloudSync";
import { getTeamSlots, getExpectedPicks, getCapThreshold, getSlotPosition, CHAMPION_SOURCE_LEAGUES } from "../utils/proScoring";
import { flattenDecisivesPositive } from "../utils/decisives";
import SkyrocketGauge from "./SkyrocketGauge";

const PC = POSITION_COLORS;
const PRO_LEAGUES = ["L1", "PL", "Liga", "Bundes", "MLS", "Champion"];

// Backgrounds officiels Sorare pour les boutons ligue (frontend-assets.sorare.com)
const LEAGUE_BG_URL = {
  L1:       "/L1-bg.png",
  PL:       "/pl-bg.png",
  Liga:     "/liga-bg.png",
  Bundes:   "/bundes-bg.png",
  MLS:      "/mls-bg.png",
  Champion: "/champion-bg.png",
};
const LEAGUE_LOGO_URL = {
  L1:     "/L1.png",
  PL:     "/pl.png",
  Liga:   "/liga.png",
  Bundes: "/bundes.png",
  MLS:    "/mls.png",
};

// Couleurs dominantes des backgrounds Sorare (pour bordure active + glow)
const LEAGUE_ACCENT = {
  L1:       "#3B82F6", // bleu
  PL:       "#D946EF", // magenta/violet
  Liga:     "#EF4444", // rouge orange
  Bundes:   "#DC2626", // rouge profond
  MLS:      "#22C55E", // vert (fallback, image peut varier)
  Champion: "#EC4899", // fuchsia
};
const TEAM_SLOTS = ["GK", "DEF", "MIL", "ATT", "FLEX"];
const MAX_SAVED = { L1: 4, PL: 4, Liga: 4, Bundes: 4, MLS: 5, Champion: 4 };

/** Cree un objet picks vide avec les slots correspondants a la ligue (5 ou 7). */
const emptyPicks = (league) => Object.fromEntries(getTeamSlots(league).map(s => [s, null]));

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
// Champion : pas de rewards dollar (gains = cartes), echelle 400->650 equidistante.
const PALIERS_CHAMPION = [
  { pts: 400, reward: "", color: "#64748B" },
  { pts: 450, reward: "", color: "#60A5FA" },
  { pts: 500, reward: "", color: "#A78BFA" },
  { pts: 550, reward: "", color: "#C084FC" },
  { pts: 600, reward: "", color: "#F472B6" },
  { pts: 650, reward: "", color: "#EF4444" },
];

const getPaliers = (league, rarity) => {
  if (league === "Champion") return PALIERS_CHAMPION;
  const isEU = EU_LEAGUES.includes(league);
  if (rarity === "rare") return isEU ? PALIERS_EU_RARE : PALIERS_OTHER_RARE;
  return isEU ? PALIERS_EU_LIMITED : PALIERS_OTHER_LIMITED;
};

/* ─── Club matching ─── */
const stripAcc = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const normClub = (n) => stripAcc((n || "").replace(/-/g, " ").trim());
/* ─── Decisive stats Sorare -> icones (dropdown joueurs match) ─── */
// Affiche l'icone autant de fois que la valeur (2 buts = ⚽⚽, 3 passes = 👟👟👟)
const DECISIVE_ICONS = {
  goals:              { emoji: "⚽",  label: "But",            positive: true  },
  goal_assist:        { emoji: "👟",  label: "Passe déc.",     positive: true  },
  assist_penalty_won: { emoji: "🎯",  label: "Péno provoqué",  positive: true  },
  clearance_off_line: { emoji: "🛡",   label: "Sauvetage ligne",positive: true  },
  last_man_tackle:    { emoji: "🚧",  label: "Tacle décisif",  positive: true  },
  penalty_save:       { emoji: "🧤",  label: "Péno arrêté",    positive: true  },
  clean_sheet_60:     { emoji: "🧱",  label: "Clean sheet 60'",positive: true  },
  red_card:           { emoji: "🟥",  label: "Carton rouge",   positive: false },
  own_goals:          { emoji: "💥",  label: "CSC",            positive: false },
  penalty_conceded:   { emoji: "⚖",  label: "Péno concédé",   positive: false },
  error_lead_to_goal: { emoji: "⚠",   label: "Erreur but",     positive: false },
};
function renderDecisives(decisives) {
  if (!decisives || decisives.length === 0) return null;
  return decisives.map((d, idx) => {
    const meta = DECISIVE_ICONS[d.stat];
    if (!meta) return null;
    const v = Math.max(1, d.value || 1);
    return (
      <span key={idx} title={`${meta.label}${v > 1 ? ` ×${v}` : ""}`}
        style={{ display: "inline-flex", alignItems: "center", gap: 0, fontSize: 12, lineHeight: 1 }}>
        {Array.from({ length: v }).map((_, i) => <span key={i}>{meta.emoji}</span>)}
      </span>
    );
  }).filter(Boolean);
}

const CLUB_ALIASES = [
  ["bayern munchen", "bayern munich"], ["rasenballsport leipzig", "rb leipzig"],
  ["bayer 04 leverkusen", "bayer leverkusen"], ["monchengladbach", "m.gladbach"],
  ["1. fc koln", "fc cologne"], ["koln", "cologne"],
  ["rennais", "rennes"], ["celta", "celta vigo"],
  ["atletico madrid", "atletico de madrid"], ["real sociedad", "real sociedad de futbol"],
];
const clubMatch = (a, b) => {
  const na = normClub(a).toLowerCase(), nb = normClub(b).toLowerCase();
  if (na === nb || na.includes(nb) || nb.includes(na)) return true;
  for (const [x, y] of CLUB_ALIASES) {
    if ((na.includes(x) && nb.includes(y)) || (na.includes(y) && nb.includes(x))) return true;
  }
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
@keyframes themeFadeIn { 0%{opacity:0} 100%{opacity:1} }
@keyframes themeBgFadeIn { 0%{opacity:0} 100%{opacity:0.55} }
@keyframes neonPulse { 0%,100%{filter:brightness(1)} 50%{filter:brightness(1.15)} }
@keyframes stellarLivePulse { 0%,100%{opacity:0.85;box-shadow:0 0 4px rgba(248,113,113,0.4)} 50%{opacity:1;box-shadow:0 0 10px rgba(248,113,113,0.85)} }
@keyframes leftCollapsePulse { 0%,100%{filter:brightness(1) saturate(1)} 50%{filter:brightness(1.25) saturate(1.2)} }
.pro-player-list ::-webkit-scrollbar { height: 4px; }
.pro-player-list ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
.pro-player-list ::-webkit-scrollbar-track { background: transparent; }
/* Tablette / petits laptops (~13" MacBook Pro) : compresse le header pour tenir sur 1 ligne */
@media(max-width:1280px){
  .pro-header-row { gap: 8px !important; }
  .pro-header-row .pro-league-btns { gap: 3px !important; }
  .pro-league-btns button { width: 92px !important; height: 36px !important; }
}
@media(max-width:1100px){
  .pro-header-row { gap: 6px !important; }
  .pro-league-btns button { width: 78px !important; height: 32px !important; }
  .pro-rarity-toggle button { padding: 4px 10px !important; font-size: 10px !important; }
  .pro-builder-toggle { padding: 4px 9px !important; font-size: 9px !important; }
  .pro-sorare-badge { gap: 3px !important; }
  .pro-sorare-badge > span:first-child { font-size: 13px !important; }
}
@media(max-width:960px){
  .pro-league-btns button { width: 64px !important; }
}
@media(max-width:768px){
  .pro-main-flex { flex-direction: column !important; gap: 8px !important; }
  .pro-left-panel { display: none !important; }
  .pro-right-col { min-width: 0 !important; }
  .pro-builder-wrap { height: auto !important; max-height: none !important; }
  .pro-builder-body { flex-direction: column !important; }
  .pro-pitch { width: 100% !important; max-width: 100% !important; border-right: none !important; border-bottom: 1px solid rgba(255,255,255,0.06) !important; }
  .pro-pitch > div { align-items: center !important; }
  .pro-card-slot { width: 80px !important; height: 107px !important; margin-top: 0 !important; }
  .pro-player-list { max-height: 50vh !important; }
  .pro-filters-bar { flex-wrap: wrap !important; gap: 3px !important; }
  .pro-header-row { gap: 6px !important; }
  .pro-league-btns button { padding: 4px 8px !important; font-size: 9px !important; }
  .pro-gw-btns { margin-left: 0 !important; }
  .pro-paliers { display: none !important; }
  .pro-recap-grid { grid-template-columns: 1fr !important; }
  .pro-algo-header { flex-wrap: wrap !important; gap: 4px !important; }
  .pro-table-hide-mobile { display: none !important; }
  .pro-score-bar { flex-wrap: wrap !important; gap: 4px !important; }
  .pro-gw-btn { padding: 2px 5px !important; font-size: 8px !important; }
}
`;

/* ═══════════════════════════════════════════════════════════════════
   SORARE PRO TAB — Main Component
   ═══════════════════════════════════════════════════════════════════ */
export default function SorareProTab({ players, teams, fixtures, logos = {}, matchEvents = {}, lang = "fr" }) {
  const S = T[lang] ?? T.fr;

  const isMobile = typeof window !== "undefined" && window.innerWidth <= 768;

  // ── UI State ──
  const [league, setLeague] = useState(() => {
    try {
      const pre = sessionStorage.getItem("pro_preselect_league");
      if (pre) {
        sessionStorage.removeItem("pro_preselect_league");
        if (["L1","PL","Liga","Bundes","MLS","Champion"].includes(pre)) return pre;
      }
    } catch (_) {}
    return "L1";
  });
  const [rarity, setRarity] = useState("limited");
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [hideUsed, setHideUsed] = useState(true);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [builderCollapsed, setBuilderCollapsed] = useState(() => {
    try { return localStorage.getItem("pro_builder_collapsed") === "true"; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem("pro_builder_collapsed", String(builderCollapsed)); } catch { /* noop */ }
  }, [builderCollapsed]);
  const [filterTitu, setFilterTitu] = useState(0);
  const [selectedMatchFilters, setSelectedMatchFilters] = useState([]);
  const [includeRare, setIncludeRare] = useState(false);
  const [bonusEnabled, setBonusEnabled] = useState(false);
  const [seasonFilter, setSeasonFilter] = useState("all"); // "all" | "in" | "off"
  const [algoMultiClub, setAlgoMultiClub] = useState(false);  // false = off par defaut
  const [algoCap260, setAlgoCap260] = useState(false);        // false = off par defaut
  const [expandedFixture, setExpandedFixture] = useState(null); // { key, side: "home"|"away" }

  // ── GW Info — 1 GW passee + 5 prochaines GW (y compris la live) ──
  const gwList = useMemo(() => getProGwList(5), []);
  // Index de la GW LIVE dans la liste (0 = GW passee, 1 = LIVE, 2+ = futures)
  const liveIdx = useMemo(() => gwList.findIndex(gw => gw.isLive), [gwList]);
  // Defaut = GW LIVE
  const [selectedGwIdx, setSelectedGwIdx] = useState(liveIdx >= 0 ? liveIdx : 0);
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
  // Mapping position Sorare (string humanise) -> format interne (GK/DEF/MIL/ATT)
  const SORARE_POS_TO_SHORT = { Goalkeeper: "GK", Defender: "DEF", Midfielder: "MIL", Forward: "ATT" };
  const toShortPos = (s) => SORARE_POS_TO_SHORT[s] || s || null;
  const parseCard = (c) => {
    if (c.sealed || (c.pictureUrl || "").includes("/sealed/")) return null; // cartes scellees = pas jouables
    const edName = c.cardEditionName || "";
    const r = (c.rarityTyped || "").toLowerCase().replace(/ /g, "_");
    // Position CARTE (historique, figee a l'emission = position du joueur a l'epoque).
    // Critique pour les anciennes cartes Pro (ex Cherki 2020 = ATT, 2023 = MIL).
    const cardPos = toShortPos(c.position);
    const playerPos = toShortPos(c.player?.position);
    return {
      cardSlug: c.slug, playerSlug: c.player?.slug || null, playerName: c.player?.displayName || null,
      position: playerPos, // legacy : position actuelle du joueur
      cardPosition: cardPos || playerPos, // position sur la carte (historique)
      rarity: r, pictureUrl: c.pictureUrl || null,
      cardEditionName: edName, isStellar: false,
      isLimited: r === "limited", isRare: r === "rare",
      cardYear: (() => { const matches = [...(c.slug || "").matchAll(/-(\d{4})-/g)]; return matches.length > 0 ? parseInt(matches[matches.length - 1][1]) : null; })(),
      power: c.power,
      clubSlug: c.player?.activeClub?.slug || null,
      clubName: c.player?.activeClub?.name || null,
      leagueSlug: c.player?.activeClub?.domesticLeague?.slug || null,
    };
  };
  const isLR = (c) => { const r = (c.rarityTyped || "").toLowerCase(); return r === "limited" || r === "rare"; };

  const fetchCards = async (token, silent = false) => {
    if (!token) return;
    if (!silent) setSorareLoading(true);
    try {
      // Check localStorage cache first (valid for 1 hour)
      const cacheKey = "pro_cards_cache_v2"; // v2: adds club/league info for Serie A filter
      const cacheTimeKey = "pro_cards_cache_time_v2";
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
      const firstQ = encodeURIComponent(`{currentUser{slug nickname cards(first:50,sport:FOOTBALL){nodes{slug name rarityTyped pictureUrl power cardEditionName ... on Card{sealed position player{slug displayName position activeClub{slug name domesticLeague{slug}}}}}pageInfo{hasNextPage endCursor}}}}`);
      const res = await fetch(`/api/sorare/cards?rawq=${firstQ}`, { headers: { "Authorization": `Bearer ${token}` } });
      if (res.status === 401) { localStorage.removeItem("sorare_access_token"); setSorareConnected(false); setSorareCards([]); return; }
      if (!res.ok) { setSorareConnected(false); return; }
      const data = await res.json();
      const user = data?.data?.currentUser;
      if (!user) { setSorareConnected(false); return; }
      setSorareUser({ slug: user.slug, nickname: user.nickname });

      // Show whatever LR cards we find immediately
      let scanned = user.cards?.nodes?.length || 0;
      let allLR = (user.cards?.nodes || []).filter(isLR).map(parseCard).filter(c => c && c.playerSlug);
      setSorareCards(allLR);
      setSorareConnected(true);
      setMyCardsMode(true);
      setLoadingProgress({ scanned, found: allLR.length });

      // Continue pagination in background (up to 200 pages = 10000 cards)
      let cursor = user.cards?.pageInfo?.endCursor;
      let hasNext = user.cards?.pageInfo?.hasNextPage;
      for (let i = 0; i < 200 && hasNext && cursor; i++) {
        const pageQ = `query($a:String!){currentUser{cards(first:50,sport:FOOTBALL,after:$a){nodes{slug name rarityTyped pictureUrl power cardEditionName ... on Card{sealed position player{slug displayName position activeClub{slug name domesticLeague{slug}}}}}pageInfo{hasNextPage endCursor}}}}`;
        const pr = await fetch(`/api/sorare/cards?rawq=${encodeURIComponent(pageQ)}&vars=${encodeURIComponent(JSON.stringify({a:cursor}))}`, { headers: { "Authorization": `Bearer ${token}` } });
        if (!pr.ok) break;
        const pd = await pr.json();
        if (pd.errors || !pd.data?.currentUser?.cards?.nodes?.length) break;
        const nodes = pd.data.currentUser.cards.nodes;
        scanned += nodes.length;
        const newLR = nodes.filter(isLR).map(parseCard).filter(c => c && c.playerSlug);
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
    finally { setSorareLoading(false); }
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

  // ── Classic threshold — EU saisons croisees (2024-2025 → <2025), MLS annee calendaire (2026 → <2026) ──
  const classicThreshold = league === "MLS" ? 2026 : 2025;
  const tagClassic = (c) => ({ ...c, isClassic: c.cardYear != null && c.cardYear < classicThreshold });

  // ── Card maps — Limited/Rare par rarity selectionnee ──
  const proCardMap = useMemo(() => {
    const map = {};
    for (const c of sorareCards) {
      if (c.isStellar) continue;
      if (rarity === "limited" && !c.isLimited && !(includeRare && c.isRare)) continue;
      if (rarity === "rare" && !c.isRare) continue;
      const slug = c.playerSlug;
      const tagged = tagClassic(c);
      if (!map[slug] || (tagged.power || 1) > (map[slug].power || 1)) map[slug] = tagged;
    }
    return map;
  }, [sorareCards, rarity, includeRare, classicThreshold]);

  // All cards per player (for duplicates display)
  const proAllCards = useMemo(() => {
    const map = {};
    for (const c of sorareCards) {
      if (c.isStellar) continue;
      if (rarity === "limited" && !c.isLimited && !(includeRare && c.isRare)) continue;
      if (rarity === "rare" && !c.isRare) continue;
      const slug = c.playerSlug;
      if (!map[slug]) map[slug] = [];
      map[slug].push(tagClassic(c));
    }
    for (const slug in map) map[slug].sort((a, b) => (b.power || 1) - (a.power || 1));
    return map;
  }, [sorareCards, rarity, includeRare, classicThreshold]);

  const proCardCount = useMemo(() => {
    return sorareCards.filter(c => !c.isStellar && (c.isLimited || c.isRare)).length;
  }, [sorareCards]);

  // ── Bonus power — D-Score ajusté ──
  // getCard : carte specifique du joueur (doublon ou meilleure)
  const getCard = (p) => p._card || proCardMap[p.slug || p.name];
  // getAdjDs : score avec power (pour affichage dans le tableau et les cartes)
  const getAdjDs = (p) => {
    const card = getCard(p);
    if (!bonusEnabled || !card?.power || card.power <= 1) return Math.round(p.ds || 0);
    return Math.round((p.ds || 0) * card.power);
  };
  // getFullScore : score final d'un joueur
  // Formule Sorare officielle : post-bonus + (capitaine ? RAW × 0.5 : 0)
  const getFullScore = (p, isCap) => {
    const card = getCard(p);
    const base = p.ds || 0;
    const power = (bonusEnabled && card?.power && card.power > 1) ? card.power : 1;
    const postBonus = base * power;
    const captainBonus = isCap ? base * 0.5 : 0;
    return postBonus + captainBonus;
  };
  // getPowerPct : bonus % de la carte (pour affichage badge)
  const getPowerPct = (p) => {
    const card = getCard(p);
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
  // Slots dynamiques : 5 pour L1/PL/etc., 7 pour Champion (avec DEF1/DEF2/MIL1/MIL2)
  const teamSlots = getTeamSlots(league);
  const [myPicks, setMyPicks] = useState(emptyPicks(league));
  const [editingTeamId, setEditingTeamId] = useState(null); // null = nouvelle equipe ; id = edition d'une saved
  const resetTeam = () => { setMyPicks(emptyPicks(league)); setEditingTeamId(null); };
  const removeFromTeam = (slot) => setMyPicks(prev => ({ ...prev, [slot]: null }));

  // Quand on change de ligue, re-init les picks avec les bons slots
  useEffect(() => { setMyPicks(emptyPicks(league)); setEditingTeamId(null); setSelectedSlot(null); }, [league]);

  const addToTeam = (player) => {
    setMyPicks(prev => {
      // Same player enforcement: max 1 instance per team (different cards of same player not allowed)
      const playerId = player.slug || player.name;
      const alreadyInTeam = Object.values(prev).some(pp => pp && (pp.slug || pp.name) === playerId);
      if (alreadyInTeam) return prev;

      // Classic enforcement: max 1 off-season card per team
      const playerCard = getCard(player);
      // Classic enforcement : max 1 off-season card par team, SAUF en Champion
      // ou toutes les saisons sont autorisees (aucun blocage classique).
      if (playerCard?.isClassic && league !== "Champion") {
        const classicCount = Object.values(prev).filter(pp => {
          if (!pp) return false;
          const c = getCard(pp);
          return c?.isClassic;
        }).length;
        if (classicCount >= 1) return prev; // refuse — already 1 Classic
      }

      // Position de la CARTE (historique) prioritaire sur position joueur (actuelle).
      // Critique pour vieilles cartes Pro (ex Cherki 2020 = ATT mais player = MIL aujourd'hui).
      const pos = player._card?.cardPosition || player.cardPosition || player.position;
      // Helper : trouve le premier slot vide matchant une position logique donnee.
      const findEmptySlot = (logicalPos) => teamSlots.find(s => prev[s] === null && getSlotPosition(s) === logicalPos);
      let next;
      if (selectedSlot) {
        // Slot choisi : si FLEX accepte tout sauf GK, sinon match par position logique
        if (selectedSlot === "FLEX" && pos !== "GK") next = { ...prev, FLEX: player };
        else if (getSlotPosition(selectedSlot) === pos) next = { ...prev, [selectedSlot]: player };
        else next = prev;
      } else {
        // Auto-placement : 1er slot naturel libre (DEF1 avant DEF2, MIL1 avant MIL2), sinon FLEX
        const slotNaturel = findEmptySlot(pos);
        if (slotNaturel) next = { ...prev, [slotNaturel]: player };
        else if (prev.FLEX === null && pos !== "GK") next = { ...prev, FLEX: player };
        else next = prev; // tous les slots pleins : ignore
      }
      const nextEmpty = teamSlots.find(s => next[s] === null);
      setTimeout(() => setSelectedSlot(nextEmpty || null), 0);
      return next;
    });
  };

  // Visual ✓ indicator: carte dans le current team uniquement
  const isInTeam = (p) => {
    const id = p.slug || p.name;
    return Object.values(myPicks).some(pp => pp && (pp.slug || pp.name) === id);
  };

  // Filtre "Dispo" : carte deja utilisee dans une saved team (= indisponible pour nouvelle team).
  // Discrimine par _cardKey ET par power (bonus), car 2 cartes du meme joueur ont rarement le meme bonus.
  // En mode edition, l'equipe en cours d'edition est exclue du check.
  // Champion : inclut aussi les saved teams L1/PL/Liga/Bundes (meme rarity + GW) car Champion
  // se construit en DERNIER et ne peut pas reutiliser les cartes deja posees dans ces ligues.
  const isUsedInOtherTeam = (p) => {
    const cardKey = p._cardKey;
    const id = p.slug || p.name;
    const pPower = p._card?.power != null ? p._card.power : (proCardMap[id]?.power != null ? proCardMap[id].power : null);
    const otherTeams = [
      ...savedTeams.filter(t => t.id !== editingTeamId),
      ...crossLeagueSavedTeams,
    ];

    let totalUsedCount = 0;
    for (const t of otherTeams) {
      for (const pp of Object.values(t.picks)) {
        if (!pp || (pp.slug || pp.name) !== id) continue;
        totalUsedCount++;
        // Match exact par _cardKey
        if (cardKey && pp._cardKey === cardKey) return true;
        // Match par power (meme bonus = meme carte)
        const ppPower = pp._card?.power != null ? pp._card.power : (proCardMap[id]?.power != null ? proCardMap[id].power : null);
        if (pPower != null && ppPower != null && Math.abs(pPower - ppPower) < 0.0001) return true;
      }
    }

    if (totalUsedCount === 0) return false;
    // Fallback safety net : toutes les cartes possedees sont prises
    const ownedCount = sorareCards.filter(c => c.playerSlug === id && ((rarity === "limited" && (c.isLimited || (includeRare && c.isRare))) || (rarity === "rare" && c.isRare))).length;
    return totalUsedCount >= ownedCount;
  };

  // ── Saved teams ──
  const savedTeamsKey = gwInfo ? `pro_saved_${league}_${rarity}_${gwInfo.gwKey}` : null;
  const [savedTeams, setSavedTeams] = useState([]);
  const maxSaved = MAX_SAVED[league] || 4;

  // Cross-league saved teams pour Champion : cartes deja posees dans L1/PL/Liga/Bundes
  // (meme rarity + meme GW) ne sont plus dispo car Champion se construit en dernier.
  const [crossLeagueTick, setCrossLeagueTick] = useState(0);
  const crossLeagueSavedTeams = useMemo(() => {
    if (league !== "Champion" || !gwInfo) return [];
    const all = [];
    for (const lg of CHAMPION_SOURCE_LEAGUES) {
      const key = `pro_saved_${lg}_${rarity}_${gwInfo.gwKey}`;
      try {
        const data = JSON.parse(localStorage.getItem(key) || "[]");
        if (Array.isArray(data)) all.push(...data);
      } catch { /* noop */ }
    }
    return all;
  }, [league, rarity, gwInfo?.gwKey, crossLeagueTick]);

  useEffect(() => {
    if (!savedTeamsKey) return;
    // 1) Lecture immediate localStorage (offline / demarrage rapide)
    let local = [];
    try { local = JSON.parse(localStorage.getItem(savedTeamsKey) || "[]"); } catch { local = []; }
    setSavedTeams(local);
    resetTeam();
    // 2) Si connecte Sorare, on tente le fetch cloud et on ecrase si present (cloud = source de verite cross-device)
    if (sorareConnected && gwInfo) {
      fetchCloudStore().then(store => {
        if (!store) return;
        const remote = extractProTeams(store, league, rarity, gwInfo.gwKey);
        if (Array.isArray(remote)) {
          try { localStorage.setItem(savedTeamsKey, JSON.stringify(remote)); } catch (_e) { void 0; }
          setSavedTeams(remote);
        } else if (local.length > 0) {
          // Premiere synchro : pousse le local vers le cloud
          pushTeams("pro", { league, rarity, gwKey: gwInfo.gwKey }, local);
        }
      });
    }
  }, [savedTeamsKey, sorareConnected]);

  const saveCurrentTeam = () => {
    if (!savedTeamsKey) return;
    const existing = savedTeams;
    const isEditing = editingTeamId != null && existing.some(t => t.id === editingTeamId);
    if (!isEditing && existing.length >= maxSaved) return;

    // Duplicate check: block save si carte (par _cardKey OU power) deja utilisee dans une autre saved team.
    // En mode edition, on exclut l'equipe en cours d'edition.
    // Le power differencie 2 cartes du meme joueur (in-season vs off-season ont des bonus differents).
    const getPickPower = (pp) => {
      if (pp._card && pp._card.power != null) return pp._card.power;
      const slug = pp.slug || pp.name;
      const card = proCardMap[slug];
      return card ? card.power : null;
    };
    const conflicts = [];
    Object.entries(myPicks).forEach(([slot, pick]) => {
      if (!pick) return;
      const id = pick.slug || pick.name;
      const pickKey = pick._cardKey;
      const pickPower = getPickPower(pick);
      const otherTeams = existing.filter(t => t.id !== editingTeamId);

      for (const t of otherTeams) {
        for (const pp of Object.values(t.picks)) {
          if (!pp || (pp.slug || pp.name) !== id) continue;
          const ppKey = pp._cardKey;
          const ppPower = getPickPower(pp);
          // Match exact par _cardKey
          if (pickKey && ppKey && pickKey === ppKey) {
            conflicts.push({ slot, name: pick.name, team: t.label });
            return;
          }
          // Match par power (meme bonus = meme carte) — discrimine in-season vs off-season
          if (pickPower != null && ppPower != null && Math.abs(pickPower - ppPower) < 0.0001) {
            conflicts.push({ slot, name: pick.name, team: t.label });
            return;
          }
        }
      }

      // Fallback: bloque si total uses depasse les cartes possedees (safety net)
      let totalOtherUses = 0;
      let firstUsingTeam = null;
      otherTeams.forEach(t => {
        Object.values(t.picks).forEach(pp => {
          if (pp && (pp.slug || pp.name) === id) { totalOtherUses++; if (!firstUsingTeam) firstUsingTeam = t; }
        });
      });
      if (totalOtherUses === 0) return;
      const ownedCount = sorareCards.filter(c => c.playerSlug === id && ((rarity === "limited" && (c.isLimited || (includeRare && c.isRare))) || (rarity === "rare" && c.isRare))).length;
      if (totalOtherUses + 1 > ownedCount) {
        conflicts.push({ slot, name: pick.name, team: firstUsingTeam.label });
      }
    });
    if (conflicts.length > 0) {
      const msg = (lang === "fr"
        ? "Impossible de sauvegarder — carte(s) déjà utilisée(s) dans une autre équipe :\n\n"
        : "Cannot save — card(s) already used in another team:\n\n")
        + conflicts.map(c => `• ${c.name} (${c.slot}) → ${c.team}`).join("\n")
        + (lang === "fr"
          ? "\n\nSupprime l'équipe en conflit ou change de carte."
          : "\n\nDelete the conflicting team or change the card.");
      alert(msg);
      return;
    }

    let updated;
    if (isEditing) {
      // Mode edition: ecrase l'equipe existante en gardant son id + label
      updated = existing.map(t => t.id === editingTeamId
        ? { ...t, picks: { ...myPicks }, score: totalScore, captain: captainSlot }
        : t);
    } else {
      const newTeam = { id: Date.now(), picks: { ...myPicks }, score: totalScore, captain: captainSlot, label: lang === "fr" ? `Equipe ${existing.length + 1}` : `Team ${existing.length + 1}` };
      updated = [...existing, newTeam];
    }
    localStorage.setItem(savedTeamsKey, JSON.stringify(updated));
    setSavedTeams(updated);
    if (sorareConnected && gwInfo) pushTeams("pro", { league, rarity, gwKey: gwInfo.gwKey }, updated);
    resetTeam();
    setCaptainSlot(null);
  };

  const deleteSavedTeam = (id) => {
    if (!savedTeamsKey) return;
    const updated = savedTeams.filter(t => t.id !== id).map((t, i) => ({ ...t, label: lang === "fr" ? `Equipe ${i + 1}` : `Team ${i + 1}` }));
    localStorage.setItem(savedTeamsKey, JSON.stringify(updated));
    setSavedTeams(updated);
    if (sorareConnected && gwInfo) pushTeams("pro", { league, rarity, gwKey: gwInfo.gwKey }, updated);
  };

  const loadSavedTeam = (team) => { setMyPicks({ ...team.picks }); setEditingTeamId(team.id); };

  // ── GW fixtures for selected league ──
  const gwMatches = useMemo(() => {
    if (!gwInfo || !fixtures?.fixtures) return [];
    // Pour Champion, inclure les matchs des 4 grands championnats
    const accepts = league === "Champion" ? new Set(CHAMPION_SOURCE_LEAGUES) : new Set([league]);
    // GW boundary = 14:00 UTC (16h Paris). Matchs du jour frontiere :
    // kickoff >= 14:00 UTC = GW suivante, kickoff < 14:00 UTC = GW actuelle
    return fixtures.fixtures.filter(f => {
      if (!accepts.has(f.league)) return false;
      if (f.date < gwInfo.startDateStr || f.date > gwInfo.endDateStr) return false;
      // Jour de debut GW : exclure les matchs avant 14:00 UTC (ils sont dans la GW precedente)
      if (f.date === gwInfo.startDateStr && f.kickoff && f.kickoff < "14:00") return false;
      // Jour de fin GW : exclure les matchs apres 14:00 UTC (ils sont dans la GW suivante)
      if (f.date === gwInfo.endDateStr && f.kickoff && f.kickoff >= "14:00") return false;
      return true;
    }).sort((a, b) => (a.date + (a.kickoff || "99:99")).localeCompare(b.date + (b.kickoff || "99:99")));
  }, [gwInfo, fixtures, league]);

  // ── Player scoring for selected league + GW ──
  // Build club → fixture mapping from gwMatches (supports multi-GW, not just player_fixtures)
  // Pour Champion : pool cross-ligues (union L1 + PL + Liga + Bundes)
  const gwPlayers = useMemo(() => {
    if (!gwInfo) return [];
    const isChampion = league === "Champion";
    const sourceLeagues = isChampion ? CHAMPION_SOURCE_LEAGUES : [league];
    const lgTeams = teams.filter(t => sourceLeagues.includes(t.league));
    const result = [];

    // Build club → fixture from gwMatches (all fixtures in this GW date range)
    const clubFx = {};
    for (const f of gwMatches) {
      clubFx[f.home] = { opp: f.away, isHome: true, date: f.date, kickoff: f.kickoff || "" };
      clubFx[f.away] = { opp: f.home, isHome: false, date: f.date, kickoff: f.kickoff || "" };
    }

    for (const p of players) {
      if (!sourceLeagues.includes(p.league)) continue;
      if (p.injured || p.suspended) continue;

      // Match player club to fixture via clubMatch (handles name variants)
      let fx = null;
      for (const [club, fxData] of Object.entries(clubFx)) {
        if (clubMatch(p.club, club)) { fx = fxData; break; }
      }
      if (!fx) continue;

      const oppStats = lgTeams.find(t => clubMatch(t.name, fx.opp));
      if (!oppStats) continue;
      const pTeam = findTeam(lgTeams, p.club);
      const ds = dScoreMatch(p, oppStats, fx.isHome, pTeam);
      if (ds <= 0 && !proCardMap[p.slug || p.name]) continue;

      let csPercent = null;
      if (["GK", "DEF"].includes(p.position) && oppStats) {
        const oppXg = fx.isHome ? (oppStats.xg_ext || 1.3) : (oppStats.xg_dom || 1.3);
        const defXga = pTeam ? (fx.isHome ? (pTeam.xga_dom || 1.3) : (pTeam.xga_ext || 1.5)) : 1.3;
        csPercent = csProb(defXga, oppXg, p.league);
      }

      result.push({ ...p, ds, oppName: fx.opp, isHome: fx.isHome, kickoff: fx.kickoff || "", matchDate: fx.date, csPercent });
    }
    // Dedupe par slug : quelques joueurs sont tagges dans plusieurs ligues dans players.json
    // (ex jahmai-simpson-pusey PL+autre). Garde la premiere occurrence.
    const seen = new Set();
    const deduped = result.filter(p => {
      const key = p.slug || p.name;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return deduped.sort((a, b) => b.ds - a.ds);
  }, [gwInfo, players, teams, gwMatches, league, proCardMap]);

  // ── Orphans Serie A (Italien) : cartes possedees dont le club joue en Serie A.
  // Sorare a perdu la licence Serie A mais les cartes anciennes restent jouables en Champion.
  // Filtre strict : activeClub.domesticLeague.slug === "serie-a" OU nom du club = club italien.
  const italianOrphans = useMemo(() => {
    if (league !== "Champion" || !sorareConnected) return [];
    const knownSlugs = new Set((players || []).map(p => p.slug));
    const out = [];
    const seen = new Set();
    const isSerieA = (c) => {
      // Source primaire : domesticLeague slug depuis l'API Sorare
      if (c.leagueSlug) return /serie[_-]?a/i.test(c.leagueSlug) && !/serie[_-]?b/i.test(c.leagueSlug);
      // Fallback : pas de leagueSlug (ancien cache ou field absent) -> on exclut
      return false;
    };
    for (const c of sorareCards) {
      if (c.isStellar) continue;
      if (rarity === "limited" && !c.isLimited && !(includeRare && c.isRare)) continue;
      if (rarity === "rare" && !c.isRare) continue;
      const slug = c.playerSlug;
      if (!slug || knownSlugs.has(slug) || seen.has(slug)) continue;
      if (!isSerieA(c)) continue;
      seen.add(slug);
      out.push({
        slug,
        name: c.playerName || slug,
        position: c.position || c.cardPosition || "ATT",
        club: c.clubName || "Serie A",
        league: "Champion",
        ds: 0, l2: null, l5: null, l10: null, aa2: null, aa5: null, aa10: null, l40: null, aa40: null,
        avg_dom: null, avg_ext: null,
        titu_pct: null, reg10: null,
        sorare_starter_pct: null,
        injured: false, suspended: false,
        matchDate: null, oppName: null, isHome: null, kickoff: "",
        csPercent: null,
        _italianOrphan: true,
      });
    }
    return out;
  }, [league, sorareConnected, sorareCards, players, rarity, includeRare]);

  // ── Decisive Pick Top 3 ──
  const decisiveTop3 = useMemo(() => {
    return gwPlayers.filter(p => p.position !== "GK" && p.appearances >= 3).slice(0, 3);
  }, [gwPlayers]);

  // ── Algo Magique ──
  const generateMagicTeam = () => {
    const usedIds = new Set([
      ...savedTeams.flatMap(t => Object.values(t.picks).filter(Boolean).map(pp => pp.slug || pp.name)),
      ...crossLeagueSavedTeams.flatMap(t => Object.values(t.picks).filter(Boolean).map(pp => pp.slug || pp.name)),
      ...Object.values(myPicks).filter(Boolean).map(pp => pp.slug || pp.name),
    ]);
    const pool = gwPlayers
      .filter(p => p.ds >= 20)
      .filter(p => !usedIds.has(p.slug || p.name))
      .filter(p => !sorareConnected || proCardMap[p.slug || p.name])
      .filter(p => (gwInfo?.offsetFromLive || 0) > 1 || p.sorare_starter_pct == null || p.sorare_starter_pct >= 70)
      .filter(p => selectedMatchFilters.length === 0 || selectedMatchFilters.some(m => clubMatch(p.club, m.home) || clubMatch(p.club, m.away)))
      .map(p => ({ ...p, _algoDs: getAlgoDs(p) }))
      .sort((a, b) => b._algoDs - a._algoDs);
    const expectedN = getExpectedPicks(league);
    if (pool.length < expectedN) return;

    const newPicks = emptyPicks(league);
    const taken = new Set();
    let classicUsed = false;
    const clubCount = {};
    let totalL10 = 0;

    // Helper league-aware : trouve le premier slot vide dont la position matche (DEF -> DEF1/DEF2, MIL -> MIL1/MIL2 en Champion)
    const findPosSlot = (pos, picks) => {
      for (const slot of getTeamSlots(league)) {
        if (slot === "FLEX") continue;
        if (picks[slot]) continue;
        if (getSlotPosition(slot) === pos) return slot;
      }
      return null;
    };

    const canAdd = (p) => {
      const card = proCardMap[p.slug || p.name];
      // Classic: max 1 off-season (sauf en Champion ou toutes saisons autorisees)
      if (card?.isClassic && league !== "Champion") {
        const classicCount = Object.values(newPicks).filter(pp => pp && proCardMap[pp.slug || pp.name]?.isClassic).length;
        if (classicCount >= 1) return false;
      }
      // Multi-club: max 2 par club (si toggle actif)
      if (algoMultiClub && (clubCount[p.club] || 0) >= 2) return false;
      // Cap260: somme L10 < 260 (si toggle actif)
      if (algoCap260 && totalL10 + (p.l10 || 0) >= 260) return false;
      return true;
    };
    const markAdded = (p) => {
      taken.add(p.slug || p.name);
      clubCount[p.club] = (clubCount[p.club] || 0) + 1;
      totalL10 += (p.l10 || 0);
    };

    // Conflit anti-meta : GK/DEF vs ATT/MIL adverse (les buts de l'ATT penalisent le GK/DEF)
    // Conflit anti-meta desactive quand filtre match actif (stack = meme match, pas de conflit)
    const hasConflict = (player) => {
      if (selectedMatchFilters.length > 0) return false;
      const picked = Object.values(newPicks).filter(Boolean);
      if (["ATT", "MIL"].includes(player.position))
        return picked.some(pp => ["GK", "DEF"].includes(pp.position) && clubMatch(pp.oppName, player.club));
      if (["GK", "DEF"].includes(player.position))
        return picked.some(pp => ["ATT", "MIL"].includes(pp.position) && clubMatch(player.oppName, pp.club));
      return false;
    };

    // ── STACK path: 1 match selectionne → N joueurs du meme club (meilleur des 2 clubs) ──
    if (selectedMatchFilters.length === 1) {
      const match = selectedMatchFilters[0];
      const clubs = [match.home, match.away];
      let bestStack = null, bestStackScore = 0;
      for (const stackClub of clubs) {
        const clubPool = pool.filter(p => clubMatch(p.club, stackClub));
        const stack = emptyPicks(league);
        const stackTaken = new Set();
        let stackClassic = false;
        for (const p of clubPool) {
          if (stackTaken.has(p.slug || p.name)) continue;
          const card = proCardMap[p.slug || p.name];
          if (card?.isClassic && stackClassic) continue;
          const pos = p.position;
          const posSlot = findPosSlot(pos, stack);
          if (posSlot) { stack[posSlot] = p; stackTaken.add(p.slug || p.name); if (card?.isClassic) stackClassic = true; }
          else if (pos !== "GK" && stack.FLEX === null) { stack.FLEX = p; stackTaken.add(p.slug || p.name); if (card?.isClassic) stackClassic = true; }
          if (Object.values(stack).filter(Boolean).length >= expectedN) break;
        }
        if (Object.values(stack).filter(Boolean).length >= expectedN) {
          const total = Object.values(stack).filter(Boolean).reduce((s, p) => s + (p._algoDs || p.ds || 0), 0);
          if (total > bestStackScore) { bestStackScore = total; bestStack = { ...stack }; }
        }
      }
      if (bestStack) {
        for (const slot of getTeamSlots(league)) {
          if (bestStack[slot]) { newPicks[slot] = bestStack[slot]; markAdded(bestStack[slot]); }
        }
        setMyPicks(newPicks);
        return;
      }
    }

    // ── CAP260 special path: knapsack-style — maximize D-Score with L10 sum < 260 ──
    if (algoCap260) {
      // Strategy: pick best captain (highest D-Score), fill remaining slots by best D-Score/L10 ratio
      const capPool = [...pool];
      let bestCombo = null, bestTotal = 0;
      const SLOTS_ORDER = getTeamSlots(league);
      // Try more captain candidates (top 15) for better search
      const captainCandidates = capPool.slice(0, 15);
      for (const cap of captainCandidates) {
        const combo = emptyPicks(league);
        const capSlot = findPosSlot(cap.position, combo);
        if (capSlot) combo[capSlot] = cap;
        else if (cap.position !== "GK") combo.FLEX = cap;
        else continue;
        let usedSlugs = new Set([cap.slug || cap.name]);
        let usedL10 = cap.l10 || 0;
        let usedClubs = { [cap.club]: 1 };
        let classicUsed = proCardMap[cap.slug || cap.name]?.isClassic || false;
        // Sort remaining by D-Score/L10 ratio DESC (meilleurs points par L10 consomme)
        const remainingPool = capPool.filter(p => !usedSlugs.has(p.slug || p.name))
          .map(p => ({ ...p, _ratio: ((p._algoDs || p.ds || 0) / Math.max(p.l10 || 1, 1)) }))
          .sort((a, b) => b._ratio - a._ratio);
        for (const p of remainingPool) {
          if (usedL10 + (p.l10 || 0) >= 260) continue;
          if (algoMultiClub && (usedClubs[p.club] || 0) >= 2) continue;
          const card = proCardMap[p.slug || p.name];
          if (card?.isClassic && classicUsed) continue;
          const pos = p.position;
          const posSlot = findPosSlot(pos, combo);
          let placed = false;
          if (posSlot) { combo[posSlot] = p; placed = true; }
          else if (pos !== "GK" && !combo.FLEX) { combo.FLEX = p; placed = true; }
          if (placed) {
            usedSlugs.add(p.slug || p.name);
            usedL10 += (p.l10 || 0);
            usedClubs[p.club] = (usedClubs[p.club] || 0) + 1;
            if (card?.isClassic) classicUsed = true;
          }
          if (Object.values(combo).filter(Boolean).length >= expectedN) break;
        }
        if (Object.values(combo).filter(Boolean).length >= expectedN) {
          const total = Object.values(combo).filter(Boolean).reduce((s, p) => s + (p._algoDs || p.ds || 0), 0);
          if (total > bestTotal) { bestTotal = total; bestCombo = { ...combo }; }
        }
      }
      if (bestCombo && Object.values(bestCombo).filter(Boolean).length >= expectedN) {
        for (const slot of SLOTS_ORDER) {
          if (bestCombo[slot]) { newPicks[slot] = bestCombo[slot]; markAdded(bestCombo[slot]); }
        }
      }
    }

    // ── Standard path (no CAP or CAP didn't fill) ──
    if (Object.values(newPicks).filter(Boolean).length < expectedN) {
      // GK rare : si 1-2 GK titu >= 70%, placer le meilleur en premier
      const viableGKs = pool.filter(p => p.position === "GK" && !taken.has(p.slug || p.name) && (p.sorare_starter_pct == null || p.sorare_starter_pct >= 70));
      if (viableGKs.length <= 2 && viableGKs.length > 0 && !newPicks.GK) {
        const gk = viableGKs[0];
        if (canAdd(gk)) { newPicks.GK = gk; markAdded(gk); }
      }
      // Greedy par score decroissant (respecte anti-conflit GK/DEF vs ATT/MIL)
      for (const p of pool) {
        if (taken.has(p.slug || p.name)) continue;
        if (!canAdd(p)) continue;
        const pos = p.position;
        const posSlot = findPosSlot(pos, newPicks);
        if (posSlot && !hasConflict(p)) { newPicks[posSlot] = p; markAdded(p); }
        else if (pos !== "GK" && newPicks.FLEX === null && !hasConflict(p)) { newPicks.FLEX = p; markAdded(p); }
        if (Object.values(newPicks).filter(Boolean).length >= expectedN) break;
      }
      // Fallback: slots vides → remplir sans check conflit
      for (const p of pool) {
        if (taken.has(p.slug || p.name)) continue;
        if (!canAdd(p)) continue;
        const pos = p.position;
        const posSlot = findPosSlot(pos, newPicks);
        if (posSlot) { newPicks[posSlot] = p; markAdded(p); }
        else if (pos !== "GK" && newPicks.FLEX === null) { newPicks.FLEX = p; markAdded(p); }
        if (Object.values(newPicks).filter(Boolean).length >= expectedN) break;
      }
    }
    // Fallback final: encore des slots vides → relacher toutes contraintes
    // Sauf CAP260 si toggle actif (on prefere equipe incomplete que CAP depasse)
    if (Object.values(newPicks).filter(Boolean).length < expectedN) {
      for (const p of pool) {
        if (taken.has(p.slug || p.name)) continue;
        const card = proCardMap[p.slug || p.name];
        if (card?.isClassic && league !== "Champion" && Object.values(newPicks).filter(pp => pp && proCardMap[pp.slug || pp.name]?.isClassic).length >= 1) continue;
        // CAP260 toujours respecte si actif
        if (algoCap260 && totalL10 + (p.l10 || 0) >= 260) continue;
        const pos = p.position;
        const posSlot = findPosSlot(pos, newPicks);
        if (posSlot) { newPicks[posSlot] = p; markAdded(p); }
        else if (pos !== "GK" && newPicks.FLEX === null) { newPicks.FLEX = p; markAdded(p); }
        if (Object.values(newPicks).filter(Boolean).length >= expectedN) break;
      }
    }
    setMyPicks(newPicks);
  };

  // ── Captain (modifiable) ──
  const [captainSlot, setCaptainSlot] = useState(null); // null = auto (highest DS)

  // ── Score calculation — Sorare Pro formula ──
  // Score = sum( ds × power × (1.5 if captain) ) × (1 + compo_bonus%)
  const pickedPlayers = teamSlots.map(s => myPicks[s]).filter(Boolean);
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
  const expectedPicks = getExpectedPicks(league);
  const capThreshold = getCapThreshold(league);
  const isMultiClub = filledCount === expectedPicks && Object.values(clubCounts).every(c => c <= 2);
  const sumL10 = pickedPlayers.reduce((s, p) => s + (p.l10 || 0), 0);
  const isCap260 = filledCount === expectedPicks && sumL10 < capThreshold;
  const compoBonusPct = (isMultiClub ? 2 : 0) + (isCap260 ? 4 : 0);

  const rawTotal = fullScores.reduce((s, v) => s + v, 0);
  const totalScore = Math.round(rawTotal * (1 + compoBonusPct / 100));
  const paliers = getPaliers(league, rarity);
  const palier = paliers.filter(p => totalScore >= p.pts).pop();

  // ── Filtered player list ──
  const visiblePlayers = useMemo(() => {
    // En Champion, on ajoute les cartes Serie A orphelines (jouables mais hors players.json)
    let pool = league === "Champion" && italianOrphans.length > 0
      ? [...gwPlayers, ...italianOrphans]
      : gwPlayers;
    // Pas de filtre slot ici : se fait APRES expansion pour utiliser cardPosition par carte
    if (filterTitu && (gwInfo?.offsetFromLive || 0) <= 1) pool = pool.filter(p => p.sorare_starter_pct != null && p.sorare_starter_pct >= filterTitu);
    if (selectedMatchFilters.length > 0) {
      pool = pool.filter(p => selectedMatchFilters.some(m => clubMatch(p.club, m.home) || clubMatch(p.club, m.away)));
    }
    if (myCardsMode && sorareConnected) {
      pool = pool.filter(p => proCardMap[p.slug || p.name]);
    }

    // Expansion : cree une row par carte (pour joueurs multi-cartes)
    let expanded;
    if (sorareConnected) {
      expanded = [];
      for (const p of pool) {
        const slug = p.slug || p.name;
        const cards = proAllCards[slug] || [];
        if (cards.length <= 1) {
          expanded.push(p);
        } else {
          for (let ci = 0; ci < cards.length; ci++) {
            expanded.push({ ...p, _cardIdx: ci, _card: cards[ci], _cardKey: `${slug}_${ci}` });
          }
        }
      }
    } else {
      expanded = pool;
    }

    // Filtre slot APRES expansion : utilise la position CARTE (historique) si dispo,
    // sinon position joueur. Permet de picker Cherki 2020 en ATT meme si Cherki joueur = MIL.
    // Pour Champion : DEF1/DEF2 -> pos DEF, MIL1/MIL2 -> pos MIL via getSlotPosition.
    if (selectedSlot) {
      const posOf = (p) => p._card?.cardPosition || p.cardPosition || p.position;
      const targetPos = getSlotPosition(selectedSlot);
      expanded = selectedSlot === "FLEX"
        ? expanded.filter(p => ["DEF","MIL","ATT"].includes(posOf(p)))
        : expanded.filter(p => posOf(p) === targetPos);
    }

    // Filtre Dispo: applique APRES expansion pour check par _cardKey individuel
    // (masque les cartes deja utilisees dans le current team OU dans une saved team)
    if (hideUsed) {
      expanded = expanded.filter(p => !isInTeam(p) && !isUsedInOtherTeam(p));
    }

    // Filtre saison
    if (sorareConnected && seasonFilter !== "all") {
      expanded = expanded.filter(p => {
        const card = p._card || proCardMap[p.slug || p.name];
        if (!card) return true;
        return seasonFilter === "in" ? !card.isClassic : card.isClassic;
      });
    }

    return expanded;
  }, [gwPlayers, italianOrphans, league, selectedSlot, hideUsed, filterTitu, selectedMatchFilters, myCardsMode, sorareConnected, proCardMap, proAllCards, myPicks, savedTeams, crossLeagueSavedTeams, seasonFilter, sorareCards, rarity, includeRare, editingTeamId]);

  // Reset match filters on league change
  useEffect(() => { setSelectedMatchFilters([]); }, [league]);

  // ═══ RENDER ═══
  const POS_SLOT_COLORS = { GK: "#4FC3F7", DEF: "#818CF8", MIL: "#C084FC", FLEX: "#A78BFA", ATT: "#F87171" };
  const rarityColor = rarity === "rare" ? "#EF4444" : "#F59E0B";
  const rarityBg = rarity === "rare" ? "linear-gradient(135deg, #EF4444, #DC2626)" : "linear-gradient(135deg, #F59E0B, #D97706)";

  const themeAccent = LEAGUE_ACCENT[league] || "#888";
  const themeBg = LEAGUE_BG_URL[league];

  return (
    <div className="sp-root" style={{ position: "relative", minHeight: "80vh", padding: isMobile ? "0 8px 40px" : "0 16px 40px", width: "100%", overflowX: "hidden" }}>
      <style>{`
        /* Auto-zoom grand ecran pour eviter de passer en 125% manuellement */
        @media (min-width: 1600px) { .sp-root { zoom: 1.10; } }
        @media (min-width: 1920px) { .sp-root { zoom: 1.20; } }
        @media (min-width: 2400px) { .sp-root { zoom: 1.35; } }
        @media (min-width: 3000px) { .sp-root { zoom: 1.55; } }
      `}</style>
      <style>{proKeyframes}</style>

      {/* ═══ Theme layer — bg de la ligue, texture visible + screen blend ═══ */}
      {themeBg && (
        <div
          key={league}
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: `url(${themeBg})`,
            backgroundSize: "cover",
            backgroundPosition: "center top",
            backgroundRepeat: "no-repeat",
            filter: "blur(6px) saturate(1.5) brightness(1.1)",
            opacity: 0.55,
            mixBlendMode: "screen",
            pointerEvents: "none",
            zIndex: 0,
            animation: "themeBgFadeIn 0.6s ease-out both",
            maskImage: "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.85) 40%, rgba(0,0,0,0.25) 80%, transparent 100%)",
            WebkitMaskImage: "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.85) 40%, rgba(0,0,0,0.25) 80%, transparent 100%)",
          }}
        />
      )}
      {/* Radial glow accent — halo néon depuis le haut */}
      <div
        key={`glow-${league}`}
        aria-hidden
        style={{
          position: "absolute",
          top: -120,
          left: "50%",
          transform: "translateX(-50%)",
          width: "90%",
          height: 420,
          background: `radial-gradient(ellipse at center, ${themeAccent}55, ${themeAccent}22 35%, transparent 70%)`,
          pointerEvents: "none",
          zIndex: 0,
          animation: "themeFadeIn 0.6s ease-out both",
        }}
      />

      {/* ═══ HEADER : Titre + League selector + Rarity toggle ═══ */}
      <div className="pro-header-row" style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0 12px", flexWrap: "wrap", position: "relative", zIndex: 1 }}>
        <div className="pro-sorare-badge" style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: "rgba(255,255,255,0.5)", letterSpacing: "0.12em" }}>SORARE</span>
          <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "3px 10px", borderRadius: 5, background: rarityBg, boxShadow: `0 0 10px ${rarityColor}40` }}>
            <span style={{ fontSize: 14, fontWeight: 900, color: "#fff", letterSpacing: "0.06em" }}>PRO</span>
          </span>
        </div>
        {/* League buttons */}
        <div className="pro-league-btns" style={{ display: "flex", gap: 5 }}>
          {PRO_LEAGUES.map(lg => {
            const isActive = league === lg;
            const accent = LEAGUE_ACCENT[lg] || LEAGUE_COLORS[lg] || "#888";
            const bgUrl = LEAGUE_BG_URL[lg];
            const logoUrl = LEAGUE_LOGO_URL[lg];
            const isL1 = lg === "L1";
            const isPL = lg === "PL";
            const isLiga = lg === "Liga";
            const isBundes = lg === "Bundes";
            const isChampion = lg === "Champion";
            const whiteLogo = isL1 || isPL || isLiga;
            return (
              <button key={lg} onClick={() => setLeague(lg)} title={lg}
                className={`aurora-chip${isActive ? " is-active" : ""}`}
                style={{
                position: "relative", overflow: "hidden",
                width: 105, height: 40, padding: 0, borderRadius: 99,
                border: isActive ? `2px solid ${accent}` : "1px solid rgba(255,255,255,0.1)",
                backgroundColor: "rgba(20,10,40,0.8)",
                cursor: "pointer", fontFamily: "Outfit",
                boxShadow: isActive ? `0 0 14px ${accent}80, 0 0 2px ${accent}` : "none",
                opacity: isActive ? 1 : 0.55,
                filter: isActive ? "none" : "saturate(0.7)",
                flexShrink: 0,
                "--chip-accent": accent,
              }}>
                {bgUrl && <img src={bgUrl} alt="" style={{
                  width: "100%", height: "100%", objectFit: "cover",
                  objectPosition: "center center",
                  display: "block", pointerEvents: "none",
                }} />}
                {isChampion && (
                  <div style={{
                    position: "absolute", top: "50%", left: "50%",
                    transform: "translate(-50%, -50%)",
                    display: "flex", alignItems: "center", gap: 5,
                    pointerEvents: "none",
                  }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.8))" }}>
                      <path d="M6 4h12v3a6 6 0 0 1-12 0V4z M4 5h2v2a2 2 0 0 0 2 2V7H4V5z M18 5h2v2h-4v2a2 2 0 0 0 2-2V5z M10 13h4v3h2v2H8v-2h2v-3z" fill="#fff"/>
                      <path d="M7 4h10v3a5 5 0 0 1-10 0V4z M11 13h2v4h3v2H8v-2h3v-4z" fill="#fff"/>
                    </svg>
                    <span style={{
                      fontFamily: "'Barlow Condensed', 'Outfit', sans-serif",
                      fontWeight: 500, fontSize: 15,
                      color: "#fff", letterSpacing: "0.04em",
                      textShadow: "0 1px 3px rgba(0,0,0,0.8)",
                      lineHeight: 1,
                    }}>CHAMPION</span>
                  </div>
                )}
                {logoUrl && (isLiga ? (
                  <div style={{
                    position: "absolute", top: "50%", left: "50%",
                    transform: "translate(-50%, -50%)",
                    display: "flex", alignItems: "center", gap: 4,
                    pointerEvents: "none",
                  }}>
                    <img src={logoUrl} alt="" style={{
                      height: 24, width: "auto", objectFit: "contain",
                      filter: "brightness(0) invert(1) drop-shadow(0 1px 3px rgba(0,0,0,0.7))",
                    }} />
                    <span style={{
                      fontFamily: "Outfit", fontWeight: 900, fontSize: 11,
                      color: "#fff", letterSpacing: "0.03em",
                      textShadow: "0 1px 3px rgba(0,0,0,0.7)",
                    }}>Liga</span>
                  </div>
                ) : (
                  <img src={logoUrl} alt={lg} style={{
                    position: "absolute", top: "50%", left: "50%",
                    transform: "translate(-50%, -50%)",
                    height: "74%", width: "auto",
                    objectFit: "contain", pointerEvents: "none",
                    filter: `${whiteLogo ? "brightness(0) invert(1) " : ""}drop-shadow(0 1px 3px rgba(0,0,0,0.7))`,
                  }} />
                ))}
              </button>
            );
          })}
        </div>
        {/* Rarity toggle */}
        <div className="pro-rarity-toggle" style={{ display: "flex", gap: 2, background: "rgba(255,255,255,0.05)", borderRadius: 8, padding: 2 }}>
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
        {/* Toggle masquer / afficher Builder + Base — meme ligne que Limited/Rare */}
        <button
          className="pro-builder-toggle"
          onClick={() => setBuilderCollapsed(v => !v)}
          title={builderCollapsed ? (lang === "fr" ? "Afficher le builder + base" : "Show builder + database") : (lang === "fr" ? "Masquer le builder + base" : "Hide builder + database")}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "5px 12px", borderRadius: 99,
            border: `1px solid ${themeAccent}55`,
            background: `linear-gradient(180deg, ${themeAccent}28, ${themeAccent}14)`,
            backdropFilter: "blur(8px)",
            color: themeAccent, fontSize: 10, fontWeight: 800,
            fontFamily: "Outfit", letterSpacing: "0.04em",
            cursor: "pointer",
            boxShadow: `0 0 8px ${themeAccent}30, inset 0 1px 0 rgba(255,255,255,0.08)`,
            transition: "all 0.18s",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = `linear-gradient(180deg, ${themeAccent}40, ${themeAccent}20)`; e.currentTarget.style.borderColor = `${themeAccent}90`; }}
          onMouseLeave={e => { e.currentTarget.style.background = `linear-gradient(180deg, ${themeAccent}28, ${themeAccent}14)`; e.currentTarget.style.borderColor = `${themeAccent}55`; }}
        >
          <span style={{ fontSize: 12, lineHeight: 1 }}>{builderCollapsed ? "▼" : "▲"}</span>
          <span>{builderCollapsed ? (lang === "fr" ? "BUILDER" : "BUILDER") : (lang === "fr" ? "BUILDER" : "BUILDER")}</span>
        </button>
      </div>

      {/* ═══ MAIN LAYOUT : Left (matches) + Right (builder + players) ═══ */}
      <div className="pro-main-flex" style={{ display: "flex", gap: 16, alignItems: "flex-start", position: "relative", zIndex: 1 }}>

        {/* ── Left column: Decisive Pick + Matches ── */}
        <div className="pro-left-panel" style={{ width: leftCollapsed ? 30 : 280, flexShrink: 0, transition: "width 0.2s", position: "relative", display: isMobile ? "none" : undefined }}>
          <button onClick={() => setLeftCollapsed(v => !v)} title={leftCollapsed ? (lang === "fr" ? "Déplier le panneau" : "Expand panel") : (lang === "fr" ? "Replier le panneau" : "Collapse panel")} style={{
            position: "absolute", top: 0, right: -8, zIndex: 5,
            width: 16, height: 36, borderRadius: 6, padding: 0,
            border: `1px solid ${themeAccent}`,
            background: `linear-gradient(180deg, ${themeAccent}66, ${themeAccent}33)`,
            backdropFilter: "blur(8px)",
            color: "#fff",
            fontSize: 12, fontWeight: 900, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: `0 0 18px ${themeAccent}, 0 0 6px ${themeAccent}cc, inset 0 1px 0 rgba(255,255,255,0.25)`,
            textShadow: `0 0 4px ${themeAccent}, 0 1px 2px rgba(0,0,0,0.6)`,
            transition: "all 0.18s",
            animation: "leftCollapsePulse 2.4s ease-in-out infinite",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = `linear-gradient(180deg, ${themeAccent}99, ${themeAccent}55)`; e.currentTarget.style.boxShadow = `0 0 24px ${themeAccent}, 0 0 10px ${themeAccent}, inset 0 1px 0 rgba(255,255,255,0.35)`; e.currentTarget.style.transform = "scale(1.08)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = `linear-gradient(180deg, ${themeAccent}66, ${themeAccent}33)`; e.currentTarget.style.boxShadow = `0 0 18px ${themeAccent}, 0 0 6px ${themeAccent}cc, inset 0 1px 0 rgba(255,255,255,0.25)`; e.currentTarget.style.transform = "scale(1)"; }}
          >{leftCollapsed ? "▶" : "◀"}</button>
          {leftCollapsed ? null : (<>
          {/* GW selector — wrappable au-dessus du calendrier */}
          {gwList.length > 0 && (
            <div className="pro-gw-btns" style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
              {gwList.map((gw, i) => {
                const isActive = selectedGwIdx === i;
                const isCurrent = gw.isLive;
                const isPast = gw.isPast;
                const startD = gw.gwStart.getDate();
                const endD = gw.gwEnd.getDate();
                const month = gw.gwStart.toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US", { month: "short" }).toUpperCase().replace(".", "");
                return (
                  <button key={i} onClick={() => setSelectedGwIdx(i)} style={{
                    padding: "3px 8px", borderRadius: 6, cursor: "pointer", fontFamily: "Outfit", border: "none",
                    background: isActive ? `${rarityColor}30` : "rgba(255,255,255,0.04)",
                    outline: isActive ? `2px solid ${rarityColor}` : "none",
                    opacity: isPast && !isActive ? 0.55 : 1,
                    transition: "all 0.15s",
                  }}>
                    <div style={{ fontSize: 7, fontWeight: 800, color: isActive ? rarityColor : isPast ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.35)" }}>
                      GW{gw.displayNumber || "?"}{isCurrent ? " LIVE" : isPast ? (lang === "fr" ? " FIN" : " END") : ""}
                    </div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: isActive ? "#fff" : "rgba(255,255,255,0.4)", fontFamily: "'DM Mono',monospace" }}>
                      {startD}-{endD}
                    </div>
                    <div style={{ fontSize: 6, color: "rgba(255,255,255,0.25)" }}>{month}</div>
                  </button>
                );
              })}
              {(gwInfo?.offsetFromLive || 0) <= 1 && !gwInfo?.isPast && (
                <span style={{ fontSize: 12, fontWeight: 900, color: rarityColor, fontFamily: "'DM Mono',monospace", marginLeft: 4 }}>{countdown}</span>
              )}
            </div>
          )}
          {/* GW Matches */}
          <div style={{ fontSize: 9, fontWeight: 700, color: "#fff", marginBottom: 4 }}>{t(lang, "proMatchClick")}</div>
          {gwMatches.length === 0 ? (
            <div style={{ padding: 20, textAlign: "center", color: "rgba(255,255,255,0.2)", fontSize: 11 }}>{t(lang, "proNoFixtures")}</div>
          ) : (() => {
            // Map (club, date) -> score du match EXACT (indexer par date evite d'afficher
            // le score d'un match precedent sur la chip d'un match a venir)
            const clubScoresByDate = {};
            for (const p of players || []) {
              if (!p.last_so5_date || p.last_match_home_goals == null) continue;
              // Skip "scheduled" : Sorare a precharge le match avec hg=0/ag=0 mais le coup d'envoi n'a pas eu lieu.
              // Sans ce filtre on affichait "0-0 FT" sur des matchs pas encore commences (cas Bundes 2026-04-26).
              if (p.last_match_status === "scheduled") continue;
              const key = `${normClub(p.club)}|${p.last_so5_date}`;
              if (!clubScoresByDate[key]) {
                clubScoresByDate[key] = { home: p.last_match_home_goals, away: p.last_match_away_goals };
              }
            }
            // Cherche le score d'un match precis : home/away ET date stricte
            const findScoreForMatch = (home, away, date) => {
              const k1 = `${normClub(home)}|${date}`;
              const k2 = `${normClub(away)}|${date}`;
              if (clubScoresByDate[k1]) return clubScoresByDate[k1];
              if (clubScoresByDate[k2]) return clubScoresByDate[k2];
              // Fuzzy clubMatch sur la meme date uniquement
              for (const [fullKey, val] of Object.entries(clubScoresByDate)) {
                const sep = fullKey.lastIndexOf("|");
                const club = fullKey.slice(0, sep);
                const d = fullKey.slice(sep + 1);
                if (d !== date) continue;
                if (clubMatch(club, home) || clubMatch(club, away)) return val;
              }
              return null;
            };
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
                        // Check match EXACT par date : evite de montrer le score d'un match
                        // precedent sur la chip d'un match a venir (ex: PSG a joue Lyon le 19 et
                        // rejoue Nantes le 22 -> chip Nantes ne doit pas montrer FT du Lyon match)
                        const sc = findScoreForMatch(f.home, f.away, f.date);
                        const scoreStr = sc != null ? `${sc.home}-${sc.away}` : null;
                        const matchKey = `${normClub(f.home)}_${normClub(f.away)}`;
                        const isOpenHome = expandedFixture?.key === matchKey && expandedFixture?.side === "home";
                        const isOpenAway = expandedFixture?.key === matchKey && expandedFixture?.side === "away";
                        const isOpen = isOpenHome || isOpenAway;
                        const activeSide = isOpenHome ? "home" : isOpenAway ? "away" : null;
                        // Filtre strict par DATE EXACTE du match pour eviter de montrer des joueurs d'un autre match
                        const playersOf = (club) => [...(players || [])].filter(p =>
                          p.last_so5_date === f.date &&
                          p.last_so5_score != null &&
                          clubMatch(p.club, club)
                        ).sort((a, b) => b.last_so5_score - a.last_so5_score);
                        const hasHomePlayers = scoreStr && playersOf(f.home).length > 0;
                        const hasAwayPlayers = scoreStr && playersOf(f.away).length > 0;
                        const matchPlayers = activeSide ? playersOf(activeSide === "home" ? f.home : f.away) : [];
                        const toggleSide = (side) => {
                          if (expandedFixture?.key === matchKey && expandedFixture?.side === side) setExpandedFixture(null);
                          else setExpandedFixture({ key: matchKey, side });
                        };
                        const homeWin = scoreStr && sc && sc.home > sc.away;
                        const awayWin = scoreStr && sc && sc.away > sc.home;
                        const matchStatus = scoreStr ? (
                          (playersOf(f.home)[0]?.last_match_status) || (playersOf(f.away)[0]?.last_match_status) || "played"
                        ) : null;
                        const isLive = matchStatus === "playing";
                        return (
                          <div key={fi} style={{ marginBottom: 2 }}>
                            <div onClick={() => {
                              setSelectedMatchFilters(prev => {
                                const exists = prev.some(m => m.home === f.home && m.away === f.away);
                                return exists ? prev.filter(m => !(m.home === f.home && m.away === f.away)) : [...prev, { home: f.home, away: f.away }];
                              });
                            }} style={{
                              display: "flex", alignItems: "center", gap: 4, padding: "4px 6px",
                              borderRadius: isOpen ? "5px 5px 0 0" : 5, cursor: "pointer",
                              background: isActive ? `${rarityColor}25` : isLive ? "rgba(60,20,30,0.55)" : scoreStr ? `${themeAccent}18` : "rgba(20,10,40,0.5)",
                              border: `1px solid ${isActive ? rarityColor + "60" : isLive ? "rgba(248,113,113,0.45)" : scoreStr ? `${themeAccent}45` : "rgba(255,255,255,0.06)"}`,
                              transition: "all 0.15s",
                            }}>
                              {scoreStr ? (
                                isLive ? (
                                  <span style={{ fontSize: 7, fontWeight: 900, color: "#F87171", fontFamily: "'DM Mono',monospace", width: 32, padding: "1px 3px", background: "rgba(248,113,113,0.15)", border: "1px solid rgba(248,113,113,0.5)", borderRadius: 3, textAlign: "center", letterSpacing: "0.04em", animation: "stellarLivePulse 1.6s ease-in-out infinite" }}>● LIVE</span>
                                ) : (
                                  <span style={{ fontSize: 8, fontWeight: 900, color: themeAccent, fontFamily: "'DM Mono',monospace", width: 32, padding: "1px 3px", background: `${themeAccent}22`, border: `1px solid ${themeAccent}55`, borderRadius: 3, textAlign: "center" }}>FT</span>
                                )
                              ) : (
                                <span style={{ fontSize: 8, fontWeight: 800, color: "#A78BFA", fontFamily: "'DM Mono',monospace", width: 32 }}>{parisTime}</span>
                              )}
                              {logos[f.home] && <img src={`/data/logos/${logos[f.home]}`} alt="" style={{ width: 12, height: 12, objectFit: "contain" }} />}
                              <span onClick={(e) => { if (hasHomePlayers) { e.stopPropagation(); toggleSide("home"); } }} style={{
                                fontSize: 9, fontWeight: scoreStr ? 700 : 600,
                                color: isOpenHome ? "#C4B5FD" : (homeWin ? themeAccent : "#fff"),
                                flex: 1, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                cursor: hasHomePlayers ? "pointer" : "default",
                                textDecoration: isOpenHome ? "underline" : "none",
                              }}>{sn(f.home)}</span>
                              {scoreStr ? (
                                <span style={{ fontSize: 11, fontWeight: 900, color: "#fff", fontFamily: "'DM Mono',monospace", letterSpacing: "-0.5px" }}>{scoreStr}</span>
                              ) : (
                                <span style={{ fontSize: 8, color: "rgba(255,255,255,0.2)" }}>vs</span>
                              )}
                              <span onClick={(e) => { if (hasAwayPlayers) { e.stopPropagation(); toggleSide("away"); } }} style={{
                                fontSize: 9, fontWeight: scoreStr ? 700 : 600,
                                color: isOpenAway ? "#C4B5FD" : (awayWin ? themeAccent : "#fff"),
                                flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                cursor: hasAwayPlayers ? "pointer" : "default",
                                textDecoration: isOpenAway ? "underline" : "none",
                              }}>{sn(f.away)}</span>
                              {logos[f.away] && <img src={`/data/logos/${logos[f.away]}`} alt="" style={{ width: 12, height: 12, objectFit: "contain" }} />}
                            </div>
                            {isOpen && matchPlayers.length > 0 && (
                              <div style={{ background: "rgba(15,5,40,0.95)", border: "1px solid rgba(196,181,253,0.15)", borderTop: "none", borderRadius: "0 0 5px 5px", padding: "4px 0" }}>
                                {matchPlayers.map((p, pi) => {
                                  const scp = Math.floor(p.last_so5_score);
                                  const col = p.last_so5_score >= 75 ? "#4ADE80" : p.last_so5_score >= 60 ? "#A3E635" : p.last_so5_score >= 50 ? "#FBBF24" : p.last_so5_score >= 40 ? "#FB923C" : "#EF4444";
                                  const pc = PC[p.position] || "#888";
                                  const isHome = normClub(p.club) === normClub(f.home);
                                  return (
                                    <div key={pi} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 8px", borderBottom: pi < matchPlayers.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                                      <span style={{ fontSize: 7, fontWeight: 800, background: pc, borderRadius: 2, padding: "1px 4px", color: "#fff", minWidth: 22, textAlign: "center" }}>{p.position}</span>
                                      {logos[p.club] && <img src={`/data/logos/${logos[p.club]}`} alt="" style={{ width: 10, height: 10, objectFit: "contain" }} />}
                                      <span style={{ fontSize: 10, color: "rgba(255,255,255,0.8)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flexShrink: 0 }}>{p.name.split(" ").pop()}</span>
                                      <span style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 0, marginLeft: "auto", flexShrink: 0 }}>{renderDecisives(p.last_so5_decisives)}</span>
                                      <span style={{ fontSize: 12, fontWeight: 900, color: col, fontFamily: "'DM Mono',monospace", minWidth: 28, textAlign: "right" }}>{scp}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            );
          })()}
          </>)}
        </div>

        {/* ── Right column: Builder + Player list ── */}
        <div className="pro-right-col" style={{ flex: 1, minWidth: 0, maxWidth: "100%", overflow: "hidden" }}>
          {!builderCollapsed && (
          <div className="pro-builder-wrap" style={{ borderRadius: 14, background: "rgba(6,3,20,0.88)", border: `1px solid ${themeAccent}55`, overflow: "hidden", display: "flex", flexDirection: "column", minHeight: isMobile ? "60vh" : undefined, position: "relative", width: "100%", maxWidth: "100%", boxShadow: `0 0 30px ${themeAccent}33, 0 0 2px ${themeAccent}aa, inset 0 0 40px ${themeAccent}12`, transition: "border-color 0.4s ease, box-shadow 0.4s ease" }}>

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
            <div className="pro-algo-header" style={{ padding: "8px 14px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <button onClick={() => setAlgoMultiClub(v => !v)} style={{ fontSize: 7, fontWeight: 800, padding: "3px 6px", borderRadius: 5, border: `1px solid ${algoMultiClub ? "rgba(74,222,128,0.5)" : "rgba(255,255,255,0.1)"}`, background: algoMultiClub ? "rgba(74,222,128,0.12)" : "transparent", color: algoMultiClub ? "#4ADE80" : "rgba(255,255,255,0.3)", cursor: "pointer", fontFamily: "Outfit" }}>
                  MC +2%
                </button>
                <button onClick={() => setAlgoCap260(v => !v)} style={{ fontSize: 7, fontWeight: 800, padding: "3px 6px", borderRadius: 5, border: `1px solid ${algoCap260 ? "rgba(139,92,246,0.5)" : "rgba(255,255,255,0.1)"}`, background: algoCap260 ? "rgba(139,92,246,0.12)" : "transparent", color: algoCap260 ? "#A78BFA" : "rgba(255,255,255,0.3)", cursor: "pointer", fontFamily: "Outfit" }}>
                  CAP +4%
                </button>
                <div style={{ fontSize: 6, color: "rgba(255,255,255,0.45)", lineHeight: 1.3 }}>
                  <div>MC = max 2/{lang === "fr" ? "club" : "club"} (+2%)</div>
                  <div>CAP = L10 total &lt; {capThreshold} (+4%)</div>
                </div>
                <button onClick={generateMagicTeam} style={{ padding: "5px 10px", borderRadius: 6, border: "none", cursor: "pointer", fontFamily: "Outfit", background: rarityBg, color: "#fff", fontSize: 9, fontWeight: 800 }}>
                  {t(lang, "proAlgo")}
                </button>
                {filledCount > 0 && (
                  <button onClick={resetTeam} style={{ fontSize: 7, fontWeight: 700, padding: "2px 6px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontFamily: "Outfit" }}>{t(lang, "proReset")}</button>
                )}
                {filledCount > 0 && (
                  <div style={{ fontSize: 8, fontWeight: 700, fontFamily: "'DM Mono',monospace", color: filledCount === expectedPicks && sumL10 < capThreshold ? "#A78BFA" : sumL10 >= capThreshold ? "#EF4444" : "rgba(255,255,255,0.4)" }}>
                    L10: {Math.round(sumL10)}/{capThreshold}
                  </div>
                )}
                {isMobile && savedTeams.length > 0 && (
                  <div style={{ display: "flex", gap: 3 }}>
                    {savedTeams.map((st, i) => (
                      <button key={st.id} onClick={() => loadSavedTeam(st)} style={{ fontSize: 7, fontWeight: 800, padding: "3px 6px", borderRadius: 4, border: `1px solid ${rarityColor}40`, background: `${rarityColor}10`, color: rarityColor, cursor: "pointer", fontFamily: "Outfit" }}>
                        T{i + 1}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                {sorareConnected && (<>
                  <button onClick={disconnectSorare} style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 8px", borderRadius: 6, border: "1px solid rgba(74,222,128,0.4)", background: "rgba(74,222,128,0.08)", color: "#4ADE80", fontSize: 8, fontWeight: 800, cursor: "pointer", fontFamily: "Outfit" }}>
                    {sorareUser?.nickname || "Sorare"} · {proCardCount} cards{loadingProgress.scanned > 0 ? ` (${loadingProgress.scanned}...)` : ""}
                  </button>
                  <button onClick={refreshCards} title="Refresh cartes (nouvelle carte achetee ?)" style={{ padding: "4px 6px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.4)", fontSize: 10, cursor: "pointer" }}>↻</button>
                </>)}
              </div>
            </div>

            {/* Body: Pitch + Player list */}
            <div className="pro-builder-body" style={{ display: "flex", flexDirection: isMobile ? "column" : "row", height: isMobile ? "auto" : 520, minHeight: 0, overflow: isMobile ? "auto" : "hidden", maxWidth: "100%" }}>

              {/* Pitch (left) */}
              <div className="pro-pitch" style={{ width: isMobile ? "100%" : 370, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", borderRight: isMobile ? "none" : "1px solid rgba(255,255,255,0.06)", borderBottom: isMobile ? "1px solid rgba(255,255,255,0.06)" : "none", background: "rgba(0,0,0,0.15)" }}>
                {/* Score bar */}
                {filledCount === expectedPicks && (
                  <div className="pro-score-bar" style={{ padding: "6px 14px", borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ fontSize: 8, color: "rgba(255,255,255,0.35)", fontWeight: 600 }}>{t(lang, "proScore")}</div>
                      <button onClick={saveCurrentTeam} disabled={savedTeams.length >= maxSaved} style={{ fontSize: 8, fontWeight: 800, padding: "3px 10px", borderRadius: 6, border: "none", cursor: savedTeams.length >= maxSaved ? "not-allowed" : "pointer", background: savedTeams.length >= maxSaved ? "rgba(255,255,255,0.05)" : rarityBg, color: savedTeams.length >= maxSaved ? "rgba(255,255,255,0.2)" : "#fff", fontFamily: "Outfit" }}>
                        {savedTeams.length >= maxSaved ? `${maxSaved}/${maxSaved}` : t(lang, "proSave")}
                      </button>
                      <button onClick={resetTeam} style={{ fontSize: 7, fontWeight: 700, padding: "2px 6px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontFamily: "Outfit" }}>{t(lang, "proReset")}</button>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ fontSize: 7, fontWeight: 800, padding: "2px 5px", borderRadius: 4, border: `1px solid ${isMultiClub ? "rgba(74,222,128,0.5)" : "rgba(255,255,255,0.1)"}`, background: isMultiClub ? "rgba(74,222,128,0.15)" : "transparent", color: isMultiClub ? "#4ADE80" : "rgba(255,255,255,0.2)" }}>MC +2%</span>
                      <span style={{ fontSize: 7, fontWeight: 800, padding: "2px 5px", borderRadius: 4, border: `1px solid ${isCap260 ? "rgba(139,92,246,0.5)" : "rgba(255,255,255,0.1)"}`, background: isCap260 ? "rgba(139,92,246,0.15)" : "transparent", color: isCap260 ? "#A78BFA" : "rgba(255,255,255,0.2)" }}>CAP{capThreshold} +4%</span>
                      {palier && <span style={{ fontSize: 8, fontWeight: 700, color: palier.color }}>{palier.reward}</span>}
                      {compoBonusPct > 0 && <span style={{ fontSize: 9, fontWeight: 700, color: "#4ADE80" }}>+{compoBonusPct}%</span>}
                      <span style={{ fontSize: 20, fontWeight: 900, fontFamily: "'DM Mono',monospace", color: palier ? palier.color : rarityColor }}>{totalScore}</span>
                    </div>
                  </div>
                )}

                {/* Card slots : 5 pour SO5 (2+3) ou 7 pour Champion SO7 (4+3) */}
                <div style={{ padding: isMobile ? "6px 12px" : "6px 8px", flex: "0 0 auto", display: "flex", flexDirection: "column", gap: 4, alignItems: "center", width: "100%", boxSizing: "border-box" }}>
                  {(league === "Champion"
                      ? [["MIL1", "ATT", "FLEX", "MIL2"], ["DEF1", "GK", "DEF2"]]
                      : [["ATT", "FLEX"], ["DEF", "GK", "MIL"]]).map((row, rowIdx) => (
                    <div key={rowIdx} style={{ display: "flex", gap: isMobile ? 3 : 6, justifyContent: "center", alignItems: "flex-start" }}>
                      {row.map(slot => {
                        const p = myPicks[slot];
                        // Pour Champion DEF1/DEF2/MIL1/MIL2, mapper vers la position logique pour la couleur
                        const sc = POS_SLOT_COLORS[getSlotPosition(slot)];
                        const isActive = selectedSlot === slot;
                        const card = p ? getCard(p) : null;
                        const dsVal = p ? getAdjDs(p) : 0;
                        const dsCol = dsVal >= 80 ? "#4ADE80" : dsVal >= 65 ? "#C4B5FD" : dsVal >= 50 ? "#FBBF24" : "#F87171";
                        const isCaptain = p && captainPlayer && (p.slug || p.name) === (captainPlayer.slug || captainPlayer.name);
                        const bonusPct = bonusEnabled && card?.power ? Math.round((card.power - 1) * 100) : 0;
                        const oppLogo = p ? logos[p.oppName] : null;
                        const playerClubLogo = p ? logos[p.club] : null;
                        const parisTime = p?.kickoff && p?.matchDate ? utcToParisTime(p.kickoff, p.matchDate) : "";
                        const dateLabel = p?.matchDate ? new Date(p.matchDate + "T12:00:00").toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US", { timeZone: TZ, weekday: "short", day: "numeric" }).toUpperCase() : "";
                        return (
                          <div key={slot} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                          <div className="pro-card-slot" onClick={() => setSelectedSlot(isActive ? null : slot)} style={{
                            borderRadius: 10, cursor: "pointer", overflow: "hidden",
                            background: card ? "transparent" : p ? `linear-gradient(160deg, #0d0826, ${sc}30)` : isActive ? `${sc}18` : "rgba(255,255,255,0.025)",
                            border: card ? "none" : isCaptain ? `2px solid #FBBF24` : `1.5px solid ${isActive ? sc + "CC" : p ? sc + "55" : "rgba(255,255,255,0.08)"}`,
                            display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                            // Champion : cartes plus petites pour que 4 tiennent en haut (120 * 0.72 = 86 environ)
                            padding: card ? 0 : "6px 4px", position: "relative",
                            width: isMobile ? 65 : league === "Champion" ? ((card || p) ? 82 : 78) : ((card || p) ? 120 : 105),
                            height: isMobile ? 87 : league === "Champion" ? ((card || p) ? 118 : 108) : ((card || p) ? 166 : 140),
                            flexShrink: 0,
                            // GK descend de 12px en SO5. En Champion, ATT + FLEX surélevés de 10px (user demande).
                            marginTop: slot === "GK" && !isMobile ? 12 : (league === "Champion" && (slot === "ATT" || slot === "FLEX") && !isMobile ? -8 : 0),
                          }}>
                            {/* Captain badge — click to toggle */}
                            {p && filledCount === expectedPicks && (
                              <button onClick={e => { e.stopPropagation(); setCaptainSlot(captainSlot === slot ? null : slot); }} style={{ position: "absolute", top: card ? 4 : 2, right: card ? 20 : 2, zIndex: 3, width: 18, height: 18, borderRadius: "50%", border: isCaptain ? "2px solid #FBBF24" : "1px solid rgba(255,255,255,0.2)", background: isCaptain ? "#FBBF24" : "rgba(0,0,0,0.5)", color: isCaptain ? "#000" : "rgba(255,255,255,0.4)", fontSize: 9, fontWeight: 900, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>C</button>
                            )}
                            {card ? (
                              <>
                                <img src={card.pictureUrl} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" }} />
                                {card.isClassic && <span style={{ position: "absolute", top: 4, left: 4, fontSize: 6, fontWeight: 900, color: "#fff", background: "rgba(139,92,246,0.8)", borderRadius: 3, padding: "1px 4px", zIndex: 2 }}>CLASSIC</span>}
                                <div style={{ position: "absolute", bottom: 6, right: 6, zIndex: 2, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                                  {bonusPct > 0 && <span style={{ fontSize: 7, fontWeight: 900, color: "#4ADE80", background: "rgba(0,0,0,0.6)", borderRadius: 3, padding: "1px 4px" }}>+{bonusPct}%</span>}
                                  <span style={{ display: "inline-block", padding: "3px 7px", borderRadius: 8, fontFamily: "'DM Mono',monospace", fontSize: 14, fontWeight: 700, color: "#fff", background: dsBg(dsVal), boxShadow: `0 0 8px ${dsColor(dsVal)}50` }}>{dsVal}</span>
                                </div>
                                {(gwInfo?.offsetFromLive || 0) <= 1 && p.sorare_starter_pct != null && (
                                  <span style={{ position: "absolute", top: 22, right: 4, fontSize: 8, fontWeight: 700, padding: "1px 4px", borderRadius: 3, color: "#fff", background: p.sorare_starter_pct >= 70 ? "rgba(22,101,52,0.9)" : p.sorare_starter_pct >= 50 ? "rgba(133,77,14,0.9)" : "rgba(153,27,27,0.9)", zIndex: 2 }}>{p.sorare_starter_pct}%</span>
                                )}
                                <button onClick={e => { e.stopPropagation(); removeFromTeam(slot); }} style={{ position: "absolute", top: 4, left: card.isClassic ? 40 : 4, background: "rgba(0,0,0,0.5)", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer", fontSize: 10, padding: "2px 5px", borderRadius: 4, zIndex: 2 }}>x</button>
                              </>
                            ) : p ? (
                              <>
                                <span style={{ fontSize: 7, fontWeight: 900, color: "#fff", background: sc, borderRadius: 4, padding: "2px 6px" }}>{getSlotPosition(slot)}</span>
                                {logos[p.club] && <img src={`/data/logos/${logos[p.club]}`} alt="" style={{ width: 26, height: 26, objectFit: "contain" }} />}
                                <div style={{ fontSize: 9, fontWeight: 800, color: "#fff", textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", width: "100%" }}>{p.name.split(" ").pop()}</div>
                                <div style={{ fontSize: 15, fontWeight: 900, color: dsCol, fontFamily: "'DM Mono',monospace" }}>{dsVal}</div>
                                <button onClick={e => { e.stopPropagation(); removeFromTeam(slot); }} style={{ position: "absolute", bottom: 3, right: 3, background: "rgba(255,255,255,0.06)", border: "none", color: "rgba(255,255,255,0.3)", cursor: "pointer", fontSize: 11, padding: "2px 5px", borderRadius: 4 }}>x</button>
                              </>
                            ) : (
                              <>
                                <span style={{ fontSize: 7, fontWeight: 900, color: "#fff", background: sc, borderRadius: 4, padding: "2px 6px" }}>{getSlotPosition(slot)}</span>
                                <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3 }}>
                                  <div style={{ fontSize: 18, opacity: 0.15, color: sc }}>+</div>
                                  <div style={{ fontSize: 6, color: "rgba(255,255,255,0.2)", fontStyle: "italic" }}>{isActive ? (lang === "fr" ? "Clique un joueur" : "Click a player") : (lang === "fr" ? "Vide" : "Empty")}</div>
                                </div>
                              </>
                            )}
                          </div>
                          {p && (
                            <div style={{ marginTop: 3, padding: "3px 8px", borderRadius: 6, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", textAlign: "center" }}>
                              <div style={{ fontSize: 7, fontWeight: 700, color: "#fff", fontFamily: "'DM Mono',monospace" }}>
                                {dateLabel.replace(".", "")} - {parisTime}
                              </div>
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, marginTop: 2 }}>
                                {playerClubLogo && <img src={`/data/logos/${playerClubLogo}`} alt="" style={{ width: 14, height: 14, objectFit: "contain" }} />}
                                <span style={{ fontSize: 7, fontWeight: 700, color: "rgba(255,255,255,0.25)" }}>vs</span>
                                {oppLogo && <img src={`/data/logos/${oppLogo}`} alt="" style={{ width: 14, height: 14, objectFit: "contain" }} />}
                              </div>
                            </div>
                          )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>

                {/* Saved teams — hidden on mobile (replaced by T1/T2/T3/T4 buttons in header) */}
                <div style={{ display: isMobile ? "none" : "flex", flexDirection: "column", gap: 4, padding: "6px 10px", borderTop: "1px solid rgba(255,255,255,0.05)", overflowY: "auto", width: "100%" }}>
                  {Array.from({ length: maxSaved }).map((_, i) => {
                    const st = savedTeams[i];
                    return st ? (
                      <div key={st.id} style={{ borderRadius: 6, background: `${rarityColor}08`, border: `1px solid ${rarityColor}25`, padding: "4px 8px", display: "flex", alignItems: "center", gap: 5 }}>
                        <span style={{ fontSize: 8, fontWeight: 800, color: rarityColor, flexShrink: 0 }}>{st.label}</span>
                        <div style={{ flex: 1, fontSize: 7, color: "rgba(255,255,255,0.4)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {getTeamSlots(league).map(s => st.picks[s]?.name?.split(" ").pop()).filter(Boolean).join(" · ")}
                        </div>
                        <span style={{ fontSize: 9, fontWeight: 900, color: rarityColor, fontFamily: "'DM Mono',monospace", flexShrink: 0 }}>{st.score}</span>
                        <button onClick={() => loadSavedTeam(st)} style={{ fontSize: 7, fontWeight: 700, padding: "2px 5px", borderRadius: 3, border: `1px solid ${rarityColor}40`, background: `${rarityColor}10`, color: rarityColor, cursor: "pointer", fontFamily: "Outfit", flexShrink: 0 }}>{lang === "fr" ? "Charger" : "Load"}</button>
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
              <div className="pro-player-list" style={{ flex: 1, minWidth: 0, maxWidth: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
                {/* Filters */}
                <div className="pro-filters-bar" style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderBottom: "1px solid rgba(255,255,255,0.07)", background: "rgba(0,0,0,0.3)", flexShrink: 0 }}>
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
                  {sorareConnected && (
                    <button onClick={() => setSeasonFilter(v => v === "all" ? "in" : v === "in" ? "off" : "all")} style={{ fontSize: 7, fontWeight: 700, padding: "3px 8px", borderRadius: 6, border: `1px solid ${seasonFilter === "in" ? "rgba(74,222,128,0.5)" : seasonFilter === "off" ? "rgba(139,92,246,0.5)" : "rgba(255,255,255,0.1)"}`, background: seasonFilter === "in" ? "rgba(74,222,128,0.12)" : seasonFilter === "off" ? "rgba(139,92,246,0.12)" : "transparent", color: seasonFilter === "in" ? "#4ADE80" : seasonFilter === "off" ? "#A78BFA" : "rgba(255,255,255,0.3)", cursor: "pointer", fontFamily: "Outfit" }}>
                      {seasonFilter === "in" ? "In-Season" : seasonFilter === "off" ? "Off-Season" : "All Season"}
                    </button>
                  )}
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ fontSize: 7, fontWeight: 700, color: filterTitu ? "#4ADE80" : "rgba(255,255,255,0.3)", fontFamily: "Outfit" }}>
                      Titu {filterTitu > 0 ? `≥${filterTitu}%` : "All"}
                    </span>
                    <div style={{ position: "relative", width: 100 }}>
                      <input type="range" min={0} max={90} step={10} value={filterTitu} onChange={e => setFilterTitu(Number(e.target.value))}
                        style={{ width: 100, height: 4, accentColor: "#4ADE80", cursor: "pointer" }} />
                      <div style={{ display: "flex", justifyContent: "space-between", width: 100, marginTop: -2 }}>
                        {[0,10,20,30,40,50,60,70,80,90].map(v => (
                          <span key={v} style={{ fontSize: 5, color: filterTitu === v ? "#4ADE80" : "rgba(255,255,255,0.15)", fontFamily: "'DM Mono',monospace", cursor: "pointer" }} onClick={() => setFilterTitu(v)}>{v}</span>
                        ))}
                      </div>
                    </div>
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
                    ["ds","D-Score"], ["last5","L5"], ["opp","Adv."], ["titu_s","Titu%"], ["cs","CS%"], ["win","Win%"],
                    ["l2","L2"], ["aa2","AA2"], ["l5","L5"], ["aa5","AA5"],
                    ["l10","L10"], ["dom","DOM"], ["ext","EXT"], ["aa10","AA10"],
                    ["titu","Titu10"], ["reg","Reg10"], ["l40","L40"], ["aa40","AA40"], ["ga","G+A"],
                  ];
                  const GRID = "28px 70px 80px 52px 30px 80px 36px 36px 90px 30px 28px 30px 28px 46px 32px 32px 28px 30px 28px 30px 30px 44px";
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
                          const rowKey = p._cardKey || slug;
                          const inTeam = isInTeam(p);
                          // Position affichee = position CARTE (historique) si dispo, sinon joueur
                          const dispPos = p._card?.cardPosition || p.cardPosition || p.position;
                          const pc = PC[dispPos];
                          const opp = logos[p.oppName];
                          const parisTime = p.kickoff && p.matchDate ? utcToParisTime(p.kickoff, p.matchDate) : "";
                          const ga = (p.goals||0) + (p.assists||0);
                          const ownedCard = p._card || proCardMap[slug];
                          return (
                            <div key={rowKey} onClick={() => !inTeam && addToTeam(p)}
                              style={{ display: "grid", gridTemplateColumns: GRID, alignItems: "center", gap: 2, padding: "4px 8px", borderBottom: "1px solid rgba(255,255,255,0.03)", background: inTeam ? `${rarityColor}12` : "transparent", transition: "background 0.12s", cursor: inTeam ? "default" : "pointer", minWidth: "max-content" }}
                              onMouseEnter={e => { if (!inTeam) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                              onMouseLeave={e => { e.currentTarget.style.background = inTeam ? `${rarityColor}12` : "transparent"; }}
                            >
                              {/* + / check */}
                              <div style={{ width: 20, height: 20, borderRadius: 5, border: `1px solid ${inTeam ? `${rarityColor}40` : "rgba(255,255,255,0.15)"}`, display: "flex", alignItems: "center", justifyContent: "center", color: inTeam ? rarityColor : "rgba(255,255,255,0.5)", fontSize: 13, fontWeight: 700 }}>
                                {inTeam ? "✓" : "+"}
                              </div>
                              {/* Pos + bonus + classic + logo */}
                              <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                                <div style={{ display: "inline-flex", borderRadius: 3, overflow: "hidden", flexShrink: 0 }}>
                                  <span style={{ fontSize: 7, fontWeight: 900, background: pc, color: "#fff", padding: "2px 4px" }}>{dispPos}</span>
                                  {ownedCard && getPowerPct(p) > 0 && <span style={{ fontSize: 7, fontWeight: 900, background: "#166534", color: "#4ADE80", padding: "2px 4px" }}>+{getPowerPct(p)}%</span>}
                                </div>
                                {logos[p.club] && <img src={`/data/logos/${logos[p.club]}`} alt="" style={{ width: 14, height: 14, objectFit: "contain", flexShrink: 0 }} />}
                              </div>
                              {/* Name + OFF badge */}
                              <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 3 }}>
                                <span style={{ fontSize: 10, fontWeight: inTeam ? 700 : 500, color: inTeam ? rarityColor : "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name.split(" ").pop()}</span>
                                {ownedCard && ownedCard.isClassic && <span style={{ fontSize: 6, fontWeight: 900, background: "#5B21B6", color: "#C4B5FD", borderRadius: 2, padding: "1px 3px", flexShrink: 0 }}>OFF</span>}
                              </div>
                              {/* D-Score */}
                              <div style={{ textAlign: "center" }}>
                                <span style={{ display: "inline-block", padding: "3px 7px", borderRadius: 8, fontFamily: "'DM Mono',monospace", fontSize: 14, fontWeight: 700, color: isSilver(getAdjDs(p)) ? "#1a1a2e" : "#fff", background: isSilver(getAdjDs(p)) ? "linear-gradient(90deg,#C0C0C0,#A8E8D0,#B0C4E8,#D4B0E8,#fff,#D4B0E8,#B0C4E8,#A8E8D0,#C0C0C0)" : dsBg(getAdjDs(p)), backgroundSize: isSilver(getAdjDs(p)) ? "200% 100%" : "auto", animation: isSilver(getAdjDs(p)) ? "proShine 3s linear infinite" : "none" }}>{getAdjDs(p)}</span>
                              </div>
                              {/* Last 5 mini histogram */}
                              <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 1, height: 20 }}>
                                {(() => {
                                  const arr = (p.last_5 || []).slice(-5).reverse();
                                  const pad = 5 - arr.length;
                                  return Array.from({ length: 5 }, (_, j) => j < pad ? null : arr[j - pad]).map((v, j) => (
                                    <div key={j} style={{ width: 3, borderRadius: 1, height: v != null && v > 0 ? Math.max(2, (v / 100) * 20) : v === 0 ? 2 : 0, background: v != null && v > 0 ? dc(v) : v === 0 ? "rgba(239,68,68,0.5)" : "transparent", opacity: v != null && v > 0 ? 0.85 : 0.7 }} />
                                  ));
                                })()}
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
                              {/* Titu% Sorare — masque pour GW futures (pas encore publie) */}
                              <div style={{ textAlign: "center" }}>
                                {(gwInfo?.offsetFromLive || 0) <= 1 ? (
                                  <span style={{ fontSize: 10, fontWeight: 600, fontFamily: "Outfit", padding: "2px 5px", borderRadius: 3, color: "#fff",
                                    background: (p.sorare_starter_pct||0) >= 70 ? "linear-gradient(135deg,#166534,#15803d)" : (p.sorare_starter_pct||0) >= 50 ? "linear-gradient(135deg,#854d0e,#a16207)" : p.sorare_starter_pct == null ? "rgba(255,255,255,0.06)" : "linear-gradient(135deg,#991b1b,#b91c1c)",
                                  }}>{p.sorare_starter_pct == null ? "—" : `${p.sorare_starter_pct}%`}</span>
                                ) : (
                                  <span style={{ fontSize: 8, color: "rgba(255,255,255,0.15)" }}>—</span>
                                )}
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
          )}

          {/* ═══ RECAP EQUIPES SAUVEGARDEES — Format Pitch Pro ═══ */}
          {savedTeams.length > 0 && (
            <div style={{ marginTop: builderCollapsed ? 0 : 24, padding: "0 0 20px" }}>
              {!builderCollapsed && (
                <div style={{ fontSize: 13, fontWeight: 900, color: rarityColor, letterSpacing: "0.06em", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                  {t(lang, "proRecap")}
                  <span style={{ fontSize: 9, fontWeight: 600, color: "rgba(255,255,255,0.35)" }}>{savedTeams.length}/{maxSaved} · {LEAGUE_NAMES[league] || league} · {rarity === "rare" ? t(lang, "proRare") : t(lang, "proLimited")} · {gwInfo?.displayNumber ? `GW${gwInfo.displayNumber}` : ""}</span>
                </div>
              )}
              <div className="pro-recap-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 480px))", gap: 10, justifyContent: "center", margin: "0 auto", maxWidth: 980 }}>
                {savedTeams.map((st) => {
                  const stPlayers = getTeamSlots(league).map(s => st.picks[s]).filter(Boolean);
                  const stAdjScores = stPlayers.map(p => getAdjDs(p));
                  const expectedPicks = getExpectedPicks(league);
                  const stCaptain = st.captain && st.picks[st.captain] ? st.picks[st.captain] : (stAdjScores.length === expectedPicks ? stPlayers[stAdjScores.indexOf(Math.max(...stAdjScores))] : null);
                  const stCaptainId = stCaptain ? (stCaptain.slug || stCaptain.name) : null;
                  // Score effectif + flag isLive (match joue ou non)
                  // Captain bonus = RAW × 0.5 (formule Sorare officielle)
                  const getScoreInfo = (p, isCap) => {
                    const fresh = players.find(pl => pl.slug === p.slug);
                    const card = getCard(p);
                    const power = (card?.power && card.power > 1) ? card.power : 1;
                    if (fresh && fresh.last_so5_date === p.matchDate && fresh.last_so5_score != null) {
                      const raw = fresh.last_so5_score;
                      const postBonus = raw * power;
                      const captainBonus = isCap ? raw * 0.5 : 0;
                      return { full: postBonus + captainBonus, isLive: true };
                    }
                    // DNP : match deja joue mais pas de SO5 pour ce joueur -> score reel = 0
                    const todayStrFx = new Date().toISOString().split("T")[0];
                    if (p.matchDate && p.matchDate < todayStrFx) {
                      return { full: 0, isLive: true };
                    }
                    return { full: getFullScore(p, isCap), isLive: false };
                  };
                  const stPlayerInfos = stPlayers.map(p => ({ p, ...getScoreInfo(p, stCaptainId && (p.slug || p.name) === stCaptainId) }));
                  const stFullScores = stPlayerInfos.map(x => x.full);
                  const stLiveScores = stPlayerInfos.filter(x => x.isLive).map(x => x.full);
                  const stClubCounts = {};
                  stPlayers.forEach(p => { stClubCounts[p.club] = (stClubCounts[p.club] || 0) + 1; });
                  const stMultiClub = stPlayers.length === 5 && Object.values(stClubCounts).every(c => c <= 2);
                  const stSumL10 = stPlayers.reduce((s, p) => s + (p.l10 || 0), 0);
                  const stCap260 = stPlayers.length === 5 && stSumL10 < 260;
                  const stCompoPct = (stMultiClub ? 2 : 0) + (stCap260 ? 4 : 0);
                  const stRawTotal = stFullScores.reduce((s, v) => s + v, 0);
                  const stTotal = Math.round(stRawTotal * (1 + stCompoPct / 100));
                  const stBonusPts = Math.round(stRawTotal - stPlayers.reduce((s, p) => s + (p.ds || 0), 0));
                  // LIVE only (matchs joues)
                  const stLiveRaw = stLiveScores.reduce((s, v) => s + v, 0);
                  const stTotalLive = Math.round(stLiveRaw * (1 + stCompoPct / 100));
                  const palSt = paliers.filter(p => stTotal >= p.pts).pop();

                  const renderCard = (slot) => {
                    const raw = st.picks[slot];
                    if (!raw) return null;
                    // Enrich with fresh data from players.json (titu%, injured, last_so5, etc.)
                    const fresh = players.find(pl => pl.slug === raw.slug);
                    const p = fresh ? { ...raw, sorare_starter_pct: fresh.sorare_starter_pct, injured: fresh.injured, suspended: fresh.suspended, last_so5_score: fresh.last_so5_score, last_so5_date: fresh.last_so5_date, last_match_home_goals: fresh.last_match_home_goals, last_match_away_goals: fresh.last_match_away_goals, last_match_status: fresh.last_match_status, last_so5_decisives: fresh.last_so5_decisives } : raw;
                    const pc = PC[p.position];
                    const ownedCard = getCard(p);
                    const oppLogo = logos[p.oppName];
                    const playerClubLogo = logos[p.club];
                    const isCap = stCaptainId && (p.slug || p.name) === stCaptainId;
                    const predictedScore = Math.round(getFullScore(p, false));
                    const bonusPct = getPowerPct(p);
                    const parisTime = p.kickoff && p.matchDate ? utcToParisTime(p.kickoff, p.matchDate) : "";
                    const dateLabel = p.matchDate ? new Date(p.matchDate + "T12:00:00").toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US", { timeZone: TZ, weekday: "short", day: "numeric" }).toUpperCase().replace(".", "") : "";
                    // Score affiche par carte = RAW score (comme Sorare), bonus appliques au total uniquement.
                    const hasRealScore = p.last_so5_date && p.matchDate && p.last_so5_date === p.matchDate && p.last_so5_score != null && p.last_match_status !== "scheduled";
                    // Detection "match joue" via la presence d'au moins un co-equipier ayant une SO5 a cette date
                    // (plus robuste que comparer la date a 'aujourd'hui UTC' qui casse entre 22h-02h Paris)
                    const matchWasPlayed = p.matchDate && p.club && (players || []).some(pl =>
                      pl.club === p.club && pl.last_so5_date === p.matchDate && pl.last_match_home_goals != null && pl.last_match_status !== "scheduled"
                    );
                    // DNP = match deja joue mais pas de SO5 pour le joueur (blesse, banc, absent)
                    const isDNP = matchWasPlayed && !hasRealScore;
                    const rawRealScore = hasRealScore ? p.last_so5_score : null;
                    // Score affiche en bulle : FLOOR pour matcher Sorare (74.7 -> 74)
                    const playerScore = hasRealScore ? Math.floor(rawRealScore) : isDNP ? 0 : Math.round(p.ds || 0);
                    // Captain bonus = RAW × 0.5 (formule Sorare officielle)
                    const capBase = hasRealScore ? rawRealScore : isDNP ? 0 : (p.ds || 0);
                    const captainBonusPts = isCap ? Math.round(capBase * 0.5) : 0;
                    // Score du match : depuis le joueur lui-meme si SO5 OK, sinon depuis un co-equipier fetche (cas DNP)
                    let matchScore = hasRealScore && p.last_match_home_goals != null && p.last_match_away_goals != null
                      ? `${p.last_match_home_goals} - ${p.last_match_away_goals}`
                      : null;
                    if (!matchScore && isDNP && p.club && p.matchDate) {
                      const mate = players.find(pl => pl.club === p.club && pl.last_so5_date === p.matchDate && pl.last_match_home_goals != null && pl.last_match_status !== "scheduled");
                      if (mate) matchScore = `${mate.last_match_home_goals} - ${mate.last_match_away_goals}`;
                    }
                    // Logos dans l'ordre home -> away (independant du player)
                    const recapHomeLogo = p.isHome ? playerClubLogo : oppLogo;
                    const recapAwayLogo = p.isHome ? oppLogo : playerClubLogo;
                    return (
                      <div key={slot} style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1, minWidth: 0, maxWidth: league === "Champion" ? 78 : 120 }}>
                        <div className={`card-premium${rarity === "rare" ? " card-premium--silver" : ""}`}>
                        <div className="card-premium__inner" style={{
                          background: ownedCard ? "transparent" : `linear-gradient(155deg, rgba(8,4,28,0.9), ${pc}25)`,
                        }}>
                        <div className="card-premium__highlight" />
                        <div className="card-premium__edge-shine" />
                          {ownedCard ? (
                            <img src={ownedCard.pictureUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                          ) : (
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 2 }}>
                              {playerClubLogo && <img src={`/data/logos/${playerClubLogo}`} alt="" style={{ width: 16, height: 16, objectFit: "contain" }} />}
                              <span style={{ fontSize: 6, fontWeight: 800, color: pc }}>{slot}</span>
                            </div>
                          )}
                          {p.sorare_starter_pct != null && !hasRealScore && !isDNP && (
                            <span style={{ position: "absolute", top: 2, right: 2, fontSize: 7, fontWeight: 700, padding: "1px 3px", borderRadius: 3, color: "#fff", zIndex: 2,
                              background: p.sorare_starter_pct >= 70 ? "rgba(22,101,52,0.9)" : p.sorare_starter_pct >= 50 ? "rgba(133,77,14,0.9)" : "rgba(153,27,27,0.9)",
                            }}>{p.sorare_starter_pct}%</span>
                          )}
                          {isDNP && <span style={{ position: "absolute", top: 2, right: 2, fontSize: 7, fontWeight: 800, padding: "1px 4px", borderRadius: 3, color: "#fff", zIndex: 2, background: "rgba(153,27,27,0.95)", letterSpacing: "0.5px" }}>DNP</span>}
                          {ownedCard?.isClassic && <span style={{ position: "absolute", top: 2, left: 2, fontSize: 4, fontWeight: 900, color: "#fff", background: "rgba(139,92,246,0.8)", borderRadius: 2, padding: "0px 2px", zIndex: 2 }}>CLASSIC</span>}
                          {/* Decisives : ballon dans cercle gold/silver selon rarity, deborde sur le bord bas */}
                          {hasRealScore && (() => {
                            const icons = flattenDecisivesPositive(p.last_so5_decisives, 3);
                            if (icons.length === 0) return null;
                            const size = icons.length === 1 ? 22 : icons.length === 2 ? 26 : 30;
                            const isRare = rarity === "rare";
                            const ringColor = isRare ? "#E5E7EB" : "#FFD700";
                            const ringGlow = isRare ? "229,231,235" : "255,215,0";
                            const innerBg = isRare
                              ? "radial-gradient(circle at 35% 30%, #1A1A1F 0%, #0A0A0E 100%)"
                              : "radial-gradient(circle at 35% 30%, #2A1A00 0%, #0D0700 100%)";
                            return (
                              <div style={{
                                position: "absolute", bottom: 0, left: "50%", transform: "translate(-50%, 50%)",
                                zIndex: 4,
                                width: size, height: size, borderRadius: "50%",
                                background: innerBg,
                                border: `1.5px solid ${ringColor}`,
                                boxShadow: `0 0 10px rgba(${ringGlow},0.8), inset 0 0 4px rgba(${ringGlow},0.35)`,
                                display: "flex", alignItems: "center", justifyContent: "center", gap: 0,
                                fontSize: icons.length === 1 ? 12 : icons.length === 2 ? 10 : 9,
                                lineHeight: 1,
                                filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.8))",
                              }}>
                                {icons.map((emoji, i) => <span key={i} style={{ display: "inline-block", transform: emoji === "👟" ? "translateY(-1.5px)" : "none", lineHeight: 1 }}>{emoji}</span>)}
                              </div>
                            );
                          })()}
                          {/* Top-right : Captain a gauche du bonus (flex row-reverse) — theme rouge pour Rare, gold pour Limited */}
                          {(isCap || bonusPct > 0) && (() => {
                            const isRareBonus = rarity === "rare";
                            return (
                              <div style={{
                                position: "absolute", top: 2, right: 2, zIndex: 3,
                                display: "flex", flexDirection: "row-reverse", alignItems: "center", gap: 2,
                              }}>
                                {bonusPct > 0 && (
                                  <span style={{
                                    fontSize: 7, fontWeight: 700,
                                    color: isRareBonus ? "#7F1D1D" : "#fff",
                                    fontFamily: "Outfit", letterSpacing: "0.04em",
                                    background: isRareBonus
                                      ? "linear-gradient(135deg, #FECACA 0%, #FCA5A5 50%, #F87171 100%)"
                                      : "linear-gradient(135deg, #FFE066 0%, #FFD700 50%, #DAA520 100%)",
                                    border: "1px solid rgba(255,255,255,0.5)",
                                    borderRadius: 3,
                                    padding: "1px 3px",
                                    boxShadow: isRareBonus
                                      ? "0 0 6px rgba(248,113,113,0.55), inset 0 1px 0 rgba(255,255,255,0.6)"
                                      : "0 0 6px rgba(255,215,0,0.5), inset 0 1px 0 rgba(255,255,255,0.4)",
                                    textShadow: isRareBonus
                                      ? "0 1px 0 rgba(255,255,255,0.4)"
                                      : "0 1px 1px rgba(0,0,0,0.5)",
                                    whiteSpace: "nowrap", lineHeight: 1,
                                  }}>+{bonusPct}%</span>
                                )}
                                {isCap && (
                                  <span style={{
                                    width: 12, height: 12, borderRadius: "50%",
                                    background: isRareBonus ? "#DC2626" : "#FBBF24",
                                    color: isRareBonus ? "#fff" : "#000",
                                    fontSize: 7, fontWeight: 900,
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    flexShrink: 0,
                                    boxShadow: isRareBonus ? "0 0 5px rgba(220,38,38,0.6)" : "none",
                                  }}>C</span>
                                )}
                              </div>
                            );
                          })()}
                          {/* Score : bottom-right card — TEST 3 formes : L1+Limited=rect, PL+Limited=cercle, sinon hex */}
                          {hasRealScore ? (
                            (league === "L1" && rarity === "limited") ? (
                              <div className="rect-premium" style={{ position: "absolute", bottom: 0, right: 0, zIndex: 3 }}>
                                <div className="rect-premium__outer">
                                  <div className="rect-premium__inner-wrapper">
                                    <div className="rect-premium__inner" style={{ background: dsBg(playerScore) }} />
                                    <div className="rect-premium__highlight" />
                                    <div className="rect-premium__edge-shine" />
                                  </div>
                                </div>
                                <div className="rect-premium__score">{playerScore}</div>
                              </div>
                            ) : (league === "PL" && rarity === "limited") ? (
                              <div className="circle-premium" style={{ position: "absolute", bottom: 0, right: 0, zIndex: 3 }}>
                                <div className="circle-premium__outer">
                                  <div className="circle-premium__inner-wrapper">
                                    <div className="circle-premium__inner" style={{ background: dsBg(playerScore) }} />
                                    <div className="circle-premium__highlight" />
                                    <div className="circle-premium__edge-shine" />
                                  </div>
                                </div>
                                <div className="circle-premium__score">{playerScore}</div>
                              </div>
                            ) : (
                            <div className={`hex-premium${rarity === "rare" ? " hex-premium--silver" : ""}`} style={{ position: "absolute", bottom: 0, right: -2, zIndex: 3 }}>
                              <div className="hex-premium__outer">
                                <div className="hex-premium__inner-wrapper">
                                  <div className="hex-premium__inner" style={{ background: dsBg(playerScore) }} />
                                  <div className="hex-premium__highlight" />
                                  <div className="hex-premium__glass-reflection" />
                                  <div className="hex-premium__edge-shine" />
                                </div>
                              </div>
                              <div className="hex-premium__score">{playerScore}</div>
                            </div>
                            )
                          ) : (
                            <div style={{
                              position: "absolute", bottom: 0, right: -2, zIndex: 3,
                              width: 32, height: 32, borderRadius: "50%",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              fontFamily: "'DM Mono',monospace", fontSize: 13, fontWeight: 900,
                              color: isDNP ? "#fff" : dsColor(playerScore),
                              background: isDNP ? "rgba(127,29,29,0.9)" : "rgba(0,0,0,0.6)",
                              border: isDNP ? "1px solid rgba(220,38,38,0.8)" : `1px dashed ${dsColor(playerScore)}60`,
                              boxShadow: isDNP ? "0 0 6px rgba(220,38,38,0.4)" : `0 0 6px ${dsColor(playerScore)}30`,
                            }}>{playerScore}</div>
                          )}
                        </div>
                        </div>
                        {/* Match info box : premium gold avec bevel + reflets si match joue, neutre sinon */}
                        {matchScore ? (
                          <div className={`matchscore-premium${rarity === "rare" ? " matchscore-premium--silver" : ""}`}>
                            <div className="matchscore-premium__inner">
                              <div className="matchscore-premium__highlight" />
                              <div className="matchscore-premium__edge-shine" />
                              <div className="matchscore-premium__content">
                                <span className="matchscore-premium__sparkle">✦</span>
                                {recapHomeLogo && <img src={`/data/logos/${recapHomeLogo}`} alt="" style={{ width: 14, height: 14, objectFit: "contain", flexShrink: 0 }} />}
                                <span className="matchscore-premium__score-text">{matchScore}</span>
                                {recapAwayLogo && <img src={`/data/logos/${recapAwayLogo}`} alt="" style={{ width: 14, height: 14, objectFit: "contain", flexShrink: 0 }} />}
                                <span className="matchscore-premium__sparkle">✦</span>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div style={{ marginTop: 6, padding: "3px 8px", borderRadius: 6, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", textAlign: "center" }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, flexWrap: "nowrap" }}>
                              {recapHomeLogo && <img src={`/data/logos/${recapHomeLogo}`} alt="" style={{ width: 14, height: 14, objectFit: "contain", flexShrink: 0 }} />}
                              <span style={{ fontSize: 7, color: "rgba(255,255,255,0.25)" }}>vs</span>
                              {recapAwayLogo && <img src={`/data/logos/${recapAwayLogo}`} alt="" style={{ width: 14, height: 14, objectFit: "contain", flexShrink: 0 }} />}
                            </div>
                            <div style={{ fontSize: 7, fontWeight: 700, color: "#fff", fontFamily: "'DM Mono',monospace", marginTop: 1 }}>
                              {dateLabel} - {parisTime}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  };

                  return (
                    <div key={st.id} style={{ borderRadius: 12, background: "linear-gradient(160deg, rgba(10,5,30,0.95), rgba(20,10,50,0.9))", border: `1px solid ${rarityColor}25`, padding: "10px 10px", backdropFilter: "blur(8px)", display: "flex", gap: 12 }}>
                      {/* Colonne gauche : header + pitch */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontSize: 12, fontWeight: 900, color: rarityColor }}>{st.label}</span>
                            <button onClick={() => loadSavedTeam(st)} style={{ fontSize: 7, fontWeight: 700, padding: "2px 6px", borderRadius: 4, border: `1px solid ${rarityColor}40`, background: `${rarityColor}10`, color: rarityColor, cursor: "pointer", fontFamily: "Outfit" }}>{lang === "fr" ? "Charger" : "Load"}</button>
                            <button onClick={() => deleteSavedTeam(st.id)} style={{ fontSize: 8, padding: "2px 5px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.3)", cursor: "pointer" }}>x</button>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            {stCap260 && <span style={{ fontSize: 8, fontWeight: 800, padding: "2px 5px", borderRadius: 3, border: "1px solid rgba(139,92,246,0.5)", color: "#A78BFA", background: "rgba(139,92,246,0.1)" }}>CAP</span>}
                          </div>
                        </div>
                        {/* Pitch layout : ATT+FLEX en haut, DEF(s)+GK+MIL(s) en bas. Champion = 7 slots. */}
                        <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "center" }}>
                          {league === "Champion" ? (
                            <>
                              <div style={{ display: "flex", gap: 5, justifyContent: "center", width: "100%" }}>
                                {renderCard("MIL1")}
                                {renderCard("ATT")}
                                {renderCard("FLEX")}
                                {renderCard("MIL2")}
                              </div>
                              <div style={{ display: "flex", gap: 5, justifyContent: "center", width: "100%" }}>
                                {renderCard("DEF1")}
                                {renderCard("GK")}
                                {renderCard("DEF2")}
                              </div>
                            </>
                          ) : (
                            <>
                              <div style={{ display: "flex", gap: 6, justifyContent: "center", width: "100%" }}>
                                {renderCard("ATT")}
                                {renderCard("FLEX")}
                              </div>
                              <div style={{ display: "flex", gap: 6, justifyContent: "center", width: "100%" }}>
                                {renderCard("DEF")}
                                {renderCard("GK")}
                                {renderCard("MIL")}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                      {/* Skyrocket Gauge a droite — LIVE + projection + initial + rewards en fond.
                          Pro Limited : top reward (1000$) en gold. Pro Rare : top reward (4000$) en rouge sang. Rare = +10% sur tous les seuils. */}
                      <SkyrocketGauge
                        score={stTotalLive}
                        projectedScore={stTotal}
                        initialScore={st.score}
                        paliers={paliers}
                        showRewards={league !== "Champion"}
                        scaleMode={league === "Champion" ? "linear" : "control-points"}
                        maxPos={league === "Champion" ? 100 : 90}
                        scoreMultiplier={league === "Champion" ? 1.0 : (rarity === "rare" ? 1.10 : 1.0)}
                        topRewardColor={league === "Champion" ? null : (rarity === "rare" ? "#DC2626" : "#FBBF24")}
                        rarity={rarity}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
