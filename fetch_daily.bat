@echo off
echo ============================================
echo  MAJ DAILY - Scores matchs de la veille
echo ============================================
echo.

cd /d "%~dp0"

echo [1/3] Fetch scores matchs joues...
py fetch_gw_scores.py
if errorlevel 1 (
    echo ERREUR fetch_gw_scores.py
    pause
    exit /b 1
)

echo.
echo [2/3] Build...
cd deglingo-scout-app
call npm run build
if errorlevel 1 (
    echo ERREUR npm run build
    pause
    exit /b 1
)
cd ..

echo.
echo [3/3] Deploy Cloudflare...
call npx wrangler pages deploy scout-dist --project-name=deglingo-sorare
if errorlevel 1 (
    echo ERREUR deploy
    pause
    exit /b 1
)

echo.
echo ============================================
echo  DONE - App mise a jour !
echo ============================================
pause
