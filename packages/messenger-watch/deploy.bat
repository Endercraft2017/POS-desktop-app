@echo off
REM Deploy messenger-watch source to the Kali server.
REM Does NOT push the user-data dir (use the scp command from the README for that).

setlocal
set "SSH_KEY=%USERPROFILE%\kali_openclaw"
set "REMOTE=root@76.13.215.54"
set "REMOTE_DIR=/var/www/3ks.afkcube.com/messenger-watch"
set "HERE=%~dp0"

echo Syncing watcher source files to %REMOTE%:%REMOTE_DIR%
scp -i "%SSH_KEY%" "%HERE%package.json" %REMOTE%:%REMOTE_DIR%/package.json || goto :fail
scp -i "%SSH_KEY%" "%HERE%ecosystem.config.js" %REMOTE%:%REMOTE_DIR%/ecosystem.config.js || goto :fail
scp -i "%SSH_KEY%" -r "%HERE%src" %REMOTE%:%REMOTE_DIR%/ || goto :fail

if exist "%HERE%auth-state.json" (
    echo Syncing auth-state.json
    scp -i "%SSH_KEY%" "%HERE%auth-state.json" %REMOTE%:%REMOTE_DIR%/auth-state.json || goto :fail
    ssh -i "%SSH_KEY%" %REMOTE% "chmod 600 %REMOTE_DIR%/auth-state.json"
)

echo Syncing patched api/messenger.js (adds /api/messenger/scrape-ingest)
ssh -i "%SSH_KEY%" %REMOTE% "test -f /var/www/3ks.afkcube.com/api/messenger.js && cp /var/www/3ks.afkcube.com/api/messenger.js /var/www/3ks.afkcube.com/api/messenger.js.pre-scrape-bak.$(date +%%Y%%m%%d) 2>/dev/null; true"
scp -i "%SSH_KEY%" "%HERE%server-files\api-messenger.js" %REMOTE%:/var/www/3ks.afkcube.com/api/messenger.js || goto :fail

echo Installing deps + restarting pm2 processes
ssh -i "%SSH_KEY%" %REMOTE% "cd %REMOTE_DIR% && npm install --no-fund --no-audit --loglevel=error && pm2 restart pos-sync-api && (pm2 restart messenger-watch || pm2 start ecosystem.config.js)"
if errorlevel 1 goto :fail

echo Done.
exit /b 0

:fail
echo DEPLOY FAILED
exit /b 1
