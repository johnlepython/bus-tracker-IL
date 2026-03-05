import { inArray } from "drizzle-orm";

import { database } from "../database/database.js";
import { type OperatorEntity, operatorsTable } from "../database/schema.js";

import type { CachedValue } from "./cache.js";

const cache = new Map<number, CachedValue<OperatorEntity>>();

export async function fetchOperators(ids: number[]) {
	const cachedOperators = ids.reduce((map, id) => {
		const cachedOperator = cache.get(id);
		if (typeof cachedOperator === "undefined" || Date.now() - cachedOperator.lastUpdated > 60_000) {
			return map;
		}

		map.set(id, cachedOperator.data);
		return map;
	}, new Map<number, OperatorEntity>());

	const missingOperatorIds = ids.filter((id) => !cachedOperators.has(id));
	if (missingOperatorIds.length > 0) {
		const missingOperators = await database.select().from(operatorsTable).where(inArray(operatorsTable.id, missingOperatorIds));

		for (const missingOperator of missingOperators) {
			cache.set(missingOperator.id, {
				data: missingOperator,
				lastUpdated: Date.now(),
			});

			cachedOperators.set(missingOperator.id, missingOperator);
		}
	}

	return cachedOperators;
}
