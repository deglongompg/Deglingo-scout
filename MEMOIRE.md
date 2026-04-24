# MEMOIRE DEGLINGO SCOUT — Connaissances critiques a ne JAMAIS reoublier

> **Claude Code :** lis ce fichier EN PREMIER avant tout travail sur le fetch titu%.
> Chaque entree ici a coute plusieurs heures de debug. Ne repete pas les chemins morts.

---

## 🔥 SORARE GRAPHQL — schema titu% (decouvert 2026-04-22, 5h de chasse)

### La VERITE ultime

Le titu% precis (equivalent Sorareinside, avec fiabilite HIGH/MEDIUM/LOW) est dispo
dans l'API Sorare federation sous :

```
Game.playerGameScores → [PlayerGameScore]
  PlayerGameScore {
    id: "PlayerGameScore:<uuid>"
    anyPlayer → Player            # interface ! fragment: ... on Player { slug displayName }
    anyPlayerGameStats → PlayerGameStats {
      footballPlayingStatusOdds {
        starterOddsBasisPoints    # titu% × 100 (ex: 4000 = 40%)
        reliability               # HIGH | MEDIUM | LOW
        providerIconUrl           # sorare_inside.png
        providerRedirectUrl       # https://sorareinside.com
      }
    }
  }
```

### Query qui marche (copy-paste direct)

```graphql
query($id: ID!) {
  football {
    game(id: $id) {
      playerGameScores {
        __typename
        ... on PlayerGameScore {
          id
          anyPlayer {
            ... on Player { slug displayName }
          }
          anyPlayerGameStats {
            ... on PlayerGameStats {
              footballPlayingStatusOdds {
                starterOddsBasisPoints
                reliability
              }
              anyTeam { ... on Club { slug } }
            }
          }
        }
      }
    }
  }
}
```

- `$id` : **UUID brut** (`db595776-a88c-4846-ae43-83473161e4d1`), **PAS** `Game:UUID`
- Renvoie ~63 entries pour un match (roster complet 2 equipes)
- ~55 avec odds dispo (les 8 manquants = staff/juniors/pas encore note)
- Fiable pour matchs **weekend ET mid-week** (≠ `nextClassicFixturePlayingStatusOdds`)

### Types GraphQL verifies

| Type                             | Kind         | Champs utiles                                   |
|----------------------------------|--------------|-------------------------------------------------|
| `Game`                           | type         | `playerGameScores`, `anyPlayers`                |
| `PlayerGameScore`                | type         | `id`, `anyPlayer`, `anyPlayerGameStats`         |
| `PlayerGameStats`                | type         | `footballPlayingStatusOdds`, `fieldStatus`, `anyTeam`, `projection` |
| `AnyPlayerInterface`             | interface    | (besoin de `... on Player { slug }`)            |
| `AnyPlayerGameStatsInterface`    | interface    | (besoin de `... on PlayerGameStats { ... }`)    |
| `PlayingStatusOdds`              | type         | `starterOddsBasisPoints`, `reliability`, `providerIconUrl` |

### Formats d'ID

- Dans la query : **UUID brut** (sans prefixe)
- Dans la reponse : `"Game:<uuid>"`, `"PlayerGameScore:<uuid>"`, `"PlayerGameStats:<uuid>"`
- `node(id:)` accepte les IDs prefixes `"PlayerGameStats:<uuid>"`

---

## 🧨 CHEMINS MORTS a NE PAS re-essayer

| Tentative                                                  | Resultat                                  |
|------------------------------------------------------------|-------------------------------------------|
| `Game.anyPlayerGameStats`                                  | ❌ "doesn't exist. Did you mean `anyPlayers`" |
| `Game.playerGameStats`                                     | ❌ "doesn't exist. Did you mean `playerGameScores` or `playerGameScore`" |
| `Game.lineup`, `Game.playingPlayers`, `Game.anyLineups`    | ❌ "doesn't exist"                        |
| `Game.anyPlayers`                                          | ⚠️  retourne juste `[Player]` (63 items), PAS les odds |
| `Player.footballPlayingStatusOdds`                         | ❌ "doesn't exist on type Player"         |
| `Player.nextClassicFixturePlayingStatusOdds`               | ⚠️  renvoie `null` en mid-week            |
| `Player.playingStatus` (enum STARTER/REGULAR/SUBSTITUTE)   | ⚠️  generique, pas precis par match       |
| Introspection `__type(name: "Game")` et compagnie          | ❌ disabled cote API Sorare federation    |
| `id = "Game:<uuid>"` dans la query                         | ❌ fails — il faut l'UUID nu              |
| Scraping `__NEXT_DATA__` sur `sorare.com/football/players/...` | ❌ page SSR sans les odds            |

