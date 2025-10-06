@echo off
echo Starting CoinGlass Monitor (Production Mode with Auto-Restart)...

cd /d "%~dp0.."
set NODE_ENV=production

:restart
echo.
echo ===================================
echo   CoinGlass Monitor Starting...
echo ===================================
echo.

npm start

echo.
echo ===================================
echo   Application stopped or restarted
echo ===================================
echo.

timeout /t 3 /nobreak > nul
goto restart