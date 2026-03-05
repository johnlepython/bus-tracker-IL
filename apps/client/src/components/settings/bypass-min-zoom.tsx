import { AlertTriangleIcon } from "lucide-react";
import { useId } from "react";
import { useLocalStorage } from "usehooks-ts";

import { Label } from "~/components/ui/label";
import { Switch } from "~/components/ui/switch";

export function BypassMinZoomSetting() {
	const id = useId();
	const [bypassMinZoom, setBypassMinZoom] = useLocalStorage("bypass-min-zoom", false);

	return (
		<div className="flex items-center space-x-2">
			<Switch id={id} checked={bypassMinZoom} onCheckedChange={setBypassMinZoom} />
			<Label htmlFor={id}>
				Allow full dezoom{" "}
				<span className="text-xs">
					– <AlertTriangleIcon className="inline" height={16} width={16} /> power-hungry option
				</span>
			</Label>
		</div>
	);
}
