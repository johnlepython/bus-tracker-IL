import { eq, sql } from "drizzle-orm";

import { database } from "../core/database/database.js";
import { vehiclesTable } from "../core/database/schema.js";

/**
 * Update operator IDs for vehicles in batch
 * @param updates Array of [vehicleId, operatorId] tuples
 */
export async function updateVehicleOperators(updates: [number, number][]) {
	if (updates.length === 0) return;

	// Use SQL CASE statement for efficient batch update with explicit integer casting
	const cases = updates.map(([vehicleId, operatorId]) => sql`WHEN ${vehicleId} THEN ${sql.raw(String(operatorId))}`);

	await database
		.update(vehiclesTable)
		.set({
			operatorId: sql`CASE id ${sql.join(cases, sql` `)} END`,
		})
		.where(
			sql`id IN (${sql.join(
				updates.map(([vehicleId]) => sql`${vehicleId}`),
				sql`,`,
			)})`,
		);
}
