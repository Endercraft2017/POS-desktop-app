@echo off
setlocal
cd /d "%~dp0"
echo [deploy-web] Building...
call pnpm build:web || exit /b 1
echo [deploy-web] Re-rendering loyalty-card PNGs (Vite clears dist-web/ on build)...
call node scripts\render-loyalty-pngs.js || exit /b 1
echo [deploy-web] Uploading to 3ks.afkcube.com/app/...
scp -i "%USERPROFILE%\kali_openclaw" -r dist-web/* root@76.13.215.54:/var/www/3ks.afkcube.com/app/ || exit /b 1
echo [deploy-web] Done.
