@echo off
echo Starting Tien Hock ERP development environment...
echo.

:: Add NVM Node.js path to PATH
set "PATH=%PATH%;%USERPROFILE%\.nvm\versions\node\v23.6.0\bin;%USERPROFILE%\.nvm\versions\node\v23.6.0"

:: Start database in Docker
cd dev
docker compose up -d dev_db --remove-orphans
cd ..

:: Wait for database to be ready
echo Waiting for database...
timeout /t 10 /nobreak > nul

echo.
echo   Frontend: http://localhost:3000
echo   API:      http://localhost:5000
echo   Database: localhost:5434
echo.

:: Run both server and frontend using concurrently (single terminal)
call node_modules\.bin\concurrently --kill-others-on-fail --names "API,VITE" --prefix-colors "blue,magenta" "npm run server" "npm start"
