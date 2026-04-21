# SESSION HANDOFF — 2026-04-19 → 21 (dimanche GW71 → mardi)

> **Claude Code :** lis ce fichier au démarrage pour reprendre le contexte.
> Source de vérité complémentaire : `git log --oneline -20` et les fichiers modifiés récents.

---

## ⏱ État au 2026-04-21 (fin session Mac, mardi soir)

**Prod `scout.deglingosorare.com` = OK ✅**
- Branche `main` HEAD = `6e5f9b4` (feat(recap): detection DNP)
- Tout est déployé en prod via `./deploy.sh` + `./MAJ_daily.sh` lancés depuis le Mac
- Dernier `MAJ_daily.sh` ran le 2026-04-21 : scores GW71 à jour (match du 19 avril PSG-OL 1-2 visible, Monaco-Auxerre 2-2, etc.)

**Features ajoutées cette session (commits de d144773 à 6e5f9b4) :**
1. **Onglet Stellar dans Mes Teams** (commit `d144773`) — 3ème tab à côté de Pro Limited/Pro Rare, teams groupées par date, nouveau composant `StellarSavedTeamCard.jsx`
2. **Calendrier Pro : scores FT + dropdown joueurs par match** (commit `ba95ad5`) — comme Stellar : badge FT vert, match score "1-2", click sur nom de club → dropdown avec notes SO5 des joueurs
3. **Fuzzy club matching dans fetch_gw_scores.py** (commit `d2f24c3`) — avant, des clubs comme "AS Monaco", "Stade Rennais F.C.", "Paris Saint-Germain", "Sport-Club Freiburg" étaient jamais fetchés car `fixtures.home_api` (ex "AS Monaco FC") ≠ `players.club` (ex "AS Monaco"). Fix = normalisation + dict ALIASES manuel pour cas irréductibles
4. **Détection DNP (Did Not Play)** (commit `6e5f9b4`) — sur les 4 surfaces de rendu (SorareProTab recap inline, ProSavedTeamCard, StellarTab recap inline, StellarSavedTeamCard). Si `matchDate < today` ET `!hasRealScore` → bulle rouge solide 0 + badge "DNP". Score total équipe comptabilisé à 0 (au lieu du D-Score projeté). Match score récupéré via fallback co-équipier. Exemple : Dembélé 2026-04-19 (pick) mais last_so5_date=2026-04-03 → DNP affiché au lieu de 69 pointillé

**Flow des données validé par user :**
> "lors du daily fetch on alimente le score des calendriers pro et stellar avec dropdown des notes par match et ensuite on repartit les notes dans les bulles des equipes sauvegardées dans onglet stellar et pro... quon reprend évidemment dans MES TEAMS pour une vision globale"

Les 4 surfaces utilisent le même data source (`players.json` avec `last_so5_score`, `last_so5_date`, `last_match_home_goals/away_goals`) → cohérence garantie.

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
4. **Stellar calendar** — real scores au lieu de projection (partiellement fait via match-chip) + améliorer dropdown
5. **Live scores polling** — Cloudflare Function proxy Sorare API toutes les 60s pour scores live pendant les matchs

**Bug API Sorare possible :**
Certains matchs (Burnley, Metz, Paris FC, Nott Forest, Strasbourg quand ils ont joué le 2026-04-19) restent à `last_so5_date = 2026-04-11` même après fetch. Hypothèse : Sorare n'a pas traité les SO5 scores pour ces matchs (délai API), pas un bug côté nous. Re-run MAJ_daily.sh quelques heures plus tard devrait corriger.

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
