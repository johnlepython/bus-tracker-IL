[![Logo](./documentation/images/logo-full-width.png)](https://bus-tracker.fr)

[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=bus-tracker-app&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=bus-tracker-app)
[![Discord](https://dcbadge.limes.pink/api/server/DpwtEU4qBg)](https://discord.gg/DpwtEU4qBg)


**Bus Tracker** is an application for tracking public transport vehicles that
leverages open data published by transport authorities and operators.

As of March 2025, it is available in most of the biggest French transit networks and tracks over 8k vehicles every day.

## Links

- Website: [https://bus-tracker.fr](https://bus-tracker.fr)
- Uptime: [https://uptime.bus-tracker.fr](https://uptime.bus-tracker.fr/status/bus-tracker)
- Discord: [https://discord.gg/DpwtEU4qBg](https://discord.gg/DpwtEU4qBg)
- E-mail: [contact@bus-tracker.fr](mailto:contact@bus-tracker.fr)

## How to run

Before running the project, please ensure:
- you have Docker Engine on your machine
- you run a decent version of Node (22+ preferrably)
- you have installed `pnpm`'s wrapper (`corepack enable`)


Now, to run the project:
1. Start the compose services: `docker compose up -d`
2. Build `@bus-tracker/contracts`: `pnpm -C libraries/contracts build`
3. Start the server app: `pnpm dev:server`
4. Start the client app: `pnpm dev:client`
5. Start one or more providers (e.g.: `pnpm dev:gtfs configurations/rouen-astuce.mjs`)
6. Head to [http://localhost:3000](http://localhost:3000)

## Development Workflow

For local development on macOS and deployment to VPS:

- **🍎 [LOCAL_SETUP.md](LOCAL_SETUP.md)** - Complete setup guide for macOS development environment
- **🔄 [DEV_WORKFLOW.md](DEV_WORKFLOW.md)** - Git workflow, branching strategy, and deployment process
- **🚀 `./deploy.sh`** - Automated deployment script from local to VPS

### Quick Start (Local Development)

```bash
# Clone and setup on Mac
git clone https://github.com/johnlepython/bus-tracker-IL.git
cd bus-tracker-IL
pnpm install
docker compose up -d

# Create feature branch
git checkout -b feature/my-feature

# Develop locally, then deploy to VPS
./deploy.sh feature/my-feature
```

See **[DEV_WORKFLOW.md](DEV_WORKFLOW.md)** for the complete development and deployment workflow.

## Tech architecture

Since the late 2024 rewrite, the app now uses Redis as a pub-sub mechanism for *providers* to send their data to the core server, whose responsibility is to aggregate and publish data to the end users.

![Architecture diagram](./documentation/images/architecture-diagram.png)

## Around the app

These components are involved in Bus Tracker in some way:
- [GTFS-RT Generator – LiA (Le Havre)](https://github.com/kevinbioj/gtfsrt-lia)
- [GTFS-RT Generator – Astuce / TCAR (Rouen)](https://github.com/kevinbioj/gtfsrt-tcar)
- [GTFS-RT Generator – Île-de-France Mobilités (rail & subway only)](https://github.com/kevinbioj/gtfsrt-idfm)

## Operations & Deployment

For server deployment and operations documentation:

- **📋 [DEPLOYMENT.md](DEPLOYMENT.md)** - Complete deployment guide with configuration, troubleshooting, and architecture details
- **⚡ [QUICK-REF.md](QUICK-REF.md)** - Quick reference for common commands and fixes
- **� [SYSTEMD_SERVICES.md](SYSTEMD_SERVICES.md)** - **systemd services documentation (production)**
- **⚡ [SERVICES_QUICKSTART.md](SERVICES_QUICKSTART.md)** - Quick reference for systemd services
- **🔍 `./check-status.sh`** - Run diagnostic checks on all services
- **🚀 `./restart-all.sh`** - Automated restart script for all services

### Production Deployment (systemd)

The production server uses **systemd services** for automatic startup and crash recovery:

```bash
# Service status
sudo systemctl status bus-tracker-backend bus-tracker-stride-provider

# Restart services
sudo systemctl restart bus-tracker-backend bus-tracker-stride-provider

# View logs
tail -f /var/log/bus-tracker-backend.log
tail -f /var/log/bus-tracker-stride.log

# Deploy updates
git pull && pnpm install
sudo systemctl restart bus-tracker-backend bus-tracker-stride-provider

# Rebuild frontend
./build-frontend.sh && sudo systemctl reload nginx
```

See **[SYSTEMD_SERVICES.md](SYSTEMD_SERVICES.md)** for complete documentation.

### Development Setup

```bash
# Check system status
./check-status.sh

# Restart all services (manual)
./restart-all.sh
```

**Important**: Backend must run on port **8080** for nginx to work correctly.

## License

This app is licensed under the **General Public License 3.0**, please refer to [LICENSE](./LICENSE) for any more information.
