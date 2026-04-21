import { POSITION_COLORS, dsColor, dsBg } from "../utils/colors";
import { utcToParisTime } from "../utils/proScoring";
import SkyrocketGauge from "./SkyrocketGauge";

const PC = POSITION_COLORS;
const POS_ORDER = ["GK", "DEF", "MIL", "ATT", "FLEX"];

const STELLAR_PALIERS = [
  { pts: 280, reward: "2 000 essence", color: "#94A3B8" },
  { pts: 320, reward: "5 000 essence", color: "#60A5FA" },
  { pts: 360, reward: "10 gems", color: "#A78BFA" },
  { pts: 400, reward: "30 gems", color: "#C084FC" },
  { pts: 440, reward: "100 $", color: "#F59E0B" },
  { pts: 480, reward: "1 000 $", color: "silver", silver: true },
];

/**
 * Carte visuelle d'une saved team Stellar — pitch + SkyrocketGauge.
 * Reprend strictement le visuel du recap interne de StellarTab.
 *
 * Props:
 *  - team : { id, label, picks, editions, score }
 *  - players : array (pour enrichir last_so5 / titu%)
 *  - logos : map club -> filename
 *  - cardsBySlug : map playerSlug -> meilleure carte Stellar possedee
 *  - lang : "fr" | "en"
 *  - onDelete : (id) => void  (optionnel — bouton X pour supprimer)
 */
