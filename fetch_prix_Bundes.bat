@echo off
echo === FETCH PRIX BUNDESLIGA ===
py fetch_prices.py Bundes
echo.
echo === REBUILD ===
py merge_data.py
cd deglingo-scout-app && npm run build
echo.
echo DONE !
pause
