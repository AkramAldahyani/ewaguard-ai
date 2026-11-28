@echo off
rem Runs the EWAGuard AI backend in production mode and restarts it if it stops.
rem Settings come only from .env.production; the development .env is never read.
setlocal
for %%I in ("%~dp0..\..") do set "EWAGUARD_ROOT=%%~fI"
set "EWAGUARD_ENV_FILE=%EWAGUARD_ROOT%\.env.production"
set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if not exist "%NODE_EXE%" set "NODE_EXE=node"
if not exist "%EWAGUARD_ROOT%\logs" mkdir "%EWAGUARD_ROOT%\logs"
cd /d "%EWAGUARD_ROOT%"
:run
"%NODE_EXE%" backend\src\server.js >> "%EWAGUARD_ROOT%\logs\backend.log" 2>&1
echo {"level":"WARN","event":"backend_exited","restartInSeconds":10} >> "%EWAGUARD_ROOT%\logs\backend.log"
ping -n 11 127.0.0.1 >nul
goto run
