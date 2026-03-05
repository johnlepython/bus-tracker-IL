#!/bin/bash
set -e

# Load NVM
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Change to correct directory
cd /home/debian/bus-tracker-IL/apps/server

# Run the server
exec pnpm exec tsx src/index.ts
