#!/bin/bash
# Non-interactive deployment script for automated CI/CD

set -e  

BRANCH="${1:-dev}"
VPS_HOST="${VPS_HOST:-debian@51.38.36.199}"
VPS_PATH="${VPS_PATH:-/home/debian/bus-tracker-IL}"

echo "🚀 Deploying branch: $BRANCH"
echo "📂 VPS: $VPS_HOST:$VPS_PATH"

# Check local git status
if [[ -n $(git status -s) ]]; then
    echo "❌ Error: Local changes exist. Commit or stash before deploying."
    exit 1
fi

# Push to GitHub
echo "📤 Pushing to GitHub..."
git push origin "$BRANCH" || true

# SSH commands to execute on VPS
ssh "$VPS_HOST" << 'EOSSH'
    # Load NVM
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    
    set -e
    echo "📥 Pulling latest changes..."
    cd /home/debian/bus-tracker-IL
    git fetch origin
    git checkout dev
    git pull origin dev
    
    echo "📦 Installing dependencies..."
    pnpm install
    
    echo "🛑 Stopping services..."
    sudo systemctl stop bus-tracker-backend bus-tracker-stride-provider || true
    
    echo "🔄 Restarting services..."
    sudo systemctl start bus-tracker-backend bus-tracker-stride-provider
    
    echo "✅ Deployment complete!"
    sleep 2
    
    echo "📊 Service status:"
    sudo systemctl status bus-tracker-backend bus-tracker-stride-provider --no-pager | grep -E "(Active|Main PID)" || true
    
    echo "📝 Recent logs:"
    tail -10 /var/log/bus-tracker-backend.log
EOSSH

echo "🎉 Done!"
