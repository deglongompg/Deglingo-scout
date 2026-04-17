@echo off
echo === FETCH PRIX LIGUE 1 ===
py fetch_prices.py L1
echo.
echo === REBUILD ===
py merge_data.py
cd deglingo-scout-app && npm run build
echo.
echo DONE !
pause
