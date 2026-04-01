@echo off
title Deglingo Scout -- MAJ Joueurs (stats completes)
cd /d "%~dp0"
echo.
echo ============================================
echo  MAJ JOUEURS -- Stats completes 4 ligues
echo  Duree estimee : ~20-25 min (--fresh)
echo ============================================
echo.
py fetch_all_players.py ALL --fresh
py merge_data.py
cd deglingo-scout-app
call npm run build
cd ..
echo.
echo ============================================
echo  DONE ! Stats joueurs mis a jour + build OK
echo ============================================
pause
