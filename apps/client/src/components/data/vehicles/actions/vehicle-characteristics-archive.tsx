import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSnackbar } from "notistack";
import { useForm } from "react-hook-form";
import z from "zod";

import { ArchiveVehicleMutation, type VehicleArchiveReason, type Vehicle, vehicleArchiveReasons } from "~/api/vehicles";
import { FormCheckbox } from "~/components/form/form-checkbox";
import { FormSelect } from "~/components/form/form-select";
import { Button } from "~/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { Form } from "~/components/ui/form";
import { useEditor } from "~/hooks/use-editor";

const schema = z.object({
	reason: z.enum(vehicleArchiveReasons),
	wipeReference: z.boolean(),
});

const vehicleArchiveReasonLabels: Record<VehicleArchiveReason, string> = {
	FAILURE: "Mechanical failure",
	FIRE: "Fire",
	RETIRED: "Retired",
	SOLD: "Sold",
	TRANSFER: "Transfer",
	OTHER: "Other",
};

type VehicleCharacteristicsArchiveProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	vehicle: Vehicle;
};

export function VehicleCharacteristicsArchive({ open, onOpenChange, vehicle }: VehicleCharacteristicsArchiveProps) {
	const queryClient = useQueryClient();
	const { enqueueSnackbar } = useSnackbar();
	const { editorToken } = useEditor();

	const form = useForm({
		defaultValues: { reason: "OTHER" as const, wipeReference: false },
		resolver: zodResolver(schema),
	});

	const { mutateAsync: archiveVehicle } = useMutation(ArchiveVehicleMutation(vehicle.id));

	if (vehicle.archivedAt !== null) return null;

	const onSubmit = async (json: z.infer<typeof schema>) => {
		if (editorToken === null) return;

		try {
			await archiveVehicle({ json, token: editorToken });

			enqueueSnackbar({ message: "This vehicle has been archived successfully.", variant: "success" });

			queryClient.invalidateQueries({ queryKey: ["network-vehicles", vehicle.networkId] });
			queryClient.invalidateQueries({ queryKey: ["vehicles", vehicle.id] });
			onOpenChange(false);
		} catch {
			enqueueSnackbar({ message: "An error occurred while archiving the vehicle.", variant: "error" });
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent aria-describedby={undefined}>
				<DialogHeader>
					<DialogTitle>Archive this vehicle</DialogTitle>
				</DialogHeader>
				<div className="text-muted-foreground text-sm">
					A vehicle can be archived for the following reasons:
					<ul className="list-inside list-disc">
						<li>
							it is retired <span className="italic">(TC-Infos is authoritative)</span>;
						</li>
						<li>it does not correspond to a real vehicle in the network.</li>
					</ul>
					<br />
					Check the box below <span className="font-bold">only</span> in case of permanent retirement of
					the vehicle.
				</div>
				<Form {...form}>
					<form onSubmit={form.handleSubmit(onSubmit)}>
						<FormCheckbox
							control={form.control}
							name="wipeReference"
							label={
								<>
									Break the <span className="font-mono">{vehicle.ref}</span> association of the vehicle
								</>
							}
							itemProps={{ className: "mb-5" }}
							inputProps={{
								className: "data-[state=checked]:bg-destructive data-[state=checked]:text-destructive-foreground",
							}}
						/>
						<FormSelect
							control={form.control}
							name="reason"
							label="Raison de l'archivage"
							options={Object.entries(vehicleArchiveReasonLabels).map(([value, label]) => ({ label, value }))}
							itemProps={{ className: "mb-5" }}
						/>
						<DialogFooter className="gap-3">
							<DialogClose asChild>
								<Button type="button" variant="secondary">
									Annuler
								</Button>
							</DialogClose>
							<Button type="submit" variant="destructive">
								Archiver
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}
