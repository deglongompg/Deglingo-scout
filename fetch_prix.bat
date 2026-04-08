@echo off
title Deglingo Scout -- MAJ Prix cartes
cd /d "%~dp0"
echo.
echo ============================================
echo  MAJ PRIX CARTES -- Limited + Rare
echo  Duree estimee : ~2h pour 2600 joueurs
echo ============================================
echo.
py fetch_prices.py ALL
py merge_data.py
cd deglingo-scout-app
call npm run build
npx wrangler pages deploy dist --project-name=deglingo-sorare --branch=deglingo-sorare --commit-dirty=true
cd ..
echo.
echo ============================================
echo  DONE ! Prix mis a jour + deploye !
echo ============================================
pause
