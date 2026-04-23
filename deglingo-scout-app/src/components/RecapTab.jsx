import { Component, useEffect, useMemo, useState } from "react";
import { LEAGUE_COLORS, LEAGUE_NAMES, LEAGUE_FLAG_CODES, dsColor } from "../utils/colors";
import { fetchCloudStore, pushTeams } from "../utils/cloudSync";
import { PRO_LEAGUES, computeTeamScores, getGwDisplayNumber } from "../utils/proScoring";
import { t } from "../utils/i18n";
import ProSavedTeamCard from "./ProSavedTeamCard";
import StellarSavedTeamCard from "./StellarSavedTeamCard";

class RecapErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err, info) { console.error("[RecapTab]", err, info); }
  render() {
    if (this.state.err) {
      return (
        <div style={{ padding: 30, textAlign: "center", color: "#F87171", fontFamily: "Outfit" }}>
          <div style={{ fontSize: 14, fontWeight: 800 }}>Erreur d'affichage Mes Teams</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 6, maxWidth: 600, margin: "6px auto 0" }}>
            {String(this.state.err?.message || this.state.err)}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const RARITY_COLOR = { limited: "#60A5FA", rare: "#F472B6", stellar: "#C4B5FD" };

function formatScore(s) {
  if (s == null || Number.isNaN(s)) return "—";
  return Math.round(Number(s));
}

/**
 * Regroupe les teams par (rarete, ligue, gwKey). Retourne pour chaque rarete une liste plate
 * de sections ordonnees par GW desc puis ligue, chaque section contenant les teams de ce (ligue, GW).
 *
 * Retourne : { limited: [{league, gwKey, teams}], rare: [...] }
 */
function groupTeamsByLeague(store) {
  const result = { limited: [], rare: [] };
  const d = store?.data || {};
  ["proLimited", "proRare"].forEach(bucket => {
    const rarity = bucket === "proRare" ? "rare" : "limited";
    const leagues = d[bucket] || {};
    const sections = [];
    Object.entries(leagues).forEach(([league, gwBuckets]) => {
      if (!PRO_LEAGUES.includes(league)) return;
      Object.entries(gwBuckets || {}).forEach(([gwKey, list]) => {
        if (!Array.isArray(list) || list.length === 0) return;
        sections.push({ league, gwKey, teams: list.filter(Boolean) });
      });
    });
    // Sort : GW plus recent d'abord, puis ligue par ordre PRO_LEAGUES
    sections.sort((a, b) => {
      if (a.gwKey !== b.gwKey) return b.gwKey.localeCompare(a.gwKey);
      return PRO_LEAGUES.indexOf(a.league) - PRO_LEAGUES.indexOf(b.league);
    });
    result[rarity] = sections;
  });
  return result;
}

/**
 * Lit le cache des cartes Sorare (posé par SorareProTab via /api/sorare/cards)
 * et construit { limited: { slug: [cards sorted by power desc] }, rare: { ... } }
 */
function buildCardsBySlugFromCache() {
  const empty = { limited: {}, rare: {} };
  try {
    const raw = localStorage.getItem("pro_cards_cache");
    if (!raw) return empty;
    const cards = JSON.parse(raw);
    if (!Array.isArray(cards)) return empty;
    const out = { limited: {}, rare: {} };
    for (const c of cards) {
      if (!c || c.isStellar) continue;
      const slug = c.playerSlug;
      if (!slug) continue;
      if (c.isLimited) {
        if (!out.limited[slug]) out.limited[slug] = [];
        out.limited[slug].push(c);
      }
      if (c.isRare) {
        if (!out.rare[slug]) out.rare[slug] = [];
        out.rare[slug].push(c);
      }
    }
    for (const r of ["limited", "rare"]) {
      for (const slug in out[r]) {
        out[r][slug].sort((a, b) => (b.power || 1) - (a.power || 1));
      }
    }
    return out;
  } catch {
    return empty;
  }
}

/**
 * Lit le cache Stellar (posé par StellarTab dans sessionStorage) et construit
 * { slug: meilleure carte Stellar possédée } — trié par totalBonus desc.
 */
function buildStellarCardsBySlug() {
  const out = {};
  try {
    const raw = sessionStorage.getItem("sorare_cards_cache");
    if (!raw) return out;
    const parsed = JSON.parse(raw);
    const cards = Array.isArray(parsed?.cards) ? parsed.cards : (Array.isArray(parsed) ? parsed : []);
    for (const c of cards) {
      if (!c || !c.isStellar) continue;
      const slug = c.playerSlug;
      if (!slug) continue;
      if (!out[slug] || (c.totalBonus || 0) > (out[slug].totalBonus || 0)) {
        out[slug] = c;
      }
    }
  } catch { /* ignore */ }
  return out;
}

/**
 * Lit le cache Stellar et construit { cardSlug: carte } pour retrouver une carte
 * specifique (ex: Pedri Base vs Pedri Shiny). Utilise en priorite dans les renders
 * saved teams via pick._cardSlug (stocke au pick en mode "Mes cartes").
 */
function buildStellarCardsByCardSlug() {
  const out = {};
  try {
    const raw = sessionStorage.getItem("sorare_cards_cache");
    if (!raw) return out;
    const parsed = JSON.parse(raw);
    const cards = Array.isArray(parsed?.cards) ? parsed.cards : (Array.isArray(parsed) ? parsed : []);
    for (const c of cards) {
      if (!c || !c.isStellar) continue;
      if (c.cardSlug) out[c.cardSlug] = c;
    }
  } catch { /* ignore */ }
  return out;
}

/**
 * Regroupe les teams Stellar par date (plus récente en premier).
 * Retourne : [{ dateStr, teams: [...] }, ...]
 */
function groupStellarByDate(store) {
  const stellar = store?.data?.stellar || {};
  const entries = Object.entries(stellar).filter(([, v]) => Array.isArray(v) && v.length > 0);
  entries.sort(([a], [b]) => b.localeCompare(a));
  return entries.map(([dateStr, teams]) => ({ dateStr, teams }));
}

function formatStellarDate(dateStr, lang) {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr + "T12:00:00");
    return d.toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US", {
      timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long",
    });
  } catch { return dateStr; }
}

