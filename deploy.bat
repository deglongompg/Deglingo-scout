@echo off
echo ======================================================
echo   DEGLINGO SCOUT — Deploy Cloudflare Pages
echo ======================================================
echo.

cd /d "%~dp0deglingo-scout-app"

echo Deploy en cours...
npx wrangler pages deploy dist --project-name=deglingo-sorare --branch=deglingo-sorare --commit-dirty=true

if errorlevel 1 (
    echo.
    echo ERREUR - Deploy echoue !
    cd ..
    pause
    exit /b 1
)

echo.
echo Deploy OK ! Site en ligne sur deglingosorare.com/scout
cd ..
pause
