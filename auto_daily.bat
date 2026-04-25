@echo off
REM Wrapper pour tache planifiee "Deglingo Scout MAJ Daily"
REM Lance MAJ_turbo.bat avec stdout/stderr rediriges vers maj_log_daily.txt
cd /d "%~dp0"
call MAJ_turbo.bat > "%~dp0maj_log_daily.txt" 2>&1
exit /b %errorlevel%
