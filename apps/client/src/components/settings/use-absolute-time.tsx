import { useId } from "react";
import { useLocalStorage } from "usehooks-ts";

import { Label } from "~/components/ui/label";
import { Switch } from "~/components/ui/switch";

export function DisplayAbsoluteTimeSetting() {
	const id = useId();
	const [displayAbsoluteTime, setDisplayAbsoluteTime] = useLocalStorage("display-absolute-time", false);

	return (
		<div className="flex items-center space-x-2">
			<Switch id={id} checked={displayAbsoluteTime} onCheckedChange={setDisplayAbsoluteTime} />
			<Label htmlFor={id}>Display absolute time instead of relative time</Label>
		</div>
	);
}
