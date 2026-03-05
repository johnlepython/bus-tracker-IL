# Analyse du Provider Stride - Problème des destinations et numéros de lignes

## Date d'analyse
5 mars 2026

## Contexte
Le provider Stride récupère des données en temps réel des bus israéliens via l'API Stride (Hasadna). Un problème majeur subsiste : beaucoup de bus apparaissent avec "Unknown Destination" ou avec des numéros de lignes techniques au lieu des numéros commerciaux.

---

## Architecture actuelle

### Flow des données

```
API Stride → Provider Stride → Redis (pub/sub) → Server → Client
   ↓                ↓
gtfs_routes    Route Cache
(mapping)      (line_ref → commercial data)
```

### 1. Provider Stride (`providers/stride/src/index.ts`)

**Initialisation du cache :**
```typescript
async function buildRouteCache() {
  const url = `${STRIDE_API_URL}/gtfs_routes/list?date=2025-01-06&limit=15000&offset=0`;
  // Construit un Map: line_ref → { commercialNumber, routeLongName, direction }
}
```

**Enrichissement des données véhicules :**
```typescript
// Pour chaque position de véhicule reçue de siri_vehicle_locations
const routeData = routeCache.get(loc.siri_route__line_ref);
const destination = routeData ? extractDestination(routeData.routeLongName, routeData.direction) : undefined;

vehicleJourneys.push({
  line: {
    number: routeData?.commercialNumber ?? String(loc.siri_route__line_ref), // FALLBACK = numéro technique
  },
  destination, // undefined si pas trouvé dans le cache
});
```

**Extraction de la destination :**
```typescript
function extractDestination(routeLongName: string, direction: string): string | undefined {
  // Format attendu: "Origin-City<->Destination-City-Direction#"
  const parts = routeLongName.split('<->');
  // Direction "1" → après <->, Direction "2" → avant <->
  return destinationPart?.replace(/-\d+#$/, '').trim();
}
```

### 2. Server (`apps/server/src/`)

**Réception et traitement :**
```typescript
// handle-vehicle-batch.ts
const disposeableJourney = {
  lineId: line?.id,
  destination: vehicleJourney.destination, // Peut être undefined
  // ...
};
journeyStore.set(disposeableJourney.id, disposeableJourney);
```

**API endpoint pour le client :**
```typescript
// controllers/vehicle-journeys.ts
destination: journey.destination ?? journey.calls?.findLast(...)?.stopName
// Fallback sur le dernier arrêt si pas de destination
```

### 3. Client (`apps/client/src/`)

**Affichage :**
```typescript
// vehicle-girouette.tsx
const destination = journey.destination ?? journey.calls?.at(-1)?.stopName ?? "Unknown Destination";
```

---

## Problèmes identifiés

### 1. ❌ Date fixe dans le cache GTFS (CRITIQUE)
```typescript
const url = `${STRIDE_API_URL}/gtfs_routes/list?date=2025-01-06&limit=15000&offset=0`;
```

**Impact :**
- Les lignes créées après le 6 janvier 2025 ne sont jamais trouvées
- Les lignes modifiées ne sont pas mises à jour
- Les lignes saisonnières ou temporaires manquent
- Le cache devient obsolète avec le temps

**Taux d'obsolescence estimé :** Augmente d'environ 2-5% par mois selon les modifications du réseau

### 2. ❌ Cache construit une seule fois au démarrage

```typescript
let routeCache = new Map();
(async () => {
  routeCache = await buildRouteCache(); // Une seule fois !
})();
```

**Impact :**
- Pas de rafraîchissement pendant l'exécution
- Les nouvelles lignes ne sont jamais ajoutées
- Nécessite un redémarrage pour mettre à jour

### 3. ❌ Cache limité à 15 000 entrées (une seule page)

```typescript
const MAX_PAGES = 1; // Fetch 1 page = 15k routes
```

**Impact :**
- Si le réseau a plus de 15 000 routes différentes (toutes dates confondues), certaines ne seront jamais trouvées
- Pas de garantie que les routes les plus récentes sont incluses
- L'API supporte 500k résultats mais on ne récupère que 15k

