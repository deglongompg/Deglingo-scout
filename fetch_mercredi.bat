@echo off
title Deglingo Scout -- MAJ Mercredi
cd /d "%~dp0"

echo.
echo =========================================
echo   DEGLINGO SCOUT -- GROSSE MAJ MERCREDI
echo =========================================
echo.

echo [1/6] STATS JOUEURS (5 ligues + MLS, ~8 min)...
echo -----------------------------------------
py fetch_all_players.py ALL --fresh

echo.
echo [2/6] FIXTURES CALENDRIER (~30 sec)...
echo -----------------------------------------
for /f "tokens=1,2 delims==" %%a in (.env) do if "%%a"=="FOOTBALL_DATA_API_KEY" set FOOTBALL_DATA_API_KEY=%%b
py fetch_fixtures.py %FOOTBALL_DATA_API_KEY%

echo.
echo [3/6] STATUT BLESSES / SUSPENDUS / PROJ (~5 min)...
echo -----------------------------------------
py fetch_player_status.py

echo.
echo [4/6] MERGE DONNEES...
echo -----------------------------------------
py merge_data.py

echo.
echo [5/6] BUILD APP...
echo -----------------------------------------
cd deglingo-scout-app
call npm run build
cd ..

echo.
echo [6/6] PRIX CARTES (long ~2h, tourne en fond)...
echo -----------------------------------------
start "Fetch Prices" py fetch_prices.py ALL --fresh

echo.
echo =========================================
echo   TOUT EST PRET -- deploie sur Cloudflare
echo   (les prix se mettent a jour en fond)
echo =========================================
echo.
pause
