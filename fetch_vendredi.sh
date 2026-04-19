#!/usr/bin/env bash
# DEGLINGO SCOUT -- MAJ RAPIDE VENDREDI
# Equivalent macOS/Linux de fetch_vendredi.bat

set -e
cd "$(dirname "$0")"

echo
echo "========================================="
echo "  DEGLINGO SCOUT -- MAJ RAPIDE VENDREDI"
echo "========================================="
echo

echo "[1/4] STATUT BLESSES / SUSPENDUS / PROJ (~5 min)..."
echo "-----------------------------------------"
python3 fetch_player_status.py

echo
echo "[2/4] FIXTURES CALENDRIER (~30 sec)..."
echo "-----------------------------------------"
python3 fetch_fixtures.py

echo
echo "[3/4] MERGE DONNEES..."
echo "-----------------------------------------"
python3 merge_data.py

echo
echo "[4/4] BUILD APP..."
echo "-----------------------------------------"
cd deglingo-scout-app
npm run build
cd ..

echo
echo "========================================="
echo "  TOUT EST PRET -- build dans dist/"
echo "  (lance ./deploy.sh pour pousser en prod)"
echo "========================================="
