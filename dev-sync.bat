@echo off
setlocal
if "%DEV_SYNC_WINDOW%"=="1" goto :run_dev_sync

set "DEV_SYNC_WINDOW=1"
start "Tien Hock Dev - Production Sync" cmd /k ""%~f0""
exit /b

:run_dev_sync
cd /d "%~dp0"
set "PATH=%PATH%;%USERPROFILE%\.nvm\versions\node\v23.6.0\bin;%USERPROFILE%\.nvm\versions\node\v23.6.0"
node dev/start-dev-sync.mjs
if errorlevel 1 echo Development startup stopped. See the message above.
endlocal
