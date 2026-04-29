#!/usr/bin/env bash
# DEGLINGO SCOUT — MAJ TURBO (version pérenne, 2026-04-22+)
# Full refresh quotidien : fixtures + titu% + scores + build + deploy Cloudflare
# Cible : < 5 min total. Pré-requis : .env avec FOOTBALL_DATA_API_KEY + SORARE_API_KEY.
# Doc maintenance : MEMOIRE.md

set -eo pipefail
cd "$(dirname "$0")"

START=$(date +%s)
step() { echo; echo "───────── [$1/$TOTAL] $2 ─────────"; }
TOTAL=8

echo "========================================================"
echo "  DEGLINGO SCOUT — MAJ TURBO ($(date '+%Y-%m-%d %H:%M'))"
echo "========================================================"

# Check pre-requis (fail fast)
if [ ! -f .env ]; then
    echo "❌ .env manquant. Crée-le avec FOOTBALL_DATA_API_KEY et SORARE_API_KEY."
    exit 1
fi
if ! grep -q "^SORARE_API_KEY=" .env; then
    echo "⚠️  SORARE_API_KEY absent du .env — batch limite (complexity 500 vs 30000)"
fi

# ---- [1/8] Fixtures (5 ligues, football-data.org) ----
step 1 "FIXTURES (~30s)"
python3 fetch_fixtures.py

# ---- [2/8] Classements officiels (4 ligues EU, football-data.org) ----
# Affiche dans le panneau Calendrier de Sorare Pro, sous les matchs joues.
step 2 "STANDINGS (4 ligues, ~3s)"
python3 fetch_standings.py || echo "  ⚠️  fetch_standings KO (non bloquant)"

# ---- [3/8] Statut joueurs (blessures, suspensions, enum titu% fallback) ----
step 3 "STATUT JOUEURS (batch GraphQL, ~10s)"
python3 fetch_player_status.py

# ---- [4/8] Scores SO5 des matchs joués (smart-skip) ----
step 4 "SCORES SO5 (smart-skip, ~5-30s)"
python3 fetch_gw_scores.py

# ---- [5/8] Merge data (agrege tout dans players.json) ----
# ⚠️  merge_data.py relit player_status.json et ecrase sorare_starter_pct !
#     C'est pour ca que fetch_titu_fast.py tourne APRES, pas avant.
step 5 "MERGE donnees (raw leagues + status + prices)"
python3 merge_data.py

# ---- [6/8] Titu% précis via API Sorare (OVERRIDE des enum) ----
# Utilise game.playerGameScores.anyPlayerGameStats.footballPlayingStatusOdds
# Schema complet : voir MEMOIRE.md. Marche weekend + mid-week.
# DOIT TOURNER APRES merge_data.py pour que ses valeurs ne soient pas ecrasees.
step 6 "TITU% PRECIS via API Sorare (~2min)"
if [ ! -f sorare_club_slugs.json ]; then
    echo "  📦 sorare_club_slugs.json absent — génération..."
    python3 build_sorare_club_slugs.py
fi
if python3 fetch_titu_fast.py; then
    echo "  ✅ titu% précis via API Sorare"
elif grep -q "^SORAREINSIDE_PASSWORD=" .env; then
    echo "  ⚠️  fetch_titu_fast KO — fallback Sorareinside"
    python3 fetch_sorareinside.py || echo "  ⚠️  Sorareinside aussi KO (on garde enum approx)"
else
    echo "  ⚠️  fetch_titu_fast KO et pas de SORAREINSIDE_PASSWORD — on garde enum approx"
fi

# ---- [7/8] Build Vite ----
step 7 "BUILD Vite"
(cd deglingo-scout-app && npm run build)

# ---- [8/8] Deploy Cloudflare + mirror + git push ----
step 8 "DEPLOY Cloudflare + git push"
(cd deglingo-scout-app && npx wrangler pages deploy dist \
    --project-name=deglingo-sorare \
    --branch=deglingo-sorare \
    --commit-dirty=true)

# Mirror scout-dist pour legacy www.deglingosorare.com/scout
rm -rf scout-dist/assets
cp -R deglingo-scout-app/dist/. scout-dist/

# Commit + push (seulement si changements)
git add scout-dist \
        deglingo-scout-app/public/data \
        public/data \
        deglingo-scout-app/src \
        deglingo-scout-app/index.html \
        sorare_club_slugs.json \
        2>/dev/null || true

if ! git diff --cached --quiet; then
    git commit -m "chore(turbo): MAJ quotidienne — fixtures + titu% + scores + rebuild" \
               -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
    git push
    echo "  ✅ Push GitHub OK"
else
    echo "  ℹ️  Aucun changement à commit"
fi

END=$(date +%s)
ELAPSED=$((END - START))

echo
echo "========================================================"
echo "  ✅ MAJ TURBO TERMINÉE en ${ELAPSED}s"
echo "  Prod    : https://scout.deglingosorare.com (Cmd+Shift+R)"
echo "  Preview : https://deglingo-sorare.pages.dev"
echo "========================================================"
