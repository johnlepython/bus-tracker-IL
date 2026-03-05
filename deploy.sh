#!/bin/bash
# Script de déploiement depuis Mac local vers le VPS
# Usage: ./deploy.sh [branch-name] [--full]

set -e  # Exit on error

# Couleurs pour l'output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Configuration
VPS_HOST="${VPS_HOST:-debian@51.38.36.199}"
VPS_PATH="${VPS_PATH:-/home/debian/bus-tracker-IL}"
BRANCH="${1:-$(git branch --show-current)}"
FULL_DEPLOY=false

# Vérifier si --full est passé
if [[ "$2" == "--full" ]] || [[ "$1" == "--full" ]]; then
    FULL_DEPLOY=true
fi

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}   Bus Tracker - Déploiement VPS         ${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Info sur le déploiement
echo -e "${YELLOW}📦 Branche:${NC} $BRANCH"
echo -e "${YELLOW}🖥️  VPS:${NC} $VPS_HOST"
echo -e "${YELLOW}📂 Path:${NC} $VPS_PATH"
echo -e "${YELLOW}🔧 Mode:${NC} $([ "$FULL_DEPLOY" = true ] && echo "Full deploy (rebuild frontend)" || echo "Backend only")"
echo ""

# Confirmation
read -p "$(echo -e ${YELLOW}Continuer le déploiement? [y/N]:${NC} )" -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${RED}❌ Déploiement annulé${NC}"
    exit 1
fi

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}Step 1/5: Vérification locale${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Vérifier qu'on est dans un repo git
if ! git rev-parse --is-inside-work-tree > /dev/null 2>&1; then
    echo -e "${RED}❌ Erreur: Pas dans un repository git${NC}"
    exit 1
fi

# Vérifier qu'il n'y a pas de changements non commités
if [[ -n $(git status -s) ]]; then
    echo -e "${YELLOW}⚠️  Changements non commités détectés:${NC}"
    git status -s
    read -p "$(echo -e ${YELLOW}Continuer quand même? [y/N]:${NC} )" -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${RED}❌ Commit ou stash tes changements avant de déployer${NC}"
        exit 1
    fi
fi

echo -e "${GREEN}✅ Repository local OK${NC}"
echo ""

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}Step 2/5: Push vers GitHub${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

git push origin "$BRANCH"
echo -e "${GREEN}✅ Code pushé sur GitHub${NC}"
echo ""

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}Step 3/5: Connexion au VPS${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Test de connexion SSH
if ! ssh -o ConnectTimeout=5 "$VPS_HOST" "echo 'SSH OK'" > /dev/null 2>&1; then
    echo -e "${RED}❌ Impossible de se connecter au VPS${NC}"
    echo -e "${YELLOW}Vérifie que ton SSH est configuré:${NC}"
    echo "  ssh $VPS_HOST"
    exit 1
fi

echo -e "${GREEN}✅ Connexion SSH établie${NC}"
echo ""

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}Step 4/5: Pull sur le VPS${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

ssh "$VPS_HOST" "cd $VPS_PATH && \
    echo '📥 Fetching from GitHub...' && \
    git fetch origin && \
    echo '🔀 Checking out branch: $BRANCH' && \
    git checkout $BRANCH && \
    echo '⬇️  Pulling latest changes...' && \
    git pull origin $BRANCH && \
    echo '📦 Installing dependencies...' && \
    pnpm install"

echo -e "${GREEN}✅ Code à jour sur le VPS${NC}"
echo ""

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}Step 5/5: Rebuild & Restart${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

if [ "$FULL_DEPLOY" = true ]; then
    echo -e "${YELLOW}🔨 Rebuild frontend...${NC}"
    ssh "$VPS_HOST" "cd $VPS_PATH && \
        pnpm -C libraries/contracts build && \
        ./build-frontend.sh"
    
    echo -e "${YELLOW}🔄 Reload nginx...${NC}"
    ssh "$VPS_HOST" "sudo systemctl reload nginx"
fi

echo -e "${YELLOW}🔄 Restart backend services...${NC}"
ssh "$VPS_HOST" "sudo systemctl restart bus-tracker-backend bus-tracker-stride-provider"

echo -e "${GREEN}✅ Services redémarrés${NC}"
echo ""

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}🎉 Déploiement terminé avec succès!${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${YELLOW}📊 Status des services:${NC}"
ssh "$VPS_HOST" "sudo systemctl status bus-tracker-backend bus-tracker-stride-provider --no-pager | grep -E '(Active:|Main PID:|Memory:|CPU:)'"
echo ""
echo -e "${YELLOW}📝 Logs (dernières 5 lignes):${NC}"
ssh "$VPS_HOST" "tail -n 5 /var/log/bus-tracker-backend.log"
echo ""
echo -e "${YELLOW}🌐 Application disponible sur:${NC} https://bus-tracker.fr"
echo ""
