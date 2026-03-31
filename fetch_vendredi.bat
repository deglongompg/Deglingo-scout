@echo off
chcp 65001 >nul
title Deglingo Scout — MAJ Vendredi

echo.
echo =========================================
echo   DEGLINGO SCOUT — MAJ RAPIDE VENDREDI
echo =========================================
echo.

cd /d "%~dp0"

echo [1/4] STATUT BLESSES / SUSPENDUS / PROJ (~5 min)...
echo -----------------------------------------
py fetch_player_status.py
if errorlevel 1 ( echo ERREUR fetch_player_status & pause & exit /b 1 )

echo.
echo [2/4] FIXTURES CALENDRIER (~30 sec)...
echo -----------------------------------------
py fetch_fixtures.py
if errorlevel 1 ( echo ERREUR fetch_fixtures & pause & exit /b 1 )

echo.
echo [3/4] MERGE DONNEES...
echo -----------------------------------------
py merge_data.py
if errorlevel 1 ( echo ERREUR merge_data & pause & exit /b 1 )

echo.
echo [4/4] BUILD APP...
echo -----------------------------------------
cd deglingo-scout-app
call npm run build
if errorlevel 1 ( echo ERREUR npm build & pause & exit /b 1 )
cd ..

echo.
echo =========================================
echo   TOUT EST PRET — deploie sur Cloudflare
echo =========================================
echo.
pause
