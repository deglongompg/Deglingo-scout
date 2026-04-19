# SESSION HANDOFF — 2026-04-19 (dimanche GW71)

> **Claude Code sur Mac :** lis ce fichier au démarrage pour reprendre le contexte.
> Source de vérité complémentaire : `git log --oneline -20` et les fichiers modifiés récents.

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
