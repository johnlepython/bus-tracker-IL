import type { VehicleJourney, VehicleJourneyLine } from "@bus-tracker/contracts";
import { Temporal } from "temporal-polyfill";

import { journeyStore } from "../core/store/journey-store.js";
import type { DisposeableVehicleJourney } from "../types/disposeable-vehicle-journey.js";
import { keyBy } from "../utils/key-by.js";
import { nthIndexOf } from "../utils/nth-index-of.js";

import { importLines } from "./import/import-lines.js";
import { importNetwork } from "./import/import-network.js";
import { importOperator } from "./import/import-operator.js";
import { importVehicles } from "./import/import-vehicle.js";
import { registerActivities } from "./register-activities.js";
import { updateVehicleOperators } from "./update-vehicle-operators.js";

export async function handleVehicleBatch(vehicleJourneys: VehicleJourney[]) {
	const now = Temporal.Now.instant();

	const vehicleJourneysByNetwork = Map.groupBy(vehicleJourneys, (vehicleJourney) => vehicleJourney.networkRef);

	let totalStored = 0;

	for (const [networkRef, vehicleJourneys] of vehicleJourneysByNetwork) {
		const network = await importNetwork(networkRef);

		const [lineDatas, vehicleRefs, operatorRefs] = vehicleJourneys.reduce(
			([lineDataAcc, vehicleRefAcc, operatorRefAcc], vehicleJourney) => {
				if (typeof vehicleJourney.line !== "undefined") {
					lineDataAcc.set(vehicleJourney.line.ref, vehicleJourney.line);
				}

				if (networkRef !== "SNCF" && typeof vehicleJourney.vehicleRef !== "undefined") {
					vehicleRefAcc.add(vehicleJourney.vehicleRef);
				}

				if (typeof vehicleJourney.operatorRef !== "undefined") {
					operatorRefAcc.add(vehicleJourney.operatorRef);
				}

				return [lineDataAcc, vehicleRefAcc, operatorRefAcc];
			},
			[new Map<string, VehicleJourneyLine>(), new Set<string>(), new Set<string>()],
		);

		const lines = keyBy(await importLines(network, Array.from(lineDatas.values()), now), (line) => line.references!);
		const vehicles = keyBy(await importVehicles(network, vehicleRefs), (vehicle) => vehicle.ref);

		// Import operators and create a map operatorRef → operatorId
		const operators = new Map<string, number>();
		for (const operatorRef of operatorRefs) {
			const operator = await importOperator(networkRef, operatorRef);
			operators.set(operatorRef, operator.id);
		}

		const registerableActivities: DisposeableVehicleJourney[] = [];
		const vehicleOperatorUpdates = new Map<number, number>();
		let storedInNetwork = 0;

		for (const vehicleJourney of vehicleJourneys) {
			const timeSince = Temporal.Now.instant().since(vehicleJourney.updatedAt);
			if (timeSince.total("minutes") >= 10) continue;

			const line = vehicleJourney.line ? lines.get(vehicleJourney.line.ref) : undefined;
			const operatorId = vehicleJourney.operatorRef ? operators.get(vehicleJourney.operatorRef) : undefined;

			const disposeableJourney: DisposeableVehicleJourney = {
				id: vehicleJourney.id.replaceAll("/", "_"),
				lineId: line?.id,
				direction: vehicleJourney.direction,
				destination: vehicleJourney.destination,
				calls: vehicleJourney.calls,
				position: vehicleJourney.position,
				occupancy: vehicleJourney.occupancy,
				networkId: network.id,
				operatorId,
				vehicle: undefined,
				serviceDate: vehicleJourney.serviceDate,
				updatedAt: vehicleJourney.updatedAt,
			};

			journeyStore.set(disposeableJourney.id, disposeableJourney);
			storedInNetwork++;
			totalStored++;

			if (typeof vehicleJourney.vehicleRef !== "undefined") {
				const vehicle = vehicles.get(vehicleJourney.vehicleRef);
				if (typeof vehicle !== "undefined") {
					disposeableJourney.vehicle = {
						id: vehicle.id,
						number: vehicle.number,
					};

					if (typeof operatorId === "number" && vehicle.operatorId !== operatorId) {
						vehicleOperatorUpdates.set(vehicle.id, operatorId);
					}

					registerableActivities.push(disposeableJourney);
				} else if (networkRef === "SNCF") {
					disposeableJourney.vehicle = {
						number: vehicleJourney.vehicleRef.slice(nthIndexOf(vehicleJourney.vehicleRef, ":", 3) + 1),
					};
				}
			}
		}

		if (vehicleOperatorUpdates.size > 0) {
			await updateVehicleOperators(Array.from(vehicleOperatorUpdates.entries()));
		}

		registerActivities(registerableActivities);
		console.log(`► Processed ${networkRef}: Stored ${storedInNetwork} journeys, ${registerableActivities.length} with vehicle registrations`);
	}

	console.log(`► Batch complete: Stored ${totalStored} total journeys across all networks`);
}
