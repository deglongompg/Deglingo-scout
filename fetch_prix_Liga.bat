@echo off
echo === FETCH PRIX LA LIGA ===
py fetch_prices.py Liga
echo.
echo === REBUILD ===
py merge_data.py
cd deglingo-scout-app && npm run build
echo.
echo DONE !
pause