function computeStellarProjected(team, players, stellarCardsBySlug, stellarCardsByCardSlug) {
  if (!team?.picks) return 0;
  const POS = ["GK", "DEF", "MIL", "ATT", "FLEX"];
  const todayStrFx = new Date().toISOString().split("T")[0];
  const picks = POS.map(s => team.picks[s]).filter(Boolean);
  const data = picks.map(p => {
    const fresh = players.find(pl => pl.slug === p.slug);
    // Carte exacte via _cardSlug (Pedri Base vs Pedri Shiny), fallback best
    const owned = (p._cardSlug && stellarCardsByCardSlug?.[p._cardSlug])
      || stellarCardsBySlug[p.slug || p.name];
    const bonusPct = (owned && owned.totalBonus > 0) ? owned.totalBonus : 0;
    const mult = 1 + bonusPct / 100;
    const hasReal = fresh && fresh.last_so5_date === p.matchDate && fresh.last_so5_score != null;
    const matchIsPast = p.matchDate && p.matchDate < todayStrFx;
    let raw;
    if (hasReal) raw = fresh.last_so5_score;
    else if (matchIsPast) raw = 0; // DNP
    else raw = p.ds || 0;
    return { p, rawScore: raw, postBonus: raw * mult };
  });
  let cap = data.find(x => x.p.isCaptain);
  if (!cap && team.captain && team.picks[team.captain]) {
    const cp = team.picks[team.captain];
    cap = data.find(x => (x.p.slug || x.p.name) === (cp.slug || cp.name));
  }
  if (!cap && data.length === 5) {
    cap = data.reduce((best, x) => x.postBonus > best.postBonus ? x : best, data[0]);
  }
  const sum = data.reduce((s, x) => s + x.postBonus, 0);
  // Captain bonus = RAW × 0.5 (formule Sorare officielle)
  const capBonus = cap ? (cap.rawScore != null ? cap.rawScore : (cap.p.ds || 0)) * 0.5 : 0;
  return Math.round(sum + capBonus);
}

/**
 * Migration legacy : pour chaque pick sans `_card`, assigne la meilleure carte
 * du joueur trouvee dans le cache Sorare. Necessaire pour les teams sauvegardees
 * avant que `_card` ne soit stocke a la sauvegarde.
 */
function enrichTeamWithBestCards(team, cardsBySlug) {
  if (!team?.picks || !cardsBySlug) return team;
  const picks = {};
  let changed = false;
  for (const slot of Object.keys(team.picks)) {
    const pick = team.picks[slot];
    if (!pick || pick._card) { picks[slot] = pick; continue; }
    const slug = pick.slug || pick.name;
    const candidates = slug ? (cardsBySlug[slug] || []) : [];
    if (candidates.length > 0) {
      picks[slot] = { ...pick, _card: candidates[0], _cardKey: pick._cardKey || `${slug}_0` };
      changed = true;
    } else {
      picks[slot] = pick;
    }
  }
  return changed ? { ...team, picks } : team;
}

