@echo off
REM ================================================================
REM   install_schedule.bat - Automatise MAJ_turbo.bat tous les jours
REM   a lancer UNE SEULE FOIS, en tant qu'administrateur (clic droit)
REM ================================================================
setlocal

echo.
echo ================================================================
echo   Installation de la tache planifiee : Deglingo Scout MAJ Turbo
echo ================================================================
echo.

REM Auto-detecte le chemin du repo (le dossier ou se trouve ce .bat)
set "REPO_DIR=%~dp0"
REM Enleve le backslash final
if "%REPO_DIR:~-1%"=="\" set "REPO_DIR=%REPO_DIR:~0,-1%"

echo Chemin repo detecte : %REPO_DIR%
echo.

REM Heure par defaut : 06:00. Modifiable via argument : install_schedule.bat 07:30
set "HEURE=%1"
if "%HEURE%"=="" set "HEURE=06:00"
echo Heure de lancement : %HEURE% (modifie via : install_schedule.bat HH:MM)
echo.

REM Commande a lancer : cd dans repo + MAJ_turbo.bat + log
set "CMD=cmd /c cd /d \"%REPO_DIR%\" ^&^& MAJ_turbo.bat > maj_log.txt 2>^&1"

REM Cree la tache (ou la remplace si deja existante)
schtasks /Create /SC DAILY ^
    /TN "Deglingo Scout MAJ Turbo" ^
    /TR "%CMD%" ^
    /ST %HEURE% ^
    /RU "%USERNAME%" ^
    /RL HIGHEST ^
    /F

if errorlevel 1 (
    echo.
    echo [ERREUR] Impossible de creer la tache.
    echo Lance ce fichier EN TANT QU'ADMINISTRATEUR :
    echo   1. Clic droit sur install_schedule.bat
    echo   2. "Executer en tant qu'administrateur"
    pause
    exit /b 1
)

echo.
echo ================================================================
echo   [OK] Tache planifiee creee.
echo ================================================================
echo.
echo   Nom         : Deglingo Scout MAJ Turbo
echo   Frequence   : Tous les jours a %HEURE%
echo   Action      : MAJ_turbo.bat dans %REPO_DIR%
echo   Log         : %REPO_DIR%\maj_log.txt
echo.
echo ================================================================
echo   Commandes utiles
echo ================================================================
echo.
echo   Voir l'etat :
echo     schtasks /Query /TN "Deglingo Scout MAJ Turbo" /V /FO LIST
echo.
echo   Tester maintenant (sans attendre demain 06:00) :
echo     schtasks /Run /TN "Deglingo Scout MAJ Turbo"
echo.
echo   Voir le log apres execution :
echo     type "%REPO_DIR%\maj_log.txt"
echo.
echo   Supprimer la tache :
echo     schtasks /Delete /TN "Deglingo Scout MAJ Turbo" /F
echo.
echo ================================================================
echo   IMPORTANT
echo ================================================================
echo.
echo   - Le PC doit etre allume a %HEURE% (ou "reveiller l'ordinateur"
echo     active dans Task Scheduler GUI -^> Proprietes -^> Conditions)
echo   - .env doit contenir FOOTBALL_DATA_API_KEY + SORARE_API_KEY
echo   - 'npx wrangler login' doit avoir ete fait une fois (deploy CF)
echo.
pause
endlocal
