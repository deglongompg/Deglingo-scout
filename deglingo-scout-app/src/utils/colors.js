export const ARCHETYPE_COLORS = {
  "GOAT":      "#A855F7",
  "Récup":     "#3B82F6",
  "Relanceur": "#06B6D4",
  "B2B":       "#10B981",
  "Créateur":  "#F59E0B",
  "Dribbleur": "#EF4444",
  "Finisseur": "#F97316",
  "Complet":   "#22C55E",
  "Rotation":  "#6B7280",
  "Central":   "#3B82F6",
  "Latéral":   "#06B6D4",
  "GK":        "#06B6D4",
};

export const POSITION_COLORS = { GK: "#06B6D4", DEF: "#3B82F6", MIL: "#8B5CF6", ATT: "#EF4444" };
export const LEAGUE_COLORS   = { L1: "#4FC3F7", PL: "#B388FF", Liga: "#FF8A80", Bundes: "#FFD180", MLS: "#66BB6A", JPL: "#FFCB05", Ere: "#FF6B35" };
export const LEAGUE_FLAGS    = { L1: "🇫🇷", PL: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", Liga: "🇪🇸", Bundes: "🇩🇪", MLS: "🇺🇸", JPL: "🇧🇪", Ere: "🇳🇱" };
export const LEAGUE_FLAG_CODES = { L1: "fr", PL: "gb-eng", Liga: "es", Bundes: "de", MLS: "us", JPL: "be", Ere: "nl" };
export const LEAGUE_NAMES    = { L1: "Ligue 1", PL: "Premier League", Liga: "La Liga", Bundes: "Bundesliga", MLS: "MLS", JPL: "Jupiler Pro", Ere: "Eredivisie" };

export function dsColor(d) {
  return d >= 75 ? "#E8E8E8" : d >= 65 ? "#06D6A0" : d >= 60 ? "#2EC4B6" : d >= 50 ? "#E9C46A" : d >= 40 ? "#F4A261" : "#E76F51";
}

export function dsBg(d) {
  return d >= 75 ? "linear-gradient(135deg,#C0C0C0,#A8E8D0,#B0C4E8,#D4B0E8,#E0D0E8,#C0C0C0)"
       : d >= 65 ? "linear-gradient(135deg,#06D6A0,#049A73)"
       : d >= 60 ? "linear-gradient(135deg,#2EC4B6,#1A8A7F)"
       : d >= 50 ? "linear-gradient(135deg,#E9C46A,#C9A227)"
       : d >= 40 ? "linear-gradient(135deg,#F4A261,#D4782E)"
       :           "linear-gradient(135deg,#E76F51,#C44B33)";
}

export function isSilver(d) { return d >= 75; }

export function getArchetypeColor(archetype) {
  if (!archetype) return "#6B7280";
  for (const [key, color] of Object.entries(ARCHETYPE_COLORS)) {
    if (archetype.includes(key)) return color;
  }
  return "#6B7280";
}

// AA Profile — comment le joueur fait son AA score
// Returns { label, emoji, color, pctCrea, pctFin, pctDef, desc }
export function getAAProfile(player) {
  const p = player;
  const d = Math.max(0, p.aa_defending || 0);
  const pa = Math.max(0, p.aa_passing || 0);
  const po = Math.max(0, p.aa_possession || 0);
  const at = Math.max(0, p.aa_attacking || 0);
  const tot = d + pa + po + at || 1;
  const pDef = d / tot * 100;
  const pPass = pa / tot * 100;
  const pPoss = po / tot * 100;
  const pAtt = at / tot * 100;
  const crea = pPass + pPoss;
  const pos = (p.position === "Midfielder" || p.position === "MIL") ? "MIL"
            : (p.position === "Forward" || p.position === "ATT") ? "ATT"
            : (p.position === "Defender" || p.position === "DEF") ? "DEF" : "GK";

  let label, emoji, color, desc;

  const ftp = p.final_third_passes_avg || 0;
  const goals = p.goals || 0;
  const assists = p.assists || 0;
  const apps = p.appearances || 1;
  const gPerM = goals / apps;
  const aRatio = (goals + assists) > 0 ? assists / (goals + assists) : 0;

  if (pos === "ATT") {
    // Pivot: haute possession (duels physiques) + low FTP (pas créateur) + ATT décent
    const isPivot = pPoss >= 40 && ftp < 6 && pAtt >= 20;
    // Dribbleur: high FTP (passes dernier tiers) + not a pure goal scorer
    const isDribbleur = !isPivot && ftp >= 9 && gPerM < 0.55 && pAtt >= 20;
    if (isPivot)                       { label = "Pivot"; emoji = "🗼"; color = "#F472B6"; desc = `${Math.round(pPoss)}% duels, présence dans la surface`; }
    else if (isDribbleur && aRatio >= 0.35) { label = "Dribbleur"; emoji = "🏃"; color = "#F59E0B"; desc = `FTP ${ftp.toFixed(0)}/match, ${Math.round(pAtt)}% actions off.`; }
    else if (isDribbleur)              { label = "Dribbleur"; emoji = "🏃"; color = "#F59E0B"; desc = `FTP ${ftp.toFixed(0)}/match, percute et crée`; }
    else if (pAtt >= 40)               { label = "Finisseur"; emoji = "🎯"; color = "#F97316"; desc = `${Math.round(pAtt)}% tirs & frappes`; }
    else if (crea >= 70)               { label = "Créateur"; emoji = "🧠"; color = "#A5B4FC"; desc = `${Math.round(crea)}% passes & possession`; }
    else if (gPerM >= 0.5)             { label = "Buteur"; emoji = "⚽"; color = "#EF4444"; desc = `${gPerM.toFixed(2)} buts/match`; }
    else                               { label = "Complet"; emoji = "⚡"; color = "#22C55E"; desc = `${Math.round(crea)}% créa / ${Math.round(pAtt)}% finition`; }
  } else if (pos === "MIL") {
    if (pDef >= 23)        { label = "Récupérateur"; emoji = "🛡️"; color = "#3B82F6"; desc = `${Math.round(pDef)}% récup, ${Math.round(crea)}% créa`; }
    else if (pAtt >= 21)   { label = "Offensif"; emoji = "🔥"; color = "#EF4444"; desc = `${Math.round(pAtt)}% actions offensives`; }
    else if (pPass >= 48)  { label = "Passeur"; emoji = "🎯"; color = "#A5B4FC"; desc = `${Math.round(pPass)}% passes dominantes`; }
    else if (pPoss >= 44)  { label = "Duelliste"; emoji = "⚡"; color = "#06B6D4"; desc = `${Math.round(pPoss)}% interceptions & duels`; }
    else if (pDef >= 18 && crea >= 55) { label = "Box-to-Box"; emoji = "🔄"; color = "#10B981"; desc = `${Math.round(pDef)}% récup + ${Math.round(crea)}% créa`; }
    else                   { label = "Complet"; emoji = "⚖️"; color = "#8B5CF6"; desc = `Profil équilibré`; }
  } else if (pos === "DEF") {
    if (pPass >= 45)       { label = "Relanceur"; emoji = "🎯"; color = "#A5B4FC"; desc = `${Math.round(pPass)}% passes de relance`; }
    else if (pPoss >= 45)  { label = "Duelliste"; emoji = "⚡"; color = "#06B6D4"; desc = `${Math.round(pPoss)}% duels & interceptions`; }
    else if (pDef >= 35)   { label = "Muraille"; emoji = "🧱"; color = "#3B82F6"; desc = `${Math.round(pDef)}% tacles & blocks`; }
    else                   { label = "Complet"; emoji = "🛡️"; color = "#10B981"; desc = `Profil équilibré`; }
  } else {
    label = "GK"; emoji = "🧤"; color = "#06B6D4"; desc = "Gardien";
  }

  return { label, emoji, color, pctCrea: Math.round(crea), pctFin: Math.round(pAtt), pctDef: Math.round(pDef), desc };
}
