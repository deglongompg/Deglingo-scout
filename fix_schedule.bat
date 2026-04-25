@echo off
REM ============================================================
REM   fix_schedule.bat
REM   Corrige les taches planifiees "Deglingo Scout MAJ Daily/Hebdo".
REM   Bug : echappement dans l'ancienne installation cassait
REM   la chaine et la tache terminait en exit 1 sans log.
REM
REM   LANCER EN TANT QU'ADMIN (clic droit -> Executer en admin)
REM ============================================================
setlocal
set "REPO_DIR=%~dp0"
if "%REPO_DIR:~-1%"=="\" set "REPO_DIR=%REPO_DIR:~0,-1%"

echo Repo: %REPO_DIR%
echo.

set "HEURE=05:30"

echo [1/4] Suppression ancienne tache DAILY...
schtasks /Delete /TN "Deglingo Scout MAJ Daily" /F >nul 2>&1

echo [2/4] Suppression ancienne tache HEBDO...
schtasks /Delete /TN "Deglingo Scout MAJ Hebdo" /F >nul 2>&1

echo [3/4] Re-creation DAILY (wrapper auto_daily.bat)...
schtasks /Create /SC WEEKLY /D MON,TUE,THU,FRI,SUN ^
    /TN "Deglingo Scout MAJ Daily" ^
    /TR "\"%REPO_DIR%\auto_daily.bat\"" ^
    /ST %HEURE% ^
    /RU "%USERNAME%" ^
    /RL HIGHEST ^
    /F
if errorlevel 1 goto :err

echo [4/4] Re-creation HEBDO (wrapper auto_hebdo.bat)...
schtasks /Create /SC WEEKLY /D WED,SAT ^
    /TN "Deglingo Scout MAJ Hebdo" ^
    /TR "\"%REPO_DIR%\auto_hebdo.bat\"" ^
    /ST %HEURE% ^
    /RU "%USERNAME%" ^
    /RL HIGHEST ^
    /F
if errorlevel 1 goto :err

echo.
echo ============================================================
echo   [OK] Taches corrigees.
echo ============================================================
echo.
echo   Tester DAILY maintenant :
echo     schtasks /Run /TN "Deglingo Scout MAJ Daily"
echo.
echo   Voir le log apres execution (~8 min) :
echo     type "%REPO_DIR%\maj_log_daily.txt"
echo.
pause
endlocal
exit /b 0

:err
echo.
echo [ERREUR] Lance ce script EN TANT QU'ADMINISTRATEUR.
pause
endlocal
exit /b 1
