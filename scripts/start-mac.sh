#!/bin/bash

echo "Starting CoinGlass Monitor (Production Mode)..."

cd "$(dirname "$0")/.."
export NODE_ENV=production
npm start