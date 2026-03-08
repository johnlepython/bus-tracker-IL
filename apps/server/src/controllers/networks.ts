import { eq } from "drizzle-orm";
import * as z from "zod";

import { createParamValidator, createQueryValidator } from "../api/validator-helpers.js";
import { database } from "../core/database/database.js";
import { lineNetworksTable, linesTable, networksTable, operatorsTable } from "../core/database/schema.js";
import { journeyStore } from "../core/store/journey-store.js";

import { hono } from "../server.js";

const getNetworkByIdParamSchema = z.object({
	id: z.coerce.number().min(0),
});

const getNetworkByIdQuerySchema = z.object({
	withDetails: z
		.enum(["true", "false"])
		.default("false")
		.transform((value) => value === "true"),
});

hono.get("/networks", async (c) => {
	const networkList = await database.select().from(networksTable);
	return c.json(networkList);
});

hono.get(
	"/networks/:id",
	createParamValidator(getNetworkByIdParamSchema),
	createQueryValidator(getNetworkByIdQuerySchema),
	async (c) => {
		const { id } = c.req.valid("param");
		const { withDetails } = c.req.valid("query");

		const [network] = await database.select().from(networksTable).where(eq(networksTable.id, id));
		if (typeof network === "undefined") return c.json({ error: `No network found with id '${id}'.` }, 404);

		if (withDetails) {
			const onlineNetworkVehicles = journeyStore
				.values()
				.filter((journey) => journey.networkId === network.id)
				.toArray();

			const operatorList = await database.select().from(operatorsTable).where(eq(operatorsTable.networkId, network.id));
			const lineListRaw = await database
				.select()
				.from(linesTable)
				.leftJoin(lineNetworksTable, eq(lineNetworksTable.id, linesTable.lineNetworkId))
				.where(eq(linesTable.networkId, network.id));
			return c.json({
				...network,
				operators: operatorList.map(({ networkId, ...operator }) => operator),
				lines: lineListRaw
					.map(({ line, line_network }) => ({ line, lineNetwork: line_network }))
					.toSorted((a, b) => {
						const sortOrderDiff = (a.line.sortOrder ?? lineListRaw.length) - (b.line.sortOrder ?? lineListRaw.length);
						return sortOrderDiff || Number.parseInt(a.line.number, 10) - Number.parseInt(b.line.number, 10);
					})
					.map(({ line, lineNetwork }) => ({
						...line,
						networkId: undefined,
						lineNetwork: lineNetwork
							? {
									id: lineNetwork.id,
									name: lineNetwork.name,
									subDescription: lineNetwork.subDescription,
								}
							: null,
						onlineVehicleCount: onlineNetworkVehicles.filter(
							(journey) => journey.lineId === line.id && typeof journey.vehicle?.id !== "undefined",
						).length,
					})),
			});
		} else {
			return c.json(network);
		}
	},
);
