import { useEffect, useMemo, useState } from "react";
import { LEAGUE_COLORS, LEAGUE_NAMES, LEAGUE_FLAG_CODES, POSITION_COLORS, dsColor, dsBg } from "../utils/colors";
import { fetchCloudStore } from "../utils/cloudSync";
import { t } from "../utils/i18n";

const PC = POSITION_COLORS;
const PRO_LEAGUES = ["L1", "PL", "Liga", "Bundes", "MLS"];

function slotColor(slot) {
  if (slot === "FLEX") return "#A78BFA";
  return PC[slot] || "#94A3B8";
}

function formatScore(s) {
  if (s == null || Number.isNaN(s)) return "—";
  return Math.round(Number(s));
}

function enrichPick(pick, players) {
  if (!pick) return null;
  const fresh = pick.slug ? players?.find?.(p => p.slug === pick.slug) : null;
  if (!fresh) return pick;
  return {
    ...pick,
    sorare_starter_pct: fresh.sorare_starter_pct,
    injured: fresh.injured,
    last_so5_score: fresh.last_so5_score,
    last_so5_date: fresh.last_so5_date,
    last_match_home_goals: fresh.last_match_home_goals,
    last_match_away_goals: fresh.last_match_away_goals,
  };
}

function PitchCard({ pick, slot, isCaptain, players, logos }) {
  const p = enrichPick(pick, players);
  if (!p) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1, minWidth: 0, maxWidth: 120 }}>
        <div style={{
          width: "100%", aspectRatio: "3/4", borderRadius: 6,
          background: "rgba(255,255,255,0.02)", border: `1px dashed ${slotColor(slot)}40`,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2,
        }}>
          <span style={{ fontSize: 9, fontWeight: 800, color: slotColor(slot), opacity: 0.6 }}>{slot}</span>
          <span style={{ fontSize: 8, color: "rgba(255,255,255,0.2)" }}>—</span>
        </div>
      </div>
    );
  }
  const pc = PC[p.position] || "#94A3B8";
  const clubLogo = logos?.[p.club];
  const oppLogo = logos?.[p.oppName];
  const hasRealScore = p.last_so5_date && p.matchDate && p.last_so5_date === p.matchDate && p.last_so5_score != null;
  const playerScore = hasRealScore ? Math.round(p.last_so5_score) : Math.round(p.ds || 0);
  const matchScore = hasRealScore && p.last_match_home_goals != null && p.last_match_away_goals != null
    ? `${p.last_match_home_goals} - ${p.last_match_away_goals}`
    : null;
  const homeLogo = p.isHome ? clubLogo : oppLogo;
  const awayLogo = p.isHome ? oppLogo : clubLogo;
  const dateLabel = p.matchDate ? new Date(p.matchDate + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" }).toUpperCase().replace(".", "") : "";

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1, minWidth: 0, maxWidth: 120 }}>
      <div style={{
        width: "100%", aspectRatio: "3/4", borderRadius: 6, overflow: "hidden", position: "relative",
        background: `linear-gradient(155deg, rgba(8,4,28,0.9), ${pc}25)`,
        border: `1px solid ${pc}40`,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      }}>
        {clubLogo && <img src={`/data/logos/${clubLogo}`} alt="" style={{ width: 28, height: 28, objectFit: "contain", opacity: 0.9 }} />}
        <div style={{ fontSize: 7, fontWeight: 900, color: pc, marginTop: 4, letterSpacing: 0.5 }}>{slot}</div>
        <div style={{ fontSize: 9, fontWeight: 700, color: "#fff", marginTop: 4, padding: "0 4px", textAlign: "center", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>
          {p.name || p.slug || "—"}
        </div>
        {isCaptain && <span style={{ position: "absolute", top: 3, right: 3, width: 12, height: 12, borderRadius: "50%", background: "#FBBF24", color: "#000", fontSize: 7, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center" }}>C</span>}
        {p.sorare_starter_pct != null && !hasRealScore && (
          <span style={{ position: "absolute", top: isCaptain ? 17 : 3, right: 3, fontSize: 7, fontWeight: 700, padding: "1px 3px", borderRadius: 3, color: "#fff",
            background: p.sorare_starter_pct >= 70 ? "rgba(22,101,52,0.9)" : p.sorare_starter_pct >= 50 ? "rgba(133,77,14,0.9)" : "rgba(153,27,27,0.9)",
          }}>{p.sorare_starter_pct}%</span>
        )}
        <div style={{ position: "absolute", bottom: 2, right: 4,
          width: 28, height: 28, borderRadius: "50%",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: "'DM Mono',monospace", fontSize: 11, fontWeight: 900,
          color: hasRealScore ? "#fff" : dsColor(playerScore),
          background: hasRealScore ? dsBg(playerScore) : "rgba(0,0,0,0.6)",
          border: hasRealScore ? "none" : `1px dashed ${dsColor(playerScore)}60`,
        }}>{playerScore}</div>
      </div>
      {/* Match info chip */}
      <div style={{ marginTop: 3, padding: "2px 6px", borderRadius: 5, background: matchScore ? "rgba(15,40,30,0.5)" : "rgba(255,255,255,0.03)", border: `1px solid ${matchScore ? "rgba(74,222,128,0.25)" : "rgba(255,255,255,0.06)"}`, textAlign: "center", width: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 3 }}>
          {homeLogo && <img src={`/data/logos/${homeLogo}`} alt="" style={{ width: 11, height: 11, objectFit: "contain" }} />}
          {matchScore ? (
            <span style={{ fontSize: 9, fontWeight: 900, color: "#4ADE80", fontFamily: "'DM Mono',monospace" }}>{matchScore}</span>
          ) : (
            <span style={{ fontSize: 6, color: "rgba(255,255,255,0.25)" }}>vs</span>
          )}
          {awayLogo && <img src={`/data/logos/${awayLogo}`} alt="" style={{ width: 11, height: 11, objectFit: "contain" }} />}
        </div>
        {!matchScore && dateLabel && (
          <div style={{ fontSize: 6, fontWeight: 700, color: "#fff", fontFamily: "'DM Mono',monospace", marginTop: 1 }}>{dateLabel}</div>
        )}
      </div>
    </div>
  );
}

function TeamPitch({ team, rarity, league, players, logos, lang }) {
  const picks = team.picks || {};
  const captain = team.captain;
  const rarityColor = rarity === "rare" ? "#F472B6" : rarity === "limited" ? "#60A5FA" : "#C084FC";
  const totalScore = team.score != null ? Math.round(team.score) : null;
  return (
    <div style={{
      borderRadius: 12,
      background: "linear-gradient(160deg, rgba(10,5,30,0.95), rgba(20,10,50,0.9))",
      border: `1px solid ${rarityColor}25`,
      padding: 12, minWidth: 0,
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          <span style={{ fontSize: 12, fontWeight: 900, color: rarityColor }}>{team.label || "Team"}</span>
          {rarity && (
            <span style={{ fontSize: 8, fontWeight: 700, padding: "2px 5px", borderRadius: 3, border: `1px solid ${rarityColor}40`, color: rarityColor, background: `${rarityColor}10` }}>
              {rarity === "rare" ? "RARE" : "LIMITED"}
            </span>
          )}
          {league && (
            <span style={{ fontSize: 8, fontWeight: 700, padding: "2px 5px", borderRadius: 3, border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)" }}>
              {LEAGUE_NAMES[league] || league}
            </span>
          )}
        </div>
        {totalScore != null && (
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{
              width: 42, height: 42, borderRadius: "50%",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: "'DM Mono',monospace", fontSize: 16, fontWeight: 900,
              color: dsColor(totalScore), background: "rgba(0,0,0,0.5)",
              border: `2px solid ${dsColor(totalScore)}`,
              boxShadow: `0 0 10px ${dsColor(totalScore)}40`,
            }}>{totalScore}</div>
          </div>
        )}
      </div>
      {/* Pitch layout */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "center" }}>
        <div style={{ display: "flex", gap: 6, justifyContent: "center", width: "100%" }}>
          <PitchCard pick={picks.ATT} slot="ATT" isCaptain={captain === "ATT"} players={players} logos={logos} />
          <PitchCard pick={picks.FLEX} slot="FLEX" isCaptain={captain === "FLEX"} players={players} logos={logos} />
        </div>
        <div style={{ display: "flex", gap: 6, justifyContent: "center", width: "100%" }}>
          <PitchCard pick={picks.DEF} slot="DEF" isCaptain={captain === "DEF"} players={players} logos={logos} />
          <PitchCard pick={picks.GK} slot="GK" isCaptain={captain === "GK"} players={players} logos={logos} />
          <PitchCard pick={picks.MIL} slot="MIL" isCaptain={captain === "MIL"} players={players} logos={logos} />
        </div>
      </div>
    </div>
  );
}

export default function RecapTab({ players, logos, lang }) {
  const [store, setStore] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("all"); // "all" | "L1" | "PL" | "Liga" | "Bundes" | "MLS" | "stellar"

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

  const aggregates = useMemo(() => {
    if (!store) return null;
    const d = store.data || {};
    const count = (obj) => {
      let c = 0, sum = 0;
      Object.values(obj || {}).forEach(leagueBuckets => {
        Object.values(leagueBuckets || {}).forEach(list => {
          list.forEach(t => { c++; if (t.score != null) sum += Number(t.score) || 0; });
        });
      });
      return { count: c, total: sum };
    };
    const limited = count(d.proLimited);
    const rare = count(d.proRare);
    let stellarCount = 0, stellarTotal = 0;
    Object.values(d.stellar || {}).forEach(list => {
      list.forEach(t => { stellarCount++; if (t.score != null) stellarTotal += Number(t.score) || 0; });
    });
    // Par ligue
    const perLeague = {};
    PRO_LEAGUES.forEach(l => {
      let c = 0;
      Object.values(d.proLimited?.[l] || {}).forEach(list => c += list.length);
      Object.values(d.proRare?.[l] || {}).forEach(list => c += list.length);
      perLeague[l] = c;
    });
    return {
      limited, rare,
      stellar: { count: stellarCount, total: stellarTotal },
      grandCount: limited.count + rare.count + stellarCount,
      grandTotal: limited.total + rare.total + stellarTotal,
      perLeague,
    };
  }, [store]);

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
            ? "Le Recap centralise tes équipes Pro Limited, Pro Rare et Stellar sauvegardées sur tous tes appareils. Va dans l'onglet Sorare Pro ou Stellar pour te connecter."
            : "Recap centralizes your saved Pro Limited, Pro Rare and Stellar teams across all devices. Go to Sorare Pro or Stellar tab to connect."}
        </div>
      </div>
    );
  }
  if (error === "fetch_failed" || !store) {
    return <div style={{ padding: 40, textAlign: "center", color: "#F87171", fontFamily: "Outfit" }}>{lang === "fr" ? "Impossible de charger le cloud." : "Cloud unavailable."}</div>;
  }

  const d = store.data || {};
  const hasAny = aggregates && aggregates.grandCount > 0;

  // Aplatit les teams selon le filter
  const flat = [];
  const addLeagueTeams = (leagueKey) => {
    ["proLimited", "proRare"].forEach(bucket => {
      const rarity = bucket === "proRare" ? "rare" : "limited";
      const buckets = d[bucket]?.[leagueKey] || {};
      Object.keys(buckets).sort().reverse().forEach(gwKey => {
        (buckets[gwKey] || []).forEach(team => flat.push({ team, rarity, league: leagueKey, gwKey }));
      });
    });
  };
  if (filter === "all") {
    PRO_LEAGUES.forEach(addLeagueTeams);
  } else if (filter === "stellar") {
    Object.keys(d.stellar || {}).sort().reverse().forEach(dateStr => {
      (d.stellar[dateStr] || []).forEach(team => flat.push({ team, rarity: null, league: null, dateStr, scope: "stellar" }));
    });
  } else {
    addLeagueTeams(filter);
  }

  const chipStyle = (active, accent) => ({
    padding: "6px 12px", borderRadius: 8, fontSize: 11, fontWeight: 800, fontFamily: "Outfit",
    cursor: "pointer", border: "1px solid " + (active ? accent + "60" : "rgba(255,255,255,0.08)"),
    background: active ? accent + "18" : "rgba(255,255,255,0.02)",
    color: active ? accent : "rgba(255,255,255,0.45)",
    display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap",
    transition: "all 0.15s",
  });

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
            {d._updatedAt ? `${lang === "fr" ? "Dernière synchro" : "Last sync"}: ${new Date(d._updatedAt).toLocaleString(lang === "fr" ? "fr-FR" : "en-US")}` : (lang === "fr" ? "Aucune synchro encore" : "No sync yet")}
          </div>
        </div>
        {aggregates && (
          <div style={{ display: "flex", gap: 14 }}>
            <div style={{ textAlign: "center", minWidth: 70 }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: "#fff" }}>{aggregates.grandCount}</div>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.45)", letterSpacing: 1 }}>{lang === "fr" ? "ÉQUIPES" : "TEAMS"}</div>
            </div>
            <div style={{ textAlign: "center", minWidth: 90 }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: dsColor(aggregates.grandTotal / Math.max(1, aggregates.grandCount)) }}>
                {formatScore(aggregates.grandCount > 0 ? aggregates.grandTotal / aggregates.grandCount : 0)}
              </div>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.45)", letterSpacing: 1 }}>{lang === "fr" ? "SCORE MOY." : "AVG SCORE"}</div>
            </div>
            <div style={{ textAlign: "center", minWidth: 90 }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: "#E9D5FF" }}>{formatScore(aggregates.grandTotal)}</div>
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
            {lang === "fr" ? "Construis tes équipes dans les onglets Sorare Pro et Stellar, elles apparaîtront ici." : "Build your teams in Sorare Pro and Stellar tabs, they'll show up here."}
          </div>
        </div>
      )}

      {hasAny && (
        <>
          {/* Sub-tabs par ligue */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 16, marginBottom: 14 }}>
            <button onClick={() => setFilter("all")} style={chipStyle(filter === "all", "#A5B4FC")}>
              {lang === "fr" ? "Tous" : "All"}
              <span style={{ fontSize: 9, opacity: 0.7 }}>{aggregates.limited.count + aggregates.rare.count}</span>
            </button>
            {PRO_LEAGUES.map(l => {
              const accent = LEAGUE_COLORS[l] || "#A5B4FC";
              const flag = LEAGUE_FLAG_CODES[l];
              const n = aggregates.perLeague[l] || 0;
              return (
                <button key={l} onClick={() => setFilter(l)} style={chipStyle(filter === l, accent)} disabled={n === 0}>
                  {flag && <img src={`https://flagcdn.com/w20/${flag}.png`} alt="" style={{ width: 14, height: 10, objectFit: "cover", borderRadius: 2 }} />}
                  {LEAGUE_NAMES[l] || l}
                  <span style={{ fontSize: 9, opacity: 0.7 }}>{n}</span>
                </button>
              );
            })}
            <button onClick={() => setFilter("stellar")} style={chipStyle(filter === "stellar", "#C084FC")} disabled={aggregates.stellar.count === 0}>
              ✨ Stellar
              <span style={{ fontSize: 9, opacity: 0.7 }}>{aggregates.stellar.count}</span>
            </button>
          </div>

          {/* Grid 2 par 2 */}
          {flat.length === 0 ? (
            <div style={{ padding: 30, textAlign: "center", color: "rgba(255,255,255,0.35)", fontSize: 11 }}>
              {lang === "fr" ? "Aucune équipe dans cette sélection." : "No team in this selection."}
            </div>
          ) : (
            <div className="recap-grid" style={{
              display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12,
            }}>
              {flat.map((item, i) => (
                <TeamPitch
                  key={`${item.team.id}-${i}`}
                  team={item.team}
                  rarity={item.rarity}
                  league={item.league}
                  players={players}
                  logos={logos}
                  lang={lang}
                />
              ))}
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
