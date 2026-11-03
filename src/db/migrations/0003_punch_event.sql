CREATE TYPE "public"."punch_kind" AS ENUM('IN', 'OUT');--> statement-breakpoint
CREATE TYPE "public"."punch_outcome" AS ENUM('OK', 'OUTSIDE_GEOFENCE', 'NO_LOCATION', 'POOR_ACCURACY');--> statement-breakpoint
CREATE TABLE "punch_event" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"branch_id" text,
	"ts" timestamp with time zone DEFAULT now() NOT NULL,
	"kind" "punch_kind" NOT NULL,
	"outcome" "punch_outcome" NOT NULL,
	"latitude" double precision,
	"longitude" double precision,
	"accuracy_m" double precision,
	"distance_m" double precision
);
--> statement-breakpoint
ALTER TABLE "punch_event" ADD CONSTRAINT "punch_event_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "punch_event" ADD CONSTRAINT "punch_event_employee_id_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "punch_event" ADD CONSTRAINT "punch_event_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "punch_company_ts_idx" ON "punch_event" USING btree ("company_id","ts");--> statement-breakpoint
CREATE INDEX "punch_employee_ts_idx" ON "punch_event" USING btree ("employee_id","ts");