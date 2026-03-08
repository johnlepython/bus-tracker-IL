import DraftLog from "draftlog";
import { createClient } from "redis";
import { Temporal } from "temporal-polyfill";
import type { VehicleJourney } from "@bus-tracker/contracts";
import routeFallbackMap from "./route-fallback-map.json";

DraftLog(console, !process.stdout.isTTY)?.addLineListener(process.stdin);

const {
  NETWORK_REF,
  STRIDE_API_URL = "https://open-bus-stride-api.hasadna.org.il",
  OPERATOR_REF,
  REDIS_URL,
  REDIS_USERNAME,
  REDIS_PASSWORD,
  REDIS_CHANNEL = "journeys",
  POLL_INTERVAL_MS = "60000",
  CACHE_REFRESH_INTERVAL_MS = "43200000", // 12 hours
  ROUTE_CACHE_PAGE_SIZE = "15000",
  ROUTE_CACHE_MAX_PAGES = "20",
} = process.env;

if (NETWORK_REF === undefined) throw new Error("NETWORK_REF must be defined");

console.log("%s ► Connecting to Redis.", Temporal.Now.instant());
const redis = createClient({
  url: REDIS_URL ?? "redis://127.0.0.1:6379",
  username: REDIS_USERNAME,
  password: REDIS_PASSWORD,
});
await redis.connect();
console.log("%s ► Connected! Journeys will be published into '%s'.", Temporal.Now.instant(), REDIS_CHANNEL);

// Cache metrics
let cacheHits = 0;
let cacheMisses = 0;
const missedLineRefs = new Set<string>();

/**
 * Build route cache from gtfs_routes API for destination lookup
 * Uses current date to ensure cache is up-to-date
 */
async function buildRouteCache(): Promise<Map<string, { commercialNumber: string; routeLongName: string; direction: string }>> {
  console.log("%s ► Building route cache from gtfs_routes", Temporal.Now.instant());
  const routeCache = new Map();
  
  try {
    const PAGE_SIZE = Number.parseInt(ROUTE_CACHE_PAGE_SIZE, 10);
    const MAX_PAGES = Number.parseInt(ROUTE_CACHE_MAX_PAGES, 10);
    
    console.log("%s ► Route cache pagination: pageSize=%d, maxPages=%d (up to %d routes)",
      Temporal.Now.instant(), PAGE_SIZE, MAX_PAGES, PAGE_SIZE * MAX_PAGES);
    
    let totalRoutesFetched = 0;
    let pagesProcessed = 0;
    
    for (let page = 0; page < MAX_PAGES; page++) {
      const offset = page * PAGE_SIZE;
      // Don't filter by date - get all available routes to maximize coverage
      const url = `${STRIDE_API_URL}/gtfs_routes/list?limit=${PAGE_SIZE}&offset=${offset}`;
      
      const response = await fetch(url);
      const routes = await response.json();
      
      if (!Array.isArray(routes) || routes.length === 0) {
        console.log("%s ► Pagination stopped at page %d (no more results)", Temporal.Now.instant(), page);
        break;
      }
      
      pagesProcessed++;
      totalRoutesFetched += routes.length;
      console.log("%s ► Page %d: fetched %d routes, cache size now: %d", 
        Temporal.Now.instant(), page + 1, routes.length, routeCache.size);
      
      for (const route of routes) {
        const key = String(route.line_ref);
        // Keep most recent entry per line_ref
        if (!routeCache.has(key) || route.date > routeCache.get(key).date) {
          routeCache.set(key, {
            commercialNumber: route.route_short_name || String(route.line_ref),
            routeLongName: route.route_long_name || "",
            direction: route.route_direction || "1",
            date: route.date
          });
        }
      }
      
      if (routes.length < PAGE_SIZE) {
        console.log("%s ► Pagination stopped at page %d (last page with %d routes)", 
          Temporal.Now.instant(), pagesProcessed, routes.length);
        break;
      }
    }
    
    console.log("%s ► Route cache built with %d unique entries from %d routes across %d pages", 
      Temporal.Now.instant(), routeCache.size, totalRoutesFetched, pagesProcessed);
  } catch (err) {
    console.error("%s ► Failed to build route cache: %s", Temporal.Now.instant(), String(err));
  }
  
  return routeCache;
}

/**
 * Extract destination from route long name
 * Format: "Origin-City<->Destination-City-Direction#"
 */
