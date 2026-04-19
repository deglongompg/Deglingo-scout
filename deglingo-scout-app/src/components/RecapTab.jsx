import { useEffect, useMemo, useState } from "react";
import { LEAGUE_COLORS, LEAGUE_NAMES, LEAGUE_FLAG_CODES, POSITION_COLORS, dsColor } from "../utils/colors";
import { fetchCloudStore } from "../utils/cloudSync";
import { t } from "../utils/i18n";

const PC = POSITION_COLORS;
const PRO_LEAGUES = ["L1", "PL", "Liga", "Bundes", "MLS"];
const TEAM_SLOTS = ["GK", "DEF", "MIL", "ATT", "FLEX"];

function slotColor(slot) {
  if (slot === "FLEX") return "#A78BFA";
  return PC[slot] || "#94A3B8";
}

function formatScore(s) {
  if (s == null || Number.isNaN(s)) return "—";
  return Number(s).toFixed(1);
}

function TeamCard({ team, rarity, league, lang }) {
  const picks = team.picks || {};
  const filled = Object.values(picks).filter(Boolean).length;
  const captain = team.captain;
  return (
    <div style={{
      background: "rgba(15,15,35,0.6)", border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 10, padding: "10px 12px", minWidth: 240, flex: "1 1 240px",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: "#E5E7EB", letterSpacing: 0.2 }}>{team.label || (lang === "fr" ? "Équipe" : "Team")}</div>
        <div style={{ fontSize: 13, fontWeight: 800, color: dsColor(team.score || 0) }}>{formatScore(team.score)}</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "28px 1fr auto", rowGap: 3, fontSize: 10 }}>
        {TEAM_SLOTS.map(slot => {
          const p = picks[slot];
          const isCap = captain === slot;
          return (
            <div key={slot} style={{ display: "contents" }}>
              <div style={{ color: slotColor(slot), fontWeight: 800, fontSize: 9 }}>{slot}{isCap ? " ©" : ""}</div>
              <div style={{ color: p ? "#fff" : "rgba(255,255,255,0.25)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {p ? (p.name || p.slug || "—") : "—"}
              </div>
              <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 9 }}>{p?.dscore != null ? formatScore(p.dscore) : ""}</div>
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 8, color: "rgba(255,255,255,0.3)", marginTop: 6 }}>
        {filled}/5 · {rarity ? (rarity === "rare" ? (lang === "fr" ? "Rare" : "Rare") : "Limited") : ""}{league ? ` · ${LEAGUE_NAMES[league] || league}` : ""}
      </div>
    </div>
  );
}

function SectionHeader({ title, count, color = "#A5B4FC" }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "18px 0 8px" }}>
      <div style={{ width: 4, height: 16, background: color, borderRadius: 2 }} />
      <div style={{ fontSize: 14, fontWeight: 800, color: "#fff", letterSpacing: 0.3 }}>{title}</div>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", fontWeight: 700 }}>{count} {count === 1 ? "team" : "teams"}</div>
    </div>
  );
}

function LeagueRow({ league, gwBuckets, rarity, lang }) {
  const gwKeys = Object.keys(gwBuckets).sort().reverse();
  if (gwKeys.length === 0) return null;
  const latest = gwKeys[0];
  const teams = gwBuckets[latest] || [];
  if (teams.length === 0) return null;
  const color = LEAGUE_COLORS[league] || "#A5B4FC";
  const flag = LEAGUE_FLAG_CODES[league];
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        {flag && <img src={`https://flagcdn.com/w20/${flag}.png`} alt="" style={{ width: 18, height: 12, objectFit: "cover", borderRadius: 2, boxShadow: "0 0 2px rgba(0,0,0,0.4)" }} />}
        <div style={{ fontSize: 12, fontWeight: 800, color }}>{LEAGUE_NAMES[league] || league}</div>
        <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)" }}>{latest} · {teams.length} {lang === "fr" ? "équipe" + (teams.length > 1 ? "s" : "") : "team" + (teams.length > 1 ? "s" : "")}</div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {teams.map(team => <TeamCard key={team.id} team={team} rarity={rarity} league={league} lang={lang} />)}
      </div>
    </div>
  );
}

export default function RecapTab({ lang }) {
  const [store, setStore] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
    const countTeams = (obj) => {
      let c = 0, sum = 0;
      Object.values(obj || {}).forEach(leagueBuckets => {
        Object.values(leagueBuckets || {}).forEach(list => {
          list.forEach(t => { c++; if (t.score != null) sum += Number(t.score) || 0; });
        });
      });
      return { count: c, total: sum };
    };
    const limited = countTeams(d.proLimited);
    const rare = countTeams(d.proRare);
    let stellarCount = 0, stellarTotal = 0;
    Object.values(d.stellar || {}).forEach(list => {
      list.forEach(t => { stellarCount++; if (t.score != null) stellarTotal += Number(t.score) || 0; });
    });
    return {
      limited, rare, stellar: { count: stellarCount, total: stellarTotal },
      grandCount: limited.count + rare.count + stellarCount,
      grandTotal: limited.total + rare.total + stellarTotal,
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
    return (
      <div style={{ padding: 40, textAlign: "center", color: "#F87171", fontFamily: "Outfit" }}>
        {lang === "fr" ? "Impossible de charger le cloud." : "Cloud unavailable."}
      </div>
    );
  }

  const d = store.data || {};
  const hasAny = aggregates && aggregates.grandCount > 0;

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
          <div style={{ display: "flex", gap: 14, fontFamily: "Outfit" }}>
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
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.45)", letterSpacing: 1 }}>{lang === "fr" ? "TOTAL" : "TOTAL"}</div>
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
          {/* Pro Limited */}
          {aggregates.limited.count > 0 && (
            <>
              <SectionHeader title={`Pro Limited · ${lang === "fr" ? "5 ligues" : "5 leagues"}`} count={aggregates.limited.count} color="#60A5FA" />
              {PRO_LEAGUES.map(l => (
                <LeagueRow key={l} league={l} gwBuckets={d.proLimited?.[l] || {}} rarity="limited" lang={lang} />
              ))}
            </>
          )}

          {/* Pro Rare */}
          {aggregates.rare.count > 0 && (
            <>
              <SectionHeader title={`Pro Rare · ${lang === "fr" ? "5 ligues" : "5 leagues"}`} count={aggregates.rare.count} color="#F472B6" />
              {PRO_LEAGUES.map(l => (
                <LeagueRow key={l} league={l} gwBuckets={d.proRare?.[l] || {}} rarity="rare" lang={lang} />
              ))}
            </>
          )}

          {/* Stellar */}
          {aggregates.stellar.count > 0 && (
            <>
              <SectionHeader title="Stellar" count={aggregates.stellar.count} color="#C084FC" />
              {Object.keys(d.stellar || {}).sort().reverse().map(dateStr => {
                const teams = d.stellar[dateStr] || [];
                if (teams.length === 0) return null;
                return (
                  <div key={dateStr} style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#C4B5FD", marginBottom: 6 }}>
                      {new Date(dateStr).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US", { weekday: "long", day: "numeric", month: "long" })}
                      <span style={{ color: "rgba(255,255,255,0.35)", fontWeight: 500, marginLeft: 8 }}>· {teams.length} {teams.length > 1 ? (lang === "fr" ? "équipes" : "teams") : (lang === "fr" ? "équipe" : "team")}</span>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {teams.map(team => <TeamCard key={team.id} team={team} rarity={null} league={null} lang={lang} />)}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </>
      )}
    </div>
  );
}
