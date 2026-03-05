import dayjs from "dayjs";
import { ArchiveIcon } from "lucide-react";
import {
	TbCash as CashIcon,
	TbEngine as EngineIcon,
	TbFireExtinguisher as FireExtinguisherIcon,
	TbArrowRight as ArrowRightIcon,
	TbSkull as SkullIcon,
} from "react-icons/tb";
import { Link } from "react-router-dom";
import { match } from "ts-pattern";

import type { Vehicle } from "~/api/vehicles";
import { VehicleCharacteristicsActions } from "~/components/data/vehicles/actions/vehicle-characteristics-action-menu";
import { Button } from "~/components/ui/button";
import { BusIcon, ShipIcon, TramwayIcon } from "~/icons/means-of-transport";
import tcInfosIcon from "~/icons/tc-infos.png";

const getTcInfosLink = (tcId: number) => `https://tc-infos.fr/vehicule/${tcId}`;

type VehicleCharacteristicsProps = {
	vehicle: Vehicle;
};

export function VehicleCharacteristics({ vehicle }: Readonly<VehicleCharacteristicsProps>) {
	const vehicleIcon = match(vehicle.type)
		.with("SUBWAY", "TRAMWAY", "RAIL", () => <TramwayIcon className="align-baseline inline size-4" />)
		.with("FERRY", () => <ShipIcon className="align-baseline inline size-4" />)
		.otherwise(() => <BusIcon className="align-baseline inline size-4" />);

	return (
		<div className="border border-border px-3 py-2 rounded-md shadow-lg lg:w-80 w-full relative">
			<h2 className="hidden">Vehicle Information</h2>
			<div className="flex justify-between gap-2">
				<div>
					<div className="font-bold text-lg">
						{vehicleIcon} Vehicle #{vehicle.number}
					</div>
					{vehicle.designation !== null && <div>{vehicle.designation}</div>}
					{vehicle.operator !== null && (
						<div className="mt-0.5 text-xs text-muted-foreground">
							Operated by <span className="font-bold">{vehicle.operator.name}</span>
						</div>
					)}
					{vehicle.archivedAt !== null && (
						<div className="mt-2 text-xs">
							{match(vehicle.archivedFor)
								.with("FAILURE", () => <EngineIcon className="align-text-bottom inline size-4" />)
								.with("FIRE", () => <FireExtinguisherIcon className="align-text-bottom inline size-4" />)
								.with("RETIRED", () => <SkullIcon className="align-text-bottom inline size-4" />)
								.with("SOLD", () => <CashIcon className="align-text-bottom inline size-4" />)
								.with("TRANSFER", () => <ArrowRightIcon className="align-text-bottom inline size-4" />)
								.otherwise(() => (
									<ArchiveIcon className="align-text-bottom inline size-4" />
								))}{" "}
							This vehicle{" "}
							{match(vehicle.archivedFor)
								.with("FAILURE", () => "suffered an irreparable breakdown")
								.with("FIRE", () => "was victim of a fire")
								.with("RETIRED", () => "was retired")
								.with("SOLD", () => "was sold")
								.with("TRANSFER", () => "was transferred")
								.otherwise(() => "was archived")}{" "}
							on <span className="font-bold">{dayjs(vehicle.archivedAt).format("L")}</span> at{" "}
							<span className="font-bold">{dayjs(vehicle.archivedAt).format("LT")}</span>.
						</div>
					)}
				</div>
				<div className="flex gap-2">
					{vehicle.tcId ? (
						<Button asChild className="" size="icon">
							<Link target="_blank" to={getTcInfosLink(vehicle.tcId)}>
								<img className="rounded-sm" src={tcInfosIcon} alt="View on TC-Infos" />
							</Link>
						</Button>
					) : null}
					<VehicleCharacteristicsActions vehicle={vehicle} />
				</div>
			</div>
		</div>
	);
}
