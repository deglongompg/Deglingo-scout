@echo off
title Deglingo Scout -- MAJ Fixtures
cd /d "%~dp0"
echo.
echo ============================================
echo  MAJ FIXTURES -- Calendrier prochain GW
echo  Duree estimee : ~30 secondes
echo ============================================
echo.
for /f "tokens=1,2 delims==" %%a in (.env) do if "%%a"=="FOOTBALL_DATA_API_KEY" set FOOTBALL_DATA_API_KEY=%%b
py fetch_fixtures.py %FOOTBALL_DATA_API_KEY%
py merge_data.py
cd deglingo-scout-app
call npm run build
cd ..
echo.
echo ============================================
echo  DONE ! Fixtures mis a jour + build OK
echo ============================================
pause
