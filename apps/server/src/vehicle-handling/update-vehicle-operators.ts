import { sql } from "drizzle-orm";

import { database } from "../core/database/database.js";

/**
 * Update operator IDs for vehicles in batch using raw SQL to maintain integer types
 * @param updates Array of [vehicleId, operatorId] tuples
 */
export async function updateVehicleOperators(updates: [number, number][]) {
	if (updates.length === 0) return;

	// Build CASE statement with integer values (not parameterized to avoid type coercion)
	const caseConditions = updates
		.map(([vehicleId, operatorId]) => `WHEN ${vehicleId} THEN ${operatorId}`)
		.join(' ');
	
	// Build IN clause with actual integer values
	const vehicleIds = updates.map(([vehicleId]) => vehicleId).join(', ');

	// Execute raw SQL to preserve integer types throughout
	await database.execute(
		sql.raw(`
			UPDATE vehicles 
			SET operator_id = CASE id ${caseConditions} END 
			WHERE id IN (${vehicleIds})
		`)
	);
}
