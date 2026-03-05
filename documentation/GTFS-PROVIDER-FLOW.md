# Documentation du Provider GTFS - Flux de Traitement

## Vue d'ensemble

Le provider GTFS est le composant central qui récupère les données des réseaux de transport en temps réel (GTFS-RT) et les convertit en objets `VehicleJourney` standardisés pour le serveur Bus Tracker.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     PROVIDER GTFS                                │
│                                                                  │
│  1. INITIALISATION                                              │
│     ├─ Téléchargement GTFS statique (.zip)                     │
│     ├─ Import en mémoire (agencies, routes, trips, stops...)   │
│     └─ Pré-calcul des journeys d'aujourd'hui                   │
│                                                                  │
│  2. BOUCLE PRINCIPALE (toutes les 10-120s)                     │
│     ├─ Téléchargement GTFS-RT (TripUpdates + VehiclePositions)│
│     ├─ Calcul des véhicules actifs                             │
│     └─ Publication vers Redis (canal "journeys")               │
│                                                                  │
│  3. TÂCHES PÉRIODIQUES                                         │
│     ├─ 00:00 : Pré-calcul des journeys du lendemain           │
│     ├─ Toutes les 10min : Vérification MAJ GTFS statique      │
│     └─ Toutes les 1h : Nettoyage des journeys obsolètes       │
└─────────────────────────────────────────────────────────────────┘
```

## 1. Initialisation des ressources

### 1.1 Téléchargement du GTFS statique

**Fichier:** `src/model/source.ts` → `importGtfs()`

```javascript
// Exemple de configuration (rouen-astuce.mjs)
{
  id: "tcar",
  staticResourceHref: "https://gtfs.bus-tracker.fr/astuce-global.zip",
  // ...
}
```

**Séquence:**
1. Télécharge le fichier ZIP GTFS
2. Extrait dans un répertoire temporaire
3. Parse les fichiers CSV essentiels :
   - `agency.txt` → Agences (timezone)
   - `routes.txt` → Lignes (nom, couleur, type)
   - `stops.txt` → Arrêts (nom, coordonnées)
   - `calendar.txt` + `calendar_dates.txt` → Services (dates de circulation)
   - `trips.txt` → Courses (direction, headsign, block)
   - `stop_times.txt` → Horaires théoriques
   - `shapes.txt` → Tracés géographiques (optionnel)

### 1.2 Pré-calcul des journeys

**Problème résolu:** Comment savoir quelles courses doivent circuler aujourd'hui ?

**Solution:** À l'initialisation, le provider pré-calcule les `Journey` pour :
- Hier (si avant 6h du matin)
- Aujourd'hui

**Fichier:** `src/model/source.ts` → `importGtfs()` ligne 72-86

```typescript
const now = Temporal.Now.zonedDateTimeISO();
const dates = [
  ...(now.hour < 6 ? [now.subtract({ days: 1 }).toPlainDate()] : []),
  now.toPlainDate()
];

