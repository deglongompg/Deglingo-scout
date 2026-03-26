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
export const LEAGUE_COLORS   = { L1: "#4FC3F7", PL: "#B388FF", Liga: "#FF8A80", Bundes: "#FFD180" };
export const LEAGUE_FLAGS    = { L1: "🇫🇷", PL: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", Liga: "🇪🇸", Bundes: "🇩🇪" };
export const LEAGUE_NAMES    = { L1: "Ligue 1", PL: "Premier League", Liga: "La Liga", Bundes: "Bundesliga" };

export function dsColor(d) {
  return d >= 85 ? "#E8E8E8" : d >= 75 ? "#06D6A0" : d >= 60 ? "#2EC4B6" : d >= 50 ? "#E9C46A" : d >= 40 ? "#F4A261" : "#E76F51";
}

export function dsBg(d) {
  return d >= 85 ? "linear-gradient(135deg,#C0C0C0,#A8E8D0,#B0C4E8,#D4B0E8,#E0D0E8,#C0C0C0)"
       : d >= 75 ? "linear-gradient(135deg,#06D6A0,#049A73)"
       : d >= 60 ? "linear-gradient(135deg,#2EC4B6,#1A8A7F)"
       : d >= 50 ? "linear-gradient(135deg,#E9C46A,#C9A227)"
       : d >= 40 ? "linear-gradient(135deg,#F4A261,#D4782E)"
       :           "linear-gradient(135deg,#E76F51,#C44B33)";
}

export function isSilver(d) { return d >= 85; }

export function getArchetypeColor(archetype) {
  if (!archetype) return "#6B7280";
  for (const [key, color] of Object.entries(ARCHETYPE_COLORS)) {
    if (archetype.includes(key)) return color;
  }
  return "#6B7280";
}
