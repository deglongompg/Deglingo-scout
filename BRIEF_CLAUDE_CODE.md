# BIBLE DEGLINGO SCOUT V5
## Dernière mise à jour : 22 avril 2026

> **Claude Code :** lis ce fichier pour comprendre le projet de bout en bout.
> Pour reprendre une session récente, lis aussi `SESSION_HANDOFF.md` (état courant + bugs pending).

---

## 🆕 Ajouts majeurs depuis V4 (mars 2026 → avril 2026)

| Feature | Commit phare | Description |
|---------|--------------|-------------|
| **Onglet Sorare Pro** | Multi commits | Builder 5-joueurs (GK+DEF+MIL+ATT+FLEX) par ligue/rareté avec GW selector, saved teams, SkyrocketGauge, card power bonus, captain × 0.5 |
| **Onglet Sorare Stellar** | Multi commits | Fixtures quotidiennes, 4 ligues + Europe, multi-jours (max 4), freeze daily, Fight mode, paliers rewards 280→480 pts |
| **Onglet Mes Teams** | `4a16964` + `d144773` | Recap centralisé cross-device via Cloudflare KV. 3 sous-onglets : Pro Limited / Pro Rare / Stellar. Groupement (ligue, GW) pour Pro, par date pour Stellar |
| **Sync KV cross-device** | `4a16964` | `/api/teams` Cloudflare Function avec namespace `TEAMS_KV`. Dual-write localStorage + KV. Mac + iPhone + PC synchronisés |
| **OAuth Sorare** | — | Flow OAuth avec `sorare_access_token` dans localStorage, Bearer token, redirect_uri hardcodé sur prod |
| **Fetch cartes Sorare** | — | `/api/sorare/cards` Function (max 39 pages), cache `pro_cards_cache` (localStorage, TTL 1h) + `sorare_cards_cache` (sessionStorage, TTL 10min) |
| **Scores SO5 + match goals** | `ba95ad5` + `6e5f9b4` | Calendrier Pro+Stellar : badge FT + "1-2", dropdown joueurs par match. Saved teams : vraie note SO5 en bulle solide, DNP rouge 0, projeté pointillé |
| **Fetch intelligent** | `d2f24c3` + `a7f2c0e` + `92b330c` | `fetch_gw_scores.py` : fuzzy matching clubs (AS Monaco↔AS Monaco FC), fenêtre 7 jours min, smart-skip des players déjà à jour (30-60 fetch au lieu de 2800) |
| **Cache busting data** | `fa3b2c2` | `/data/*.json?v={Date.now()}` → bypass cache Cloudflare/navigateur |
| **Cross-week Stellar** | `32032d2` | `selectedDays` passe d'indices [0-6] à dates ISO — permet sélection Mardi + Mercredi sur 2 semaines différentes |
| **GW précédente Pro** | `24abb17` | Sélecteur Pro affiche GW71 FIN grisée à gauche de GW72 LIVE |
| **Best Pick (Reco) masqué** | `c6b127b` | Retiré de la barre de nav (commenté dans TABS). Code conservé, route `?tab=reco` toujours fonctionnelle |

---

## 🎯 Résumé du projet

**Deglingo Scout** est un outil de recommandation pour **Sorare SO5 / Sorare Pro / Sorare Stellar** (fantasy football).
Il tourne sous la marque **Deglingo Foot** sur **scout.deglingosorare.com** (prod) et `deglingosorare.com/scout` (legacy mirror).

**Objectif :** Aider les managers Sorare à construire leurs équipes chaque GW (Sorare Pro, deadline Ven/Mar 16h Paris) et chaque jour (Sorare Stellar) grâce au **D-Score** + des outils de scoring live.

**Utilisateurs :** 1 admin (deglongompg) + clients payants via Sorare Affiliate. Tout se fait côté frontend + Cloudflare KV (pas de DB backend classique).

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
- Clé API football-data.org : **stockée dans `.env` local** (jamais committée, voir `.gitignore`). Si besoin, regenerate via https://www.football-data.org/client/home

