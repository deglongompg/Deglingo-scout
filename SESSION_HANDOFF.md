# SESSION HANDOFF — 2026-04-23 (jeudi, gros jour fix Stellar + Bundes)

> **Claude Code :** lis `MEMOIRE.md` EN PREMIER pour le schema GraphQL Sorare titu%.
> Puis ce fichier pour le contexte session courante.
> `git log --oneline -30` pour l'historique detaille.

---

## État prod

- **Prod** : https://scout.deglingosorare.com (Cloudflare Pages, auto-deploy via GitHub main)
- **Legacy** : https://www.deglingosorare.com/scout (mirror `scout-dist/`)
- **HEAD main** : `e77ca16` (feat Bundesliga Stellar)
- **Scheduler PC** : installé (2 tâches Task Scheduler — Daily Lu/Ma/Je/Ve/Di + Hebdo Me/Sa à 06:00)
- **Stellar couverture** : L1, PL, Liga, **Bundes** (ajoute 2026-04-23 post-sortie cartes Sorare)

---

## 🔥 Résumé session 2026-04-23

### Fix critique #1 — matchs rattrapés disparaissaient du calendrier

**Bug** : `fetch_recent_finished` dans `fetch_fixtures.py` gardait uniquement `matchday == max(md_counts)`. Résultat : PSG-Nantes L1 J26 (rattrapage joué 22/04) jeté du fixtures.json parce que J30 était la journée dominante.

**Fix** (commit `1fd1762`) : garder TOUS les matchs FINISHED dans la fenêtre de 8 jours, peu importe le matchday. Re-run `fetch_gw_scores.py` pour récupérer les scores SO5 manquants (commit `05b4d3b`).

### Fix critique #2 — captain bonus sur RAW (pas post-bonus)

**Bug** : captain bonus calculé partout comme `postBonus × 0.5`, donnait un écart de 1-5 pts par équipe vs Sorare officiel.

**Fix** (commit `ffb9fe7`) : `raw × 0.5` partout (règle documentée en mémoire, confirmée par math Équipe 1 Sorare). Fichiers : `StellarSavedTeamCard`, `StellarTab`, `RecapTab`, `SorareProTab`, `proScoring.js`.

Vérif math Équipe 1 :
- raw sum = 322, bonus 55%, Yamal captain raw 74
- Formule raw × 0.5 : 322 + 39.15 + 37 = 398.15 ≈ Sorare 398.66 ✅
- Formule post × 0.5 : 400 → écart +1.34

### Fix critique #3 — cartes multiples du même joueur

**Bug (documenté la veille `project_bug_stellar_duplicate_cards.md`)** : Damien a 2 Pedri (Base +5% + Shiny +10%), mais notre rendu `sorareCardMap[slug]` retournait toujours la meilleure carte. Résultat : saved teams, pool et pitch affichaient toujours Shiny 10% même si Base pickée.

**Fix (commits `6ad00d3`, `ebc19b3`, `ef864da`)** :
- `sorareCardByCardSlug` : index par cardSlug unique
- `resolveCardForPick(pick)` : priorité `pick._cardSlug` → fallback best
- Appliqué à : StellarSavedTeamCard, StellarTab inline recap, pitch central, pool badge bonus, RecapTab `computeStellarProjected`
- `_cardTotalBonus` utilisé dans le pool pour afficher le vrai bonus de la carte spécifique (avant on prenait la best = toujours shiny)

### UX improvements

- **Détail calcul global** sous chaque saved team Stellar : `66 + 71 + 78 + 85 + 73 + 35 (cap X) = 408` avec captain coloré rose. Permet de comparer avec Sorare.
- **Badge "C" capitaine visible** même si captain stocké via `team.captain` (legacy) (commit `ffb9fe7`)
- **RecapTab filtre 2-lignes** : `[✨ Stellar] [🇫🇷 L1] [🏴 PL] [🇪🇸 Liga] [🇩🇪 Bundes] [🇺🇸 MLS]` → si ligue Pro active → `[Limited] [Rare]` (commit `fea09a2`)
- **Scores bulles en floor** : Yamal 74.7 → 74 (avant 75), match Sorare (commit `a560b44`)
- **Stellar loading overlay visible au mount** : plus de "0 cartes" pendant 10s silencieux (commit `459737e`)
- **Cache cartes TTL 10 min → 60 min** (commit `459737e`)
- **"Mes cartes" activé par défaut** si ≥1 carte Stellar (commit `ebc19b3`)

### Feature bonus fin de journee — Bundesliga ajoutee a Stellar

