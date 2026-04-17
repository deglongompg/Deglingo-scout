@echo off
echo === FETCH PRIX PREMIER LEAGUE ===
py fetch_prices.py PL
echo.
echo === REBUILD ===
py merge_data.py
cd deglingo-scout-app && npm run build
echo.
echo DONE !
pause
