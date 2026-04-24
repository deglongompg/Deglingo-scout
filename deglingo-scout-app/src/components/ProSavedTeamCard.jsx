import { POSITION_COLORS, dsColor, dsBg } from "../utils/colors";
import { getPaliers, TEAM_SLOTS, computeTeamScores, getPickCard, getPowerPct, utcToParisTime, getTeamSlots } from "../utils/proScoring";
import SkyrocketGauge from "./SkyrocketGauge";

const PC = POSITION_COLORS;

/**
 * Carte visuelle d'une saved team Sorare Pro — pitch (ATT+FLEX / DEF+GK+MIL) + SkyrocketGauge.
 * Rend strictement le même visuel que la section Recap de SorareProTab.
 *
 * Props :
 *  - team     : { id, label, picks, score, captain }
 *  - league   : "L1" | "PL" | "Liga" | "Bundes" | "MLS"
 *  - rarity   : "limited" | "rare"
 *  - players  : array (pour enrichissement last_so5 / titu%)
 *  - logos    : map club -> filename
 *  - lang     : "fr" | "en"
 *  - onLoad   : () => void  (optionnel — bouton Charger)
 *  - onDelete : (id) => void (optionnel — bouton X)
 *  - rarityColor : override (sinon inféré)
 */
export default function ProSavedTeamCard({
  team, league, rarity, players = [], logos = {}, lang = "fr",
  onLoad, onDelete, rarityColor,
}) {
  if (!team) return null;
  const rColor = rarityColor || (rarity === "rare" ? "#F472B6" : "#60A5FA");
  const paliers = getPaliers(league, rarity);
  const { picks, infos, captainId, cap260, projectedTotal, liveTotal } = computeTeamScores(team, players);

  const renderCard = (slot) => {
    const raw = team.picks?.[slot];
    if (!raw) return null;
    const info = infos.find(x => x.p._slot === slot);
    const p = info ? info.p : raw;
    const pc = PC[p.position] || "#94A3B8";
    const ownedCard = getPickCard(p);
    const oppLogo = logos[p.oppName];
    const playerClubLogo = logos[p.club];
    const isCap = captainId && (p.slug || p.name) === captainId;
    const bonusPct = getPowerPct(p);
    const parisTime = p.kickoff && p.matchDate ? utcToParisTime(p.kickoff, p.matchDate) : "";
    const dateLabel = p.matchDate
      ? new Date(p.matchDate + "T12:00:00").toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US", { weekday: "short", day: "numeric" }).toUpperCase().replace(".", "")
      : "";
    const hasRealScore = p.last_so5_date && p.matchDate && p.last_so5_date === p.matchDate && p.last_so5_score != null;
    // Detection "match joue" via teammate (robuste au fuseau UTC vs local)
    const matchWasPlayed = p.matchDate && p.club && (players || []).some(pl =>
      pl.club === p.club && pl.last_so5_date === p.matchDate && pl.last_match_home_goals != null
    );
    // DNP = match deja joue mais pas de SO5 pour ce joueur (blesse, banc, absent)
    const isDNP = matchWasPlayed && !hasRealScore;
    const rawRealScore = hasRealScore ? p.last_so5_score : null;
    // Score affiche en bulle : FLOOR pour matcher l'affichage Sorare (74.7 -> 74)
    const playerScore = hasRealScore ? Math.floor(rawRealScore) : isDNP ? 0 : Math.round(p.ds || 0);
    let matchScore = hasRealScore && p.last_match_home_goals != null && p.last_match_away_goals != null
      ? `${p.last_match_home_goals} - ${p.last_match_away_goals}`
      : null;
    // Si DNP : essaie le score du match via un co-equipier qui a joue
    if (!matchScore && isDNP && p.club && p.matchDate) {
      const mate = (players || []).find(pl => pl.club === p.club && pl.last_so5_date === p.matchDate && pl.last_match_home_goals != null);
      if (mate) matchScore = `${mate.last_match_home_goals} - ${mate.last_match_away_goals}`;
    }
    const recapHomeLogo = p.isHome ? playerClubLogo : oppLogo;
    const recapAwayLogo = p.isHome ? oppLogo : playerClubLogo;

    const cardMaxWidth = league === "Champion" ? 78 : 120;
    return (
      <div key={slot} style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1, minWidth: 0, maxWidth: cardMaxWidth }}>
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
          {isCap && <span style={{ position: "absolute", top: 2, right: 12, width: 12, height: 12, borderRadius: "50%", background: "#FBBF24", color: "#000", fontSize: 7, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2 }}>C</span>}
          {p.sorare_starter_pct != null && !hasRealScore && !isDNP && (
            <span style={{ position: "absolute", top: isCap ? 16 : 2, right: 2, fontSize: 7, fontWeight: 700, padding: "1px 3px", borderRadius: 3, color: "#fff", zIndex: 2,
              background: p.sorare_starter_pct >= 70 ? "rgba(22,101,52,0.9)" : p.sorare_starter_pct >= 50 ? "rgba(133,77,14,0.9)" : "rgba(153,27,27,0.9)",
            }}>{p.sorare_starter_pct}%</span>
          )}
          {isDNP && <span style={{ position: "absolute", top: 2, right: 2, fontSize: 7, fontWeight: 800, padding: "1px 4px", borderRadius: 3, color: "#fff", zIndex: 2, background: "rgba(153,27,27,0.95)", letterSpacing: "0.5px" }}>DNP</span>}
          {bonusPct > 0 && <span style={{ position: "absolute", bottom: 34, right: 4, fontSize: 8, fontWeight: 900, color: "#4ADE80", background: "rgba(0,0,0,0.7)", borderRadius: 3, padding: "1px 4px", zIndex: 3 }}>+{bonusPct}%</span>}
          {ownedCard?.isClassic && <span style={{ position: "absolute", top: 2, left: 2, fontSize: 4, fontWeight: 900, color: "#fff", background: "rgba(139,92,246,0.8)", borderRadius: 2, padding: "0px 2px", zIndex: 2 }}>CLASSIC</span>}
          <div style={{ position: "absolute", bottom: 0, right: 8, zIndex: 2,
            width: 32, height: 32, borderRadius: "50%",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "'DM Mono',monospace", fontSize: 13, fontWeight: 900,
            color: hasRealScore ? "#fff" : isDNP ? "#fff" : dsColor(playerScore),
            background: hasRealScore ? dsBg(playerScore) : isDNP ? "rgba(127,29,29,0.9)" : "rgba(0,0,0,0.6)",
            border: hasRealScore ? "none" : isDNP ? "1px solid rgba(220,38,38,0.8)" : `1px dashed ${dsColor(playerScore)}60`,
            boxShadow: hasRealScore ? `0 0 8px ${dsColor(playerScore)}50` : isDNP ? "0 0 6px rgba(220,38,38,0.4)" : `0 0 6px ${dsColor(playerScore)}30`,
          }}>{playerScore}</div>
        </div>
        {/* Match info box */}
        <div style={{ marginTop: 3, padding: "3px 8px", borderRadius: 6, background: matchScore ? "rgba(15,40,30,0.5)" : "rgba(255,255,255,0.03)", border: `1px solid ${matchScore ? "rgba(74,222,128,0.25)" : "rgba(255,255,255,0.06)"}`, textAlign: "center" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
            {recapHomeLogo && <img src={`/data/logos/${recapHomeLogo}`} alt="" style={{ width: 14, height: 14, objectFit: "contain" }} />}
            {matchScore ? (
              <span style={{ fontSize: 11, fontWeight: 900, color: "#4ADE80", fontFamily: "'DM Mono',monospace", letterSpacing: "-0.3px" }}>{matchScore}</span>
            ) : (
              <span style={{ fontSize: 7, color: "rgba(255,255,255,0.25)" }}>vs</span>
            )}
            {recapAwayLogo && <img src={`/data/logos/${recapAwayLogo}`} alt="" style={{ width: 14, height: 14, objectFit: "contain" }} />}
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
      borderRadius: 12, background: "linear-gradient(160deg, rgba(10,5,30,0.95), rgba(20,10,50,0.9))",
      border: `1px solid ${rColor}25`, padding: "10px 10px", backdropFilter: "blur(8px)",
      display: "flex", gap: 12,
    }}>
      {/* Colonne gauche : header + pitch */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 900, color: rColor }}>{team.label}</span>
            {onLoad && (
              <button onClick={onLoad} style={{ fontSize: 7, fontWeight: 700, padding: "2px 6px", borderRadius: 4, border: `1px solid ${rColor}40`, background: `${rColor}10`, color: rColor, cursor: "pointer", fontFamily: "Outfit" }}>
                {lang === "fr" ? "Charger" : "Load"}
              </button>
            )}
            {onDelete && (
              <button onClick={() => onDelete(team.id)} style={{ fontSize: 8, padding: "2px 5px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.3)", cursor: "pointer" }}>x</button>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {cap260 && <span style={{ fontSize: 8, fontWeight: 800, padding: "2px 5px", borderRadius: 3, border: "1px solid rgba(139,92,246,0.5)", color: "#A78BFA", background: "rgba(139,92,246,0.1)" }}>CAP</span>}
          </div>
        </div>
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
      {/* Skyrocket Gauge à droite — Champion : linear scale, pas de rewards $ */}
      <SkyrocketGauge
        score={liveTotal}
        projectedScore={projectedTotal}
        initialScore={team.score}
        paliers={paliers}
        showRewards={league !== "Champion"}
        scaleMode={league === "Champion" ? "linear" : "control-points"}
        scoreMultiplier={league === "Champion" ? 1.0 : (rarity === "rare" ? 1.10 : 1.0)}
        topRewardColor={league === "Champion" ? null : (rarity === "rare" ? "#DC2626" : "#FBBF24")}
        rarity={rarity}
      />
    </div>
  );
}
