#!/bin/bash
set -e

# Load NVM
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Change to client directory
cd /home/debian/bus-tracker-IL/apps/client

# Build the frontend
echo "Building frontend..."
pnpm build

echo "Frontend build completed. Files are in dist/"
