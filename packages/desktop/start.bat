@echo off
REM Kill any lingering electron processes
taskkill /f /im electron.exe >nul 2>&1
timeout /t 2 /nobreak >nul

REM Clear ELECTRON_RUN_AS_NODE which VS Code sets and breaks Electron
set ELECTRON_RUN_AS_NODE=

cd /d "%~dp0"
call npx electron-vite dev
pause
