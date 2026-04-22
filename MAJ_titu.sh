#!/usr/bin/env bash
# DEGLINGO SCOUT — MAJ TITU% uniquement (rapide, pas de fetch scores)
# Utile pour rafraichir plusieurs fois par jour les titu% avant la deadline
# sans re-fetcher les calendriers / scores SO5 / builds complets.

set -e
cd "$(dirname "$0")"

START=$(date +%s)

echo "================================================="
echo "  DEGLINGO SCOUT — MAJ TITU% (quick)"
echo "================================================="
echo

# ---- [1/4] Titu% approximatif Sorare (rapide, batch 150) ----
echo "[1/4] TITU% enum Sorare (~10s)..."
python3 fetch_player_status.py
echo "[1/4] OK"
echo

# ---- [2/4] Titu% precis Sorareinside (override) ----
if grep -q "^SORAREINSIDE_PASSWORD=" .env 2>/dev/null; then
  echo "[2/4] TITU% precis Sorareinside (~30-60s avec threading)..."
  python3 fetch_sorareinside.py || echo "  ⚠️  Sorareinside fetch a echoue"
  echo "[2/4] OK"
  echo
else
  echo "[2/4] SKIP Sorareinside (pas de SORAREINSIDE_PASSWORD dans .env)"
  echo
fi

# ---- [3/4] Build + deploy Cloudflare ----
echo "[3/4] BUILD + DEPLOY Cloudflare..."
cd deglingo-scout-app
npm run build
npx wrangler pages deploy dist --project-name=deglingo-sorare --branch=deglingo-sorare --commit-dirty=true
cd ..
rm -rf scout-dist/assets
cp -R deglingo-scout-app/dist/. scout-dist/
echo "[3/4] OK"
echo

# ---- [4/4] Git push (scout-dist + players.json patchee) ----
echo "[4/4] GIT commit + push..."
git add scout-dist deglingo-scout-app/public/data public/data 2>/dev/null || true
if ! git diff --cached --quiet; then
    git commit -m "chore(titu): MAJ titu% + rebuild" \
               -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
    git push
    echo "[4/4] OK"
else
    echo "[4/4] Rien a commit"
fi
echo

END=$(date +%s)
ELAPSED=$((END - START))

echo "================================================="
echo "  ✅ MAJ TITU% TERMINEE en ${ELAPSED}s"
echo "  Prod : https://scout.deglingosorare.com (Cmd+Shift+R)"
echo "================================================="
