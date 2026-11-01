CREATE TABLE "kill_sheets" (
	"id" serial PRIMARY KEY,
	"device_id" text NOT NULL,
	"name" text NOT NULL,
	"well" text DEFAULT '' NOT NULL,
	"inputs" jsonb NOT NULL,
	"results" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shifts" (
	"id" serial PRIMARY KEY,
	"device_id" text NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trip_sheets" (
	"id" serial PRIMARY KEY,
	"device_id" text NOT NULL,
	"name" text NOT NULL,
	"settings" jsonb NOT NULL,
	"entries" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "kill_sheets_device_idx" ON "kill_sheets" ("device_id");--> statement-breakpoint
CREATE INDEX "shifts_device_idx" ON "shifts" ("device_id");--> statement-breakpoint
CREATE INDEX "trip_sheets_device_idx" ON "trip_sheets" ("device_id");