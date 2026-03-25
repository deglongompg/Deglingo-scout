# DEGLINGO SCOUT — Brief de démarrage Claude Code

---

## 🖥️ LANCEMENT TERMINAL

```bash
cd /Users/damiengheza/Desktop/Deglingo\ Scout
claude
```

Puis colle le message ci-dessous.

---

## 🚀 PREMIER MESSAGE À COLLER DANS CLAUDE CODE

```
Lis ce fichier BRIEF_CLAUDE_CODE.md en entier avant de faire quoi que ce soit.

Ensuite lance le projet dans cet ordre sans t'arrêter :

STEP 1 — Lis les fichiers de référence dans le dossier courant :
- deglingo-scout-preview.jsx (UI référence — plateforme 3 onglets)
- deglingo-fight-v5.jsx (module Fight — duel D-Score)
- deglingo-so7-unified.jsx (module SO7 — picks sur terrain)
- Inspecte deglingo_ligue1_final.json pour connaître tous les champs disponibles

STEP 2 — Crée et exécute merge_data.py qui :
- Lit les 4 fichiers deglingo_*_final.json
- Normalise position : Goalkeeper→GK, Defender→DEF, Midfielder→MIL, Forward→ATT
- Normalise league : Ligue 1→L1, Premier League→PL, La Liga→Liga, Bundesliga→Bundes
- Ajoute le champ "league" à chaque joueur
- Calcule ga_per_match = (goals + assists) / max(appearances, 1)
- Exporte public/data/players.json (1419 joueurs) + copie teams_data.json → public/data/teams.json
- Confirme les 1419 joueurs en output

STEP 3 — Init projet Vite React :
  npm create vite@latest deglingo-scout-app -- --template react
  cd deglingo-scout-app && npm install
  Copie le dossier public/data/ dedans

STEP 4 — Construis src/App.jsx complet avec :
- fetch('/data/players.json') + fetch('/data/teams.json') au démarrage avec loading state
- 3 onglets : 📊 Database / 🥊 Fight / ⚽ Reco SO7
- Database : table filtrée/triée (ligue, poste, archétype, recherche nom/club)
  → clic joueur = fiche détaillée avec radar AA (5 axes : DEF/PASS/POSS/ATT/FTP) + graphe L5
- Fight : sélection Ligue→Club→Joueur×2 + adversaire + dom/ext → D-Score Match comparé côte à côte
- Reco SO7 : sélection ligue → picks auto (1GK+2DEF+2MIL+2ATT) disposés sur terrain de foot
  → carte joueur cliquable avec D-Score Match calculé vs adversaire du GW
- Design dark gaming : background #04040F, font Outfit (Google Fonts), palette D-Score du brief
- Réutilise tout ce qui marche dans deglingo-scout-preview.jsx

STEP 5 — Lance npm run dev, confirme que les 3 onglets s'affichent avec les vraies données

On fait tout en une seule session. Go.
```

---

## Contexte projet

Tu travailles sur **Deglingo Scout**, un outil de recommandation hebdomadaire pour Sorare SO7
(fantasy football). Le projet tourne sous la marque **Deglingo Foot** sur **deglingosorare.com**.

**Objectif final :** Une plateforme web à 3 onglets (Database / Fight / Reco SO7) alimentée
par un pipeline automatique (Make.com → Claude API → Cloudflare R2), avec picks hebdo publiés
avant le deadline Sorare du vendredi 16h.

---

## État actuel du projet

### ✅ Base de données joueurs (FAIT)
- **1419 joueurs** répartis sur 4 ligues, 76 clubs
- 4 fichiers JSON sources avec 40+ KPIs chacun
- Classification archétypes V3 déjà appliquée via `reclassify_v3.py`

| Ligue | Fichier | Joueurs |
|-------|---------|---------|
| Ligue 1 | `deglingo_ligue1_final.json` | 348 |
| Premier League | `deglingo_premier_league_final.json` | 351 |
| La Liga | `deglingo_la_liga_final.json` | 375 |
| Bundesliga | `deglingo_bundesliga_final.json` | 345 |

