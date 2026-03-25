# BIBLE DEGLINGO SCOUT V4
## Dernière mise à jour : 26 mars 2026

---

## 🎯 Résumé du projet

**Deglingo Scout** est un outil de recommandation hebdomadaire pour **Sorare SO7** (fantasy football).
Il tourne sous la marque **Deglingo Foot** sur **deglingosorare.com/scout**.

**Objectif :** Aider les managers Sorare à choisir leurs meilleurs joueurs chaque semaine grâce au **D-Score**,
un algorithme propriétaire qui croise forme du joueur × contexte adversaire × momentum × dom/ext.

---

## 📊 Base de données

### Joueurs
- **1450 joueurs** répartis sur 4 ligues, 76 clubs
- Source : API Sorare GraphQL (`detailedScores` pour AA, `so5Scores` pour L5/L10) + Understat (PPDA, xGA)
- Fichier : `public/data/players.json`

| Ligue | Flag | Joueurs | Code |
|-------|------|---------|------|
| Ligue 1 | 🇫🇷 | 379 | `L1` |
| Premier League | 🏴󠁧󠁢󠁥󠁮󠁧󠁿 | 351 | `PL` |
| La Liga | 🇪🇸 | 375 | `Liga` |
| Bundesliga | 🇩🇪 | 345 | `Bundes` |

### Équipes
- **76 clubs** avec stats Understat (PPDA dom/ext, xGA dom/ext, xG dom/ext)
- Fichier : `public/data/teams.json`

### Fixtures
- Matchs de la prochaine journée par ligue
- Fichier : `public/data/fixtures.json`
- Structure : `{ generated, matchdays: {L1: 28, PL: 32, Liga: 30, Bundes: 28}, fixtures: [...], player_fixtures: {...} }`
- Chaque fixture : `{ home, away, date, matchday, league, home_api, away_api }`