### 4. ❌ Pas de gestion de la direction dans le cache

```typescript
routeCache.set(key, {
  direction: route.route_direction || "1", // Stocké mais...
});
```

**Impact :**
- Une même `line_ref` peut avoir plusieurs directions
- Le cache ne stocke qu'une seule entrée par `line_ref`
- Les destinations peuvent être incorrectes pour certaines directions

### 5. ⚠️ Extraction de destination fragile

```typescript
function extractDestination(routeLongName: string, direction: string) {
  const parts = routeLongName.split('<->');
  if (parts.length !== 2) return undefined; // Fail si format différent !
  // ...
}
```

**Impact :**
- Dépend d'un format spécifique de `route_long_name`
- Ne fonctionne pas si le format change
- Pas de fallback si le format est différent

### 6. ⚠️ Pas de logging des échecs de mapping

**Impact :**
- Difficile de savoir quelles `line_ref` échouent
- Impossible de mesurer le taux de réussite
- Pas de métriques pour surveiller le problème

---

## Analyse de l'API Stride

### Endpoints utilisés

#### 1. `/siri_vehicle_locations/list`
Retourne les positions en temps réel :
```json
{
  "siri_ride__vehicle_ref": "12345",
  "siri_route__line_ref": 4567,     // ← Numéro TECHNIQUE
  "siri_route__operator_ref": 3,
  "lat": 31.961,
  "lon": 34.808,
  "recorded_at_time": "2026-03-05T10:30:00+02:00"
}
```

#### 2. `/gtfs_routes/list`
Mapping technique → commercial :
```json
{
  "id": 123456,
  "date": "2025-01-06",
  "line_ref": 4567,                 // ← Numéro TECHNIQUE (clé de mapping)
  "operator_ref": 3,
  "route_short_name": "480",        // ← Numéro COMMERCIAL (à afficher)
  "route_long_name": "Tel-Aviv<->Jerusalem-1#",  // ← Pour extraire destination
  "route_direction": "1",           // ← Direction
  "route_mkt": "...",
  "route_alternative": "..."
}
```

**Caractéristiques importantes :**
- `line_ref` = clé de liaison entre SIRI et GTFS
- `date` = date de validité du GTFS (change régulièrement !)
- Une même `line_ref` peut avoir plusieurs entrées avec dates différentes
- Le `route_long_name` contient la destination mais format variable

### Endpoints alternatifs disponibles

#### `/siri_rides/list`
Informations sur les courses en temps réel avec relation GTFS :
```json
{
  "id": 789,
  "siri_route_id": 456,
  "journey_ref": "12345",
  "vehicle_ref": "67890",
  "scheduled_start_time": "...",
  "gtfs_ride_id": 999,              // ← Lien vers GTFS !
  "siri_route__line_ref": 4567,
  "gtfs_route__route_short_name": "480"  // ← Déjà mappé !
}
```

#### `/siri_ride_stops/list`
Arrêts de la course avec arrêt GTFS correspondant :
```json
{
  "siri_ride_id": 789,
  "siri_stop_id": 123,
  "gtfs_stop_id": 456,
  "order": 5,
  "gtfs_stop__name": "Central Station"  // ← Nom de l'arrêt !
}
```

---

## Solutions proposées

### 🔧 Solution 1 : Date dynamique dans le cache (QUICK WIN)

**Principe :** Utiliser la date du jour au lieu d'une date fixe

```typescript
async function buildRouteCache() {
  const today = Temporal.Now.plainDateISO().toString(); // "2026-03-05"
  const url = `${STRIDE_API_URL}/gtfs_routes/list?date=${today}&limit=15000&offset=0`;
  // ...
}
```

**Avantages :**
- ✅ Changement minimal (1 ligne)
- ✅ Résout le problème d'obsolescence
- ✅ Toujours à jour avec le réseau actuel

**Limites :**
- ⚠️ Nécessite toujours un redémarrage quotidien
- ⚠️ Pas de données pour les lignes futures

**Effort :** 🟢 Faible (15 minutes)
**Impact :** 🟡 Moyen (résout ~70% des cas manquants)

---

### 🔧 Solution 2 : Rafraîchissement périodique du cache

