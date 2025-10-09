#!/bin/bash

echo "Starting CoinGlass Monitor (Production Mode with Auto-Restart)..."

cd "$(dirname "$0")/.."
export NODE_ENV=production
export ENABLE_AUTO_UPDATE=https://github.com/techfanseric/coinglass-monitor.git

while true; do
    echo ""
    echo "==================================="
    echo "  CoinGlass Monitor Starting..."
    echo "==================================="
    echo ""

    npm start

    echo ""
    echo "==================================="
    echo "  Application stopped or restarted"
    echo "==================================="
    echo ""

    echo "Waiting 3 seconds before restart..."
    sleep 3
done