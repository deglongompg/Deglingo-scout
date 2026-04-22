#!/usr/bin/env bash
# DEGLINGO SCOUT — MAJ TURBO : full refresh en < 2 min
# Fixtures + Titularisations + Scores SO5 + Build + Deploy Cloudflare
# Optimise avec batch GraphQL + smart-skip (nécessite SORARE_API_KEY dans .env)

set -e
cd "$(dirname "$0")"

START=$(date +%s)

echo "========================================================"
echo "  DEGLINGO SCOUT — MAJ TURBO"
echo "  Fixtures + Titu% + Scores + Deploy"
echo "========================================================"
echo

# ---- [1/6] Fixtures (prochaines journees, 5 ligues) ----
echo "[1/6] FIXTURES (~30s)..."
python3 fetch_fixtures.py
echo "[1/6] OK"
echo

# ---- [2/6] Titu% + blessures + suspensions (batch turbo) ----
echo "[2/6] STATUT / TITU% (~10s avec API key batch=150)..."
python3 fetch_player_status.py
echo "[2/6] OK"
echo

# ---- [2bis/6] Titu% precis via API Sorare officielle (footballPlayingStatusOdds) ----
# Depuis 2026-04-22 : on utilise le MEME champ que le frontend Sorare
# (anyPlayerGameStats.footballPlayingStatusOdds.starterOddsBasisPoints).
# Marche pour matchs weekend ET mid-week. Fallback Sorareinside si echec.
echo "[2bis/6] TITU% PRECIS via API Sorare officielle (~5-10s)..."
if python3 fetch_titu_fast.py; then
  echo "[2bis/6] OK (via API Sorare)"
else
  echo "  ⚠️  fetch_titu_fast a echoue — fallback Sorareinside..."
  if grep -q "^SORAREINSIDE_PASSWORD=" .env 2>/dev/null; then
    python3 fetch_sorareinside.py || echo "  ⚠️  Sorareinside aussi KO (continue avec enum approx)"
    echo "[2bis/6] OK (via Sorareinside fallback)"
  else
    echo "[2bis/6] SKIP — ajoute SORAREINSIDE_PASSWORD dans .env pour fallback"
  fi
fi
echo

# ---- [3/6] Scores SO5 matchs joues (smart-skip) ----
echo "[3/6] SCORES SO5 matchs joues (~30-60s)..."
python3 fetch_gw_scores.py
echo "[3/6] OK"
echo

# ---- [4/6] Merge donnees ----
echo "[4/6] MERGE donnees..."
python3 merge_data.py
echo "[4/6] OK"
echo

# ---- [5/6] Build Vite ----
echo "[5/6] BUILD Vite..."
cd deglingo-scout-app
npm run build
cd ..
echo "[5/6] OK"
echo

# ---- [6/6] Deploy Cloudflare + mirror + git ----
echo "[6/6] DEPLOY Cloudflare + mirror scout-dist + git push..."
cd deglingo-scout-app
npx wrangler pages deploy dist --project-name=deglingo-sorare --branch=deglingo-sorare --commit-dirty=true
cd ..
rm -rf scout-dist/assets
cp -R deglingo-scout-app/dist/. scout-dist/
git add scout-dist deglingo-scout-app/public/data public/data deglingo-scout-app/src deglingo-scout-app/index.html 2>/dev/null || true
if ! git diff --cached --quiet; then
    git commit -m "chore(turbo): MAJ complete — fixtures + titu% + scores + rebuild" \
               -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
    git push
    echo "[6/6] OK — Push GitHub"
else
    echo "[6/6] Rien a commit"
fi
echo

END=$(date +%s)
ELAPSED=$((END - START))

echo "========================================================"
echo "  ✅ MAJ TURBO TERMINEE en ${ELAPSED}s"
echo "  Prod : https://scout.deglingosorare.com (Cmd+Shift+R)"
echo "  Preview: https://deglingo-sorare.pages.dev"
echo "========================================================"
