import type { VehicleJourneyLine } from "@bus-tracker/contracts";
import { and, arrayOverlaps, eq, gte, isNull, or } from "drizzle-orm";
import type { Temporal } from "temporal-polyfill";

import { database } from "../../core/database/database.js";
import { type NetworkEntity, linesTable } from "../../core/database/schema.js";

export async function importLines(
	network: NetworkEntity,
	linesData: VehicleJourneyLine[],
	recordedAt: Temporal.Instant,
) {
	if (linesData.length === 0) return [];

	const existingLines = await database
		.select()
		.from(linesTable)
		.where(
			and(
				eq(linesTable.networkId, network.id),
				arrayOverlaps(
					linesTable.references,
					linesData.map(({ ref }) => ref),
				),
				or(isNull(linesTable.archivedAt), gte(linesTable.archivedAt, recordedAt)),
			),
		);

	// Update existing lines with new data from providers
	const linesToUpdate = linesData.filter(({ ref }) =>
		existingLines.some(({ references }) => references?.includes(ref)),
	);

	for (const lineData of linesToUpdate) {
		const existingLine = existingLines.find(({ references }) => references?.includes(lineData.ref));
		if (!existingLine) continue;

		// Update line number, color, and textColor if provided
		const updates: Record<string, any> = {};
		if (lineData.number && lineData.number !== existingLine.number) {
			updates.number = lineData.number;
		}
		if (lineData.color?.length === 6 && lineData.color !== existingLine.color) {
			updates.color = lineData.color;
		}
		if (lineData.textColor?.length === 6 && lineData.textColor !== existingLine.textColor) {
			updates.textColor = lineData.textColor;
		}

		if (Object.keys(updates).length > 0) {
			await database.update(linesTable).set(updates).where(eq(linesTable.id, existingLine.id));
			// Update the in-memory object to reflect changes
			Object.assign(existingLine, updates);
		}
	}

	const missingLines = linesData.filter(
		({ ref }) => !existingLines.some(({ references }) => references?.includes(ref)),
	);

	if (missingLines.length > 0) {
		const addedLines = await database
			.insert(linesTable)
			.values(
				missingLines.map((line) => ({
					networkId: network.id,
					references: [line.ref],
					number: line.number,
					color: line.color?.length === 6 ? line.color : undefined,
					textColor: line.textColor?.length === 6 ? line.textColor : undefined,
				})),
			)
			.returning();
		existingLines.push(...addedLines);
	}

	return existingLines;
}
