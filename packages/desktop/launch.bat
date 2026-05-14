@echo off
taskkill /f /im electron.exe >nul 2>&1
set ELECTRON_RUN_AS_NODE=
cd /d "D:\Kyle\business\POS-desktop-app\packages\desktop"
npx electron-vite dev