### ✅ Données équipes (FAIT)
- `teams_data.json` : 76 clubs, PPDA dom/ext + xGA dom/ext (source Understat)

### ✅ Composants React existants (FAIT, à intégrer)
- `deglingo-fight-v5.jsx` : module duel head-to-head D-Score
- `deglingo-so7-unified.jsx` : picks SO7 sur terrain de foot
- `deglingo-scout-preview.jsx` : prototype plateforme unifiée 87 joueurs (référence UI)

### ✅ Documentation (FAIT)
- `Bible_Deglingo_Scout_V3.docx` : référence complète formules + archétypes
- `reclassify_v3.py` : script de reclassification archétypes
- `reclassification_v3_report.txt` : rapport des 512 changements V1→V3

### ❌ Ce qui reste à faire (OBJECTIF DE CETTE SESSION)
1. **Merger les 4 JSON** en un seul `players.json` normalisé
2. **Construire la plateforme React unifiée** (Vite) avec fetch des données
3. **Tester en local** (`npm run dev`)
4. **Déployer sur Cloudflare Pages** (GitHub → Cloudflare auto-deploy)
5. **Pipeline Make.com → Cloudflare R2** (automatisation hebdo — phase suivante)

---

## Architecture cible

```
deglingosorare.com/scout
        │
        ├── React App (Cloudflare Pages)
        │     ├── Tab 1 : 📊 Database (filtre/tri 1419 joueurs, fiche joueur)
        │     ├── Tab 2 : 🥊 Fight (duel D-Score entre 2 joueurs)
        │     └── Tab 3 : ⚽ Reco SO7 (picks sur terrain par ligue)
        │
        └── Data Layer (Cloudflare R2 — phase 2)
              ├── players.json (1419 joueurs + KPIs)
              ├── teams.json (76 clubs PPDA/xGA)
              ├── fixtures.json (matchs GW en cours)
              └── meta.json (date update, GW numéro)
```

**Pour l'instant :** JSON servis depuis `/public/data/` (Vite les sert statiquement).
**Phase 2 :** Remplacer les URLs fetch par les URLs R2 publiques.

---

## Champs JSON joueur (structure par joueur dans les fichiers)

Champs clés utilisés par le frontend :

```json
{
  "name": "Vitinha",
  "club": "Paris Saint-Germain",
  "position": "Midfielder",          // Goalkeeper / Defender / Midfielder / Forward
  "archetype": "MIL GOAT",          // archétype V3
  "l5": 67.3,                        // moyenne 5 derniers matchs
  "l10": 66.3,
  "aa5": 27.3,                       // AA score moyen 5 matchs
  "floor": 66,                       // min sur L5
  "ceiling": 69,                     // max sur L5
  "ds_rate": 11,                     // % matchs avec Decisive Score
  "regularite": 100,                 // % matchs > 60 pts
  "last_5": [74, 54, 69, 80, 60],   // scores 5 derniers matchs (du + récent au + vieux)
  "avg_dom": 67.5,                   // moyenne à domicile
  "avg_ext": 65.3,                   // moyenne à l'extérieur
  "aa_defending": 3.0,
  "aa_passing": 22.6,
  "aa_possession": 8.0,
  "aa_attacking": 2.4,
  "aa_negative": -11.1,
  "final_third_passes_avg": 21.8,
  "goals": 3,
  "assists": 5,
  "appearances": 22
}
```

**Mapping positions pour le frontend :**
- `Goalkeeper` → `GK`
- `Defender` → `DEF`
- `Midfielder` → `MIL`
- `Forward` → `ATT`

**Mapping ligues pour le frontend :**
- `Ligue 1` → `L1`
- `Premier League` → `PL`
- `La Liga` → `Liga`
- `Bundesliga` → `Bundes`

---

## Structure teams_data.json (par équipe)

```json
{
  "team": "Paris Saint Germain",
  "league": "Ligue 1",
  "ppda": 7.5,
  "ppda_dom": 8.1,
  "ppda_ext": 6.9,
  "xga_per_match": 0.92,
  "xga_dom": 0.98,
  "xga_ext": 0.85
}
```

