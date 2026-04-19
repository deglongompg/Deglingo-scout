#!/usr/bin/env bash
# DEGLINGO SCOUT - MAJ DAILY (full deploy)
# Scores + Build + Wrangler + scout-dist + Git
# Equivalent macOS/Linux de MAJ_daily.bat

set -e
cd "$(dirname "$0")"

echo "======================================================"
echo "  DEGLINGO SCOUT - MAJ DAILY (full deploy)"
echo "  Scores + Build + Wrangler + scout-dist + Git"
echo "======================================================"
echo

# ---- [1/5] Fetch scores matchs joues ----
echo "[1/5] Fetch scores matchs joues..."
python3 fetch_gw_scores.py
echo "[1/5] OK"
echo

# ---- [2/5] Build Vite ----
echo "[2/5] Build Vite..."
cd deglingo-scout-app
npm run build
echo "[2/5] OK"
echo

# ---- [3/5] Wrangler Cloudflare Pages ----
echo "[3/5] Deploy Cloudflare Pages (preview direct)..."
npx wrangler pages deploy dist --project-name=deglingo-sorare --branch=deglingo-sorare --commit-dirty=true
echo "[3/5] OK"
echo

# ---- [4/5] Sync scout-dist ----
cd ..
echo "[4/5] Sync scout-dist/..."
rm -rf scout-dist/assets
cp -R deglingo-scout-app/dist/. scout-dist/
echo "[4/5] OK"
echo

# ---- [5/5] Git commit + push ----
echo "[5/5] Git commit + push..."
git add scout-dist deglingo-scout-app/public/data public/data deglingo-scout-app/src deglingo-scout-app/index.html
if ! git diff --cached --quiet; then
    git commit -m "chore(daily): MAJ scores + rebuild" \
               -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
    git push
    echo "[5/5] OK - Push GitHub (Wix auto-deploy dans 1-2 min)"
else
    echo "[5/5] Rien a commit (deja a jour)."
fi
echo

echo "======================================================"
echo "  MAJ DAILY COMPLETE !"
echo "  Preview : https://deglingo-sorare.pages.dev"
echo "  Prod    : https://deglingosorare.com/scout (1-2 min)"
echo "======================================================"
