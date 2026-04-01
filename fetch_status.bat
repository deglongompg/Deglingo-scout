@echo off
title Deglingo Scout -- MAJ Statut joueurs
cd /d "%~dp0"
echo.
echo ============================================
echo  MAJ STATUT -- Blesses + Suspendus + Proj
echo  Duree estimee : ~5 min pour 2600 joueurs
echo ============================================
echo.
py fetch_player_status.py
py merge_data.py
cd deglingo-scout-app
call npm run build
cd ..
echo.
echo ============================================
echo  DONE ! Statuts mis a jour + build OK
echo ============================================
pause
