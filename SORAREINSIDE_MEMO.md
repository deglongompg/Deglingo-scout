# SORAREINSIDE FETCH — MÉMO DÉBOGAGE
## Dernière MAJ : 2026-04-22 (mercredi), session PSG-Nantes 19h

> **Objectif** : récupérer les vrais titu% Sorareinside pour toute la DB Deglingo Scout,
> en particulier pour les matchs mid-week (Stellar est un jeu journalier).

---

## 🎯 PROBLÈME INITIAL

- **Barcola affiché 40% dans l'app** alors que sur Sorare et Sorareinside c'est différent
- Kaba 0% injured alors qu'il est listé starter à 60% sur Sorare.com (screenshot 22/04)
- Pareil pour Merlin (90% nous vs 80% sorareinside), Nordin (40 vs 30), Rouault (25 vs 20), Nagida (40 vs 30)
- **Valeurs coïncidentes 70/90** → enum Sorare REGULAR/STARTER (pas un vrai override sorareinside)
- **Valeurs "off-enum" 80/30/20** → correspondrait à un vrai fetch sorareinside non-opéré

## 📊 ÉTAT DE L'APP

- **players.json** contient `sorare_starter_pct` alimenté par :
  1. `fetch_player_status.py` (Sorare API) → enum `playingStatus` (STARTER=90, REGULAR=70, SUPER_SUBSTITUTE=40, SUBSTITUTE=25, NOT_PLAYING=0) ou `nextClassicFixturePlayingStatusOdds.starterOddsBasisPoints/100` si dispo
  2. `fetch_sorareinside.py` (Sorareinside API) → override avec valeurs précises

- **MAJ_turbo.sh** enchaîne ces 2 steps + autres fetches + build + deploy
- **Problème mid-week** : `nextClassicFixturePlayingStatusOdds` renvoie `null` pour les matchs non-Classic (mid-week). Seul fallback = enum (peu précis) ou Sorareinside

---

## ✅ CE QU'ON A TESTÉ & RÉUSSI

### 1. Authentification Sorareinside
- **Endpoint** : `POST https://platform-api.sorareinside.com/auth/login`
- **Body** : `{"email": "damien.gheza@gmail.com", "password": "$SORAREINSIDE_PASSWORD"}`
- **Retourne** : cookies de session (HTTP 201)
- **Headers nécessaires** : Origin/Referer = sorareinside.com, User-Agent non-vide

### 2. Fix robustesse fetch_sorareinside.py (commits 9e29a32, 22099ae, 5bfada0)
- **Timeout** : 30s → 60s (weekend GW plantait avant)
- **Retries** : 3x avec backoff exponentiel (1s, 2s, 4s) sur Timeout/ConnectionError
- **WORKERS** : 8 → 4 (moins agressif)
- **max_pages** : 80 → 2000 (~100k items max, permet fetch complet)
- **Continue sur erreur** au lieu de `break` silencieux

### 3. Parser v2 : moyenne pondérée (commit 22099ae)
- Découverte : pour 1 joueur, Sorareinside renvoie N items (N scenarios de formations)
- Ex Warren Zaire-Emery : 4000 items sur 100k fetched (2000 starter conf=70 + 2000 alt conf=30)
- **Mauvaise approche v1** : `max(conf OR total_conf) cap 95` → tout le monde sortait à 95%
- **Bonne approche v2** : `titu% = somme(conf items starter) / somme(conf items starter+alt+bench) × 100`
- Résultat Z-E : **140k / 200k = 70%** ✓ cohérent avec Sorareinside

### 4. Structure de l'endpoint /games?gameweek_slug=X
- **Retourne** : liste de **REGIONS** (28 pour la GW mid-week actuelle)
- **Chaque région** : `{regionCode, regionName, regionFlagUrl, competitions: [...]}`
- **Chaque competition** : `{id: "Competition:uuid", name, slug, pictureUrl, games: [...]}`
- **Chaque game** : `{id: "Game:uuid", homeTeam: {...}, awayTeam: {...}, date, statusTyped, venue, competition: {...}}`
- **homeTeam/awayTeam** : `{id: "Club:uuid", name, slug, pictureUrl, styleGuideColor, country: {code, flagUrl}}`
- **Total** : GW72 = **272 games** à travers 28 régions et ~35 compétitions

