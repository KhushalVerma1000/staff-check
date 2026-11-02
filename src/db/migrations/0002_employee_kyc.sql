CREATE TYPE "public"."onboarding_status" AS ENUM('IN_PROGRESS', 'SUBMITTED', 'APPROVED', 'CHANGES_REQUESTED');--> statement-breakpoint
CREATE TYPE "public"."skip_reason" AS ENUM('NOT_YET', 'NOT_APPLICABLE', 'WILL_BRING_DOC');--> statement-breakpoint
CREATE TABLE "employee_kyc" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"status" "onboarding_status" DEFAULT 'IN_PROGRESS' NOT NULL,
	"step" integer DEFAULT 1 NOT NULL,
	"dob" date,
	"aadhaar_enc" text,
	"aadhaar_skip" "skip_reason",
	"pan_enc" text,
	"pan_skip" "skip_reason",
	"uan_enc" text,
	"uan_skip" "skip_reason",
	"esic_enc" text,
	"esic_skip" "skip_reason",
	"bank_holder" text,
	"bank_name" text,
	"account_enc" text,
	"ifsc" text,
	"bank_skip" "skip_reason",
	"addr_line1" text,
	"addr_line2" text,
	"city" text,
	"state" text,
	"pincode" text,
	"submitted_at" timestamp with time zone,
	"reviewed_by_id" text,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employee_kyc_employee_id_unique" UNIQUE("employee_id")
);
--> statement-breakpoint
ALTER TABLE "employee_kyc" ADD CONSTRAINT "employee_kyc_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_kyc" ADD CONSTRAINT "employee_kyc_employee_id_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "kyc_company_status_idx" ON "employee_kyc" USING btree ("company_id","status");