---

## ✅ SCRIPT A UTILISER : `fetch_titu_fast.py`

Appele depuis `MAJ_turbo.sh` etape `[2bis/6]`.

```bash
python3 fetch_titu_fast.py              # full, patch players.json
python3 fetch_titu_fast.py --dry-run    # pas de patch
python3 fetch_titu_fast.py --game <uuid> --dry-run   # 1 match
python3 fetch_titu_fast.py --days 5     # fenetre plus large (default 3)
python3 fetch_titu_fast.py --probe      # debug si schema change encore
python3 fetch_titu_fast.py --introspect # si API ouvre un jour introspection
```

- Recupere les Game UUIDs via `so5.inProgressSo5Fixture + futureSo5Fixtures`
- 4 workers parallele, ~5-10s pour tous les games de 3 jours
- Patche `sorare_starter_pct` (0-99) + `sorare_starter_reliability` dans `players.json`

Fallback Sorareinside encore dispo dans `MAJ_turbo.sh` (si l'API Sorare plante un jour).

---

## 📸 SCREENSHOT DE REFERENCE — DevTools PSG-Nantes 2026-04-23

Obtenu sur `sorare.com/fr/football/scores/matches/db595776-a88c-4846-ae43-83473161e4d1/lineups` :

```
{
  __typename: "PlayerGameScore",
  id: "PlayerGameScore:74aead37-0af2-40f1-8892-12673bd559f5",
  anyPlayer: {
    __typename: "Player",
    slug: "desire-doue",
    displayName: "Désiré Doué",
    cardPositions: ["Forward", "Midfielder"]
  },
  anyPlayerGameStats: {
    __typename: "PlayerGameStats",
    id: "PlayerGameStats:737e9e9d-ecaa-4509-8da1-c1b9d21f9f00",
    anyTeam: { __typename: "Club", slug: "psg-paris" },
    fieldStatus: "UNKNOWN",
    footballPlayingStatusOdds: {
      __typename: "PlayingStatusOdds",
      starterOddsBasisPoints: 4000,     ← 40% titu
      reliability: "MEDIUM",
      providerIconUrl: "...sorare_inside.png",
      providerRedirectUrl: "https://sorareinside.com"
    }
  }
}
```

Valide a l'UI Sorare : panneau gauche "Previsions des titulaires" montre
"Désiré Doué 40%" — match exact avec `starterOddsBasisPoints: 4000 / 100`.

---

## 🛠 PROCESS DEBUG GraphQL QUAND SORARE CHANGE SON SCHEMA

Sorare modifie regulierement le schema (ex : `status` → `statusTyped`). Protocole :

1. **Repro** : ouvre F12 → Network → filtre `graphql` sur la page qui affiche la data voulue
2. **Identifie la query** dans "Payload" (le backend la log)
3. **Confirme la response shape** dans "Preview"
4. **Identifie les interfaces** : si `__typename` apparait en tete d'objet →
   c'est probablement une interface, il FAUT un fragment `... on <ConcreteType>`
5. **Error "Did you mean X"** est ton meilleur ami : GraphQL suggere le vrai nom
6. **Introspection `__type(name)`** : si ça marche utilise la.
   Si tu obtiens "type introuvable" → introspection disabled, fais du probing field-par-field
7. **Format d'ID** : essaie l'UUID nu ET l'UUID prefixe (`"Game:<uuid>"`)

---

## 🔑 .env (rappel)

```bash
FOOTBALL_DATA_API_KEY=<cle football-data.org>  # gratuite
SORARE_API_KEY=<cle Sorare>                     # developers.sorare.com
SORAREINSIDE_PASSWORD=<mdp Sorareinside>        # fallback seulement
```

Sans `SORARE_API_KEY` : complexity max 500 → inutilisable pour batch.
Avec : complexity 30000 → batch 150 players OK.

---

## 📂 Fichiers cles du projet

| Fichier                              | Role                                          |
|--------------------------------------|-----------------------------------------------|
| `fetch_titu_fast.py`                 | **Titu% precis via API Sorare** (primaire)    |
| `fetch_player_status.py`             | Injured/suspended/proj + titu% fallback enum  |
| `fetch_sorareinside.py`              | Fallback titu% via Sorareinside si API plante |
| `fetch_gw_scores.py`                 | Scores SO5 matchs joues                       |
| `fetch_fixtures.py`                  | Fixtures 5 ligues (football-data.org)         |
| `fetch_all_players.py`               | Gros rebuild L5/L10/AA (batch V3, ~20min pour 5 ligues) |
| `fetch_prices.py`                    | Prix marketplace Limited + Rare               |
| `build_sorare_club_slugs.py`         | Genere mapping club → slug Sorare             |
| `MAJ_turbo.sh` / `.bat`              | Pipeline daily 7 etapes (~8 min)              |
| `MAJ_hebdo.sh` / `.bat`              | Pipeline hebdo 2 etapes + turbo (~20-30 min)  |
| `install_schedule.bat`               | Installe les 2 taches Task Scheduler PC       |
| `debug_titu_via_game.py`             | Introspection GraphQL sur un Game             |
| `deglingo-scout-app/public/data/players.json` | Source de verite 1450 joueurs        |

---

## ⚡ PERF fetch_all_players.py V3 (2026-04-22)

Avant V3 : 2 queries/joueur sequentiel → ~8 min pour 5 ligues (soit ~40 min avec ban/rate-limits occasionnels)

V3 :
- **Fusion Q_MAIN + Q_DETAIL** en un seul `PLAYER_FRAGMENT`. `so5Scores(last:40)` peut
  contenir en meme temps `allAroundStats` ET `detailedScore`. Plus besoin de 2 queries.
- **Batch GraphQL** avec aliases `p0..p19` = 20 joueurs par requete (complexity ~20k/30k)
- **ThreadPoolExecutor 4 workers** en parallele
- Flag `--legacy` pour retomber sur le mode ancien si le batch plante

Gain mesure : 3500 joueurs (5 ligues) en **~20 min** (vs ~40 min avant).

### Si on veut aller plus vite encore
Paralleliser `fetch_club_players` (30 clubs en parallele) + batch 30 au lieu de 20 +
workers 6 au lieu de 4. Gain attendu : 20min → ~10min. Pas prioritaire pour l'instant.

### Ajout nouveaux championnats
Pour ajouter Belgique / Pays-Bas / Japon / Coree :
1. Ajouter dans `LEAGUE_SLUGS` (fetch_all_players.py) : slug Sorare exact
2. Ajouter dans `LEAGUE_FILES` : nom fichier deglingo_*_final.json
3. Ajouter dans `VALID_COMPS` : slug competition (pour filtrer so5Scores)
4. Ajouter dans `merge_data.py:LEAGUES` pour le merge
5. Ajouter dans `fetch_fixtures.py` (football-data.org) : league code
6. Frontend : drapeau + entree dans le filtre ligues (`App.jsx` / `DbTab.jsx`)

---

## 🔁 PIPELINE DAILY TURBO — architecture peremne

### Vue d'ensemble (MAJ_turbo.sh, ~3min)

```
[1/7] fetch_fixtures.py        → fixtures.json (football-data.org, 5 ligues)
[2/7] fetch_player_status.py   → player_status.json + patch players.json (enum fallback)
[3/7] fetch_gw_scores.py       → players.json patch (last_so5_* scores matchs joues)
[4/7] merge_data.py            → rebuild players.json from raw + status
       ⚠️  CRITIQUE : merge_data.py ECRASE sorare_starter_pct depuis player_status.json !
           C'est pour ca que fetch_titu_fast.py tourne APRES, pas avant.
[5/7] fetch_titu_fast.py       → players.json OVERRIDE sorare_starter_pct + reliability
       └── si pas de sorare_club_slugs.json : build_sorare_club_slugs.py (auto)
       └── fallback : fetch_sorareinside.py (si SORAREINSIDE_PASSWORD dispo)
[6/7] npm run build
[7/7] wrangler pages deploy + mirror scout-dist/ + git push
```

**🐛 Bug historique (2026-04-22)** : avant, fetch_titu_fast tournait AVANT merge_data.
Resultat : ses valeurs precises (40% Doué, 60% Barcola) etaient ECRASEES par les enum
de player_status.json (70% REGULAR, 25% SUBSTITUTE) lors du merge. Les joueurs PSG
apparaissaient tous a 70%. **Corrige** : fetch_titu_fast.py apres merge_data.py
→ sa valeur est la derniere ecriture, rien ne l'ecrase. **Ordre DEFINITIF.**

### Fichiers de config (dans le repo, committes)

| Fichier                    | Role                                               | Maj quand ?                |
|----------------------------|----------------------------------------------------|----------------------------|
| `sorare_club_slugs.json`   | Mapping nom club → slug Sorare (ex: PSG → psg-paris) | Promotion L2→L1, rename Sorare |
| `.env` (pas committe)      | FOOTBALL_DATA_API_KEY + SORARE_API_KEY             | Rotation API keys          |

### Maintenance — scenarios courants

**🚩 Nouveau club promu (ex: Nantes redescend, Reims remonte)**
```bash
python3 build_sorare_club_slugs.py    # regenere le mapping
git add sorare_club_slugs.json && git commit -m "chore: MAJ club slugs Sorare"
```

**🚩 Sorare change le nom d'un field GraphQL (ex: playerGameScores devient ...)**
1. Ouvre F12 sur sorare.com/football/scores/matches/{uuid}/lineups
2. Filtre Network `graphql`, regarde le Payload de la requete
3. Adapte `Q_LINEUP` dans `fetch_titu_fast.py` avec le nouveau nom
4. Teste : `python3 fetch_titu_fast.py --game <uuid> --dry-run --verbose`
5. Si 0 resultat, lance le probe : re-introduire le mode probe si besoin

**🚩 API Sorare down temporairement**
- Fallback auto vers Sorareinside (si `SORAREINSIDE_PASSWORD` dans .env)
- Sinon enum `playingStatus` (STARTER/REGULAR/SUBSTITUTE) via `fetch_player_status.py`
- Apres 24h, relancer `./MAJ_turbo.sh` — auto-correct

**🚩 "X clubs sans upcomingGames" dans les logs**
- Soit le club est en Championship/L2 (pas supporte) → ignorer
- Soit le slug est mauvais → `build_sorare_club_slugs.py` pour regenerer

### Debug rapide

```bash
# 1 seul game (PSG-Nantes) pour tester le fetch
python3 fetch_titu_fast.py --game db595776-a88c-4846-ae43-83473161e4d1 --dry-run

# Verbose pour voir les logs par game
python3 fetch_titu_fast.py --verbose --dry-run

# Regenerer le mapping club-slug
python3 build_sorare_club_slugs.py --verbose
```

---

## 📅 AUTOMATION Task Scheduler PC (2026-04-22)

### Architecture des MAJ

| Jour            | Script         | Duree attendue | Role                                                     |
|-----------------|----------------|----------------|----------------------------------------------------------|
| Lu/Ma/Je/Ve/Di  | MAJ_turbo.bat  | ~8 min         | fixtures + titu% + scores + build + deploy               |
| **Me + Sa**     | MAJ_hebdo.bat  | ~20-30 min     | full rebuild L5/L10/AA + prix + tout le turbo            |

Mercredi = post matchs mid-week (Mar-Mer soir).
Samedi = post deadline GW Vendredi 16h + matchs weekend.

### Installation (UNE fois, clic droit -> Admin)

```cmd
cd C:\chemin\vers\Deglingo-scout
git pull origin main
install_schedule.bat          REM defaut 06:00
install_schedule.bat 07:30    REM ou autre heure
```

Cree 2 taches Windows :
- **"Deglingo Scout MAJ Daily"** (Lu/Ma/Je/Ve/Di a 06:00)
- **"Deglingo Scout MAJ Hebdo"** (Me+Sa a 06:00)

Logs ecrits dans `maj_log_daily.txt` et `maj_log_hebdo.txt` a la racine du repo.

### Commandes utiles

```cmd
schtasks /Query /TN "Deglingo Scout MAJ Daily" /V /FO LIST
schtasks /Run   /TN "Deglingo Scout MAJ Daily"     REM test maintenant
schtasks /Delete /TN "Deglingo Scout MAJ Daily" /F REM supprimer
type maj_log_daily.txt
```

### Prerequis PC

1. PC allume a 06:00 (ou activer "Reveiller l'ordinateur" dans Task Scheduler GUI)
2. `.env` avec FOOTBALL_DATA_API_KEY + SORARE_API_KEY
3. `npx wrangler login` fait une fois (pour deploy Cloudflare)
4. `py` dans le PATH (Python 3)

---

**TL;DR** : `game.playerGameScores → PlayerGameScore.anyPlayerGameStats → PlayerGameStats.footballPlayingStatusOdds.starterOddsBasisPoints`. UUID brut. Fragments sur interfaces. Mapping `sorare_club_slugs.json` pour passer par `club.upcomingGames`. Task Scheduler 2 taches : Daily (Lu/Ma/Je/Ve/Di) + Hebdo (Me/Sa).

---

## 🌍 LIGUES STELLAR — a synchroniser quand Sorare sort une nouvelle ligue

### Actuellement actives (2026-04-23)

`STELLAR_LEAGUES = ["L1", "PL", "Liga", "Bundes"]` (dans `StellarTab.jsx:33`)

Bundesliga ajoutee le 2026-04-23 apres sortie Sorare des cartes allemandes Stellar.
MLS pas encore dans Stellar cote Sorare.

### Ajouter une ligue a Stellar quand Sorare la sort (procedure 3 lignes)

1. `STELLAR_LEAGUES.push("Xxx")` dans `deglingo-scout-app/src/components/StellarTab.jsx`
2. Ajouter un cas couleur dans le rendu des dots calendrier (`StellarTab.jsx:1466`).
   Couleurs par ligue : L1=`#4FC3F7`, PL=`#B388FF`, Liga=`#FF8A80`, Bundes=`#FFD180`.
3. Build + deploy. C'est tout — le reste (fixtures, scores, titu%) tourne deja pour
   les 5 ligues via fetch_fixtures / fetch_gw_scores / fetch_titu_fast. Les data
   Bundes etaient deja dans players.json et fixtures.json, juste filtrees hors Stellar.

### Ce qui NE change PAS quand on ajoute une ligue a Stellar

- **Pipeline fetch daily (MAJ_turbo.bat)** : deja les 5 ligues + UCL/UEL/UECL. Pas de
  modif.
- **players.json** : tous les joueurs 5 ligues deja la.
- **Scores SO5** : fetch_gw_scores inclut tous les clubs des fixtures.
- **Titu%** : fetch_titu_fast via sorare_club_slugs.json (112 clubs).
- **ALIASES** : dans fetch_gw_scores.py, deja maintenus pour Bundes
  (`SC Freiburg`, `TSG 1899 Hoffenheim`).

### Aliases Bundes dans clubMatchGlobal (StellarTab.jsx:84)

Les noms fixtures.json (football-data.org) et players.json (Sorare) divergent :
- RasenBallsport Leipzig / RB Leipzig
- FC Cologne / 1. FC Köln
- Bayern Munich / FC Bayern München
- Borussia M.Gladbach / Borussia Mönchengladbach
- FC Heidenheim / 1. FC Heidenheim 1846
- Mainz 05 / 1. FSV Mainz 05
- Union Berlin / 1. FC Union Berlin

Tous gerés via ALIASES dans clubMatchGlobal. **Règle critique** : les syns
courts (< 5 chars comme "om"/"ol"/"sg") matchent en **mot entier** uniquement
(regex `\b...\b`), sinon faux positifs catastrophiques (ex "ol" matchait
"wolfsburg", "liverpool", "cologne"...).

---

## 🃏 POSITION DE CARTE — Card.position vs Player.position (2026-04-24)

### Le probleme

Sur Sorare, un joueur peut changer de position au fil des saisons (ex Cherki
2020 = ATT, 2023 = MIL, aujourd'hui = MIL). Chaque carte a sa position d'emission
figee. Pour Sorare Pro (surtout competitions "old-school" avec anciennes cartes),
il faut utiliser la position de la CARTE, pas du joueur actuel.

### Le champ Sorare

`Card.position` expose la position d'emission de la carte (confirme via test
endpoint 2026-04-24). Valeurs : `"Goalkeeper" | "Defender" | "Midfielder" | "Forward"`.

Query (cards.js) :
```
... on Card { sealed position player { slug displayName position } }
```

### Pattern dans le code

Mapping Sorare -> format interne (SorareProTab.jsx + StellarTab.jsx) :
```js
const SORARE_POS_TO_SHORT = { Goalkeeper: "GK", Defender: "DEF", Midfielder: "MIL", Forward: "ATT" };
```

Chaque carte stocke `cardPosition` (fallback playerPosition si absent).
Dans le rendu (pool, pitch, filtre slot), utiliser :
```js
const pos = p._card?.cardPosition || p.cardPosition || p.position;
```

Fichiers touches (commits `96c3794` + `9fc95d3`) :
- `functions/api/sorare/cards.js` : query enrichie
- `StellarTab.jsx` parseCard
- `SorareProTab.jsx` parseCard + addToTeam + visiblePlayers slot filter + pool rendu

### Cache a vider apres un changement query

```js
localStorage.removeItem("pro_cards_cache");
localStorage.removeItem("pro_cards_cache_time");
sessionStorage.removeItem("sorare_cards_cache");
```

---

## 🎯 CAPTAIN BONUS — formule Sorare officielle (2026-04-23)

**Captain bonus = `raw × 0.5`** (PAS post-bonus × 0.5). Confirme par math
Equipe 1 user Sorare (398.66 vs notre 401 avant fix = Yamal captain post-bonus).

Applique partout :
- `proScoring.js::getPickScore`
- `SorareProTab.jsx::getFullScore` + inline recap
- `StellarSavedTeamCard.jsx` + `StellarTab.jsx` inline recap
- `RecapTab.jsx::computeStellarProjected`

### Captain figé au save (Stellar, commit `ce31130`)

`saveCurrentTeam` calcule `team.captain = slot` au moment du save (isCaptain
du pick si user a clique C, sinon meilleur adjDs) et le stocke en dur. Le
render respecte `team.captain` en priorité (avant fallback best postBonus).

**Sans ce fix** : le captain basculait sur le meilleur postBonus apres arrivee
des scores SO5 live (bug Espi -> De la Fuente observe 2026-04-24).

---

## 📊 SCORES BULLES — Math.floor pour matcher Sorare (2026-04-23)

Sorare tronque les scores affiches dans les bulles (pas round). Ex :
- Yamal 74.7 → bulle Sorare `74` (pas 75)
- Hernandez 30.82 → bulle Sorare `30` (pas 31)

Nos bulles utilisent `Math.floor(last_so5_score)` au lieu de `Math.round`.
Applique dans StellarSavedTeamCard, StellarTab inline, ProSavedTeamCard,
SorareProTab inline + dropdown matches.

**Totaux** gardent la précision décimale (somme postBonus non-floored).

---

## 🃏 CARTE EXACTE DU PICK — resolveCardForPick (2026-04-23)

Bug : `sorareCardMap[playerSlug]` retournait toujours la MEILLEURE carte par
joueur. Si user a 2 Pedri (Base 5% + Shiny 10%), le rendu affichait toujours
la Shiny, meme si user a pick la Base.

Fix (commits `6ad00d3` + `ebc19b3` + `ef864da`) :
- Nouveau lookup `sorareCardByCardSlug` (index par cardSlug unique)
- Helper `resolveCardForPick(pick)` : priorite `pick._cardSlug` → fallback best
- Applique partout ou on affiche l'image / le bonus / le calcul pour un pick Stellar

Le pool en mode "Mes cartes" expand chaque carte avec `_cardSlug`,
`_cardTotalBonus`, etc. (ligne 2126 StellarTab.jsx).

---

## 📈 UNDERSTAT xG/xGA/PPDA — fetch_understat.py (2026-04-23)

Teams.json contient xg, xga, ppda, goals, ga, matches pour le D-Score contexte.
Aucun script n'updatait ces stats → frozen depuis debut avril avant le fix.

### Script

`fetch_understat.py` lit les dumps JSON Understat (placés dans `understat_data/`)
et patch teams.json. Update : xG (per match), xGA (per match), PPDA, goals, ga,
matches, wins, draws, loses, xpts. Conserve les splits dom/ext existants.

### Procédure manuelle (chaque Mer/Sam avant MAJ_hebdo)

1. Download https://understat.com/league/Ligue_1 (et EPL, La_liga, Bundesliga)
2. Placer les 4 JSON dans `understat_data/` : ligue1.json, premier_league.json,
   la_liga.json, bundesliga.json
3. Relancer `MAJ_hebdo.bat` → etape [1/3] `py fetch_understat.py` tourne auto

### Pas de MLS

Understat ne couvre pas la MLS. teams.json MLS garde les stats frozen ou
fallback manuel.

### TODO

Scraping automatique Understat pour supprimer le step manuel (extraire le JSON
encode dans `<script>` de la page league).