### Logos
- **76 logos PNG** officiels scrappés via football-data.org API
- **142 mappings** nom→logo (couvre toutes les variantes de noms entre players.json, teams.json et l'API)
- Fichier : `public/data/club_logos.json`
- Dossier : `public/data/logos/`
- Clé API football-data.org : `d265aec39d9c401aa27a85b32349bd86`

---

## 🧮 Formule D-Score V2

Le D-Score est un score de 0 à 95 qui prédit le potentiel d'un joueur pour son prochain match.

```
D-Score = SOCLE (40%) + CONTEXTE (45%) + MOMENTUM (15%) + BONUS DOM/EXT
```

### Détail complet (`src/utils/dscore.js`)

```javascript
norm(v, lo, hi, inv=false) // Normalise entre 0 et 1, clamp, inversé si inv

// ═══ SOCLE (40%) ═══
f   = norm(l5, 25, 80)              × 13   // Forme L5
lb  = l10 > l5 ? norm(l10, 30, 80)  × 5    // Bonus L10 si supérieur
aa  = norm(aa5, -5, 35)             × 12   // All-Around score
fl  = norm(min_15 ?? floor, 15, 70) × 7    // Floor (sécurité)
rg  = norm(regularite, 0, 100)      × 7    // Régularité (% matchs > 60)
gb  = norm(ga_per_match, 0, 0.8)    × 6    // G+A par match
socle = f + lb + aa + fl + rg + gb         // ~40 pts max

// ═══ CONTEXTE (45%) — Varie selon la position ═══
// ppda = adversaire ppda_ext (si dom) ou ppda_dom (si ext)
// xga  = adversaire xga_ext (si dom) ou xga_dom (si ext)

GK:  norm(xga, inv) × 22 + norm(ppda) × 16 + norm(l5) × 12
DEF: norm(xga, inv) × 20 + norm(ppda, inv si aa5>18) × 16 + norm(l5) × 14
MIL (aa5≥10): norm(ppda) × 26 + norm(xga) × 8 + norm(l5) × 16
MIL (aa5<10): norm(xga) × 22 + norm(ppda, inv) × 14 + norm(l5) × 14
ATT (aa5≥8):  norm(xga) × 26 + norm(ppda, inv) × 9 + norm(l5) × 15
ATT (aa5<8):  norm(xga) × 25 + norm(ppda, inv) × 14 + norm(l5) × 11

// ═══ MOMENTUM (15%) ═══
l2    = moyenne 2 derniers matchs
trend = (l2 - l5) / l5 × 100
ts    = norm(trend, -30, 40) × 10
hs    = +3 si 2 derniers ≥ 65 (hot streak)
cs    = -3 si 2 derniers < 40 (cold streak)
momentum = ts + hs + cs + 2

// ═══ DOM/EXT ═══
domBonus = +5 (domicile) ou -3 (extérieur)

// ═══ FINAL ═══
raw = socle + contexte + momentum + domBonus
D-Score = clamp(raw, floor/100 × 55, 95)
```

### Logique par position

| Position | Contexte favorable | Ce qui boost le D-Score |
|----------|-------------------|------------------------|
| **GK** | xGA adverse faible (peu de buts) + PPDA élevé (bloc bas) | CS probability + L5 |
| **DEF** | xGA faible + PPDA élevé (sauf DEF offensifs AA5>18 = PPDA inversé) | CS + AA si latéral offensif |
| **MIL AA≥10** | PPDA élevé (possession, passes) | Bloc bas = AA monster |
| **MIL AA<10** | xGA élevé (adversaire perméable) | Occasions offensives |
| **ATT** | xGA élevé (passoire défensive) | Buts + occasions |

### D-Score Color Scale

| Score | Couleur | Hex | Gradient |
|-------|---------|-----|----------|
| 75+ | Vert vif | `#06D6A0` | `#06D6A0 → #049A73` |
| 65-74 | Teal | `#2EC4B6` | `#2EC4B6 → #1A8A7F` |
| 55-64 | Gold | `#E9C46A` | `#E9C46A → #C9A227` |
| 45-54 | Orange | `#F4A261` | `#F4A261 → #D4782E` |
| < 45 | Rouge | `#E76F51` | `#E76F51 → #C44B33` |

---

## 🏗️ Architecture de l'app

### Stack technique

```
React 18 + Vite (JavaScript pur, pas TypeScript)
├── Styles : inline styles uniquement (pas de Tailwind, pas de CSS modules)
├── fetch() natif pour charger les JSON depuis /public/data/
├── Pas de react-router (tabs gérés en useState)
└── SVG inline pour radar chart et mini graphe L5
```

### Structure des fichiers

```
deglingo-scout-app/
├── public/
│   └── data/
│       ├── players.json      (1450 joueurs, 60+ champs chacun)
│       ├── teams.json        (76 clubs avec PPDA/xGA/xG dom+ext)
│       ├── fixtures.json     (matchs prochaine journée, 4 ligues)
│       ├── club_logos.json   (142 mappings nom→logo)
│       └── logos/            (76 fichiers PNG)
├── src/
│   ├── App.jsx               (shell : fetch data + 3 tabs + logos)
│   ├── components/
│   │   ├── DbTab.jsx         (📊 Database — table triée/filtrée 1450 joueurs)
│   │   ├── FightTab.jsx      (🥊 Fight — duel D-Score 1v1)
│   │   ├── RecoTab.jsx       (⚽ Reco SO7 — picks auto par ligue)
│   │   ├── PlayerCard.jsx    (Modal fiche joueur détaillée)
│   │   ├── RadarChart.jsx    (5 axes AA : DEF/PASS/POSS/ATT/FTP)
│   │   └── MiniGraph.jsx     (Graphe L5 scores)
│   └── utils/
│       ├── dscore.js         (formule D-Score V2)
│       └── colors.js         (palettes couleurs positions/archétypes/D-Score)
├── fetch_logos.py             (scraper logos football-data.org)
├── fetch_fixtures.py          (scraper fixtures prochaine journée)
├── fetch_all_players.py       (pipeline complet joueurs)
├── merge_data.py              (merge 4 ligues → players.json)
├── patch_final.py             (patches corrections joueurs)
├── reclassify_v3.py           (classification archétypes V3)
└── find_slugs.py              (résolution slugs Sorare)
```

### Data flow dans App.jsx

```
App.jsx → Promise.all([
  fetch("/data/players.json"),   → setPlayers (1419)
  fetch("/data/teams.json"),     → setTeams (76)
  fetch("/data/fixtures.json"),  → setFixtures
  fetch("/data/club_logos.json") → setLogos (142 mappings)
])
→ Passe { players, teams, fixtures, logos } à chaque tab
```

---

## 📊 Onglet 1 : Database (DbTab.jsx)

### Fonctionnalités
- **Database = source de vérité** de tout (Fight et Reco sont des présentations différentes)
- Table complète 1450 joueurs triable par toutes les colonnes
- Filtres : recherche nom/club, ligue, position, archétype, cap L10
- Colonnes : Joueur (flag + nom + club + logo), Pos, Ligue, L2, AA2, Last5 (barres), L5, AA5, L10, AA10, Min, Max, Reg10, Titu10, D-Score, CS%, Adv. (logo), L€, R€, Archétype
- **Reg10** = % matchs >60 sur L10 | **Titu10** = % titularisations sur L10
- **CS%** = probabilité Clean Sheet (Poisson clamped : `e^(-lambda)` avec lambda = xGA_team × xG_opp / league_avg, clamp [0.5, 2.0])
- **L€ / R€** = prix Limited (jaune) et Rare (rouge) in-season sur le marketplace Sorare
- `shortName()` mapping pour 40+ clubs (PSG, OM, Wolves, Man Utd, etc.)
- Indicateur L2 explosion (glow vert si L2 > L5 + 15)
- Logos 10px clubs dans la colonne joueur et adversaire
- Clic joueur → PlayerCard (modal détaillée avec radar + graphe L5, layout compact 2×5 stats)

### Légende couleurs barres Last5
- 75+ → `#06D6A0` (vert)
- 60-74 → `#2EC4B6` (teal)
- 45-59 → `#E9C46A` (gold)
- 30-44 → `#F4A261` (orange)
- < 30 → `#E76F51` (rouge)
- = 100 → gradient argent animé (silver 🏆)

---

## 🥊 Onglet 2 : Fight (FightTab.jsx)

### Fonctionnalités
- Sélection Ligue → Club → Joueur → Adversaire → DOM/EXT pour chaque combattant
- Animation combat avec logos clubs, poings, et clash 💥
- Cartes récap joueur avec : position badge, D-Score rond (dsColor/dsBg), nom, club + logo, étoiles confiance, mini-histogramme L5
- Context cards adversaire : PPDA + xGA avec labels (Bloc bas / Équilibré / Pressing, Passoire / Moyen / Solide)
- Winner déterminé par D-Score le plus élevé

### Verdicts (alignés avec Reco SO7)

**Analyse individuelle** — même format pour Fight et Reco :
```
D-Score {d}. L5={l5}, AA5={aa5}, Min={min}. {dom/ext} face à {adversaire}. Rég {reg}%.
{adversaire} {en ext/à dom}: xGA={xga}, PPDA={ppda} = {style}.
{verdict style selon AA5 et contexte}
D-Score {d} — {Top pick! / Bon pick. / Pick correct. / Pick risqué.}
```

**GK-specific** :
```
Probabilité de Clean Sheet : {élevée >50% / correcte ~35-45% / moyenne ~25-35% / faible <25%}
Basé sur xG adverse : <1.0 = très peu dangereux, <1.3 = peu offensif, <1.6 = modéré, >1.6 = très offensif
```

**Conclusion comparative risk/reward** (uniquement dans Fight) :
- 📈 Atouts du winner (domicile, floor, régularité, adversaire perméable)
- ⚠️ Risques du loser (déplacement, floor bas, irrégulier, pressing adverse)
- 💡 Pourquoi le loser pourrait quand même être un bon pick (AA5 supérieur, en forme, ceiling)
- 🎯 Verdict final adapté à l'écart (pick évident / avantage clair / très serré)

### Certitude du résultat
- Δ > 12 → FORTE (vert `#22C55E`)
- Δ 7-12 → MOYENNE (gold `#FBBF24`)
- Δ ≤ 6 → SERRÉE (rouge `#F87171`)

---

## ⚽ Onglet 3 : Reco SO7 (RecoTab.jsx)

### Logique de sélection
1. Filtrer joueurs de la ligue avec `l5 >= 35`
2. Matcher avec fixture réelle (joueurs sans fixture = exclus)
3. Calculer D-Score contextuel (adversaire + dom/ext)
4. Trier par D-Score décroissant
5. Picker top 7 : **1 GK, 2 DEF, 2 MIL, 2 ATT, max 2 joueurs/club** (+2% bonus Sorare)

### Fonctionnalités
- Sélection ligue → auto-pick des meilleurs joueurs par poste : 1 GK + 2 DEF + 2 MIL + 2 ATT (max 2/club)
- Cartes joueur 110×156px avec :
  - Position badge coloré en haut
  - D-Score rond 38px (dsColor/dsBg)
  - Nom (last name), club texte, logo 26px
  - Étoiles confiance (1-5, animation pulse pour 5★)
  - Mini-histogramme L5
- Gradients de carte par position (GK=bleu profond, DEF=indigo, MIL=violet, ATT=rouge)
- Clic → DetailPanel avec 4 sections verdict : Situation, Adversaire, Style, Conclusion
- DetailPanel adapté GK : labels "🧤 Clean Sheet & Arrêts" + context cards CS probability / xG adverse / Potentiel d'arrêts / Tendance récente

---

## 🎨 Design System

### Background & Typography
```css
background: linear-gradient(170deg, #04040F, #080820 25%, #0C0C2D 50%, #0A0A22 75%, #060612);
color: #ffffff;
font-family: 'Outfit', sans-serif;  /* Google Fonts */
font-mono: 'DM Mono', monospace;    /* Pour les chiffres */
```

### Cards
```css
background: rgba(255,255,255,0.02);
border: 1px solid rgba(255,255,255,0.06);
border-radius: 12px;
```

### Header sticky
```css
background: rgba(4,4,15,0.9);
backdrop-filter: blur(20px);
border-bottom: 1px solid rgba(255,255,255,0.04);
```

### Palettes

**Positions :**
| Position | Couleur | Hex |
|----------|---------|-----|
| GK | Cyan | `#06B6D4` |
| DEF | Bleu | `#3B82F6` |
| MIL | Violet | `#8B5CF6` |
| ATT | Rouge | `#EF4444` |

**Archétypes :**
| Archétype | Couleur |
|-----------|---------|
| GOAT | `#A855F7` (violet vif) |
| Récup | `#3B82F6` |
| Relanceur | `#06B6D4` |
| B2B | `#10B981` |
| Créateur | `#F59E0B` |
| Dribbleur | `#EF4444` |
| Finisseur | `#F97316` |
| Complet | `#22C55E` |
| Rotation | `#6B7280` |
| Central | `#3B82F6` |
| Latéral | `#06B6D4` |

**Ligues :**
| Ligue | Couleur | Flag |
|-------|---------|------|
| L1 | `#4FC3F7` | 🇫🇷 |
| PL | `#B388FF` | 🏴󠁧󠁢󠁥󠁮󠁧󠁿 |
| Liga | `#FF8A80` | 🇪🇸 |
| Bundes | `#FFD180` | 🇩🇪 |

---

## 📋 Champs joueur (60+ champs)

### Champs principaux utilisés par le frontend

```
name, club, position (GK/DEF/MIL/ATT), league (L1/PL/Liga/Bundes)
archetype, country (code ISO), slug (Sorare slug)
```

### Scores
```
l2, l3, l5, l10, l15          — Moyennes sur N derniers matchs
aa2, aa3, aa5, aa10, aa15     — All-Around scores moyens
last_5: [91.6, 77.5, ...]     — 5 derniers scores (récent→ancien)
floor, ceiling                 — Min/Max sur L5
min_5, max_5, min_15, max_15  — Min/Max sur L5 et L15
```

### Stats avancées
```
regularite    — % matchs > 60 pts sur L10
titu_pct      — % titularisations sur L10
ds_rate       — % matchs avec Decisive Score
ga_per_match  — (goals + assists) / appearances
avg_dom, avg_ext, delta_dom_ext
pct_above_60, pct_below_35
```

### AA breakdown (radar)
```
aa_defending, aa_passing, aa_possession, aa_attacking, aa_negative
final_third_passes_avg
```

### Méta
```
age, appearances, goals, assists, red, yellow
matchs_played, matchs_total, matchs_dom, matchs_ext
mins_per_match, last_date, status (REGULAR/etc)
early_signal, aa_trend
```

### Champs équipe (teams.json)
```
name, league, matches
ppda, ppda_dom, ppda_ext     — PPDA (Passes Per Defensive Action)
xga, xga_dom, xga_ext       — Expected Goals Against per match
xg, xg_dom, xg_ext          — Expected Goals per match
npxg, npxga                  — Non-Penalty xG / xGA
goals, ga                    — Buts marqués / encaissés
```

---

## 🔄 Pipeline hebdomadaire

### Routine avant chaque Game Week (vendredi 16h deadline Sorare)

```
1. fetch_all_players.py   → Scrape 4 ligues via API Sorare (detailedScores)
2. reclassify_v3.py       → Reclassification archétypes
3. merge_data.py           → Merge 4 JSON → players.json normalisé
4. patch_final.py          → Corrections manuelles si nécessaire
5. fetch_fixtures.py       → Scrape prochaine journée (football-data.org)
6. Build & deploy          → npx vite build + push GitHub → Cloudflare Pages
```

### Commandes build

```bash
# Charger Node.js
export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

# Build
cd deglingo-scout-app && npx vite build

# Le dist/ est servi soit par :
# - Cloudflare Pages (auto-deploy depuis GitHub)
# - Serveur local (.claude/scout-server.mjs dans Moonwalk, port 5173)
```

### Preview local (depuis le repo Moonwalk)

Le serveur de preview est configuré dans `/Users/damiengheza/Desktop/Moonwalk/.claude/launch.json` :
- Nom : `deglingo-scout`
- Sert depuis : `/Users/damiengheza/Desktop/Moonwalk/.claude/scout-dist/`
- Port : 5173
- **Important** : après un build, copier le dist vers `Moonwalk/.claude/scout-dist/`

---

## 🔗 GitHub & Déploiement

- **Repo GitHub** : `github.com/deglongompg/Deglingo-scout`
- **Branche** : `main`
- **Déploiement** : Cloudflare Pages (build command: `npm run build`, output: `dist`)
- **Site** : `deglingosorare.com/scout`
- **Phase 2 (future)** : Remplacer fetch locaux par Cloudflare R2 URLs

---

## 📐 Archétypes V3

Classification automatique basée sur les stats AA :

| Position | Archétypes possibles |
|----------|---------------------|
| GK | `GK` (unique) |
| DEF | `DEF Central`, `DEF Latéral` |
| MIL | `MIL GOAT`, `MIL Récup`, `MIL Relanceur`, `MIL B2B`, `MIL Créateur`, `MIL Dribbleur`, `MIL Rotation` |
| ATT | `ATT GOAT`, `ATT Complet`, `ATT Finisseur`, `ATT Créateur`, `ATT Dribbleur`, `ATT Rotation` |

Script : `reclassify_v3.py` (512 changements V1→V3 documentés dans `reclassification_v3_report.txt`)

---

## ⚠️ Points d'attention / Décisions techniques

1. **NE PAS toucher le layout/fonctionnalité du Fight** sauf changements additifs (logos, verdicts)
2. **min_15 ?? floor** : le D-Score utilise `min_15` comme floor quand disponible (plus fiable car L15)
3. **Logos** : le mapping `club_logos.json` couvre 3 systèmes de noms différents (football-data.org, teams.json, players.json)
4. **GK verdicts** : toujours parler de Clean Sheet probability (basé sur xG adverse), pas de "style de jeu"
5. **D-Score 60 = gold/jaune**, pas orange (seuil à 55, pas 60)
6. **Badge D-Score** = rond avec gradient (dsBg), jamais hexagonal
7. **Fight verdicts** = identiques à Reco SO7 + conclusion comparative risk/reward en plus

---

## 🔮 Roadmap / Idées futures

- [x] Intégrer CS% dans Database + verdicts GK/DEF (Poisson clamped, range 13%-61%)
- [x] Ajouter prix cartes Limited/Rare (L€/R€) depuis Sorare marketplace
- [x] Renommer Rég10%→Reg10, Titu%→Titu10
- [x] Max 2 joueurs/club dans Reco SO7 (+2% bonus Sorare)
- [x] shortName mapping 40+ clubs (PSG, OM, Wolves, etc.)
- [ ] Fetcher prix L€/R€ pour les 1450 joueurs (script fetch_prices.py prêt, ~25min/ligue)
- [ ] Re-fetch PL/Liga/Bundes avec fix AA scores (L1 done)
- [ ] Pipeline Make.com → Claude API → Cloudflare R2 (automatisation complète)
- [ ] Déployer sur Cloudflare Pages avec auto-deploy GitHub
- [ ] Ajouter filtres avancés dans Database (DOM only, EXT only, forme récente)
- [ ] Accès API Sorare étendu (demande en cours)

---

## 📞 Liens utiles

- Site : https://deglingosorare.com
- Sorare API : https://api.sorare.com/federation/graphql
- Affiliate link : http://sorare.pxf.io/Deglingo
- Football-data.org : https://api.football-data.org/v4/ (clé: `d265aec39d9c401aa27a85b32349bd86`)
- Cloudflare Dashboard : https://dash.cloudflare.com
- GitHub : https://github.com/deglongompg/Deglingo-scout
