# Stride Provider (Israel Bus Tracker)

Provider pour l'API Stride (Open Bus Stride API) - données temps réel des bus en Israël via Hasadna.

## Configuration

Set les variables d'environnement suivantes :

```bash
# Requis
NETWORK_REF=ISRAEL                                    # Identifiant du réseau
STRIDE_API_URL=https://open-bus-stride-api.hasadna.org.il  # URL de l'API (défaut ci-dessus)

# Optionnel
OPERATOR_REF=1                                        # Opérateur (agence) - défaut: vide
REDIS_URL=redis://127.0.0.1:6379                     # URL Redis
REDIS_USERNAME=                                       # Nom d'utilisateur Redis (opt)
REDIS_PASSWORD=                                       # Mot de passe Redis (opt)
REDIS_CHANNEL=journeys                                # Canal Pub/Sub Redis
POLL_INTERVAL_MS=60000                                # Intervalle de poll (ms) - défaut: 60s
```

## Utilisation

### Mode développement (avec hot-reload)
```bash
pnpm install
NETWORK_REF=ISRAEL pnpm run dev
```

### Mode production (build + run)
```bash
pnpm install
pnpm run build
NETWORK_REF=ISRAEL pnpm start
```

## Architecture

- **Fetch** : Appelle `/siri_vehicle_locations/list` avec pagination (limit=50k par batch)
- **Dedup** : Garde seulement la dernière location par vehicle_ref
- **Transform** : Mappe vers `VehicleJourney` (contrat @bus-tracker/contracts)
- **Publish** : Envoie en batches de 1000 vers Redis pub/sub sur le canal `journeys`

### Gestion du volume

Pour supporter 6000+ bus :
- Pagination avec offset/limit (50k résultats max par requête)
- Déduplication en mémoire (une Map par vehicle)
- Publication en batches (1000 journeys par message Redis)
- Fenêtres temps incrémentales (`recorded_at_time_from`) pour requêtes futures

### Données

L'API Stride retourne des `siri_vehicle_location` avec :
- `siri_ride__vehicle_ref`: Identifiant du bus (numérique, e.g. "7789069")
- `recorded_at_time`: Timestamp ISO complet (e.g. "2023-01-01T06:46:38+00:00")
- `lat/lon`: Coordonnées GPS
- `bearing`: Direction (0-360°)
- `siri_route__line_ref`: Numéro de ligne (e.g. 3916)
- `siri_route__operator_ref`: Agence/opérateur (e.g. 3 pour Eged)

### Transformation VehicleJourney

Chaque location est transformée en `VehicleJourney` :
```typescript
{
  id: "ISRAEL:1:VehicleTracking:7789069",
  position: {
    latitude: 32.767048,  
    longitude: 35.036621,
    bearing: 176,
    atStop: false,
    type: "GPS",
    recordedAt: "2023-01-01T06:46:38+00:00"
  },
  networkRef: "ISRAEL",
  operatorRef: "1",
  vehicleRef: "ISRAEL:1:Vehicle:7789069",
  line: {
    ref: "ISRAEL:Line:3916",
    number: "3916",
    type: "BUS"
  },
  updatedAt: "2023-01-01T06:50:00Z"
}
```

## Tests

Test rapide de l'API sans dépendances :
```bash
python3 << 'EOF'
import json, urllib.request
url = "https://open-bus-stride-api.hasadna.org.il/siri_vehicle_locations/list?limit=10"
with urllib.request.urlopen(url) as resp:
    data = json.load(resp)
print(f"✓ API OK: {len(data)} locations")
EOF
```

## Ressources

- **API Docs** : https://open-bus-stride-api.hasadna.org.il/docs
- **Data Model** : https://github.com/hasadna/open-bus-stride-db/blob/main/DATA_MODEL.md  
- **Stride ETL** : https://github.com/hasadna/open-bus-pipelines/blob/main/STRIDE_ETL_PROCESSES.md
- **Python Client** : https://github.com/hasadna/open-bus-stride-client