for (const trip of gtfs.trips.values()) {
  const journeys = dates.map((date) => trip.getScheduledJourney(date));
  for (const journey of journeys) {
    if (typeof journey === "undefined") continue; // Le service ne circule pas ce jour
    gtfs.journeys.set(`${journey.date.toString()}-${journey.trip.id}`, journey);
  }
}
```

**Résultat:** Une Map `gtfs.journeys` contenant toutes les courses planifiées avec leurs horaires théoriques.

**Clé:** `"2026-03-05-TCAR:123456"` (date + trip_id)

---

## 2. Cycle de calcul des véhicules actifs

### 2.1 Téléchargement des données temps réel

**Fichier:** `src/download/download-gtfs-rt.ts`

Le provider télécharge les flux GTFS-RT (format Protobuf) qui contiennent :

#### A. TripUpdates (prédictions horaires)
```protobuf
TripUpdate {
  trip: { trip_id, route_id, direction_id, start_date, start_time }
  vehicle: { id, label }
  stop_time_update: [
    { stop_id, stop_sequence, arrival: {time/delay}, departure: {time/delay} }
  ]
  timestamp: 1709650800
}
```

#### B. VehiclePositions (positions GPS)
```protobuf
VehiclePosition {
  trip: { trip_id, route_id, direction_id, start_date }
  vehicle: { id, label }
  position: { latitude, longitude, bearing }
  current_stop_sequence: 15
  current_status: IN_TRANSIT_TO / STOPPED_AT
  occupancy_status: FEW_SEATS_AVAILABLE
  timestamp: 1709650800
}
```

### 2.2 Résolution de la date de service

**Problème:** Certains réseaux ne fournissent pas `start_date` dans les flux temps réel. Comment retrouver la bonne course ?

**Solution:** `guessStartDate()` - `src/utils/guess-start-date.ts`

```typescript
function guessStartDate(
  startTime: Temporal.PlainTime,     // Première heure de la course (ex: 06:30)
  startModulus: number,               // 0 si même jour, 1 si jour suivant (courses de nuit)
  at: Temporal.ZonedDateTime          // Maintenant
) {
  const atDate = at.toPlainDate();
  
  // Si on est avant midi ET (course du lendemain OU commence après 20h)
  // → C'est une course de la veille
  if (at.hour < 12 && (startModulus > 0 || startTime.hour > 20)) {
    return atDate.subtract({ days: 1 });
  }
  
  return atDate;
}
```

**Exemple:** Il est 02h00, un véhicule circule sur une course qui commence à 23h30 hier soir
→ La fonction retourne la date d'hier


### 2.3 Construction des VehicleJourney

**Fichier:** `src/jobs/compute-current-journeys.ts` → `computeVehicleJourneys()`

#### Étape 1: Traitement des TripUpdates

Pour chaque `TripUpdate` reçu :

1. **Retrouver le Trip GTFS correspondant**
   ```typescript
   const trip = gtfs.trips.get(tripUpdate.trip.tripId);
   ```

2. **Déterminer la date de service**
   ```typescript
   const startDate = tripUpdate.trip.startDate 
     ? Temporal.PlainDate.from(tripUpdate.trip.startDate)
     : guessStartDate(firstStopTime.arrivalTime, firstStopTime.arrivalModulus, updatedAt);
   ```

3. **Récupérer ou créer le Journey**
   ```typescript
   let journey = gtfs.journeys.get(`${startDate.toString()}-${trip.id}`);
   if (typeof journey === "undefined") {
     // Pas pré-calculé (ex: course exceptionnelle) → création à la volée
     journey = trip.getScheduledJourney(startDate, true);
     gtfs.journeys.set(`${startDate.toString()}-${trip.id}`, journey);
   }
   ```

4. **Mettre à jour avec les données temps réel**
   ```typescript
   journey.updateJourney(tripUpdate.stopTimeUpdate, appendTripUpdateInformation);
   ```

   Cette méthode applique les retards/avances à chaque arrêt :
   - Si `arrival.time` fourni → calcule le delay par différence avec l'horaire théorique
   - Si `arrival.delay` fourni → applique directement
   - Propage le dernier delay connu aux arrêts suivants sans info
   - Marque les arrêts sautés (`SKIPPED`)

#### Étape 2: Traitement des VehiclePositions

Pour chaque `VehiclePosition` reçu :

1. **Récupérer le Journey associé** (même logique que TripUpdate)

2. **Filtrer les appels (calls) pertinents**
   
   Problème: On ne veut afficher que les arrêts futurs, pas tout l'historique.
   
   ```typescript
   const calls = typeof vehiclePosition.currentStopSequence !== "undefined"
     ? journey.calls.filter((call) => call.sequence >= vehiclePosition.currentStopSequence)
     : getCalls(journey, now);
   ```

3. **Construction de l'objet VehicleJourney**

   **a) Conversion des IDs techniques en références standards**
   
   Les réseaux utilisent souvent des IDs techniques différents des numéros commerciaux.
   
   ```typescript
   // Exemple config Rouen:
   mapLineRef: (lineRef) => lineRef.replace("TCAR:", "")
   // "TCAR:13" → "13"
   ```
   
   Références générées (format NeTEx) :
   ```typescript
   {
     lineRef: `${networkRef}:Line:${mapLineRef(route.id)}`,
     // Ex: "ASTUCE:Line:13"
     
     stopRef: `${networkRef}:StopPoint:${mapStopRef(stop.id)}`,
     // Ex: "ASTUCE:StopPoint:23456"
     
     journeyRef: `${networkRef}:ServiceJourney:${tripRef}`,
     // Ex: "ASTUCE:ServiceJourney:TCAR_123456"
     
     vehicleRef: `${networkRef}:${operatorRef}:Vehicle:${vehicleId}`
     // Ex: "ASTUCE:TCAR:Vehicle:5042"
   }
   ```

   **b) Résolution de la destination**
   
   Les destinations peuvent être personnalisées par réseau :
   
   ```typescript
   // Méthode 1: Depuis le véhicule (label dans GTFS-RT)
   destination: vehicle?.label
   
   // Méthode 2: Depuis le headsign GTFS
   destination: journey?.trip.headsign
   
   // Méthode 3: Fonction custom (ex: TAE Rouen)
   getDestination: (journey) => 
     journey?.trip.stopTimes.at(-1).stop.name
       .toUpperCase()
       .normalize("NFD")
       .replace(/\p{Diacritic}/gu, "")
   // "Gare Routière" → "GARE ROUTIERE"
   ```

   **c) Construction des calls (arrêts)**
   
   ```typescript
   calls: calls?.map((call, index) => {
     const isLast = index === calls.length - 1;
     return {
       aimedTime: (isLast ? call.aimedArrivalTime : call.aimedDepartureTime)
         .toString({ timeZoneName: "never" }),
       // Ex: "2026-03-05T14:35:00"
       
       expectedTime: (isLast ? call.expectedArrivalTime : call.expectedDepartureTime)
         ?.toString({ timeZoneName: "never" }),
       // Ex: "2026-03-05T14:37:30" (2min30 de retard)
       
       stopRef: `${networkRef}:StopPoint:${mapStopRef(call.stop.id)}`,
       stopName: call.stop.name,
       stopOrder: call.sequence,
       callStatus: call.status, // SCHEDULED | SKIPPED
       flags: call.flags // NO_PICKUP | NO_DROP_OFF
     };
   })
   ```

   **d) Position GPS ou calculée**
   
   ```typescript
   position: {
     latitude: vehiclePosition.position.latitude,
     longitude: vehiclePosition.position.longitude,
     bearing: vehiclePosition.position.bearing,
     atStop: vehiclePosition.currentStatus === "STOPPED_AT",
     type: "GPS",
     recordedAt: "2026-03-05T14:35:42"
   }
   ```

#### Étape 3: Positions calculées (pas de GPS)

**Fichier:** `src/model/journey.ts` → `guessPosition()`

Pour les courses planifiées sans VehiclePosition GPS, le système calcule une position théorique basée sur :

1. **Les horaires** : Détermine entre quels arrêts le véhicule devrait être
2. **Le tracé (shape)** : Interpole la position le long du tracé géographique
3. **La distance parcourue** : Calcul proportionnel entre les deux arrêts

```typescript
// Calcul du % de progression entre deux arrêts
const percentTraveled = (now - departureTime) / (arrivalTime - departureTime);
const distanceTraveled = startDistance + (endDistance - startDistance) * percentTraveled;

