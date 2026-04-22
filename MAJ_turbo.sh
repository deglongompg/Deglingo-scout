#!/usr/bin/env bash
# DEGLINGO SCOUT — MAJ TURBO (version pérenne, 2026-04-22+)
# Full refresh quotidien : fixtures + titu% + scores + build + deploy Cloudflare
# Cible : < 2 min total. Pré-requis : .env avec FOOTBALL_DATA_API_KEY + SORARE_API_KEY.
# Doc maintenance : MEMOIRE.md

set -eo pipefail
cd "$(dirname "$0")"

START=$(date +%s)
step() { echo; echo "───────── [$1/$TOTAL] $2 ─────────"; }
TOTAL=6

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

# ---- [1/6] Fixtures (5 ligues, football-data.org) ----
step 1 "FIXTURES (~30s)"
python3 fetch_fixtures.py

# ---- [2/6] Statut joueurs (blessures, suspensions, enum titu%) ----
step 2 "STATUT JOUEURS (batch GraphQL, ~10s)"
python3 fetch_player_status.py

# ---- [3/6] Titu% précis via API Sorare officielle (footballPlayingStatusOdds) ----
# Utilise game.playerGameScores.anyPlayerGameStats.footballPlayingStatusOdds
# Schema complet : voir MEMOIRE.md. Marche weekend + mid-week.
step 3 "TITU% PRECIS via API Sorare (~10s)"
# Regen le mapping club-slug si absent (1ere fois ou après un reset)
if [ ! -f sorare_club_slugs.json ]; then
    echo "  📦 sorare_club_slugs.json absent — génération..."
    python3 build_sorare_club_slugs.py
fi
# Run le fetch. Si ça échoue (API down, schema change), fallback Sorareinside.
if python3 fetch_titu_fast.py; then
    echo "  ✅ titu% précis via API Sorare"
elif grep -q "^SORAREINSIDE_PASSWORD=" .env; then
    echo "  ⚠️  fetch_titu_fast KO — fallback Sorareinside"
    python3 fetch_sorareinside.py || echo "  ⚠️  Sorareinside aussi KO (continue avec enum approx)"
else
    echo "  ⚠️  fetch_titu_fast KO et pas de SORAREINSIDE_PASSWORD — continue avec enum approx"
fi

# ---- [4/6] Scores SO5 des matchs joués (smart-skip) ----
step 4 "SCORES SO5 (smart-skip, ~5-30s)"
python3 fetch_gw_scores.py

# ---- [5/6] Merge + build Vite ----
step 5 "MERGE + BUILD"
python3 merge_data.py
(cd deglingo-scout-app && npm run build)

# ---- [6/6] Deploy Cloudflare + mirror + git push ----
step 6 "DEPLOY Cloudflare + git push"
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