export default function StellarSavedTeamCard({ team, players = [], logos = {}, cardsBySlug = {}, lang = "fr", onDelete }) {
  if (!team || !team.picks) return null;

  const todayStrFx = new Date().toISOString().split("T")[0];
  const stPlayers = POS_ORDER.map(s => team.picks[s]).filter(Boolean);
  const playerData = stPlayers.map(p => {
    const fresh = players.find(pl => pl.slug === p.slug);
    const ownedCard = cardsBySlug[p.slug || p.name];
    const bonusPct = (ownedCard && ownedCard.totalBonus > 0) ? ownedCard.totalBonus : 0;
    const bonusMult = 1 + bonusPct / 100;
    const matchIsPast = p.matchDate && p.matchDate < todayStrFx;
    let rawScore, postBonus, isLive, isDNP;
    if (fresh && fresh.last_so5_date === p.matchDate && fresh.last_so5_score != null) {
      rawScore = fresh.last_so5_score;
      postBonus = rawScore * bonusMult;
      isLive = true;
      isDNP = false;
    } else if (matchIsPast) {
      // DNP : match deja joue mais pas de SO5 -> score reel = 0
      rawScore = 0;
      postBonus = 0;
      isLive = true;
      isDNP = true;
    } else {
      rawScore = p.ds || 0;
      postBonus = rawScore * bonusMult;
      isLive = false;
      isDNP = false;
    }
    return { p, rawScore, postBonus, isLive, isDNP };
  });

  let captainData = playerData.find(x => x.p.isCaptain);
  if (!captainData && team.captain && team.picks[team.captain]) {
    const capPick = team.picks[team.captain];
    captainData = playerData.find(x => (x.p.slug || x.p.name) === (capPick.slug || capPick.name));
  }
  if (!captainData && playerData.length === 5) {
    captainData = playerData.reduce((best, x) => x.postBonus > best.postBonus ? x : best, playerData[0]);
  }

  const liveSum = playerData.filter(x => x.isLive).reduce((s, x) => s + x.postBonus, 0);
  const liveCaptainBonus = captainData?.isLive ? captainData.postBonus * 0.5 : 0;
  const stTotalLive = Math.round(liveSum + liveCaptainBonus);

  const projectedSum = playerData.reduce((s, x) => s + x.postBonus, 0);
  const projectedCaptainBonus = captainData ? captainData.postBonus * 0.5 : 0;
  const stTotalProjected = Math.round(projectedSum + projectedCaptainBonus);

  const renderStellarCard = (slot) => {
    const raw = team.picks[slot];
    if (!raw) return null;
    const fresh = players.find(pl => pl.slug === raw.slug);
    const p = fresh ? {
      ...raw,
      sorare_starter_pct: fresh.sorare_starter_pct,
      last_so5_score: fresh.last_so5_score,
      last_so5_date: fresh.last_so5_date,
      last_match_home_goals: fresh.last_match_home_goals,
      last_match_away_goals: fresh.last_match_away_goals,
    } : raw;
    const pc = PC[p.position] || "#94A3B8";
    const ownedCard = cardsBySlug[p.slug || p.name];
    const oppLogo = logos[p.oppName];
    const playerClubLogo = logos[p.club];
    const hasRealScore = p.last_so5_date && p.matchDate && p.last_so5_date === p.matchDate && p.last_so5_score != null;
    const matchIsPast = p.matchDate && p.matchDate < todayStrFx;
    const isDNP = matchIsPast && !hasRealScore;
    const playerScore = hasRealScore ? Math.round(p.last_so5_score) : isDNP ? 0 : Math.round(p.ds || 0);
    let matchScore = hasRealScore && p.last_match_home_goals != null && p.last_match_away_goals != null
      ? `${p.last_match_home_goals} - ${p.last_match_away_goals}`
      : null;
    if (!matchScore && isDNP && p.club && p.matchDate) {
      const mate = (players || []).find(pl => pl.club === p.club && pl.last_so5_date === p.matchDate && pl.last_match_home_goals != null);
      if (mate) matchScore = `${mate.last_match_home_goals} - ${mate.last_match_away_goals}`;
    }
    const homeLogo = p.isHome ? playerClubLogo : oppLogo;
    const awayLogo = p.isHome ? oppLogo : playerClubLogo;
    const parisTime = p.kickoff && p.matchDate ? utcToParisTime(p.kickoff, p.matchDate) : "";
    const dateLabel = p.matchDate
      ? new Date(p.matchDate + "T12:00:00").toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US", { timeZone: "Europe/Paris", weekday: "short", day: "numeric" }).toUpperCase().replace(".", "")
      : "";

    return (
      <div key={slot} style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1, minWidth: 0, maxWidth: 120 }}>
        <div style={{
          width: "100%", aspectRatio: "3/4", borderRadius: 6, overflow: "hidden", margin: "0 auto", position: "relative",
          background: ownedCard ? "transparent" : `linear-gradient(155deg, rgba(8,4,28,0.9), ${pc}25)`,
          border: ownedCard ? "none" : `1px solid ${pc}30`,
        }}>
          {ownedCard ? (
            <img src={ownedCard.pictureUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 2 }}>
              {playerClubLogo && <img src={`/data/logos/${playerClubLogo}`} alt="" style={{ width: 16, height: 16, objectFit: "contain" }} />}
              <span style={{ fontSize: 6, fontWeight: 800, color: pc }}>{slot}</span>
            </div>
          )}
          {p.sorare_starter_pct != null && !hasRealScore && !isDNP && (
            <span style={{
              position: "absolute", top: 2, right: 2, fontSize: 7, fontWeight: 700,
              padding: "1px 3px", borderRadius: 3, color: "#fff", zIndex: 2,
              background: p.sorare_starter_pct >= 70 ? "rgba(22,101,52,0.9)"
                : p.sorare_starter_pct >= 50 ? "rgba(133,77,14,0.9)"
                : "rgba(153,27,27,0.9)",
            }}>{p.sorare_starter_pct}%</span>
          )}
          {isDNP && <span style={{ position: "absolute", top: 2, right: 2, fontSize: 7, fontWeight: 800, padding: "1px 4px", borderRadius: 3, color: "#fff", zIndex: 2, background: "rgba(153,27,27,0.95)", letterSpacing: "0.5px" }}>DNP</span>}
          {p.isCaptain && (
            <span style={{
              position: "absolute", top: 3, left: 3, zIndex: 3,
              width: 16, height: 16, borderRadius: "50%",
              background: "linear-gradient(135deg, #F472B6, #E11D48)",
              color: "#fff", fontSize: 9, fontWeight: 900,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: "'Outfit', sans-serif",
              boxShadow: "0 0 8px rgba(225,29,72,0.7), 0 0 2px rgba(0,0,0,0.6)",
              border: "1px solid rgba(255,255,255,0.9)",
            }}>C</span>
          )}
          {ownedCard && ownedCard.totalBonus > 0 && (
            <span style={{ position: "absolute", bottom: 34, right: 4, fontSize: 8, fontWeight: 900, color: "#4ADE80", background: "rgba(0,0,0,0.7)", borderRadius: 3, padding: "1px 4px", zIndex: 3 }}>+{ownedCard.totalBonus}%</span>
          )}
          <div style={{
            position: "absolute", bottom: 0, right: 8, zIndex: 2,
            width: 32, height: 32, borderRadius: "50%",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "'DM Mono',monospace", fontSize: 13, fontWeight: 900,
            color: hasRealScore ? "#fff" : isDNP ? "#fff" : dsColor(playerScore),
            background: hasRealScore ? dsBg(playerScore) : isDNP ? "rgba(127,29,29,0.9)" : "rgba(0,0,0,0.6)",
            border: hasRealScore ? "none" : isDNP ? "1px solid rgba(220,38,38,0.8)" : `1px dashed ${dsColor(playerScore)}60`,
            boxShadow: hasRealScore ? `0 0 8px ${dsColor(playerScore)}50` : isDNP ? "0 0 6px rgba(220,38,38,0.4)" : `0 0 6px ${dsColor(playerScore)}30`,
          }}>{playerScore}</div>
        </div>
        <div style={{
          marginTop: 3, padding: "3px 8px", borderRadius: 6,
          background: matchScore ? "rgba(15,40,30,0.5)" : "rgba(255,255,255,0.03)",
          border: `1px solid ${matchScore ? "rgba(74,222,128,0.25)" : "rgba(255,255,255,0.06)"}`,
          textAlign: "center",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
            {homeLogo && <img src={`/data/logos/${homeLogo}`} alt="" style={{ width: 14, height: 14, objectFit: "contain" }} />}
            {matchScore ? (
              <span style={{ fontSize: 11, fontWeight: 900, color: "#4ADE80", fontFamily: "'DM Mono',monospace", letterSpacing: "-0.3px" }}>{matchScore}</span>
            ) : (
              <span style={{ fontSize: 7, color: "rgba(255,255,255,0.25)" }}>vs</span>
            )}
            {awayLogo && <img src={`/data/logos/${awayLogo}`} alt="" style={{ width: 14, height: 14, objectFit: "contain" }} />}
          </div>
          {!matchScore && (
            <div style={{ fontSize: 7, fontWeight: 700, color: "#fff", fontFamily: "'DM Mono',monospace", marginTop: 1 }}>
              {dateLabel}{parisTime ? ` - ${parisTime}` : ""}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={{
      borderRadius: 12,
      background: "linear-gradient(160deg, rgba(10,5,30,0.95), rgba(20,10,50,0.9))",
      border: "1px solid rgba(196,181,253,0.25)",
      padding: "10px 10px", backdropFilter: "blur(8px)",
      display: "flex", gap: 12,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 900, color: "#C4B5FD" }}>{team.label}</span>
            {onDelete && (
              <button
                onClick={(e) => { e.stopPropagation(); if (window.confirm(lang === "fr" ? `Supprimer "${team.label}" ?` : `Delete "${team.label}"?`)) onDelete(team.id); }}
                title={lang === "fr" ? "Supprimer cette équipe" : "Delete this team"}
                style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4, border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.08)", color: "#F87171", cursor: "pointer", fontFamily: "Outfit", lineHeight: 1 }}
              >✕</button>
            )}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "center" }}>
          <div style={{ display: "flex", gap: 6, justifyContent: "center", width: "100%" }}>
            {renderStellarCard("ATT")}
            {renderStellarCard("FLEX")}
          </div>
          <div style={{ display: "flex", gap: 6, justifyContent: "center", width: "100%" }}>
            {renderStellarCard("DEF")}
            {renderStellarCard("GK")}
            {renderStellarCard("MIL")}
          </div>
        </div>
      </div>
      <SkyrocketGauge
        score={stTotalLive}
        projectedScore={stTotalProjected}
        initialScore={team.score}
        paliers={STELLAR_PALIERS}
        scaleMode="linear"
        showRewards={true}
        topRewardColor="#E5E7EB"
      />
    </div>
  );
}

export { STELLAR_PALIERS };
