@echo off
title Deglingo Scout -- MAJ Vendredi
cd /d "%~dp0"

echo.
echo =========================================
echo   DEGLINGO SCOUT -- MAJ RAPIDE VENDREDI
echo =========================================
echo.

echo [1/4] STATUT BLESSES / SUSPENDUS / PROJ (~5 min)...
echo -----------------------------------------
py fetch_player_status.py

echo.
echo [2/4] FIXTURES CALENDRIER (~30 sec)...
echo -----------------------------------------
py fetch_fixtures.py

echo.
echo [3/4] MERGE DONNEES...
echo -----------------------------------------
py merge_data.py

echo.
echo [4/4] BUILD APP...
echo -----------------------------------------
cd deglingo-scout-app
call npm run build
cd ..

echo.
echo =========================================
echo   TOUT EST PRET -- deploie sur Cloudflare
echo =========================================
echo.
pause
