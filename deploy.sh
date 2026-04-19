#!/usr/bin/env bash
# DEGLINGO SCOUT - Deploy complet (Cloudflare + prod)
# Equivalent macOS/Linux de deploy.bat

set -e
cd "$(dirname "$0")"

echo "======================================================"
echo "  DEGLINGO SCOUT - Deploy complet (Cloudflare + prod)"
echo "======================================================"
echo

# ---- [1/4] Build Vite ----
echo "[1/4] Build Vite en cours..."
cd deglingo-scout-app
npm run build
echo "Build OK !"
echo

# ---- [2/4] Wrangler Cloudflare Pages ----
echo "[2/4] Deploy Cloudflare Pages (preview direct)..."
npx wrangler pages deploy dist --project-name=deglingo-sorare --branch=deglingo-sorare --commit-dirty=true
echo "Wrangler OK !"
echo

# ---- [3/4] Sync scout-dist/ mirror ----
cd ..
echo "[3/4] Sync scout-dist/ (mirror prod via Wix)..."
rm -rf scout-dist/assets
cp -R deglingo-scout-app/dist/. scout-dist/
echo "Mirror synchro OK !"
echo

# ---- [4/4] Git commit + push ----
echo "[4/4] Git commit + push..."
git add scout-dist deglingo-scout-app/src deglingo-scout-app/index.html deglingo-scout-app/public
if ! git diff --cached --quiet; then
    git commit -m "deploy: sync scout-dist mirror + updates" \
               -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
    git push
    echo "Git push OK !"
else
    echo "Rien a commit (scout-dist deja synchro)."
fi
echo

echo "======================================================"
echo "  DEPLOY COMPLET !"
echo "  Preview : https://deglingo-sorare.pages.dev"
echo "  Prod    : https://deglingosorare.com/scout (1-2 min)"
echo "======================================================"
