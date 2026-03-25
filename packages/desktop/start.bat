@echo off
REM Clear ELECTRON_RUN_AS_NODE which VS Code sets and breaks Electron
set ELECTRON_RUN_AS_NODE=
cd /d "%~dp0"
call npx electron-vite dev
pause
