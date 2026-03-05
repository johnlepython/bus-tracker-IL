import "dotenv/config.js";

import { type VehicleJourney, vehicleJourneySchema } from "@bus-tracker/contracts";
import { serve } from "@hono/node-server";
import { createClient } from "redis";

import { migrateDatabase } from "./core/database/migrate.js";
import { handleVehicleBatch } from "./vehicle-handling/handle-vehicle-batch.js";

import { port } from "./options.js";
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

console.log("► Connecting to Redis.");
const redis = createClient({
	url: process.env.REDIS_URL ?? "redis://localhost:6379",
});
redis.on("error", (err) => {
	console.error("► Redis client error:", err);
});
redis.on("message", async (message, channel) => {
	console.log("► Redis message received on channel '%s' (length: %d)", channel, String(message).length);
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
});
await redis.connect();
await redis.subscribe("journeys");

console.log("► Listening on port %d.\n", port);
serve({ fetch: hono.fetch, port });
