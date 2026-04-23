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

REM ---- [1/3] UNDERSTAT xG/xGA/PPDA equipes (manuel : fichiers dans understat_data/) ----
echo --------- [1/3] STATS EQUIPES Understat (xG/xGA/PPDA) ---------
if exist understat_data\ligue1.json (
    py fetch_understat.py
    if errorlevel 1 ( echo [WARN] fetch_understat a echoue - non bloquant )
) else (
    echo [INFO] understat_data\*.json absents - skip stats equipes
    echo [INFO] Pour MAJ : download https://understat.com/league/{Ligue_1,EPL,La_liga,Bundesliga}
    echo [INFO] puis placer les 4 JSON dans understat_data/ et relancer
)
echo.

REM ---- [2/3] GROS REBUILD stats historiques ----
echo --------- [2/3] STATS JOUEURS complete (5 ligues, ~8 min) ---------
py fetch_all_players.py ALL --fresh
if errorlevel 1 ( echo [ERREUR] fetch_all_players.py & pause & exit /b 1 )
echo.

REM ---- [3/3] PRIX CARTES (optionnel) ----
echo --------- [3/3] PRIX LIMITED + RARE (~2 min) ---------
if exist fetch_prices.py (
    py fetch_prices.py
    if errorlevel 1 ( echo [WARN] fetch_prices a echoue - non bloquant )
) else (
    echo [INFO] fetch_prices.py absent - skip
)
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