**Mapping club joueur → nom équipe Understat :**
Le nom du club dans players.json (ex: "Paris Saint-Germain") doit matcher avec le nom dans teams_data.json
(ex: "Paris Saint Germain"). Faire un matching fuzzy ou une table de correspondance si nécessaire.

---

## Formule D-Score V2

```javascript
// norm(v, lo, hi, inv=false) = clamp((v-lo)/(hi-lo), 0, 1), inversé si inv=true
function norm(v, lo, hi, inv = false) {
  if (hi === lo) return 0.5;
  let n = Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
  return inv ? 1 - n : n;
}

function dscore(player, opponent, isHome) {
  const p = player;
  const o = opponent;

  // SOCLE (40%)
  const f   = norm(p.l5, 25, 80);
  const lb  = p.l10 > p.l5 ? norm(p.l10, 30, 80) * 5 : 0;
  const aa  = norm(p.aa5, -5, 35);
  const fl  = norm(p.floor, 15, 70);
  const rg  = norm(p.regularite, 0, 100);
  const gb  = norm(p.ga_per_match || 0, 0, 0.8) * 6;
  const socle = f*13 + lb + aa*12 + fl*7 + rg*7 + gb;

  // CONTEXTE (45%) — ppda et xga de l'adversaire selon dom/ext
  const ppda = isHome ? o.ppda_ext : o.ppda_dom;   // PPDA adverse dans son contexte
  const xga  = isHome ? o.xga_ext  : o.xga_dom;    // xGA adverse dans son contexte
  let contexte = 0;
  if (p.position === "GK")
    contexte = norm(xga, 0.7, 2.5, true)*22 + norm(ppda, 7, 20)*16 + norm(p.l5, 20, 70)*12;
  else if (p.position === "DEF")
    contexte = norm(xga, 0.7, 2.5, true)*20 + (p.aa5 > 18 ? norm(ppda, 7, 20, true) : norm(ppda, 7, 20))*16 + norm(p.l5, 20, 75)*14;
  else if (p.position === "MIL")
    contexte = p.aa5 >= 10
      ? norm(ppda, 7, 20)*26 + norm(xga, 0.8, 2)*8  + norm(p.l5, 25, 75)*16
      : norm(xga,  0.8, 2)*22 + norm(ppda, 7, 20, true)*14 + norm(p.l5, 20, 80)*14;
  else // ATT
    contexte = p.aa5 >= 8
      ? norm(xga, 0.8, 2)*26 + norm(ppda, 7, 20, true)*9  + norm(p.l5, 20, 80)*15
      : norm(xga, 0.8, 2)*25 + norm(ppda, 7, 20, true)*14 + norm(p.l5, 20, 80)*11;

  // MOMENTUM (15%)
  const sc   = p.last_5 || [];
  const l2   = sc.length >= 2 ? (sc[0] + sc[1]) / 2 : (sc[0] || p.l5);
  const tr   = p.l5 > 0 ? (l2 - p.l5) / p.l5 * 100 : 0;
  const ts   = norm(tr, -30, 40) * 10;
  const hs   = sc.length >= 2 && sc[0] >= 65 && sc[1] >= 65 ? 3 : 0;
  const cs   = sc.length >= 2 && sc[0] < 40  && sc[1] < 40  ? -3 : 0;
  const momentum = ts + hs + cs + 2;

  // DOM/EXT BONUS
  const domBonus = isHome ? 5 : -3;

  // FINAL
  const raw = socle + contexte + momentum + domBonus;
  return Math.round(Math.max(p.floor / 100 * 55, Math.min(95, raw)));
}
```

---

## Archétypes V3 — Palette couleurs