// Interpolation sur le shape
const position = {
  latitude: point1.lat + (point2.lat - point1.lat) * ratio,
  longitude: point1.lon + (point2.lon - point1.lon) * ratio,
  bearing: calculateBearing(point1, point2),
  atStop: false,
  type: "COMPUTED" // ← Important: indique que c'est théorique
};
```

**Sur la carte:** Les positions `COMPUTED` ont un léger bruit ajouté pour les distinguer visuellement.

---

## 3. Conversions et mappings

### 3.1 Lignes : IDs techniques → Numéros commerciaux

**Problème:** Dans le GTFS, `route_id` est souvent un ID technique.

**Exemples:**
- Rouen: `route_id: "TCAR:13"` → Afficher **"13"**
- Île-de-France: `route_id: "IDFM:C01742"` → Afficher **"1"** (via lookup table)

**Solution:** Fonction `mapLineRef()` dans la config

```javascript
// Simple (Rouen)
mapLineRef: (lineRef) => lineRef.replace("TCAR:", "")

// Complexe (IDFM - avec table de correspondance)
const lineMapping = {
  "IDFM:C01742": "1",
  "IDFM:C01743": "2",
  // ...
};
mapLineRef: (lineRef) => lineMapping[lineRef] ?? lineRef
```

### 3.2 Arrêts : IDs locaux → Références réseau

Certains réseaux utilisent des `stop_id` internes différents des IDs officiels.

```javascript
// Exemple: préfixer avec l'opérateur
mapStopRef: (stopRef) => `OPERATOR_${stopRef}`
```

### 3.3 Opérateurs : Détection automatique

Certains réseaux ont plusieurs opérateurs (ex: Rouen avec TCAR et TNI).

```javascript
getOperatorRef: (journey, vehicle) => {
  // Méthode 1: Basé sur la ligne
  if (tniOperatedLineIds.includes(journey.trip.route.id)) {
    return "TNI";
  }
  
  // Méthode 2: Basé sur le numéro de véhicule
  if (isTniVehicle(+vehicle.id)) {
    return "TNI";
  }
  
  return "TCAR";
}
```

### 3.4 Destinations : Normalisation

Les destinations peuvent nécessiter un formatage spécifique :

```javascript
// Cas 1: Utiliser le label du véhicule (prioritaire)
getDestination: (journey, vehicle) => vehicle?.label ?? journey?.trip.headsign

