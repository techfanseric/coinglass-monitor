@echo off
echo Starting CoinGlass Monitor (Production Mode)...

cd /d "%~dp0.."
set NODE_ENV=production
npm start

pause