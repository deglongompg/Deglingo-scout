@echo off
setlocal
echo ======================================================
echo   DEGLINGO SCOUT - Deploy complet (Cloudflare + prod)
echo ======================================================
echo.

REM ---- [1/4] Build Vite ----
cd /d "%~dp0deglingo-scout-app"
echo [1/4] Build Vite en cours...
call npm run build
if errorlevel 1 (
    echo.
    echo ERREUR - Build echoue !
    cd /d "%~dp0"
    pause
    exit /b 1
)
echo Build OK !
echo.

REM ---- [2/4] Wrangler Cloudflare Pages (preview direct) ----
echo [2/4] Deploy Cloudflare Pages (preview direct)...
call npx wrangler pages deploy dist --project-name=deglingo-sorare --branch=deglingo-sorare --commit-dirty=true
if errorlevel 1 (
    echo.
    echo ERREUR - Wrangler deploy echoue !
    cd /d "%~dp0"
    pause
    exit /b 1
)
echo Wrangler OK !
echo.

REM ---- [3/4] Sync scout-dist/ mirror ----
cd /d "%~dp0"
echo [3/4] Sync scout-dist/ (mirror prod via Wix)...
if exist scout-dist\assets rmdir /S /Q scout-dist\assets
xcopy deglingo-scout-app\dist\* scout-dist\ /E /Y /Q >nul
if errorlevel 1 (
    echo.
    echo ERREUR - Copy scout-dist echoue !
    pause
    exit /b 1
)
echo Mirror synchro OK !
echo.

REM ---- [4/4] Git commit + push pour deploy prod ----
echo [4/4] Git commit + push...
git add scout-dist deglingo-scout-app/src deglingo-scout-app/index.html deglingo-scout-app/public
git diff --cached --quiet
if errorlevel 1 (
    git commit -m "deploy: sync scout-dist mirror + updates"
    if errorlevel 1 (
        echo.
        echo ERREUR - Git commit echoue !
        pause
        exit /b 1
    )
    git push
    if errorlevel 1 (
        echo.
        echo ERREUR - Git push echoue !
        pause
        exit /b 1
    )
    echo Git push OK !
) else (
    echo Rien a commit - scout-dist deja synchro
)
echo.

echo ======================================================
echo   DEPLOY COMPLET !
echo   Preview  : https://deglingo-sorare.pages.dev
echo   Prod     : https://deglingosorare.com/scout (1-2 min)
echo ======================================================
pause
endlocal
