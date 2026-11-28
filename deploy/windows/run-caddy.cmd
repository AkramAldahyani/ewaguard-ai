@echo off
rem Runs Caddy for the public site and restarts it if it stops.
setlocal
for %%I in ("%~dp0..\..") do set "EWAGUARD_ROOT=%%~fI"
set "EWAGUARD_DIST=%EWAGUARD_ROOT%\frontend\dist"
rem winget installs Caddy per user; fall back to PATH if it lives elsewhere.
set "CADDY_EXE=%LOCALAPPDATA%\Microsoft\WinGet\Packages\CaddyServer.Caddy_Microsoft.Winget.Source_8wekyb3d8bbwe\caddy.exe"
if not exist "%CADDY_EXE%" set "CADDY_EXE=caddy"
if not exist "%EWAGUARD_ROOT%\logs" mkdir "%EWAGUARD_ROOT%\logs"
:run
"%CADDY_EXE%" run --adapter caddyfile --config "%~dp0Caddyfile" >> "%EWAGUARD_ROOT%\logs\caddy.log" 2>&1
echo {"level":"warn","msg":"caddy exited, restarting in 10 seconds"} >> "%EWAGUARD_ROOT%\logs\caddy.log"
ping -n 11 127.0.0.1 >nul
goto run