// Cas 2: Dernier arrêt normalisé (TAE Rouen)
getDestination: (journey) => 
  journey?.trip.stopTimes.at(-1).stop.name
    .toUpperCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")

// Cas 3: Fallback sur dernière call
getDestination: (journey, vehicle) => 
  vehicle?.label ?? journey?.calls.at(-1)?.stop.name ?? "SPECIAL"
```

---

## 4. Cas d'usage avancés

### 4.1 Courses de nuit (modulus)

**Problème:** Une course qui part à 23h30 et arrive à 01h15 traverse minuit. Dans GTFS, le deuxième jour est noté avec des heures > 24h.

**Exemple:**
```csv
trip_id,arrival_time,departure_time,stop_id
123,23:30:00,23:30:00,STOP_A
123,24:15:00,24:15:00,STOP_B  ← 00:15 le lendemain
123,25:00:00,25:00:00,STOP_C  ← 01:00 le lendemain
```

**Solution:** Le `modulus` (jour de décalage) est calculé automatiquement :

```typescript
// src/import/components/import-trips.ts
const arrivalModulus = Math.floor(arrivalSeconds / 86400); // 0, 1, 2...
const arrivalTime = Temporal.PlainTime.from({
  hour: Math.floor(arrivalSeconds / 3600) % 24,
  minute: Math.floor((arrivalSeconds % 3600) / 60),
  second: arrivalSeconds % 60,
});
```

À l'utilisation :
```typescript
const aimedArrivalTime = createZonedDateTime(
  date.add({ days: stopTime.arrivalModulus }), // Ajoute le jour si nécessaire
  stopTime.arrivalTime,
  timezone
);
```

### 4.2 Courses circulaires

**Problème:** Sur une ligne circulaire, un arrêt peut apparaître plusieurs fois dans la même course.

**Solution:** Les `stopTimeUpdate` utilisent `stop_sequence` (ordre) plutôt que `stop_id` pour éviter les ambiguïtés.

```typescript
// Vérification anti-collision
if (typeof timeUpdate?.stopSequence === "number" 
    && timeUpdate.stopSequence !== call.sequence) {
  timeUpdate = undefined; // Ignorer si mauvais index
}
```

### 4.3 Blocks (véhicules enchaînant plusieurs courses)

**Concept:** Dans GTFS, un `block_id` indique qu'un véhicule enchaîne plusieurs `trip_id` sans interruption.

**Exemple:**
```
trip_id  block_id  departure  arrival    headsign
TRIP_A   BLOCK_1   08:00      08:45      Gare
TRIP_B   BLOCK_1   09:00      09:45      Centre  ← Même véhicule
TRIP_C   BLOCK_1   10:00      10:45      Gare
```

**Utilisation:**
```typescript
// Si pas de vehicle_id mais un block_id, utiliser le block comme clé
const key = typeof vehicleDescriptor !== "undefined"
  ? `${networkRef}:VehicleTracking:${vehicleDescriptor.id}`
  : typeof journey.trip.block !== "undefined"
    ? `${networkRef}:ServiceBlock:${journey.trip.block}:${journey.date}`
    : `${networkRef}:ServiceJourney:${tripRef}:${journey.date}`;
