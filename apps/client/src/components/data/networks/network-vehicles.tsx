import { useSuspenseQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { ArchiveIcon, ArrowDown01Icon, ArrowDown10Icon, ArrowDownAZIcon, ArrowDownZAIcon, ClockIcon, FilterIcon, SortAscIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useDebounceValue } from "usehooks-ts";
import { GetNetworkQuery } from "~/api/networks";

import { GetVehiclesQuery, type Vehicle } from "~/api/vehicles";
import { VehiclesTable } from "~/components/data/networks/vehicles-table";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { BusIcon, ShipIcon, TramwayIcon, TrainIcon } from "~/icons/means-of-transport";
import { cn } from "~/utils/utils";
import { isTrainNumber } from "~/utils/is-train";

const filterableVehicleTypes = {
	ALL: <span className="text-muted-foreground">Type</span>,
	TRAIN: <TrainIcon className="size-5" />,
	TRAMWAY: <TramwayIcon className="size-5" />,
	BUS: <BusIcon className="size-5" />,
	FERRY: <ShipIcon className="size-5" />,
} as const;

const numberSort = (a: Vehicle, b: Vehicle) => {
	const numberifiedA = parseInt(a.number, 10);
	const numberifiedB = parseInt(b.number, 10);

	if (Number.isNaN(numberifiedA)) {
		if (Number.isNaN(numberifiedB)) {
			return a.number.localeCompare(b.number);
		}
		return 1;
	}

	if (Number.isNaN(numberifiedB)) {
		return -1;
	}
	return numberifiedA - numberifiedB;
};

type NetworkVehiclesProps = { networkId: number };

export function NetworkVehicles({ networkId }: Readonly<NetworkVehiclesProps>) {
	const [showArchived, setShowArchived] = useState(false);

	const { data: network } = useSuspenseQuery(GetNetworkQuery(networkId, true));
	const { data: vehicles } = useSuspenseQuery(GetVehiclesQuery(networkId));

	const hasArchivedVehicles = useMemo(() => vehicles.some((vehicle) => vehicle.archivedAt !== null), [vehicles]);

	const availableNetworkTypeFilters = useMemo(() => {
		const networkVehicleTypes = new Set<string>();
		vehicles.forEach(({ type, number }) => {
			if (isTrainNumber(number)) {
				networkVehicleTypes.add("TRAIN");
			} else {
				networkVehicleTypes.add(type);
			}
		});
		return [
			"ALL",
			...Object.keys(filterableVehicleTypes).filter((type) => networkVehicleTypes.has(type) && type !== "ALL"),
		];
	}, [vehicles]);

	const availableLineNetworks = useMemo(() => {
		const lineNetworksMap = new Map<
			number,
			{ id: number; name: string; subDescription: string | null }
		>();
		network.lines.forEach((line) => {
			if (line.lineNetwork && !lineNetworksMap.has(line.lineNetwork.id)) {
				lineNetworksMap.set(line.lineNetwork.id, line.lineNetwork);
			}
		});
		return Array.from(lineNetworksMap.values()).sort((a, b) => a.name.localeCompare(b.name));
	}, [network.lines]);

	const [searchParams, setSearchParams] = useSearchParams("");

	const updateSearchParam = (key: string, value: string) => {
		setSearchParams((searchParams) => {
			const newSearchParams = new URLSearchParams(searchParams);
			newSearchParams.set(key, value);
			return newSearchParams;
		});
	};

	const type = searchParams.get("type") ?? "ALL";
	const operatorId = searchParams.get("operatorId") ?? "ALL";
	const lineNetworkId = searchParams.get("lineNetworkId") ?? "ALL";
	const filter = searchParams.get("filter") ?? "";
	const sort = searchParams.get("sort") ?? "number-asc";

	const [debouncedFilter] = useDebounceValue(() => filter, 100);

	const filteredAndSortedVehicles = useMemo(() => {
		const sort = searchParams.get("sort");
		let pattern: RegExp | string = debouncedFilter;

		try {
			pattern = new RegExp(debouncedFilter.replaceAll("_", "\\d"), "i");
		} catch {}

		return vehicles
			.filter((v) => {
				if (showArchived && v.archivedAt === null) return false;
				if (!showArchived && v.archivedAt !== null) return false;
				if (type?.trim().length && type !== "ALL") {
					const isVehicleTrain = isTrainNumber(v.number);
					if (type === "TRAIN" && !isVehicleTrain) return false;
					if (type !== "TRAIN" && (isVehicleTrain || v.type !== type)) return false;
				}
				if (operatorId !== "" && operatorId !== "ALL" && +operatorId !== v.operatorId) return false;
				if (lineNetworkId !== "" && lineNetworkId !== "ALL") {
					const vehicleLine = network.lines.find((line) => line.id === v.activity.lineId);
					if (!vehicleLine?.lineNetwork || vehicleLine.lineNetwork.id !== +lineNetworkId) return false;
				}
				if (debouncedFilter === "") return true;

				const lineNumber =
					typeof v.activity.lineId === "number"
						? (network?.lines.find((line) => line.id === v.activity.lineId)?.number ?? "")
						: "";
				return pattern instanceof RegExp
					? pattern.test(v.number.toString()) || pattern.test(v.designation ?? "") || pattern.test(lineNumber)
					: v.number.toString().includes(pattern) ||
						(v.designation ?? "").toLowerCase().includes(pattern.toLowerCase()) ||
						lineNumber.toLowerCase().includes(pattern.toLowerCase());
			})
			.sort((a, b) => {
				if (sort === "activity") {
					if (typeof a.activity.lineId !== "undefined" && typeof b.activity.lineId !== "undefined")
						return numberSort(a, b);
					if (typeof a.activity.lineId === "number") return -1;
					if (typeof b.activity.lineId === "number") return 1;
					if (a.activity.since === null) return 1;
					if (b.activity.since === null) return -1;
					return b.activity.since.localeCompare(a.activity.since);
				}

				if (sort === "number-asc") {
					return numberSort(a, b);
				}

				if (sort === "number-desc") {
					return numberSort(b, a);
				}

				if (sort === "line-asc" || sort === "line-desc") {
					const lineA = network?.lines.find((line) => line.id === a.activity.lineId);
					const lineB = network?.lines.find((line) => line.id === b.activity.lineId);

					// Vehicles without lines go to the end
					if (!lineA && !lineB) return numberSort(a, b);
					if (!lineA) return 1;
					if (!lineB) return -1;

					const lineNumberA = parseInt(lineA.number, 10);
					const lineNumberB = parseInt(lineB.number, 10);

					let lineComparison: number;
					if (Number.isNaN(lineNumberA) && Number.isNaN(lineNumberB)) {
						lineComparison = lineA.number.localeCompare(lineB.number);
					} else if (Number.isNaN(lineNumberA)) {
						lineComparison = 1;
					} else if (Number.isNaN(lineNumberB)) {
						lineComparison = -1;
					} else {
						lineComparison = lineNumberA - lineNumberB;
					}

					if (sort === "line-desc") {
						lineComparison = -lineComparison;
					}

					// If line numbers are equal, sort by vehicle number
					return lineComparison !== 0 ? lineComparison : numberSort(a, b);
				}

				if (sort === "carrier-asc" || sort === "carrier-desc") {
					const carrierNameA = a.operator?.name ?? "";
					const carrierNameB = b.operator?.name ?? "";

					let carrierComparison = carrierNameA.localeCompare(carrierNameB);
					if (sort === "carrier-desc") {
						carrierComparison = -carrierComparison;
					}

					// If carrier names are equal, sort by vehicle number
					return carrierComparison !== 0 ? carrierComparison : numberSort(a, b);
				}

				return numberSort(a, b);
			});
	}, [debouncedFilter, operatorId, lineNetworkId, showArchived, searchParams, type, sort, vehicles, network]);

	const onlineVehicles = useMemo(
		() => filteredAndSortedVehicles.filter(({ activity }) => typeof activity.lineId !== "undefined"),
		[filteredAndSortedVehicles],
	);

	const activeVehiclesLabel = useMemo(() => {
		if (showArchived)
			return `${filteredAndSortedVehicles.length} vehicle${filteredAndSortedVehicles.length > 1 ? "s" : ""} archived`;
		if (filteredAndSortedVehicles.length === 0) return "No vehicle exists with these search criteria";
		if (onlineVehicles.length === 0) return `No vehicle out of ${filteredAndSortedVehicles.length} in circulation`;
		return `${onlineVehicles.length}/${filteredAndSortedVehicles.length} vehicle${filteredAndSortedVehicles.length > 1 ? "s" : ""} in circulation`;
	}, [filteredAndSortedVehicles, onlineVehicles, showArchived]);

	return (
		<section>
			{vehicles.length > 0 ? (
				<>
					<div
						className={cn(
							"grid gap-2 mt-2",
							hasArchivedVehicles ? "grid-cols-[1fr_10rem_2.3rem]" : "grid-cols-[1fr_10rem]",
						)}
					>
						{/* Filters */}
						<div className="flex flex-col gap-1">
							<Label className="inline-flex items-center gap-1" htmlFor="filter">
							<FilterIcon size={16} /> Filter by
							</Label>
							<div className="flex gap-1">
								{availableNetworkTypeFilters.length > 2 && (
									<Select value={type} onValueChange={(newType) => updateSearchParam("type", newType)}>
										<SelectTrigger aria-label="Type" className="h-10 min-w-[5rem]">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{availableNetworkTypeFilters.map((type) => (
												<SelectItem key={type} value={type}>
													{filterableVehicleTypes[type as keyof typeof filterableVehicleTypes]}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								)}
								<div className="flex flex-1 gap-1">
									{network.operators.length > 0 && (
										<div className="w-full max-w-[33.333%] min-w-[6rem]">
											<Select
												value={operatorId}
												onValueChange={(newOperatorId) => updateSearchParam("operatorId", newOperatorId)}
											>
												<SelectTrigger aria-label="Operator" className="h-10 w-full">
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="ALL">
														<span className="text-muted-foreground">Operator</span>
													</SelectItem>
													{network.operators
														.toSorted((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
														.map((operator) => (
															<SelectItem key={operator.id} value={operator.id.toString()}>
																{operator.name}
															</SelectItem>
														))}
												</SelectContent>
											</Select>
										</div>
									)}
									{availableLineNetworks.length > 0 && (
										<Select
											value={lineNetworkId}
											onValueChange={(newLineNetworkId) => updateSearchParam("lineNetworkId", newLineNetworkId)}
										>
											<SelectTrigger aria-label="Line Network" className="h-10 min-w-[8rem]">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="ALL">
													<span className="text-muted-foreground">Network</span>
												</SelectItem>
												{availableLineNetworks.map((lineNetwork) => (
													<SelectItem key={lineNetwork.id} value={lineNetwork.id.toString()}>
														{lineNetwork.name}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									)}
									<Input
										className="h-10 flex-1"
										placeholder="vehicle number, line number or designation"
										value={searchParams.get("filter") ?? ""}
										onChange={(e) => updateSearchParam("filter", e.target.value)}
									/>
								</div>
							</div>
						</div>
						{/* Sort */}
						<div className="flex flex-col gap-1">
							<Label className="inline-flex items-center gap-1" htmlFor="sort">
								<SortAscIcon size={16} /> Sort
							</Label>
							<Select value={sort} onValueChange={(newSort) => updateSearchParam("sort", newSort)}>
								<SelectTrigger aria-label="Sort" className="h-10 w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="number-asc">
										<div className="flex items-center gap-2">
											<ArrowDown01Icon className="size-4" />
									<span>Vehicle ascending</span>
										</div>
									</SelectItem>
									<SelectItem value="number-desc">
										<div className="flex items-center gap-2">
											<ArrowDown10Icon className="size-4" />
									<span>Vehicle descending</span>
										</div>
									</SelectItem>
									<SelectItem value="line-asc">
										<div className="flex items-center gap-2">
											<ArrowDownAZIcon className="size-4" />
									<span>Line ascending</span>
										</div>
									</SelectItem>
									<SelectItem value="line-desc">
										<div className="flex items-center gap-2">
											<ArrowDownZAIcon className="size-4" />
									<span>Line descending</span>
										</div>
									</SelectItem>
									<SelectItem value="carrier-asc">
										<div className="flex items-center gap-2">
											<ArrowDownAZIcon className="size-4" />
											<span>Carrier ascending</span>
										</div>
									</SelectItem>
									<SelectItem value="carrier-desc">
										<div className="flex items-center gap-2">
											<ArrowDownZAIcon className="size-4" />
											<span>Carrier descending</span>
										</div>
									</SelectItem>
									<SelectItem value="activity">
										<div className="flex items-center gap-2">
											<ClockIcon className="size-4" />
											<span>Activity</span>
										</div>
									</SelectItem>
								</SelectContent>
							</Select>
						</div>
						{/* Archive */}
						{hasArchivedVehicles && (
							<Button
								className="mt-auto h-10"
								onClick={() => setShowArchived(!showArchived)}
								size="icon"
								variant={showArchived ? "branding-default" : "secondary"}
							>
								<ArchiveIcon />
							</Button>
						)}
					</div>
					<p
						className={clsx(
							"text-muted-foreground text-sm",
							filteredAndSortedVehicles.length > 0 ? "mt-2 text-end" : "mt-5 text-center",
						)}
					>
						{activeVehiclesLabel}
					</p>
					<VehiclesTable data={filteredAndSortedVehicles} searchParams={searchParams} />
				</>
			) : (
				<p className="mt-5 text-center text-muted-foreground">No vehicle is available for this network.</p>
			)}
		</section>
	);
}