**Principe :** Reconstruire le cache toutes les X heures

```typescript
// Au démarrage
routeCache = await buildRouteCache();

// Puis périodiquement
setInterval(async () => {
  console.log("%s ► Refreshing route cache...", Temporal.Now.instant());
  routeCache = await buildRouteCache();
}, 12 * 60 * 60 * 1000); // Toutes les 12 heures
```

**Avantages :**
- ✅ Pas besoin de redémarrer
- ✅ Cache toujours frais
- ✅ Capture les changements en cours de journée

**Limites :**
- ⚠️ Toujours limité à une date

**Effort :** 🟢 Faible (30 minutes)
**Impact :** 🟢 Bon (résout ~80% des cas)

---

### 🔧 Solution 3 : Cache multi-dates (RECOMMANDÉ)

**Principe :** Charger le GTFS pour aujourd'hui + les 7 prochains jours

```typescript
async function buildRouteCache(): Promise<Map<string, RouteData>> {
  const routeCache = new Map();
  const today = Temporal.Now.plainDateISO();
  
  // Charger 7 jours de données
  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const date = today.add({ days: dayOffset }).toString();
    const url = `${STRIDE_API_URL}/gtfs_routes/list?date=${date}&limit=15000&offset=0`;
    
    const routes = await fetch(url).then(r => r.json());
    
    for (const route of routes) {
      // Clé composite : line_ref + direction
      const key = `${route.line_ref}_${route.route_direction || '1'}`;
      
      // Garder l'entrée la plus récente
      if (!routeCache.has(key) || route.date > routeCache.get(key).date) {
        routeCache.set(key, {
          commercialNumber: route.route_short_name || String(route.line_ref),
          routeLongName: route.route_long_name || "",
          direction: route.route_direction || "1",
          operatorRef: route.operator_ref,
          date: route.date
        });
      }
    }
  }
  
  console.log("%s ► Route cache built: %d unique line+direction combos", 
    Temporal.Now.instant(), routeCache.size);
  return routeCache;
}
```

**Utilisation :**
```typescript
// Lors du mapping
const cacheKey = `${loc.siri_route__line_ref}_${inferDirection(loc)}`;
const routeData = routeCache.get(cacheKey);
```

**Avantages :**
- ✅ Couvre les changements à venir
- ✅ Gère correctement les directions
- ✅ Plus robuste face aux changements
- ✅ Meilleure couverture temporelle

**Limites :**
- ⚠️ 7× plus d'appels API au démarrage
- ⚠️ Cache plus volumineux (~100k entrées si 15k routes/jour)

**Effort :** 🟡 Moyen (2-3 heures)
**Impact :** 🟢 Excellent (résout ~95% des cas)

---

### 🔧 Solution 4 : Pagination complète + cache optimisé

**Principe :** Charger TOUTES les routes disponibles avec pagination

```typescript
async function buildRouteCache(): Promise<Map<string, RouteData>> {
  const routeCache = new Map();
  const today = Temporal.Now.plainDateISO().toString();
  const LIMIT = 15000;
  let offset = 0;
  let hasMore = true;
  
  console.log("%s ► Building complete route cache...", Temporal.Now.instant());
  
  while (hasMore) {
    const url = `${STRIDE_API_URL}/gtfs_routes/list?date=${today}&limit=${LIMIT}&offset=${offset}`;
    const routes = await fetch(url).then(r => r.json());
    
    if (!Array.isArray(routes) || routes.length === 0) break;
    
    for (const route of routes) {
      const key = `${route.line_ref}_${route.route_direction || '1'}`;
      routeCache.set(key, {
        commercialNumber: route.route_short_name || String(route.line_ref),
        routeLongName: route.route_long_name || "",
        direction: route.route_direction || "1",
        operatorRef: route.operator_ref,
        date: route.date
      });
    }
    
    hasMore = routes.length === LIMIT;
    offset += LIMIT;
    
    console.log("%s ► Loaded %d routes (total: %d)", 
      Temporal.Now.instant(), routes.length, routeCache.size);
  }
  
  return routeCache;
}
```