### Nouvelles données (depuis V4)
- **`player_status.json`** — injured/suspended/sorare_starter_pct par slug (fetchable via `fetch_player_status.py`)
- **`player_prices.json`** — prix Limited/Rare Sorare marketplace (fetchable via `fetch_prices.py`)
- **`match_events.json`** — buteurs/passeurs par match (`fetch_gw_scores.py` construit aussi ça)
- **Scores SO5 par joueur** dans players.json : `last_so5_score`, `last_so5_date`, `last_match_home_goals`, `last_match_away_goals`, `game_id`

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
React 19 + Vite 8 (JavaScript pur, pas TypeScript)
├── Styles : inline styles uniquement (pas de Tailwind, pas de CSS modules)
├── fetch() natif pour charger les JSON depuis /public/data/ (avec cache-busting ?v=ts)
├── Pas de react-router (tabs gérés en useState + URL hash)
├── SVG inline pour radar chart, mini graphe, SkyrocketGauge
├── Cloudflare Functions : /api/teams (KV), /api/sorare/cards (proxy OAuth)
└── KV namespace : TEAMS_KV (bindé en Production + Preview)
```

### Structure des fichiers

```
deglingo-scout-app/
├── public/
│   └── data/
│       ├── players.json        (3500+ joueurs, 60+ champs + last_so5_*)
│       ├── teams.json          (76 clubs avec PPDA/xGA/xG dom+ext)
│       ├── fixtures.json       (matchs + player_fixtures + home_api/away_api)
│       ├── club_logos.json     (mappings nom→logo)
│       ├── match_events.json   (buteurs/passeurs par game_id)
│       └── logos/              (PNG par club)
├── src/
│   ├── App.jsx                 (shell : fetch data + tabs + OAuth return handling)
│   ├── components/
│   │   ├── DbTab.jsx                   (📊 Database — table triée/filtrée)
│   │   ├── SorareProTab.jsx            (⚙️ Sorare Pro — builder GW + saved + recap)
│   │   ├── StellarTab.jsx              (✨ Sorare Stellar — daily multi-jours + Fight)
│   │   ├── RecapTab.jsx                (📋 Mes Teams — recap cross-device via KV)
│   │   ├── FightTab.jsx                (🥊 Fight — duel D-Score)
│   │   ├── RecoTab.jsx                 (⚽ Best Pick — MASQUÉ côté clients)
│   │   ├── ProSavedTeamCard.jsx        (Pitch 5 joueurs + SkyrocketGauge Pro)
│   │   ├── StellarSavedTeamCard.jsx    (Pitch 5 joueurs + gauge Stellar)
│   │   ├── SkyrocketGauge.jsx          (Jauge verticale paliers rewards)
│   │   ├── PlayerCard.jsx              (Modal fiche joueur détaillée)
│   │   ├── RadarChart.jsx              (5 axes AA)
│   │   ├── MiniGraph.jsx               (Graphe L5 scores)
│   │   └── LandingPage.jsx             (Page d'accueil)
│   ├── utils/
│   │   ├── dscore.js       (formule D-Score V2)
│   │   ├── colors.js       (palettes positions/archétypes/ligues)
│   │   ├── proScoring.js   (paliers, getGwDisplayNumber, computeTeamScores, enrichPick)
│   │   ├── cloudSync.js    (pushTeams, fetchCloudStore, extractProTeams/Stellar)
│   │   ├── freeze.js       (getProGwInfo, getProGwList, loadFrozen, saveFrozen)
│   │   └── i18n.js         (traductions fr/en)
│   └── components/         (...)
├── functions/
│   ├── api/
│   │   ├── teams/index.js        (GET/POST KV, auth via Bearer Sorare)
│   │   └── sorare/cards.js       (proxy GraphQL Sorare)
│   └── auth/sorare/
│       ├── callback.js           (OAuth callback → redirect avec token)
│       └── logout.js
├── dist/                   (build output, uploaded par wrangler)
└── SETUP_KV.md             (doc setup KV namespace)

Racine du repo :
├── fetch_all_players.py    (pipeline complet joueurs 4 ligues)
├── fetch_gw_scores.py      (scores SO5 matchs joués — fuzzy clubs + smart-skip)
├── fetch_fixtures.py       (prochaine journée)
├── fetch_logos.py          (logos clubs)
├── fetch_player_status.py  (injured/suspended/titu_pct Sorare)
├── fetch_prices.py         (prix Limited/Rare marketplace)
├── fetch_sorare_cards.py   (inventaire cartes user)
├── fetch_sorareinside.py   (ajouts externes)
├── merge_data.py           (merge 4 ligues → players.json)
├── fix_*.py                (patches correctifs ponctuels)
├── reclassify_v3.py        (archétypes V3)
├── deploy.sh / deploy.bat              (build + wrangler + scout-dist + git)
├── MAJ_daily.sh / MAJ_daily.bat        (fetch scores + deploy complet)
├── fetch_vendredi.sh / .bat            (MAJ léger)
├── fetch_mercredi.sh / .bat            (grosse MAJ hebdo)
└── scout-dist/             (mirror legacy pour deglingosorare.com/scout via Wix)
```

### Data flow dans App.jsx

```
App.jsx → Promise.all([
  fetch(`/data/players.json?v=${Date.now()}`),   → setPlayers
  fetch(`/data/teams.json?v=...`),               → setTeams
  fetch(`/data/fixtures.json?v=...`),            → setFixtures
  fetch(`/data/club_logos.json?v=...`),          → setLogos
  fetch(`/data/match_events.json?v=...`),        → setMatchEvents
])
→ Passe { players, teams, fixtures, logos, matchEvents } à chaque tab

OAuth return handling (StellarTab/SorareProTab) :
window.location.hash contient sorare_token=... → localStorage.setItem("sorare_access_token", token)
→ fetchCards avec Bearer Authorization

Sync cross-device (Mes Teams) :
localStorage = offline local + KV = cross-device truth
pushTeams("pro", {league, rarity, gwKey}, teams) → POST /api/teams avec Bearer
fetchCloudStore() → GET /api/teams → {slug, data: {proLimited, proRare, stellar, _updatedAt}}
```

### Onglets actifs (dans la barre de nav)

1. **📊 Database** (`db`) — Table triée/filtrée de tous les joueurs, modal PlayerCard détaillé
2. **⚙️ Sorare Pro** (`pro`) — Builder GW, saved teams, recap inline, GW selector prev+live+future
3. **✨ Sorare Stellar** (`stellar`) — Calendrier multi-jours cross-semaines, builder, Fight
4. **📋 Mes Teams** (`recap`) — Recap centralisé cross-device (Pro Limited / Pro Rare / Stellar)
5. **🥊 Fight** (`fight`) — Duel D-Score 1v1

**Masqué** : `⚽ Best Pick` (`reco`) — commenté dans `App.jsx:TABS`, code `RecoTab.jsx` conservé

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

## ⚽ Onglet 3 (MASQUÉ) : Best Pick / Reco SO7 (RecoTab.jsx)

**Status :** masqué dans la nav depuis le 22/04/2026 (commit `c6b127b`), code conservé.
Décommenter `{ id: "reco", label: "Best Pick", icon: "⚽" }` dans `App.jsx:TABS` pour réactiver.

### Logique de sélection
1. Filtrer joueurs de la ligue avec `l5 >= 35`
2. Matcher avec fixture réelle (joueurs sans fixture = exclus)
3. Calculer D-Score contextuel (adversaire + dom/ext)
4. Trier par D-Score décroissant
5. Picker top 7 : **1 GK, 2 DEF, 2 MIL, 2 ATT, max 2 joueurs/club** (+2% bonus Sorare)

### Fonctionnalités
- Cartes joueur 110×156px avec position badge, D-Score rond, étoiles confiance, mini-L5
- Clic → DetailPanel avec 4 sections verdict : Situation, Adversaire, Style, Conclusion
- DetailPanel GK : Clean Sheet probability + xG adverse + tendance récente

---

## ⚙️ Onglet 4 : Sorare Pro (SorareProTab.jsx)

### Concept
Builder pour les tournois Sorare Pro (GW = Vendredi 16h → Mardi 16h Paris, ou Mardi 16h → Vendredi 16h).
5 slots : **GK · DEF · MIL · ATT · FLEX**. Captain bonus × 50% sur le raw SO5 (formule Sorare officielle).

### Composants clés

**GW selector** (commit `24abb17`) :
- `getProGwList(5)` dans `freeze.js` retourne `[prev, live, +1, +2, +3, +4]`
- Chaque GW : `{gwKey, gwStart, gwEnd, gwNumber, startDateStr, endDateStr, displayNumber, isLive, isPast, offsetFromLive}`
- Numérotation : epoch GW69 = 2026-04-10, chaque GW dure ~3.5 jours
- Par défaut : `liveIdx` (la live), user peut cliquer sur "GW71 FIN" à gauche pour consulter la passée

**Decisive Picker** (haut de l'écran) :
- Top 3 ATT du jour, triés par un score "decisive" (`gaRate × posMult × formFactor × oppFactor`)

**Calendrier matchs** (colonne gauche, 280px) :
- Liste des fixtures de la GW groupées par date
- **Depuis commit `ba95ad5`** : chip vert + "FT" + score "1-2" si match joué, sinon heure + "vs"
- Click sur nom de club → dropdown avec joueurs du club + leurs notes SO5 (position, logo, H/A, score)
- Click sur chip → filtre le pool à ce match

**Pool joueurs** (colonne droite principale) :
- Tous les joueurs de la ligue qui ont un fixture dans la GW
- Tri par D-Score desc par défaut
- Colonnes : flag, nom, club, pos, match info (home→away + score si joué), bonus pct carte, D-Score rond
- Si user connecté Sorare : bouton "Mes cartes" filter au pool de cartes possédées
- Filtres : titu% (masqué pour GW +2/+3/+4), décisive only, multi-club, CAP260

**Builder 5-joueurs** :
- Drag-drop OU click-pour-pick depuis le pool
- Slots GK / DEF / MIL / ATT / FLEX
- Chaque pick = `{ ...player, _card: sorareCard, _cardKey, matchDate, oppName, isHome, kickoff }`
- Bouton Charger/Saver/X par team slot

**Saved teams** (section recap en bas) :
- 4 teams max par (league, rarity, gwKey)
- Clé localStorage : `pro_saved_{league}_{rarity}_{gwKey}`
- Clé KV : `proLimited[league][gwKey]` ou `proRare[league][gwKey]`
- Chaque saved team : `{id, label, picks, captain, score, savedAt}`
- Rendu en pitch ATT+FLEX / DEF+GK+MIL + SkyrocketGauge à droite
- **DNP detection** (commit `6e5f9b4`) : si `matchDate < today && !hasRealScore` → bulle rouge 0 + badge DNP
- **Fallback match score** : si joueur DNP, cherche un co-équipier qui a joué pour afficher le score du match

### Paliers rewards (`proScoring.js`)

EU Limited : $5 → $10 → $50 → $200 → $1000 (360/380/400/420/460)
EU Rare : $20 → $40 → $200 → $800 → $4000 🔥 (400/420/440/460/510, Rare × 1.10 multiplier)
MLS Limited/Rare : paliers essence + cash différents

---

## ✨ Onglet 5 : Sorare Stellar (StellarTab.jsx)

### Concept
Compétition quotidienne Sorare. Fixtures du jour (L1 + PL + Liga + coupes EU). 5 slots comme Pro.
Paliers : 2k ess → 5k ess → 10 gems → 30 gems → 100$ → 1000$ 🏆 (280/320/360/400/440/480)

### Features uniques
- **Multi-jours** (max 4) : sélection cross-semaines via dates ISO (commit `32032d2`)
- **Freeze daily** : snapshot du pool joueurs à la deadline stellar (minuit Paris)
- **Fight mode** : deadline approchant → 1 click vers FightTab avec les picks
- **Editions** : Base/Shiny/Maillot/Meteor/Holo/Legend./Signed (bonus 0/5/20/25/10/30/40%)
- **Match-chip cliquable** : click sur nom club → dropdown joueurs (même pattern que Pro)

### Sauvegarde teams
- Clé localStorage : `stellar_saved_teams_{dateStr}` (1 entry par date)
- Clé KV : `stellar[dateStr]` (1 entry par date)
- Chaque team : `{id, label, picks, editions, score, savedAt}`
- 4 teams max par date

### selectedDays (IMPORTANT — ne pas casser)
- **Stocke des dates ISO "YYYY-MM-DD"** (pas des indices)
- Permet selection Mardi semaine A + Mercredi semaine B
- Navigation prev/next semaine (◀ ▶) **préserve la sélection** — ne jamais rajouter `setSelectedDays([])`
- Max 4 jours, tri par `.sort()` alphabétique (ISO naturel)

---

## 📋 Onglet 6 : Mes Teams (RecapTab.jsx)

### Concept
Vue centralisée cross-device des équipes sauvegardées (Pro Limited + Pro Rare + Stellar).
Données pullées depuis KV via `fetchCloudStore()`.

### Structure de rendu
- **Header user** : slug Sorare, total équipes, score moyen, total cumulé, dernière synchro
- **Tabs rarity** : Pro Limited (n) / Pro Rare (n) / Stellar (n)
- **Pro (Limited/Rare)** — commit `fa63621` :
  - Groupement par (ligue, gwKey), un collapsible par paire
  - Header : "🇫🇷 Ligue 1 · [GW72] · 2 équipes"
  - Badge GW jaune dérivé via `getGwDisplayNumber(gwKey)`
  - Tri : GW plus récente d'abord, puis ordre PRO_LEAGUES
  - Chaque team → `<ProSavedTeamCard>` avec pitch + SkyrocketGauge
- **Stellar** — commit `d144773` :
  - Groupement par date (ex "Dimanche 19 avril") — format naturel pour daily
  - Chaque team → `<StellarSavedTeamCard>`

### Props critiques (ne pas oublier — commit `af87d31`)
```jsx
<RecapTab players={players} logos={logos} lang={lang} />
```
Sans `players`, `enrichPick()` ne trouve aucun joueur frais → tous les picks affichent DNP faussement.

### Enrichissement des picks
- `enrichTeamWithBestCards(team, cardsBySlug)` : pour chaque pick sans `_card`, assigne la meilleure carte Sorare du joueur (migration legacy)
- `computeTeamScores(team, players)` via `proScoring.js` : enrichit last_so5_* + calcule totaux
- Les cartes Pro viennent de `localStorage["pro_cards_cache"]`, les Stellar de `sessionStorage["sorare_cards_cache"]`

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

## 🔄 Pipelines

### Daily — Scores SO5 matchs joués
```
./MAJ_daily.sh
  ↓ python3 fetch_gw_scores.py   (fuzzy clubs + smart-skip, ~30-60s en steady state)
  ↓ npm run build                 (Vite, ~1s)
  ↓ npx wrangler pages deploy dist  (Cloudflare Pages direct upload)
  ↓ rsync dist → scout-dist/       (mirror legacy)
  ↓ git add scout-dist + data + src → git commit → git push
```

### Vendredi — MAJ avant GW (prochaine journée)
```
./fetch_vendredi.sh
  ↓ fetch_player_status.py   (titu_pct, injured, suspended)
  ↓ fetch_fixtures.py         (prochaine journée)
  ↓ merge_data.py             (merge)
  ↓ build
```

### Mercredi — MAJ hebdo complète
```
./fetch_mercredi.sh
  ↓ fetch_all_players.py      (stats scoring complet 4 ligues)
  ↓ fetch_fixtures.py + fetch_player_status.py + merge
  ↓ build + deploy
  ↓ fetch_prices.py EN FOND   (~25min/ligue)
```

### Routine hebdo complète
```
1. fetch_all_players.py  → Scrape 4 ligues via API Sorare (detailedScores + so5Scores)
2. reclassify_v3.py      → Archétypes V3
3. merge_data.py         → players.json normalisé
4. patch_final.py        → Corrections si nécessaire
5. fetch_fixtures.py     → Prochaine journée (football-data.org)
6. fetch_gw_scores.py    → Scores SO5 matchs joués
7. ./deploy.sh           → Build + Cloudflare + mirror + push
```

---

## 🚀 Déploiement

### ⚠️ Cloudflare Pages est en **Direct Upload** (pas auto-deploy GitHub)
Git push sert uniquement de backup/historique. **Seul `./deploy.sh` ou `./MAJ_daily.sh` met en prod.**

### Commandes (Mac ou PC)
```bash
cd ~/Documents/Deglingo-scout   # ou autre path
git pull origin main
./deploy.sh         # build + wrangler + mirror + push GitHub
# ou
./MAJ_daily.sh      # fetch scores + deploy complet
```

### Scripts `.bat` équivalents sur Windows (PC bureau)
- `deploy.bat` / `MAJ_daily.bat` / `fetch_vendredi.bat` / `fetch_mercredi.bat`
- Utilisent `py` au lieu de `python3`

### Rollback en cas de plantage prod
Cloudflare Dashboard → Workers & Pages → `deglingo-sorare` → Deployments → find un ancien OK → `...` → Rollback. Instantané (~30s).

---

## 🔗 GitHub & Stack déploiement

- **Repo unique** : `github.com/deglongompg/Deglingo-scout` (branche `main`)
- **Prod** : `scout.deglingosorare.com` (Cloudflare Pages, projet `deglingo-sorare`)
- **Legacy mirror** : `deglingosorare.com/scout` (via Wix, sync via `scout-dist/`)
- **KV namespace** : `TEAMS_KV` bindé Production + Preview (cf. `deglingo-scout-app/SETUP_KV.md`)
- **Secrets** : `.env` local (FOOTBALL_DATA_API_KEY), jamais committé (`.gitignore`)
- **Setup nouveau device** (Mac ou PC bureau) : `git clone` + `npm install` dans `deglingo-scout-app/` + `npx wrangler login` + copier `.env` manuel

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

## ⚠️ Règles sacrées à respecter

1. **Pas d'IIFE dans JSX** : écrans noirs garantis en prod Cloudflare. Utiliser expressions inline ou extraire vers variables avant le return.
2. **NE PAS toucher le flow OAuth Sorare** (`token/proxy/query`) sans test prod : localStorage Bearer + cards(first:50) + `... on Card` fragment
3. **Cloudflare Cards Function** : déployée dans `deglingo-scout-app/functions/`, timeout 30s, max 39 pages, rarities filter KO (filtrer côté client)
4. **Database = source unique** : `players.json` alimente tous les onglets, jamais d'override inline dans les composants
5. **Captain bonus** = `raw_so5 × 0.5` (PAS post-bonus × 0.5). Confirmé par comparaison score réel Sorare.
6. **min_15 ?? floor** : le D-Score utilise `min_15` comme floor quand disponible (plus fiable car L15)
7. **Logos** : `club_logos.json` couvre 3 systèmes de noms différents (football-data.org, teams.json, players.json)
8. **D-Score 60 = gold/jaune**, seuil à 55 pas 60
9. **Badge D-Score** = rond avec gradient (dsBg), jamais hexagonal
10. **Toujours passer `players` + `logos`** aux composants qui font `enrichPick()` — sinon DNP faux positifs
11. **Pas d'emoji flags** : Windows compat → utiliser `flagcdn.com` images
12. **ALIASES fetch_gw_scores.py** : maintenir à jour quand nouveaux clubs (ex L2→L1). Noms fixtures.api ≠ players.club.
13. **selectedDays dans Stellar** = dates ISO, pas indices. Ne pas casser en rajoutant `setSelectedDays([])` sur navigation semaine.

---

## 🐛 Debugging — raccourcis

### Les saved teams affichent DNP pour tous les joueurs
→ Vérifier que `RecapTab` reçoit bien `players={players}` en props (cf. `App.jsx`)

### Cartes Sorare n'apparaissent pas dans Mes Teams pitch
→ `enrichTeamWithBestCards()` dans `RecapTab.jsx` assigne `_card` au load (migration legacy pour teams sauvegardées avant le schéma `_card`)

### Scores stales après MAJ_daily.sh
→ Cloudflare ou browser cache. Le `?v={Date.now()}` en App.jsx bypass le cache navigateur. Si persiste : `Cloudflare dashboard → Caching → Purge Everything`

### Match-chip FT absent sur un match pourtant joué
→ `fetch_gw_scores.py` peut avoir manqué un club par mismatch de nom. Ajouter l'alias dans `ALIASES` dict. OU Sorare API n'a pas encore scoré ce match (délai API) — attendre 24h.

### Preview Cloudflare pour tester sans polluer prod
- Push sur une branche autre que `main` → Cloudflare build un preview
- URL : `{hash}.deglingo-sorare.pages.dev`
- Pour OAuth : copier le token prod via devtools console (`copy(localStorage.getItem("sorare_access_token"))`) puis `localStorage.setItem(...)` sur preview (redirect_uri est hardcodé sur prod)

---

## 🔮 Roadmap / Idées futures

**Done (depuis V4)**
- [x] Cloudflare Pages déploiement (Direct Upload mode)
- [x] Onglet Sorare Pro avec saved teams cross-device (KV)
- [x] Onglet Sorare Stellar avec multi-jours cross-semaines
- [x] Onglet Mes Teams (recap centralisé Pro + Stellar)
- [x] OAuth Sorare + fetch cartes réelles (pro_cards_cache + sorare_cards_cache)
- [x] Scores SO5 live (fetch_gw_scores.py avec fuzzy + smart-skip)
- [x] Calendrier Pro/Stellar avec badge FT + dropdown joueurs par match
- [x] DNP detection sur saved teams
- [x] Prix L€/R€ Sorare marketplace (fetch_prices.py)

**En cours / TODO**
- [ ] **Fix CAP260 avec `sorare_l10` officiel** — écrire `fetch_sorare_l10.py`, ajouter `sorare_l10` dans players.json, remplacer `p.l10` par `p.sorare_l10` aux lignes 733 et 1403 de `SorareProTab.jsx`. Bug : Psal78 affiche +6% CAP alors que Sorare dit +4%.
- [ ] **Card-specific position** (Kvara Classic = MIL) — override JSON `card_position_overrides.json` + filtre slot après expansion
- [ ] **Seal teams Pro après deadline** — détecter `Date.now() > gwInfo.deadline` → bloquer Charger/X/Save
- [ ] **Live scores polling** — Cloudflare Function proxy Sorare API toutes les 60s pour live scores pendant les matchs
- [ ] **Unifier DNP dans computeTeamScores** — actuellement DNP géré dans 4 surfaces séparément (SorareProTab inline, StellarTab inline, ProSavedTeamCard, StellarSavedTeamCard). Intégrer dans `proScoring.js::getPickScore` pour factoriser.

---

## 📞 Liens utiles

- **Repo GitHub** : https://github.com/deglongompg/Deglingo-scout (unique, branche `main`)
- **Prod** : https://scout.deglingosorare.com
- **Legacy mirror** : https://deglingosorare.com/scout
- **Sorare API** : https://api.sorare.com/federation/graphql
- **Affiliate link** : http://sorare.pxf.io/Deglingo
- **Football-data.org API** : https://api.football-data.org/v4/ (clé dans `.env` local, **jamais committée**)
- **Cloudflare Dashboard** : https://dash.cloudflare.com → Workers & Pages → `deglingo-sorare`
- **KV namespace** : `TEAMS_KV` (binding Production + Preview)
- **Setup doc** : `deglingo-scout-app/SETUP_KV.md`
- **Handoff session courante** : `SESSION_HANDOFF.md` (état + bugs + TODOs à date)
