# SESSION HANDOFF — 2026-04-19 → 20 (dimanche → lundi GW71)

> **Claude Code :** lis ce fichier au démarrage pour reprendre le contexte.
> Source de vérité complémentaire : `git log --oneline -20` et les fichiers modifiés récents.

---

## ⏱ État au 2026-04-20 (reprise session sur Mac)

**Prod `scout.deglingosorare.com` = OK ✅**
- Branche `main` HEAD = `1808c0a` (Revert pitch layout)
- Contient bien le feature **Mes Teams + sync KV** (commit `4a16964`)
- L'utilisateur a confirmé visuellement : onglet "Mes Teams" affiche 5 équipes (Pro Limited Ligue 1 + Stellar dimanche 19 avril), score moyen 398.6

**Ce que l'utilisateur veut maintenant (WIP) :**
- Refaire le **visuel de Mes Teams exactement comme Sorare Pro** (pitch + `SkyrocketGauge` sur le côté, filtres ligue/rareté collapsibles)
- Tentative précédente → **écran noir en prod** → rollback effectué (commit `1808c0a` sur main)
- Nouvelle tentative existe sur branche **`claude/fix-conversation-loading-bRv3u`** (commit `eac04d9`), déployée en **Cloudflare Preview "test-recap"** (URL `538135b9.deglingo-sorare.pages.dev`)
- **NE PAS merger `eac04d9` dans `main` tant que pas validé sans écran noir**

**Branches à connaître :**
- `main` → prod, stable, Mes Teams v1 simple OK
- `claude/fix-conversation-loading-bRv3u` → WIP pitch layout (preview Cloudflare)
- `debug/pitch-layout` / `claude/debug-communication-issue-8nd1t` → ancienne tentative avec ErrorBoundary + vite proxy local (NE PAS merger, debug only)
- `claude/deglingo-scout-relis-7leVn` → autre WIP debug (ErrorBoundary défensif)

**Mémo communication :**
- L'utilisateur parle français, préfère explications simples, pas de jargon git
- Il a parfois du mal à suivre les branches → expliquer en termes de "le site en prod" vs "brouillon preview"
- Anthropic API a eu des erreurs 400 `cache_control cannot be set for empty text blocks` pendant la session du 20/04 → si la conv plante, démarrer une nouvelle session et lire ce handoff

---

## 🔍 Findings session 20/04 (Mac, matin)

### Preview pitch layout ne plante PAS (bug écran noir résolu)
- Preview `538135b9.deglingo-sorare.pages.dev` charge OK, pitch + SkyrocketGauge s'affichent
- L'utilisateur a copié son token `sorare_access_token` depuis prod via devtools console (`copy(localStorage.getItem("sorare_access_token"))` puis `localStorage.setItem(...)`) parce que le `redirect_uri` OAuth est hardcodé sur prod (`SorareProTab.jsx:300`, `StellarTab.jsx:786`)

### ⚠️ BUG ACTUEL à fixer : cartes Sorare ne s'affichent pas dans Mes Teams pitch
- Les pitch cards affichent le **fallback club logo** au lieu des vraies images Sorare
- Cause : `getPickCard(pick)` dans `proScoring.js:79` retourne `pick._card || null`
- Les saved teams en KV ont été créées **AVANT** que `_card` soit requis → `_card` = undefined → fallback
- **Fix = TODO #4 du handoff** : migration au load → pour chaque pick sans `_card`, chercher la meilleure carte dans `proAllCards[slug][0]` (user's Sorare cards) et l'assigner automatiquement
- Fichiers à modifier : probablement `RecapTab.jsx` (chargement teams) ou `cloudSync.js` (fetchCloudStore) pour enrichir au fetch
- Tester sur preview avant merge dans main

### URLs preview en cours
- Preview branch : `claude/fix-conversation-loading-bRv3u` (commit `eac04d9`)
- Preview URL : `https://538135b9.deglingo-sorare.pages.dev/#recap`
- NE PAS merger tant que le bug cartes non fixé

---

## 🚀 PROCESS DEPLOY (important — Cloudflare Pages en mode Direct Upload)

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

---

## Règles sacrées à respecter

- **Sorare OAuth flow** : ne jamais modifier `token/proxy/query` sans test prod (localStorage + Bearer + cards(first:50) + `... on Card`)
- **Cloudflare Cards Function** : fichier déployé dans `deglingo-scout-app/functions/`, pas à la racine. Timeout 30s, max 39 pages, rarities filter KO
- **Database = source unique** : `players.json` alimente Best Pick, Stellar, Sorare Pro — jamais d'override inline
- **Pas d'emoji flags** : Windows compat → utiliser flagcdn.com images
- **Pas d'IIFE dans JSX** : écrans noirs garantis → utiliser expressions inline
- **Pipeline fetch** : pas de patch-on-patch, doit être 1-shot clean pour toutes les ligues
- **Captain bonus** = `raw_so5 × 0.5` (PAS post-bonus × 0.5)
