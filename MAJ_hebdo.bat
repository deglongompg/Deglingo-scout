@echo off
setlocal
cls
echo ========================================================
echo   DEGLINGO SCOUT - MAJ HEBDO (Mercredi + Samedi matin)
echo   Gros rebuild stats L5/L10/AA + turbo daily
echo ========================================================
echo.

cd /d "%~dp0"

REM Check .env
if not exist .env (
    echo [ERREUR] .env manquant. Cree-le avec FOOTBALL_DATA_API_KEY et SORARE_API_KEY.
    pause
    exit /b 1
)

set START=%TIME%

REM ---- [1/4] UNDERSTAT xG/xGA/PPDA equipes (Big5 - fichiers dans understat_data/) ----
echo --------- [1/4] STATS EQUIPES Understat (xG/xGA/PPDA Big5) ---------
if exist understat_data\ligue1.json (
    py fetch_understat.py
    if errorlevel 1 ( echo [WARN] fetch_understat a echoue - non bloquant )
) else (
    echo [INFO] understat_data\*.json absents - skip stats Big5
    echo [INFO] Pour MAJ : download https://understat.com/league/{Ligue_1,EPL,La_liga,Bundesliga}
    echo [INFO] puis placer les 4 JSON dans understat_data/ et relancer
)
echo.

REM ---- [2/4] xG/xGA Belgique + Pays-Bas via API-Football (Pro plan) ----
echo --------- [2/4] STATS EQUIPES API-Football (JPL + Ere, ~3 min) ---------
py fetch_apisports.py JPL
if errorlevel 1 ( echo [WARN] fetch_apisports JPL a echoue - non bloquant )
py fetch_apisports.py Ere
if errorlevel 1 ( echo [WARN] fetch_apisports Ere a echoue - non bloquant )
echo.

REM ---- [3/4] GROS REBUILD stats historiques (7 ligues : L1/PL/Liga/Bundes/MLS/JPL/Ere) ----
echo --------- [3/4] STATS JOUEURS complete (7 ligues, ~10 min) ---------
py fetch_all_players.py ALL --fresh
if errorlevel 1 ( echo [ERREUR] fetch_all_players.py & pause & exit /b 1 )
echo.

REM ---- [4/4] PRIX CARTES (7 ligues incl. JPL + Ere) ----
echo --------- [4/4] PRIX LIMITED + RARE (~3 min) ---------
if exist fetch_prices.py (
    py fetch_prices.py
    if errorlevel 1 ( echo [WARN] fetch_prices a echoue - non bloquant )
) else (
    echo [INFO] fetch_prices.py absent - skip
)
echo.

REM ---- Rebuild sorare_club_slugs.json pour fetch_titu_fast (auto-include nouveaux clubs JPL/Ere/etc.)
echo --------- REFRESH sorare_club_slugs.json (clubs JPL/Ere ajoutes) ---------
py build_sorare_club_slugs.py
if errorlevel 1 ( echo [WARN] build_sorare_club_slugs a echoue - non bloquant )
echo.

REM ---- Puis enchaine sur MAJ_turbo.bat (fixtures + titu%% + deploy) ----
echo ========================================================
echo   Enchaine sur MAJ_turbo.bat (fixtures + titu%% + deploy)
echo ========================================================
call MAJ_turbo.bat

echo.
echo ========================================================
echo   MAJ HEBDO TERMINEE
echo   Demarree : %START%
echo   Finie   : %TIME%
echo ========================================================
pause
endlocal
