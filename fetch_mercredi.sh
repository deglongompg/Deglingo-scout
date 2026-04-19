#!/usr/bin/env bash
# DEGLINGO SCOUT -- GROSSE MAJ MERCREDI
# Equivalent macOS/Linux de fetch_mercredi.bat

set -e
cd "$(dirname "$0")"

echo
echo "========================================="
echo "  DEGLINGO SCOUT -- GROSSE MAJ MERCREDI"
echo "========================================="
echo

echo "[1/7] STATS JOUEURS (5 ligues + MLS, ~8 min)..."
echo "-----------------------------------------"
python3 fetch_all_players.py ALL --fresh

echo
echo "[2/7] FIXTURES CALENDRIER (~30 sec)..."
echo "-----------------------------------------"
# Load FOOTBALL_DATA_API_KEY from .env
if [ -f .env ]; then
    export $(grep -v '^#' .env | grep FOOTBALL_DATA_API_KEY | xargs)
fi
python3 fetch_fixtures.py "$FOOTBALL_DATA_API_KEY"

echo
echo "[3/7] STATUT BLESSES / SUSPENDUS (sans titu%, publie jeudi)..."
echo "-----------------------------------------"
python3 fetch_player_status.py --no-titu

echo
echo "[4/7] MERGE DONNEES..."
echo "-----------------------------------------"
python3 merge_data.py

echo
echo "[5/7] BUILD APP..."
echo "-----------------------------------------"
cd deglingo-scout-app
npm run build
cd ..

echo
echo "[6/7] DEPLOY CLOUDFLARE..."
echo "-----------------------------------------"
cd deglingo-scout-app
npx wrangler pages deploy dist --project-name=deglingo-sorare --branch=deglingo-sorare --commit-dirty=true
cd ..

echo
echo "[7/7] PRIX CARTES (long ~2h, tourne en fond)..."
echo "-----------------------------------------"
# Lance en tache de fond
nohup python3 fetch_prices.py ALL --fresh >/tmp/fetch_prices.log 2>&1 &
echo "Fetch prices PID $! - log: /tmp/fetch_prices.log"

echo
echo "========================================="
echo "  TOUT EST PRET -- deploye sur Cloudflare"
echo "  (les prix se mettent a jour en fond)"
echo "========================================="
