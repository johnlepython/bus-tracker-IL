# 🍎 Setup Local (macOS)

Guide pour configurer l'environnement de développement sur Mac.

## Prérequis

1. **Homebrew** - Gestionnaire de paquets macOS
   ```bash
   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
   ```

2. **Node.js 22+**
   ```bash
   brew install node@22
   ```

3. **pnpm** - Gestionnaire de paquets
   ```bash
   corepack enable
   corepack prepare pnpm@latest --activate
   ```

4. **Docker Desktop** - Pour PostgreSQL et Redis
   ```bash
   brew install --cask docker
   ```
   Puis lancer Docker Desktop depuis les Applications.

5. **Git**
   ```bash
   brew install git
   ```

## Installation du projet

### 1. Cloner le repository

```bash
# Clone depuis GitHub
git clone https://github.com/johnlepython/bus-tracker-IL.git
cd bus-tracker-IL

# Configurer Git
git config user.name "Ton Nom"
git config user.email "ton@email.com"
```

### 2. Installer les dépendances

```bash
# Installe toutes les dépendances du monorepo
pnpm install
```

### 3. Créer les fichiers d'environnement

#### apps/server/.env
```bash
cp apps/server/.env.example apps/server/.env
```

Éditer `apps/server/.env` :
```env
# Générer une clé aléatoire (32 caractères)
COOKIE_ENCRYPTION_KEY=un_secret_aleatoire_de_32_chars

# URL de la base de données locale
DATABASE_URL=postgresql://postgres:QsPkHJ0696UDf6UX@localhost:5432/bustracker
```

#### apps/client/.env (si nécessaire)
```bash
cp apps/client/.env.example apps/client/.env
```

### 4. Démarrer les services Docker

```bash
# Lance PostgreSQL et Redis en arrière-plan
docker compose up -d

# Vérifie que les services sont actifs
docker compose ps
```

### 5. Initialiser la base de données

```bash
# Build des contracts (dépendance partagée)
pnpm -C libraries/contracts build

# Migrations de la base de données
pnpm -C apps/server db:push
```

## Lancer le projet en développement

### Option 1 : Lancer tous les composants séparément

Dans des terminaux séparés :

```bash
# Terminal 1 - Backend
pnpm dev:server

# Terminal 2 - Frontend
pnpm dev:client

# Terminal 3 - Provider Stride (exemple)
pnpm dev:stride
```

### Option 2 : Script de démarrage rapide

```bash
# Démarrer backend + frontend + stride
./start-light.sh
```

L'application sera accessible sur : http://localhost:3000

## Structure du projet

```
bus-tracker-IL/
├── apps/
│   ├── client/          # Frontend React + Vite
│   │   └── .env         # Config client
│   └── server/          # Backend Node.js
│       └── .env         # Config serveur (DB, cookies)
├── providers/           # Providers de données temps réel
│   ├── stride/          # Provider principal
│   ├── gtfs/
│   └── ...
├── libraries/
│   └── contracts/       # Types TypeScript partagés
├── compose.yml          # PostgreSQL + Redis
└── package.json         # Scripts du monorepo
```

## Commandes utiles

### Développement

```bash
# Linter
pnpm lint

# Formatter (avec Biome)
pnpm format

# Rebuild des contracts après modification
pnpm -C libraries/contracts build

# Réinitialiser la base de données
pnpm -C apps/server db:push --force
```

### Docker

```bash
# Voir les logs
docker compose logs -f

# Arrêter les services
docker compose down

# Nettoyer et redémarrer
docker compose down -v && docker compose up -d
```

### Base de données

```bash
# Accéder à PostgreSQL
docker exec -it bus-tracker-il-database-1 psql -U postgres -d bustracker

# Voir les migrations
pnpm -C apps/server drizzle-kit studio
```

## Troubleshooting

### Erreur "Port 5432 already in use"
PostgreSQL est déjà installé localement. Soit :
- Arrêter PostgreSQL : `brew services stop postgresql`
- Changer le port dans `compose.yml` : `5433:5432`

### Erreur "pnpm not found"
Réactiver corepack :
```bash
corepack enable
```

### Erreur de build des contracts
```bash
rm -rf libraries/contracts/dist
pnpm -C libraries/contracts build
```

### Docker ne démarre pas
- Vérifier que Docker Desktop est lancé
- Redémarrer Docker Desktop si nécessaire

## Prochaines étapes

Une fois le setup terminé :
1. Lire [DEV_WORKFLOW.md](DEV_WORKFLOW.md) pour le workflow Git
2. Créer une branche de feature : `git checkout -b feature/ma-feature`
3. Coder localement
4. Pousser et déployer : `./deploy.sh feature/ma-feature`