function RecapTabInner({ players, logos, lang }) {
  const [store, setStore] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Filtre primaire : "stellar" ou une ligue Pro ("L1", "PL", "Liga", "Bundes", "MLS")
  const [activeLeague, setActiveLeague] = useState("stellar");
  // Sous-filtre rareté (utilisé uniquement si activeLeague != "stellar")
  const [activeRarity, setActiveRarity] = useState("limited");
  // Par défaut : toutes les ligues qui ont au moins une team sont ouvertes.
  const [openLeagues, setOpenLeagues] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const token = localStorage.getItem("sorare_access_token");
    if (!token) { setLoading(false); setError("not_connected"); return; }
    fetchCloudStore().then(res => {
      if (cancelled) return;
      if (!res) { setError("fetch_failed"); setLoading(false); return; }
      setStore(res); setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const cardsBySlug = useMemo(() => buildCardsBySlugFromCache(), [store]);
  const stellarCardsBySlug = useMemo(() => buildStellarCardsBySlug(), [store]);
  const stellarCardsByCardSlug = useMemo(() => buildStellarCardsByCardSlug(), [store]);

  const grouped = useMemo(() => store ? groupTeamsByLeague(store) : null, [store]);
  const stellarGroups = useMemo(() => store ? groupStellarByDate(store) : [], [store]);

  const stats = useMemo(() => {
    if (!grouped) return null;
    const compute = (rarity) => {
      let count = 0, sum = 0;
      grouped[rarity].forEach(({ teams }) => {
        teams.forEach(team => {
          count++;
          const enriched = enrichTeamWithBestCards(team, cardsBySlug[rarity]);
          const { projectedTotal } = computeTeamScores(enriched, players || []);
          sum += projectedTotal || 0;
        });
      });
      return { count, sum };
    };
    const computeStellar = () => {
      let count = 0, sum = 0;
      stellarGroups.forEach(({ teams }) => {
        teams.forEach(team => {
          count++;
          sum += computeStellarProjected(team, players || [], stellarCardsBySlug, stellarCardsByCardSlug) || 0;
        });
      });
      return { count, sum };
    };
    return {
      limited: compute("limited"),
      rare: compute("rare"),
      stellar: computeStellar(),
    };
  }, [grouped, stellarGroups, players, cardsBySlug, stellarCardsBySlug]);

  // Initialise openLeagues une fois : ouvre toutes les sections (GW, dates) non vides.
  useEffect(() => {
    if (!stats || !grouped || openLeagues !== null) return;
    const init = {};
    ["limited", "rare"].forEach(r => {
      grouped[r].forEach(({ league, gwKey }) => { init[`${r}_${league}_${gwKey}`] = true; });
    });
    stellarGroups.forEach(({ dateStr }) => { init[`stellar_${dateStr}`] = true; });
    setOpenLeagues(init);
  }, [stats, grouped, openLeagues, stellarGroups]);

  // Compteurs par ligue Pro (toutes raretés) et par ligue+rareté.
  // Doit être AVANT les early returns pour respecter l'ordre des hooks.
  const proLeagueCounts = useMemo(() => {
    const out = {};
    PRO_LEAGUES.forEach(lg => { out[lg] = { limited: 0, rare: 0, total: 0 }; });
    if (grouped) {
      ["limited", "rare"].forEach(r => {
        grouped[r].forEach(({ league, teams }) => {
          if (!out[league]) return;
          out[league][r] += teams.length;
          out[league].total += teams.length;
        });
      });
    }
    return out;
  }, [grouped]);

  const toggleLeague = (key) => {
    setOpenLeagues(prev => ({ ...(prev || {}), [key]: !prev?.[key] }));
  };

  // ── Suppression d'une team Pro (ligue, GW, teamId) ─────────────────────────
  const deletePro = (rarity, league, gwKey, teamId) => {
    if (!store) return;
    const bucket = rarity === "rare" ? "proRare" : "proLimited";
    const current = store.data?.[bucket]?.[league]?.[gwKey] || [];
    const updated = current.filter(t => t && t.id !== teamId);
    // Met a jour le store local (optimiste)
    const newStore = JSON.parse(JSON.stringify(store));
    if (!newStore.data[bucket]) newStore.data[bucket] = {};
    if (!newStore.data[bucket][league]) newStore.data[bucket][league] = {};
    newStore.data[bucket][league][gwKey] = updated;
    setStore(newStore);
    // Push vers KV
    pushTeams("pro", { league, rarity, gwKey }, updated);
    // Nettoie aussi le localStorage local au cas ou
    try { localStorage.setItem(`pro_saved_${league}_${rarity}_${gwKey}`, JSON.stringify(updated)); } catch (_e) { void 0; }
  };

  // ── Suppression d'une team Stellar (date, teamId) ──────────────────────────
  const deleteStellar = (dateStr, teamId) => {
    if (!store) return;
    const current = store.data?.stellar?.[dateStr] || [];
    const updated = current.filter(t => t && t.id !== teamId);
    const newStore = JSON.parse(JSON.stringify(store));
    if (!newStore.data.stellar) newStore.data.stellar = {};
    newStore.data.stellar[dateStr] = updated;
    setStore(newStore);
    pushTeams("stellar", { dateStr }, updated);
    try { localStorage.setItem(`stellar_saved_teams_${dateStr}`, JSON.stringify(updated)); } catch (_e) { void 0; }
  };

  // ── Suppression bulk : toute une section (ligue+GW) Pro d'un coup ──────────
  const deleteProSection = (rarity, league, gwKey, gwNum, count) => {
    const msg = lang === "fr"
      ? `Supprimer les ${count} équipe${count > 1 ? "s" : ""} de ${league} GW${gwNum || "?"} ?`
      : `Delete the ${count} team${count > 1 ? "s" : ""} from ${league} GW${gwNum || "?"}?`;
    if (!window.confirm(msg)) return;
    if (!store) return;
    const bucket = rarity === "rare" ? "proRare" : "proLimited";
    const newStore = JSON.parse(JSON.stringify(store));
    if (newStore.data[bucket]?.[league]?.[gwKey]) {
      delete newStore.data[bucket][league][gwKey];
    }
    setStore(newStore);
    pushTeams("pro", { league, rarity, gwKey }, []);
    try { localStorage.removeItem(`pro_saved_${league}_${rarity}_${gwKey}`); } catch (_e) { void 0; }
  };

  // ── Suppression bulk : toute une date Stellar d'un coup ────────────────────
  const deleteStellarSection = (dateStr, count) => {
    const msg = lang === "fr"
      ? `Supprimer les ${count} équipe${count > 1 ? "s" : ""} Stellar du ${dateStr} ?`
      : `Delete the ${count} Stellar team${count > 1 ? "s" : ""} from ${dateStr}?`;
    if (!window.confirm(msg)) return;
    if (!store) return;
    const newStore = JSON.parse(JSON.stringify(store));
    if (newStore.data.stellar?.[dateStr]) {
      delete newStore.data.stellar[dateStr];
    }
    setStore(newStore);
    pushTeams("stellar", { dateStr }, []);
    try { localStorage.removeItem(`stellar_saved_teams_${dateStr}`); } catch (_e) { void 0; }
  };

  if (loading) {
    return <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.4)", fontFamily: "Outfit" }}>{t(lang, "loading") || "Chargement…"}</div>;
  }
  if (error === "not_connected") {
    return (
      <div style={{ padding: "40px 20px", textAlign: "center", color: "rgba(255,255,255,0.6)", fontFamily: "Outfit", maxWidth: 600, margin: "0 auto" }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
        <div style={{ fontSize: 16, fontWeight: 800, color: "#fff", marginBottom: 6 }}>
          {lang === "fr" ? "Connecte-toi à Sorare" : "Connect to Sorare"}
        </div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
          {lang === "fr"
            ? "Mes Teams centralise tes équipes Pro Limited et Pro Rare sauvegardées sur tous tes appareils. Va dans l'onglet Sorare Pro pour te connecter."
            : "My Teams centralizes your saved Pro Limited and Pro Rare teams across all devices. Go to Sorare Pro tab to connect."}
        </div>
      </div>
    );
  }
  if (error === "fetch_failed" || !store) {
    return <div style={{ padding: 40, textAlign: "center", color: "#F87171", fontFamily: "Outfit" }}>{lang === "fr" ? "Impossible de charger le cloud." : "Cloud unavailable."}</div>;
  }

  const isStellarActive = activeLeague === "stellar";
  const activeStats = isStellarActive ? stats?.stellar : stats?.[activeRarity];
  const totalCount = (stats?.limited.count || 0) + (stats?.rare.count || 0) + (stats?.stellar.count || 0);
  const totalSum = (stats?.limited.sum || 0) + (stats?.rare.sum || 0) + (stats?.stellar.sum || 0);
  const avgScore = totalCount > 0 ? totalSum / totalCount : 0;
  const hasAny = totalCount > 0;
  const rColor = RARITY_COLOR[activeRarity];

  const d = store.data || {};
  const lastSync = d._updatedAt;

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", padding: "12px 16px", fontFamily: "Outfit" }}>
      {/* Bandeau user */}
      <div style={{
        background: "linear-gradient(135deg, rgba(99,102,241,0.15), rgba(168,85,247,0.12))",
        border: "1px solid rgba(168,85,247,0.25)", borderRadius: 14, padding: "14px 18px",
        display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12,
      }}>
        <div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 2 }}>
            {lang === "fr" ? "Mes Teams · Recap centralisé" : "My Teams · Central Recap"}
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#fff" }}>{store.slug}</div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>
            {lastSync ? `${lang === "fr" ? "Dernière synchro" : "Last sync"}: ${new Date(lastSync).toLocaleString(lang === "fr" ? "fr-FR" : "en-US")}` : (lang === "fr" ? "Aucune synchro encore" : "No sync yet")}
          </div>
        </div>
        {stats && (
          <div style={{ display: "flex", gap: 14 }}>
            <div style={{ textAlign: "center", minWidth: 70 }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: "#fff" }}>{totalCount}</div>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.45)", letterSpacing: 1 }}>{lang === "fr" ? "ÉQUIPES" : "TEAMS"}</div>
            </div>
            <div style={{ textAlign: "center", minWidth: 90 }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: dsColor(avgScore) }}>
                {formatScore(avgScore)}
              </div>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.45)", letterSpacing: 1 }}>{lang === "fr" ? "SCORE MOY." : "AVG SCORE"}</div>
            </div>
            <div style={{ textAlign: "center", minWidth: 90 }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: "#E9D5FF" }}>{formatScore(totalSum)}</div>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.45)", letterSpacing: 1 }}>TOTAL</div>
            </div>
          </div>
        )}
      </div>

      {!hasAny && (
        <div style={{ marginTop: 30, textAlign: "center", color: "rgba(255,255,255,0.5)" }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>📋</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 4 }}>
            {lang === "fr" ? "Aucune équipe sauvegardée pour l'instant" : "No saved teams yet"}
          </div>
          <div style={{ fontSize: 11 }}>
            {lang === "fr" ? "Construis tes équipes dans l'onglet Sorare Pro, elles apparaîtront ici." : "Build your teams in Sorare Pro tab, they'll show up here."}
          </div>
        </div>
      )}

      {hasAny && (
        <>
          {/* Ligne 1 — filtre principal : [Stellar] + ligues Pro */}
          <div style={{ display: "flex", gap: 8, marginTop: 18, marginBottom: 8, flexWrap: "wrap" }}>
            <button key="stellar" onClick={() => setActiveLeague("stellar")} style={{
              padding: "8px 16px", borderRadius: 10, fontSize: 12, fontWeight: 800, fontFamily: "Outfit",
              cursor: "pointer", border: "1px solid " + (isStellarActive ? RARITY_COLOR.stellar + "70" : "rgba(255,255,255,0.08)"),
              background: isStellarActive ? RARITY_COLOR.stellar + "22" : "rgba(255,255,255,0.02)",
              color: isStellarActive ? RARITY_COLOR.stellar : "rgba(255,255,255,0.45)",
              display: "inline-flex", alignItems: "center", gap: 8, whiteSpace: "nowrap",
              letterSpacing: 0.5, textTransform: "uppercase",
            }}>
              ✨ Stellar
              <span style={{ fontSize: 10, opacity: 0.8, padding: "1px 6px", borderRadius: 10, background: isStellarActive ? RARITY_COLOR.stellar + "18" : "rgba(255,255,255,0.05)" }}>{stats.stellar.count}</span>
            </button>
            {PRO_LEAGUES.map(lg => {
              const accent = LEAGUE_COLORS[lg] || "#A5B4FC";
              const active = activeLeague === lg;
              const count = proLeagueCounts[lg]?.total || 0;
              const flag = LEAGUE_FLAG_CODES[lg];
              return (
                <button key={lg} onClick={() => setActiveLeague(lg)} style={{
                  padding: "8px 14px", borderRadius: 10, fontSize: 12, fontWeight: 800, fontFamily: "Outfit",
                  cursor: "pointer", border: "1px solid " + (active ? accent + "70" : "rgba(255,255,255,0.08)"),
                  background: active ? accent + "22" : "rgba(255,255,255,0.02)",
                  color: active ? accent : "rgba(255,255,255,0.45)",
                  display: "inline-flex", alignItems: "center", gap: 8, whiteSpace: "nowrap",
                  letterSpacing: 0.5, textTransform: "uppercase",
                }}>
                  {flag && <img src={`https://flagcdn.com/w20/${flag}.png`} alt="" style={{ width: 16, height: 12, objectFit: "cover", borderRadius: 2 }} />}
                  {LEAGUE_NAMES[lg] || lg}
                  <span style={{ fontSize: 10, opacity: 0.8, padding: "1px 6px", borderRadius: 10, background: active ? accent + "18" : "rgba(255,255,255,0.05)" }}>{count}</span>
                </button>
              );
            })}
          </div>

          {/* Ligne 2 — sous-filtre rarete (seulement pour les ligues Pro) */}
          {!isStellarActive && (
            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              {["limited", "rare"].map(r => {
                const accent = RARITY_COLOR[r];
                const active = activeRarity === r;
                const count = proLeagueCounts[activeLeague]?.[r] || 0;
                const label = r === "limited" ? "Limited" : "Rare";
                return (
                  <button key={r} onClick={() => setActiveRarity(r)} style={{
                    padding: "6px 14px", borderRadius: 8, fontSize: 11, fontWeight: 700, fontFamily: "Outfit",
                    cursor: "pointer", border: "1px solid " + (active ? accent + "70" : "rgba(255,255,255,0.08)"),
                    background: active ? accent + "22" : "rgba(255,255,255,0.02)",
                    color: active ? accent : "rgba(255,255,255,0.45)",
                    display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
                    letterSpacing: 0.5, textTransform: "uppercase",
                  }}>
                    {label}
                    <span style={{ fontSize: 9, opacity: 0.8, padding: "1px 5px", borderRadius: 8, background: active ? accent + "18" : "rgba(255,255,255,0.05)" }}>{count}</span>
                  </button>
                );
              })}
            </div>
          )}

          {activeStats && activeStats.count === 0 && !isStellarActive && (proLeagueCounts[activeLeague]?.total || 0) === 0 && (
            <div style={{ padding: 30, textAlign: "center", color: "rgba(255,255,255,0.35)", fontSize: 11 }}>
              {lang === "fr"
                ? `Aucune équipe sauvegardée pour ${LEAGUE_NAMES[activeLeague] || activeLeague}.`
                : `No team saved for ${LEAGUE_NAMES[activeLeague] || activeLeague}.`}
            </div>
          )}

          {isStellarActive && stats.stellar.count === 0 && (
            <div style={{ padding: 30, textAlign: "center", color: "rgba(255,255,255,0.35)", fontSize: 11 }}>
              {lang === "fr" ? "Aucune équipe Stellar sauvegardée." : "No Stellar team saved."}
            </div>
          )}

          {!isStellarActive && (proLeagueCounts[activeLeague]?.[activeRarity] || 0) === 0 && (proLeagueCounts[activeLeague]?.total || 0) > 0 && (
            <div style={{ padding: 30, textAlign: "center", color: "rgba(255,255,255,0.35)", fontSize: 11 }}>
              {lang === "fr"
                ? `Aucune équipe ${activeRarity === "rare" ? "Rare" : "Limited"} pour ${LEAGUE_NAMES[activeLeague] || activeLeague}.`
                : `No ${activeRarity} team for ${LEAGUE_NAMES[activeLeague] || activeLeague}.`}
            </div>
          )}

          {!isStellarActive && (proLeagueCounts[activeLeague]?.[activeRarity] || 0) > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {grouped[activeRarity].filter(({ league }) => league === activeLeague).map(({ league, gwKey, teams }) => {
                const accent = LEAGUE_COLORS[league] || "#A5B4FC";
                const flag = LEAGUE_FLAG_CODES[league];
                const key = `${activeRarity}_${league}_${gwKey}`;
                const open = openLeagues?.[key] !== false;
                const gwNum = getGwDisplayNumber(gwKey);
                // Scores par equipe pour le mini recap dans le header
                const teamScores = teams.map(team => {
                  const enriched = enrichTeamWithBestCards(team, cardsBySlug[activeRarity]);
                  const { projectedTotal, liveTotal } = computeTeamScores(enriched, players || []);
                  return { label: team.label || "?", projectedTotal: projectedTotal || 0, liveTotal: liveTotal || 0 };
                });
                return (
                  <div key={key} style={{
                    borderRadius: 12, border: `1px solid ${accent}25`,
                    background: "linear-gradient(180deg, rgba(10,5,28,0.5), rgba(6,3,18,0.35))",
                    overflow: "hidden",
                  }}>
                    <button
                      onClick={() => toggleLeague(key)}
                      style={{
                        width: "100%", display: "flex", alignItems: "center", gap: 10,
                        padding: "10px 14px", border: "none", cursor: "pointer",
                        background: `${accent}10`, color: "#fff", fontFamily: "Outfit",
                        borderBottom: open ? `1px solid ${accent}20` : "none",
                      }}
                    >
                      <span style={{ fontSize: 12, transition: "transform 0.2s", display: "inline-block", transform: open ? "rotate(90deg)" : "rotate(0deg)", color: accent, width: 10 }}>▶</span>
                      {flag && <img src={`https://flagcdn.com/w20/${flag}.png`} alt="" style={{ width: 18, height: 13, objectFit: "cover", borderRadius: 2 }} />}
                      <span style={{ fontSize: 13, fontWeight: 800, color: accent, letterSpacing: 0.3 }}>{LEAGUE_NAMES[league] || league}</span>
                      {gwNum != null && (
                        <span style={{ fontSize: 10, fontWeight: 900, color: "#FBBF24", padding: "2px 8px", borderRadius: 6, background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.3)", letterSpacing: 0.3 }}>
                          GW{gwNum}
                        </span>
                      )}
                      <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.45)", padding: "2px 8px", borderRadius: 10, background: "rgba(255,255,255,0.04)" }}>
                        {teams.length} {lang === "fr" ? (teams.length > 1 ? "équipes" : "équipe") : (teams.length > 1 ? "teams" : "team")}
                      </span>
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => { e.stopPropagation(); deleteProSection(activeRarity, league, gwKey, gwNum, teams.length); }}
                        title={lang === "fr" ? `Supprimer toute cette GW (${teams.length} équipe${teams.length>1?"s":""})` : `Delete whole GW`}
                        style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4, border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.08)", color: "#F87171", cursor: "pointer", fontFamily: "Outfit", lineHeight: 1 }}
                      >🗑 {lang === "fr" ? "GW entière" : "Whole GW"}</span>
                      <span style={{ marginLeft: "auto", fontSize: 10, color: "rgba(255,255,255,0.3)" }}>
                        {open ? (lang === "fr" ? "Masquer" : "Hide") : (lang === "fr" ? "Afficher" : "Show")}
                      </span>
                    </button>
                    {/* Mini recap scores par equipe — toujours visible (ouvert ou ferme) */}
                    <div style={{ padding: "6px 14px 8px", display: "flex", flexWrap: "wrap", gap: 10, background: `${accent}05`, borderTop: open ? "none" : `1px solid ${accent}12` }}>
                      {teamScores.map((ts, i) => (
                        <span key={i} style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", color: "rgba(255,255,255,0.55)", padding: "2px 8px", borderRadius: 6, background: "rgba(0,0,0,0.2)", border: `1px solid ${accent}20` }}>
                          <span style={{ fontWeight: 800, color: accent, marginRight: 6 }}>{ts.label}</span>
                          <span style={{ color: ts.liveTotal > 0 ? "#4ADE80" : "rgba(255,255,255,0.45)", fontWeight: 700 }}>{ts.liveTotal}</span>
                          <span style={{ color: "rgba(255,255,255,0.3)", margin: "0 4px" }}>→</span>
                          <span style={{ color: dsColor(ts.projectedTotal), fontWeight: 700 }}>{ts.projectedTotal}</span>
                          <span style={{ color: "rgba(255,255,255,0.3)", marginLeft: 3, fontSize: 8 }}>proj</span>
                        </span>
                      ))}
                    </div>
                    {open && (
                      <div className="recap-grid" style={{
                        display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 480px))",
                        gap: 10, padding: 12, justifyContent: "center", margin: "0 auto", maxWidth: 980,
                      }}>
                        {teams.map((team, i) => (
                          <ProSavedTeamCard
                            key={`${team.id}-${i}`}
                            team={enrichTeamWithBestCards(team, cardsBySlug[activeRarity])}
                            league={league}
                            rarity={activeRarity}
                            players={players}
                            logos={logos}
                            lang={lang}
                            rarityColor={rColor}
                            onDelete={(id) => {
                              if (window.confirm(lang === "fr" ? `Supprimer "${team.label}" (${league} · GW${gwNum || "?"}) ?` : `Delete "${team.label}"?`)) {
                                deletePro(activeRarity, league, gwKey, id);
                              }
                            }}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {isStellarActive && stats.stellar.count > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {stellarGroups.map(({ dateStr, teams }) => {
                const accent = RARITY_COLOR.stellar;
                const open = openLeagues?.[`stellar_${dateStr}`] !== false;
                // Scores par equipe pour mini recap header Stellar
                const teamScores = teams.map(team => ({
                  label: team.label || "?",
                  projectedTotal: computeStellarProjected(team, players || [], stellarCardsBySlug, stellarCardsByCardSlug) || 0,
                }));
                return (
                  <div key={dateStr} style={{
                    borderRadius: 12, border: `1px solid ${accent}25`,
                    background: "linear-gradient(180deg, rgba(10,5,28,0.5), rgba(6,3,18,0.35))",
                    overflow: "hidden",
                  }}>
                    <button
                      onClick={() => toggleLeague(`stellar_${dateStr}`)}
                      style={{
                        width: "100%", display: "flex", alignItems: "center", gap: 10,
                        padding: "10px 14px", border: "none", cursor: "pointer",
                        background: `${accent}10`, color: "#fff", fontFamily: "Outfit",
                        borderBottom: open ? `1px solid ${accent}20` : "none",
                      }}
                    >
                      <span style={{ fontSize: 12, transition: "transform 0.2s", display: "inline-block", transform: open ? "rotate(90deg)" : "rotate(0deg)", color: accent, width: 10 }}>▶</span>
                      <span style={{ fontSize: 13, fontWeight: 800, color: accent, letterSpacing: 0.3, textTransform: "capitalize" }}>
                        {formatStellarDate(dateStr, lang)}
                      </span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.45)", padding: "2px 8px", borderRadius: 10, background: "rgba(255,255,255,0.04)" }}>
                        {teams.length} {lang === "fr" ? (teams.length > 1 ? "équipes" : "équipe") : (teams.length > 1 ? "teams" : "team")}
                      </span>
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => { e.stopPropagation(); deleteStellarSection(dateStr, teams.length); }}
                        title={lang === "fr" ? `Supprimer toute cette journée (${teams.length} équipe${teams.length>1?"s":""})` : `Delete whole day`}
                        style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4, border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.08)", color: "#F87171", cursor: "pointer", fontFamily: "Outfit", lineHeight: 1 }}
                      >🗑 {lang === "fr" ? "Journée entière" : "Whole day"}</span>
                      <span style={{ marginLeft: "auto", fontSize: 10, color: "rgba(255,255,255,0.3)" }}>
                        {open ? (lang === "fr" ? "Masquer" : "Hide") : (lang === "fr" ? "Afficher" : "Show")}
                      </span>
                    </button>
                    {/* Mini recap scores Stellar */}
                    <div style={{ padding: "6px 14px 8px", display: "flex", flexWrap: "wrap", gap: 10, background: `${accent}05`, borderTop: open ? "none" : `1px solid ${accent}12` }}>
                      {teamScores.map((ts, i) => (
                        <span key={i} style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", color: "rgba(255,255,255,0.55)", padding: "2px 8px", borderRadius: 6, background: "rgba(0,0,0,0.2)", border: `1px solid ${accent}20` }}>
                          <span style={{ fontWeight: 800, color: accent, marginRight: 6 }}>{ts.label}</span>
                          <span style={{ color: dsColor(ts.projectedTotal), fontWeight: 700 }}>{ts.projectedTotal}</span>
                          <span style={{ color: "rgba(255,255,255,0.3)", marginLeft: 3, fontSize: 8 }}>pts</span>
                        </span>
                      ))}
                    </div>
                    {open && (
                      <div className="recap-grid" style={{
                        display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 480px))",
                        gap: 10, padding: 12, justifyContent: "center", margin: "0 auto", maxWidth: 980,
                      }}>
                        {teams.map((team, i) => (
                          <StellarSavedTeamCard
                            key={`${team.id}-${i}`}
                            team={team}
                            players={players}
                            logos={logos}
                            cardsBySlug={stellarCardsBySlug}
                            cardsByCardSlug={stellarCardsByCardSlug}
                            lang={lang}
                            onDelete={(id) => deleteStellar(dateStr, id)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <style>{`
            @media (max-width: 900px) {
              .recap-grid { grid-template-columns: 1fr !important; }
            }
          `}</style>
        </>
      )}
    </div>
  );
}

export default function RecapTab(props) {
  return (
    <RecapErrorBoundary>
      <RecapTabInner {...props} />
    </RecapErrorBoundary>
  );
}
