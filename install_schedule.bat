@echo off
REM ================================================================
REM   install_schedule.bat - Configure l'automatisation complete
REM   - Tache DAILY    : MAJ_turbo.bat lundi/mardi/jeudi/vendredi/dimanche 05h30
REM   - Tache HEBDO    : MAJ_hebdo.bat mercredi + samedi 05h30 (post-GW)
REM
REM   Lancer UNE SEULE FOIS, en tant qu'administrateur (clic droit)
REM ================================================================
setlocal

echo.
echo ================================================================
echo   Installation taches planifiees : Deglingo Scout
echo ================================================================
echo.

REM Auto-detecte le chemin du repo
set "REPO_DIR=%~dp0"
if "%REPO_DIR:~-1%"=="\" set "REPO_DIR=%REPO_DIR:~0,-1%"

echo Chemin repo detecte : %REPO_DIR%
echo.

REM Heure par defaut 06:00 (modifiable : install_schedule.bat 07:30)
set "HEURE=%1"
if "%HEURE%"=="" set "HEURE=05:30"
echo Heure de lancement  : %HEURE%
echo.

REM ─── Tache DAILY : Mon, Tue, Thu, Fri, Sun a HEURE ────────────
set "CMD_DAILY=cmd /c cd /d \"%REPO_DIR%\" ^&^& MAJ_turbo.bat > maj_log_daily.txt 2>^&1"

echo [1/2] Creation tache DAILY (Lundi, Mardi, Jeudi, Vendredi, Dimanche)...
schtasks /Create /SC WEEKLY /D MON,TUE,THU,FRI,SUN ^
    /TN "Deglingo Scout MAJ Daily" ^
    /TR "%CMD_DAILY%" ^
    /ST %HEURE% ^
    /RU "%USERNAME%" ^
    /RL HIGHEST ^
    /F
if errorlevel 1 goto :err_admin
echo   [OK] Daily planifiee
echo.

REM ─── Tache HEBDO : Wed + Sat a HEURE (post-GW, gros rebuild) ──
set "CMD_HEBDO=cmd /c cd /d \"%REPO_DIR%\" ^&^& MAJ_hebdo.bat > maj_log_hebdo.txt 2>^&1"

echo [2/2] Creation tache HEBDO (Mercredi + Samedi, post-GW gros rebuild)...
schtasks /Create /SC WEEKLY /D WED,SAT ^
    /TN "Deglingo Scout MAJ Hebdo" ^
    /TR "%CMD_HEBDO%" ^
    /ST %HEURE% ^
    /RU "%USERNAME%" ^
    /RL HIGHEST ^
    /F
if errorlevel 1 goto :err_admin
echo   [OK] Hebdo planifiee
echo.

echo ================================================================
echo   [OK] 2 taches planifiees creees.
echo ================================================================
echo.
echo   Daily  : Lu/Ma/Je/Ve/Di a %HEURE% - MAJ_turbo.bat      (~8 min)
echo   Hebdo  : Me+Sa a %HEURE%        - MAJ_hebdo.bat        (~15-20 min)
echo.
echo   Logs : %REPO_DIR%\maj_log_daily.txt
echo          %REPO_DIR%\maj_log_hebdo.txt
echo.
echo ================================================================
echo   Commandes utiles
echo ================================================================
echo.
echo   Etat :
echo     schtasks /Query /TN "Deglingo Scout MAJ Daily" /V /FO LIST
echo     schtasks /Query /TN "Deglingo Scout MAJ Hebdo" /V /FO LIST
echo.
echo   Tester maintenant :
echo     schtasks /Run /TN "Deglingo Scout MAJ Daily"
echo     schtasks /Run /TN "Deglingo Scout MAJ Hebdo"
echo.
echo   Voir le log apres execution :
echo     type "%REPO_DIR%\maj_log_daily.txt"
echo     type "%REPO_DIR%\maj_log_hebdo.txt"
echo.
echo   Supprimer :
echo     schtasks /Delete /TN "Deglingo Scout MAJ Daily" /F
echo     schtasks /Delete /TN "Deglingo Scout MAJ Hebdo" /F
echo.
echo ================================================================
echo   IMPORTANT
echo ================================================================
echo   - PC allume a %HEURE% (ou activer "Reveiller l'ordinateur"
echo     dans Task Scheduler GUI -^> Proprietes -^> Conditions)
echo   - .env complet (FOOTBALL_DATA_API_KEY + SORARE_API_KEY)
echo   - 'npx wrangler login' fait une fois (pour deploy Cloudflare)
echo ================================================================
pause
endlocal
exit /b 0

:err_admin
echo.
echo [ERREUR] Impossible de creer les taches.
echo.
echo Lance ce fichier EN TANT QU'ADMINISTRATEUR :
echo   1. Clic droit sur install_schedule.bat
echo   2. "Executer en tant qu'administrateur"
echo.
pause
endlocal
exit /b 1
