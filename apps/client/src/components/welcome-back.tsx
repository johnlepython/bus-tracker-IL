import { useSearchParams } from "react-router-dom";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "~/components/ui/dialog";

export function WelcomeBack() {
	const [searchParams, setSearchParams] = useSearchParams();

	const wasRedirected = searchParams.get("from_old") === "true";

	return (
		<Dialog open={wasRedirected} onOpenChange={() => setSearchParams({})}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Welcome to the new version</DialogTitle>
					<DialogDescription>
						This address (<a href="https://bus-tracker.fr">bus-tracker.fr</a>) now replaces the local instance you were
						used to using.
						<br />
						<br />
						All features have been carried over to this new version.
						<br />
						However, please take a few minutes of your time to get your bearings 😉<br />
						<br />
						Regarding the data, it has been synchronized so that no information is lost.
						<br />
						<br />
						For any other questions, contact me by email
					</DialogDescription>
				</DialogHeader>
			</DialogContent>
		</Dialog>
	);
}