### 5. Structure de l'endpoint /lineups?gameweek_slug=X
- **Retourne** : `{"lineups": [...], "count": N, "error": null}`
- **Chaque lineup** : `{id, gameweek_slug, reliability (MEDIUM/HIGH), game_id, team_id, user_id, created_at, first_published_at, updated_at, view_count, is_published, team_slug, formation, notes, competition_slug, ineligibilities_notes, injuries_notes, first_published_at, accessible_for_free, correct_starters_amount, last_edited_by_user_id}`
- **Pagination** : PROBLÈME — `offset=50` semble retourner les MÊMES 188 lineups (pagination buggée ou ignorée ?)
- **GW72** = 188 lineups total (count = 188)

### 6. Structure de l'endpoint /lineups/linedup-players?gameweek_slug=X
- **Retourne** : liste d'items, chaque item = (1 joueur, 1 position dans 1 lineup_id)
- **Keys** : `id, created_at, lineup_id, player_id, lineup_position_index, confidence_percentage, is_alternate, expected_score, is_dnp, is_bench, gk_projected_score, def_projected_score, mid_projected_score, fwd_projected_score, highest_projected_score, highest_xg, highest_anytime_goal_scorer, ps_reliability, total_confidence_percentage, highest_proj_score_plus_confidence, lineups (nested), players (nested)`
- **players nested keys** : `id, slug, position, birth_date, created_at, match_name, updated_at, display_name, fouls_per_game, tackles_per_game, avatar_picture_url, shot_on_target_avg, shot_on_target_proj, yellow_cards_per_game, interceptions_per_game, tack_plus_interceptions_per_game, last_scores, floor_prices`

### 7. Endpoint /gameweeks
- **Retourne** : liste de 50 gameweeks
- **Format slug** : `football-XX-YY-month-year` (ex `football-21-24-apr-2026`)
- **Chaque GW** : `{id, live (bool), aasmState (opened/started/closed), gameWeek, slug, shortDisplayName (ex "GW72")}`

---

## ❌ CE QU'ON A TESTÉ SANS SUCCÈS

### 1. /lineups/linedup-players — limite majeure
- Même avec cap 100k items, on récupère **seulement 62 slugs uniques** sur GW72
- Ces 62 slugs = mélange italien/croate/hollandais/autrichien/coréen (Bukvic, Crisetig, Zampano, Bogarde, Augello, Manhoef, Adelgaard, Ahn, Z-E...)
- **Warren Zaire-Emery EST dedans** (donc L1 partiellement représenté)
- **Barcola, Merlin, Kaba, Doué, Dembélé NE sont PAS dedans**
- **Conclusion** : l'endpoint `linedup-players?gameweek_slug=X` est **filtré/limité** d'une manière qu'on ne comprend pas encore

### 2. Endpoints testés qui ne retournent rien d'utile
- `/lineups/predicted-players` : 404 ou vide
- `/lineups/substitutes` : 404
- `/lineups/benched-players` : 404
- `/lineups/all-players` : 404
- `/lineups/expectedPlayers`, `/lineups/expected-players` : 404
- `/lineups/by-match` : 400 "Invalid lineup ID" (mauvais usage)
- `/lineups/all` : 400 "Invalid lineup ID"
- `/predictions`, `/predictions/all` : 404
- `/starting-xi` : 404
- `/player-odds` : 404

### 3. Filtre competition_slug
- `/lineups?gameweek_slug=X&competition_slug=ligue-1-fr` : 200 mais `n=?` (pas pu parser)
- Variantes `ligue-1-france`, `ligue-1`, `fr-ligue-1` : pareil
- **Pas validé** si le filtre marche vraiment (parser à vérifier)

