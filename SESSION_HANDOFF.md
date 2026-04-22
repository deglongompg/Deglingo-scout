# SESSION HANDOFF — 2026-04-22 (session marathon GW72 mid-week, 5h+)

> **Claude Code :** lis `MEMOIRE.md` EN PREMIER pour le schema GraphQL Sorare.
> Puis ce fichier pour le contexte de la derniere session.
> `git log --oneline -30` pour l'historique detaille.

---

## 🏆 RESUME SESSION 2026-04-22 (du matin au soir, +15 commits)

### Livraisons finales sur `main`

1. **Titu% précis live en prod** — schema Sorare GraphQL découvert et exploité
   (`game.playerGameScores` → `PlayerGameScore.anyPlayerGameStats.footballPlayingStatusOdds`)
2. **Pipeline 7 étapes bulletproof** (MAJ_turbo.sh + .bat)
3. **Pipeline hebdo** (MAJ_hebdo.sh + .bat) — gros rebuild mercredi + samedi
4. **Auto-scheduler PC** (install_schedule.bat) — 2 tâches Task Scheduler
5. **fetch_all_players V3** — batch + workers, ~20 min pour 5 ligues
6. **MEMOIRE.md complet** — schéma GraphQL + chemins morts + procédures maintenance
7. **mapping club slugs** (`sorare_club_slugs.json`) — 112 clubs Sorare officiels

### TODO prochaine session
- [ ] Ajouter 4 championnats (Belgique, Pays-Bas, Japon, Corée)
  Slugs Sorare probables : `jupiler-pro-league-be`, `eredivisie-nl`, `j1-league-jp`, `k-league-1-kr`
- [ ] Procédure dans MEMOIRE.md section "Ajout nouveaux championnats"
- [ ] (Optionnel) Paralléliser `fetch_club_players` pour gagner encore ~10 min

---

## 🔥 2026-04-22 nuit — FETCH TITU% FAST **VALIDE** (5h de chasse)

Apres une chasse epique au schema GraphQL Sorare, **`fetch_titu_fast.py` marche** :
- Field correct : `game.playerGameScores` → liste de `PlayerGameScore`
- Chaque item expose `anyPlayerGameStats.footballPlayingStatusOdds.starterOddsBasisPoints`
- Test sur PSG-Nantes : **55 joueurs avec titu% precis**, valeurs identiques a l'UI Sorare
  (Doue 40%, Dembele 70%, Kvara 70%, Barcola 60%, etc.)
- Marche pour **mid-week ET weekend** (le but initial)

**🧠 Voir `MEMOIRE.md`** pour la doc complete du schema GraphQL — NE PAS re-chercher
ce chemin une 2eme fois, c'est documente pour de bon.

### Trajectoire des tentatives (chemins morts)

