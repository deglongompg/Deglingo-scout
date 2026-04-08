@echo off
cls
echo ======================================================
echo   DEGLINGO SCOUT - MAJ DAILY
echo   Scores + Titu% + Build + Deploy
echo ======================================================
echo.

cd /d "%~dp0"

echo [1/4] Fetch scores matchs joues...
echo ------------------------------------------------------
py fetch_gw_scores.py
if errorlevel 1 (
    echo.
    echo ERREUR - fetch_gw_scores.py a echoue !
    pause
    exit /b 1
)
echo.
echo [1/4] OK - Scores fetches !
echo.

echo [2/4] Fetch statut blesses / titu%% Sorare (~5 min)...
echo ------------------------------------------------------
py fetch_player_status.py
if errorlevel 1 (
    echo.
    echo ERREUR - fetch_player_status.py a echoue !
    pause
    exit /b 1
)
py merge_data.py
if errorlevel 1 (
    echo.
    echo ERREUR - merge_data.py a echoue !
    pause
    exit /b 1
)
echo.
echo [2/4] OK - Statut + Titu%% mis a jour !
echo.

echo [3/4] Build React app...
echo ------------------------------------------------------
cd deglingo-scout-app
call npm run build
if errorlevel 1 (
    echo.
    echo ERREUR - npm run build a echoue !
    cd ..
    pause
    exit /b 1
)
cd ..
echo.
echo [3/4] OK - Build termine !
echo.

echo [4/4] Deploy Cloudflare Pages...
echo ------------------------------------------------------
cd deglingo-scout-app
npx wrangler pages deploy dist --project-name=deglingo-sorare --branch=deglingo-sorare --commit-dirty=true
if errorlevel 1 (
    echo.
    echo ERREUR - Deploy Cloudflare echoue !
    cd ..
    pause
    exit /b 1
)
cd ..
echo.
echo [4/4] OK - Deploy termine !
echo.

echo ======================================================
echo   TOUT EST PRET - Scores + Titu%% + Deploy OK !
echo ======================================================
echo.
pause
