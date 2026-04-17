@echo off
echo === FETCH PRIX MLS (FRESH - In-Season 2026) ===
py fetch_prices.py MLS --fresh
echo.
echo === REBUILD ===
py merge_data.py
cd deglingo-scout-app && npm run build
echo.
echo DONE !
pause
