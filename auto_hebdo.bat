@echo off
REM Wrapper pour tache planifiee "Deglingo Scout MAJ Hebdo"
REM Lance MAJ_hebdo.bat avec stdout/stderr rediriges vers maj_log_hebdo.txt
cd /d "%~dp0"
call MAJ_hebdo.bat > "%~dp0maj_log_hebdo.txt" 2>&1
exit /b %errorlevel%