```javascript
const ARCHETYPE_COLORS = {
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

const POSITION_COLORS = { GK: "#06B6D4", DEF: "#3B82F6", MIL: "#8B5CF6", ATT: "#EF4444" };
const LEAGUE_COLORS   = { L1: "#4FC3F7", PL: "#B388FF", Liga: "#FF8A80", Bundes: "#FFD180" };
const LEAGUE_FLAGS    = { L1: "🇫🇷", PL: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", Liga: "🇪🇸", Bundes: "🇩🇪" };
const LEAGUE_NAMES    = { L1: "Ligue 1", PL: "Premier League", Liga: "La Liga", Bundes: "Bundesliga" };

// D-Score color scale
function dsColor(d) {
  return d >= 75 ? "#06D6A0" : d >= 65 ? "#2EC4B6" : d >= 55 ? "#E9C46A" : d >= 45 ? "#F4A261" : "#E76F51";
}
function dsBg(d) {
  return d >= 75 ? "linear-gradient(135deg,#06D6A0,#049A73)"
       : d >= 65 ? "linear-gradient(135deg,#2EC4B6,#1A8A7F)"
       : d >= 55 ? "linear-gradient(135deg,#E9C46A,#C9A227)"
       : d >= 45 ? "linear-gradient(135deg,#F4A261,#D4782E)"
       :           "linear-gradient(135deg,#E76F51,#C44B33)";
}
```

---

## Design system (dark gaming)

```css
/* Background principal */
background: linear-gradient(170deg, #04040F, #080820 25%, #0C0C2D 50%, #0A0A22 75%, #060612);
color: #ffffff;
font-family: 'Outfit', sans-serif; /* Google Fonts */

/* Cards */
background: rgba(255,255,255,0.02);
border: 1px solid rgba(255,255,255,0.06);
border-radius: 12px;

/* Header sticky */
background: rgba(4,4,15,0.9);
backdrop-filter: blur(20px);
border-bottom: 1px solid rgba(255,255,255,0.04);

/* Tabs actifs */
background: rgba(99,102,241,0.12);
outline: 1px solid rgba(99,102,241,0.3);
```

---

## Stack technique cible

```
React 18 + Vite (JS pur, pas TypeScript)
├── Styles : inline styles uniquement (pas de Tailwind, pas de CSS modules)
├── fetch() natif pour charger les JSON depuis /public/data/
├── Pas de react-router (tabs gérés en useState)
└── SVG inline pour radar chart et mini graphe L5

Structure projet :
deglingo-scout-app/
├── public/
│   └── data/
│       ├── players.json   (1419 joueurs mergés + normalisés)
│       └── teams.json     (76 clubs PPDA/xGA)
├── src/
│   ├── App.jsx            (shell : fetch + tabs)
│   ├── components/
│   │   ├── DbTab.jsx      (Database)
│   │   ├── FightTab.jsx   (Duel D-Score)
│   │   ├── RecoTab.jsx    (SO7 sur terrain)
│   │   ├── PlayerCard.jsx (fiche joueur)
│   │   ├── RadarChart.jsx (5 axes AA)
│   │   └── MiniGraph.jsx  (L5 scores)
│   └── utils/
│       ├── dscore.js      (formule D-Score V2)
│       └── colors.js      (palettes)
└── merge_data.py          (script de préparation des données)

Déploiement :
├── GitHub repo : github.com/[damiengheza]/deglingo-scout
├── Cloudflare Pages : build command = "npm run build", output = "dist"
└── Phase 2 : remplacer fetch('/data/...') par fetch('https://r2.deglingosorare.com/...')
```

---

## Fichiers dans le dossier de travail

```
Deglingo Scout/
├── deglingo_ligue1_final.json          ← données L1 (348 joueurs)
├── deglingo_premier_league_final.json  ← données PL (351 joueurs)
├── deglingo_la_liga_final.json         ← données Liga (375 joueurs)
├── deglingo_bundesliga_final.json      ← données Bundesliga (345 joueurs)
├── teams_data.json                     ← 76 clubs PPDA/xGA
├── deglingo-scout-preview.jsx          ← UI référence (87 joueurs hardcodés)
├── deglingo-fight-v5.jsx               ← module Fight référence
├── deglingo-so7-unified.jsx            ← module SO7 référence
├── reclassify_v3.py                    ← classification archétypes V3
├── reclassification_v3_report.txt      ← rapport 512 changements
└── Bible_Deglingo_Scout_V3.docx        ← documentation complète
```

---

## Liens utiles
- Site : https://deglingosorare.com
- Sorare API : https://api.sorare.com/federation/graphql
- Affiliate link : http://sorare.pxf.io/Deglingo
- Cloudflare Dashboard : https://dash.cloudflare.com
