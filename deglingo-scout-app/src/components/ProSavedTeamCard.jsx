import { POSITION_COLORS, dsColor, dsBg } from "../utils/colors";
import { getPaliers, TEAM_SLOTS, computeTeamScores, getPickCard, getPowerPct, utcToParisTime, getTeamSlots } from "../utils/proScoring";
import { flattenDecisivesPositive } from "../utils/decisives";
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
    const hasRealScore = p.last_so5_date && p.matchDate && p.last_so5_date === p.matchDate && p.last_so5_score != null && p.last_match_status !== "scheduled";
    // Detection "match joue" via teammate (robuste au fuseau UTC vs local)
    const matchWasPlayed = p.matchDate && p.club && (players || []).some(pl =>
      pl.club === p.club && pl.last_so5_date === p.matchDate && pl.last_match_home_goals != null && pl.last_match_status !== "scheduled"
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
      const mate = (players || []).find(pl => pl.club === p.club && pl.last_so5_date === p.matchDate && pl.last_match_home_goals != null && pl.last_match_status !== "scheduled");
      if (mate) matchScore = `${mate.last_match_home_goals} - ${mate.last_match_away_goals}`;
    }
    const recapHomeLogo = p.isHome ? playerClubLogo : oppLogo;
    const recapAwayLogo = p.isHome ? oppLogo : playerClubLogo;

    const cardMaxWidth = league === "Champion" ? 78 : 120;
    return (
      <div key={slot} style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1, minWidth: 0, maxWidth: cardMaxWidth }}>
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
          {isCap && <span style={{ position: "absolute", top: 2, right: 12, width: 12, height: 12, borderRadius: "50%", background: "#FBBF24", color: "#000", fontSize: 7, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2 }}>C</span>}
          {p.sorare_starter_pct != null && !hasRealScore && !isDNP && (
            <span style={{ position: "absolute", top: isCap ? 16 : 2, right: 2, fontSize: 7, fontWeight: 700, padding: "1px 3px", borderRadius: 3, color: "#fff", zIndex: 2,
              background: p.sorare_starter_pct >= 70 ? "rgba(22,101,52,0.9)" : p.sorare_starter_pct >= 50 ? "rgba(133,77,14,0.9)" : "rgba(153,27,27,0.9)",
            }}>{p.sorare_starter_pct}%</span>
          )}
          {isDNP && <span style={{ position: "absolute", top: 2, right: 2, fontSize: 7, fontWeight: 800, padding: "1px 4px", borderRadius: 3, color: "#fff", zIndex: 2, background: "rgba(153,27,27,0.95)", letterSpacing: "0.5px" }}>DNP</span>}
          {ownedCard?.isClassic && <span style={{ position: "absolute", top: 2, left: 2, fontSize: 4, fontWeight: 900, color: "#fff", background: "rgba(139,92,246,0.8)", borderRadius: 2, padding: "0px 2px", zIndex: 2 }}>CLASSIC</span>}
          {/* Decisives : ballon dans cercle gold premium, deborde sur le bord bas */}
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
          {/* Bonus +X% : ancre bottom-left card (corner-to-corner) */}
          {bonusPct > 0 && (() => {
            const isRareBonus = rarity === "rare";
            return (
              <span style={{
                position: "absolute", top: 0, left: -2, zIndex: 3,
                fontSize: 8, fontWeight: 900,
                color: isRareBonus ? "#1A1A1F" : "#fff",
                fontFamily: "Outfit", letterSpacing: "0.04em",
                background: isRareBonus
                  ? "linear-gradient(135deg, #FAFAFE 0%, #E0E2E8 50%, #B8BCC4 100%)"
                  : "linear-gradient(135deg, #FFE066 0%, #FFD700 50%, #DAA520 100%)",
                border: "1px solid rgba(255,255,255,0.5)",
                borderRadius: 3,
                padding: "2px 5px",
                boxShadow: isRareBonus
                  ? "0 0 8px rgba(229,231,235,0.6), inset 0 1px 0 rgba(255,255,255,0.7)"
                  : "0 0 8px rgba(255,215,0,0.55), inset 0 1px 0 rgba(255,255,255,0.5)",
                textShadow: isRareBonus
                  ? "0 1px 0 rgba(255,255,255,0.4)"
                  : "0 1px 2px rgba(0,0,0,0.55), 0 0 3px rgba(0,0,0,0.4)",
                whiteSpace: "nowrap", lineHeight: 1,
              }}>+{bonusPct}%</span>
            );
          })()}
          {/* Score : bottom-right card */}
          {hasRealScore ? (
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
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, flexWrap: "nowrap", whiteSpace: "nowrap" }}>
              {recapHomeLogo && <img src={`/data/logos/${recapHomeLogo}`} alt="" style={{ width: 14, height: 14, objectFit: "contain", flexShrink: 0 }} />}
              <span style={{ fontSize: 7, color: "rgba(255,255,255,0.25)", flexShrink: 0 }}>vs</span>
              {recapAwayLogo && <img src={`/data/logos/${recapAwayLogo}`} alt="" style={{ width: 14, height: 14, objectFit: "contain", flexShrink: 0 }} />}
            </div>
            <div style={{ fontSize: 7, fontWeight: 700, color: "#fff", fontFamily: "'DM Mono',monospace", marginTop: 1, whiteSpace: "nowrap", textAlign: "center" }}>
              {dateLabel}{parisTime ? ` - ${parisTime}` : ""}
            </div>
          </div>
        )}
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
      {/* Skyrocket Gauge à droite — Champion : linear scale 400-650, pas de rewards $ */}
      <SkyrocketGauge
        score={liveTotal}
        projectedScore={projectedTotal}
        initialScore={team.score}
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
}