```

### 4.4 Courses exceptionnelles (non planifiées)

**Cas:** Un véhicule circule mais son `trip_id` n'existe pas dans le GTFS statique.

**Solutions:**

1. **TripUpdate avec nouveaux arrêts**
   ```typescript
   createCallsFromTripUpdate(gtfs, tripUpdate);
   // Crée des calls à partir des stopTimeUpdate
   ```

2. **Génération de ligne minimale**
   ```typescript
   line: typeof vehiclePosition.trip?.routeId !== "undefined"
     ? {
         ref: `${networkRef}:Line:${vehiclePosition.trip.routeId}`,
         number: vehiclePosition.trip.routeId,
         type: "UNKNOWN"
       }
     : undefined
   ```

### 4.5 Validation et filtres

Certaines données temps réel sont incohérentes. Les configs permettent de filtrer :

```javascript
// Rejeter les TripUpdates invalides
mapTripUpdate: (tripUpdate) => {
  if (!tripUpdate.vehicle?.id) return; // Pas de véhicule
  
  // Rejeter les retards aberrants (>90min)
  if (tripUpdate.stopTimeUpdate?.some(({ arrival }) => arrival?.delay > 5400)) {
    return;
  }
  
  return tripUpdate;
}

// Valider le VehicleJourney final
isValidJourney: (vehicleJourney) => {
  // Propager le retard aux arrêts antérieurs sans données
  if (vehicleJourney.calls?.length && !vehicleJourney.calls.at(0).expectedTime) {
    propagateDelayBackwards(vehicleJourney.calls);
  }
  return true;
}
```

---

## 5. Modes de fonctionnement

Le provider supporte plusieurs modes selon la qualité des données :

```javascript
mode: "ALL"      // Défaut: TripUpdates + VehiclePositions + courses planifiées
mode: "VP-ONLY"  // Uniquement les VehiclePositions (ignore TripUpdates et planifié)
mode: "VP+TU"    // VehiclePositions + TripUpdates (ignore planifié)
mode: "NO-TU"    // Ignore les TripUpdates (ex: données incohérentes)
```

**Exemple Rouen (configuration réelle):**
```javascript
{
  id: "tcar",
  mode: "NO-TU", // ← TripUpdates ignorés car incomplets
  
  // Mais on affiche quand même les courses planifiées sans GPS
  excludeScheduled: (trip) => {
    // Seulement les lignes vraiment opérées par TNI
    return !tniOperatedLineIds.includes(trip.route.id);
  }
}
```

---

## 6. Publication vers Redis

Après calcul, les `VehicleJourney` sont publiés :

```typescript
// Découpage par chunks de 500 pour éviter les messages trop gros
for (let i = 0; i < journeys.length; i += 500) {
  const chunk = journeys.slice(i, Math.min(i + 500, journeys.length));
  await redis.publish(channel, JSON.stringify(chunk));
}
```

**Canal:** `"journeys"` (configurable via `REDIS_CHANNEL`)

**Format:** Array JSON de VehicleJourney

---

## 7. Tâches périodiques

### Mise à jour du GTFS statique (toutes les 10 min)

```typescript
if (Date.now() - lastUpdateAt > 600_000) {
  await updateResources(sources);
  lastUpdateAt = Date.now();
}
```

Vérifie le `Last-Modified` / `ETag` du fichier GTFS distant. Si changé → re-télécharge.

### Nettoyage des journeys (toutes les 1h)

```typescript
if (Date.now() - lastSweepAt > 3600_000) {
  sweepJourneys(sources);
  lastSweepAt = Date.now();
}
```

Supprime les courses terminées de la mémoire.

### Pré-calcul du lendemain (00:00)

```typescript
new Cron("0 0 0 * * *", () => computeNextJourneys(sources));
```

Pré-charge les courses planifiées pour la journée suivante.

---

## 8. Résumé des étapes pour retrouver un véhicule

1. **Télécharger le GTFS-RT** → Récupère les `VehiclePosition`
2. **Identifier le trip_id** → Depuis `vehiclePosition.trip.tripId`
3. **Déterminer la date de service** → `start_date` ou `guessStartDate()`
4. **Récupérer le Journey** → `gtfs.journeys.get("date-tripId")`
5. **Si introuvable** → Créer à la volée avec `trip.getScheduledJourney(date, true)`
6. **Appliquer les TripUpdate** → `journey.updateJourney(stopTimeUpdates)`
7. **Filtrer les calls futurs** → `calls.filter(sequence >= currentStopSequence)`
8. **Convertir les IDs** → `mapLineRef()`, `mapStopRef()`, etc.
9. **Construire le VehicleJourney** → Avec toutes les données consolidées
10. **Publier vers Redis** → Le serveur prend le relais

---

## 9. Points d'attention

### ⚠️ Timezone
Toujours utiliser le timezone de l'agence pour les calculs temporels :
```typescript
trip.route.agency.timeZone // Ex: "Europe/Paris"
```

### ⚠️ Timestamp
Les timestamps GTFS-RT sont en **secondes** (Unix epoch), pas millisecondes :
```typescript
Temporal.Instant.fromEpochMilliseconds(timestamp * 1000)
```

### ⚠️ Données manquantes
Toujours vérifier la présence des champs optionnels :
```typescript
typeof vehiclePosition.trip !== "undefined"
typeof journey !== "undefined"
```

### ⚠️ Performances
- Les Maps `gtfs.trips` et `gtfs.journeys` sont en mémoire
- Pour un gros réseau (ex: IDFM), ça peut faire plusieurs Go de RAM
- Le pre-cache des journeys réduit les calculs en temps réel

---

## Fichiers clés à consulter

| Fichier | Rôle |
|---------|------|
| `src/index.ts` | Point d'entrée, boucle principale |
| `src/model/source.ts` | Classe Source (import, update, compute) |
| `src/jobs/compute-current-journeys.ts` | **Cœur du système** : calcul des VehicleJourney |
| `src/model/journey.ts` | Classe Journey (updateJourney, guessPosition) |
| `src/model/trip.ts` | Classe Trip (getScheduledJourney) |
| `src/utils/guess-start-date.ts` | Résolution de la date de service |
| `src/download/download-gtfs-rt.ts` | Téléchargement des flux temps réel |
| `configurations/rouen-astuce.mjs` | Exemple de configuration complète |

---

## Exemple de configuration commentée

```javascript
{
  id: "mon-reseau",
  
  // --- Ressources ---
  staticResourceHref: "https://example.com/gtfs.zip",
  realtimeResourceHrefs: [
    "https://example.com/gtfs-rt/trip-updates",
    "https://example.com/gtfs-rt/vehicle-positions"
  ],
  
  // --- Mode ---
  mode: "NO-TU", // Ignore les TripUpdates
  
  // --- Filtrage ---
  excludeScheduled: (trip) => {
    // N'afficher les courses planifiées que pour certaines lignes
    return !trip.route.id.startsWith("BUS_");
  },
  
  // --- Références ---
  getNetworkRef: () => "MON_RESEAU",
  getOperatorRef: (journey) => {
    return journey?.trip.route.id.startsWith("BUS_") ? "OPERATOR_A" : "OPERATOR_B";
  },
  
  // --- Conversions ---
  mapLineRef: (lineRef) => lineRef.replace("TECH_", ""),
  mapStopRef: (stopRef) => stopRef,
  mapVehiclePosition: (vehicle) => {
    // Nettoyer l'ID du véhicule
    vehicle.vehicle.id = vehicle.vehicle.id.replace("FLEET:", "");
    return vehicle;
  },
  
  // --- Destination ---
  getDestination: (journey, vehicle) => {
    return vehicle?.label ?? journey?.calls.at(-1)?.stop.name;
  },
  
  // --- Validation ---
  isValidJourney: (vehicleJourney) => {
    // Rejeter les véhicules sans ligne
    return typeof vehicleJourney.line !== "undefined";
  }
}
```
