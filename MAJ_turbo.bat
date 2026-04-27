@echo off
setlocal
cls
echo ========================================================
echo   DEGLINGO SCOUT - MAJ TURBO (version PC)
echo   Fixtures + Titu%% + Scores + Build + Deploy Cloudflare
echo ========================================================
echo.

cd /d "%~dp0"

REM ---- Check .env ----
if not exist .env (
    echo [ERREUR] .env manquant. Cree-le avec FOOTBALL_DATA_API_KEY et SORARE_API_KEY.
    pause
    exit /b 1
)
findstr /B /C:"SORARE_API_KEY=" .env >nul
if errorlevel 1 (
    echo [WARN] SORARE_API_KEY absent du .env - batch limite complexity 500 vs 30000
)

set START=%TIME%

REM ---- [1/7] Fixtures 5 ligues (football-data.org) ----
echo --------- [1/7] FIXTURES (~30s) ---------
py fetch_fixtures.py
if errorlevel 1 ( echo [ERREUR] fetch_fixtures.py & pause & exit /b 1 )
echo.

REM ---- [2/7] Statut joueurs (blessures, suspensions, enum titu fallback) ----
echo --------- [2/7] STATUT JOUEURS (batch GraphQL, ~10s) ---------
py fetch_player_status.py
if errorlevel 1 ( echo [ERREUR] fetch_player_status.py & pause & exit /b 1 )
echo.

REM ---- [3/7] Scores SO5 des matchs joues (smart-skip) ----
echo --------- [3/7] SCORES SO5 (smart-skip, ~5-30s) ---------
py fetch_gw_scores.py
if errorlevel 1 ( echo [ERREUR] fetch_gw_scores.py & pause & exit /b 1 )
echo.

REM ---- [4/7] Merge data (raw leagues + status + prices) ----
REM ATTENTION : merge_data.py relit player_status.json et ecrase sorare_starter_pct !
REM C'est pour ca que fetch_titu_fast.py tourne APRES, pas avant.
echo --------- [4/7] MERGE donnees ---------
py merge_data.py
if errorlevel 1 ( echo [ERREUR] merge_data.py & pause & exit /b 1 )
echo.

REM ---- [5/7] Titu%% precis via API Sorare (OVERRIDE des enum) ----
REM Schema complet : voir MEMOIRE.md. Marche weekend + mid-week.
REM DOIT TOURNER APRES merge_data.py pour que ses valeurs ne soient pas ecrasees.
echo --------- [5/7] TITU%% PRECIS via API Sorare (~2min) ---------
if not exist sorare_club_slugs.json (
    echo   sorare_club_slugs.json absent - generation...
    py build_sorare_club_slugs.py
    if errorlevel 1 ( echo [ERREUR] build_sorare_club_slugs.py & pause & exit /b 1 )
)
py fetch_titu_fast.py
if errorlevel 1 (
    echo   [WARN] fetch_titu_fast a echoue.
    findstr /B /C:"SORAREINSIDE_PASSWORD=" .env >nul
    if not errorlevel 1 (
        echo   Fallback Sorareinside...
        py fetch_sorareinside.py
        if errorlevel 1 ( echo   [WARN] Sorareinside aussi KO - on garde enum approx )
    ) else (
        echo   Pas de SORAREINSIDE_PASSWORD - on garde enum approx.
    )
)
echo.

REM ---- [6/7] Build Vite ----
echo --------- [6/7] BUILD Vite ---------
cd /d "%~dp0deglingo-scout-app"
call npm run build
if errorlevel 1 ( echo [ERREUR] npm run build & cd /d "%~dp0" & pause & exit /b 1 )
cd /d "%~dp0"
echo.

REM ---- [7/7] Deploy Cloudflare + mirror scout-dist + git push ----
echo --------- [7/7] DEPLOY Cloudflare + git push ---------
cd /d "%~dp0deglingo-scout-app"
call npx wrangler pages deploy dist --project-name=deglingo-sorare --branch=deglingo-sorare --commit-dirty=true
if errorlevel 1 ( echo [ERREUR] wrangler & cd /d "%~dp0" & pause & exit /b 1 )
cd /d "%~dp0"

REM Mirror scout-dist (legacy www.deglingosorare.com/scout)
if exist scout-dist\assets rmdir /S /Q scout-dist\assets
xcopy deglingo-scout-app\dist\* scout-dist\ /E /Y /Q >nul
if errorlevel 1 ( echo [ERREUR] sync scout-dist & pause & exit /b 1 )

REM Commit + push (seulement si changements)
git add scout-dist deglingo-scout-app/public/data public/data deglingo-scout-app/src deglingo-scout-app/index.html sorare_club_slugs.json 2>nul
git diff --cached --quiet
if errorlevel 1 (
    git commit -m "chore turbo: MAJ quotidienne - fixtures + titu + scores + rebuild"
    if errorlevel 1 ( echo [ERREUR] git commit & pause & exit /b 1 )
    git push
    if errorlevel 1 ( echo [ERREUR] git push & pause & exit /b 1 )
    echo   Push GitHub OK
) else (
    echo   Aucun changement a commit.
)
echo.

echo ========================================================
echo   MAJ TURBO TERMINEE
echo   Demarree : %START%
echo   Finie   : %TIME%
echo   Prod    : https://scout.deglingosorare.com (Ctrl+Shift+R)
echo   Preview : https://deglingo-sorare.pages.dev
echo ========================================================
pause
endlocal
