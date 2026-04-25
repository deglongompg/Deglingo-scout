@echo off
REM Wrapper pour tache planifiee "Deglingo Scout MAJ Hebdo"
REM - chcp 65001 + PYTHONIOENCODING=utf-8 : evite UnicodeEncodeError sur les print emoji des scripts python
REM - < NUL : redirige stdin pour que les 'pause' des .bat ne bloquent pas (mode non-interactif)
REM - Redirige stdout/stderr vers maj_log_hebdo.txt
cd /d "%~dp0"
chcp 65001 > nul
set "PYTHONIOENCODING=utf-8"
call MAJ_hebdo.bat < NUL > "%~dp0maj_log_hebdo.txt" 2>&1
exit /b %errorlevel%
