@echo off
title Deglingo Scout -- MAJ Fixtures
cd /d "%~dp0"
echo.
echo ============================================
echo  MAJ FIXTURES -- Calendrier prochain GW
echo  Duree estimee : ~30 secondes
echo ============================================
echo.
py fetch_fixtures.py
py merge_data.py
cd deglingo-scout-app
call npm run build
cd ..
echo.
echo ============================================
echo  DONE ! Fixtures mis a jour + build OK
echo ============================================
pause
