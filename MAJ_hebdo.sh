#!/usr/bin/env bash
# DEGLINGO SCOUT — MAJ HEBDO (Mercredi + Samedi matin)
# Gros rebuild : stats historiques L5/L10/AA via fetch_all_players (~8 min)
#                + prix marketplace + toute la pipeline turbo (fixtures, titu%, scores, deploy)
#
# A lancer 2 fois par semaine (mercredi et samedi matin, post-GW).
# Les 5 autres jours : MAJ_turbo.sh suffit (rapide, daily).

set -eo pipefail
cd "$(dirname "$0")"

START=$(date +%s)

echo "========================================================"
echo "  DEGLINGO SCOUT — MAJ HEBDO ($(date '+%A %Y-%m-%d %H:%M'))"
echo "  Gros rebuild stats + turbo daily"
echo "========================================================"

# Check .env (fail fast)
if [ ! -f .env ]; then
    echo "❌ .env manquant. Crée-le avec FOOTBALL_DATA_API_KEY et SORARE_API_KEY."
    exit 1
fi

# ---- [1/2] GROS REBUILD stats historiques (L5, L10, L40, AA, regularite...) ----
echo
echo "───────── [1/2] STATS JOUEURS complete (5 ligues, ~8 min) ─────────"
python3 fetch_all_players.py ALL --fresh

# ---- [2/2] PRIX CARTES (optionnel, tourne en fond si tu veux) ----
echo
echo "───────── [2/2] PRIX LIMITED + RARE (~2 min) ─────────"
if [ -f fetch_prices.py ]; then
    python3 fetch_prices.py || echo "  ⚠️  fetch_prices a echoue (non bloquant)"
else
    echo "  ℹ️  fetch_prices.py absent - skip"
fi

# ---- Enchaine ensuite tout le turbo daily (fixtures + status + scores + titu + build + deploy) ----
echo
echo "========================================================"
echo "  Enchaine sur MAJ_turbo.sh (fixtures + titu% + deploy)"
echo "========================================================"
./MAJ_turbo.sh

END=$(date +%s)
ELAPSED=$((END - START))

echo
echo "========================================================"
echo "  ✅ MAJ HEBDO TERMINÉE en ${ELAPSED}s"
echo "  Gros rebuild OK + deploy Cloudflare OK"
echo "========================================================"
