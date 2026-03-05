import { eq, sql } from "drizzle-orm";

import { database } from "../core/database/database.js";
import { vehiclesTable } from "../core/database/schema.js";

/**
 * Update operator IDs for vehicles in batch
 * @param updates Array of [vehicleId, operatorId] tuples
 */
export async function updateVehicleOperators(updates: [number, number][]) {
	if (updates.length === 0) return;

	// Build a CASE statement with proper type casting
	// Convert to raw SQL to avoid parameterization issues with integer type
	const caseConditions = updates
		.map(([vehicleId, operatorId]) => `WHEN ${vehicleId} THEN ${operatorId}`)
		.join(' ');
	
	const query = sql`CASE id ${sql.raw(caseConditions)} END`;

	await database
		.update(vehiclesTable)
		.set({
			operatorId: query,
		})
		.where(
			sql`id IN (${sql.join(
				updates.map(([vehicleId]) => sql`${vehicleId}`),
				sql`,`,
			)})`,
		);
}
