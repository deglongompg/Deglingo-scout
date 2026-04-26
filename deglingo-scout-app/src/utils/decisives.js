/**
 * Mapping stats decisives Sorare -> icones emoji.
 * Source : detailedScore Sorare API, category POSITIVE/NEGATIVE_DECISIVE_STAT.
 * Affiche l'icone autant de fois que la valeur (2 buts = ⚽⚽).
 *
 * Utilise dans :
 *  - SorareProTab.jsx + StellarTab.jsx (dropdown joueurs match — taille moyenne)
 *  - ProSavedTeamCard.jsx + StellarSavedTeamCard.jsx + SorareProTab recap
 *    (mini-icones au-dessus du score sur les cartes des saved teams)
 */
export const DECISIVE_ICONS = {
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

/**
 * Mini-icones decisives pour les cartes saved teams (au-dessus du score).
 * Filtre :
 *  - skip negatives (red_card, own_goals...) : on celebre les positifs sur les cartes
 *  - applatit la liste : 2 buts = ⚽⚽ (pas de ×N)
 *  - max 4 icones affichees (sinon overflow visuel)
 *
 * Renvoie un tableau de strings (emojis) — au caller de wrapper en spans.
 */
export function flattenDecisivesPositive(decisives, max = 4) {
  if (!Array.isArray(decisives) || decisives.length === 0) return [];
  const out = [];
  for (const d of decisives) {
    const meta = DECISIVE_ICONS[d.stat];
    if (!meta || !meta.positive) continue;
    const v = Math.max(1, d.value || 1);
    for (let i = 0; i < v; i++) {
      out.push(meta.emoji);
      if (out.length >= max) return out;
    }
  }
  return out;
}
