@echo off
title Deglingo Scout -- Merge + Build uniquement
cd /d "%~dp0"
echo.
echo ============================================
echo  MERGE + BUILD -- Sans nouveau fetch
echo  Duree estimee : ~10 secondes
echo ============================================
echo.
py merge_data.py
cd deglingo-scout-app
call npm run build
cd ..
echo.
echo ============================================
echo  DONE ! Build OK
echo ============================================
pause
