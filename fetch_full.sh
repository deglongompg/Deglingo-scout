#!/bin/bash
# Deglingo Scout — Fetch complet 1 shot par ligue
# Usage: ./fetch_full.sh L1          (Ligue 1 seule)
#        ./fetch_full.sh ALL         (4 ligues)
#        ./fetch_full.sh PL Liga     (plusieurs ligues)

cd "$(dirname "$0")"

LEAGUES="${@:-ALL}"

if [ "$LEAGUES" = "ALL" ]; then
  LEAGUES="L1 PL Liga Bundes"
fi

echo "🚀 FETCH COMPLET : $LEAGUES"
echo "   → Joueurs (stats indiv + DNS + AA25)"
echo "   → Prix (Limited + Rare)"
echo "   → Merge + Build + Deploy"
echo "========================================="

for LEAGUE in $LEAGUES; do
  echo ""
  echo "🏟️  ===== $LEAGUE — JOUEURS ====="
  python3 fetch_all_players.py $LEAGUE --fresh

  echo ""
  echo "💰 ===== $LEAGUE — PRIX ====="
  python3 fetch_prices.py $LEAGUE --fresh
done

echo ""
echo "🔄 ===== MERGE ====="
python3 merge_data.py

echo ""
echo "🏗️  ===== BUILD ====="
export PATH="$HOME/.nvm/versions/node/v24.14.0/bin:$PATH"
cd deglingo-scout-app && npx vite build

echo ""
echo "🚀 ===== DEPLOY ====="
rm -rf "$HOME/Desktop/Moonwalk/.claude/scout-dist/assets"
cp -r dist/* "$HOME/Desktop/Moonwalk/.claude/scout-dist/"

echo ""
echo "✅ TERMINÉ ! Tout est prêt."
echo "   Ouvre http://localhost:5173 pour vérifier"
