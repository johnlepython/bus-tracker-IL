-- Add line_network table for sectors/line networks
CREATE TABLE "line_network" (
	"id" serial PRIMARY KEY NOT NULL,
	"ref" varchar NOT NULL,
	"name" varchar NOT NULL,
	"sub_description" varchar,
	CONSTRAINT "line_network_ref_unique" UNIQUE("ref")
);

-- Add line_network_id to line table
ALTER TABLE "line" ADD COLUMN "line_network_id" integer REFERENCES "line_network"("id");