function extractDestination(routeLongName: string, direction: string): string | undefined {
  if (!routeLongName) return undefined;
  
  const parts = routeLongName.split('<->');
  if (parts.length !== 2) return undefined;
  
  // Direction "1" typically goes to destination (after <->)
  // Direction "2" typically returns to origin (before <->)
  const destinationPart = direction === "2" ? parts[0] : parts[1];
  
  // Clean up the destination (remove direction suffix like "-1#")
  return destinationPart?.replace(/-\d+#$/, '').trim();
}

// Initialize empty route cache, build in background
let routeCache = new Map<string, { commercialNumber: string; routeLongName: string; direction: string }>();

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

// Build route cache in background without blocking startup
(async () => {
  try {
    routeCache = await buildRouteCache();
    
    // Refresh cache periodically (default: every 12 hours)
    const refreshInterval = Number(CACHE_REFRESH_INTERVAL_MS);
    console.log("%s ► Cache will refresh every %d ms (%d hours)",
      Temporal.Now.instant(), refreshInterval, refreshInterval / 3600000);
    
    setInterval(async () => {
      console.log("%s ► Refreshing route cache...", Temporal.Now.instant());
      try {
        routeCache = await buildRouteCache();
      } catch (err) {
        console.error("%s ► Cache refresh failed: %s", Temporal.Now.instant(), String(err));
      }
    }, refreshInterval);
    
    // Log cache metrics every 5 minutes
    setInterval(logCacheMetrics, 5 * 60 * 1000);
    
  } catch (err) {
    console.error("%s ► Initial cache build failed: %s", Temporal.Now.instant(), String(err));
  }
})();


async function fetchLatestSnapshotIds(limit = 10) {
  const qs = new URLSearchParams();
  qs.set("limit", String(limit * 2)); // Fetch more to account for loading snapshots
  qs.set("order_by", "id desc");

  const url = `${STRIDE_API_URL.replace(/\/+$/u, "")}/siri_snapshots/list?${qs.toString()}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`Stride snapshots API returned ${res.status}`);

    const data = (await res.json()) as Array<{ id?: number; etl_status?: string }>;
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error("Stride snapshots API returned no snapshot");
    }

    // Filter to only loaded snapshots (client-side filter since API doesn't support it)
    const loadedSnapshots = data.filter(item => item.etl_status === "loaded");
    const ids = loadedSnapshots.map((item) => item.id).filter((id): id is number => typeof id === "number");
    
    if (ids.length === 0) {
      throw new Error("Stride snapshots API returned no loaded snapshot");
    }

    return ids.slice(0, limit);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchVehicleLocationsForSnapshot(snapshotId: number) {
  const qs = new URLSearchParams();
  qs.set("siri_snapshot_ids", String(snapshotId));
  qs.set("limit", "10000");

  if (OPERATOR_REF && OPERATOR_REF.trim().length > 0) {
    qs.set("siri_routes__operator_ref", OPERATOR_REF);
  }

  const url = `${STRIDE_API_URL.replace(/\/+$/u, "")}/siri_vehicle_locations/list?${qs.toString()}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`Stride vehicle locations API returned ${res.status}`);

    const data = (await res.json()) as any[];
    if (!Array.isArray(data)) {
      throw new Error("Expected array from Stride API");
    }

    return data;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchVehicleLocationsLatestOrdered() {
  const qs = new URLSearchParams();
  qs.set("limit", "10000");
  qs.set("order_by", "recorded_at_time desc,id desc");

  if (OPERATOR_REF && OPERATOR_REF.trim().length > 0) {
    qs.set("siri_routes__operator_ref", OPERATOR_REF);
  }

  const url = `${STRIDE_API_URL.replace(/\/+$/u, "")}/siri_vehicle_locations/list?${qs.toString()}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`Stride latest ordered API returned ${res.status}`);

    const data = (await res.json()) as any[];
    if (!Array.isArray(data)) {
      throw new Error("Expected array from Stride latest ordered API");
    }

    return data;
  } finally {
    clearTimeout(timeoutId);
  }
}

function vehicleIdToRef(raw: string) {
  return `${NETWORK_REF}:${OPERATOR_REF ?? ""}:Vehicle:${raw}`;
}

async function run() {
  let lastSnapshotId: number | undefined;

  console.log("%s ► Starting snapshot-based sync for live data", Temporal.Now.instant());

  while (true) {
    const cycleStart = Temporal.Now.instant();
    const updateLog = console.draft("%s ► [1/3] Fetching vehicles from latest Stride snapshot...", cycleStart);

    let locations: any[] = [];

    try {
      const snapshotIds = await fetchLatestSnapshotIds(5);
      const latestSnapshotId = snapshotIds[0];

      // If we already processed this snapshot, wait for a new one
      if (latestSnapshotId === lastSnapshotId) {
        updateLog("%s ► [1/3] No new snapshot (latest: %d). Next poll in %dms.", cycleStart, latestSnapshotId, POLL_INTERVAL_MS);
        await new Promise((r) => setTimeout(r, Number(POLL_INTERVAL_MS)));
        continue;
      }

      // Try to fetch from the latest snapshot only
      try {
        locations = await fetchVehicleLocationsForSnapshot(latestSnapshotId);
        lastSnapshotId = latestSnapshotId;
        updateLog("%s ► [1/3] Fetched %d locations from snapshot #%d", cycleStart, locations.length, latestSnapshotId);
      } catch (error) {
        // If latest snapshot fails, wait and retry on next cycle
        updateLog("%s ► [!] Snapshot #%d failed: %s. Retry in %dms.", cycleStart, latestSnapshotId, String(error), POLL_INTERVAL_MS);
        await new Promise((r) => setTimeout(r, Number(POLL_INTERVAL_MS)));
        continue;
      }
    } catch (err) {
      updateLog("%s ► [!] Failed: %s. Retry in 10s.", cycleStart, String(err));
      await new Promise((r) => setTimeout(r, 10000));
      continue;
    }

    updateLog("%s ► [2/3] Processing %d locations...", cycleStart, locations.length);

    // Current time for updatedAt field (when we're publishing the data)
    let nowStr = Temporal.Now.instant().toString();
    if (nowStr.includes('.')) {
      nowStr = nowStr.split('.')[0] + 'Z';
    } else if (nowStr.endsWith('+00:00')) {
      nowStr = nowStr.slice(0, -6) + 'Z';
    }

    // Deduplicate: keep latest location per vehicle_ref
    const latestByVehicle = new Map<string, { loc: any; recorded: string }>();
    for (const loc of locations) {
      const vehicleRef = loc.siri_ride__vehicle_ref;
      if (!vehicleRef) continue;

      const recorded = loc.recorded_at_time;
      const existing = latestByVehicle.get(vehicleRef);
      if (!existing || recorded > existing.recorded) {
        latestByVehicle.set(vehicleRef, { loc, recorded });
      }
    }

    updateLog("%s ► [2/3] Deduplicated to %d unique vehicles.", cycleStart, latestByVehicle.size);

    // Build VehicleJourney entries
    const vehicleJourneys: VehicleJourney[] = [];
    for (const { loc, recorded } of latestByVehicle.values()) {
      const vehicleRefRaw = loc.siri_ride__vehicle_ref;
      
      // Use the actual recorded_at_time from the snapshot, not current time
      let recordedAt = recorded;
      // Normalize to RFC3339 format (YYYY-MM-DDTHH:MM:SSZ)
      if (recordedAt.includes('+')) {
        recordedAt = recordedAt.split('+')[0] + 'Z';
      }
      if (recordedAt.includes('.') && !recordedAt.endsWith('Z')) {
        recordedAt = recordedAt.split('.')[0] + 'Z';
      }
      if (recordedAt.includes('.') && recordedAt.endsWith('Z')) {
        const parts = recordedAt.split('.');
        recordedAt = parts[0] + 'Z';
      }
      
      const position = {
        latitude: Number(loc.lat) || 0,
        longitude: Number(loc.lon) || 0,
        bearing: Number(loc.bearing) || undefined,
        atStop: false,
        type: "GPS" as const,
        recordedAt,
      };

      // Use operator_ref from the route (each line has an operator)
      const operatorRef = loc.siri_route__operator_ref ? String(loc.siri_route__operator_ref) : (OPERATOR_REF ?? "");
      const id = `${NETWORK_REF}:${operatorRef}:VehicleTracking:${vehicleRefRaw}`;
      
      // Get route data from cache for commercial number and destination
      const lineRef = loc.siri_route__line_ref ? String(loc.siri_route__line_ref) : undefined;
      const routeData = lineRef ? routeCache.get(lineRef) : undefined;
      
      // Track cache metrics
      if (lineRef) {
        if (routeData) {
          cacheHits++;
        } else {
          cacheMisses++;
          missedLineRefs.add(lineRef);
        }
      }
      
      const destination = routeData ? extractDestination(routeData.routeLongName, routeData.direction) : undefined;

      vehicleJourneys.push({
        id,
        position,
        networkRef: NETWORK_REF,
        operatorRef: operatorRef,
        vehicleRef: `${NETWORK_REF}:${operatorRef}:Vehicle:${vehicleRefRaw}`,
        line: loc.siri_route__line_ref
          ? {
              ref: `${NETWORK_REF}:Line:${loc.siri_route__line_ref}`,
              number: routeData?.commercialNumber ?? 
                     (routeFallbackMap as Record<string, string>)[String(loc.siri_route__line_ref)] ?? 
                     `Ligne ${loc.siri_route__line_ref}`,
              type: "BUS",
            }
          : undefined,
        destination,
        updatedAt: nowStr,
      } as VehicleJourney);
    }

    // Publish to Redis in batches (avoid single huge message)
    const batchSize = 1000;
    let published = 0;
    for (let i = 0; i < vehicleJourneys.length; i += batchSize) {
      const batch = vehicleJourneys.slice(i, i + batchSize);
      try {
        await redis.publish(REDIS_CHANNEL, JSON.stringify(batch));
        published += batch.length;
      } catch (err) {
        updateLog("%s ► [!] Redis publish failed: %s", cycleStart, String(err));
      }
    }

    updateLog("%s ► [3/3] Published %d / %d journeys. Next poll in %dms.", cycleStart, published, vehicleJourneys.length, POLL_INTERVAL_MS);

    await new Promise((r) => setTimeout(r, Number(POLL_INTERVAL_MS)));
  }
}

await run();