Sorare a sorti les cartes Stellar Bundesliga. Integration immediate
(commit `e77ca16`) :
- `STELLAR_LEAGUES = ["L1", "PL", "Liga", "Bundes"]`
- Dot color calendrier : Bundes = `#FFD180` (jaune-orange)
- Rien d'autre a toucher : les data Bundes etaient deja dans players.json
  et fixtures.json (juste filtrees hors Stellar avant).
- Pipeline daily MAJ_turbo gere automatiquement les scores Bundes a partir
  de demain matin : bulles vertes / DNP / FT chips / titu% inclus.

### Bugs corrigés en chemin

- **React #310** (commit `a23993b`) : `useMemo proLeagueCounts` était après les early returns dans RecapTab → ordre des hooks variable → crash "Rendered more hooks than during the previous render". Déplacé avant les early returns.
- **IIFE dans JSX** (commit `ffb9fe7`) : tentative d'ajout détail calcul, j'avais mis un IIFE — violation règle sacrée. Refactored en variables pré-calculées.

---

## TODO prochaine session

1. **Verifier demain matin** que le MAJ_turbo auto de 06:00 remplit bien les bulles Bundes (scores SO5 live, FT chips, titu%).
2. **Sorare Pro** — appliquer les mêmes fixes card-specific que Stellar (`resolveCardForPick` pattern). Pour l'instant Pro utilise encore `sorareCardMap[slug]`. Pareil pour les bulles `Math.floor`.
2. **Ajouter 4 championnats** : Belgique, Pays-Bas, Japon, Corée (slugs Sorare probables : `jupiler-pro-league-be`, `eredivisie-nl`, `j1-league-jp`, `k-league-1-kr`). Procédure dans `MEMOIRE.md` section "Ajout nouveaux championnats".
3. **Fix CAP260 avec `sorare_l10` officiel** (pending depuis avant-hier) — écrire `fetch_sorare_l10.py`, ajouter champ `sorare_l10` dans `players.json`, remplacer `p.l10` par `p.sorare_l10` aux lignes 733 et 1403 de `SorareProTab.jsx`. Bug Psal78 : +6% CAP chez nous vs +4% Sorare.
4. **Seal teams Pro après deadline GW** — détecter `Date.now() > gwInfo.deadline` → bloquer Charger/X/Save
5. **Card-specific position** — override JSON `card_position_overrides.json` pour Kvara Classic = MIL, etc.
6. **Live scores polling** — Cloudflare Function proxy Sorare API toutes les 60s

---

## Règles sacrées à respecter

- **Sorare OAuth** : ne jamais modifier `token/proxy/query` sans test prod (localStorage + Bearer + cards(first:50) + `... on Card`)
- **Cloudflare Cards Function** : fichier dans `deglingo-scout-app/functions/`, timeout 30s, max 39 pages, rarities filter KO
- **Database = source unique** : `players.json` → tous les onglets, jamais d'override inline
- **Pas d'emoji flags** : Windows compat → `flagcdn.com`
- **Pas d'IIFE dans JSX** : écrans noirs en prod — extraire en variables avant le return
- **Pipeline fetch** : pas de patch-on-patch, doit être 1-shot clean toutes ligues
- **Captain bonus = `raw × 0.5`** (PAS post × 0.5 — confirmé par maths Sorare)
- **Scores bulles en floor, pas round** (Sorare tronque)
- **Hooks avant early returns** : tous les `useMemo`/`useEffect` doivent être avant `if (loading) return ...`
- **Resolve carte spécifique** : `resolveCardForPick(p)` via `_cardSlug` avant fallback `sorareCardMap[slug]`

---

## Mémo communication

- Damien travaille sur PC Windows (`C:\Users\Dekstop\Desktop\Deglingo Scout\Deglingo Scout`) et Mac
- Préfère explications simples, pas de jargon git
- Il teste visuellement, envoie des screenshots
- Il a 2 cartes Stellar par joueur parfois (Base + Shiny) — le système doit les distinguer
- Le scheduler Daily tourne à 06:00 chaque jour automatiquement

---

## Historique session précédente (2026-04-22, marathon 5h+ titu%)

Cf. git log : `f3688b7 docs: sauvegarde complete session 2026-04-22`. Points clés :
- Schema GraphQL Sorare titu% décodé : `game.playerGameScores → PlayerGameScore.anyPlayerGameStats.footballPlayingStatusOdds`
- Pipeline bulletproof : MAJ_turbo.bat (daily) + MAJ_hebdo.bat (Me/Sa gros rebuild) + install_schedule.bat
- fetch_all_players V3 batch + workers : 40min → 20min pour 5 ligues
- sorare_club_slugs.json mapping 112 clubs