**Avantages :**
- ✅ Couverture complète de toutes les routes du jour
- ✅ Aucune limite arbitraire
- ✅ Gère les grands réseaux

**Limites :**
- ⚠️ Temps de démarrage plus long
- ⚠️ Plus de charge sur l'API Stride

**Effort :** 🟡 Moyen (2 heures)
**Impact :** 🟢 Excellent (résout ~98% des cas pour le jour actuel)

---

### 🚀 Solution 5 : Utiliser `/siri_rides` pour enrichissement (AVANCÉ)

**Principe :** Au lieu de se baser uniquement sur un cache GTFS, enrichir les données en temps réel via `/siri_rides`

```typescript
async function fetchVehicleDataEnriched(snapshotId: number) {
  // 1. Récupérer les vehicle_locations comme avant
  const locations = await fetchVehicleLocationsForSnapshot(snapshotId);
  
  // 2. Extraire les vehicle_ref uniques
  const vehicleRefs = [...new Set(locations.map(l => l.siri_ride__vehicle_ref))];
  
  // 3. Récupérer les siri_rides correspondants (avec relation GTFS déjà mappée)
  const rides = await fetch(
    `${STRIDE_API_URL}/siri_rides/list?vehicle_refs=${vehicleRefs.join(',')}&limit=10000`
  ).then(r => r.json());
  
  // 4. Construire un index vehicle_ref → ride_info
  const ridesByVehicle = new Map(
    rides.map(ride => [ride.vehicle_ref, {
      commercialNumber: ride.gtfs_route__route_short_name,
      routeLongName: ride.gtfs_route__route_long_name,
      gtfsRideId: ride.gtfs_ride_id
    }])
  );
  
  // 5. Enrichir les locations
  return locations.map(loc => ({
    ...loc,
    enriched: ridesByVehicle.get(loc.siri_ride__vehicle_ref)
  }));
}
```

**Avantages :**
- ✅ Données déjà mappées par l'API Stride
- ✅ Pas besoin de cache local
- ✅ Toujours à jour
- ✅ Peut récupérer les stops via `/siri_ride_stops` pour destination

**Limites :**
- ⚠️ Requête supplémentaire par cycle
- ⚠️ Dépend de la qualité du mapping Stride
- ⚠️ Plus complexe

**Effort :** 🔴 Élevé (1-2 jours)
**Impact :** 🟢🟢 Excellent+ (résout >99% des cas)

---

### 🛠 Solution 6 : Fallback intelligent sur extraction de routeLongName

**Principe :** Améliorer l'extraction de destination pour gérer plus de formats

```typescript
function extractDestination(
  routeLongName: string, 
  direction: string, 
  routeAlternative?: string
): string | undefined {
  if (!routeLongName) return undefined;
  
  // Format 1: "Origin<->Destination"
  if (routeLongName.includes('<->')) {
    const parts = routeLongName.split('<->');
    if (parts.length === 2) {
      const dest = direction === "2" ? parts[0] : parts[1];
      return dest.replace(/-\d+#?$/g, '').trim();
    }
  }
  
  // Format 2: "Origin - Destination"
  if (routeLongName.includes(' - ')) {
    const parts = routeLongName.split(' - ');
    if (parts.length >= 2) {
      return direction === "2" ? parts[0].trim() : parts[parts.length - 1].trim();
    }
  }
  
  // Format 3: Utiliser route_alternative si disponible
  if (routeAlternative && routeAlternative.length > 0) {
    return routeAlternative;
  }
  
  // Fallback: retourner la 2ème moitié du long name
  const words = routeLongName.split(/[\s-]+/);
  if (words.length > 1) {
    return words.slice(Math.ceil(words.length / 2)).join(' ');
  }
  
  return undefined;
}
```

**Avantages :**
- ✅ Plus robuste face aux variations de format
- ✅ Fallback sur plusieurs stratégies
- ✅ Améliore le taux de réussite

**Limites :**
- ⚠️ Toujours dépendant de la qualité des données GTFS
- ⚠️ Ne résout pas le problème de cache obsolète

