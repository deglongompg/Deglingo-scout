@echo off
setlocal
cls
echo ======================================================
echo   DEGLINGO SCOUT - MAJ DAILY (full deploy)
echo   Scores + Build + Wrangler + scout-dist + Git
echo ======================================================
echo.

cd /d "%~dp0"

REM ---- [1/5] Fetch scores matchs joues ----
echo [1/5] Fetch scores matchs joues...
py fetch_gw_scores.py
if errorlevel 1 ( echo ERREUR - fetch_gw_scores.py & pause & exit /b 1 )
echo [1/5] OK
echo.

REM ---- [2/5] Build Vite ----
echo [2/5] Build Vite...
cd /d "%~dp0deglingo-scout-app"
call npm run build
if errorlevel 1 ( echo ERREUR - npm run build & cd /d "%~dp0" & pause & exit /b 1 )
echo [2/5] OK
echo.

REM ---- [3/5] Wrangler Cloudflare Pages ----
echo [3/5] Deploy Cloudflare Pages (preview direct)...
call npx wrangler pages deploy dist --project-name=deglingo-sorare --branch=deglingo-sorare --commit-dirty=true
if errorlevel 1 ( echo ERREUR - wrangler & cd /d "%~dp0" & pause & exit /b 1 )
echo [3/5] OK
echo.

REM ---- [4/5] Sync scout-dist (mirror prod via Wix) ----
cd /d "%~dp0"
echo [4/5] Sync scout-dist/...
if exist scout-dist\assets rmdir /S /Q scout-dist\assets
xcopy deglingo-scout-app\dist\* scout-dist\ /E /Y /Q >nul
if errorlevel 1 ( echo ERREUR - sync scout-dist & pause & exit /b 1 )
echo [4/5] OK
echo.

REM ---- [5/5] Git commit + push (auto-deploy prod via GitHub main) ----
echo [5/5] Git commit + push...
git add scout-dist deglingo-scout-app/public/data public/data deglingo-scout-app/src deglingo-scout-app/index.html
git diff --cached --quiet
if errorlevel 1 (
    git commit -m "chore(daily): MAJ scores + rebuild" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
    if errorlevel 1 ( echo ERREUR - git commit & pause & exit /b 1 )
    git push
    if errorlevel 1 ( echo ERREUR - git push & pause & exit /b 1 )
    echo [5/5] OK - Push GitHub (Wix auto-deploy dans 1-2 min)
) else (
    echo [5/5] Rien a commit (deja a jour).
)
echo.

echo ======================================================
echo   MAJ DAILY COMPLETE !
echo   Preview : https://deglingo-sorare.pages.dev
echo   Prod    : https://deglingosorare.com/scout (1-2 min)
echo ======================================================
pause
endlocal
