@echo off
title CoinGlass Monitor - Auto-Restart
echo Starting CoinGlass Monitor (Production Mode with Auto-Restart)...

cd /d "%~dp0.."
set NODE_ENV=production

:restart
cls
echo.
echo ===================================
echo   CoinGlass Monitor Starting...
echo ===================================
echo   Press Ctrl+C to stop auto-restart
echo ===================================
echo.

call npm start

set EXIT_CODE=%ERRORLEVEL%

echo.
echo ===================================
echo   Application exited with code: %EXIT_CODE%
echo   Auto-restarting in 3 seconds...
echo   Press Ctrl+C to stop
echo ===================================
echo.

timeout /t 3 /nobreak > nul
goto restart