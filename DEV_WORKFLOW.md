# 🔄 Workflow de Développement

Guide complet du nouveau workflow de développement : **Mac local → GitHub → VPS**

## 🎯 Vue d'ensemble

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│             │      │             │      │             │
│  Mac Local  │─────▶│   GitHub    │─────▶│     VPS     │
│    (dev)    │ push │  (branches) │ pull │ (production)│
│             │      │             │      │             │
└─────────────┘      └─────────────┘      └─────────────┘
   • Code           • Code review        • Deployment
   • Test local     • CI/CD              • Services
   • Commit         • Branches           • Logs
```

## 📋 Stratégie de branches

### Branches principales

- **`main`** : Production actuelle (déploiement automatique)
- **`1.0`** : Version stable 1.0 (release)
- **`feature/*`** : Nouvelles fonctionnalités
- **`fix/*`** : Corrections de bugs
- **`hotfix/*`** : Corrections urgentes en production

### Convention de nommage

```bash
feature/nom-de-la-feature    # Nouvelle fonctionnalité
fix/description-du-bug       # Correction de bug
hotfix/correction-urgente    # Correction urgente
refactor/nom-refactoring     # Refactoring de code
chore/tache-maintenance      # Tâche de maintenance
```

## 🚀 Workflow étape par étape

### 1. Créer une nouvelle feature

```bash
# Depuis main, créer une nouvelle branche
git checkout main
git pull origin main
git checkout -b feature/ma-nouvelle-feature
```

### 2. Développer localement

```bash
# Lancer l'environnement de dev local
docker compose up -d
pnpm dev:server    # Terminal 1
pnpm dev:client    # Terminal 2
pnpm dev:stride    # Terminal 3 (si nécessaire)

# Faire des modifications...
# Tester localement sur http://localhost:3000
```

### 3. Commit et push

```bash
# Ajouter les fichiers modifiés
git add .

# Commit avec un message descriptif
git commit -m "feat: ajout de la fonctionnalité X"

# Push vers GitHub
git push origin feature/ma-nouvelle-feature
```

#### Convention de messages de commit

```bash
feat:     Nouvelle fonctionnalité
fix:      Correction de bug
refactor: Refactoring de code
docs:     Documentation
style:    Formatage de code
test:     Ajout/modification de tests
chore:    Tâches de maintenance
perf:     Amélioration de performance
```

### 4. Déployer sur le VPS (test)

```bash
# Déploiement backend uniquement (rapide)
./deploy.sh feature/ma-nouvelle-feature

# Déploiement complet avec rebuild du frontend (lent)
./deploy.sh feature/ma-nouvelle-feature --full
```

Le script `deploy.sh` va :
1. ✅ Vérifier l'état du repo local
2. ⬆️ Push vers GitHub
3. 🔗 Se connecter au VPS
4. ⬇️ Pull les changements
5. 📦 Installer les dépendances
6. 🔄 Redémarrer les services

### 5. Tester sur le VPS

```bash
# Voir les logs en temps réel
ssh debian@51.38.36.199 "tail -f /var/log/bus-tracker-backend.log"

# Vérifier le status des services
ssh debian@51.38.36.199 "sudo systemctl status bus-tracker-backend"

# Ou utiliser le script de diagnostic
ssh debian@51.38.36.199 "cd /home/debian/bus-tracker-IL && ./check-status.sh"
```

### 6. Merger vers main

Une fois que la feature est testée et validée :

```bash
# Revenir sur main
git checkout main
git pull origin main

# Merger la feature
git merge feature/ma-nouvelle-feature

# Push vers GitHub
git push origin main

# Déployer en production
./deploy.sh main --full
```

### 7. Nettoyer les branches

```bash
# Supprimer la branche locale
git branch -d feature/ma-nouvelle-feature

# Supprimer la branche sur GitHub
git push origin --delete feature/ma-nouvelle-feature
```

## 🔧 Commandes utiles

### Git

```bash
# Voir l'état actuel
git status

# Voir l'historique
git log --oneline --graph --all

# Voir les branches
git branch -a

# Stash des modifications temporaires
git stash
git stash pop

# Annuler le dernier commit (garder les changements)
git reset --soft HEAD~1

# Annuler tous les changements locaux
git reset --hard HEAD
```

### Déploiement

```bash
# Déployer la branche courante (backend only)
./deploy.sh

# Déployer une branche spécifique
./deploy.sh feature/nom-feature

# Déploiement complet avec rebuild frontend
./deploy.sh main --full

# Déploiement avec variables personnalisées
VPS_HOST=user@autre-ip ./deploy.sh
```

### SSH vers le VPS

```bash
# Connexion SSH
ssh debian@51.38.36.199

# Exécuter une commande sur le VPS
ssh debian@51.38.36.199 "commande"

# Voir les logs
ssh debian@51.38.36.199 "tail -f /var/log/bus-tracker-backend.log"

# Redémarrer les services
ssh debian@51.38.36.199 "sudo systemctl restart bus-tracker-backend"
```

## 🎨 Workflow selon le type de changement

### Frontend uniquement (apps/client)

```bash
# Développer localement
pnpm dev:client

# Déployer avec rebuild complet
./deploy.sh feature/mon-composant --full
```

### Backend uniquement (apps/server)

```bash
# Développer localement
pnpm dev:server

# Déployer (pas besoin de rebuild frontend)
./deploy.sh feature/mon-endpoint
```

### Provider (providers/*)

```bash
# Développer localement
pnpm dev:stride  # ou autre provider

# Déployer (redémarre le service concerné)
./deploy.sh feature/stride-update
```

### Contracts (libraries/contracts)

```bash
# Rebuild local
pnpm -C libraries/contracts build

# Déployer avec rebuild complet
./deploy.sh feature/new-contract --full
```

## 🐛 Hotfix urgent en production

Pour une correction urgente en production :

```bash
# Créer une branche hotfix depuis main
git checkout main
git pull origin main
git checkout -b hotfix/correction-critique

# Faire la correction
# ... modifications ...

# Commit et push
git commit -am "hotfix: correction du bug critique"
git push origin hotfix/correction-critique

# Déployer immédiatement
./deploy.sh hotfix/correction-critique --full

# Une fois validé, merger dans main
git checkout main
git merge hotfix/correction-critique
git push origin main

# Nettoyer
git branch -d hotfix/correction-critique
git push origin --delete hotfix/correction-critique
```

## 📊 Monitoring après déploiement

### Vérifier que tout fonctionne

```bash
# Status des services
ssh debian@51.38.36.199 "sudo systemctl status bus-tracker-backend bus-tracker-stride-provider"

# Logs en temps réel
ssh debian@51.38.36.199 "tail -f /var/log/bus-tracker-backend.log"

# Script de diagnostic complet
ssh debian@51.38.36.199 "cd /home/debian/bus-tracker-IL && ./check-status.sh"

# Tester l'application
curl https://bus-tracker.fr
```

### En cas de problème

```bash
# Rollback rapide (revenir à main)
./deploy.sh main --full

# Voir les logs d'erreur
ssh debian@51.38.36.199 "tail -n 100 /var/log/bus-tracker-backend.log | grep -i error"

# Redémarrer tous les services
ssh debian@51.38.36.199 "cd /home/debian/bus-tracker-IL && ./restart-all.sh"
```

## 🔐 Configuration SSH (première fois)

Pour que le déploiement fonctionne sans mot de passe :

```bash
# Générer une clé SSH si nécessaire
ssh-keygen -t ed25519 -C "ton@email.com"

# Copier la clé sur le VPS
ssh-copy-id debian@51.38.36.199

# Tester la connexion
ssh debian@51.38.36.199
```

## 📝 Checklist avant déploiement

- [ ] Tous les changements sont commités
- [ ] Les tests locaux passent
- [ ] La branche est à jour avec main
- [ ] Le message de commit est clair
- [ ] Les variables d'environnement sont à jour (si nécessaire)
- [ ] La documentation est à jour (si nécessaire)

## 🆘 Aide rapide

| Problème | Solution |
|----------|----------|
| `git push` échoue | `git pull --rebase origin <branch>` puis retry |
| Déploiement échoue sur SSH | Vérifier `ssh debian@51.38.36.199` |
| Services ne redémarrent pas | `ssh debian@51.38.36.199 "./restart-all.sh"` |
| Changements non pris en compte | Essayer `./deploy.sh --full` |
| Erreur après déploiement | Voir logs : `ssh ... "tail /var/log/bus-tracker-backend.log"` |

## 📚 Ressources

- [LOCAL_SETUP.md](LOCAL_SETUP.md) - Setup environnement local Mac
- [DEPLOYMENT.md](DEPLOYMENT.md) - Documentation déploiement
- [SYSTEMD_SERVICES.md](SYSTEMD_SERVICES.md) - Services systemd
- [QUICK-REF.md](QUICK-REF.md) - Référence rapide
- **deploy.sh** - Script de déploiement automatique

---

**Note**: Ce workflow est conçu pour un environnement de développement solo ou en petite équipe. Pour une équipe plus grande, considère l'ajout de :
- Pull Requests sur GitHub
- CI/CD avec GitHub Actions
- Environnement de staging séparé
- Tests automatisés
