import dayjs from "dayjs";
import { ArchiveIcon } from "lucide-react";
import { useMemo } from "react";
import {
	TbCash as CashIcon,
	TbEngine as EngineIcon,
	TbFireExtinguisher as FireExtinguisherIcon,
	TbArrowRight as ArrowRightIcon,
	TbSkull as SkullIcon,
} from "react-icons/tb";
import { Link } from "react-router-dom";
import { match, P } from "ts-pattern";

import type { Vehicle } from "~/api/vehicles";
import { useLine } from "~/hooks/use-line";
import { BusIcon, ShipIcon, TramwayIcon, TrainIcon } from "~/icons/means-of-transport";
import { Zzz } from "~/icons/zzz";
import { isTrainNumber } from "~/utils/is-train";

export function VehicleCard({ vehicle }: Readonly<{ vehicle: Vehicle }>) {
	const isTrain = isTrainNumber(vehicle.number);
	const line = useLine(vehicle.networkId, vehicle.activity?.status === "online" ? vehicle.activity.lineId : undefined);

	const displayContent = useMemo(() => {
		if (vehicle.archivedAt !== null) {
			return match(vehicle.archivedFor)
				.with("FAILURE", () => <EngineIcon className="size-full" />)
				.with("FIRE", () => <FireExtinguisherIcon className="size-full" />)
				.with("RETIRED", () => <SkullIcon className="size-full" />)
				.with("SOLD", () => <CashIcon className="size-full" />)
				.with("TRANSFER", () => <ArrowRightIcon className="size-full" />)
				.otherwise(() => <ArchiveIcon className="size-full" />);
		}

		// Display the operator/carrier name instead of line number
		if (vehicle.operator) {
			return <p className="flex items-center justify-center h-full font-bold text-lg text-center px-1">{vehicle.operator.name}</p>;
		}

		if (vehicle.activity?.status !== "online") {
			return <Zzz className="h-full mx-auto" />;
		}

		// Fallback: show line if no operator
		if (typeof line === "undefined") return <Zzz className="h-full mx-auto" />;

		return line.cartridgeHref ? (
			<img className="h-full mx-auto object-contain" src={line.cartridgeHref} alt={line.number} />
		) : (
			<p className="flex items-center justify-center h-full font-bold text-2xl">{line.number}</p>
		);
	}, [line, vehicle]);

	return (
		<Link
			className={`border border-border flex flex-col sm:flex-row py-1 px-2 rounded-md hover:brightness-90 ${
				!line && "bg-neutral-200 text-black dark:bg-neutral-800 dark:text-white"
			}`}
			to={`/data/vehicles/${vehicle.id}`}
			style={{
				backgroundColor: line?.color ?? undefined,
				color: line?.textColor ?? undefined,
			}}
		>
			<div className="flex justify-center">
				{isTrain ? (
					<TrainIcon className="my-auto size-6 sm:size-8" style={{ fill: line?.color ?? undefined }} />
				) : (
					match(vehicle.type)
						.with(P.union("SUBWAY", "TRAMWAY"), () => (
							<TramwayIcon className="my-auto size-6 sm:size-8" style={{ fill: line?.color ?? undefined }} />
						))
						.with("FERRY", () => (
							<ShipIcon className="my-auto size-6 sm:size-8" style={{ fill: line?.color ?? undefined }} />
						))
						.otherwise(() => (
							<BusIcon className="my-auto size-6 sm:size-8" style={{ fill: line?.color ?? undefined }} />
						))
				)}
				<div
					className="border-l-[1px] border-black dark:border-white mx-2 my-1"
					style={{ borderColor: line?.textColor ?? undefined }}
				/>
				<h2 className="flex font-bold gap-1.5 justify-center ml-1 tabular-nums text-2xl sm:my-auto sm:text-4xl sm:min-w-32">
					{isTrain ? (line ? line.number : "—") : vehicle.number}
				</h2>
			</div>
			<div
				className="border-t-[1px] sm:border-l-[1px] border-black dark:border-white mx-2"
				style={{ borderColor: line?.textColor ?? undefined }}
			/>
			<div className="flex gap-2 flex-1 mt-2 mx-2 sm:mt-0 sm:mx-0">
				<div className="h-12 min-w-16 lg:max-w-36">
					{isTrain ? (
						<p className="flex items-center justify-center h-full font-bold text-2xl">{vehicle.number}</p>
					) : (
						displayContent
					)}
				</div>
				<div className="flex flex-col justify-center">
					{vehicle.designation && <p className="font-bold">{vehicle.designation}</p>}
					{vehicle.activity?.status === "online" ? (
						<p>
							Online since{" "}
							<span className="font-bold tabular-nums">{dayjs(vehicle.activity.since).format("HH:mm")}</span>
						</p>
					) : (
						<p>
							{vehicle.archivedAt ? (
								<>
									Archived on{" "}
									{dayjs().diff(vehicle.archivedAt, "years") >= 1 ? (
										<span className="font-bold tabular-nums">{dayjs(vehicle.archivedAt).format("DD/MM/YYYY")}</span>
									) : (
										<>
											<span className="font-bold tabular-nums">{dayjs(vehicle.archivedAt).format("DD/MM")}</span> at{" "}
											<span className="font-bold tabular-nums">{dayjs(vehicle.archivedAt).format("HH:mm")}</span>
										</>
									)}
								</>
							) : (
								<>
									Offline
									{vehicle.activity.since !== null && (
										<>
											{" "}
											since{" "}
											{dayjs().diff(vehicle.activity.since, "years") >= 1 ? (
												<span className="font-bold tabular-nums">
													{dayjs(vehicle.activity.since).format("DD/MM/YYYY")}
												</span>
											) : (
												<>
													<span className="font-bold tabular-nums">
														{dayjs(vehicle.activity.since).format("DD/MM")}
													</span>{" "}
													à{" "}
													<span className="font-bold tabular-nums">
														{dayjs(vehicle.activity.since).format("HH:mm")}
													</span>
												</>
											)}
										</>
									)}
								</>
							)}
						</p>
					)}
				</div>
			</div>
		</Link>
	);
}