### 4. Slugs de compétitions (DÉCOUVERTS)
- **Bons slugs confirmés** dans /games :
  - ✅ `ligue-1-fr` (9 games dans GW72)
  - ✅ `premier-league-gb-eng` (7 games)
  - ✅ `bundesliga-de` (9 games)
  - ✅ `laliga-es` (10 games) ← PAS `la-liga-es` !
  - ✅ `mlspa` (15 games) ← PAS `mls-us` !
- **Autres slugs vus** (~35 compétitions au total) :
  - superliga-argentina-de-futbol (14), football-league-championship (11),
  - segunda-division-es (11), campeonato-brasileiro-serie-a (10),
  - serie-b-it (10), serie-a-it (10), ligue-2-fr (9), 2-bundesliga (9),
  - liga-mx (9), primeira-liga-pt (9), spor-toto-super-lig (9),
  - jupiler-pro-league (8), chinese-super-league (8), primera-a (8),
  - liga-pro (8), eliteserien (8), primera-division-pe (8),
  - russian-premier-league (8), primera-division-cl (7),
  - austrian-bundesliga (6), superliga-dk (6), j1-100-year-vision-league (6),
  - eredivisie (6), premiership-gb-sct (6), k-league-1 (6), super-league-ch (6),
  - 1-hnl (5), afc-champions-league (1)

### 5. /lineups — pagination buggée
- `offset=0` retourne 188 lineups, `offset=50` retourne les MÊMES 188 (pas décalé)
- Donc on a bien les 188 lineups de la GW, mais on ne peut pas paginer au-delà
- PROBABLEMENT l'endpoint renvoie TOUS les lineups dans la 1ere page, le paramètre `limit` est ignoré
- **count: 188** → c'est le vrai total pour la GW72

### 6. PSG-Nantes introuvable dans /games de la GW72
- Match programmé mercredi 22 avril 19h Paris (screenshot Sorare.com confirme)
- Dans les 9 games L1 listés pour GW72, on voit **Angers-PSG 25/04 samedi** mais PAS PSG-Nantes mid-week
- **Mystère** : le match existe sur Sorare.com + Sorareinside.com mais pas dans `/games?gameweek_slug=football-21-24-apr-2026`
- Probe v3 (commit 004d2f7) va scanner les 272 games tous competitions confondus + les GWs adjacentes

---

## 🔑 DÉCOUVERTES CLÉS RÉSIDUELLES

### A. Sorare.com utilise Sorareinside directement
- Screenshot Sorare.com 22/04 : "**Prévisions des titulaires · Fourni par SorareInside**"
- Données affichées (PSG vs Nantes) :
  - João Neves 90% / Warren Z-E 90% / Lucas Hernández 90%
  - Kvara 70% / Hakimi 70% / Dembélé 70% / Pacho 70% / Fabián Ruiz 70%
  - (Nantes) Matthis Abline 80% / Ganago 80% / Lepenant 80% / Machado 80%
  - Coquelin 70% / Youssef 70% / **Kaba 60%** (il est listé starter ! pas blessé)
  - Sissoko 40% / Leroux 30%
  - Barcola pas visible dans le top 11 (soit sub soit à <30%)
- **Donc les prédictions EXISTENT et sont accessibles via UNE API Sorareinside**

### B. /lineups retourne la liste des **drafts d'experts**
- Chaque `lineup` = 1 expert (user_id) qui draft 1 équipe (team_id/team_slug) pour 1 match (game_id)
- Format ex : Lineup #5 de l'expert user_id=b4a01293-... pour team=slaven-koprivnica-koprivnica, formation=3-4-1-2, reliability=MEDIUM, competition=austrian-bundesliga
- 188 lineups dans GW72 → ~7 lineups par match en moyenne (272 games)

### C. Le filtre `linedup-players?gameweek_slug=X` est mystérieusement limité à 62 slugs
- Non lié à pagination (même avec 100k items on a 62 slugs)
- Non lié à l'order alphabétique
- Pas filtrage par league (ont Croate, PL, L1, Autrichien, Coréen mélangés)
- Hypothèse : filtrage par "top-engaged players" ou "subset qui matche certains critères"