- `Game.anyPlayerGameStats` → `Did you mean anyPlayers` ❌
- `Game.playerGameStats` → `Did you mean playerGameScores` ✅ (c'etait la piste)
- `Game.anyPlayers` → renvoie juste `[Player]`, pas les odds ⚠️
- `Player.footballPlayingStatusOdds` → n'existe pas ❌
- Introspection `__type` → disabled cote Sorare ❌
- Scraping `__NEXT_DATA__` frontend → pas les odds dedans ❌
- ID format `Game:<uuid>` dans query → fails, il faut UUID nu ✅

**La cle** : le type parent `PlayerGameScore` porte `anyPlayer` + `anyPlayerGameStats`
(join type). Les interfaces `AnyPlayerInterface` + `AnyPlayerGameStatsInterface`
requierent des fragments `... on Player` / `... on PlayerGameStats`.

---

## 🚀 MISE À JOUR 2026-04-22 soir — Titu% FAST via API Sorare officielle

**Contexte** : on a capture via DevTools (page `/football/scores/matches/{uuid}/lineups`)
le schema GraphQL frontend Sorare. Il expose `anyPlayerGameStats.footballPlayingStatusOdds.starterOddsBasisPoints`
(+ `reliability` = HIGH/MEDIUM/LOW). Ce champ existe sur TOUS les matchs — weekend ET mid-week
— contrairement a `nextClassicFixturePlayingStatusOdds` qui renvoie `null` en mid-week.

**Screenshot** : Désiré Doué → `starterOddsBasisPoints: 4000` = 40% (match ce 23/04), confirme
par l'UI Sorareinside. `reliability: MEDIUM`, `providerIconUrl` pointe vers sorare_inside.png
(Sorare utilise Sorareinside comme provider sous le capot).

### Nouveaux fichiers

**`fetch_titu_fast.py`** — fetch titu% precis via GraphQL officielle (pas besoin de
SORAREINSIDE_PASSWORD). Strategie :
  1. Recupere les Game UUIDs prochains via `so5.inProgressSo5Fixture.games` + `futureSo5Fixtures`
  2. Pour chaque game, batch parallele (4 workers) pour les `playerGameStats` + `footballPlayingStatusOdds`
  3. Patch `players.json` avec `sorare_starter_pct` (precis, 0-99) + `sorare_starter_reliability`

Duree attendue : **5-10 sec** (meme ordre que Sorareinside scraping mais plus robuste).

**`debug_titu_via_game.py`** — script introspection GraphQL (a lancer si `fetch_titu_fast.py`
plante). Sonde Game.{playerGameStats, anyPlayerGameStats, lineup, ...} + introspection pour
confirmer le bon nom de champ sur ce schema federate.

### MAJ_turbo.sh — etape [2bis/6] basculee

Avant : `fetch_sorareinside.py` (scraping Sorareinside).
Apres : `fetch_titu_fast.py` en primaire + Sorareinside en fallback.

```bash
if python3 fetch_titu_fast.py; then
  echo "[2bis/6] OK (via API Sorare)"
else
  # fallback : Sorareinside si cle dispo
  python3 fetch_sorareinside.py
fi
```

### A TESTER SUR MAC

Les noms de champs dans `fetch_titu_fast.py` sont des **GUESSES basees sur le screenshot**.
Si ca plante, lance :
```bash
python3 debug_titu_via_game.py
```
→ affiche le bon field name a hard-coder dans `FIELD_CANDIDATES`.

**Commande complete pour tester** :
```bash
git pull origin claude/found-it-5pIEA
python3 fetch_titu_fast.py --dry-run  # voir si ca passe sans patcher
```

---

## 🚀 MISE À JOUR 2026-04-22 mardi soir — TURBO MAJ complete + Liga mid-week fix

**État prod `scout.deglingosorare.com` = OK ✅**
- Branche `main` HEAD = `6da3215` (fix aliases Liga)
- Workflow quotidien unifie en UNE commande : `./MAJ_turbo.sh` (~90s total)

### Nouveau script magique : `MAJ_turbo.sh`

Script **tout-en-un** pour la MAJ quotidienne complete :
```
[1/6] fetch_fixtures.py        (~30s, API foot-data)
[2/6] fetch_player_status.py   (~10s avec SORARE_API_KEY batch=150)
[3/6] fetch_gw_scores.py       (~2-5s avec batch GraphQL + smart-skip)
[4/6] merge_data.py            (~5s)
[5/6] npm run build            (~5s)
[6/6] wrangler deploy + mirror + git push  (~30s)
```
Temps total ~60-90s. Met a jour **les 3 onglets clients** (Database, Sorare Pro, Sorare Stellar).

### Optimisations perf batch GraphQL

**`fetch_player_status.py`** (commit `2fb7f46` → `2d0b17e`) :
- Batch GraphQL alias p0..pN : 3526 joueurs → ~70 requetes HTTP au lieu de 3526
- ThreadPoolExecutor 4 workers parallel
- Auto-batch 150 si `SORARE_API_KEY` detectee (complexity 30000 vs 500 sans)
- Safety abort si <80% joueurs recus (evite de pourrir `players.json`)
- 7 min → **10-20s** (gain ~25x)

**`fetch_gw_scores.py`** (commit `2895804`) :
- Meme pattern batch + workers + smart-skip
- 22s → **~2-5s** (gain ~10x)

### Liga mid-week : probleme de champ Sorare `nextClassicFixture*`

**Contexte** : `nextClassicFixturePlayingStatusOdds` renvoie NULL pour les matchs **mid-week** (Mardi/Mercredi/Jeudi) qui ne sont pas classes comme "Classic" chez Sorare. Consequence : 98% des joueurs Liga sans titu% avant leur match mid-week.

**Fix** (commit `2d0b17e`) : on fetche AUSSI `player.playingStatus` (enum, gratuit car meme batch). Mapping fallback :

```python
PLAYING_STATUS_TO_PCT = {
    "STARTER":          90,  # titulaire annonce confirme
    "REGULAR":          70,  # titulaire habituel
    "SUPER_SUBSTITUTE": 40,  # remplacant qui rentre souvent
    "SUBSTITUTE":       25,  # remplacant classique
    "NOT_PLAYING":       0,  # hors groupe / blesse
}
```

Priorite : `starterOddsBasisPoints` precis (si dispo) > fallback enum. Le fetch devient agnostique sport/GW.

### Bugs corriges (wave finale)

1. **`fetch_fixtures.py` dotenv manquant** (commit `dc9ebf1`) — `FOOTBALL_DATA_API_KEY` n'etait pas lu depuis `.env`, MAJ_turbo plantait a l'etape 1/6.
2. **`build_player_fixtures` gardait matchs passes** (commit `6a7a5ab`) — pour PSG qui a joue 19/04 et rejoue 22/04, le mapping `player → next fixture` pointait encore vers 04-19 (passe). DbTab masquait alors la colonne Titu% (logique `if last_so5_date >= matchDate`). **Fix** : filtre `date >= today` avant le tri.
3. **Aliases Liga manquants** (commit `6da3215`) — `RC Celta de Vigo` (fixtures) ≠ `RC Celta` (players), pareil `Rayo Vallecano de Madrid` ≠ `Rayo Vallecano`. Ajoutes au dict `ALIASES`.
4. **RecapTab sans props** (commit `af87d31`) — App.jsx passait `<RecapTab lang={lang} />` sans `players`/`logos` → tous les picks DNP faussement. Fix : passer les props.

### Audit complet des 5 ligues (2026-04-22)

| Ligue | fixtures.api | players.clubs | Status |
|-------|-------------|---------------|--------|
| L1 | 18 | 20 | ✅ 13 exact + 3 norm + 2 alias |
| PL | 20 | 24 | ✅ 20 exact |
| Liga | 20 | 21 | ✅ 13 exact + 4 norm + 3 alias (2 nouveaux) |
| Bundes | 18 | 20 | ✅ 15 exact + 2 norm + 1 alias |
| MLS | 32 | 30 | ⚠️ Tigres UANL + Toluca FC (Concacaf, Mexicains, pas dans DB, ignorés silencieusement) |

**Aliases maintenus dans `fetch_gw_scores.py:ALIASES`** :
```python
ALIASES = {
    # Bundesliga
    "SC Freiburg": ["Sport-Club Freiburg"],
    "TSG 1899 Hoffenheim": ["TSG Hoffenheim"],
    # Ligue 1
    "Lille OSC": ["LOSC Lille"],
    "Racing Club de Lens": ["RC Lens"],
    # Liga
    "Deportivo Alavés": ["D. Alavés"],
    "RC Celta de Vigo": ["RC Celta"],
    "Rayo Vallecano de Madrid": ["Rayo Vallecano"],
}
```

### Clefs `.env` (sur Mac + PC)

```
FOOTBALL_DATA_API_KEY=<cle football-data.org>
SORARE_API_KEY=<cle API Sorare, obtenue sur developers.sorare.com>
```

Les 2 sont obligatoires pour `MAJ_turbo.sh`. Sans `SORARE_API_KEY`, batch=50 automatique (~20s au lieu de 10s).

---

# SESSION HANDOFF — 2026-04-19 → 22 (dimanche GW71 → mercredi)

> **Claude Code :** lis ce fichier au démarrage pour reprendre le contexte.
> Source de vérité complémentaire : `git log --oneline -30` et les fichiers modifiés récents.

---

## ⏱ État au 2026-04-22 (fin session Mac, mardi soir / mercredi matin)

**Prod `scout.deglingosorare.com` = OK ✅**
- Branche `main` HEAD = `c6b127b` (chore(nav): masque Best Pick côté clients)
- Tout est déployé en prod via `./deploy.sh` + `./MAJ_daily.sh` lancés depuis le Mac
- Dernier `MAJ_daily.sh` ran le 2026-04-21 : scores GW71 à jour (PSG-OL 1-2, Monaco-Auxerre 2-2, etc.)

### Features majeures livrées cette session (du commit `d144773` au `c6b127b`)

**1. Onglet Stellar dans Mes Teams** (commit `d144773`)
3ème tab à côté de Pro Limited/Pro Rare. Teams groupées par date (pas par ligue). Nouveau composant `StellarSavedTeamCard.jsx` avec pitch + SkyrocketGauge palier Stellar (280→480 pts).

**2. Calendrier Pro — scores FT + dropdown joueurs par match** (commit `ba95ad5`)
Comme Stellar : badge FT vert sur les chips, score "1-2" affiché, click sur nom de club → dropdown avec notes SO5 des joueurs de ce club (position, logo, H/A, score).

**3. Fuzzy club matching dans `fetch_gw_scores.py`** (commit `d2f24c3`)
Les noms de clubs diffèrent entre `fixtures.home_api` (api foot-data) et `players.club` (Sorare). Fix = normalisation (retire accents, suffixes FC/AFC/SC, années 4 chiffres) + dict `ALIASES` manuel pour cas irréductibles (SC Freiburg ↔ Sport-Club Freiburg, Lille OSC ↔ LOSC Lille, etc.). Sans ce fix, Monaco/PSG/Rennes/Freiburg étaient jamais fetchés.

**4. Détection DNP (Did Not Play)** (commits `6e5f9b4` + `af87d31` pour le vrai fix)
Sur les 4 surfaces de rendu (SorareProTab recap inline, ProSavedTeamCard, StellarTab recap inline, StellarSavedTeamCard). Si `matchDate < today` ET `!hasRealScore` → bulle rouge solide 0 + badge "DNP". Score total équipe comptabilisé à 0 (au lieu du D-Score projeté). Match score récupéré via fallback co-équipier.
**⚠️ BUG CRITIQUE FIXÉ (commit `af87d31`) :** App.jsx ligne 293 passait `<RecapTab lang={lang} />` sans `players` ni `logos` → dans Mes Teams, `enrichPick()` ne trouvait JAMAIS de fresh data → TOUS les joueurs affichés en DNP par défaut. Fix 1-ligne.

**5. Fenêtre fetch 7 jours + smart-skip** (commits `a7f2c0e` + `92b330c`)
Bug : `get_gw_start()` prend le Vendredi/Mardi 16h Paris le plus récent → après mardi 16h, les matchs du weekend précédent étaient exclus → jamais re-fetchés. Fix = fenêtre min 7 jours. Pour éviter les 2800+ players fetches (trop long), ajout d'un smart-skip : pour chaque club, retient la date de son dernier match dans la fenêtre, skip tous les players dont `last_so5_date >= cette date`. En steady state : 30-60 players fetchés au lieu de 2800.

**6. Cache-busting sur `/data/*.json`** (commit `fa3b2c2`)
Ajout de `?v={Date.now()}` sur tous les fetch dans App.jsx pour éviter Cloudflare/browser cache qui servait des players.json stales.

**7. Dropdown inclut score=0** (commit `57a761e`)
Enlevé le filtre `last_so5_score > 0` → les DNPs/bench (ex Nuno Mendes PSG) apparaissent maintenant dans le dropdown (triés en bas par score desc).

**8. GW précédente dans le sélecteur Pro** (commit `24abb17`)
`getProGwList()` retourne `[prev, live, +1, +2, +3, +4]`. Badge "GW71 FIN" grisé pour la passée, "GW72 LIVE" pour l'active. L'utilisateur peut consulter ses teams de la GW qui vient de finir. Filtres (titu%, etc.) basculent sur `gwInfo.offsetFromLive` au lieu de `selectedGwIdx <= 1`.

**9. Badge GW dans Mes Teams** (commit `fa63621`)
Les teams Pro sont désormais groupées par `(ligue, GW)` au lieu de juste `(ligue)`. Header collapsible : "Ligue 1 · [GW72] · 2 équipes". Helper `getGwDisplayNumber(gwKey)` dans `proScoring.js`. Stellar garde le groupement par date (format naturel pour daily).

**10. Sélection cross-semaines dans Sorare Stellar** (commit `32032d2`)
`selectedDays` stockait des indices [0-6] relatifs à la semaine affichée → cliquer sur ◀/▶ vidait la sélection. Refactor pour stocker des **dates absolues YYYY-MM-DD**. Navigation entre semaines préserve la sélection. Permet de piquer Mardi (semaine A) + Mercredi (semaine B).

**11. Onglet "Best Pick" masqué** (commit `c6b127b`)
Retiré de la barre de navigation (commenté dans TABS d'App.jsx). Code conservé dans `RecoTab.jsx`, route `?tab=reco`/`#reco` toujours fonctionnelle. Pour réactiver : décommenter la ligne dans `App.jsx:16`.

### Flow des données (validé par user)

> "lors du daily fetch on alimente le score des calendriers pro et stellar avec dropdown des notes par match et ensuite on repartit les notes dans les bulles des equipes sauvegardées dans onglet stellar et pro... quon reprend évidemment dans MES TEAMS pour une vision globale"

Les 4 surfaces (SorareProTab inline recap, StellarTab inline recap, ProSavedTeamCard, StellarSavedTeamCard) utilisent toutes le même `players.json` via les mêmes champs (`last_so5_score`, `last_so5_date`, `last_match_home_goals/away_goals`) → cohérence garantie.

---

## 🔧 Process deploy (rappel)

**Cloudflare NE BUILD PAS automatiquement depuis GitHub main !** Direct Upload mode.

**Commandes Mac :**
```bash
cd ~/Documents/Deglingo-scout   # ou trouver avec : find ~ -type d -name Deglingo-scout
git pull origin main
./deploy.sh          # build + wrangler + scout-dist + push
# ou
./MAJ_daily.sh       # fetch scores + build + wrangler + scout-dist + push
```

Si "Permission denied" sur `.sh` : `chmod +x *.sh` une fois.

---

## 🗂 Bugs connus / TODO

**Pending (hérité sessions antérieures) :**
1. Fix **CAP260 avec `sorare_l10` officiel** — écrire `fetch_sorare_l10.py`, ajouter champ `sorare_l10` dans `players.json`, remplacer `p.l10` par `p.sorare_l10` aux lignes 733 et 1403 de `SorareProTab.jsx`. Bug visible : Psal78 affiche +6% CAP alors que Sorare dit +4%.
2. **Card-specific position** (Kvara Classic = MIL, etc.) — override JSON `card_position_overrides.json` + filtre slot après expansion
3. **Seal teams Pro après deadline GW** — détecter `Date.now() > gwInfo.deadline` → bloquer Charger/X/Save
4. **Live scores polling** — Cloudflare Function proxy Sorare API toutes les 60s pour scores live pendant les matchs
5. **computeTeamScores DNP logic** — la fonction dans `proScoring.js` (`getPickScore`) ne gère pas encore DNP dans les totaux de `computeTeamScores`. Actuellement seul `SorareProTab inline recap` (via `getScoreInfo` custom) et les 2 SavedTeamCard files traitent DNP=0 dans le total. Si on voulait unifier, `getPickScore` pourrait retourner `{full:0, isLive:true}` quand matchDate < today et !hasRealScore.

**Bug API Sorare observé :**
Certains matchs (Burnley, Metz, Paris FC, Nott Forest, Strasbourg Rennes du 2026-04-19) restent stales même après fetch. Causes probables :
- Sorare n'a pas traité les SO5 pour ces matchs (délai API selon les ligues)
- Pour les matchs du soir (ex West Ham vs Crystal Palace 21h), lancer MAJ_daily.sh trop tôt fetche avant que Sorare ait scoré
- Solution = re-run MAJ_daily.sh quelques heures plus tard. Le smart-skip (commit `92b330c`) garantit que ça prend 30-60s.

**Best Pick désactivé** (commit `c6b127b`) :
L'onglet a été masqué sur demande. Pour le réactiver : décommenter `{ id: "reco", label: "Best Pick", icon: "⚽" }` dans `App.jsx:16`.

---

## 🔑 Sécurité — clé API

L'utilisateur a partagé sa clé `FOOTBALL_DATA_API_KEY` en clair dans le chat le 2026-04-21 (`d265aec39d9c401aa27a85b32349bd86`). **Lui rappeler de la rotate** sur football-data.org/client/home si pas déjà fait.

Le `.env` à la racine contient cette clé. `.env` est dans `.gitignore` (vérifié).

---

## Mémo communication

- L'utilisateur parle français, préfère explications simples, pas de jargon git
- Il a parfois du mal à suivre les branches → expliquer en termes de "le site en prod" vs "brouillon preview"
- Il préfère des commandes copy-pastables toutes faites
- Il teste visuellement et envoie des screenshots ; bien regarder les screenshots avant de répondre
- Il travaille principalement sur Mac (`damiens-MacBook-Pro-2`, user `damienghe**a`). Son repo est à un chemin qui n'est PAS `~/Documents/Deglingo-scout` — utiliser `find` si besoin

---

## 🏛 Règles sacrées à respecter

- **Sorare OAuth flow** : ne jamais modifier `token/proxy/query` sans test prod (localStorage + Bearer + cards(first:50) + `... on Card`)
- **Cloudflare Cards Function** : fichier déployé dans `deglingo-scout-app/functions/`, pas à la racine. Timeout 30s, max 39 pages, rarities filter KO
- **Database = source unique** : `players.json` alimente Best Pick, Stellar, Sorare Pro — jamais d'override inline
- **Pas d'emoji flags** : Windows compat → utiliser flagcdn.com images
- **Pas d'IIFE dans JSX** : écrans noirs garantis → utiliser expressions inline (SorareProTab a encore des IIFE existantes qui marchent, mais ne pas en ajouter)
- **Pipeline fetch** : pas de patch-on-patch, doit être 1-shot clean pour toutes les ligues
- **Captain bonus** = `raw_so5 × 0.5` (PAS post-bonus × 0.5 — confirmé par comparaison score réel Sorare)

---

## 📚 Historique sessions précédentes

### Session 2026-04-20 (lundi) — Mes Teams + pitch layout

**Prod `scout.deglingosorare.com` = OK ✅**
- Avant cette session : `main` HEAD = `1808c0a` (Revert pitch layout)
- Contenait déjà **Mes Teams + sync KV** (commit `4a16964`)

**Ce que l'utilisateur voulait alors :**
- Refaire le **visuel de Mes Teams exactement comme Sorare Pro** (pitch + `SkyrocketGauge` sur le côté, filtres ligue/rareté collapsibles)
- Tentative précédente → **écran noir en prod** → rollback effectué (commit `1808c0a` sur main)
- Nouvelle tentative sur branche `claude/fix-conversation-loading-bRv3u` (commit `eac04d9`), déployée en Cloudflare Preview → **déployée finalement en prod via deploy.sh**

**Branches anciennes (info archive) :**
- `debug/pitch-layout` / `claude/debug-communication-issue-8nd1t` → ancienne tentative avec ErrorBoundary + vite proxy local (NE PAS merger)
- `claude/deglingo-scout-relis-7leVn` → autre WIP debug
- `claude/fix-conversation-loading-bRv3u` → branche du pitch layout, déjà mergée via deploy.sh + push main

**Notes techniques réutilisables :**
- Bug écran noir pitch = causé par IIFE dans JSX. Résolu en passant par expressions inline
- Cartes fallback dans Mes Teams pitch = saved teams KV créées avant `_card` → fix via `enrichTeamWithBestCards()` dans `RecapTab.jsx` qui assigne la meilleure carte au load
- OAuth `redirect_uri` hardcodé sur prod (`SorareProTab.jsx:300`, `StellarTab.jsx:786`) → si besoin tester sur preview Cloudflare, copier le token depuis prod via devtools console : `copy(localStorage.getItem("sorare_access_token"))` puis `localStorage.setItem(...)` sur le preview
- **Toujours passer `players` + `logos`** aux composants qui font du enrichPick. Le bug DNP-faux-positif venait d'un oubli dans App.jsx (ligne 293). Si un nouveau composant de recap est créé, penser à passer ces props.
- **Fenêtre fetch SO5** : `fetch_gw_scores.py` utilise `min(get_gw_start, now - 7 jours)` pour ne jamais manquer les matchs du weekend précédent. Le smart-skip par club évite de re-fetcher les players déjà à jour.
- **Fuzzy matching de clubs** : fixtures.json et players.json utilisent des noms différents. Le dict `ALIASES` dans `fetch_gw_scores.py` doit être maintenu à jour quand de nouveaux clubs apparaissent (ex : promotions L2→L1).
- **Cross-week selection Stellar** : `selectedDays` stocke maintenant des dates ISO `"YYYY-MM-DD"`, pas des indices. Les callbacks sur prev/next semaine ne doivent PAS vider la sélection.
- **Cache busting** : les fetch `/data/*.json` dans App.jsx ont un `?v={Date.now()}` pour bypass le cache navigateur. Cloudflare n'a pas de cache agressif par défaut sur Pages mais certains navigateurs cachaient players.json.
- **GW numbering** : `getGwDisplayNumber(gwKey)` dans `proScoring.js` dérive GW71/GW72/... depuis le gwKey stocké (ex: `pro_2026-04-17_gw1` → 71), basé sur epoch GW69 = 2026-04-10.

---

## 🚀 PROCESS DEPLOY DETAILLÉ (Cloudflare Direct Upload)

**Cloudflare NE BUILD PAS automatiquement depuis GitHub main !** Le projet est configuré en "Direct Upload" mode. Les pushes git servent uniquement de backup/historique.

**Pour déployer en prod `scout.deglingosorare.com` :**

Sur le Mac (ou PC) dans le dossier du repo :
```bash
cd ~/Documents/Deglingo-scout       # ou là où est le repo
git status                           # VERIFIE qu'il n'y a pas de modifs locales non commitees
git pull origin main                 # recupere les derniers commits
cd deglingo-scout-app
npm run build                        # cree dist/ avec le code frais
cd ..
./deploy.sh                          # Mac — build + wrangler pages deploy + sync scout-dist
# OU deploy.bat sur Windows
```

Le `deploy.sh` fait dans l'ordre :
1. `npm run build` dans `deglingo-scout-app/` → crée `dist/`
2. `wrangler pages deploy dist/` → upload direct à Cloudflare Pages (production)
3. Copie `dist/*` → `scout-dist/` (mirror pour legacy `www.deglingosorare.com/scout`)
4. `git add scout-dist/ && git commit && git push origin main`

**Vérifier que le deploy a marché :**
- Dashboard Cloudflare → Workers & Pages → `deglingo-sorare` → Deployments
- Nouveau deploy en haut avec status ✅ et URL `XXXXXXXX.deglingo-sorare.pages.dev`
- Ou simplement : F5 sur `scout.deglingosorare.com` et check le changement

**Rollback si plantage :**
- Dashboard Cloudflare → Deployments → trouve un ancien deploy qui marchait → clic `...` → **Rollback to this deployment**
- Revert instantané (~30 sec), pas besoin de re-build

**⚠️ Pièges fréquents :**
- Ne pas oublier `git pull` AVANT de build → sinon tu deploy le code ancien du Mac
- Ne pas oublier `git status` → des modifs locales non commitees vont se retrouver en prod
- Tester en preview d'abord si possible (push sur branche différente que main)

---

## Contexte projet

- **Repo** : https://github.com/deglongompg/Deglingo-scout (branche `main`)
- **Prod** : https://scout.deglingosorare.com (auto-deploy via GitHub main)
- **Legacy** : https://www.deglingosorare.com/scout (mirror `scout-dist/`)
- **Stack** : React 19 + Vite 8 dans `deglingo-scout-app/`, scripts Python à la racine
- **Onglets app** : Database, Sorare Pro, Sorare Stellar, Fight, Best Pick

---

## Ce qui a été fait cette session (2026-04-19)

### 1. Auto-zoom grand écran (commit `5699f52`)
Sur `DbTab` et `SorareProTab`, ajout de media queries CSS qui zooment la vue :
- `@media (min-width: 1600px) { zoom: 1.10 }`
- `@media (min-width: 1920px) { zoom: 1.20 }`
- `@media (min-width: 2400px) { zoom: 1.35 }`
- `@media (min-width: 3000px) { zoom: 1.55 }`

Évite d'avoir à régler le zoom du navigateur manuellement.

### 2. Stellar — espace vertical récupéré (commit `95031e0`)
- `height: calc(100vh - 220px)` au lieu de `maxHeight` sur le stellar-root → utilise toute la hauteur
- Retiré `maxHeight: "calc(11 * 34px + 4px)"` sur la liste pool → passe de 11 à ~20 joueurs visibles
- Ajouté `width: 100%` sur le stellar-root pour remplir sa colonne

### 3. Pro — cohérence width (commit `053bbff`)
`width: 100%` sur `.pro-builder-wrap` (déjà bon layout-wise, juste pour cohérence Stellar).

### 4. Stellar — sidebar calendrier fixée à 280px (commit `159b2b0`)
Alignement sur Pro : la sidebar calendrier Stellar était libre (319 CSS px), maintenant `width: 280` fixe comme Pro. Collapse à 30 px. Résultat : pool database passe de 388 → 427 CSS px (identique à Pro).

### 5. Hauteur box Pick+Pool figée (commits `26fb585` puis `19bc13e`)
Remplacement de `calc(100vh - …)` par **hauteur fixe = 520 CSS px** sur la box `Pick Zone + POOL` des deux onglets :
- Stellar : `<div>` ligne ~1844 avec `height: 520` (au lieu de `flex: 1`)
- Pro : `.pro-builder-body` avec `height: isMobile ? "auto" : 520`
- Les wrappers parents n'ont plus de `height: calc(…)` → prennent leur taille naturelle

### 6. Stellar match-chip au format Pro (commit `7206ca5`)
Les noms d'équipe débordaient sur 2 lignes (ex "Nott. Forest", "Aston Villa", "Man City"). Fix :
- Grid cols : `32px 22px 12px minmax(0,1fr) 32px minmax(0,1fr) 12px` (au lieu de `1fr` simple → manquait `minmax(0, ...)` pour forcer shrink)
- `whiteSpace: nowrap` + `overflow: hidden` + `textOverflow: ellipsis` sur les spans home/away
- fontSize 9 (au lieu de 11), vs à 8, score FT à 11, logos 12×12 (au lieu de 14×14)
- `columnGap: 4` + `padding: "4px 6px"`

Fichier : `deglingo-scout-app/src/components/StellarTab.jsx` ligne ~1656 à ~1674.

### 7bis. Sync teams cross-device + onglet Mes Teams (commits `4a16964` + `65cd542`)
Feature complete : indexation des teams sauvegardées par compte Sorare via Cloudflare KV.
- `/api/teams` Function GET/POST — auth via Bearer Sorare, slug vérifié GraphQL
- KV namespace `deglingo-teams`, binding `TEAMS_KV` (Production + Preview) bindés dashboard
- `utils/cloudSync.js` — push/fetch helpers
- Dual-write (localStorage + KV) dans SorareProTab et StellarTab au save/delete
- Nouvel onglet **📋 Mes Teams** (lecture seule) dans App.jsx
- Sync cross-device validée : Mac + iPhone + PC voient les mêmes teams
- Setup complet dans `deglingo-scout-app/SETUP_KV.md`

### 7ter. ⚠️ Pitch layout Mes Teams (commit `65cd542` = CASSÉ en prod)
Tentative d'upgrade visuel Recap avec pitch layout style saved teams + sub-tabs par ligue.
**A causé un écran noir en prod**. Rollback Cloudflare effectué → prod revenue sur `321116ba` (v1 Recap simple).
- Main GitHub contient TOUJOURS le commit cassé `65cd542` → **NE PAS lancer `./deploy.sh`** tant que pas fixé
- WIP debug avec ErrorBoundary + checks défensifs sur branche `claude/deglingo-scout-relis-7leVn` (commit `315f352`)
- Pour débugger : sur prod actuelle, forcer l'URL vers un deploy avec le code cassé (ex preview URL), ouvrir F12 Console, screenshot l'erreur rouge

### 7. Scripts .sh pour Mac (commit `63c70f6`)
Équivalents des `.bat` Windows, exécutables (`chmod +x`) :
- `deploy.sh` — build + wrangler + sync scout-dist + git push
- `MAJ_daily.sh` — fetch_gw_scores + deploy complet
- `fetch_vendredi.sh` — status + fixtures + merge + build
- `fetch_mercredi.sh` — grosse MAJ hebdo (stats + fixtures + status + merge + build + deploy + prix en fond)

Utilise `python3` (pas `py`). Charge `FOOTBALL_DATA_API_KEY` depuis `.env`.

---

## Setup Mac (si première fois)

```bash
git clone https://github.com/deglongompg/Deglingo-scout.git
cd Deglingo-scout
brew install node python                    # si pas déjà
cd deglingo-scout-app && npm install && cd ..
npx wrangler login                            # une fois
```

**À copier manuellement depuis le PC** (pas dans git) :
- `.env` (contient `FOOTBALL_DATA_API_KEY` et autres clés API) → racine du projet

---

## TODO pendant le déplacement (ou retour)

Repris de la session handoff précédente 2026-04-18, pas encore fait :
1. Fix **CAP260 avec `sorare_l10` officiel** — écrire `fetch_sorare_l10.py`, ajouter champ `sorare_l10` dans `players.json`, remplacer `p.l10` par `p.sorare_l10` aux lignes 733 et 1403 de `SorareProTab.jsx`
2. **Card-specific position** (Kvara Classic = MIL, etc.) — probablement override JSON `card_position_overrides.json` + filtre slot après expansion
3. **Seal teams Pro après deadline GW** — détecter `Date.now() > gwInfo.deadline` → bloquer Charger/X/Save
4. **Migration saved teams legacy** — assigner `_cardKey` auto (meilleure carte via `proAllCards[slug][0]`) au load
5. **Stellar calendar** — real scores au lieu de projection + dropdown joueurs par match (partiel via match-chip)
6. **Live scores polling** — Cloudflare Function proxy Sorare API toutes les 60s pour scores live

Bug connu encore pending : **Psal78** — notre site affiche +6% CAP alors que Sorare dit +4%. Cause = on utilise notre `p.l10` calculé au lieu du L10 officiel Sorare. Fix avec le TODO #1.

*(La section "Règles sacrées" est en haut du fichier, ligne 77 — ne pas dupliquer ici.)*
