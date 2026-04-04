@echo off
cls
echo ======================================================
echo   DEGLINGO SCOUT - MAJ DAILY
echo   Scores matchs de la veille + Build app
echo ======================================================
echo.

cd /d "%~dp0"

echo [1/3] Fetch scores matchs joues...
echo ------------------------------------------------------
py fetch_gw_scores.py
if errorlevel 1 (
    echo.
    echo ERREUR - fetch_gw_scores.py a echoue !
    pause
    exit /b 1
)
echo.
echo [1/3] OK - Scores fetches !
echo.

echo [2/3] Build React app...
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
echo [2/3] OK - Build termine !
echo.

echo [3/3] Copie dist vers scout-dist...
echo ------------------------------------------------------
xcopy /E /Y /Q deglingo-scout-app\dist\* scout-dist\
if errorlevel 1 (
    echo.
    echo ERREUR - Copie dist echouee !
    pause
    exit /b 1
)
echo.
echo [3/3] OK - scout-dist pret !
echo.

echo ======================================================
echo   TOUT EST PRET - Lance le deploy :
echo.
echo   npx wrangler pages deploy scout-dist
echo       --project-name=deglingo-sorare
echo ======================================================
echo.
pause
