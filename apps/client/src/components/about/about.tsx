import dayjs from "dayjs";
import { BusFrontIcon, LucideInfo, SatelliteDishIcon } from "lucide-react";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "~/components/ui/accordion";
import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "~/components/ui/dialog";
import { Link } from "~/components/ui/link";
import { Separator } from "~/components/ui/separator";

const buildHash = import.meta.env.VITE_BUILD_HASH ?? "dev";

const builtAt = dayjs(import.meta.env.VITE_BUILD_TIMESTAMP);

const qanda = [
	{
		question: "What does the satellite color mean?",
		answer: (
			<>
				<p className="mb-3">
					<SatelliteDishIcon className="inline align-middle mr-1" color="#38A169" /> GPS position provided by
					the transport operator.
				</p>
				<p className="mb-3">
					<SatelliteDishIcon className="inline align-middle mr-1" color="#DD6B20" /> Position determined from
					real-time schedules.
				</p>
				<p>
					<SatelliteDishIcon className="inline align-middle mr-1" color="#E53E3E" /> Theoretical vehicle position
					(real-time unavailable).
				</p>
			</>
		),
	},
	{
		question: "Where is the online vehicles table?",
		answer: (
			<p>
				Press the{" "}
				<BusFrontIcon className="align-text-bottom border border-black dark:border-white inline p-0.5 pl-[3px]" />{" "}
				icon below the map zoom controls.
			</p>
		),
	},
	{
		question: "I have a question about the application",
		answer: (
			<p>
				You can <Link to="mailto:contact@bus-tracker.fr">send me an email</Link> or contact me via{" "}
				<Link to="https://twitter.com/Keke27210" target="_blank">
					my Twitter
				</Link>
				.
			</p>
		),
	},
] as const;

export function About() {
	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button size="icon" variant="on-branding-outline">
					<LucideInfo aria-label="About" />
				</Button>
			</DialogTrigger>
			<DialogContent aria-describedby={undefined} className="max-h-dvh overflow-y-auto">
				<DialogHeader>
					<DialogTitle>About Bus Tracker</DialogTitle>
				</DialogHeader>
				<p>
					Build <code>{buildHash}</code> from {builtAt.format("LLLL")}.
				</p>
				<p>
					A bug? A suggestion? A comment or a question?<br />
					Send me an email at <Link to="mailto:contact@bus-tracker.fr">contact@bus-tracker.fr</Link> 😉
				</p>
				<Separator />
				<DialogTitle className="text-center sm:text-left">Frequently Asked Questions</DialogTitle>
				<Accordion type="single" collapsible>
					{qanda.map(({ question, answer }) => (
						<AccordionItem key={question} value={question}>
							<AccordionTrigger className="text-start">{question}</AccordionTrigger>
							<AccordionContent>{answer}</AccordionContent>
						</AccordionItem>
					))}
				</Accordion>
				<p className="text-center">
					<Link to="https://kevinbioj.fr" target="_blank">
					kevinbioj.fr <span className="text-xs">(maybe one day)</span>
					</Link>{" "}
					•{" "}
					<Link to="https://github.com/kevinbioj/bus-tracker-2" target="_blank">
						GitHub
					</Link>{" "}
					•{" "}
					<Link to="https://discord.gg/DpwtEU4qBg" target="_blank">
						Discord
					</Link>
				</p>
			</DialogContent>
		</Dialog>
	);
}