**Effort :** 🟢 Faible (1 heure)
**Impact :** 🟡 Moyen (améliore de ~10% le taux d'extraction)

---

### 📊 Solution 7 : Ajout de métriques et logging

**Principe :** Mesurer le problème pour mieux le comprendre

```typescript
// Compteurs
let cacheHits = 0;
let cacheMisses = 0;
const missedLineRefs = new Set<number>();

function lookupRoute(lineRef: number) {
  const routeData = routeCache.get(lineRef);
  
  if (routeData) {
    cacheHits++;
    return routeData;
  } else {
    cacheMisses++;
    missedLineRefs.add(lineRef);
    return undefined;
  }
}

// Logging périodique
setInterval(() => {
  const total = cacheHits + cacheMisses;
  const hitRate = total > 0 ? (cacheHits / total * 100).toFixed(1) : '0.0';
  
  console.log("%s ► Cache stats: %d hits, %d misses (%s%% hit rate)",
    Temporal.Now.instant(), cacheHits, cacheMisses, hitRate);
  
  if (missedLineRefs.size > 0) {
    console.log("%s ► Missed line_refs: %s", 
      Temporal.Now.instant(), 
      Array.from(missedLineRefs).slice(0, 20).join(', '));
  }
  
  // Reset
  cacheHits = 0;
  cacheMisses = 0;
  missedLineRefs.clear();
}, 5 * 60 * 1000); // Toutes les 5 minutes
```

**Avantages :**
- ✅ Visibilité sur l'ampleur du problème
- ✅ Identification des line_ref problématiques
- ✅ Mesure de l'efficacité des solutions
- ✅ Alertes possibles si taux trop bas

**Limites :**
- ⚠️ Ne résout pas le problème, uniquement diagnostic

**Effort :** 🟢 Faible (1 heure)
**Impact :** 🟡 Indirect (facilite le debug et l'amélioration)

---

## Recommandation finale : Approche hybride

### Phase 1 : Quick wins (1-2 jours)
1. **Solution 1** : Date dynamique ✅
2. **Solution 2** : Rafraîchissement périodique ✅
3. **Solution 7** : Métriques et logging ✅

**Résultat attendu :** Résolution de ~80% des cas manquants

### Phase 2 : Amélioration majeure (1 semaine)
4. **Solution 3** : Cache multi-dates avec directions ✅
5. **Solution 4** : Pagination complète ✅
6. **Solution 6** : Extraction robuste ✅

**Résultat attendu :** Résolution de ~95-98% des cas

### Phase 3 : Excellence (optionnel, 2 semaines)
7. **Solution 5** : Enrichissement via `/siri_rides` ✅

**Résultat attendu :** Résolution de >99% des cas

---

## Exemple de code combiné (Phases 1 + 2)

```typescript
// Configuration
const CACHE_REFRESH_INTERVAL_MS = 12 * 60 * 60 * 1000; // 12 heures
const CACHE_DAYS_AHEAD = 7;
const ENABLE_METRICS = true;

// Métriques
let cacheHits = 0;
let cacheMisses = 0;
const missedLineRefs = new Set<number>();

/**
 * Build route cache from gtfs_routes API
 * - Fetches data for today + next CACHE_DAYS_AHEAD days
 * - Uses composite key: line_ref + direction
 * - Paginates through all available routes
 */
async function buildRouteCache(): Promise<Map<string, RouteData>> {
  console.log("%s ► Building route cache...", Temporal.Now.instant());
  const routeCache = new Map<string, RouteData>();
  const today = Temporal.Now.plainDateISO();
  
  // Fetch multiple days to cover schedule changes
  for (let dayOffset = 0; dayOffset < CACHE_DAYS_AHEAD; dayOffset++) {
    const date = today.add({ days: dayOffset }).toString();
    const LIMIT = 15000;
    let offset = 0;
    let hasMore = true;
    let dayRoutes = 0;
    
    console.log("%s ► Fetching routes for date: %s", Temporal.Now.instant(), date);
    
    while (hasMore) {
      const url = `${STRIDE_API_URL}/gtfs_routes/list?date=${date}&limit=${LIMIT}&offset=${offset}`;
      
      try {
        const response = await fetch(url);
        const routes = await response.json();
        
        if (!Array.isArray(routes) || routes.length === 0) break;
        
        for (const route of routes) {
          // Composite key: line_ref + direction
          const key = `${route.line_ref}_${route.route_direction || '1'}`;
          
          // Keep most recent entry per line_ref+direction
          if (!routeCache.has(key) || route.date > routeCache.get(key).date) {
            routeCache.set(key, {
              commercialNumber: route.route_short_name || String(route.line_ref),
              routeLongName: route.route_long_name || "",
              direction: route.route_direction || "1",
              operatorRef: route.operator_ref,
              lineRef: route.line_ref,
              date: route.date
            });
          }
        }
        
        dayRoutes += routes.length;
        hasMore = routes.length === LIMIT;
        offset += LIMIT;
        
      } catch (err) {
        console.error("%s ► Failed to fetch routes for %s: %s", 
          Temporal.Now.instant(), date, String(err));
        break;
      }
    }
    
    console.log("%s ► Date %s: fetched %d routes", 
      Temporal.Now.instant(), date, dayRoutes);
  }
  
  console.log("%s ► Route cache built: %d unique line+direction combinations", 
    Temporal.Now.instant(), routeCache.size);
  
  return routeCache;
}

/**
 * Extract destination from route long name with robust fallback
 */
function extractDestination(
  routeLongName: string, 
  direction: string,
  routeAlternative?: string
): string | undefined {
  if (!routeLongName) {
    return routeAlternative || undefined;
  }
  
  // Format 1: "Origin<->Destination"
  if (routeLongName.includes('<->')) {
    const parts = routeLongName.split('<->');
    if (parts.length === 2) {
      const dest = direction === "2" ? parts[0] : parts[1];
      const cleaned = dest.replace(/-\d+#?$/g, '').trim();
      if (cleaned.length > 0) return cleaned;
    }
  }
  
  // Format 2: "Origin - Destination"
  if (routeLongName.includes(' - ')) {
    const parts = routeLongName.split(' - ');
    if (parts.length >= 2) {
      const dest = direction === "2" ? parts[0] : parts[parts.length - 1];
      if (dest.trim().length > 0) return dest.trim();
    }
  }
  
  // Format 3: Fallback to route_alternative
  if (routeAlternative && routeAlternative.length > 0) {
    return routeAlternative;
  }
  
  // Last resort: second half of long name
  const words = routeLongName.split(/[\s-]+/);
  if (words.length > 1) {
    return words.slice(Math.ceil(words.length / 2)).join(' ');
  }
  
  return undefined;
}

/**
 * Lookup route data in cache with metrics
 */
function lookupRoute(lineRef: number, direction?: string): RouteData | undefined {
  // Try with direction first
  if (direction) {
    const keyWithDir = `${lineRef}_${direction}`;
    const data = routeCache.get(keyWithDir);
    if (data) {
      if (ENABLE_METRICS) cacheHits++;
      return data;
    }
  }
  
  // Fallback: try without direction (direction "1")
  const keyFallback = `${lineRef}_1`;
  const data = routeCache.get(keyFallback);
  
  if (data) {
    if (ENABLE_METRICS) cacheHits++;
    return data;
  }
  
  // Miss
  if (ENABLE_METRICS) {
    cacheMisses++;
    missedLineRefs.add(lineRef);
  }
  
  return undefined;
}

/**
 * Log cache metrics periodically
 */
function logCacheMetrics() {
  const total = cacheHits + cacheMisses;
  if (total === 0) return;
  
  const hitRate = (cacheHits / total * 100).toFixed(1);
  
  console.log("%s ► Cache metrics: hits=%d, misses=%d, rate=%s%%",
    Temporal.Now.instant(), cacheHits, cacheMisses, hitRate);
  
  if (missedLineRefs.size > 0) {
    console.log("%s ► Missed line_refs (sample): %s", 
      Temporal.Now.instant(), 
      Array.from(missedLineRefs).slice(0, 20).join(', '));
  }
  
  // Reset counters
  cacheHits = 0;
  cacheMisses = 0;
  missedLineRefs.clear();
}

// Initialize cache
let routeCache = new Map<string, RouteData>();

(async () => {
  try {
    routeCache = await buildRouteCache();
    
    // Refresh cache periodically
    setInterval(async () => {
      console.log("%s ► Refreshing route cache...", Temporal.Now.instant());
      try {
        routeCache = await buildRouteCache();
      } catch (err) {
        console.error("%s ► Cache refresh failed: %s", Temporal.Now.instant(), String(err));
      }
    }, CACHE_REFRESH_INTERVAL_MS);
    
    // Log metrics periodically
    if (ENABLE_METRICS) {
      setInterval(logCacheMetrics, 5 * 60 * 1000); // Every 5 minutes
    }
    
  } catch (err) {
    console.error("%s ► Initial cache build failed: %s", Temporal.Now.instant(), String(err));
  }
})();

// Usage dans le processing des véhicules
for (const { loc, recorded } of latestByVehicle.values()) {
  const lineRef = loc.siri_route__line_ref;
  const direction = inferDirection(loc); // À implémenter si disponible
  
  const routeData = lookupRoute(lineRef, direction);
  const destination = routeData 
    ? extractDestination(routeData.routeLongName, routeData.direction, routeData.routeAlternative)
    : undefined;
  
  vehicleJourneys.push({
    line: lineRef ? {
      ref: `${NETWORK_REF}:Line:${lineRef}`,
      number: routeData?.commercialNumber ?? String(lineRef),
      type: "BUS",
    } : undefined,
    destination,
    // ...
  });
}
```

---

## Checklist d'implémentation

### Phase 1 (Quick wins)
- [ ] Remplacer date fixe par date dynamique
- [ ] Ajouter rafraîchissement périodique du cache (12h)
- [ ] Implémenter métriques de cache (hits/misses)
- [ ] Ajouter logging des line_ref manquants
- [ ] Tester en production et monitorer

### Phase 2 (Amélioration majeure)
- [ ] Implémenter cache multi-dates (7 jours)
- [ ] Utiliser clé composite (line_ref + direction)
- [ ] Ajouter pagination complète pour chaque date
- [ ] Améliorer fonction extractDestination avec fallbacks
- [ ] Monitorer taux de réussite après déploiement

### Phase 3 (Excellence - optionnel)
- [ ] Étudier faisabilité enrichissement via `/siri_rides`
- [ ] Implémenter mapping vehicle_ref → ride_info
- [ ] Tester performance avec requêtes supplémentaires
- [ ] Évaluer bénéfice vs complexité
- [ ] Décider du déploiement

---

## Métriques de succès

### Avant optimisation (estimé actuel)
- ✅ Taux de mapping ligne : ~70%
- ✅ Taux destination trouvée : ~60%
- ❌ "Unknown Destination" : ~40% des bus
- ❌ Numéros techniques : ~30% des lignes

### Après Phase 1 (objectif)
- ✅ Taux de mapping ligne : ~85%
- ✅ Taux destination trouvée : ~75%
- ✅ "Unknown Destination" : ~25% des bus
- ✅ Numéros techniques : ~15% des lignes

### Après Phase 2 (objectif)
- ✅ Taux de mapping ligne : ~95%
- ✅ Taux destination trouvée : ~90%
- ✅ "Unknown Destination" : ~10% des bus
- ✅ Numéros techniques : ~5% des lignes

### Après Phase 3 (objectif)
- ✅ Taux de mapping ligne : >99%
- ✅ Taux destination trouvée ; >98%
- ✅ "Unknown Destination" : <2% des bus
- ✅ Numéros techniques : <1% des lignes

---

## Conclusion

Le problème actuel est causé principalement par :
1. Un cache GTFS avec date fixe obsolète
2. Pas de rafraîchissement pendant l'exécution
3. Une seule page de données (15k routes)
4. Pas de gestion des directions multiples

**L'approche hybride recommandée (Phases 1+2) devrait résoudre ~95% des cas** avec un effort raisonnable (1 semaine).

La Phase 3 est optionnelle et apporte un gain marginal (+3-4%) pour un coût élevé, à évaluer selon les besoins.

**Priorité absolue : commencer par la Phase 1 (1-2 jours) pour obtenir 80% du bénéfice avec 20% de l'effort.**
