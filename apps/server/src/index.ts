import "dotenv/config.js";

import { type VehicleJourney, vehicleJourneySchema } from "@bus-tracker/contracts";
import { serve } from "@hono/node-server";
import { createClient } from "redis";

import { migrateDatabase } from "./core/database/migrate.js";
import { handleVehicleBatch } from "./vehicle-handling/handle-vehicle-batch.js";

import { port, redisUrl } from "./options.js";
import { hono } from "./server.js";

import "./controllers/announcements.js";
import "./controllers/editors.js";
import "./controllers/lines.js";
import "./controllers/networks.js";
import "./controllers/regions.js";
import "./controllers/vehicle-journeys.js";
import "./controllers/vehicles.js";

console.log(`,-----.                  ,--------.                   ,--.                           ,---.                                       
|  |) /_ ,--.,--. ,---.  '--.  .--',--.--.,--,--.,---.|  |,-. ,---. ,--.--. ,-----. '   .-' ,---. ,--.--.,--.  ,--.,---. ,--.--. 
|  .-.  \\|  ||  |(  .-'     |  |   |  .--' ,-.  | .--'|     /| .-. :|  .--' '-----' \`.  \`-.| .-. :|  .--' \\  \`'  /| .-. :|  .--' 
|  '--' /'  ''  '.-'  \`)    |  |   |  |  \\ '-'  \\ \`--.|  \\  \\   --.|   |            .-'    \\   --.|  |     \\    / \\   --.|  |    
\`------'  \`----' \`----'     \`--'   \`--'   \`--\`--'\`---'\`--'\`--'\`----'\`--'            \`-----' \`----'\`--'      \`--'   \`----'\`--'    \n`);

console.log("► Running database migrations.");
await migrateDatabase();

console.log("► Connecting to Redis at: %s", redisUrl);
const redis = createClient({
	url: redisUrl,
});
await redis.connect();

// Create a separate subscriber connection for pub/sub (required by redis v5)
const subscriber = createClient({
	url: redisUrl,
});
subscriber.on("error", (err) => {
	console.error("► Redis subscriber error:", err);
});
subscriber.on("message", (message, channel) => {
	console.log("► Redis message received on channel '%s' (length: %d)", channel, String(message).length);
	
	// Handle async operations without blocking
	(async () => {
		let didWarn = false;
		let vehicleJourneys: VehicleJourney[];

		try {
			const payload = JSON.parse(message);
			if (!Array.isArray(payload)) throw new Error("Payload is not an array");
			console.log(`► Received journey batch: ${payload.length} journeys`);
			vehicleJourneys = payload.flatMap((entry) => {
				const parsed = vehicleJourneySchema.safeParse(entry);
				if (!parsed.success) {
					if (!didWarn) {
						console.warn(`Rejected object(s) from journeys channel, sample:`, entry);
						console.error(parsed.error);
						didWarn = true;
					}
					return [];
				}
				return parsed.data;
			});
			console.log(`► Validated ${vehicleJourneys.length} journeys`);

			await handleVehicleBatch(vehicleJourneys);
		} catch (error) {
			console.error("► Error processing journey batch:", error);
		}
	})();
});
await subscriber.connect();
await subscriber.subscribe("journeys", () => {
	// Message handling is done via the 'message' event listener above
});

console.log("► Listening on port %d.\n", port);
serve({ fetch: hono.fetch, port });
