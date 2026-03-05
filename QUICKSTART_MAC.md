# 🚀 Quick Start - Depuis ton Mac

Guide ultra-rapide pour commencer à développer depuis ton Mac.

## ⚡ Setup initial (une seule fois)

### 1. Installer les outils

```bash
# Homebrew
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Node.js, Git, Docker
brew install node@22 git
brew install --cask docker

# pnpm
corepack enable
```

### 2. Cloner le projet

```bash
cd ~/Code  # ou ton dossier de projets
git clone https://github.com/johnlepython/bus-tracker-IL.git
cd bus-tracker-IL
```

### 3. Installer les dépendances

```bash
pnpm install
```

### 4. Configurer l'environnement

```bash
# Lancer Docker Desktop (icône Applications)

# Démarrer PostgreSQL + Redis
docker compose up -d

# Copier et configurer .env
cp apps/server/.env.example apps/server/.env
```

Éditer `apps/server/.env` :
```env
COOKIE_ENCRYPTION_KEY=ton_secret_aleatoire_32_chars
DATABASE_URL=postgresql://postgres:QsPkHJ0696UDf6UX@localhost:5432/bustracker
```

### 5. Configurer SSH vers le VPS

```bash
# Générer une clé SSH (si tu n'en as pas)
ssh-keygen -t ed25519 -C "ton@email.com"

# Copier la clé sur le VPS
ssh-copy-id debian@51.38.36.199

# Tester
ssh debian@51.38.36.199
exit

# (Optionnel) Configurer un alias SSH
cat .ssh-config.example >> ~/.ssh/config
```

## 🎯 Workflow quotidien

### Démarrer le dev

```bash
cd ~/Code/bus-tracker-IL

# Démarrer Docker (si pas déjà lancé)
docker compose up -d

# Terminal 1 : Backend
pnpm dev:server

# Terminal 2 : Frontend
pnpm dev:client

# Terminal 3 : Provider (si nécessaire)
pnpm dev:stride
```

➡️ Ouvrir http://localhost:3000

### Créer une feature

```bash
# Créer une branche
git checkout -b feature/nom-feature

# Coder...
# Tester localement...

# Commit
git add .
git commit -m "feat: description"

# Déployer sur le VPS
./deploy.sh feature/nom-feature

# Tester sur https://bus-tracker.fr
```

### Merger en production

```bash
# Revenir sur main
git checkout main
git merge feature/nom-feature

# Déployer en prod (avec rebuild frontend)
./deploy.sh main --full
```

## 📋 Commandes essentielles

```bash
# Déployer la branche courante (backend only)
./deploy.sh

# Déployer avec rebuild frontend
./deploy.sh --full

# Déployer une branche spécifique
./deploy.sh feature/ma-feature

# Voir les logs du VPS
ssh debian@51.38.36.199 "tail -f /var/log/bus-tracker-backend.log"

# Status des services
ssh debian@51.38.36.199 "sudo systemctl status bus-tracker-backend"
```

## 📚 Documentation complète

- **[LOCAL_SETUP.md](LOCAL_SETUP.md)** - Setup détaillé macOS
- **[DEV_WORKFLOW.md](DEV_WORKFLOW.md)** - Workflow Git complet
- **[README.md](README.md)** - Vue d'ensemble du projet

## 🆘 Problèmes courants

**Port 5432 déjà utilisé**
```bash
brew services stop postgresql
```

**Docker ne démarre pas**
→ Lancer Docker Desktop depuis Applications

**`pnpm` non trouvé**
```bash
corepack enable
```

**Erreur SSH**
```bash
ssh-copy-id debian@51.38.36.199
```

---

C'est tout ! Tu es prêt à développer 🎉
