@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ==========================================
echo   FETCH MLS — Major League Soccer
echo   Duree estimee : ~8 min pour 30 clubs
echo ==========================================

py fetch_all_players.py MLS --fresh

echo.
echo ==========================================
echo   MERGE + BUILD
echo ==========================================

py merge_data.py
cd deglingo-scout-app
call npm run build
cd ..

echo.
echo ==========================================
echo   DONE ! MLS fetched + build OK
echo   Lance deploy.bat pour mettre en ligne
echo ==========================================
pause
