@echo off
echo ============================================
echo  Fetch scores matchs joues (GW en cours)
echo ============================================
echo.

cd /d "%~dp0"

py fetch_gw_scores.py
if errorlevel 1 (
    echo ERREUR fetch_gw_scores.py
    pause
    exit /b 1
)

echo.
echo ============================================
echo  DONE - Scores fetches !
echo ============================================
pause