---

## 🚀 PROCHAINES ÉTAPES

### 💡 INDICE MAJEUR 2026-04-22 19h Paris
Screenshot Sorareinside.com "PLACE AUX MATCHS" avec sélecteur de **jour** (lun 20, mar 21, mer 22, **jeu 23** selected, ven 24, sam 25, dim 26).
Pour jeu 23 MY (= mercredi 22 soir Europe), filtre à droite montre :
- Ligue 1: 1 (PSG-Nantes)
- Premier League: 2 (Burnley-Man City, Bournemouth-Leeds)
- Primera División: 3
- Bundesliga: 3
- MLS: 11
- + Eredivisie, Liga MX, Liga Pro, Championship, HNL, etc.

**Sorareinside UI filtre par DATE, pas par gameweek_slug.** → il y a probablement un endpoint `/games?date=YYYY-MM-DD` ou similaire qu'on n'a pas encore testé.

PSG-Nantes est DANS Sorareinside, juste inaccessible via `gameweek_slug=football-21-24-apr-2026`.

### 1. Probe v3 (pushé - commit 004d2f7)
Scan des 272 games de GW72 pour trouver PSG-Nantes tous competitions confondus.
Si pas trouvé → fallback GW adjacentes (71, 73).

### 2. Probe v4 (à écrire)
Test endpoints date-based : `/games?date=2026-04-22`, `/games?from=X&to=Y`, etc.

### 2. Si PSG-Nantes trouvé dans /games
Tester `/lineups?game_id=Game:uuid` (avec/sans préfixe) pour isoler ses lineups spécifiques.
Puis tester `/lineups/linedup-players?lineup_id=xxx` pour les players de 1 lineup.

### 3. Architecture cible du nouveau fetch_sorareinside.py
```
1. Auth login Sorareinside
2. Fetch /gameweeks pour connaître les GW courantes (vs utiliser fixtures Sorare)
3. Pour chaque GW active (started/opened) :
   a. Fetch /games?gameweek_slug=X → 272 games à travers 28 régions
   b. Filtrer par competition_slug ∈ {ligue-1-fr, premier-league-gb-eng, laliga-es, bundesliga-de, mlspa}
   c. Pour chaque match cible :
      - Fetch /lineups?game_id=X → ~7 drafts d'experts
      - Pour chaque draft : fetch /lineups/linedup-players?lineup_id=Y → players
      - Agrège titu% via parser v2 (moyenne pondérée starter/alt/bench)
4. Patcher players.json via sorare_slug matching
```

### 4. Règles de fetch
- Input : 5 ligues principales pour l'instant (L1, PL, Liga, Bundes, MLS)
- Extensible : pouvoir ajouter Serie A, Portugal, Eredivisie, etc. plus tard
- Fréquence : MAJ_turbo.sh peut tourner plusieurs fois par jour
  - Critique pour Sorare Stellar (jeu daily, 2-4h avant coup d'envoi)
  - Moins critique pour Sorare Pro (deadline Ven/Mar 16h)

---

## 📁 Fichiers pertinents

- `fetch_sorareinside.py` — script principal à réécrire
- `fetch_player_status.py` — fetch Sorare API (playingStatus + odds basisPoints)
- `MAJ_turbo.sh` — pipeline quotidien
- `MAJ_titu.sh` — MAJ titu% seule (rapide)
- `debug_*.py` — 5+ scripts de probe créés cette session
- `.env` local : `SORAREINSIDE_PASSWORD=Jujudada15$` + `SORARE_API_KEY=...`

## 🏗 Branche de travail
- Branche `claude/fix-sorare-fetch-pyb2n` (à merger dans main quand OK)
- Repo chemin Mac : `~/Desktop/Deglingo-scout` (pas `~/Documents/`)

## 🔐 Credentials
- Email Sorareinside : damien.gheza@gmail.com
- Password : dans `.env` sous `SORAREINSIDE_PASSWORD`
